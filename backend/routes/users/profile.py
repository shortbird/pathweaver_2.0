"""
REPOSITORY MIGRATION: COMPLETE
- Uses UserRepository for user CRUD operations
- Uses DashboardService for XP calculations
- Routes are thin controllers handling HTTP concerns only

User profile routes
"""

import uuid
from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from middleware.error_handler import NotFoundError, ValidationError
from repositories import UserRepository
from services.dashboard_service import DashboardService
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

profile_bp = Blueprint('profile', __name__)


@profile_bp.route('/profile', methods=['GET'])
@require_auth
def get_profile(user_id):
    """Get user profile with XP breakdown"""
    try:
        user_repo = UserRepository()
        dashboard_service = DashboardService()

        # Get user profile
        user = user_repo.get_profile(user_id)

        # Get XP stats using dashboard service's methods
        from routes.users.helpers import calculate_user_xp
        supabase = get_supabase_admin_client()
        total_xp, skill_breakdown = calculate_user_xp(supabase, user_id)

        # Get completed quests count
        completed_count = dashboard_service.get_completed_quests_count(user_id)

        return jsonify({
            'user': user,
            'total_xp': total_xp,
            'skill_breakdown': skill_breakdown,
            'completed_quests': completed_count
        }), 200

    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error fetching profile: {str(e)}")
        return jsonify({'error': 'Failed to fetch profile'}), 500


@profile_bp.route('/profile', methods=['PUT'])
@require_auth
def update_profile(user_id):
    """Update user profile"""
    data = request.json

    # Validate allowed fields
    allowed_fields = ['first_name', 'last_name', 'bio', 'avatar_url', 'display_name', 'portfolio_slug']
    update_data = {k: v for k, v in data.items() if k in allowed_fields}

    if not update_data:
        raise ValidationError('No valid fields to update')

    try:
        user_repo = UserRepository()

        # Update profile - UserRepository.update() handles the actual update
        updated_user = user_repo.update(user_id, update_data)

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
    if 'avatar' not in request.files:
        raise ValidationError('No avatar file provided')

    file = request.files['avatar']
    if file.filename == '':
        raise ValidationError('No file selected')

    # Validate file type
    allowed_types = {'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'}
    if file.content_type not in allowed_types:
        raise ValidationError('Invalid file type. Allowed: JPEG, PNG, GIF, WebP, HEIC')

    # Validate file size (5MB max)
    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > 5 * 1024 * 1024:
        raise ValidationError('File too large. Maximum size is 5MB')

    try:
        supabase = get_supabase_admin_client()
        user_repo = UserRepository()

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
        user_repo.update(user_id, {'avatar_url': avatar_url})

        return jsonify({'avatar_url': avatar_url}), 200

    except Exception as e:
        logger.error(f"Error uploading avatar: {str(e)}")
        return jsonify({'error': 'Failed to upload avatar'}), 500
