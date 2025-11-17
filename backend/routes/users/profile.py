"""User profile routes"""

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
    # Use admin client - user authentication enforced by @require_auth
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
    # Use admin client - user authentication enforced by @require_auth
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

        # Trigger tutorial verification if profile fields were updated
        if 'first_name' in update_data or 'last_name' in update_data or 'bio' in update_data:
            try:
                from services.tutorial_verification_service import TutorialVerificationService
                verification_service = TutorialVerificationService()
                verification_service.verify_user_tutorial_progress(user_id)
            except Exception as tutorial_error:
                logger.error(f"Tutorial verification failed after profile update: {tutorial_error}")

        return jsonify(updated_user), 200
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error updating profile: {str(e)}")
        return jsonify({'error': 'Failed to update profile'}), 500