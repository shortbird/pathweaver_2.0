"""
LTI Deep Linking 2.0 — teacher form submission.

Flow (continuing from launch.py's LtiDeepLinkingRequest branch):
    1. /lti/launch verified the deep-link request and stashed the platform's
       `deep_linking_settings` blob (signed return URL, accept_types, etc.)
       under the one-time auth code.
    2. The iframe loads the frontend deep-link page, exchanges the code
       (storing Bearer tokens), and fetches the stashed settings via
       GET /lti/deep-link/context.
    3. Teacher fills in title + description and POSTs to
       /lti/deep-link/submit. We:
         a. Create a blank `quests` row (`quest_type='optio'` —
            check_quest_type only allows 'optio'/'course'; LTI provenance
            lives in lms_platform + lti_registration_id + lms_course_id).
         b. Build a single LtiResourceLink content item pointing
            target_link_uri at /lti/launch with `optio_quest_id` in
            `custom`. Set submission_type=external_tool so Canvas wires it
            up as a gradable assignment.
         c. Sign the LtiDeepLinkingResponse JWT and return it to the
            frontend, which submits it to the platform's
            deep_link_return_url via auto-submitting <form>.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from flask import jsonify, request

from app_config import Config
from database import get_supabase_admin_client
from middleware.rate_limiter import rate_limit
from routes.lti import bp
from services.lti_service import (
    LtiError,
    LtiRegistration,
    build_resource_link_content_item,
    sign_deep_link_response,
)
from utils.auth.decorators import require_auth
from utils.logger import get_logger

logger = get_logger(__name__)

DEEP_LINK_PREFIX = "deep_link::"


def _backend_origin() -> str:
    if Config.BACKEND_URL:
        return Config.BACKEND_URL.rstrip("/")
    return request.url_root.rstrip("/")


def _load_deep_link_state(code: str) -> Optional[Dict[str, Any]]:
    """Fetch the stashed deep-link blob keyed by an auth code.

    Note: launch.py marks the code as used after the token exchange. We need
    the deep-link blob AFTER the exchange, so we keep a separate lookup that
    reads even used codes — within the original 60s expiry window.
    """
    # admin client justified: deep-link flow needs to write a quest scoped to a Canvas-mapped organization, not the calling user's RLS-visible orgs
    supabase = get_supabase_admin_client()
    record = (
        supabase.table("lti_auth_codes")
        .select("target_path, expires_at")
        .eq("code", code)
        .limit(1)
        .execute()
    )
    if not record.data:
        return None
    row = record.data[0]
    expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    if datetime.now(expires_at.tzinfo) > expires_at:
        return None
    target_path = row.get("target_path") or ""
    if not target_path.startswith(DEEP_LINK_PREFIX):
        return None
    try:
        return json.loads(target_path[len(DEEP_LINK_PREFIX):])
    except json.JSONDecodeError:
        return None


@bp.route("/deep-link/context", methods=["GET"])
@require_auth
@rate_limit(limit=30, per=60)
def deep_link_context(user_id: str):
    """Return the deep-link settings the iframe needs to render the form.

    Auth: Bearer token (the user just exchanged the auth code, so they're
    signed in). Code is passed as a query param so we can locate the stash.
    """
    code = request.args.get("code")
    if not code:
        return jsonify({"error": "Missing code"}), 400

    state = _load_deep_link_state(code)
    if not state:
        return jsonify({"error": "Deep link context expired"}), 404

    # Only return the settings the frontend actually needs to render.
    return (
        jsonify(
            {
                "deep_link_return_url": state["deep_link_settings"].get(
                    "deep_link_return_url"
                ),
                "accept_types": state["deep_link_settings"].get("accept_types", []),
                "context_id": state.get("context_id"),
            }
        ),
        200,
    )


@bp.route("/deep-link/submit", methods=["POST"])
@require_auth
@rate_limit(limit=20, per=60)
def deep_link_submit(user_id: str):
    """Create the blank quest + return a signed LtiDeepLinkingResponse JWT."""
    data = request.get_json(silent=True) or {}
    code = data.get("code")
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    xp_threshold_raw = data.get("xp_threshold")
    if not code or not title:
        return jsonify({"error": "Missing code or title"}), 400

    # XP threshold is optional. Teachers who want a target ("earn 500 XP")
    # set it; otherwise null (legacy: complete when student presses submit).
    xp_threshold = None
    if xp_threshold_raw not in (None, ""):
        try:
            xp_threshold = int(xp_threshold_raw)
            if xp_threshold < 0:
                raise ValueError
        except (TypeError, ValueError):
            return jsonify({"error": "xp_threshold must be a non-negative integer"}), 400

    state = _load_deep_link_state(code)
    if not state:
        return jsonify({"error": "Deep link context expired"}), 404

    # admin client justified: deep-link flow needs to write a quest scoped to a Canvas-mapped organization, not the calling user's RLS-visible orgs
    supabase = get_supabase_admin_client()
    registration_row = (
        supabase.table("lti_registrations")
        .select("*")
        .eq("id", state["registration_id"])
        .limit(1)
        .execute()
    )
    if not registration_row.data:
        return jsonify({"error": "Registration not found"}), 404
    registration = LtiRegistration.from_row(registration_row.data[0])

    # Create the quest. Per locked decision, every LTI quest is a blank
    # personalize-your-own — students run AI personalization to get their
    # own task list. quest_type='optio' (the personalize-your-own kind);
    # the LTI provenance lives in lms_platform + lti_registration_id +
    # lms_course_id. The check_quest_type constraint only allows 'optio'
    # or 'course'.
    quest_payload = {
        "title": title,
        "description": description,
        "quest_type": "optio",
        "lms_platform": "canvas",
        "lms_course_id": state.get("context_id"),
        "lti_registration_id": registration.id,
        "organization_id": registration.organization_id,
        "is_active": True,
        "is_public": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if xp_threshold is not None:
        quest_payload["xp_threshold"] = xp_threshold

    quest_row = supabase.table("quests").insert(quest_payload).execute()
    if not quest_row.data:
        logger.error("[LTI deep link] Failed to create quest")
        return jsonify({"error": "Could not create quest"}), 500
    quest_id = quest_row.data[0]["id"]

    # Build the response. Canvas will create an assignment whose external
    # tool link is /lti/launch?... — we encode the quest id into the
    # `custom` claim so subsequent launches know which quest to load.
    target_link_uri = f"{_backend_origin()}/lti/launch"
    item = build_resource_link_content_item(
        title=title,
        target_link_uri=target_link_uri,
        custom={"optio_quest_id": quest_id},
        line_item={"scoreMaximum": 100, "label": title},
        submission_type="external_tool",
    )

    try:
        signed_jwt = sign_deep_link_response(
            registration=registration,
            deep_link_settings=state["deep_link_settings"],
            content_items=[item],
            user_sub=state.get("user_sub", user_id),
        )
    except LtiError as e:
        logger.error(f"[LTI deep link] Could not sign response: {e}")
        return jsonify({"error": "Could not sign deep link response"}), 500

    return (
        jsonify(
            {
                "jwt": signed_jwt,
                "deep_link_return_url": state["deep_link_settings"].get(
                    "deep_link_return_url"
                ),
                "quest_id": quest_id,
            }
        ),
        200,
    )
