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
from datetime import datetime
import os

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('auth_google', __name__)

# Default organization for new users
DEFAULT_OPTIO_ORG_ID = 'e88b7aae-b9ad-4c71-bc3a-eef0701f5852'


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

        # Check if user profile exists in our users table
        existing_user = admin_client.table('users').select('*').eq('id', user_id).execute()

        if existing_user.data:
            # Existing user - update last_active and return
            user_data = existing_user.data[0]

            # Update last_active timestamp
            admin_client.table('users').update({
                'last_active': datetime.utcnow().isoformat()
            }).eq('id', user_id).execute()

            logger.info(f"[GOOGLE_OAUTH] Existing user logged in: {mask_user_id(user_id)}")

        else:
            # New user - create profile with default role
            logger.info(f"[GOOGLE_OAUTH] Creating new user profile for: {mask_email(email)}")

            user_data = {
                'id': user_id,
                'first_name': first_name,
                'last_name': last_name,
                'email': email,
                'role': 'student',  # Default role for new OAuth users
                'organization_id': DEFAULT_OPTIO_ORG_ID,
                'auth_provider': 'google',
                'avatar_url': avatar_url,
                'tos_accepted_at': datetime.utcnow().isoformat(),
                'privacy_policy_accepted_at': datetime.utcnow().isoformat(),
                'tos_version': CURRENT_TOS_VERSION,
                'privacy_policy_version': CURRENT_PRIVACY_POLICY_VERSION,
                'created_at': datetime.utcnow().isoformat(),
                'last_active': datetime.utcnow().isoformat()
            }

            try:
                result = admin_client.table('users').insert(user_data).execute()
                user_data = result.data[0] if result.data else user_data

                # Initialize diploma and skills for new user
                ensure_user_diploma_and_skills(admin_client, user_id, first_name, last_name)

                logger.info(f"[GOOGLE_OAUTH] New user created: {mask_user_id(user_id)}")

            except Exception as insert_error:
                error_str = str(insert_error).lower()
                if 'duplicate' in error_str or '23505' in error_str:
                    # Race condition - user was created by another request
                    existing = admin_client.table('users').select('*').eq('id', user_id).single().execute()
                    user_data = existing.data if existing.data else user_data
                else:
                    logger.error(f"[GOOGLE_OAUTH] Failed to create user profile: {insert_error}")
                    raise

        # Generate app JWT tokens
        app_access_token = session_manager.generate_access_token(user_id)
        app_refresh_token = session_manager.generate_refresh_token(user_id)

        # Prepare response data
        response_data = {
            'user': user_data,
            'app_access_token': app_access_token,
            'app_refresh_token': app_refresh_token,
            'is_new_user': not existing_user.data
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
