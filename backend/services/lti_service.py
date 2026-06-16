"""
Canvas LTI 1.3 service layer.

Responsibilities:
  * Look up `lti_registrations` by (issuer, client_id, deployment_id).
  * Verify Canvas-issued id_tokens against the platform's rotating JWK set.
  * Mint OIDC `state` parameters as self-signed JWTs (no cookie required —
    works across the third-party-cookie boundary inside an iframe).
  * Sign LTI Deep Linking response JWTs.
  * Sign client_credentials assertions for the AGS service-token flow.
  * Post AGS Score+submission payloads to Canvas line items.

Design notes:
  * No PyLTI1p3 dependency — its Flask adapter is too session/cookie-bound
    for our Bearer-iframe model. We use PyJWT 2.x's PyJWKClient for JWKS
    rotation and validate claims ourselves.
  * Replay protection lives in the `lti_nonces` table (see migration 007).
  * Admin client is justified for all writes here because LTI launches arrive
    pre-authenticated by Canvas (signature-verified id_token), and we need to
    cross cut user provisioning + nonce writes that pre-date a session.
"""

from __future__ import annotations

import re
import secrets
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

import jwt
import requests
from jwt import PyJWKClient

from app_config import Config
from database import get_supabase_admin_client
from utils.lti_keys import (
    LtiKeysNotConfigured,
    get_kid,
    get_private_key,
    keys_configured,
)
from utils.logger import get_logger

logger = get_logger(__name__)

# JWKS verification timeout shared with PEXELS/etc. — Config.LTI_JWKS_TIMEOUT
# is already exposed (5s default).

# AGS scope claim namespaces — these are stable IMS-defined values.
AGS_CLAIM = "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint"
DEEP_LINK_CLAIM = "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"
DEEP_LINK_RESPONSE_CLAIM = "https://purl.imsglobal.org/spec/lti-dl/claim/content_items"
MESSAGE_TYPE_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/message_type"
DEPLOYMENT_ID_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/deployment_id"
CONTEXT_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/context"
ROLES_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/roles"
RESOURCE_LINK_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/resource_link"
CUSTOM_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/custom"

# Canvas-namespaced submission extension on the AGS Score endpoint.
CANVAS_SUBMISSION_CLAIM = "https://canvas.instructure.com/lti/submission"

# Required AGS scopes for posting scores + reading line items.
AGS_SCOPES = [
    "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
    "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly",
    "https://purl.imsglobal.org/spec/lti-ags/scope/score",
    "https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly",
]

# Roles that map to the Optio "advisor" org_role. Anything else maps to
# "student" (the dominant case). LIS role URIs are the LTI-standard form.
INSTRUCTOR_ROLES = {
    "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor",
    "http://purl.imsglobal.org/vocab/lis/v2/system/person#Administrator",
    "http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator",
}

STATE_TTL_SECONDS = 600       # 10 min for the OIDC handshake to complete
NONCE_TTL_SECONDS = 600       # match Canvas's launch token validity window

# JWKS clients are cached per-issuer to amortize JWKS fetches. PyJWKClient has
# its own internal cache; we just keep one client per registration row.
_jwks_clients: Dict[str, PyJWKClient] = {}


@dataclass
class LtiRegistration:
    id: str
    issuer: str
    client_id: str
    deployment_id: str
    organization_id: str
    auth_login_url: str
    auth_token_url: str
    public_jwks_url: str
    is_active: bool

    @classmethod
    def from_row(cls, row: Dict[str, Any]) -> "LtiRegistration":
        return cls(
            id=row["id"],
            issuer=row["issuer"],
            client_id=row["client_id"],
            deployment_id=row["deployment_id"],
            organization_id=row["organization_id"],
            auth_login_url=row["auth_login_url"],
            auth_token_url=row["auth_token_url"],
            public_jwks_url=row["public_jwks_url"],
            is_active=row.get("is_active", True),
        )


class LtiError(Exception):
    """Generic LTI processing failure."""


class LtiRegistrationNotFound(LtiError):
    pass


class LtiNonceReplay(LtiError):
    pass


