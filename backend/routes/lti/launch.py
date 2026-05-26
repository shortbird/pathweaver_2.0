"""
LTI 1.3 OIDC login init + launch verification.

Flow:
    1. Canvas → GET/POST /lti/login   (OIDC third-party-initiated login)
       We look up the registration, mint a state JWT, redirect the iframe
       to Canvas's auth_login_url with the OIDC params.
    2. Canvas → POST /lti/launch       (id_token + state in form body)
       We verify the state, fetch the platform JWKS, verify the id_token
       signature + claims, check nonce replay, resolve / provision the
       user, mint a one-time auth code, and redirect to the frontend.

The user provisioning helper mirrors the Spark integration's email-merge
pattern (backend/routes/spark_integration/__init__.py:84).
"""

from __future__ import annotations

import secrets
from typing import Any, Dict
from urllib.parse import urlencode

from flask import jsonify, redirect, request

from app_config import Config
from database import get_supabase_admin_client
from middleware.rate_limiter import rate_limit
from routes.lti import bp
from services.lti_service import (
    AGS_CLAIM,
    CONTEXT_CLAIM,
    CUSTOM_CLAIM,
    DEEP_LINK_CLAIM,
    DEPLOYMENT_ID_CLAIM,
    MESSAGE_TYPE_CLAIM,
    ROLES_CLAIM,
    LtiError,
    LtiNonceReplay,
    LtiRegistrationNotFound,
    find_registration,
    issue_auth_code,
    issue_pending_launch,
    issue_state,
    provision_lti_user,
    remember_nonce,
    require_registration,
    role_to_org_role,
    verify_id_token,
    verify_state,
)
from utils.logger import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# OIDC login init  (Canvas → tool)
# ---------------------------------------------------------------------------

@bp.route("/login", methods=["GET", "POST"])
@rate_limit(limit=60, per=60)
def oidc_login_init():
    """Canvas third-party initiated login.

    Required params (per OIDC 3rd-party login + LTI 1.3):
        iss, login_hint, target_link_uri
    Optional but used:
        client_id, lti_deployment_id, lti_message_hint, lti_storage_target
    """
    params = request.values  # works for both GET and POST

    issuer = params.get("iss")
    login_hint = params.get("login_hint")
    target_link_uri = params.get("target_link_uri")
    client_id = params.get("client_id")
    deployment_id = params.get("lti_deployment_id")
    lti_message_hint = params.get("lti_message_hint")
    lti_storage_target = params.get("lti_storage_target")

    if not issuer or not login_hint or not target_link_uri:
        logger.warning(f"[LTI login] Missing required params: {dict(params)}")
        return jsonify({"error": "Missing required OIDC parameters"}), 400

    # Canvas may omit client_id on the initial login — most installs include it.
    # If absent, we accept any registration matching (issuer, deployment_id);
    # if multiple match the launch will fail later when client_id is compared.
    registration = None
    if client_id:
        registration = find_registration(issuer, client_id, deployment_id)
    if not registration:
        # Fall back to issuer-only lookup (single tenant Canvas install).
        # Production multi-tenant configs should always send client_id.
        # admin client justified: LTI launch runs pre-session — Canvas-signed id_token is the auth surface; user provisioning + lms_integrations writes need to cross users
        supabase = get_supabase_admin_client()
        rows = (
            supabase.table("lti_registrations")
            .select("*")
            .eq("issuer", issuer)
            .eq("is_active", True)
            .execute()
        )
        if rows.data and len(rows.data) == 1:
            from services.lti_service import LtiRegistration

            registration = LtiRegistration.from_row(rows.data[0])
        else:
            logger.warning(
                f"[LTI login] No unique registration for iss={issuer} client_id={client_id}"
            )
            return jsonify({"error": "Tool not registered for this platform"}), 404

    state = issue_state(registration, login_hint)
    nonce = secrets.token_urlsafe(24)

    # The platform echoes our nonce back in the id_token unchanged (OIDC).
    # /lti/launch records it in lti_nonces on arrival; if the same id_token
    # is replayed, the second insert hits the PK constraint and we reject.
    # We do NOT pre-record here — that would make the first legitimate
    # launch arrive with an "already used" nonce.

    auth_params = {
        "scope": "openid",
        "response_type": "id_token",
        "response_mode": "form_post",
        "prompt": "none",
        "client_id": registration.client_id,
        "redirect_uri": target_link_uri,
        "login_hint": login_hint,
        "state": state,
        "nonce": nonce,
    }
    if lti_message_hint:
        auth_params["lti_message_hint"] = lti_message_hint
    if lti_storage_target:
        # Pass through so the platform knows we support Platform Storage.
        # Frontend handler will read it from the launch token's claims.
        auth_params["lti_storage_target"] = lti_storage_target

    redirect_url = f"{registration.auth_login_url}?{urlencode(auth_params)}"
    logger.info(
        f"[LTI login] iss={issuer} client_id={registration.client_id} "
        f"redirecting to platform auth_login_url"
    )
    return redirect(redirect_url, code=302)


