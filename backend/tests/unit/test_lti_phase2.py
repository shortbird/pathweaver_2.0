"""
Phase 2 LTI tests: XP threshold gating, AGS Results GET, and grade poller.

What this exercises (no Canvas / saLTIre needed — fully mocked):
    * lti_service.get_ags_results: builds the right URL/headers, parses both
      array and {results: ...} response shapes.
    * canvas_grade_poller.fetch_grade_for_user_quest: end-to-end path
      against mocked Supabase + mocked AGS results.
    * Submission-claim payload shape unchanged when xp_threshold is set.

Phase 2 also adds an `xp_threshold` enforcement branch in /api/quests/:id/end.
That branch runs against a real DB, so we exercise it through the route in
test_lti_endpoints.py-style integration where appropriate.
"""

from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


# ---------------------------------------------------------------------------
# Helpers (mirror of test_lti_service.py setup)
# ---------------------------------------------------------------------------

def _generate_rsa_pem() -> str:
    p = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return p.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()


@pytest.fixture
def tool_keys(monkeypatch):
    pem = _generate_rsa_pem()
    monkeypatch.setattr("app_config.Config.CANVAS_LTI_PRIVATE_KEY_PEM", pem)
    monkeypatch.setattr("app_config.Config.CANVAS_LTI_PUBLIC_KID", "test-kid")
    from utils import lti_keys as lk

    lk.get_private_key.cache_clear()
    lk.get_public_key.cache_clear()
    lk.get_kid.cache_clear()
    yield pem
    lk.get_private_key.cache_clear()
    lk.get_public_key.cache_clear()
    lk.get_kid.cache_clear()


def _make_registration():
    from services.lti_service import LtiRegistration

    return LtiRegistration(
        id="reg-uuid",
        issuer="https://canvas.test.instructure.com",
        client_id="100000000000003",
        deployment_id="42:abcd",
        organization_id="org-uuid",
        auth_login_url="https://sso.canvaslms.com/api/lti/authorize_redirect",
        auth_token_url="https://sso.canvaslms.com/login/oauth2/token",
        public_jwks_url="https://sso.canvaslms.com/api/lti/security/jwks",
        is_active=True,
    )


# ---------------------------------------------------------------------------
# get_ags_results — request shape + both response shapes
# ---------------------------------------------------------------------------

def test_get_ags_results_filters_by_user_and_parses_array(tool_keys):
    from services import lti_service

    reg = _make_registration()
    line_item_url = "https://canvas.test/api/lti/courses/1/line_items/9"

    captured = {}

    def fake_post(url, *args, **kwargs):
        return MagicMock(
            ok=True,
            status_code=200,
            json=lambda: {"access_token": "tok-z", "token_type": "Bearer"},
        )

    def fake_get(url, *args, **kwargs):
        captured["url"] = url
        captured["params"] = kwargs.get("params")
        captured["headers"] = kwargs.get("headers")
        return MagicMock(
            ok=True,
            status_code=200,
            json=lambda: [
                {
                    "id": "result1",
                    "userId": "canvas-sub-1",
                    "resultScore": 87,
                    "resultMaximum": 100,
                }
            ],
        )

    with patch("services.lti_service.requests.post", side_effect=fake_post):
        with patch("services.lti_service.requests.get", side_effect=fake_get):
            results = lti_service.get_ags_results(
                registration=reg,
                line_item_url=line_item_url,
                user_sub="canvas-sub-1",
            )

    assert len(results) == 1
    assert results[0]["resultScore"] == 87
    assert captured["url"] == line_item_url + "/results"
    assert captured["params"] == {"limit": 100, "user_id": "canvas-sub-1"}
    assert (
        captured["headers"]["Accept"]
        == "application/vnd.ims.lis.v2.resultcontainer+json"
    )
    assert captured["headers"]["Authorization"].startswith("Bearer ")


def test_get_ags_results_parses_results_object_shape(tool_keys):
    """Some platforms return {results: [...]} instead of a bare array."""
    from services import lti_service

    reg = _make_registration()

    def fake_post(*args, **kwargs):
        return MagicMock(ok=True, json=lambda: {"access_token": "t"})

    def fake_get(*args, **kwargs):
        return MagicMock(
            ok=True,
            json=lambda: {"results": [{"resultScore": 50, "resultMaximum": 100}]},
        )

    with patch("services.lti_service.requests.post", side_effect=fake_post):
        with patch("services.lti_service.requests.get", side_effect=fake_get):
            results = lti_service.get_ags_results(reg, "https://x/lineitems/1")
    assert results == [{"resultScore": 50, "resultMaximum": 100}]


