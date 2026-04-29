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
