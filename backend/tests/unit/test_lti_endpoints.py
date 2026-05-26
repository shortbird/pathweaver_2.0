"""
Surface-level tests for LTI HTTP endpoints. These verify routing, response
shape, and the blueprint's CSP override — they do NOT exercise the full
Canvas handshake (covered by test_lti_service.py with mocked JWKS).
"""

from __future__ import annotations

import json

import pytest


def test_jwks_endpoint_returns_keys_object_when_unconfigured(client, monkeypatch):
    """Without env keys we still serve a syntactically valid JWKS — Canvas
    polls the URL periodically and we don't want it 500ing during config."""
    monkeypatch.setattr("app_config.Config.CANVAS_LTI_PRIVATE_KEY_PEM", None)
    monkeypatch.setattr("app_config.Config.CANVAS_LTI_PUBLIC_KID", None)
    from utils import lti_keys as lk

    lk.get_private_key.cache_clear()

    resp = client.get("/lti/jwks")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body == {"keys": []}


def test_well_known_jwks_alias(client, monkeypatch):
    monkeypatch.setattr("app_config.Config.CANVAS_LTI_PRIVATE_KEY_PEM", None)
    monkeypatch.setattr("app_config.Config.CANVAS_LTI_PUBLIC_KID", None)
    from utils import lti_keys as lk

    lk.get_private_key.cache_clear()

    resp = client.get("/.well-known/jwks.json")
    assert resp.status_code == 200
    assert resp.get_json() == {"keys": []}


def test_lti_config_json_advertises_canvas_placements(client):
    resp = client.get("/lti/config.json")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["title"] == "Optio"
    placements = body["extensions"][0]["settings"]["placements"]
    placement_names = {p["placement"] for p in placements}
    assert "course_navigation" in placement_names
    assert "link_selection" in placement_names
    assert "assignment_selection" in placement_names
    # AGS scopes must be requested or Canvas won't grant grade access.
    assert any("score" in s for s in body["scopes"])
    assert any("lineitem" in s for s in body["scopes"])


def test_lti_routes_relax_frame_ancestors(client):
    """The global CSP locks frame-ancestors to 'none'; the LTI blueprint
    after_request hook must replace that directive so Canvas can iframe us."""
    resp = client.get("/lti/config.json")
    csp = resp.headers.get("Content-Security-Policy", "")
    assert "frame-ancestors" in csp
    assert "*.instructure.com" in csp
    assert "'none'" not in csp.split("frame-ancestors", 1)[1]
    # X-Frame-Options must be removed for LTI responses.
    assert "X-Frame-Options" not in resp.headers


def test_non_lti_routes_keep_strict_frame_ancestors(client):
    """Sanity: the global frame-ancestors policy still applies elsewhere."""
    resp = client.get("/api/health")
    csp = resp.headers.get("Content-Security-Policy", "")
    if "frame-ancestors" in csp:
        # Either left as 'none' or absent — both are acceptable. Not "*".
        assert "*.instructure.com" not in csp


def test_lti_login_rejects_missing_params(client):
    resp = client.get("/lti/login")
    assert resp.status_code == 400
    body = resp.get_json()
    assert "Missing required" in body["error"]


def test_lti_token_rejects_unknown_code(client):
    """An unknown auth code must never mint Optio tokens. We don't try to
    distinguish 401 vs 5xx here — the unit harness doesn't have a real DB
    so we'd be testing the mock, not the contract. The contract that
    matters: never 200, never include access_token in the body."""
    resp = client.post(
        "/lti/token",
        data=json.dumps({"code": "nonexistent"}),
        content_type="application/json",
    )
    assert resp.status_code != 200
    body = resp.get_json() or {}
    assert "access_token" not in body


def test_lti_evidence_requires_token(client):
    """The SpeedGrader evidence endpoint is unauthenticated except for the
    signed token. No token / garbage token → 401, never a body that could
    leak student data."""
    r1 = client.get("/lti/evidence")
    assert r1.status_code == 401

    r2 = client.get("/lti/evidence?lti_token=not-a-real-token")
    assert r2.status_code == 401
    body = r2.get_json() or {}
    assert "tasks" not in body and "student" not in body