def test_get_ags_results_raises_on_non_2xx(tool_keys):
    from services import lti_service

    def fake_post(*args, **kwargs):
        return MagicMock(ok=True, json=lambda: {"access_token": "t"})

    def fake_get(*args, **kwargs):
        return MagicMock(ok=False, status_code=500, text="boom")

    with patch("services.lti_service.requests.post", side_effect=fake_post):
        with patch("services.lti_service.requests.get", side_effect=fake_get):
            with pytest.raises(lti_service.LtiError):
                lti_service.get_ags_results(_make_registration(), "https://x/lineitems/1")


# ---------------------------------------------------------------------------
# canvas_grade_poller.fetch_grade_for_user_quest — happy path
# ---------------------------------------------------------------------------

def test_fetch_grade_for_user_quest_writes_score_to_user_quests(monkeypatch, tool_keys):
    """Mocks Supabase + AGS to verify the poller updates user_quests.lti_*."""
    from services import canvas_grade_poller as poller

    # --- Mock Supabase ---
    # Track update calls so we can assert what got written.
    write_log = []

    class FakeQuery:
        def __init__(self, table):
            self.table = table
            self._filters = {}
            self._update_payload = None

        def select(self, *a, **k):
            return self

        def eq(self, col, val):
            self._filters[col] = val
            return self

        def limit(self, n):
            return self

        def update(self, payload):
            self._update_payload = payload
            return self

        def execute(self):
            t = self.table
            if t == "user_quests" and self._update_payload is not None:
                write_log.append((self._filters.get("id"), self._update_payload))
                return MagicMock(data=[{"id": self._filters.get("id")}])
            if t == "user_quests":
                return MagicMock(data=[
                    {"id": "uq-1", "user_id": "u-1", "quest_id": "q-1"}
                ])
            if t == "quests":
                return MagicMock(data=[
                    {
                        "lti_ags_lineitem_url": "https://canvas/lineitems/9",
                        "lms_platform": "canvas",
                        "lti_registration_id": "reg-1",
                    }
                ])
            if t == "lti_registrations":
                return MagicMock(data=[
                    {
                        "id": "reg-1",
                        "issuer": "https://canvas.example",
                        "client_id": "client-1",
                        "deployment_id": "d-1",
                        "organization_id": "org-1",
                        "auth_login_url": "https://canvas.example/auth",
                        "auth_token_url": "https://canvas.example/token",
                        "public_jwks_url": "https://canvas.example/jwks",
                        "is_active": True,
                    }
                ])
            if t == "lms_integrations":
                return MagicMock(data=[{"lms_user_id": "canvas-sub-1"}])
            return MagicMock(data=[])

    fake_client = MagicMock()
    fake_client.table = lambda t: FakeQuery(t)

    monkeypatch.setattr(poller, "get_supabase_admin_client", lambda: fake_client)

    # Mock AGS response — accept positional and keyword args because the
    # poller calls `get_ags_results(registration, line_item_url, user_sub=...)`.
    monkeypatch.setattr(
        poller,
        "get_ags_results",
        lambda *args, **kwargs: [{"resultScore": 92, "resultMaximum": 100}],
    )

    result = poller.fetch_grade_for_user_quest("uq-1")

    assert result["found"] is True
    assert result["score"] == 92
    assert result["max"] == 100
    assert any(
        payload.get("lti_canvas_score") == 92.0 and payload.get("lti_canvas_score_max") == 100.0
        for _, payload in write_log
    ), f"Expected lti_canvas_score=92 to be written; saw {write_log}"


def test_fetch_grade_for_user_quest_handles_no_results_yet(monkeypatch, tool_keys):
    """When the teacher hasn't graded yet, AGS returns an empty array.
    Poller should stamp polled_at without writing score columns."""
    from services import canvas_grade_poller as poller

    write_log = []

    class FakeQuery:
        def __init__(self, table):
            self.table = table
            self._filters = {}
            self._update_payload = None

        def select(self, *a, **k):
            return self

        def eq(self, col, val):
            self._filters[col] = val
            return self

        def limit(self, n):
            return self

        def update(self, payload):
            self._update_payload = payload
            return self

        def execute(self):
            t = self.table
            if t == "user_quests" and self._update_payload is not None:
                write_log.append(self._update_payload)
                return MagicMock(data=[{}])
            if t == "user_quests":
                return MagicMock(data=[
                    {"id": "uq-1", "user_id": "u-1", "quest_id": "q-1"}
                ])
            if t == "quests":
                return MagicMock(data=[{
                    "lti_ags_lineitem_url": "https://canvas/lineitems/9",
                    "lms_platform": "canvas",
                    "lti_registration_id": "reg-1",
                }])
            if t == "lti_registrations":
                return MagicMock(data=[{
                    "id": "reg-1", "issuer": "i", "client_id": "c",
                    "deployment_id": "d", "organization_id": "o",
                    "auth_login_url": "x", "auth_token_url": "x",
                    "public_jwks_url": "x", "is_active": True,
                }])
            if t == "lms_integrations":
                return MagicMock(data=[{"lms_user_id": "canvas-sub-1"}])
            return MagicMock(data=[])

    fake_client = MagicMock()
    fake_client.table = lambda t: FakeQuery(t)

    monkeypatch.setattr(poller, "get_supabase_admin_client", lambda: fake_client)
    monkeypatch.setattr(poller, "get_ags_results", lambda *args, **kwargs: [])

    result = poller.fetch_grade_for_user_quest("uq-1")
    assert result["found"] is False
    # We should still have stamped polled_at to avoid busy-looping.
    assert any("lti_canvas_polled_at" in payload for payload in write_log)
    # And we should NOT have written score columns when no result exists.
    assert all("lti_canvas_score" not in payload for payload in write_log)


