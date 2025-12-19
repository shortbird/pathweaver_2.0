"""
Authentication Module: Session Management

Handles:
- CSRF token generation for frontend requests
"""

from flask import Blueprint, request, jsonify
from middleware.csrf_protection import get_csrf_token
import secrets

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('auth_session', __name__)


# ============================================================================
# ENDPOINTS
# ============================================================================

@bp.route('/csrf-token', methods=['GET'])
def get_csrf_token_endpoint():
    """
    Get CSRF token for frontend requests.

    SECURITY FIX (P1-SEC-3): httpOnly double-submit pattern
    - Token stored in Flask session (httpOnly cookie) by Flask-WTF
    - Token returned in response body for frontend to send in headers
    - No non-httpOnly cookie needed (prevents XSS token theft)
    - Flask-WTF validates header token against session token
    """
    try:
        token = get_csrf_token()

        if not token:
            # If CSRF is not available, generate a simple token for compatibility
            token = secrets.token_urlsafe(32)

        # Return token in response body only (no non-httpOnly cookie)
        # Frontend will store this in memory and send in X-CSRF-Token header
        # Flask-WTF validates header against its session (httpOnly cookie)
        return jsonify({
            'csrf_token': token
        }), 200

    except Exception as e:
        logger.error(f"Error generating CSRF token: {str(e)}")
        return jsonify({'error': 'Failed to generate CSRF token'}), 500
