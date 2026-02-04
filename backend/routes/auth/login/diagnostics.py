"""
Login Module - Diagnostics

Cookie debugging and Safari/iOS compatibility.
"""

from flask import request, jsonify, make_response
from database import get_supabase_client, get_supabase_admin_client
from utils.session_manager import session_manager
from middleware.rate_limiter import rate_limit
from utils.log_scrubber import mask_user_id, mask_email
from middleware.error_handler import ValidationError, AuthenticationError
from datetime import datetime, timedelta, timezone
import os
import time
import random

from utils.logger import get_logger
from config.constants import MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MINUTES
from utils.api_response_v1 import success_response, error_response
from utils.retry_handler import with_connection_retry

from .security import (
    constant_time_delay,
    check_account_lockout,
    record_failed_login,
    reset_login_attempts,
    ensure_user_diploma_and_skills
)

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


    @bp.route('/cookie-debug', methods=['GET'])
    def cookie_debug():
        """
        Enhanced debug endpoint to diagnose cookie issues (especially Safari).
        Returns comprehensive information about cookies, headers, and auth state.
        SECURITY: This endpoint does NOT expose cookie values, only metadata.
        """
        try:
            # Get all cookie names (not values for security)
            received_cookies = list(request.cookies.keys())

            # Check for auth cookies specifically
            has_access_token = 'access_token' in request.cookies
            has_refresh_token = 'refresh_token' in request.cookies
            has_csrf_token = 'csrf_token' in request.cookies

            # Get Authorization header status
            auth_header = request.headers.get('Authorization', '')
            has_auth_header = auth_header.startswith('Bearer ')

            # Token analysis (without exposing values)
            token_info = {}
            if has_auth_header:
                token = auth_header.replace('Bearer ', '')
                payload = session_manager.verify_access_token(token)
                if payload:
                    token_info = {
                        'valid': True,
                        'type': payload.get('type'),
                        'version': payload.get('version'),
                        'expires_at': datetime.fromtimestamp(payload.get('exp')).isoformat() if payload.get('exp') else None,
                        'issued_at': datetime.fromtimestamp(payload.get('iat')).isoformat() if payload.get('iat') else None,
                    }
                else:
                    token_info = {'valid': False, 'reason': 'Invalid or expired'}

            # Get browser info from User-Agent
            user_agent = request.headers.get('User-Agent', 'Unknown')
            is_safari = 'Safari' in user_agent and 'Chrome' not in user_agent
            is_ios = 'iPhone' in user_agent or 'iPad' in user_agent or 'iPod' in user_agent
            is_mobile = 'Mobile' in user_agent or is_ios

            # Detailed browser detection
            browser_details = {
                'user_agent': user_agent,
                'is_safari': is_safari,
                'is_ios': is_ios,
                'is_mobile': is_mobile,
                'is_chrome': 'Chrome' in user_agent and 'Edge' not in user_agent,
                'is_firefox': 'Firefox' in user_agent,
                'is_edge': 'Edge' in user_agent,
            }

            # Check if user is authenticated
            user_id = session_manager.get_current_user_id()
            is_authenticated = user_id is not None
            auth_method = None
            if is_authenticated:
                if has_auth_header:
                    auth_method = 'Authorization header (Safari/iOS compatible)'
                elif has_access_token:
                    auth_method = 'httpOnly cookie (desktop browsers)'

            # Server configuration
            server_config = {
                'cross_origin_mode': session_manager.is_cross_origin,
                'cookie_secure': session_manager.cookie_secure,
                'cookie_samesite': session_manager.cookie_samesite,
                'cookie_domain': session_manager.cookie_domain,
                'frontend_url': os.getenv('FRONTEND_URL', 'Not configured'),
                'backend_url': request.host_url,
                'environment': os.getenv('FLASK_ENV', 'Not set'),
                'partitioned_cookies_enabled': session_manager.is_cross_origin,
            }

            # Request details
            request_details = {
                'method': request.method,
                'path': request.path,
                'remote_addr': request.remote_addr,
                'scheme': request.scheme,
                'host': request.host,
            }

            # All headers (for debugging)
            all_headers = dict(request.headers)

            # Detailed diagnostic results
            diagnostics = {
                'timestamp': datetime.utcnow().isoformat(),
                'summary': generate_diagnostic_summary(
                    is_safari, is_ios, has_access_token, has_auth_header, is_authenticated
                ),
                'cookies_received': {
                    'count': len(received_cookies),
                    'names': received_cookies,
                    'has_access_token': has_access_token,
                    'has_refresh_token': has_refresh_token,
                    'has_csrf_token': has_csrf_token,
                    'explanation': 'Cookie presence indicates browser is not blocking cookies'
                },
                'headers': {
                    'has_authorization': has_auth_header,
                    'token_info': token_info if has_auth_header else None,
                    'origin': request.headers.get('Origin', 'Not present'),
                    'referer': request.headers.get('Referer', 'Not present'),
                    'all_headers': all_headers,
                    'explanation': 'Authorization header is Safari/iOS fallback when cookies blocked'
                },
                'browser': browser_details,
                'authentication': {
                    'is_authenticated': is_authenticated,
                    'auth_method': auth_method,
                    'user_id_present': user_id is not None,
                    'explanation': 'System supports both cookie and header-based auth'
                },
                'server_config': server_config,
                'request_details': request_details,
                'recommendations': get_safari_recommendations(
                    is_safari or is_ios,
                    has_access_token,
                    has_auth_header,
                    is_authenticated
                )
            }

            # Log diagnostic request
            logger.info(f"[COOKIE_DEBUG] Request from {browser_details['user_agent'][:50]}... | Auth: {is_authenticated} via {auth_method} | Safari: {is_safari} | iOS: {is_ios}")

            return jsonify(diagnostics), 200

        except Exception as e:
            logger.error(f"[COOKIE_DEBUG] Error: {str(e)}")
            import traceback
            return jsonify({
                'error': 'Failed to generate debug info',
                'message': str(e),
                'traceback': traceback.format_exc() if os.getenv('FLASK_ENV') == 'development' else None
            }), 500


    def generate_diagnostic_summary(is_safari, is_ios, has_cookie, has_header, is_authenticated):
        """Generate a human-readable diagnostic summary"""
        if not is_authenticated:
            return "Not authenticated - please log in to test authentication method"

        if is_safari or is_ios:
            if has_cookie and has_header:
                return "Safari/iOS: Both cookies AND headers working (ideal state)"
            elif has_header and not has_cookie:
                return "Safari/iOS: Cookies blocked, using Authorization header fallback (working correctly)"
            elif has_cookie and not has_header:
                return "Safari/iOS: Using cookies (unexpected - Safari usually blocks cross-origin cookies)"
            else:
                return "Safari/iOS: WARNING - Neither cookies nor headers detected (check frontend implementation)"
        else:
            if has_cookie:
                return "Desktop browser: Using httpOnly cookies (standard method)"
            elif has_header:
                return "Desktop browser: Using Authorization headers (works but cookies preferred)"
            else:
                return "WARNING: Authenticated but no auth method detected (should not happen)"

