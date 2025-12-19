"""
Authentication Module: Password Management

Handles:
- Forgot password (send reset email)
- Reset password (validate token and update password)
- Password strength validation
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_client, get_supabase_admin_client
from utils.validation import sanitize_input, validate_password
from middleware.rate_limiter import rate_limit
from utils.log_scrubber import mask_email, mask_user_id, should_log_sensitive_data
from middleware.error_handler import ValidationError
from services.email_service import email_service
import re
import os
import secrets
from datetime import datetime, timedelta

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('auth_password', __name__)


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def reset_login_attempts(email):
    """
    Reset login attempts after password reset.
    (Imported from login module logic)
    """
    try:
        admin_client = get_supabase_admin_client()

        admin_client.table('login_attempts').update({
            'attempt_count': 0,
            'locked_until': None,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('email', email.lower()).execute()

    except Exception as e:
        logger.error(f"Error resetting login attempts: {e}")


# ============================================================================
# ENDPOINTS
# ============================================================================

@bp.route('/forgot-password', methods=['POST'])
@rate_limit(max_requests=3, window_seconds=3600)  # 3 requests per hour per IP
def forgot_password():
    """
    Request password reset email using custom EmailService.
    Returns success message regardless of whether email exists (security best practice).
    """
    try:
        logger.info("[FORGOT_PASSWORD] === Starting password reset request ===")
        data = request.json
        email = data.get('email')

        if should_log_sensitive_data():
            logger.debug(f"[FORGOT_PASSWORD] Received request for email: {mask_email(email)}")

        if not email:
            logger.warning("[FORGOT_PASSWORD] No email provided")
            return jsonify({'error': 'Email is required'}), 400

        # Sanitize email input
        email = sanitize_input(email.lower().strip())

        if should_log_sensitive_data():
            logger.debug(f"[FORGOT_PASSWORD] Sanitized email: {mask_email(email)}")

        # Validate email format
        email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_regex, email):
            logger.warning(f"[FORGOT_PASSWORD] Invalid email format: {mask_email(email)}")
            return jsonify({'error': 'Invalid email format'}), 400

        admin_client = get_supabase_admin_client()
        logger.info("[FORGOT_PASSWORD] Got admin client")

        # Check if user exists in auth.users
        if should_log_sensitive_data():
            logger.debug(f"[FORGOT_PASSWORD] Looking up user in auth.users: {mask_email(email)}")

        try:
            # Use Admin API to find user by email
            if should_log_sensitive_data():
                logger.debug(f"[FORGOT_PASSWORD] Looking up user by email using Admin API: {mask_email(email)}")

            # First check public.users table for the user_id
            public_user = admin_client.table('users').select('id').eq('email', email).execute()

            matching_user = None
            if public_user.data and len(public_user.data) > 0:
                # Found in public.users, get full auth user object
                user_id = public_user.data[0]['id']
                logger.info(f"[FORGOT_PASSWORD] Found user_id in public.users: {user_id}")
                auth_user_obj = admin_client.auth.admin.get_user_by_id(user_id)
                if auth_user_obj and auth_user_obj.user:
                    matching_user = auth_user_obj.user
                    logger.info(f"[FORGOT_PASSWORD] Successfully retrieved auth user object")
        except Exception as lookup_err:
            logger.error(f"[FORGOT_PASSWORD] Error during user lookup: {str(lookup_err)}")
            matching_user = None

        logger.info(f"[FORGOT_PASSWORD] Auth user lookup result: {'Found' if matching_user else 'Not found'}")

        if matching_user:
            user_id = matching_user.id

            # Get display name from public.users for personalization
            profile_check = admin_client.table('users').select('display_name, first_name').eq('id', user_id).execute()
            if profile_check.data:
                user_name = profile_check.data[0].get('display_name') or profile_check.data[0].get('first_name') or 'there'
            else:
                user_name = 'there'

            logger.info(f"[FORGOT_PASSWORD] Found user: {mask_user_id(user_id)}, name: {user_name}, auth email: {mask_email(matching_user.email)}")

            try:
                # Generate secure token
                logger.info("[FORGOT_PASSWORD] Generating reset token")
                reset_token = secrets.token_urlsafe(32)
                expires_at = datetime.utcnow() + timedelta(hours=24)
                logger.info(f"[FORGOT_PASSWORD] Token generated, expires at: {expires_at.isoformat()}")

                # Store token in database
                logger.info("[FORGOT_PASSWORD] Storing token in database")
                token_result = admin_client.table('password_reset_tokens').insert({
                    'user_id': user_id,
                    'token': reset_token,
                    'expires_at': expires_at.isoformat(),
                    'used': False,
                    'created_at': datetime.utcnow().isoformat()
                }).execute()
                logger.info(f"[FORGOT_PASSWORD] Token stored successfully: {token_result.data}")

                # Generate reset link
                frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
                reset_link = f"{frontend_url}/reset-password?token={reset_token}"
                logger.info(f"[FORGOT_PASSWORD] Generated reset link: {reset_link[:50]}...")

                # Send email to the auth.users email (source of truth)
                auth_email = matching_user.email
                logger.info(f"[FORGOT_PASSWORD] Calling email_service.send_password_reset_email()")
                logger.info(f"[FORGOT_PASSWORD] Email params: user_email={auth_email}, user_name={user_name}, expiry_hours=24")

                email_sent = email_service.send_password_reset_email(
                    user_email=auth_email,
                    user_name=user_name,
                    reset_link=reset_link,
                    expiry_hours=24
                )

                logger.info(f"[FORGOT_PASSWORD] Email send result: {email_sent}")

                if email_sent:
                    logger.info(f"[FORGOT_PASSWORD] ✓ Password reset email SUCCESSFULLY sent to {mask_email(auth_email)}")
                else:
                    logger.error(f"[FORGOT_PASSWORD] ✗ FAILED to send email to {mask_email(auth_email)}")

            except Exception as reset_error:
                logger.error(f"[FORGOT_PASSWORD] ✗ Exception during reset token generation or email send: {str(reset_error)}")
                logger.error(f"[FORGOT_PASSWORD] Exception type: {type(reset_error).__name__}")
                import traceback
                logger.error(f"[FORGOT_PASSWORD] Traceback: {traceback.format_exc()}")
                # Still return success to avoid revealing user existence
        else:
            logger.info(f"[FORGOT_PASSWORD] No user found with email: {mask_email(email)}")
    except Exception as lookup_error:
        logger.error(f"[FORGOT_PASSWORD] Error looking up user in auth.users: {str(lookup_error)}")

        # Always return success message (don't reveal if email exists or not)
        logger.info("[FORGOT_PASSWORD] === Returning success response ===")
        return jsonify({
            'message': 'If an account exists with this email, you will receive password reset instructions shortly.',
            'note': 'Please check your spam folder if you don\'t see the email within a few minutes.'
        }), 200

    except Exception as e:
        logger.error(f"[FORGOT_PASSWORD] ✗ Top-level exception: {str(e)}")
        logger.error(f"[FORGOT_PASSWORD] Exception type: {type(e).__name__}")
        import traceback
        logger.error(f"[FORGOT_PASSWORD] Traceback: {traceback.format_exc()}")

    # Always return success message (don't reveal if email exists or not)
    logger.info("[FORGOT_PASSWORD] === Returning success response ===")
    return jsonify({
        'message': 'If an account exists with this email, you will receive password reset instructions shortly.',
        'note': 'Please check your spam folder if you don\'t see the email within a few minutes.'
    }), 200


@bp.route('/reset-password', methods=['POST'])
def reset_password():
    """
    Reset password using custom token from email link.
    Validates new password and updates user account.
    """
    try:
        data = request.json
        reset_token = data.get('token')  # Token from URL query param
        new_password = data.get('new_password')

        if not reset_token or not new_password:
            return jsonify({'error': 'Reset token and new password are required'}), 400

        # Validate password strength
        is_valid, error_message = validate_password(new_password)
        if not is_valid:
            return jsonify({'error': error_message}), 400

        admin_client = get_supabase_admin_client()

        try:
            # Verify token exists and is not expired or used
            token_check = admin_client.table('password_reset_tokens')\
                .select('*')\
                .eq('token', reset_token)\
                .eq('used', False)\
                .execute()

            if not token_check.data:
                return jsonify({
                    'error': 'Invalid or already used reset token. Please request a new password reset.'
                }), 400

            token_data = token_check.data[0]
            expires_at = datetime.fromisoformat(token_data['expires_at'].replace('Z', '+00:00'))

            # Check if token is expired
            if datetime.now(expires_at.tzinfo) > expires_at:
                return jsonify({
                    'error': 'Reset link has expired. Please request a new password reset.'
                }), 400

            user_id = token_data['user_id']

            # Get user from auth.users (source of truth for authentication)
            auth_user = admin_client.auth.admin.get_user_by_id(user_id)
            if not auth_user or not auth_user.user:
                return jsonify({'error': 'User not found'}), 404

            auth_email = auth_user.user.email
            logger.info(f"[RESET_PASSWORD] Found user in auth.users: {mask_email(auth_email)}")

            # Update password using Supabase Admin API
            supabase_client = get_supabase_client()
            auth_response = admin_client.auth.admin.update_user_by_id(
                user_id,
                {'password': new_password}
            )

            if not auth_response:
                return jsonify({'error': 'Failed to update password'}), 500

            # Sync email in public.users to match auth.users (prevent future mismatches)
            try:
                profile_check = admin_client.table('users').select('email').eq('id', user_id).execute()
                if profile_check.data:
                    current_profile_email = profile_check.data[0]['email']
                    if current_profile_email.lower() != auth_email.lower():
                        logger.warning(f"[RESET_PASSWORD] Email mismatch detected: auth={mask_email(auth_email)}, profile={mask_email(current_profile_email)}")
                        logger.info(f"[RESET_PASSWORD] Syncing profile email to match auth.users")
                        admin_client.table('users').update({
                            'email': auth_email
                        }).eq('id', user_id).execute()
            except Exception as sync_error:
                # Don't fail password reset if email sync fails, just log it
                logger.error(f"[RESET_PASSWORD] Warning: Failed to sync email in public.users: {sync_error}")

            # Mark token as used
            admin_client.table('password_reset_tokens')\
                .update({'used': True, 'used_at': datetime.utcnow().isoformat()})\
                .eq('token', reset_token)\
                .execute()

            # Clear any account lockouts for this user
            reset_login_attempts(auth_email)

            logger.info(f"[RESET_PASSWORD] Password successfully reset for {mask_email(auth_email)}")

            return jsonify({
                'message': 'Password reset successful. You can now login with your new password.',
                'redirect': '/login'
            }), 200

        except Exception as auth_error:
            logger.error(f"[RESET_PASSWORD] Error: {str(auth_error)}")
            return jsonify({
                'error': 'Failed to reset password. Please try again or request a new reset link.'
            }), 500

    except ValidationError as ve:
        return jsonify({'error': str(ve)}), 400
    except Exception as e:
        logger.error(f"[RESET_PASSWORD] Error: {str(e)}")
        return jsonify({'error': 'An error occurred while resetting your password'}), 500
