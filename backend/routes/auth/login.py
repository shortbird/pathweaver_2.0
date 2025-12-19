"""
Authentication Module: Login & Session Management

Handles:
- User login with account lockout protection
- Session validation (/me endpoint)
- Token refresh
- Logout with session invalidation
- Token health checking
- Cookie debugging (Safari/iOS compatibility)
"""

from flask import Blueprint, request, jsonify, make_response
from database import get_supabase_client, get_supabase_admin_client
from utils.session_manager import session_manager
from middleware.rate_limiter import rate_limit
from utils.log_scrubber import mask_user_id, mask_email
from middleware.error_handler import ValidationError, AuthenticationError
from datetime import datetime, timedelta
import os

from utils.logger import get_logger
from backend.config.constants import MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MINUTES

logger = get_logger(__name__)

bp = Blueprint('auth_login', __name__)


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def check_account_lockout(email):
    """
    Check if account is locked due to too many failed attempts.
    Returns (is_locked, retry_after_seconds, attempt_count)
    """
    try:
        admin_client = get_supabase_admin_client()

        # Get login attempt record
        result = admin_client.table('login_attempts')\
            .select('*')\
            .eq('email', email.lower())\
            .execute()

        if not result.data:
            return False, 0, 0

        record = result.data[0]
        locked_until = record.get('locked_until')
        attempt_count = record.get('attempt_count', 0)

        # Check if account is currently locked
        if locked_until:
            locked_until_dt = datetime.fromisoformat(locked_until.replace('Z', '+00:00'))
            now = datetime.now(locked_until_dt.tzinfo)

            if now < locked_until_dt:
                retry_after = int((locked_until_dt - now).total_seconds())
                return True, retry_after, attempt_count

        return False, 0, attempt_count

    except Exception as e:
        logger.error(f"Error checking account lockout: {e}")
        return False, 0, 0


def record_failed_login(email):
    """
    Record a failed login attempt and lock account if threshold is reached.
    Returns (is_now_locked, attempts_remaining, lockout_duration_minutes)
    """
    try:
        admin_client = get_supabase_admin_client()

        # Get current record
        result = admin_client.table('login_attempts')\
            .select('*')\
            .eq('email', email.lower())\
            .execute()

        if not result.data:
            # Create new record
            admin_client.table('login_attempts').insert({
                'email': email.lower(),
                'attempt_count': 1,
                'locked_until': None,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }).execute()
            return False, MAX_LOGIN_ATTEMPTS - 1, 0

        record = result.data[0]
        attempt_count = record.get('attempt_count', 0) + 1

        # Check if we should lock the account
        if attempt_count >= MAX_LOGIN_ATTEMPTS:
            locked_until = datetime.utcnow() + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
            admin_client.table('login_attempts').update({
                'attempt_count': attempt_count,
                'locked_until': locked_until.isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }).eq('email', email.lower()).execute()
            return True, 0, LOCKOUT_DURATION_MINUTES
        else:
            # Increment attempt count
            admin_client.table('login_attempts').update({
                'attempt_count': attempt_count,
                'updated_at': datetime.utcnow().isoformat()
            }).eq('email', email.lower()).execute()
            return False, MAX_LOGIN_ATTEMPTS - attempt_count, 0

    except Exception as e:
        logger.error(f"Error recording failed login: {e}")
        return False, 0, 0


