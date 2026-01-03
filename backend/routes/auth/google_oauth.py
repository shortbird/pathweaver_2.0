"""
Authentication Module: Google OAuth Integration

Handles:
- Google OAuth callback from Supabase
- User creation/login for Google-authenticated users
- Session establishment after OAuth
"""

from flask import Blueprint, request, jsonify, make_response
from database import get_supabase_admin_client
from utils.session_manager import session_manager
from middleware.rate_limiter import rate_limit
from utils.log_scrubber import mask_email, mask_user_id
from utils.api_response_v1 import success_response, error_response
from legal_versions import CURRENT_TOS_VERSION, CURRENT_PRIVACY_POLICY_VERSION
from datetime import datetime, timedelta
import os
import jwt
import secrets

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('auth_google', __name__)

# Default organization for new users
DEFAULT_OPTIO_ORG_ID = 'e88b7aae-b9ad-4c71-bc3a-eef0701f5852'

# TOS acceptance token settings
TOS_TOKEN_EXPIRY_MINUTES = 15
TOS_TOKEN_SECRET = os.getenv('JWT_SECRET_KEY', 'fallback-secret-key-change-in-production')


def generate_tos_acceptance_token(user_id: str) -> str:
    """Generate a short-lived token for TOS acceptance."""
    payload = {
        'user_id': user_id,
        'purpose': 'tos_acceptance',
        'exp': datetime.utcnow() + timedelta(minutes=TOS_TOKEN_EXPIRY_MINUTES),
        'iat': datetime.utcnow(),
        'jti': secrets.token_urlsafe(16)  # Unique token ID
    }
    return jwt.encode(payload, TOS_TOKEN_SECRET, algorithm='HS256')


