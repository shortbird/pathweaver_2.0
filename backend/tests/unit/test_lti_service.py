"""
Unit tests for the Canvas LTI 1.3 service layer.

What this exercises (no Canvas needed — fully mocked):
    * lti_keys: JWKS publishing with / without configured keys.
    * lti_service: state JWT round-trip, id_token verification (happy path,
      bad signature, bad audience, deployment mismatch), deep-link response
      signing produces a JWT verifiable with our public key, and AGS Score
      posting builds the right URL + headers + payload.

The "Canvas platform" is simulated with a freshly-generated RSA key pair —
we sign an id_token with the platform private key and mock PyJWKClient to
return the matching public key when the launch handler looks it up.
"""

from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_rsa_pem() -> str:
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()


@pytest.fixture
def tool_keys(monkeypatch):
    """Configure the tool's RSA key pair via Config + reset the lru_caches."""
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


@pytest.fixture
def fake_platform():
    """A fake Canvas-side RSA key pair we use to sign id_tokens."""
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = private.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    return {"private_pem": pem, "private": private, "public": private.public_key()}


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
# JWKS publishing
# ---------------------------------------------------------------------------

def test_get_public_jwks_empty_when_keys_unconfigured(monkeypatch):
    monkeypatch.setattr("app_config.Config.CANVAS_LTI_PRIVATE_KEY_PEM", None)
    monkeypatch.setattr("app_config.Config.CANVAS_LTI_PUBLIC_KID", None)
    from utils import lti_keys as lk

    lk.get_private_key.cache_clear()
    assert lk.get_public_jwks() == {"keys": []}


def test_get_public_jwks_serializes_rsa_key(tool_keys):
    from utils.lti_keys import get_public_jwks

    doc = get_public_jwks()
    assert "keys" in doc and len(doc["keys"]) == 1
    key = doc["keys"][0]
    assert key["kty"] == "RSA"
    assert key["alg"] == "RS256"
    assert key["use"] == "sig"
    assert key["kid"] == "test-kid"
    # n and e are base64url-encoded big-endian integers without padding.
    assert "=" not in key["n"]
    assert "=" not in key["e"]


# ---------------------------------------------------------------------------
# State JWT round-trip
# ---------------------------------------------------------------------------

def test_state_round_trip(monkeypatch):
    from services import lti_service

    registration = _make_registration()
    state = lti_service.issue_state(registration, login_hint="lh-1")
    payload = lti_service.verify_state(state, registration)
    assert payload["iss"] == registration.issuer
    assert payload["cid"] == registration.client_id
    assert payload["rid"] == registration.id
    assert payload["lh"] == "lh-1"


def test_state_rejects_wrong_registration():
    from services import lti_service

    reg_a = _make_registration()
    reg_b = _make_registration()
    object.__setattr__(reg_b, "id", "different-reg")
    state = lti_service.issue_state(reg_a, "lh")
    with pytest.raises(lti_service.LtiError):
        lti_service.verify_state(state, reg_b)


def test_state_rejects_tampered_token():
    from services import lti_service

    reg = _make_registration()
    state = lti_service.issue_state(reg, "lh")
    tampered = state[:-4] + "AAAA"
    with pytest.raises(lti_service.LtiError):
        lti_service.verify_state(tampered, reg)


# ---------------------------------------------------------------------------
# id_token verification
# ---------------------------------------------------------------------------

def _signed_id_token(platform, registration, *, overrides=None):
    now = int(time.time())
    claims = {
        "iss": registration.issuer,
        "aud": registration.client_id,
        "sub": "canvas-user-123",
        "nonce": "n-" + str(now),
        "iat": now,
        "exp": now + 300,
        "https://purl.imsglobal.org/spec/lti/claim/deployment_id": registration.deployment_id,
        "https://purl.imsglobal.org/spec/lti/claim/message_type": "LtiResourceLinkRequest",
        "https://purl.imsglobal.org/spec/lti/claim/roles": [
            "http://purl.imsglobal.org/vocab/lis/v2/membership#Learner",
        ],
        "email": "student@example.com",
        "given_name": "Pat",
        "family_name": "Tester",
    }
    if overrides:
        claims.update(overrides)
    return jwt.encode(
        claims,
        platform["private"],
        algorithm="RS256",
        headers={"kid": "platform-kid"},
    )


def _patch_jwks_to(platform_public_key):
    """Make PyJWKClient.get_signing_key_from_jwt return our fake public key."""
    fake_signing_key = MagicMock()
    fake_signing_key.key = platform_public_key
    return patch(
        "services.lti_service.PyJWKClient.get_signing_key_from_jwt",
        return_value=fake_signing_key,
    )


def test_verify_id_token_happy_path(fake_platform):
    from services import lti_service

    # Reset JWKS client cache between tests (module-level dict).
    lti_service._jwks_clients.clear()

    reg = _make_registration()
    token = _signed_id_token(fake_platform, reg)
    with _patch_jwks_to(fake_platform["public"]):
        claims = lti_service.verify_id_token(token, reg)
    assert claims["sub"] == "canvas-user-123"
    assert claims["aud"] == reg.client_id


def test_verify_id_token_rejects_bad_audience(fake_platform):
    from services import lti_service

    lti_service._jwks_clients.clear()
    reg = _make_registration()
    token = _signed_id_token(fake_platform, reg, overrides={"aud": "different-client"})
    with _patch_jwks_to(fake_platform["public"]):
        with pytest.raises(lti_service.LtiError):
            lti_service.verify_id_token(token, reg)