# ---------------------------------------------------------------------------
# Registration lookup
# ---------------------------------------------------------------------------

def find_registration(
    issuer: str,
    client_id: str,
    deployment_id: Optional[str] = None,
) -> Optional[LtiRegistration]:
    """Look up a registration row. `deployment_id` is optional during the
    OIDC login init step (Canvas does not always include it there).
    """
    # admin client justified: LTI handler runs pre-session — Canvas-signed id_token is the auth, not an Optio session, so RLS-bound user client isn't usable yet
    supabase = get_supabase_admin_client()
    query = (
        supabase.table("lti_registrations")
        .select("*")
        .eq("issuer", issuer)
        .eq("client_id", client_id)
        .eq("is_active", True)
    )
    if deployment_id:
        query = query.eq("deployment_id", deployment_id)
    result = query.limit(1).execute()
    rows = result.data or []
    if not rows:
        return None
    return LtiRegistration.from_row(rows[0])


def require_registration(
    issuer: str, client_id: str, deployment_id: Optional[str] = None
) -> LtiRegistration:
    reg = find_registration(issuer, client_id, deployment_id)
    if not reg:
        raise LtiRegistrationNotFound(
            f"No LTI registration for issuer={issuer} client_id={client_id} "
            f"deployment_id={deployment_id}"
        )
    return reg


# ---------------------------------------------------------------------------
# State / nonce handling
# ---------------------------------------------------------------------------

def issue_state(registration: LtiRegistration, login_hint: Optional[str]) -> str:
    """Sign a self-contained `state` parameter the platform will echo back.

    We sign with the app's existing JWT_SECRET_KEY (HS256) — distinct from
    the LTI tool RSA key, which is reserved for messages going TO Canvas.
    """
    payload = {
        "purpose": "lti_oidc_state",
        "iss": registration.issuer,
        "cid": registration.client_id,
        "rid": registration.id,
        "lh": login_hint or "",
        "iat": int(time.time()),
        "exp": int(time.time()) + STATE_TTL_SECONDS,
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm="HS256")


def verify_state(state: str, registration: LtiRegistration) -> Dict[str, Any]:
    try:
        payload = jwt.decode(state, Config.JWT_SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError as e:
        raise LtiError(f"Invalid state parameter: {e}") from e

    if payload.get("purpose") != "lti_oidc_state":
        raise LtiError("State has wrong purpose")
    if payload.get("rid") != registration.id:
        raise LtiError("State does not match this registration")
    return payload


# ---------------------------------------------------------------------------
# Evidence access token (SpeedGrader carve-out)
# ---------------------------------------------------------------------------
#
# The Canvas grading teacher views a student's evidence link unauthenticated
# (no Optio session in the SpeedGrader iframe). We must NOT depend on the
# diploma's public/private flag for this — a teacher grading the work they
# assigned has a legitimate need to see it regardless, and the public/private
# product decision is still being workshopped.
#
# Solution: Optio's grade-sync mints an HMAC-signed, non-expiring token
# scoped to one (user_id, quest_id). The diploma endpoint treats a valid
# token as authorization to bypass the public/private gate. The token is
# unforgeable (signed with JWT_SECRET_KEY) and only ever produced by
# grade-sync, which only runs for a genuinely-completed LTI quest in a real
# Canvas course — so it only ever lands in that course's gradebook.


def issue_evidence_token(user_id: str, quest_id: str) -> str:
    """Sign a token authorizing unauthenticated view of `user_id`'s diploma
    in the Canvas SpeedGrader context. No expiry: gradebook links must keep
    working for late grading; scope is read-only single-student."""
    payload = {
        "purpose": "lti_evidence",
        "uid": user_id,
        "qid": quest_id,
        "iat": int(time.time()),
    }
    return jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm="HS256")