def test_lti_evidence_success_path_shape(client, monkeypatch):
    """Regression for the prod 500 from referencing
    `quest_task_completions.xp_awarded` (column doesn't exist). The
    endpoint must hit only real columns and assemble the documented
    response shape: student / quest / earned_xp / tasks[]."""
    from unittest.mock import MagicMock
    from routes.lti import evidence as ev
    from services.lti_service import issue_evidence_token

    monkeypatch.setattr("app_config.Config.JWT_SECRET_KEY", "test-secret-key")
    token = issue_evidence_token("user-A", "quest-1")

    # Per-table mock results so we can assert which columns each call asks
    # for AND drive the success path with realistic row shapes.
    fixtures = {
        "users": [
            {"first_name": "Jane", "last_name": "Doe", "display_name": "Jane Doe"}
        ],
        "quests": [{"id": "quest-1", "title": "Test quest"}],
        "user_quest_tasks": [
            {"id": "t1", "title": "Learn the rules", "pillar": "stem", "xp_value": 100},
            {"id": "t2", "title": "Skipped", "pillar": "art", "xp_value": 50},
        ],
        # Completions deliberately exclude xp_awarded; only the columns the
        # endpoint is allowed to ask for.
        "quest_task_completions": [
            {"task_id": "t1", "completed_at": "2026-05-21T00:00:00Z"}
        ],
        "user_task_evidence_documents": [{"id": "doc-1", "task_id": "t1"}],
        "evidence_document_blocks": [
            {
                "document_id": "doc-1",
                "block_type": "text",
                "content": {"text": "I did it"},
                "order_index": 0,
                "is_private": False,
            }
        ],
    }
    selected_columns: dict[str, str] = {}

    def fake_client():
        client_mock = MagicMock()
        def table(name):
            q = MagicMock()
            q.select = lambda cols: (selected_columns.setdefault(name, cols), q)[1]
            q.eq = lambda *_a, **_k: q
            q.in_ = lambda *_a, **_k: q
            q.order = lambda *_a, **_k: q
            q.limit = lambda *_a, **_k: q
            q.execute = lambda: MagicMock(data=fixtures.get(name, []))
            return q
        client_mock.table = table
        return client_mock

    monkeypatch.setattr(ev, "get_supabase_admin_client", fake_client)

    resp = client.get(f"/lti/evidence?lti_token={token}")
    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()

    # The bug was that we asked for a column that doesn't exist. Lock the
    # contract: the completions select MUST NOT mention xp_awarded.
    assert "xp_awarded" not in selected_columns.get("quest_task_completions", "")

    # Documented response shape.
    assert body["student"]["display_name"] == "Jane Doe"
    assert body["quest"]["title"] == "Test quest"
    # 1 of 2 tasks completed → XP comes from user_quest_tasks.xp_value.
    assert body["earned_xp"] == 100
    titles = [t["title"] for t in body["tasks"]]
    assert "Learn the rules" in titles and "Skipped" in titles
    t1 = next(t for t in body["tasks"] if t["id"] == "t1")
    assert t1["is_completed"] is True
    assert t1["evidence_blocks"][0]["content"] == {"text": "I did it"}
    t2 = next(t for t in body["tasks"] if t["id"] == "t2")
    assert t2["is_completed"] is False


# ---------------------------------------------------------------------------
# User provisioning: Canvas "Student View" sends a missing/garbage email,
# which Supabase Auth 400s. Regression for the prod crash where the whole
# launch 500'd instead of synthesizing a placeholder.
# ---------------------------------------------------------------------------

import pytest as _pytest


@_pytest.mark.parametrize(
    "value,valid",
    [
        ("tanner@williamsburglearning.com", True),
        ("a.b+c@sub.example.co.uk", True),
        ("", False),
        ("   ", False),
        ("not-an-email", False),
        ("missing@domain", False),
        ("@nolocal.com", False),
        ("spaces in@email.com", False),
        ("trailing@space.com ", True),  # stripped before match
    ],
)
def test_is_valid_email(value, valid):
    from services.lti_service import _is_valid_email

    assert _is_valid_email(value) is valid


def _chain_mock(execute_data):
    """Build a Supabase query-builder mock whose terminal .execute() returns
    an object with `.data == execute_data`. Every intermediate builder call
    (.table/.select/.eq/.limit/.insert/.update/.delete) returns the same mock."""
    from unittest.mock import MagicMock

    m = MagicMock()
    m.table.return_value = m
    m.select.return_value = m
    m.insert.return_value = m
    m.update.return_value = m
    m.delete.return_value = m
    m.eq.return_value = m
    m.limit.return_value = m
    m.execute.return_value = MagicMock(data=execute_data)
    return m


def test_provision_synthesizes_email_for_canvas_student_view(monkeypatch):
    """Canvas Student View sends sub but a malformed email. We must NOT call
    create_user with the bad email, NOT email-merge, and the synthetic
    address must be deterministic + format-valid."""
    from services import lti_service

    supabase = _chain_mock([])  # no existing lms_integrations / users rows
    created = {}

    def _create_user(payload):
        created.update(payload)
        from unittest.mock import MagicMock

        return MagicMock(user=MagicMock(id="new-user-uuid"))

    supabase.auth.admin.create_user.side_effect = _create_user
    monkeypatch.setattr(lti_service, "get_supabase_admin_client", lambda: supabase)

    registration = type("R", (), {"organization_id": "org-123"})()
    claims = {
        "sub": "856b18e6-ee6c-4d8f-a68e-9f64d9ceba38",
        "email": "Test Student",  # Canvas Student View garbage value
        "given_name": "Test",
        "family_name": "Student",
    }

    user_id = lti_service.provision_lti_user(claims, registration)

    assert user_id == "new-user-uuid"
    # Synthetic, deterministic, format-valid; the garbage email was discarded.
    assert created["email"] == (
        "canvas-856b18e6-ee6c-4d8f-a68e-9f64d9ceba38@lti.optioeducation.com"
    )
    from services.lti_service import _is_valid_email

    assert _is_valid_email(created["email"]) is True


