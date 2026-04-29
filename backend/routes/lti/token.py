"""
Auth-code → Bearer token exchange for the iframe handoff.

After /lti/launch verifies the Canvas id_token, it issues a one-time auth
code and redirects the iframe to the frontend. The frontend POSTs that code
here to receive Optio access + refresh tokens, which it stores in
`tokenStore` (the same Bearer-mode pattern the mobile app uses).

This route is intentionally NOT cookie-dependent — third-party cookies are
blocked in the iframe context, so we deliver tokens in the response body.
"""

from datetime import datetime, timezone
from typing import Any, Dict

from flask import jsonify, request

from middleware.rate_limiter import rate_limit
from routes.lti import bp
from services.lti_service import consume_auth_code
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

    user_id = record["user_id"]
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
