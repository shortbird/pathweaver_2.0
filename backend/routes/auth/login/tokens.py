"""
Login Module - Token Management

Token refresh and health checking.
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
    @bp.route('/refresh', methods=['POST'])
    def refresh_token():
        # Try to get refresh token from request body (primary method for cross-origin)
        data = request.json if request.json else {}
        refresh_token_input = data.get('refresh_token')

        # Use session manager with override if provided
        refresh_result = session_manager.refresh_session(refresh_token_override=refresh_token_input)

        if not refresh_result:
            logger.warning("Refresh token validation failed - token may be expired or invalid")
            return error_response(
                code='SESSION_EXPIRED',
                message='Your session has expired. Please log in again to continue.',
                status=401
            )

        new_access_token, new_refresh_token, user_id, token_issued_at = refresh_result

        # Check if token was issued before last logout (with retry for connection failures)
        try:
            admin_client = get_supabase_admin_client()
            user_data = with_connection_retry(
                lambda: admin_client.table('users').select('last_logout_at').eq('id', user_id).single().execute(),
                operation_name='refresh_check_logout'
            )

            if user_data.data and user_data.data.get('last_logout_at'):
                last_logout_at = datetime.fromisoformat(user_data.data['last_logout_at'].replace('Z', '+00:00'))

                # If token was issued before logout, reject it
                if token_issued_at < last_logout_at:
                    logger.warning(f"[REFRESH] Rejecting token for user {mask_user_id(user_id)} - issued before logout")
                    return error_response(
                        code='SESSION_INVALIDATED',
                        message='Session invalidated. Please log in again.',
                        status=401
                    )

        except Exception as logout_check_error:
            logger.error(f"Error checking last_logout_at: {logout_check_error}")

        # Update last_active timestamp on token refresh
        try:
            admin_client = get_supabase_admin_client()
            admin_client.table('users').update({
                'last_active': datetime.utcnow().isoformat()
            }).eq('id', user_id).execute()
        except Exception as update_error:
            logger.error(f"Warning: Failed to update last_active on token refresh: {update_error}")

        # Refresh Supabase session to get new Supabase access token
        supabase_refresh_token = request.cookies.get('supabase_refresh_token')
        supabase_access_token = None

        if supabase_refresh_token:
            try:
                supabase = get_supabase_client()
                auth_response = supabase.auth.refresh_session(supabase_refresh_token)
                if auth_response.session and auth_response.session.access_token:
                    supabase_access_token = auth_response.session.access_token
            except Exception as e:
                logger.error(f"Failed to refresh Supabase session: {str(e)}")

        # Return new tokens in response body (legacy format for frontend compatibility)
        # TODO: Migrate to standardized format after updating frontend
        response = make_response(jsonify({
            'message': 'Tokens refreshed successfully',
            'access_token': new_access_token,
            'refresh_token': new_refresh_token,
        }), 200)

        # Set httpOnly cookies for authentication
        # CRITICAL: Pass the same tokens to ensure consistency between cookies and response body
        # This fixes the 15-minute timeout bug where Chrome users get mismatched tokens
        session_manager.set_auth_cookies(response, user_id, new_access_token, new_refresh_token)

        # Also refresh Supabase access token cookie if we got one
        if supabase_access_token:
            response.set_cookie(
                'supabase_access_token',
                supabase_access_token,
                max_age=3600,  # 1 hour
                httponly=True,
                secure=session_manager.cookie_secure,
                samesite=session_manager.cookie_samesite,
                path='/',
                partitioned=session_manager.is_cross_origin
            )

        return response