def decode_evidence_token(token: str) -> Optional[Dict[str, Any]]:
    """Return `{uid, qid}` if `token` is a valid evidence token, else None.

    The (user, quest) pair is read from the signed token itself — callers
    must not trust a separately-supplied id/quest. Used by the LTI evidence
    endpoint (which has no other auth) and by verify_evidence_token."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if payload.get("purpose") != "lti_evidence":
        return None
    uid = payload.get("uid")
    qid = payload.get("qid")
    if not uid or not qid:
        return None
    return {"uid": uid, "qid": qid}


def verify_evidence_token(token: str, user_id: str) -> bool:
    """True iff `token` is a valid evidence token for exactly `user_id`."""
    claims = decode_evidence_token(token)
    return bool(claims and claims["uid"] == user_id)


def remember_nonce(nonce: str, issuer: str) -> None:
    """Insert nonce into the replay-protection cache. Raises if already seen."""
    # admin client justified: LTI handler runs pre-session — Canvas-signed id_token is the auth, not an Optio session, so RLS-bound user client isn't usable yet
    supabase = get_supabase_admin_client()
    expires = (datetime.now(timezone.utc) + timedelta(seconds=NONCE_TTL_SECONDS)).isoformat()
    try:
        supabase.table("lti_nonces").insert(
            {"nonce": nonce, "issuer": issuer, "expires_at": expires}
        ).execute()
    except Exception as e:
        # Most likely a primary-key conflict — i.e., we've seen this nonce.
        # Re-fetch to confirm before claiming replay.
        existing = (
            supabase.table("lti_nonces")
            .select("nonce")
            .eq("nonce", nonce)
            .limit(1)
            .execute()
        )
        if existing.data:
            raise LtiNonceReplay(f"Nonce already used: {nonce[:8]}...") from e
        # Otherwise the insert failed for a different reason; bubble up.
        raise LtiError(f"Failed to record nonce: {e}") from e


# ---------------------------------------------------------------------------
# id_token verification
# ---------------------------------------------------------------------------

def _jwks_client_for(registration: LtiRegistration) -> PyJWKClient:
    client = _jwks_clients.get(registration.id)
    if client is None:
        client = PyJWKClient(
            registration.public_jwks_url,
            timeout=Config.LTI_JWKS_TIMEOUT,
            cache_keys=True,
        )
        _jwks_clients[registration.id] = client
    return client


def verify_id_token(id_token: str, registration: LtiRegistration) -> Dict[str, Any]:
    """Validate the launch JWT against Canvas's JWKS and basic claims.

    Returns the decoded payload on success; raises LtiError otherwise.
    """
    try:
        signing_key = _jwks_client_for(registration).get_signing_key_from_jwt(id_token)
    except Exception as e:
        raise LtiError(f"Could not resolve signing key for id_token: {e}") from e

    try:
        payload = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=registration.client_id,
            issuer=registration.issuer,
            options={
                "require": ["exp", "iat", "nonce", "sub", "iss", "aud"],
            },
        )
    except jwt.PyJWTError as e:
        raise LtiError(f"id_token verification failed: {e}") from e

    deployment_id = payload.get(DEPLOYMENT_ID_CLAIM)
    if deployment_id != registration.deployment_id:
        raise LtiError(
            f"id_token deployment_id mismatch (expected {registration.deployment_id}, "
            f"got {deployment_id})"
        )

    return payload


def role_to_org_role(roles: Iterable[str]) -> str:
    for role in roles:
        if role in INSTRUCTOR_ROLES:
            return "advisor"
    return "student"


# ---------------------------------------------------------------------------
# Deep Linking response signing
# ---------------------------------------------------------------------------

def sign_deep_link_response(
    registration: LtiRegistration,
    deep_link_settings: Dict[str, Any],
    content_items: List[Dict[str, Any]],
    user_sub: str,
) -> str:
    """Build and sign the JWT we POST back to Canvas's `deep_link_return_url`."""
    if not keys_configured():
        raise LtiKeysNotConfigured(
            "Cannot sign deep link response — tool key pair is not configured."
        )

    now = int(time.time())
    payload = {
        "iss": registration.client_id,             # tool acts as issuer here
        "aud": [registration.issuer],
        "iat": now,
        "exp": now + 600,
        "nonce": secrets.token_urlsafe(16),
        "sub": user_sub,
        DEPLOYMENT_ID_CLAIM: registration.deployment_id,
        MESSAGE_TYPE_CLAIM: "LtiDeepLinkingResponse",
        "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0",
        DEEP_LINK_RESPONSE_CLAIM: content_items,
    }

    # Echo the platform's data parameter back if it sent one (Canvas uses this
    # to tie the response to its in-flight deep-link session).
    data_param = deep_link_settings.get("data")
    if data_param:
        payload["https://purl.imsglobal.org/spec/lti-dl/claim/data"] = data_param

    return jwt.encode(
        payload,
        get_private_key(),
        algorithm="RS256",
        headers={"kid": get_kid(), "typ": "JWT"},
    )