# ---------------------------------------------------------------------------
# Launch  (Canvas → tool, post-OIDC)
# ---------------------------------------------------------------------------

@bp.route("/launch", methods=["POST"])
@rate_limit(limit=120, per=60)
def lti_launch():
    """Verify the LTI launch JWT, provision the user, redirect into the iframe."""
    id_token = request.form.get("id_token")
    state = request.form.get("state")
    if not id_token or not state:
        logger.warning("[LTI launch] Missing id_token or state in form body")
        return jsonify({"error": "Missing id_token or state"}), 400

    # Decode the state without verification first so we can find the
    # registration; signature check follows.
    import jwt as _jwt

    try:
        unverified = _jwt.decode(state, options={"verify_signature": False})
    except _jwt.PyJWTError:
        return jsonify({"error": "Malformed state"}), 400

    registration_id = unverified.get("rid")
    issuer = unverified.get("iss")
    client_id = unverified.get("cid")
    if not registration_id or not issuer or not client_id:
        return jsonify({"error": "State missing registration claims"}), 400

    try:
        # Look up by issuer + client_id (deployment_id is in the token claims;
        # we'll verify it inside verify_id_token).
        registration = require_registration(issuer, client_id)
    except LtiRegistrationNotFound:
        return jsonify({"error": "Tool not registered"}), 404

    try:
        verify_state(state, registration)
    except LtiError as e:
        logger.warning(f"[LTI launch] State verification failed: {e}")
        return jsonify({"error": "Invalid state"}), 400

    try:
        claims = verify_id_token(id_token, registration)
    except LtiError as e:
        logger.warning(f"[LTI launch] id_token verification failed: {e}")
        return jsonify({"error": "Invalid id_token"}), 401

    # Replay-check nonce. Note: we pre-recorded the nonce we generated in
    # /lti/login — but Canvas always generates its own and signs it into the
    # token. So the *actual* replay check is on the token's nonce: we try to
    # remember it now; if it's already there, it's a replay.
    nonce = claims.get("nonce")
    if not nonce:
        return jsonify({"error": "id_token missing nonce"}), 400

    try:
        # NOTE: this remember-on-launch pattern means a replayed launch is
        # detected by a primary-key conflict. The nonce we wrote in /login
        # was a different value (we don't get to choose Canvas's nonce); it
        # would only collide by astronomical coincidence.
        remember_nonce(nonce, registration.issuer)
    except LtiNonceReplay:
        logger.warning(f"[LTI launch] Nonce replay rejected for iss={issuer}")
        return jsonify({"error": "Nonce already used"}), 401
    except LtiError as e:
        logger.error(f"[LTI launch] Could not record launch nonce: {e}")
        return jsonify({"error": "LTI internal error"}), 500

    message_type = claims.get(MESSAGE_TYPE_CLAIM)
    frontend_url = _frontend_url()

    if message_type == "LtiDeepLinkingRequest":
        # Deep Link flow — teacher is setting up an assignment. Always
        # provision immediately: they're going to actively use the platform
        # to pick a quest, and there is no "shadow teacher" concern.
        user_id = provision_lti_user(claims, registration)
        deep_link_settings = claims.get(DEEP_LINK_CLAIM, {})
        code = issue_auth_code(
            user_id=user_id,
            target_path="/lti-deep-link",
            expires_in_seconds=600,
        )
        # Persist the deep-link settings in a short-lived cache so the form
        # submission can echo them back without a round-trip to Canvas.
        _stash_deep_link_settings(code, deep_link_settings, registration.id, claims)
        return redirect(
            f"{frontend_url}/lti-launch?code={code}&mode=deep_link",
            code=302,
        )

    # Default: LtiResourceLinkRequest — student (or teacher previewing) is
    # launching an existing assignment. Pull the quest_id we encoded in
    # custom claims when the assignment was created via Deep Linking; if
    # missing, this is a launch from Canvas course nav (no quest yet) and
    # we'll just send them to the standard dashboard.
    custom = claims.get(CUSTOM_CLAIM, {}) or {}
    quest_id = custom.get("optio_quest_id")

    # AGS line-item URL is keyed by quest, not user, so capture it eagerly
    # on every launch regardless of whether we provision the user now.
    if quest_id:
        _capture_ags_lineitem(quest_id, claims)

    target_path = f"/lti-quest/{quest_id}" if quest_id else "/dashboard"

    # Student-role Resource Link launches DEFER user creation until the
    # student explicitly clicks "Enter Optio" on the iframe landing page
    # (which is what fires /lti/token). This prevents Canvas-side passive
    # launches (e.g. the course-nav tile auto-loading the iframe) from
    # spawning empty `users` rows for students who never actually engage.
    # Teachers/advisors still provision immediately so their preview /
    # SpeedGrader / assignment-setup flows work the same as today.
    roles = claims.get(ROLES_CLAIM, [])
    if role_to_org_role(roles) == "student":
        pending_id = issue_pending_launch(registration.id, claims)
        code = issue_auth_code(
            pending_launch_id=pending_id,
            quest_id=quest_id,
            target_path=target_path,
            expires_in_seconds=600,
        )
        logger.info(
            f"[LTI launch] Deferred student provisioning — pending={pending_id[:8]} "
            f"quest={quest_id} sub={claims.get('sub')[:8] if claims.get('sub') else '?'}"
        )
        return redirect(
            f"{frontend_url}/lti-launch?code={code}&mode=pending",
            code=302,
        )

    # Teacher / advisor preview of an existing assignment — same as today.
    user_id = provision_lti_user(claims, registration)
    code = issue_auth_code(
        user_id=user_id,
        quest_id=quest_id,
        target_path=target_path,
    )
    return redirect(
        f"{frontend_url}/lti-launch?code={code}",
        code=302,
    )