def verify_tos_acceptance_token(token: str):
    """Verify TOS acceptance token and return user_id if valid."""
    try:
        payload = jwt.decode(token, TOS_TOKEN_SECRET, algorithms=['HS256'])
        if payload.get('purpose') != 'tos_acceptance':
            return None
        return payload.get('user_id')
    except jwt.ExpiredSignatureError:
        logger.warning("[GOOGLE_OAUTH] TOS acceptance token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"[GOOGLE_OAUTH] Invalid TOS acceptance token: {e}")
        return None


def ensure_user_diploma_and_skills(supabase, user_id, first_name, last_name):
    """Ensure user has diploma and skill categories initialized"""
    import re
    try:
        # Check if diploma exists for this user
        diploma_check = supabase.table('diplomas').select('id').eq('user_id', user_id).execute()

        if not diploma_check.data:
            # Generate unique slug
            base_slug = re.sub(r'[^a-zA-Z0-9]', '', first_name + last_name).lower()

            for counter in range(100):
                try:
                    check_slug = base_slug if counter == 0 else f"{base_slug}{counter}"
                    supabase.table('diplomas').insert({
                        'user_id': user_id,
                        'portfolio_slug': check_slug
                    }).execute()
                    break
                except Exception as insert_error:
                    if '23505' in str(insert_error) or 'duplicate' in str(insert_error).lower():
                        continue
                    else:
                        logger.error(f"Error creating diploma: {str(insert_error)}")
                        break

        # Initialize skill categories
        skill_categories = ['Arts & Creativity', 'STEM & Logic', 'Life & Wellness',
                           'Language & Communication', 'Society & Culture']
        skill_records = [
            {'user_id': user_id, 'pillar': pillar, 'xp_amount': 0}
            for pillar in skill_categories
        ]

        try:
            supabase.table('user_skill_xp').upsert(skill_records, on_conflict='user_id,pillar').execute()
        except Exception as skill_error:
            logger.error(f"Batch skill insert failed: {str(skill_error)}")
            for record in skill_records:
                try:
                    supabase.table('user_skill_xp').insert(record).execute()
                except Exception:
                    pass

    except Exception as e:
        logger.error(f"Error ensuring diploma and skills: {str(e)}")


@bp.route('/google/callback', methods=['POST'])
@rate_limit(max_requests=10, window_seconds=60)
def google_oauth_callback():
    """
    Handle Google OAuth callback from frontend.

    The frontend calls this after Supabase OAuth completes with Google.
    We receive the Supabase access token, verify it, and establish our app session.

    Request body:
        - access_token: Supabase access token from OAuth
        - refresh_token: Supabase refresh token (optional)

    Returns:
        - User data with app tokens for session
    """
    try:
        data = request.json

        if not data:
            return error_response(
                code='INVALID_REQUEST',
                message='Request body is required',
                status=400
            )

        supabase_access_token = data.get('access_token')

        if not supabase_access_token:
            return error_response(
                code='TOKEN_REQUIRED',
                message='Access token is required',
                status=400
            )

        logger.info("[GOOGLE_OAUTH] Processing OAuth callback")

        # Use admin client to verify and get user info
        admin_client = get_supabase_admin_client()

        # Get user from Supabase using the access token
        try:
            # Verify the token by getting the user
            user_response = admin_client.auth.get_user(supabase_access_token)

            if not user_response or not user_response.user:
                logger.warning("[GOOGLE_OAUTH] Invalid or expired access token")
                return error_response(
                    code='INVALID_TOKEN',
                    message='Invalid or expired access token',
                    status=401
                )

            supabase_user = user_response.user

        except Exception as auth_error:
            logger.error(f"[GOOGLE_OAUTH] Token verification failed: {auth_error}")
            return error_response(
                code='TOKEN_VERIFICATION_FAILED',
                message='Failed to verify access token',
                status=401
            )

        user_id = supabase_user.id
        email = supabase_user.email

        # Extract user info from Supabase user metadata
        user_metadata = supabase_user.user_metadata or {}

        # Google provides these in user_metadata
        first_name = user_metadata.get('given_name') or user_metadata.get('name', '').split()[0] if user_metadata.get('name') else 'User'
        last_name = user_metadata.get('family_name') or (user_metadata.get('name', '').split()[-1] if user_metadata.get('name') and len(user_metadata.get('name', '').split()) > 1 else '')
        avatar_url = user_metadata.get('avatar_url') or user_metadata.get('picture')

        logger.info(f"[GOOGLE_OAUTH] Processing user: {mask_email(email)}")

        # Track the original Google OAuth user_id from Supabase
        google_oauth_user_id = user_id
        is_new_user = False
        requires_tos_acceptance = False

        # === ACCOUNT LINKING LOGIC ===
        # 1. Check if this Google user_id exists directly (native Google user)
        existing_by_id = admin_client.table('users').select('*').eq('id', user_id).execute()

        # 2. Check if this Google user_id is linked to another account
        # Wrapped in try/except in case google_user_id column doesn't exist yet
        existing_by_google_id = None
        try:
            existing_by_google_id = admin_client.table('users').select('*').eq('google_user_id', user_id).execute()
        except Exception as e:
            logger.warning(f"[GOOGLE_OAUTH] Could not check google_user_id (column may not exist): {e}")

        # 3. Check by email for account linking scenario
        existing_by_email = admin_client.table('users').select('*').eq('email', email).execute()

        if existing_by_id.data:
            # Case A: Returning Google-native user (signed up with Google originally)
            user_data = existing_by_id.data[0]
            admin_client.table('users').update({
                'last_active': datetime.utcnow().isoformat()
            }).eq('id', user_id).execute()
            logger.info(f"[GOOGLE_OAUTH] Existing Google user logged in: {mask_user_id(user_id)}")

        elif existing_by_google_id and existing_by_google_id.data:
            # Case B: Returning linked user (email+password user who linked Google)
            user_data = existing_by_google_id.data[0]
            user_id = user_data['id']  # Use original user_id for session tokens
            admin_client.table('users').update({
                'last_active': datetime.utcnow().isoformat()
            }).eq('id', user_id).execute()
            logger.info(f"[GOOGLE_OAUTH] Linked user logged in: {mask_user_id(user_id)}")

        elif existing_by_email.data:
            # Case C: ACCOUNT LINKING - email/password user signing in with Google for first time
            user_data = existing_by_email.data[0]
            original_user_id = user_data['id']

            # Link the Google OAuth identity to this existing account
            try:
                admin_client.table('users').update({
                    'google_user_id': google_oauth_user_id,
                    'auth_provider': 'email,google',
                    'avatar_url': avatar_url or user_data.get('avatar_url'),
                    'last_active': datetime.utcnow().isoformat()
                }).eq('id', original_user_id).execute()
                user_data['google_user_id'] = google_oauth_user_id
                user_data['auth_provider'] = 'email,google'
                logger.info(f"[GOOGLE_OAUTH] Account linked: {mask_user_id(original_user_id)} <- Google {mask_user_id(google_oauth_user_id)}")
            except Exception as link_error:
                # If google_user_id column doesn't exist, just update what we can
                logger.warning(f"[GOOGLE_OAUTH] Could not fully link account (google_user_id column may not exist): {link_error}")
                admin_client.table('users').update({
                    'auth_provider': 'email,google',
                    'avatar_url': avatar_url or user_data.get('avatar_url'),
                    'last_active': datetime.utcnow().isoformat()
                }).eq('id', original_user_id).execute()
                user_data['auth_provider'] = 'email,google'
                logger.info(f"[GOOGLE_OAUTH] Account partially linked (no google_user_id): {mask_user_id(original_user_id)}")

            # Use the original user_id for session tokens (preserves all user data)
            user_id = original_user_id

        else:
            # Case D: New user - create profile (but require TOS acceptance first)
            logger.info(f"[GOOGLE_OAUTH] Creating new user profile for: {mask_email(email)}")
            is_new_user = True
            requires_tos_acceptance = True

            # Create user WITHOUT TOS acceptance (will be set after explicit consent)
            user_data = {
                'id': user_id,
                'first_name': first_name,
                'last_name': last_name,
                'email': email,
                'role': 'student',
                'organization_id': DEFAULT_OPTIO_ORG_ID,
                'auth_provider': 'google',
                'avatar_url': avatar_url,
                # TOS fields intentionally NOT set - requires explicit acceptance
                'created_at': datetime.utcnow().isoformat(),
                'last_active': datetime.utcnow().isoformat()
            }

            try:
                result = admin_client.table('users').insert(user_data).execute()
                user_data = result.data[0] if result.data else user_data

                # Initialize diploma and skills for new user
                ensure_user_diploma_and_skills(admin_client, user_id, first_name, last_name)

                logger.info(f"[GOOGLE_OAUTH] New user created (pending TOS): {mask_user_id(user_id)}")

            except Exception as insert_error:
                error_str = str(insert_error).lower()
                if 'duplicate' in error_str or '23505' in error_str:
                    # Race condition - user was created by another request
                    existing = admin_client.table('users').select('*').eq('id', user_id).single().execute()
                    user_data = existing.data if existing.data else user_data
                    # Check if TOS already accepted (e.g., from race condition)
                    if user_data.get('tos_accepted_at'):
                        requires_tos_acceptance = False
                else:
                    logger.error(f"[GOOGLE_OAUTH] Failed to create user profile: {insert_error}")
                    raise

        # For new users requiring TOS, return early with TOS acceptance token
        if requires_tos_acceptance:
            tos_token = generate_tos_acceptance_token(user_id)
            response_data = {
                'user': user_data,
                'requires_tos_acceptance': True,
                'tos_acceptance_token': tos_token,
                'is_new_user': True
            }
            logger.info(f"[GOOGLE_OAUTH] TOS acceptance required for: {mask_user_id(user_id)}")
            return make_response(jsonify(response_data), 200)

        # Generate app JWT tokens for existing users (or linked users with TOS already accepted)
        app_access_token = session_manager.generate_access_token(user_id)
        app_refresh_token = session_manager.generate_refresh_token(user_id)

        # Prepare response data
        response_data = {
            'user': user_data,
            'app_access_token': app_access_token,
            'app_refresh_token': app_refresh_token,
            'is_new_user': is_new_user
        }

        response = make_response(jsonify(response_data), 200)

        # Set httpOnly cookies for authentication
        session_manager.set_auth_cookies(response, user_id)

        logger.info(f"[GOOGLE_OAUTH] Session established for user: {mask_user_id(user_id)}")

        return response

    except Exception as e:
        logger.error(f"[GOOGLE_OAUTH] Unexpected error: {str(e)}")
        return error_response(
            code='OAUTH_ERROR',
            message='Failed to complete Google sign-in',
            status=500
        )


@bp.route('/google/accept-tos', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=60)
def accept_tos():
    """
    Accept Terms of Service for Google OAuth users.

    Called after Google OAuth when new user explicitly accepts TOS in modal.
    Only after acceptance do we issue full session tokens.

    Request body:
        - tos_acceptance_token: Token from OAuth callback
        - accepted_tos: Boolean - user accepted TOS
        - accepted_privacy: Boolean - user accepted Privacy Policy

    Returns:
        - User data with app tokens for session
    """
    try:
        data = request.json

        if not data:
            return error_response(
                code='INVALID_REQUEST',
                message='Request body is required',
                status=400
            )

        tos_token = data.get('tos_acceptance_token')
        accepted_tos = data.get('accepted_tos', False)
        accepted_privacy = data.get('accepted_privacy', False)

        if not tos_token:
            return error_response(
                code='TOKEN_REQUIRED',
                message='TOS acceptance token is required',
                status=400
            )

        if not accepted_tos or not accepted_privacy:
            return error_response(
                code='CONSENT_REQUIRED',
                message='Both Terms of Service and Privacy Policy must be accepted',
                status=400
            )

        # Verify the TOS acceptance token
        user_id = verify_tos_acceptance_token(tos_token)
        if not user_id:
            return error_response(
                code='INVALID_TOKEN',
                message='Invalid or expired acceptance token. Please sign in again.',
                status=401
            )

        logger.info(f"[GOOGLE_OAUTH] Processing TOS acceptance for: {mask_user_id(user_id)}")

        admin_client = get_supabase_admin_client()

        # Verify user exists and hasn't already accepted TOS
        user_check = admin_client.table('users').select('*').eq('id', user_id).execute()

        if not user_check.data:
            return error_response(
                code='USER_NOT_FOUND',
                message='User account not found. Please sign in again.',
                status=404
            )

        user_data = user_check.data[0]

        # Update user with TOS acceptance
        admin_client.table('users').update({
            'tos_accepted_at': datetime.utcnow().isoformat(),
            'privacy_policy_accepted_at': datetime.utcnow().isoformat(),
            'tos_version': CURRENT_TOS_VERSION,
            'privacy_policy_version': CURRENT_PRIVACY_POLICY_VERSION
        }).eq('id', user_id).execute()

        # Fetch updated user data
        updated_user = admin_client.table('users').select('*').eq('id', user_id).single().execute()
        user_data = updated_user.data if updated_user.data else user_data

        # Now issue full session tokens
        app_access_token = session_manager.generate_access_token(user_id)
        app_refresh_token = session_manager.generate_refresh_token(user_id)

        response_data = {
            'user': user_data,
            'app_access_token': app_access_token,
            'app_refresh_token': app_refresh_token,
            'is_new_user': True
        }

        response = make_response(jsonify(response_data), 200)

        # Set httpOnly cookies for authentication
        session_manager.set_auth_cookies(response, user_id)

        logger.info(f"[GOOGLE_OAUTH] TOS accepted, session established for: {mask_user_id(user_id)}")

        return response

    except Exception as e:
        logger.error(f"[GOOGLE_OAUTH] TOS acceptance error: {str(e)}")
        return error_response(
            code='TOS_ACCEPTANCE_ERROR',
            message='Failed to complete TOS acceptance',
            status=500
        )