# ---------------------------------------------------------------------------
# Deferred-creation flow: student-role Resource Link launches must not
# create a `users` row until the student clicks "Enter Optio" (which is
# what triggers /lti/token). This prevents shadow accounts from accumulating
# when Canvas auto-loads the iframe (e.g. course-nav tile).
# ---------------------------------------------------------------------------


def test_issue_auth_code_requires_exactly_one_subject(monkeypatch):
    """The DB has a CHECK constraint, but we also guard at the API level so
    callers get a clear ValueError instead of a Postgres 5xx."""
    from services import lti_service

    monkeypatch.setattr(
        lti_service, "get_supabase_admin_client", lambda: _chain_mock([])
    )

    with _pytest.raises(ValueError):
        lti_service.issue_auth_code()  # neither
    with _pytest.raises(ValueError):
        lti_service.issue_auth_code(user_id="u-1", pending_launch_id="p-1")  # both


def test_token_exchange_materializes_user_from_pending_launch(client, monkeypatch):
    """Hitting /lti/token with a code that references a pending launch
    (NOT a user) must:
      1. Consume the pending row.
      2. Call provision_lti_user with the stored claims.
      3. Return Optio Bearer tokens for the freshly-materialized user.
    Regression for the shadow-account bug: before this change, the user was
    created at /lti/launch time, so any Canvas-side passive launch left an
    empty row behind."""
    from routes.lti import token as token_mod
    from services import lti_service

    pending_id = "pending-row-uuid"
    auth_code = "test-auth-code-xyz"
    claims = {
        "sub": "canvas-sub-123",
        "email": "deferred.student@example.com",
        "given_name": "Deferred",
        "family_name": "Student",
    }

    consumed_pending = {"id": pending_id, "registration_id": "reg-1", "claims": claims}
    provisioned = {}

    def fake_consume_auth_code(code):
        assert code == auth_code
        return {
            "code": code,
            "user_id": None,
            "pending_launch_id": pending_id,
            "quest_id": "quest-42",
            "target_path": "/lti-quest/quest-42",
            "used": False,
        }

    def fake_consume_pending_launch(pid):
        assert pid == pending_id
        return consumed_pending

    fake_registration = type(
        "R",
        (),
        {
            "id": "reg-1",
            "issuer": "https://canvas.example",
            "client_id": "cid",
            "deployment_id": "dep",
            "organization_id": "org-1",
            "auth_login_url": "x",
            "auth_token_url": "x",
            "public_jwks_url": "x",
            "is_active": True,
        },
    )()

    def fake_load_registration(rid):
        assert rid == "reg-1"
        return fake_registration

    def fake_provision_lti_user(c, reg):
        provisioned["claims"] = c
        provisioned["registration"] = reg
        return "materialized-user-uuid"

    monkeypatch.setattr(token_mod, "consume_auth_code", fake_consume_auth_code)
    monkeypatch.setattr(token_mod, "consume_pending_launch", fake_consume_pending_launch)
    monkeypatch.setattr(token_mod, "_load_registration", fake_load_registration)
    monkeypatch.setattr(token_mod, "provision_lti_user", fake_provision_lti_user)
    # session_manager generates a real signed JWT — that's fine for this test
    # but we don't want it to actually hit any backing store. The default
    # implementation is pure JWT mint, so leave it as-is.

    resp = client.post(
        "/lti/token",
        data=json.dumps({"code": auth_code}),
        content_type="application/json",
    )
    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body["user_id"] == "materialized-user-uuid"
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["quest_id"] == "quest-42"
    assert body["target_path"] == "/lti-quest/quest-42"
    # provision_lti_user was called with the pending claims, not whatever
    # the request body contained.
    assert provisioned["claims"]["sub"] == "canvas-sub-123"
    assert provisioned["registration"].id == "reg-1"


def test_token_exchange_rejects_expired_pending_launch(client, monkeypatch):
    """If the pending row expired between launch and click, /lti/token must
    return an error and NOT create a user."""
    from routes.lti import token as token_mod

    monkeypatch.setattr(
        token_mod,
        "consume_auth_code",
        lambda code: {
            "code": code,
            "user_id": None,
            "pending_launch_id": "gone",
            "target_path": "/dashboard",
        },
    )
    monkeypatch.setattr(token_mod, "consume_pending_launch", lambda pid: None)

    def _must_not_provision(*_a, **_k):
        raise AssertionError("provision_lti_user must not run when pending is expired")

    monkeypatch.setattr(token_mod, "provision_lti_user", _must_not_provision)

    resp = client.post(
        "/lti/token",
        data=json.dumps({"code": "any"}),
        content_type="application/json",
    )
    assert resp.status_code == 401
    body = resp.get_json() or {}
    assert "access_token" not in body
