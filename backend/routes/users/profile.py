"""User profile routes"""

from flask import Blueprint, request, jsonify
from database import get_authenticated_supabase_client
from utils.auth_utils import require_auth
from middleware.error_handler import NotFoundError, ValidationError
from .helpers import calculate_user_xp, get_user_skills

profile_bp = Blueprint('profile', __name__)

@profile_bp.route('/profile', methods=['GET'])
@require_auth
def get_profile(user_id):
    """Get user profile with XP breakdown"""
    supabase = get_authenticated_supabase_client()
    
    try:
        user = supabase.table('users').select('*').eq('id', user_id).single().execute()
        
        if not user.data:
            raise NotFoundError('User', user_id)
        
        # Calculate total XP and get skill breakdown
        total_xp, skill_breakdown = calculate_user_xp(supabase, user_id)
        
        # Add XP data to user profile
        user_data = user.data
        user_data['total_xp'] = total_xp
        user_data['skill_breakdown'] = skill_breakdown
        
        return jsonify(user_data), 200
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
    
    supabase = get_authenticated_supabase_client()
    
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