"""
Login Module - Diagnostics

Token compatibility checking for the Safari/iOS header-auth fallback.

The former `/cookie-debug` endpoint lived here too. It was removed in the
2026-08 audit remediation (SEC-02): unauthenticated, it disclosed FLASK_ENV,
the cookie secure/samesite/domain settings and FRONTEND_URL, and nothing
called it. `/token-health` below answers the operational question ("is my
auth reaching the server, over which transport") without disclosing config.
"""

from flask import request, jsonify
from utils.session_manager import session_manager

from utils.logger import get_logger

logger = get_logger(__name__)


def register_routes(bp):
    """Register routes on the blueprint."""
    @bp.route('/token-health', methods=['GET'])
    def token_health():
        """
        Check if current tokens are compatible with server secret.
        Used by frontend to detect token incompatibility after deployments.

        Supports both authentication methods:
        - Authorization header (Safari/iOS/Firefox)
        - httpOnly cookies (Chrome and other browsers)
        """
        try:
            token = None
            auth_method = None

            # Try Authorization header first (Safari/iOS/Firefox use this)
            auth_header = request.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                token = auth_header.replace('Bearer ', '')
                auth_method = 'header'

            # Fall back to httpOnly cookie (Chrome and other browsers use this)
            if not token:
                cookie_token = request.cookies.get('access_token')
                if cookie_token:
                    token = cookie_token
                    auth_method = 'cookie'

            # No token found via either method
            if not token:
                return jsonify({
                    'compatible': False,
                    'reason': 'No token provided',
                    'authenticated': False
                }), 200

            # Verify token with current and previous keys
            payload = session_manager.verify_access_token(token)

            if payload:
                # Token is valid
                token_version = payload.get('version', 'unknown')
                return jsonify({
                    'compatible': True,
                    'authenticated': True,
                    'token_version': token_version,
                    'server_version': session_manager.token_version,
                    'auth_method': auth_method,
                    'using_old_key': False
                }), 200
            else:
                # Token is invalid
                return jsonify({
                    'compatible': False,
                    'reason': 'Token invalid or expired',
                    'authenticated': False,
                    'auth_method': auth_method,
                    'server_version': session_manager.token_version
                }), 200

        except Exception as e:
            logger.error(f"[TOKEN_HEALTH] Error checking token health: {str(e)}")
            return jsonify({
                'compatible': False,
                'reason': 'Server error',
                'authenticated': False
            }), 200
