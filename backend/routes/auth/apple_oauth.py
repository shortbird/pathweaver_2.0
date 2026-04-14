"""
Authentication Module: Apple Sign in Integration

Handles:
- Apple Sign in callback from Supabase (web + mobile use the same endpoint)
- User creation/login for Apple-authenticated users
- Session establishment after OAuth

Apple exposes less profile data than Google. Email is returned only on first
sign-in (or if the user unshared/reshared), and names are returned only if the
user chooses to share them. We persist what we get and fill gaps with sensible
defaults.
"""

from flask import Blueprint, request, make_response, jsonify
from database import get_supabase_admin_client
from utils.session_manager import session_manager
from middleware.rate_limiter import rate_limit
from middleware.csrf_protection import csrf
from utils.log_scrubber import mask_email, mask_user_id
from utils.api_response_v1 import error_response
from datetime import datetime

from utils.logger import get_logger
from routes.auth.google_oauth import (
    ensure_user_diploma_and_skills,
    generate_tos_acceptance_token,
)

logger = get_logger(__name__)

bp = Blueprint('auth_apple', __name__)


@bp.route('/apple/callback', methods=['POST'])
@csrf.exempt  # Uses Supabase token verification instead of CSRF
@rate_limit(max_requests=10, window_seconds=60)
def apple_oauth_callback():
    """
    Handle Apple Sign in callback.

    The client (web or mobile) calls this after Supabase completes the
    Sign in with Apple flow. We receive the Supabase access token,
    verify it, then establish our app session.

    Request body:
        - access_token: Supabase access token from OAuth
        - refresh_token: Supabase refresh token (optional)
        - full_name: { first_name, last_name } — only present on first-time
                     Apple sign-in when the user chose to share names
    """
    try:
        data = request.json or {}
        supabase_access_token = data.get('access_token')
        full_name = data.get('full_name') or {}

        if not supabase_access_token:
            return error_response(
                code='TOKEN_REQUIRED',
                message='Access token is required',
                status=400,
            )

        logger.info("[APPLE_OAUTH] Processing OAuth callback")

        # admin client justified: OAuth callback verifies Supabase access_token via auth.get_user,
        # performs cross-user account-linking lookups (id/apple_user_id/email), creates user profile,
        # and writes diplomas/skills — all before a session exists.
        admin_client = get_supabase_admin_client()

        try:
            user_response = admin_client.auth.get_user(supabase_access_token)
            if not user_response or not user_response.user:
                logger.warning("[APPLE_OAUTH] Invalid or expired access token")
                return error_response(
                    code='INVALID_TOKEN',
                    message='Invalid or expired access token',
                    status=401,
                )
            supabase_user = user_response.user
        except Exception as auth_error:
            logger.error(f"[APPLE_OAUTH] Token verification failed: {auth_error}")
            return error_response(
                code='TOKEN_VERIFICATION_FAILED',
                message='Failed to verify access token',
                status=401,
            )

        user_id = supabase_user.id
        email = supabase_user.email
        user_metadata = supabase_user.user_metadata or {}

        # Apple: names come in full_name from the client on first sign-in only,
        # or via user_metadata if Supabase was able to capture them. Leave blank
        # rather than inventing a fake name — the onboarding flow prompts for
        # real name when first_name is empty.
        first_name = (
            full_name.get('first_name')
            or user_metadata.get('given_name')
            or (user_metadata.get('name', '').split()[0] if user_metadata.get('name') else '')
            or ''
        )
        last_name = (
            full_name.get('last_name')
            or user_metadata.get('family_name')
            or (user_metadata.get('name', '').split()[-1] if user_metadata.get('name') and len(user_metadata.get('name', '').split()) > 1 else '')
            or ''
        )

        logger.info(f"[APPLE_OAUTH] Processing user: {mask_email(email) if email else '<hidden>'}")

        apple_oauth_user_id = user_id
        is_new_user = False
        requires_tos_acceptance = False

        # === ACCOUNT LINKING LOGIC (mirrors google_oauth) ===
        existing_by_id = admin_client.table('users').select('*').eq('id', user_id).execute()

        existing_by_apple_id = None
        try:
            existing_by_apple_id = admin_client.table('users').select('*').eq('apple_user_id', user_id).execute()
        except Exception as e:
            logger.warning(f"[APPLE_OAUTH] Could not check apple_user_id (column may not exist): {e}")

        existing_by_email = None
        if email:
            existing_by_email = admin_client.table('users').select('*').eq('email', email).execute()

        if existing_by_id.data:
            # Case A: Returning Apple-native user
            user_data = existing_by_id.data[0]
            admin_client.table('users').update({
                'last_active': datetime.utcnow().isoformat(),
                'last_logout_at': None,
            }).eq('id', user_id).execute()
            logger.info(f"[APPLE_OAUTH] Existing Apple user logged in: {mask_user_id(user_id)}")

        elif existing_by_apple_id and existing_by_apple_id.data:
            # Case B: Returning linked user
            user_data = existing_by_apple_id.data[0]
            user_id = user_data['id']
            admin_client.table('users').update({
                'last_active': datetime.utcnow().isoformat(),
                'last_logout_at': None,
            }).eq('id', user_id).execute()
            logger.info(f"[APPLE_OAUTH] Linked Apple user logged in: {mask_user_id(user_id)}")

        elif existing_by_email and existing_by_email.data:
            # Case C: Account linking - email-password or Google user signing in with Apple
            user_data = existing_by_email.data[0]
            original_user_id = user_data['id']
            existing_auth_provider = user_data.get('auth_provider', 'email')
            new_auth_provider = (
                existing_auth_provider
                if 'apple' in (existing_auth_provider or '')
                else f"{existing_auth_provider},apple"
            )

            try:
                admin_client.table('users').update({
                    'apple_user_id': apple_oauth_user_id,
                    'auth_provider': new_auth_provider,
                    'last_active': datetime.utcnow().isoformat(),
                    'last_logout_at': None,
                }).eq('id', original_user_id).execute()
                user_data['apple_user_id'] = apple_oauth_user_id
                user_data['auth_provider'] = new_auth_provider
                logger.info(f"[APPLE_OAUTH] Account linked: {mask_user_id(original_user_id)} <- Apple {mask_user_id(apple_oauth_user_id)}")
            except Exception as link_error:
                logger.warning(f"[APPLE_OAUTH] Could not fully link account (apple_user_id column may not exist): {link_error}")
                admin_client.table('users').update({
                    'auth_provider': new_auth_provider,
                    'last_active': datetime.utcnow().isoformat(),
                    'last_logout_at': None,
                }).eq('id', original_user_id).execute()
                user_data['auth_provider'] = new_auth_provider

            user_id = original_user_id

        else:
            # Case D: New user - create profile (require TOS acceptance first)
            logger.info(f"[APPLE_OAUTH] Creating new user profile")
            is_new_user = True
            requires_tos_acceptance = True

            user_data = {
                'id': user_id,
                'first_name': first_name,
                'last_name': last_name,
                'email': email,  # May be a private relay address for Apple-private users
                'role': 'student',
                'apple_user_id': apple_oauth_user_id,
                'created_at': datetime.utcnow().isoformat(),
                'last_active': datetime.utcnow().isoformat(),
            }

            import time
            max_retries = 3
            retry_delay = 0.5
            profile_created = False

            for attempt in range(max_retries):
                try:
                    result = admin_client.table('users').insert(user_data).execute()
                    user_data = result.data[0] if result.data else user_data
                    profile_created = True
                    ensure_user_diploma_and_skills(admin_client, user_id, first_name, last_name)
                    logger.info(f"[APPLE_OAUTH] New user created (pending TOS): {mask_user_id(user_id)}")
                    break
                except Exception as insert_error:
                    error_str = str(insert_error).lower()
                    if 'duplicate' in error_str or '23505' in error_str:
                        existing = admin_client.table('users').select('*').eq('id', user_id).single().execute()
                        user_data = existing.data if existing.data else user_data
                        profile_created = True
                        if user_data.get('tos_accepted_at'):
                            requires_tos_acceptance = False
                        break
                    elif ('foreign key' in error_str or '23503' in error_str) and attempt < max_retries - 1:
                        logger.warning(f"[APPLE_OAUTH] Profile creation FK error, retrying in {retry_delay}s (attempt {attempt + 1}/{max_retries})")
                        time.sleep(retry_delay)
                        retry_delay *= 2
                    else:
                        logger.error(f"[APPLE_OAUTH] Failed to create user profile: {insert_error}")
                        raise

            if not profile_created:
                raise Exception("Failed to create user profile after retries")

        # New users: return TOS acceptance token (reuse google endpoint for acceptance)
        if requires_tos_acceptance:
            tos_token = generate_tos_acceptance_token(user_id)
            return make_response(jsonify({
                'user': user_data,
                'requires_tos_acceptance': True,
                'tos_acceptance_token': tos_token,
                'is_new_user': True,
            }), 200)

        # Existing users: issue session tokens now
        app_access_token = session_manager.generate_access_token(user_id)
        app_refresh_token = session_manager.generate_refresh_token(user_id)

        response = make_response(jsonify({
            'user': user_data,
            'app_access_token': app_access_token,
            'app_refresh_token': app_refresh_token,
            'is_new_user': is_new_user,
        }), 200)

        session_manager.set_auth_cookies(response, user_id, app_access_token, app_refresh_token)
        logger.info(f"[APPLE_OAUTH] Session established for user: {mask_user_id(user_id)}")
        return response

    except Exception as e:
        import traceback
        logger.error(f"[APPLE_OAUTH] Unexpected error: {e}")
        logger.error(f"[APPLE_OAUTH] Traceback: {traceback.format_exc()}")
        return error_response(
            code='OAUTH_ERROR',
            message='Failed to complete Apple sign-in',
            status=500,
        )
