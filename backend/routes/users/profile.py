"""User profile routes"""

from flask import Blueprint, request, jsonify
from database import get_user_client
from backend.repositories import (
    UserRepository,
    QuestRepository,
    BadgeRepository,
    EvidenceRepository,
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
    AnalyticsRepository
)
from utils.auth.decorators import require_auth
from middleware.error_handler import NotFoundError, ValidationError
from repositories.user_repository import UserRepository
from .helpers import calculate_user_xp, get_user_skills

from utils.logger import get_logger

logger = get_logger(__name__)

profile_bp = Blueprint('profile', __name__)

@profile_bp.route('/profile', methods=['GET'])
@require_auth
def get_profile(user_id):
    """Get user profile with XP breakdown"""
    # Use repository pattern with RLS enforcement
    supabase = get_user_client()
    user_repo = UserRepository(user_id=user_id)

    try:
        # Get user profile using repository
        user = user_repo.get_profile(user_id)

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
    data = request.json

    # Validate allowed fields
    allowed_fields = ['first_name', 'last_name', 'bio', 'avatar_url', 'display_name', 'portfolio_slug']
    update_data = {k: v for k, v in data.items() if k in allowed_fields}

    if not update_data:
        raise ValidationError('No valid fields to update')

    # Use repository pattern with RLS enforcement
    supabase = get_user_client()
    user_repo = UserRepository(user_id=user_id)

    try:
        # Update profile using repository
        updated_user = user_repo.update(user_id, update_data)

        return jsonify(updated_user), 200
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error updating profile: {str(e)}")
        return jsonify({'error': 'Failed to update profile'}), 500