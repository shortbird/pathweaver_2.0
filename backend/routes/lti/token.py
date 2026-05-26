"""
Auth-code → Bearer token exchange for the iframe handoff.

After /lti/launch verifies the Canvas id_token, it issues a one-time auth
code and redirects the iframe to the frontend. The frontend POSTs that code
here to receive Optio access + refresh tokens, which it stores in
`tokenStore` (the same Bearer-mode pattern the mobile app uses).

For student-role Resource Link launches, the auth code references a
`lti_pending_launches` row rather than a `users` row — the Optio user is
NOT materialized until this exchange runs (which only happens after the
student clicks "Enter Optio" on the iframe landing page). This prevents
passive Canvas-side launches from spawning empty user accounts.

This route is intentionally NOT cookie-dependent — third-party cookies are
blocked in the iframe context, so we deliver tokens in the response body.
"""

from typing import Any, Dict

from flask import jsonify, request

from middleware.rate_limiter import rate_limit
from routes.lti import bp
from services.lti_service import (
    LtiRegistration,
    consume_auth_code,
    consume_pending_launch,
    provision_lti_user,
)
from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.session_manager import session_manager

logger = get_logger(__name__)


@bp.route("/token", methods=["POST"])
@rate_limit(limit=20, per=60)
def exchange_auth_code():
    """Exchange a one-time LTI auth code for Optio Bearer tokens.

    Request body (JSON):
        code: The one-time code from the launch redirect URL.

    Response (JSON):
        access_token, refresh_token, user_id, target_path, quest_id?
    """
    data = request.get_json(silent=True) or {}
    code = data.get("code")
    if not code:
        return jsonify({"error": "Missing code"}), 400

    record = consume_auth_code(code)
    if not record:
        logger.warning(f"[LTI token] Invalid or expired code: {str(code)[:8]}...")
        return jsonify({"error": "Invalid or expired code"}), 401

    user_id = record.get("user_id")
    pending_launch_id = record.get("pending_launch_id")

    # Deferred student flow: the auth code was minted without a user row.
    # The student has now clicked "Enter Optio" — materialize them.
    if not user_id and pending_launch_id:
        pending = consume_pending_launch(pending_launch_id)
        if not pending:
            logger.warning(
                f"[LTI token] Pending launch {pending_launch_id[:8]} missing or expired"
            )
            return jsonify({"error": "Launch expired — please re-open from Canvas"}), 401

        registration = _load_registration(pending["registration_id"])
        if not registration:
            logger.error(
                f"[LTI token] Pending launch references unknown registration "
                f"{pending['registration_id']}"
            )
            return jsonify({"error": "LTI registration no longer active"}), 500

        try:
            user_id = provision_lti_user(pending["claims"], registration)
        except Exception as e:  # noqa: BLE001 — provisioning errors are best surfaced verbatim
            logger.exception(f"[LTI token] Failed to materialize pending user: {e}")
            return jsonify({"error": "Failed to create Optio account"}), 500
        logger.info(
            f"[LTI token] Materialized deferred student user={user_id[:8]} "
            f"from pending={pending_launch_id[:8]}"
        )

    if not user_id:
        # CHECK constraint should make this unreachable, but guard anyway.
        logger.error(f"[LTI token] Auth code {str(code)[:8]} has no subject")
        return jsonify({"error": "Malformed launch code"}), 500

    access_token = session_manager.generate_access_token(user_id)
    refresh_token = session_manager.generate_refresh_token(user_id)

    target_path = record.get("target_path") or "/dashboard"
    # Strip the deep_link:: prefix that launch.py uses to stash settings —
    # the frontend deep-link page will fetch the full settings via a
    # separate endpoint when it needs them.
    if target_path.startswith("deep_link::"):
        target_path = "/lti-deep-link"

    payload: Dict[str, Any] = {
        "user_id": user_id,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "target_path": target_path,
    }
    if record.get("quest_id"):
        payload["quest_id"] = record["quest_id"]

    logger.info(f"[LTI token] Issued tokens for user {user_id[:8]}...")
    return jsonify(payload), 200


def _load_registration(registration_id: str):
    """Re-hydrate the LtiRegistration that owned a pending launch."""
    # admin client justified: LTI handler runs pre-session — Canvas-signed id_token is the auth, not an Optio session, so RLS-bound user client isn't usable yet
    supabase = get_supabase_admin_client()
    rows = (
        supabase.table("lti_registrations")
        .select("*")
        .eq("id", registration_id)
        .limit(1)
        .execute()
    )
    if not rows.data:
        return None
    return LtiRegistration.from_row(rows.data[0])