def test_verify_id_token_rejects_deployment_mismatch(fake_platform):
    from services import lti_service

    lti_service._jwks_clients.clear()
    reg = _make_registration()
    token = _signed_id_token(
        fake_platform,
        reg,
        overrides={
            "https://purl.imsglobal.org/spec/lti/claim/deployment_id": "wrong-deployment"
        },
    )
    with _patch_jwks_to(fake_platform["public"]):
        with pytest.raises(lti_service.LtiError):
            lti_service.verify_id_token(token, reg)


def test_verify_id_token_rejects_bad_signature(fake_platform):
    """A JWT signed by a different platform key fails verification even with
    the right claims — the JWKS lookup returns OUR expected key."""
    from services import lti_service

    lti_service._jwks_clients.clear()
    reg = _make_registration()
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    now = int(time.time())
    claims = {
        "iss": reg.issuer,
        "aud": reg.client_id,
        "sub": "x",
        "nonce": "n",
        "iat": now,
        "exp": now + 300,
        "https://purl.imsglobal.org/spec/lti/claim/deployment_id": reg.deployment_id,
    }
    bad_token = jwt.encode(claims, other, algorithm="RS256", headers={"kid": "k"})
    with _patch_jwks_to(fake_platform["public"]):
        with pytest.raises(lti_service.LtiError):
            lti_service.verify_id_token(bad_token, reg)


# ---------------------------------------------------------------------------
# Role mapping
# ---------------------------------------------------------------------------

def test_role_to_org_role_instructor():
    from services.lti_service import role_to_org_role

    assert (
        role_to_org_role(
            ["http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"]
        )
        == "advisor"
    )


def test_role_to_org_role_default_student():
    from services.lti_service import role_to_org_role

    assert role_to_org_role([]) == "student"
    assert (
        role_to_org_role(
            ["http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"]
        )
        == "student"
    )


# ---------------------------------------------------------------------------
# Deep-link response signing
# ---------------------------------------------------------------------------

def test_sign_deep_link_response_round_trips(tool_keys):
    from services import lti_service
    from utils.lti_keys import get_public_key

    reg = _make_registration()
    item = lti_service.build_resource_link_content_item(
        title="Sample",
        target_link_uri="https://api.optio.test/lti/launch",
        custom={"optio_quest_id": "quest-uuid"},
        line_item={"scoreMaximum": 100},
    )
    settings = {"deep_link_return_url": "https://canvas.test/return", "data": "opaque"}
    token = lti_service.sign_deep_link_response(
        registration=reg,
        deep_link_settings=settings,
        content_items=[item],
        user_sub="u",
    )

    # Verify with our public key (Canvas would do the same against /lti/jwks).
    payload = jwt.decode(
        token,
        get_public_key(),
        algorithms=["RS256"],
        audience=[reg.issuer],
    )
    assert payload["iss"] == reg.client_id
    assert (
        payload[
            "https://purl.imsglobal.org/spec/lti/claim/message_type"
        ]
        == "LtiDeepLinkingResponse"
    )
    items = payload["https://purl.imsglobal.org/spec/lti-dl/claim/content_items"]
    assert items[0]["url"] == "https://api.optio.test/lti/launch"
    assert items[0]["custom"]["optio_quest_id"] == "quest-uuid"
    # Vendor extension surfaces submission_type=external_tool on the assignment.
    assert (
        items[0]["https://canvas.instructure.com/lti/submission_type"]
        == "external_tool"
    )
    # data is echoed back so Canvas can correlate the response.
    assert payload["https://purl.imsglobal.org/spec/lti-dl/claim/data"] == "opaque"


# ---------------------------------------------------------------------------
# AGS Score posting
# ---------------------------------------------------------------------------

def test_post_ags_score_builds_canvas_submission_payload(tool_keys):
    from services import lti_service

    reg = _make_registration()
    line_item_url = "https://canvas.test/api/lti/courses/1/line_items/9"
    captured_calls = []

    def fake_token_request(*args, **kwargs):
        # First request: token exchange. Returns a service token.
        return MagicMock(
            ok=True,
            status_code=200,
            json=lambda: {"access_token": "tok-xyz", "token_type": "Bearer"},
        )

    def fake_score_request(*args, **kwargs):
        captured_calls.append(("score", args, kwargs))
        return MagicMock(ok=True, status_code=200)

    # First call goes to auth_token_url, second to lineitem/scores. We
    # disambiguate by the URL passed.
    def dispatch(url, *args, **kwargs):
        if url == reg.auth_token_url:
            return fake_token_request(url, *args, **kwargs)
        return fake_score_request(url, *args, **kwargs)

    with patch("services.lti_service.requests.post", side_effect=dispatch):
        response = lti_service.post_ags_score(
            registration=reg,
            line_item_url=line_item_url,
            user_sub="canvas-sub-1",
            score_given=100,
            score_maximum=100,
            submission_url="https://app.optio.test/portfolio/u/1?quest=q",
        )
    assert response.ok

    # The score POST should have hit <lineitem>/scores with the AGS content
    # type and the Canvas-namespaced submission claim.
    assert captured_calls, "Score POST never fired"
    _, args, kwargs = captured_calls[0]
    assert args[0] == line_item_url + "/scores"
    payload = kwargs["json"]
    assert payload["userId"] == "canvas-sub-1"
    assert payload["scoreGiven"] == 100
    assert payload["scoreMaximum"] == 100
    assert payload["activityProgress"] == "Completed"
    assert payload["gradingProgress"] == "FullyGraded"
    submission = payload["https://canvas.instructure.com/lti/submission"]
    assert submission["new_submission"] is True
    assert submission["submission_type"] == "online_url"
    assert submission["submission_data"].startswith("https://app.optio.test/portfolio")
    headers = kwargs["headers"]
    assert headers["Authorization"] == "Bearer tok-xyz"
    assert headers["Content-Type"] == "application/vnd.ims.lis.v1.score+json"