def reset_login_attempts(email):
    """
    Reset login attempts after successful login.
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


def ensure_user_diploma_and_skills(supabase, user_id, first_name, last_name):
    """Ensure user has diploma and skill categories initialized - OPTIMIZED"""
    try:
        # Check if diploma exists for this user
        diploma_check = supabase.table('diplomas').select('id').eq('user_id', user_id).execute()

        if not diploma_check.data:
            # Generate unique slug with better collision handling
            import re
            base_slug = re.sub(r'[^a-zA-Z0-9]', '', first_name + last_name).lower()

            # Try to create diploma with increasingly unique slugs
            for counter in range(100):
                try:
                    check_slug = base_slug if counter == 0 else f"{base_slug}{counter}"

                    # Try to insert directly - let database handle uniqueness
                    supabase.table('diplomas').insert({
                        'user_id': user_id,
                        'portfolio_slug': check_slug
                    }).execute()

                    # If successful, we're done
                    break

                except Exception as insert_error:
                    # If it's a duplicate key error, try next slug
                    if '23505' in str(insert_error) or 'duplicate' in str(insert_error).lower():
                        continue
                    else:
                        # Some other error - log it but don't fail
                        logger.error(f"Error creating diploma: {str(insert_error)}")
                        break

        # Batch insert all skill categories at once instead of checking each one
        skill_categories = ['Arts & Creativity', 'STEM & Logic', 'Life & Wellness',
                           'Language & Communication', 'Society & Culture']

        # Build all skill records to insert
        skill_records = [
            {
                'user_id': user_id,
                'pillar': pillar,
                'xp_amount': 0
            }
            for pillar in skill_categories
        ]

        # Try to insert all at once, ignore conflicts (if they already exist)
        try:
            supabase.table('user_skill_xp').upsert(skill_records, on_conflict='user_id,pillar').execute()
        except Exception as skill_error:
            # If batch insert fails, fall back to individual inserts
            logger.error(f"Batch skill insert failed: {str(skill_error)}, trying individual inserts")
            for record in skill_records:
                try:
                    supabase.table('user_skill_xp').insert(record).execute()
                except:
                    pass  # Skill already exists

    except Exception as e:
        logger.error(f"Error ensuring diploma and skills: {str(e)}")
        # Don't fail registration if this fails - the database trigger should handle it


# ============================================================================
# ENDPOINTS
# ============================================================================

@bp.route('/me', methods=['GET'])
def get_current_user():
    """Get current user profile with fresh data"""
    try:
        # Use get_effective_user_id() to return masquerade target if masquerading
        # This ensures frontend sees the masqueraded user's role and data
        user_id = session_manager.get_effective_user_id()

        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401

        # Use admin client to bypass RLS and get fresh data
        admin_client = get_supabase_admin_client()

        try:
            # Fetch complete user profile
            user_data = admin_client.table('users').select('*').eq('id', user_id).single().execute()

            if user_data.data:
                return jsonify(user_data.data), 200
            else:
                return jsonify({'error': 'User profile not found'}), 404

        except Exception as e:
            logger.error(f"Error fetching user data: {e}")
            return jsonify({'error': 'Failed to fetch user profile'}), 500

    except Exception as e:
        logger.error(f"Unexpected error in /me endpoint: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@bp.route('/login', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=60)  # 5 login attempts per minute
def login():
    data = request.json
    supabase = get_supabase_client()

    # Validate input
    if not data or not data.get('email') or not data.get('password'):
        logger.warning("Login attempt with missing email or password")
        return jsonify({'error': 'Email and password are required'}), 400

    email = data['email'].strip().lower()

    # Log login attempt with masked email
    logger.info(f"Login attempt for email: {mask_email(email)}")

    # Check if account is locked due to too many failed attempts
    is_locked, retry_after, attempt_count = check_account_lockout(email)
    if is_locked:
        minutes_remaining = retry_after // 60
        logger.warning(f"Login blocked for locked account: {mask_email(email)} ({minutes_remaining} minutes remaining)")
        return jsonify({
            'error': f'Account temporarily locked due to too many failed login attempts. Please try again in {minutes_remaining} minutes or use "Forgot Password?" to reset your password.',
            'retry_after': retry_after,
            'locked': True
        }), 429

    try:
        auth_response = supabase.auth.sign_in_with_password({
            'email': email,
            'password': data['password']
        })

        if auth_response.user and auth_response.session:
            # Use admin client to fetch user data (bypasses RLS for login)
            admin_client = get_supabase_admin_client()

            # Fetch user data with admin client
            try:
                user_data = admin_client.table('users').select('*').eq('id', auth_response.user.id).single().execute()
            except Exception as e:
                # If user profile doesn't exist, create it
                error_str = str(e)
                if 'rows' in error_str or 'single' in error_str:
                    from legal_versions import CURRENT_TOS_VERSION, CURRENT_PRIVACY_POLICY_VERSION
                    # Check if this is a recently created user
                    is_new_user = False
                    if hasattr(auth_response.user, 'created_at'):
                        from datetime import timezone
                        created_time = auth_response.user.created_at
                        if isinstance(created_time, str):
                            created_time = datetime.fromisoformat(created_time.replace('Z', '+00:00'))
                        is_new_user = (datetime.now(timezone.utc) - created_time) < timedelta(hours=1)

                    profile_data = {
                        'id': auth_response.user.id,
                        'first_name': auth_response.user.user_metadata.get('first_name', 'User'),
                        'last_name': auth_response.user.user_metadata.get('last_name', ''),
                        'email': auth_response.user.email,
                        'created_at': 'now()'
                    }

                    # If this is a new user, assume they accepted ToS during registration
                    if is_new_user:
                        profile_data['tos_accepted_at'] = 'now()'
                        profile_data['privacy_policy_accepted_at'] = 'now()'
                        profile_data['tos_version'] = CURRENT_TOS_VERSION
                        profile_data['privacy_policy_version'] = CURRENT_PRIVACY_POLICY_VERSION

                    user_data = admin_client.table('users').insert(profile_data).execute()

                    # Ensure diploma and skills
                    ensure_user_diploma_and_skills(
                        admin_client,
                        auth_response.user.id,
                        auth_response.user.user_metadata.get('first_name', 'User'),
                        auth_response.user.user_metadata.get('last_name', '')
                    )
                else:
                    raise

            # Ensure user has diploma and skills initialized
            try:
                if user_data.data:
                    user_record = user_data.data[0] if isinstance(user_data.data, list) else user_data.data

                    ensure_user_diploma_and_skills(
                        admin_client,
                        auth_response.user.id,
                        user_record.get('first_name', 'User'),
                        user_record.get('last_name', '')
                    )
            except Exception as diploma_error:
                logger.error(f"Non-critical: Failed to ensure diploma/skills during login: {diploma_error}")

            # Normalize user data
            user_response_data = user_data.data
            if isinstance(user_response_data, list):
                user_response_data = user_response_data[0] if user_response_data else None

            # Reset login attempts after successful login
            reset_login_attempts(email)

            # Log successful login
            logger.info(f"Successful login for {mask_email(email)} (user_id: {mask_user_id(auth_response.user.id)})")

            # Update last_active timestamp
            try:
                admin_client.table('users').update({
                    'last_active': datetime.utcnow().isoformat()
                }).eq('id', auth_response.user.id).execute()
            except Exception as update_error:
                logger.error(f"Warning: Failed to update last_active timestamp: {update_error}")

            # Trigger email_confirmed event for automation sequences (only once)
            if auth_response.user.email_confirmed_at and not user_response_data.get('welcome_email_sent'):
                try:
                    from services.campaign_automation_service import CampaignAutomationService
                    automation_service = CampaignAutomationService()
                    automation_service.process_event_trigger(
                        event_type='email_confirmed',
                        user_id=auth_response.user.id,
                        metadata={'email': auth_response.user.email}
                    )
                    # Mark welcome email as sent
                    admin_client.table('users').update({
                        'welcome_email_sent': True
                    }).eq('id', auth_response.user.id).execute()
                    logger.info(f"Triggered email_confirmed event for user {mask_user_id(auth_response.user.id)}")
                except Exception as automation_error:
                    logger.error(f"Warning: Failed to process email_confirmed event: {automation_error}")

            # Generate app tokens for Authorization header usage (Safari compatibility)
            app_access_token = session_manager.generate_access_token(auth_response.user.id)
            app_refresh_token = session_manager.generate_refresh_token(auth_response.user.id)

            response_data = {
                'user': user_response_data,
                'app_access_token': app_access_token,
                'app_refresh_token': app_refresh_token,
            }
            response = make_response(jsonify(response_data), 200)

            # Set httpOnly cookies for authentication (fallback for desktop browsers)
            session_manager.set_auth_cookies(response, auth_response.user.id)

            return response
        else:
            logger.warning(f"Login failed for {mask_email(email)} without exception - auth_response.user is None")
            return jsonify({'error': 'Incorrect email or password. Please check your credentials and try again.'}), 401

    except Exception as e:
        error_message = str(e)

        # Log with context for debugging
        logger.error(f"Login error for {mask_email(email)}: {error_message}", extra={
            'email_masked': mask_email(email),
            'error_type': type(e).__name__,
        })

        # Parse error for specific cases
        error_lower = error_message.lower()

        if "invalid login credentials" in error_lower or "invalid credentials" in error_lower:
            # Record failed login attempt
            is_now_locked, attempts_remaining, lockout_minutes = record_failed_login(email)

            if is_now_locked:
                logger.warning(f"Account locked for {mask_email(email)} after too many failed attempts")
                return jsonify({
                    'error': f'Too many failed login attempts. Your account has been temporarily locked for {lockout_minutes} minutes. Please try again later or use "Forgot Password" to reset your password.',
                    'locked': True,
                    'lockout_duration': lockout_minutes
                }), 429
            else:
                logger.info(f"Invalid credentials for {mask_email(email)}: {attempts_remaining} attempts remaining")
                # Provide more helpful error message based on attempts remaining
                if attempts_remaining <= 2:
                    return jsonify({
                        'error': f'Incorrect email or password. You have {attempts_remaining} {"attempt" if attempts_remaining == 1 else "attempts"} remaining before your account is temporarily locked. If you forgot your password, click "Forgot Password?" below.',
                        'attempts_remaining': attempts_remaining,
                        'warning': True
                    }), 401
                else:
                    return jsonify({
                        'error': f'Incorrect email or password. Please check your credentials and try again. ({attempts_remaining} {"attempt" if attempts_remaining == 1 else "attempts"} remaining)',
                        'attempts_remaining': attempts_remaining
                    }), 401
        elif "email not confirmed" in error_lower or "email confirmation" in error_lower:
            logger.info(f"Login attempt with unconfirmed email: {mask_email(email)}")
            return jsonify({
                'error': 'Please verify your email address before logging in. Check your inbox (and spam folder) for a confirmation email. If you need a new verification email, contact support.',
                'email_not_confirmed': True
            }), 401
        elif "user not found" in error_lower:
            # Record failed login attempt even for non-existent users
            record_failed_login(email)
            logger.info(f"Login attempt with non-existent email: {mask_email(email)}")
            return jsonify({
                'error': 'No account found with this email address. Please check your email spelling or create a new account.',
                'user_not_found': True
            }), 401
        elif "rate limit" in error_lower or "too many requests" in error_lower:
            logger.warning(f"Rate limit hit for {mask_email(email)}")
            import re
            wait_match = re.search(r'after (\d+) seconds', error_message)
            if wait_match:
                wait_time = wait_match.group(1)
                return jsonify({'error': f'Too many login attempts. Please wait {wait_time} seconds before trying again.'}), 429
            else:
                return jsonify({'error': 'Too many login attempts. Please wait a minute before trying again.'}), 429
        else:
            logger.warning(f"Unhandled login error for {mask_email(email)}: {error_message}")
            return jsonify({
                'error': 'Login failed. Please check your email and password. If you continue having trouble, try using "Forgot Password?" or contact support.',
                'generic_error': True
            }), 400


@bp.route('/logout', methods=['POST'])
def logout():
    # Always clear cookies even if token is invalid or missing
    token = request.cookies.get('access_token')
    if not token:
        token = request.headers.get('Authorization', '').replace('Bearer ', '')

    supabase = get_supabase_client()

    # Get user ID for session invalidation
    user_id = session_manager.get_current_user_id()

    try:
        # Invalidate all tokens by recording logout timestamp
        if user_id:
            admin_client = get_supabase_admin_client()
            admin_client.table('users').update({
                'last_logout_at': datetime.utcnow().isoformat()
            }).eq('id', user_id).execute()
            logger.info(f"[LOGOUT] Invalidated all tokens for user {mask_user_id(user_id)} via last_logout_at timestamp")

        # Attempt to sign out from Supabase if token exists
        if token:
            try:
                supabase.auth.sign_out()
            except Exception as signout_error:
                logger.warning(f"Supabase sign out failed during logout: {signout_error}")

        # ALWAYS clear cookies regardless of token validity
        response = make_response(jsonify({'message': 'Logged out successfully'}), 200)

        # Clear authentication cookies
        session_manager.clear_auth_cookies(response)

        # Clear Supabase cookies only in same-origin mode
        if not session_manager.is_cross_origin:
            response.set_cookie('supabase_access_token', '', expires=0, httponly=True, secure=session_manager.cookie_secure, samesite=session_manager.cookie_samesite, partitioned=session_manager.is_cross_origin)
            response.set_cookie('supabase_refresh_token', '', expires=0, httponly=True, secure=session_manager.cookie_secure, samesite=session_manager.cookie_samesite, partitioned=session_manager.is_cross_origin)

        logger.info(f"[LOGOUT] User logged out successfully, cookies cleared")
        return response
    except Exception as e:
        # Even if there's an error, try to clear cookies
        logger.error(f"[LOGOUT] Error during logout: {e}")
        response = make_response(jsonify({'message': 'Logged out (with errors)'}), 200)
        session_manager.clear_auth_cookies(response)
        return response


@bp.route('/refresh', methods=['POST'])
def refresh_token():
    # Try to get refresh token from request body (primary method for cross-origin)
    data = request.json if request.json else {}
    refresh_token_input = data.get('refresh_token')

    # Use session manager with override if provided
    refresh_result = session_manager.refresh_session(refresh_token_override=refresh_token_input)

    if not refresh_result:
        logger.warning("Refresh token validation failed - token may be expired or invalid")
        return jsonify({'error': 'Your session has expired. Please log in again to continue.'}), 401

    new_access_token, new_refresh_token, user_id, token_issued_at = refresh_result

    # Check if token was issued before last logout
    try:
        admin_client = get_supabase_admin_client()
        user_data = admin_client.table('users').select('last_logout_at').eq('id', user_id).single().execute()

        if user_data.data and user_data.data.get('last_logout_at'):
            last_logout_at = datetime.fromisoformat(user_data.data['last_logout_at'].replace('Z', '+00:00'))

            # If token was issued before logout, reject it
            if token_issued_at < last_logout_at:
                logger.warning(f"[REFRESH] Rejecting token for user {mask_user_id(user_id)} - issued before logout")
                return jsonify({'error': 'Session invalidated. Please log in again.'}), 401

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

    # Return new tokens in response body
    response = make_response(jsonify({
        'message': 'Tokens refreshed successfully',
        'access_token': new_access_token,
        'refresh_token': new_refresh_token,
    }), 200)

    # Set httpOnly cookies for authentication
    session_manager.set_auth_cookies(response, user_id)

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


@bp.route('/token-health', methods=['GET'])
def token_health():
    """
    Check if current tokens are compatible with server secret.
    Used by frontend to detect token incompatibility after deployments.
    """
    try:
        # Check for Authorization header
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({
                'compatible': False,
                'reason': 'No token provided',
                'authenticated': False
            }), 200

        # Extract token
        token = auth_header.replace('Bearer ', '')

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
                'using_old_key': False
            }), 200
        else:
            # Token is invalid
            return jsonify({
                'compatible': False,
                'reason': 'Token invalid or expired',
                'authenticated': False,
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


def get_safari_recommendations(is_safari, has_cookie, has_header, is_authenticated):
    """Generate Safari-specific troubleshooting recommendations"""
    recommendations = []

    if is_safari and not has_cookie and not has_header:
        recommendations.append({
            'issue': 'Safari is blocking cookies and no Authorization header detected',
            'solution': 'Frontend should automatically use Authorization headers. Check browser console for errors.',
            'action': 'Try logging out and logging back in to refresh authentication method.'
        })
    elif is_safari and not has_cookie and has_header:
        recommendations.append({
            'issue': 'Safari is blocking cookies (expected behavior)',
            'solution': 'Using Authorization header fallback - this is working correctly!',
            'action': 'No action needed. System is functioning normally with Safari.'
        })
    elif is_safari and has_cookie:
        recommendations.append({
            'issue': 'None - cookies are working in Safari',
            'solution': 'Your Safari browser is accepting cookies. System is functioning normally.',
            'action': 'No action needed.'
        })
    elif not is_authenticated:
        recommendations.append({
            'issue': 'Not authenticated',
            'solution': 'Please log in to access protected resources.',
            'action': 'Navigate to the login page.'
        })
    else:
        recommendations.append({
            'issue': 'None detected',
            'solution': 'System is functioning normally.',
            'action': 'No action needed.'
        })

    return recommendations
