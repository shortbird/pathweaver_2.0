"""User profile routes"""

from flask import Blueprint, request, jsonify
from database import get_user_client
from utils.auth.decorators import require_auth
from middleware.error_handler import NotFoundError, ValidationError
from .helpers import calculate_user_xp, get_user_skills

profile_bp = Blueprint('profile', __name__)

@profile_bp.route('/profile', methods=['GET'])
@require_auth
def get_profile(user_id):
    """Get user profile with XP breakdown"""
    # Use user client with RLS enforcement
    supabase = get_user_client()
    
    try:
        user = supabase.table('users').select('*').eq('id', user_id).single().execute()
        
        if not user.data:
            raise NotFoundError('User', user_id)
        
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
            'user': user.data,
            'total_xp': total_xp,
            'skill_breakdown': skill_breakdown,
            'completed_quests': completed_count
        }
        
        return jsonify(response_data), 200
    except NotFoundError:
        raise
    except Exception as e:
        print(f"Error fetching profile: {str(e)}")
        return jsonify({'error': 'Failed to fetch profile'}), 500

@profile_bp.route('/profile', methods=['PUT'])
@require_auth
def update_profile(user_id):
    """Update user profile"""
    data = request.json
    
    # Validate allowed fields
    allowed_fields = ['first_name', 'last_name', 'bio', 'avatar_url']
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    
    if not update_data:
        raise ValidationError('No valid fields to update')
    
    # Use user client with RLS enforcement
    supabase = get_user_client()
    
    try:
        result = supabase.table('users')\
            .update(update_data)\
            .eq('id', user_id)\
            .execute()
        
        if not result.data:
            raise NotFoundError('User', user_id)
        
        return jsonify(result.data[0]), 200
    except NotFoundError:
        raise
    except Exception as e:
        print(f"Error updating profile: {str(e)}")
        return jsonify({'error': 'Failed to update profile'}), 500