# ---------------------------------------------------------------------------
# AGS endpoint capture + deep-link settings stash
# ---------------------------------------------------------------------------

def _capture_ags_lineitem(quest_id: str, claims: Dict[str, Any]) -> None:
    """If the launch carries an AGS endpoint claim with a `lineitem` URL,
    persist it on the quest. Subsequent quest completions will use this URL
    to POST scores without needing the launch token again."""
    ags = claims.get(AGS_CLAIM)
    if not ags:
        return
    line_item_url = ags.get("lineitem")
    if not line_item_url:
        return

    # admin client justified: LTI launch runs pre-session — Canvas-signed id_token is the auth surface; user provisioning + lms_integrations writes need to cross users
    supabase = get_supabase_admin_client()
    # Only update if the value is currently empty — first-launch capture wins.
    quest_row = (
        supabase.table("quests")
        .select("lti_ags_lineitem_url")
        .eq("id", quest_id)
        .limit(1)
        .execute()
    )
    if quest_row.data and not quest_row.data[0].get("lti_ags_lineitem_url"):
        supabase.table("quests").update(
            {"lti_ags_lineitem_url": line_item_url}
        ).eq("id", quest_id).execute()
        logger.info(f"[LTI launch] Captured AGS lineitem url for quest {quest_id}")


def _stash_deep_link_settings(
    code: str,
    settings: Dict[str, Any],
    registration_id: str,
    claims: Dict[str, Any],
) -> None:
    """Persist deep-link settings keyed by the auth code so the deep-link
    submit handler can sign the response without re-receiving them. Stored
    inline in lti_auth_codes.target_path is a hack — use a dedicated column
    if this grows. For v1, JSON-encode into target_path as a tagged blob."""
    import json

    # admin client justified: LTI launch runs pre-session — Canvas-signed id_token is the auth surface; user provisioning + lms_integrations writes need to cross users
    supabase = get_supabase_admin_client()
    blob = json.dumps(
        {
            "deep_link_settings": settings,
            "registration_id": registration_id,
            "context_id": claims.get(CONTEXT_CLAIM, {}).get("id"),
            "deployment_id": claims.get(DEPLOYMENT_ID_CLAIM),
            "user_sub": claims.get("sub"),
        }
    )
    supabase.table("lti_auth_codes").update(
        {"target_path": "deep_link::" + blob}
    ).eq("code", code).execute()


def _frontend_url() -> str:
    # LTI-only base. Defaults to FRONTEND_URL (no-op) until the staged
    # v2-as-LTI-host cutover flips LTI_FRONTEND_URL in prod env. The v2
    # routes (/lti-launch, /deep-link, /quest/[id]) match these paths, so
    # the host flip needs no code change here.
    return (Config.LTI_FRONTEND_URL or Config.FRONTEND_URL).rstrip("/")
