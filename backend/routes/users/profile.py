"""
User profile routes

REPOSITORY MIGRATION: MIGRATION CANDIDATE
- Multiple direct database calls to 'users' and 'user_quests' tables
- Should use UserRepository for user CRUD operations
- Helper functions in helpers.py may also need migration
- Methods needed: get_user_profile_with_xp(), update_user_profile()
"""

import uuid
from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from middleware.error_handler import NotFoundError, ValidationError
from .helpers import calculate_user_xp, get_user_skills

from utils.logger import get_logger

logger = get_logger(__name__)

profile_bp = Blueprint('profile', __name__)

@profile_bp.route('/profile', methods=['GET'])
@require_auth
def get_profile(user_id):
    """Get user profile with XP breakdown"""
    # Admin client: Auth verified by decorator (ADR-002, Rule 3)
    from database import get_supabase_admin_client
    supabase = get_supabase_admin_client()

    try:
        # Get user profile directly with admin client
        user_response = supabase.table('users')\
            .select('*')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not user_response.data:
            raise NotFoundError('User', user_id)

        user = user_response.data

        # Calculate total XP and get skill breakdown
        total_xp, skill_breakdown = calculate_user_xp(supabase, user_id)

        # Get completed quests count
        completed_quests = supabase.table('user_quests')\
            .select('id', count='exact')\
            .eq('user_id', user_id)\
            .not_.is_('completed_at', 'null')\
            .execute()

        completed_count = completed_quests.count if hasattr(completed_quests, 'count') else 0

        # Structure response as expected by frontend
        response_data = {
            'user': user,
            'total_xp': total_xp,
            'skill_breakdown': skill_breakdown,
            'completed_quests': completed_count
        }

        return jsonify(response_data), 200
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error fetching profile: {str(e)}")
        return jsonify({'error': 'Failed to fetch profile'}), 500

@profile_bp.route('/profile', methods=['PUT'])
@require_auth
def update_profile(user_id):
    """Update user profile"""
    # Admin client: Auth verified by decorator (ADR-002, Rule 3)
    from database import get_supabase_admin_client
    supabase = get_supabase_admin_client()

    data = request.json

    # Validate allowed fields
    allowed_fields = ['first_name', 'last_name', 'bio', 'avatar_url', 'display_name', 'portfolio_slug']
    update_data = {k: v for k, v in data.items() if k in allowed_fields}

    if not update_data:
        raise ValidationError('No valid fields to update')

    try:
        # Update profile using admin client
        updated_user_response = supabase.table('users')\
            .update(update_data)\
            .eq('id', user_id)\
            .execute()

        if not updated_user_response.data:
            raise NotFoundError('User', user_id)

        updated_user = updated_user_response.data[0]

        return jsonify(updated_user), 200
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error updating profile: {str(e)}")
        return jsonify({'error': 'Failed to update profile'}), 500


@profile_bp.route('/avatar', methods=['POST'])
@require_auth
def upload_avatar(user_id):
    """Upload user avatar image"""
    from database import get_supabase_admin_client
    supabase = get_supabase_admin_client()

    if 'avatar' not in request.files:
        raise ValidationError('No avatar file provided')

    file = request.files['avatar']
    if file.filename == '':
        raise ValidationError('No file selected')

    # Validate file type
    allowed_types = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}
    if file.content_type not in allowed_types:
        raise ValidationError('Invalid file type. Allowed: JPEG, PNG, GIF, WebP')

    # Validate file size (5MB max)
    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > 5 * 1024 * 1024:
        raise ValidationError('File too large. Maximum size is 5MB')

    try:
        # Generate unique filename
        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else 'jpg'
        filename = f"avatars/{user_id}/{uuid.uuid4()}.{ext}"

        # Upload to Supabase Storage
        file_bytes = file.read()
        supabase.storage.from_('user-uploads').upload(
            filename,
            file_bytes,
            {'content-type': file.content_type}
        )

        # Get public URL
        avatar_url = supabase.storage.from_('user-uploads').get_public_url(filename)

        # Update user's avatar_url
        supabase.table('users')\
            .update({'avatar_url': avatar_url})\
            .eq('id', user_id)\
            .execute()

        return jsonify({'avatar_url': avatar_url}), 200

    except Exception as e:
        logger.error(f"Error uploading avatar: {str(e)}")
        return jsonify({'error': 'Failed to upload avatar'}), 500