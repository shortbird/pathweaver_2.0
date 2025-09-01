"""
Quick endpoint to fix missing user profiles
"""
from flask import Blueprint, jsonify
from database import get_supabase_client, get_supabase_admin_client
from utils.auth.decorators import require_auth
from datetime import datetime

bp = Blueprint('user_fix', __name__)

@bp.route('/fix-profile', methods=['POST'])
@require_auth
def fix_user_profile(user_id):
    """Create missing user profile in public.users table"""
    
    try:
        # Check if user already exists
        supabase = get_supabase_client()
        existing = supabase.table('users').select('id').eq('id', user_id).execute()
        
        if existing.data and len(existing.data) > 0:
            return jsonify({
                'message': 'User profile already exists',
                'user': existing.data[0],
                'user_id': user_id
            }), 200
        
        # Get user email from auth
        admin_supabase = get_supabase_admin_client()
        auth_user = admin_supabase.auth.admin.get_user_by_id(user_id)
        
        if not auth_user or not auth_user.user:
            return jsonify({'error': 'User not found in auth'}), 404
        
        email = auth_user.user.email
        
        # Extract username from email (before @)
        username = email.split('@')[0]
        
        # Create user profile
        new_user = {
            'id': user_id,
            'username': username,
            'email': email,
            'first_name': '',
            'last_name': '',
            'role': 'student',
            'subscription_tier': 'free',
            'created_at': datetime.now().isoformat(),
            'is_active': True,
            'onboarding_completed': False
        }
        
        # Use upsert to handle potential conflicts
        result = supabase.table('users').upsert(new_user, on_conflict='id').execute()
        
        if result.data:
            return jsonify({
                'message': 'User profile created successfully',
                'user': result.data[0]
            }), 201
        else:
            return jsonify({'error': 'Failed to create user profile'}), 500
            
    except Exception as e:
        print(f"Error fixing user profile: {e}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        
        # Check if it's a unique constraint violation
        if 'duplicate key' in str(e).lower() or 'already exists' in str(e).lower():
            # Try to fetch the existing user
            try:
                existing = supabase.table('users').select('*').eq('id', user_id).execute()
                if existing.data:
                    return jsonify({
                        'message': 'User profile already exists',
                        'user': existing.data[0]
                    }), 200
            except:
                pass
        
        return jsonify({
            'error': 'Failed to fix user profile',
            'details': str(e)
        }), 500