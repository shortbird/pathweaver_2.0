"""
Login Module - Core Authentication

Login, logout, and session validation endpoints.
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
    @bp.route('/me', methods=['GET'])
    def get_current_user():
        """Get current user profile with fresh data"""
        try:
            # Use get_effective_user_id() to return masquerade target if masquerading
            # This ensures frontend sees the masqueraded user's role and data
            user_id = session_manager.get_effective_user_id()

            if not user_id:
                return error_response(
                    code='AUTHENTICATION_REQUIRED',
                    message='Authentication required',
                    status=401
                )

            # CRITICAL FIX: Check if token was issued before last logout
            # This prevents automatic re-login after logout when token is still valid
            try:
                # Get token from either Authorization header or cookie
                token = None
                auth_header = request.headers.get('Authorization', '')
                if auth_header.startswith('Bearer '):
                    token = auth_header.replace('Bearer ', '')
                else:
                    # Try to get token from cookie
                    token = request.cookies.get('access_token')

                if token:
                    payload = session_manager.verify_access_token(token)

                    if payload and payload.get('iat'):
                        # Make token_issued_at timezone-aware (UTC) for comparison
                        token_issued_at = datetime.fromtimestamp(payload.get('iat'), tz=timezone.utc)

                        # Use admin client to check last logout with retry logic
                        admin_client = get_supabase_admin_client()
                        user_data = with_connection_retry(
                            lambda: admin_client.table('users').select('last_logout_at').eq('id', user_id).single().execute(),
                            operation_name='check_last_logout_at'
                        )

                        if user_data.data and user_data.data.get('last_logout_at'):
                            last_logout_at = datetime.fromisoformat(user_data.data['last_logout_at'].replace('Z', '+00:00'))

                            # If token was issued before logout, reject it
                            if token_issued_at < last_logout_at:
                                logger.warning(f"[ME] Rejecting token for user {mask_user_id(user_id)} - issued before logout (token: {token_issued_at.isoformat()}, logout: {last_logout_at.isoformat()})")
                                return error_response(
                                    code='SESSION_INVALIDATED',
                                    message='Session invalidated. Please log in again.',
                                    status=401
                                )
            except Exception as logout_check_error:
                logger.error(f"[ME] Error checking last_logout_at: {logout_check_error}")
                # Don't fail the request if we can't check - but log it

            # Use admin client to bypass RLS and get fresh data
            admin_client = get_supabase_admin_client()

            try:
                # Fetch complete user profile with retry logic for transient connection failures
                user_data = with_connection_retry(
                    lambda: admin_client.table('users').select('*').eq('id', user_id).single().execute(),
                    operation_name='fetch_user_profile'
                )

                if user_data.data:
                    response_data = user_data.data

                    # Include organization data if user has an organization
                    if response_data.get('organization_id'):
                        try:
                            org_data = admin_client.table('organizations')\
                                .select('id, name, slug, branding_config, quest_visibility_policy')\
                                .eq('id', response_data['organization_id'])\
                                .single()\
                                .execute()
                            if org_data.data:
                                response_data['organization'] = org_data.data
                        except Exception as org_error:
                            logger.warning(f"Could not fetch organization for user {mask_user_id(user_id)}: {org_error}")

                    # Check for parent relationships (dependents and linked students)
                    # This allows users to access parent features regardless of their role
                    try:
                        # Check for dependents (children managed by this user)
                        dependents = admin_client.table('users')\
                            .select('id', count='exact')\
                            .eq('managed_by_parent_id', user_id)\
                            .execute()
                        response_data['has_dependents'] = dependents.count > 0 if dependents.count else False

                        # Check for linked students (approved parent-student links)
                        linked_students = admin_client.table('parent_student_links')\
                            .select('id', count='exact')\
                            .eq('parent_user_id', user_id)\
                            .eq('status', 'approved')\
                            .execute()
                        response_data['has_linked_students'] = linked_students.count > 0 if linked_students.count else False
                    except Exception as parent_check_error:
                        logger.warning(f"Could not check parent relationships for user {mask_user_id(user_id)}: {parent_check_error}")
                        response_data['has_dependents'] = False
                        response_data['has_linked_students'] = False

                    # Check for advisor assignments (parent-advisor implicit access)
                    # This allows users assigned as advisors to access advisor features regardless of their role
                    try:
                        advisor_assignments = admin_client.table('advisor_student_assignments')\
                            .select('id', count='exact')\
                            .eq('advisor_id', user_id)\
                            .eq('is_active', True)\
                            .execute()
                        response_data['has_advisor_assignments'] = advisor_assignments.count > 0 if advisor_assignments.count else False
                    except Exception as advisor_check_error:
                        logger.warning(f"Could not check advisor assignments for user {mask_user_id(user_id)}: {advisor_check_error}")
                        response_data['has_advisor_assignments'] = False

                    # Return user data (legacy format for frontend compatibility)
                    # TODO: Migrate to standardized format after updating frontend
                    return jsonify(response_data), 200
                else:
                    return error_response(
                        code='USER_NOT_FOUND',
                        message='User profile not found',
                        status=404
                    )

            except Exception as e:
                logger.error(f"Error fetching user data: {e}")
                return error_response(
                    code='FETCH_USER_FAILED',
                    message='Failed to fetch user profile',
                    status=500
                )

        except Exception as e:
            logger.error(f"Unexpected error in /me endpoint: {e}")
            return error_response(
                code='INTERNAL_ERROR',
                message='Internal server error',
                status=500
            )


    @bp.route('/login', methods=['POST'])
    @rate_limit(max_requests=5, window_seconds=60)  # 5 login attempts per minute
    def login():
        # SECURITY: Add constant-time delay to prevent timing attacks
        # This makes response times statistically similar for all outcomes
        constant_time_delay()

        data = request.json
        supabase = get_supabase_client()

        # Validate input
        if not data or not data.get('email') or not data.get('password'):
            logger.warning("Login attempt with missing email or password")
            return error_response(
                code='VALIDATION_ERROR',
                message='Email and password are required',
                status=400
            )

        email = data['email'].strip().lower()

        # Log login attempt with masked email
        logger.info(f"Login attempt for email: {mask_email(email)}")

        # Check if account is locked due to too many failed attempts
        is_locked, retry_after, attempt_count = check_account_lockout(email)
        if is_locked:
            minutes_remaining = retry_after // 60
            logger.warning(f"Login blocked for locked account: {mask_email(email)} ({minutes_remaining} minutes remaining)")
            return error_response(
                code='ACCOUNT_LOCKED',
                message=f'Account temporarily locked due to too many failed login attempts. Please try again in {minutes_remaining} minutes or use "Forgot Password?" to reset your password.',
                details={'retry_after': retry_after, 'locked': True},
                status=429
            )

        try:
            # Wrap auth call with retry logic for transient connection failures
            auth_response = with_connection_retry(
                lambda: supabase.auth.sign_in_with_password({
                    'email': email,
                    'password': data['password']
                }),
                operation_name='login_sign_in'
            )

            if auth_response.user and auth_response.session:
                # Use admin client to fetch user data (bypasses RLS for login)
                admin_client = get_supabase_admin_client()

                # Fetch user data with admin client (with retry for connection failures)
                try:
                    user_data = with_connection_retry(
                        lambda: admin_client.table('users').select('*').eq('id', auth_response.user.id).single().execute(),
                        operation_name='login_fetch_user'
                    )
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

                # Update last_active timestamp and clear logout timestamp
                try:
                    admin_client.table('users').update({
                        'last_active': datetime.utcnow().isoformat(),
                        'last_logout_at': None  # Clear logout timestamp on login
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

                # Return user data and tokens (legacy format for frontend compatibility)
                # TODO: Migrate to standardized format after updating frontend
                response_data = {
                    'user': user_response_data,
                    'app_access_token': app_access_token,
                    'app_refresh_token': app_refresh_token,
                }
                response = make_response(jsonify(response_data), 200)

                # Set httpOnly cookies for authentication (fallback for desktop browsers)
                # CRITICAL: Pass the same tokens to ensure consistency between cookies and response body
                session_manager.set_auth_cookies(response, auth_response.user.id, app_access_token, app_refresh_token)

                return response
            else:
                logger.warning(f"Login failed for {mask_email(email)} without exception - auth_response.user is None")
                return error_response(
                    code='INVALID_CREDENTIALS',
                    message='Incorrect email or password. Please check your credentials and try again.',
                    status=401
                )

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
                    return error_response(
                        code='ACCOUNT_LOCKED',
                        message=f'Too many failed login attempts. Your account has been temporarily locked for {lockout_minutes} minutes. Please try again later or use "Forgot Password" to reset your password.',
                        details={'locked': True, 'lockout_duration': lockout_minutes},
                        status=429
                    )
                else:
                    logger.info(f"Invalid credentials for {mask_email(email)}: {attempts_remaining} attempts remaining")
                    # Provide more helpful error message based on attempts remaining
                    if attempts_remaining <= 2:
                        return error_response(
                            code='INVALID_CREDENTIALS',
                            message=f'Incorrect email or password. You have {attempts_remaining} {"attempt" if attempts_remaining == 1 else "attempts"} remaining before your account is temporarily locked. If you forgot your password, click "Forgot Password?" below.',
                            details={'attempts_remaining': attempts_remaining, 'warning': True},
                            status=401
                        )
                    else:
                        return error_response(
                            code='INVALID_CREDENTIALS',
                            message=f'Incorrect email or password. Please check your credentials and try again. ({attempts_remaining} {"attempt" if attempts_remaining == 1 else "attempts"} remaining)',
                            details={'attempts_remaining': attempts_remaining},
                            status=401
                        )
            elif "email not confirmed" in error_lower or "email confirmation" in error_lower:
                # SECURITY: Treat unconfirmed email same as invalid credentials to prevent
                # account enumeration. Supabase only returns this error when password is correct,
                # so a distinct error would confirm both account existence AND correct password.
                # Users can use "Forgot Password" to get a new verification/reset email.
                logger.info(f"Login attempt with unconfirmed email: {mask_email(email)}")
                return error_response(
                    code='INVALID_CREDENTIALS',
                    message='Incorrect email or password. If you recently registered, check your inbox for a verification email. You can also use "Forgot Password?" to resend it.',
                    status=401
                )
            elif "user not found" in error_lower:
                # Record failed login attempt even for non-existent users
                # SECURITY: Use same message as invalid credentials to prevent account enumeration
                is_now_locked, attempts_remaining, lockout_minutes = record_failed_login(email)
                logger.info(f"Login attempt with non-existent email: {mask_email(email)}")

                if is_now_locked:
                    return error_response(
                        code='ACCOUNT_LOCKED',
                        message=f'Too many failed login attempts. Your account has been temporarily locked for {lockout_minutes} minutes. Please try again later or use "Forgot Password" to reset your password.',
                        details={'locked': True, 'lockout_duration': lockout_minutes},
                        status=429
                    )
                else:
                    # Use identical message to invalid credentials to prevent enumeration
                    if attempts_remaining <= 2:
                        return error_response(
                            code='INVALID_CREDENTIALS',
                            message=f'Incorrect email or password. You have {attempts_remaining} {"attempt" if attempts_remaining == 1 else "attempts"} remaining before your account is temporarily locked. If you forgot your password, click "Forgot Password?" below.',
                            details={'attempts_remaining': attempts_remaining, 'warning': True},
                            status=401
                        )
                    else:
                        return error_response(
                            code='INVALID_CREDENTIALS',
                            message=f'Incorrect email or password. Please check your credentials and try again. ({attempts_remaining} {"attempt" if attempts_remaining == 1 else "attempts"} remaining)',
                            details={'attempts_remaining': attempts_remaining},
                            status=401
                        )
            elif "rate limit" in error_lower or "too many requests" in error_lower:
                logger.warning(f"Rate limit hit for {mask_email(email)}")
                import re
                wait_match = re.search(r'after (\d+) seconds', error_message)
                if wait_match:
                    wait_time = wait_match.group(1)
                    return error_response(
                        code='RATE_LIMIT_EXCEEDED',
                        message=f'Too many login attempts. Please wait {wait_time} seconds before trying again.',
                        details={'retry_after': int(wait_time)},
                        status=429
                    )
                else:
                    return error_response(
                        code='RATE_LIMIT_EXCEEDED',
                        message='Too many login attempts. Please wait a minute before trying again.',
                        status=429
                    )
            else:
                logger.warning(f"Unhandled login error for {mask_email(email)}: {error_message}")
                return error_response(
                    code='LOGIN_ERROR',
                    message='Login failed. Please check your email and password. If you continue having trouble, try using "Forgot Password?" or contact support.',
                    details={'generic_error': True},
                    status=400
                )


    @bp.route('/login/org/<org_slug>', methods=['POST'])
    @rate_limit(max_requests=5, window_seconds=60)  # 5 login attempts per minute
    def org_login(org_slug):
        """
        Login endpoint for organization students using username instead of email.

        This endpoint allows students created with username/password (no email) to log in
        using their organization's specific login URL.

        URL params:
            org_slug: Organization slug (e.g., 'my-school')

        Request body:
            username: str - The student's username
            password: str - The student's password

        Returns:
            200: Successful login with user data and tokens
            400: Invalid request
            401: Invalid credentials
            404: Organization not found
            429: Too many attempts / account locked
        """
        data = request.json

        # Validate input
        if not data or not data.get('username') or not data.get('password'):
            logger.warning(f"Org login attempt with missing username or password for org: {org_slug}")
            return error_response(
                code='VALIDATION_ERROR',
                message='Username and password are required',
                status=400
            )

        username = data['username'].strip().lower()
        password = data['password']

        logger.info(f"Org login attempt for username '{username}' in org '{org_slug}'")

        admin_client = get_supabase_admin_client()

        # Look up organization by slug
        try:
            org_result = admin_client.table('organizations')\
                .select('id, name, slug, is_active')\
                .eq('slug', org_slug)\
                .single()\
                .execute()

            if not org_result.data:
                logger.warning(f"Org login attempt for non-existent org: {org_slug}")
                return error_response(
                    code='ORG_NOT_FOUND',
                    message='Organization not found. Please check the login URL.',
                    status=404
                )

            if not org_result.data.get('is_active', True):
                logger.warning(f"Org login attempt for inactive org: {org_slug}")
                return error_response(
                    code='ORG_INACTIVE',
                    message='This organization is no longer active.',
                    status=403
                )

            org_id = org_result.data['id']
            org_name = org_result.data['name']

        except Exception as org_error:
            logger.error(f"Error looking up org {org_slug}: {org_error}")
            return error_response(
                code='ORG_LOOKUP_ERROR',
                message='Unable to verify organization. Please try again.',
                status=500
            )

        # Find user by username and organization_id
        try:
            user_result = admin_client.table('users')\
                .select('id, username, first_name, last_name, organization_id')\
                .eq('organization_id', org_id)\
                .ilike('username', username)\
                .single()\
                .execute()

            if not user_result.data:
                logger.info(f"Org login: username '{username}' not found in org {org_slug}")
                return error_response(
                    code='INVALID_CREDENTIALS',
                    message='Invalid username or password. Please check your credentials and try again.',
                    status=401
                )

            user_id = user_result.data['id']

        except Exception as user_error:
            error_str = str(user_error)
            if 'rows' in error_str or 'single' in error_str or 'multiple' in error_str:
                # User not found
                logger.info(f"Org login: username '{username}' not found in org {org_slug}")
                return error_response(
                    code='INVALID_CREDENTIALS',
                    message='Invalid username or password. Please check your credentials and try again.',
                    status=401
                )
            logger.error(f"Error looking up user by username: {user_error}")
            return error_response(
                code='USER_LOOKUP_ERROR',
                message='Unable to verify credentials. Please try again.',
                status=500
            )

        # Get the placeholder email from Supabase Auth for this user
        try:
            auth_user = admin_client.auth.admin.get_user_by_id(user_id)
            if not auth_user or not auth_user.user:
                logger.error(f"Org login: auth user not found for user_id {user_id}")
                return error_response(
                    code='AUTH_ERROR',
                    message='Authentication failed. Please contact support.',
                    status=500
                )

            placeholder_email = auth_user.user.email

        except Exception as auth_error:
            logger.error(f"Error getting auth user for {user_id}: {auth_error}")
            return error_response(
                code='AUTH_ERROR',
                message='Authentication failed. Please try again.',
                status=500
            )

        # Check if account is locked
        is_locked, retry_after, attempt_count = check_account_lockout(placeholder_email)
        if is_locked:
            minutes_remaining = retry_after // 60
            logger.warning(f"Org login blocked for locked account: {username} in {org_slug}")
            return error_response(
                code='ACCOUNT_LOCKED',
                message=f'Account temporarily locked due to too many failed login attempts. Please try again in {minutes_remaining} minutes or contact your administrator.',
                details={'retry_after': retry_after, 'locked': True},
                status=429
            )

        # Attempt to sign in with Supabase using the placeholder email
        try:
            supabase = get_supabase_client()
            auth_response = supabase.auth.sign_in_with_password({
                'email': placeholder_email,
                'password': password
            })

            if auth_response.user and auth_response.session:
                # Fetch full user data
                user_data = admin_client.table('users').select('*').eq('id', auth_response.user.id).single().execute()

                if not user_data.data:
                    logger.error(f"Org login: user profile not found after auth for {user_id}")
                    return error_response(
                        code='USER_NOT_FOUND',
                        message='User profile not found',
                        status=404
                    )

                user_response_data = user_data.data

                # Reset login attempts after successful login
                reset_login_attempts(placeholder_email)

                # Log successful login
                logger.info(f"Successful org login for {username} in {org_slug} (user_id: {mask_user_id(auth_response.user.id)})")

                # Update last_active timestamp and clear logout timestamp
                try:
                    admin_client.table('users').update({
                        'last_active': datetime.utcnow().isoformat(),
                        'last_logout_at': None  # Clear logout timestamp on login
                    }).eq('id', auth_response.user.id).execute()
                except Exception as update_error:
                    logger.error(f"Warning: Failed to update last_active timestamp: {update_error}")

                # Ensure user has diploma and skills initialized
                try:
                    ensure_user_diploma_and_skills(
                        admin_client,
                        auth_response.user.id,
                        user_response_data.get('first_name', 'User'),
                        user_response_data.get('last_name', '')
                    )
                except Exception as diploma_error:
                    logger.error(f"Non-critical: Failed to ensure diploma/skills during org login: {diploma_error}")

                # Generate app tokens for Authorization header usage
                app_access_token = session_manager.generate_access_token(auth_response.user.id)
                app_refresh_token = session_manager.generate_refresh_token(auth_response.user.id)

                # Return user data and tokens
                response_data = {
                    'user': user_response_data,
                    'app_access_token': app_access_token,
                    'app_refresh_token': app_refresh_token,
                    'organization': {
                        'id': org_id,
                        'name': org_name,
                        'slug': org_slug
                    }
                }
                response = make_response(jsonify(response_data), 200)

                # Set httpOnly cookies for authentication
                # CRITICAL: Pass the same tokens to ensure consistency between cookies and response body
                session_manager.set_auth_cookies(response, auth_response.user.id, app_access_token, app_refresh_token)

                return response
            else:
                logger.warning(f"Org login failed for {username} in {org_slug} - auth_response.user is None")
                return error_response(
                    code='INVALID_CREDENTIALS',
                    message='Invalid username or password. Please check your credentials and try again.',
                    status=401
                )

        except Exception as e:
            error_message = str(e)
            logger.error(f"Org login error for {username} in {org_slug}: {error_message}")

            error_lower = error_message.lower()

            if "invalid login credentials" in error_lower or "invalid credentials" in error_lower:
                # Record failed login attempt
                is_now_locked, attempts_remaining, lockout_minutes = record_failed_login(placeholder_email)

                if is_now_locked:
                    logger.warning(f"Account locked for {username} in {org_slug} after too many failed attempts")
                    return error_response(
                        code='ACCOUNT_LOCKED',
                        message=f'Too many failed login attempts. Your account has been temporarily locked for {lockout_minutes} minutes. Please contact your administrator.',
                        details={'locked': True, 'lockout_duration': lockout_minutes},
                        status=429
                    )
                else:
                    if attempts_remaining <= 2:
                        return error_response(
                            code='INVALID_CREDENTIALS',
                            message=f'Invalid username or password. You have {attempts_remaining} {"attempt" if attempts_remaining == 1 else "attempts"} remaining before your account is temporarily locked.',
                            details={'attempts_remaining': attempts_remaining, 'warning': True},
                            status=401
                        )
                    else:
                        return error_response(
                            code='INVALID_CREDENTIALS',
                            message=f'Invalid username or password. Please check your credentials and try again. ({attempts_remaining} {"attempt" if attempts_remaining == 1 else "attempts"} remaining)',
                            details={'attempts_remaining': attempts_remaining},
                            status=401
                        )
            else:
                return error_response(
                    code='LOGIN_ERROR',
                    message='Login failed. Please check your username and password and try again.',
                    details={'generic_error': True},
                    status=400
                )


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

