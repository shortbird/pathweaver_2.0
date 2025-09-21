"""
Admin User Management Routes

Handles user CRUD operations, subscription management, role changes,
and user status updates for admin interface.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from datetime import datetime, timedelta
import json

bp = Blueprint('admin_user_management', __name__, url_prefix='/api/v3/admin')

@bp.route('/users', methods=['GET'])
@require_admin
def get_users(user_id):
    """Get all users with filtering and pagination for admin dashboard"""
    supabase = get_supabase_admin_client()

    try:
        # Get filter parameters
        subscription_filter = request.args.get('subscription', 'all')
        role_filter = request.args.get('role', 'all')
        activity_filter = request.args.get('activity', 'all')
        search_term = request.args.get('search', '').strip()
        sort_by = request.args.get('sortBy', 'created_at')
        sort_order = request.args.get('sortOrder', 'desc')

        # Pagination
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 20)), 100)
        offset = (page - 1) * per_page

        # Build query
        query = supabase.table('users').select('*', count='exact')

        # Apply filters
        if subscription_filter != 'all':
            query = query.eq('subscription_tier', subscription_filter)

        if role_filter != 'all':
            query = query.eq('role', role_filter)

        if activity_filter == 'active':
            # Users who logged in within last 30 days
            cutoff_date = (datetime.utcnow() - timedelta(days=30)).isoformat()
            query = query.gte('last_login_at', cutoff_date)
        elif activity_filter == 'inactive':
            # Users who haven't logged in within last 30 days or never
            cutoff_date = (datetime.utcnow() - timedelta(days=30)).isoformat()
            query = query.or_(f'last_login_at.lt.{cutoff_date},last_login_at.is.null')

        # Apply search
        if search_term:
            # Search across name and email fields
            search_query = f'first_name.ilike.%{search_term}%,last_name.ilike.%{search_term}%,email.ilike.%{search_term}%'
            query = query.or_(search_query)

        # Apply sorting
        ascending = sort_order == 'asc'
        query = query.order(sort_by, desc=not ascending)

        # Apply pagination
        query = query.range(offset, offset + per_page - 1)

        result = query.execute()

        return jsonify({
            'success': True,
            'users': result.data,
            'total': result.count,
            'page': page,
            'per_page': per_page,
            'total_pages': (result.count + per_page - 1) // per_page if result.count else 0
        })

    except Exception as e:
        print(f"Error getting users: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve users'
        }), 500

@bp.route('/users/<target_user_id>', methods=['GET'])
@require_admin
def get_user_details(user_id, target_user_id):
    """Get detailed information about a specific user"""
    supabase = get_supabase_admin_client()

    try:
        # Get user with related data
        user = supabase.table('users').select('*').eq('id', target_user_id).single().execute()

        if not user.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        # Get user stats
        stats = {}

        # Get quest completions
        completions = supabase.table('user_quests')\
            .select('*', count='exact')\
            .eq('user_id', target_user_id)\
            .not_.is_('completed_at', 'null')\
            .execute()
        stats['completed_quests'] = completions.count

        # Get active enrollments
        active = supabase.table('user_quests')\
            .select('*', count='exact')\
            .eq('user_id', target_user_id)\
            .eq('is_active', True)\
            .execute()
        stats['active_quests'] = active.count

        # Get total XP
        xp_data = supabase.table('user_skill_xp')\
            .select('xp_amount')\
            .eq('user_id', target_user_id)\
            .execute()
        stats['total_xp'] = sum(record['xp_amount'] for record in xp_data.data) if xp_data.data else 0

        return jsonify({
            'success': True,
            'user': user.data,
            'stats': stats
        })

    except Exception as e:
        print(f"Error getting user details: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve user details'
        }), 500

@bp.route('/users/<target_user_id>', methods=['PUT'])
@require_admin
def update_user(user_id, target_user_id):
    """Update user information"""
    supabase = get_supabase_admin_client()

    try:
        data = request.json

        # Build update data
        update_data = {}
        allowed_fields = ['first_name', 'last_name', 'subscription_tier', 'subscription_status']

        for field in allowed_fields:
            if field in data:
                update_data[field] = data[field]

        if not update_data:
            return jsonify({'success': False, 'error': 'No valid fields to update'}), 400

        update_data['updated_at'] = datetime.utcnow().isoformat()

        # Update user
        result = supabase.table('users').update(update_data).eq('id', target_user_id).execute()

        if not result.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        return jsonify({
            'success': True,
            'message': 'User updated successfully',
            'user': result.data[0]
        })

    except Exception as e:
        print(f"Error updating user: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to update user: {str(e)}'
        }), 500

@bp.route('/users/<target_user_id>/subscription', methods=['POST'])
@require_admin
def update_user_subscription(user_id, target_user_id):
    """Update user subscription tier"""
    supabase = get_supabase_admin_client()

    try:
        data = request.json
        new_tier = data.get('subscription_tier')

        if not new_tier:
            return jsonify({'success': False, 'error': 'Subscription tier is required'}), 400

        valid_tiers = ['free', 'explorer', 'creator', 'visionary']
        if new_tier not in valid_tiers:
            return jsonify({'success': False, 'error': f'Invalid subscription tier. Must be one of: {valid_tiers}'}), 400

        # Update subscription
        update_data = {
            'subscription_tier': new_tier,
            'subscription_status': 'active',
            'updated_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('users').update(update_data).eq('id', target_user_id).execute()

        if not result.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        return jsonify({
            'success': True,
            'message': f'User subscription updated to {new_tier}',
            'user': result.data[0]
        })

    except Exception as e:
        print(f"Error updating subscription: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to update subscription: {str(e)}'
        }), 500

@bp.route('/users/<target_user_id>/role', methods=['PUT'])
@require_admin
def update_user_role(user_id, target_user_id):
    """Update user role"""
    supabase = get_supabase_admin_client()

    try:
        data = request.json
        new_role = data.get('role')

        if not new_role:
            return jsonify({'success': False, 'error': 'Role is required'}), 400

        valid_roles = ['student', 'parent', 'advisor', 'educator', 'admin']
        if new_role not in valid_roles:
            return jsonify({'success': False, 'error': f'Invalid role. Must be one of: {valid_roles}'}), 400

        # Prevent user from removing their own admin role
        if target_user_id == user_id and new_role != 'admin':
            return jsonify({'success': False, 'error': 'Cannot remove your own admin privileges'}), 403

        # Update role
        update_data = {
            'role': new_role,
            'updated_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('users').update(update_data).eq('id', target_user_id).execute()

        if not result.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        return jsonify({
            'success': True,
            'message': f'User role updated to {new_role}',
            'user': result.data[0]
        })

    except Exception as e:
        print(f"Error updating role: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to update role: {str(e)}'
        }), 500

@bp.route('/users/<target_user_id>/toggle-status', methods=['POST'])
@require_admin
def toggle_user_status(user_id, target_user_id):
    """Toggle user active/inactive status"""
    supabase = get_supabase_admin_client()

    try:
        # Prevent admin from deactivating themselves
        if target_user_id == user_id:
            return jsonify({'success': False, 'error': 'Cannot deactivate your own account'}), 403

        # Get current user
        user = supabase.table('users').select('subscription_status').eq('id', target_user_id).single().execute()

        if not user.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        current_status = user.data.get('subscription_status', 'active')
        new_status = 'inactive' if current_status == 'active' else 'active'

        # Update status
        update_data = {
            'subscription_status': new_status,
            'updated_at': datetime.utcnow().isoformat()
        }

        result = supabase.table('users').update(update_data).eq('id', target_user_id).execute()

        return jsonify({
            'success': True,
            'message': f'User status changed to {new_status}',
            'user': result.data[0]
        })

    except Exception as e:
        print(f"Error toggling user status: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to update user status: {str(e)}'
        }), 500

@bp.route('/users/<target_user_id>', methods=['DELETE'])
@require_admin
def delete_user(user_id, target_user_id):
    """Delete a user account (admin only)"""
    supabase = get_supabase_admin_client()

    try:
        # Prevent admin from deleting themselves
        if target_user_id == user_id:
            return jsonify({'success': False, 'error': 'Cannot delete your own account'}), 403

        # Check if user exists
        user = supabase.table('users').select('*').eq('id', target_user_id).single().execute()

        if not user.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        # Delete user (cascade should handle related records)
        supabase.table('users').delete().eq('id', target_user_id).execute()

        return jsonify({
            'success': True,
            'message': 'User deleted successfully'
        })

    except Exception as e:
        print(f"Error deleting user: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to delete user: {str(e)}'
        }), 500