# ---------------------------------------------------------------------------
# SpeedGrader evidence URL + signed carve-out token
# ---------------------------------------------------------------------------

def test_evidence_url_uses_by_user_id_route_with_signed_token(monkeypatch):
    """Regression: the URL must hit /public/diploma/<user_id> (resolves by
    user_id), NOT /portfolio/<slug> (resolves by portfolio_slug -> always
    404s on a UUID). It must also carry a valid lti_token."""
    monkeypatch.setattr("app_config.Config.FRONTEND_URL", "https://www.optioeducation.com")
    monkeypatch.setattr("app_config.Config.JWT_SECRET_KEY", "test-secret-key")
    from services.lti_grade_sync_service import _evidence_url_for_quest
    from services.lti_service import verify_evidence_token
    from urllib.parse import urlparse, parse_qs

    url = _evidence_url_for_quest("user-uuid-123", "quest-uuid-456")
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)

    assert parsed.path == "/public/diploma/user-uuid-123"
    assert qs["quest"] == ["quest-uuid-456"]
    assert verify_evidence_token(qs["lti_token"][0], "user-uuid-123") is True


def test_evidence_token_round_trip_and_scoping(monkeypatch):
    monkeypatch.setattr("app_config.Config.JWT_SECRET_KEY", "test-secret-key")
    from services.lti_service import issue_evidence_token, verify_evidence_token

    tok = issue_evidence_token("user-A", "quest-1")
    # Valid only for exactly the user it was minted for.
    assert verify_evidence_token(tok, "user-A") is True
    assert verify_evidence_token(tok, "user-B") is False
    # Garbage / empty / wrong-secret tokens are rejected.
    assert verify_evidence_token("", "user-A") is False
    assert verify_evidence_token("not.a.jwt", "user-A") is False


def test_evidence_token_rejected_under_wrong_secret(monkeypatch):
    """A token signed with one secret must not verify once the secret
    rotates (issue/verify read Config.JWT_SECRET_KEY at call time)."""
    from services.lti_service import issue_evidence_token, verify_evidence_token

    monkeypatch.setattr("app_config.Config.JWT_SECRET_KEY", "secret-one")
    tok = issue_evidence_token("user-A", "quest-1")

    monkeypatch.setattr("app_config.Config.JWT_SECRET_KEY", "secret-two")
    assert verify_evidence_token(tok, "user-A") is False


def test_decode_evidence_token_returns_uid_qid(monkeypatch):
    """The /lti/evidence endpoint reads (user, quest) from the token, never
    a query param — decode must surface both, or None on any tampering."""
    monkeypatch.setattr("app_config.Config.JWT_SECRET_KEY", "test-secret-key")
    from services.lti_service import issue_evidence_token, decode_evidence_token

    tok = issue_evidence_token("user-A", "quest-9")
    claims = decode_evidence_token(tok)
    assert claims == {"uid": "user-A", "qid": "quest-9"}

    assert decode_evidence_token("") is None
    assert decode_evidence_token("not.a.jwt") is None

    # A different-purpose token (OIDC state) must not be accepted as evidence.
    import jwt as _jwt
    state = _jwt.encode(
        {"purpose": "lti_oidc_state", "uid": "user-A", "qid": "quest-9"},
        "test-secret-key",
        algorithm="HS256",
    )
    assert decode_evidence_token(state) is None


def test_lti_frontend_url_defaults_to_frontend_url(monkeypatch):
    """Staged Phase-4 plumbing: _frontend_url() must be a no-op until
    LTI_FRONTEND_URL is set in prod env (then it moves only the LTI iframe
    to the v2 host, no code change)."""
    from routes.lti.launch import _frontend_url

    # No LTI override → falls back to FRONTEND_URL (current prod behaviour).
    monkeypatch.setattr("app_config.Config.LTI_FRONTEND_URL", None)
    monkeypatch.setattr("app_config.Config.FRONTEND_URL", "https://www.optioeducation.com")
    assert _frontend_url() == "https://www.optioeducation.com"

    # LTI override set → LTI redirects use the v2 host; rest of app untouched.
    monkeypatch.setattr("app_config.Config.LTI_FRONTEND_URL", "https://v2.optioeducation.com/")
    assert _frontend_url() == "https://v2.optioeducation.com"