def build_resource_link_content_item(
    title: str,
    target_link_uri: str,
    custom: Optional[Dict[str, str]] = None,
    line_item: Optional[Dict[str, Any]] = None,
    submission_type: str = "external_tool",
) -> Dict[str, Any]:
    """Helper for the Phase 3 deep-link response.

    Canvas honors the vendor-extension `submission` field on `LtiResourceLink`
    items so the resulting assignment is gradable AND launchable, with
    submissions coming from the tool via AGS Score's submission claim.
    """
    item: Dict[str, Any] = {
        "type": "ltiResourceLink",
        "title": title,
        "url": target_link_uri,
    }
    if custom:
        item["custom"] = custom
    if line_item:
        item["lineItem"] = line_item
    # Canvas-specific extension — surfaces as submission_type=external_tool
    # on the resulting assignment.
    item["https://canvas.instructure.com/lti/submission_type"] = submission_type
    return item


# ---------------------------------------------------------------------------
# AGS service-token (client_credentials) flow
# ---------------------------------------------------------------------------

def _service_token_assertion(registration: LtiRegistration) -> str:
    if not keys_configured():
        raise LtiKeysNotConfigured("Cannot mint AGS service token — keys missing.")

    now = int(time.time())
    payload = {
        "iss": registration.client_id,
        "sub": registration.client_id,
        "aud": registration.auth_token_url,
        "iat": now,
        "exp": now + 300,
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(
        payload,
        get_private_key(),
        algorithm="RS256",
        headers={"kid": get_kid(), "typ": "JWT"},
    )


def request_service_token(registration: LtiRegistration, scopes: List[str]) -> str:
    """Exchange a client-assertion JWT for a short-lived service access token."""
    assertion = _service_token_assertion(registration)
    response = requests.post(
        registration.auth_token_url,
        data={
            "grant_type": "client_credentials",
            "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            "client_assertion": assertion,
            "scope": " ".join(scopes),
        },
        timeout=10,
    )
    if not response.ok:
        raise LtiError(
            f"Service token request failed: {response.status_code} {response.text[:200]}"
        )
    body = response.json()
    token = body.get("access_token")
    if not token:
        raise LtiError(f"Service token response missing access_token: {body}")
    return token


def get_ags_results(
    registration: LtiRegistration,
    line_item_url: str,
    user_sub: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """GET the AGS Results for a line item.

    Per AGS spec: results are derived from the latest Score for each user.
    Filtering by `user_id` returns 0..1 result for that specific user. Use
    this when you need "what's the current Canvas-side score for this
    student?" — that's the source of truth for Optio's XP credit gating.

    Returns the list of result objects (each has userId, resultScore,
    resultMaximum, scoreOf, etc.). Empty list if the student has no score
    yet (teacher hasn't graded). Raises LtiError on transport failures.
    """
    token = request_service_token(
        registration,
        ["https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly"],
    )
    results_url = line_item_url.rstrip("/") + "/results"
    params = {"limit": limit}
    if user_sub:
        params["user_id"] = user_sub

    response = requests.get(
        results_url,
        params=params,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.ims.lis.v2.resultcontainer+json",
        },
        timeout=15,
    )
    if not response.ok:
        raise LtiError(
            f"AGS results GET failed: {response.status_code} {response.text[:200]}"
        )
    body = response.json()
    # AGS spec returns either a JSON array or {results: [...]} depending on
    # platform. Normalize.
    if isinstance(body, list):
        return body
    return body.get("results", []) or []


def post_ags_score(
    registration: LtiRegistration,
    line_item_url: str,
    user_sub: str,
    score_given: float,
    score_maximum: float,
    submission_url: Optional[str] = None,
    submission_text: Optional[str] = None,
    activity_progress: str = "Completed",
    grading_progress: str = "FullyGraded",
) -> requests.Response:
    """POST a Score (and optional submission artifact) to Canvas AGS.

    Canvas's namespaced `submission` extension is what causes the artifact to
    show up in SpeedGrader rather than just being a numeric score in the
    gradebook. The teacher can override the score in Canvas afterwards.
    """
    token = request_service_token(registration, AGS_SCOPES)
    payload: Dict[str, Any] = {
        "userId": user_sub,
        "scoreGiven": score_given,
        "scoreMaximum": score_maximum,
        "activityProgress": activity_progress,
        "gradingProgress": grading_progress,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if submission_url or submission_text:
        sub: Dict[str, Any] = {"new_submission": True}
        if submission_url:
            sub["submission_type"] = "online_url"
            sub["submission_data"] = submission_url
        elif submission_text:
            sub["submission_type"] = "online_text_entry"
            sub["submission_data"] = submission_text
        payload[CANVAS_SUBMISSION_CLAIM] = sub

    # AGS Score endpoint is `<lineitem_url>/scores`. Canvas line item URLs
    # come straight out of the launch token's AGS claim and already carry
    # auth context — we just append /scores.
    score_url = line_item_url.rstrip("/") + "/scores"
    response = requests.post(
        score_url,
        json=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/vnd.ims.lis.v1.score+json",
        },
        timeout=15,
    )
    if not response.ok:
        logger.warning(
            f"[LTI AGS] Score POST failed url={score_url} status={response.status_code} "
            f"body={response.text[:300]}"
        )
    return response


# ---------------------------------------------------------------------------
# Deferred user provisioning (student "click to enter" flow)
# ---------------------------------------------------------------------------
#
# Student-role Resource Link launches no longer create an Optio `users` row
# on the launch itself. Instead we stash the verified id_token claims in
# `lti_pending_launches` and only materialize the user when the student
# explicitly clicks "Enter Optio" on the iframe landing page — which is
# what triggers `/lti/token`. Teachers, advisors, and Deep Linking flows
# still provision immediately (see provision_lti_user usage in launch.py).

PENDING_LAUNCH_TTL_SECONDS = 3600  # 1h — matches the click-to-enter UX window


def issue_pending_launch(
    registration_id: str, claims: Dict[str, Any]
) -> str:
    """Persist LTI claims for a not-yet-materialized launch. Returns the row id."""
    # admin client justified: LTI handler runs pre-session — Canvas-signed id_token is the auth, not an Optio session, so RLS-bound user client isn't usable yet
    supabase = get_supabase_admin_client()
    expires = (
        datetime.now(timezone.utc)
        + timedelta(seconds=PENDING_LAUNCH_TTL_SECONDS)
    ).isoformat()
    row = (
        supabase.table("lti_pending_launches")
        .insert(
            {
                "registration_id": registration_id,
                "claims": claims,
                "expires_at": expires,
            }
        )
        .execute()
    )
    return row.data[0]["id"]


def consume_pending_launch(pending_id: str) -> Optional[Dict[str, Any]]:
    """Read + delete a pending launch row. Returns the row or None if missing/expired."""
    # admin client justified: LTI handler runs pre-session — Canvas-signed id_token is the auth, not an Optio session, so RLS-bound user client isn't usable yet
    supabase = get_supabase_admin_client()
    record = (
        supabase.table("lti_pending_launches")
        .select("*")
        .eq("id", pending_id)
        .limit(1)
        .execute()
    )
    if not record.data:
        return None
    row = record.data[0]
    expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    if datetime.now(expires_at.tzinfo) > expires_at:
        supabase.table("lti_pending_launches").delete().eq("id", pending_id).execute()
        return None
    supabase.table("lti_pending_launches").delete().eq("id", pending_id).execute()
    return row


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _is_valid_email(value: str) -> bool:
    """Conservative RFC-ish check. Supabase Auth rejects malformed addresses
    with a 400 (which previously 500'd the whole launch), so we gate
    create_user on this and synthesize a placeholder when a platform — e.g.
    Canvas's "Student View" test user — sends a missing or garbage email."""
    return bool(_EMAIL_RE.match((value or "").strip()))


def _attach_existing_user_to_org(
    supabase,
    user_id: str,
    org_role: str,
    organization_id: str,
) -> None:
    """Bind an already-existing Optio user to the registration's org.

    LTI users are org-managed: the `direct_role_no_org_role` CHECK
    (role = 'org_managed' OR org_role IS NULL) means we can't set `org_role`
    on a row that still carries a direct platform role. So whenever we reuse
    an existing account via Canvas — whether matched by the lms_integrations
    link or by email — we flip role/org_role/organization_id together, exactly
    like the create path does, rather than touching `org_role` alone (which
    crashed pre-existing platform users with a 23514 constraint violation).

    Superadmin is exempt: a superadmin who happens to launch from Canvas must
    never be demoted to org_managed or pinned to an org.
    """
    current = (
        supabase.table("users")
        .select("role")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if current.data and current.data[0].get("role") == "superadmin":
        return
    supabase.table("users").update(
        {
            "role": "org_managed",
            "org_role": org_role,
            "organization_id": organization_id,
        }
    ).eq("id", user_id).execute()


def provision_lti_user(claims: Dict[str, Any], registration: LtiRegistration) -> str:
    """Find or create the Optio user behind this Canvas user.

    Linking strategy mirrors `create_or_update_spark_user`:
        1. lms_integrations row with (lms_platform='canvas', lms_user_id=sub)
        2. fall back to email match
        3. else create a fresh org_managed user inside the registration's
           organization, mark them with org_role from their LIS roles.
    """
    # admin client justified: LTI launch runs pre-session — Canvas-signed id_token is the auth surface; user provisioning + lms_integrations writes need to cross users
    supabase = get_supabase_admin_client()
    canvas_user_id = claims["sub"]
    raw_email = (
        claims.get("email")
        or claims.get("https://purl.imsglobal.org/spec/lti/claim/lis", {}).get(
            "person_sourcedid"
        )
        or ""
    ).strip()
    given = claims.get("given_name", "")
    family = claims.get("family_name", "")
    full_name = claims.get("name") or f"{given} {family}".strip()
    roles = claims.get(ROLES_CLAIM, [])
    org_role = role_to_org_role(roles)

    # Canvas's "Student View" test user — and some Canvas privacy configs —
    # send a missing or malformed email, which Supabase Auth rejects with a
    # 400. The real identity anchor is the lms_integrations (lms_user_id=sub)
    # link, so when the email is unusable we synthesize a deterministic,
    # format-valid placeholder keyed off the LTI subject and skip the
    # email-merge step below (so a synthetic test user can never collide with
    # or merge into a real account).
    email_is_real = _is_valid_email(raw_email)
    email = (
        raw_email
        if email_is_real
        else f"canvas-{canvas_user_id}@lti.optioeducation.com"
    )

    # 1. Existing LMS link
    integration = (
        supabase.table("lms_integrations")
        .select("user_id")
        .eq("lms_platform", "canvas")
        .eq("lms_user_id", canvas_user_id)
        .execute()
    )
    if integration.data:
        user_id = integration.data[0]["user_id"]
        # Keep role/org_role fresh in case the teacher promoted/demoted them
        # (and to repair platform accounts that predate org binding).
        _attach_existing_user_to_org(
            supabase, user_id, org_role, registration.organization_id
        )
        return user_id

    # 2. Email merge — only for real, platform-provided emails. Synthetic
    # placeholders must never match an existing account.
    user_id: Optional[str] = None
    if email_is_real:
        existing = (
            supabase.table("users").select("id").eq("email", email).limit(1).execute()
        )
        if existing.data:
            user_id = existing.data[0]["id"]
            logger.info(f"[LTI provision] Linking existing user {user_id} to Canvas")
            _attach_existing_user_to_org(
                supabase, user_id, org_role, registration.organization_id
            )

    # 3. Create
    if not user_id:
        temp_password = secrets.token_urlsafe(32)
        auth_user = supabase.auth.admin.create_user(
            {
                "email": email,
                "password": temp_password,
                "email_confirm": True,
                "user_metadata": {
                    "first_name": given,
                    "last_name": family,
                    "display_name": full_name,
                    "sso_provider": "canvas_lti",
                },
            }
        )
        user_id = auth_user.user.id
        supabase.table("users").insert(
            {
                "id": user_id,
                "email": email,
                "first_name": given,
                "last_name": family,
                "display_name": full_name,
                "role": "org_managed",
                "org_role": org_role,
                "organization_id": registration.organization_id,
            }
        ).execute()
        logger.info(f"[LTI provision] Created new user {user_id} from Canvas SSO")

    # 4. Record the LMS link. organization_id is NOT NULL on lms_integrations
    # since the H1 audit; tie the integration to the org the registration is
    # mapped to so cross-org lookups don't bleed.
    supabase.table("lms_integrations").insert(
        {
            "user_id": user_id,
            "lms_platform": "canvas",
            "lms_user_id": canvas_user_id,
            "organization_id": registration.organization_id,
            "sync_enabled": True,
            "sync_status": "active",
        }
    ).execute()

    return user_id


# ---------------------------------------------------------------------------
# One-time auth code (post-launch handoff to the iframe)
# ---------------------------------------------------------------------------

def issue_auth_code(
    user_id: Optional[str] = None,
    quest_id: Optional[str] = None,
    target_path: Optional[str] = None,
    expires_in_seconds: int = 60,
    pending_launch_id: Optional[str] = None,
) -> str:
    """Mint a one-time code the iframe exchanges for Bearer tokens.

    Exactly one of `user_id` (teacher / Deep Link / already-provisioned user)
    or `pending_launch_id` (deferred student flow — user not yet created)
    must be set. The DB enforces this via the lti_auth_codes_subject_present
    CHECK constraint.

    Default 60s TTL is enough for the immediate token exchange. Deep Linking
    flows pass `expires_in_seconds=600` because the same row also stashes
    the platform's deep-link settings — the teacher needs time to fill in
    the form before /lti/deep-link/submit reads them back. The pending
    student flow uses 600 as well so the click-to-enter window matches the
    pending_launches row's TTL ceiling.
    """
    if (user_id is None) == (pending_launch_id is None):
        raise ValueError(
            "issue_auth_code requires exactly one of user_id or pending_launch_id"
        )
    code = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(seconds=expires_in_seconds)).isoformat()
    # admin client justified: LTI handler runs pre-session — Canvas-signed id_token is the auth, not an Optio session, so RLS-bound user client isn't usable yet
    supabase = get_supabase_admin_client()
    supabase.table("lti_auth_codes").insert(
        {
            "code": code,
            "user_id": user_id,
            "pending_launch_id": pending_launch_id,
            "quest_id": quest_id,
            "target_path": target_path,
            "expires_at": expires,
            "used": False,
        }
    ).execute()
    return code


def consume_auth_code(code: str) -> Optional[Dict[str, Any]]:
    """Look up + invalidate a one-time code. Returns the row or None.

    Returned row may have `user_id` set (existing user) OR `pending_launch_id`
    set (deferred student — caller is responsible for materializing the user
    via `provision_lti_user` + `consume_pending_launch`).
    """
    # admin client justified: LTI handler runs pre-session — Canvas-signed id_token is the auth, not an Optio session, so RLS-bound user client isn't usable yet
    supabase = get_supabase_admin_client()
    record = (
        supabase.table("lti_auth_codes")
        .select("*")
        .eq("code", code)
        .limit(1)
        .execute()
    )
    if not record.data:
        return None
    row = record.data[0]
    if row.get("used"):
        return None
    expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    if datetime.now(expires_at.tzinfo) > expires_at:
        return None
    supabase.table("lti_auth_codes").update({"used": True}).eq("code", code).execute()
    return row
