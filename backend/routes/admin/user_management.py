"""
Admin User Management Routes

Handles user CRUD operations, subscription management, role changes,
user status updates, and chat log viewing for admin interface.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
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
from utils.auth.decorators import require_admin
from utils.api_response import success_response, error_response
from datetime import datetime, timedelta
import json

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_user_management', __name__, url_prefix='/api/admin')

# Using repository pattern for database access
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

        users = result.data if result.data else []

        return jsonify({
            'success': True,
            'users': users,
            'total': result.count,
            'page': page,
            'per_page': per_page,
            'total_pages': (result.count + per_page - 1) // per_page if result.count else 0
        })

    except Exception as e:
        logger.error(f"Error getting users: {str(e)}")
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

        user_data = user.data

        return jsonify({
            'success': True,
            'user': user_data,
            'stats': stats
        })

    except Exception as e:
        logger.error(f"Error getting user details: {str(e)}")
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

        # Note: users table has no updated_at column

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
        logger.error(f"Error updating user: {str(e)}")
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
        subscription_tier = data.get('subscription_tier')

        if not subscription_tier:
            return jsonify({'success': False, 'error': 'Subscription tier is required'}), 400

        # Fetch valid tier keys from database (single source of truth)
        tiers_result = supabase.table('subscription_tiers').select('tier_key, display_name').eq('is_active', True).execute()
        valid_tiers = [tier['tier_key'] for tier in tiers_result.data] if tiers_result.data else []

        if not valid_tiers:
            logger.warning("Warning: No active subscription tiers found in database")
            valid_tiers = ['Explore', 'Accelerate', 'Achieve', 'Excel']  # Fallback

        if subscription_tier not in valid_tiers:
            return jsonify({'success': False, 'error': f'Invalid subscription tier. Must be one of: {valid_tiers}'}), 400

        # Update subscription
        update_data = {
            'subscription_tier': subscription_tier,
            'subscription_status': 'active'
        }

        result = supabase.table('users').update(update_data).eq('id', target_user_id).execute()

        if not result.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        return jsonify({
            'success': True,
            'message': f'User subscription updated to {subscription_tier}',
            'user': result.data[0]
        })

    except Exception as e:
        logger.error(f"Error updating subscription: {str(e)}")
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

        # Update role (note: users table has no updated_at column)
        update_data = {
            'role': new_role
        }

        logger.info(f"Attempting to update role for user {target_user_id} to {new_role}")
        result = supabase.table('users').update(update_data).eq('id', target_user_id).execute()

        # Check for errors in the response
        if hasattr(result, 'error') and result.error:
            error_msg = str(result.error)
            logger.error(f"Supabase error updating role: {error_msg}")
            return jsonify({
                'success': False,
                'error': f'Database error: {error_msg}'
            }), 500

        if not result.data or len(result.data) == 0:
            logger.info(f"No data returned after role update for user {target_user_id}")
            return jsonify({'success': False, 'error': 'User not found or update failed'}), 404

        logger.info(f"Successfully updated role for user {target_user_id}")
        return jsonify({
            'success': True,
            'message': f'User role updated to {new_role}',
            'user': result.data[0]
        })

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"Error updating role: {str(e)}")
        logger.error(f"Full traceback: {error_trace}")
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

        # Update status (note: users table has no updated_at column)
        update_data = {
            'subscription_status': new_status
        }

        result = supabase.table('users').update(update_data).eq('id', target_user_id).execute()

        return jsonify({
            'success': True,
            'message': f'User status changed to {new_status}',
            'user': result.data[0]
        })

    except Exception as e:
        logger.error(f"Error toggling user status: {str(e)}")
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
        logger.error(f"Error deleting user: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to delete user: {str(e)}'
        }), 500

@bp.route('/users/<user_id>/conversations', methods=['GET'])
@require_admin
def get_user_conversations(admin_user_id, user_id):
    """Get all conversations for a specific user (admin only)"""
    try:
        supabase = get_supabase_admin_client()

        # Get query parameters
        limit = min(int(request.args.get('limit', 50)), 100)
        offset = int(request.args.get('offset', 0))

        # Get user's conversations
        conversations_query = supabase.table('tutor_conversations').select('''
            id, title, conversation_mode, quest_id, task_id,
            is_active, message_count, last_message_at, created_at,
            quests(title)
        ''').eq('user_id', user_id).order('last_message_at', desc=True).range(offset, offset + limit - 1)

        conversations_result = conversations_query.execute()

        # Get user info for context
        user_query = supabase.table('users').select('id, first_name, last_name, email').eq('id', user_id).single()
        user_result = user_query.execute()

        return success_response({
            'user': user_result.data,
            'conversations': conversations_result.data,
            'total': len(conversations_result.data),
            'limit': limit,
            'offset': offset
        })

    except Exception as e:
        logger.error(f"Error fetching user conversations: {str(e)}")
        return error_response(f"Failed to fetch conversations: {str(e)}", status_code=500, error_code="internal_error")

@bp.route('/conversations/<conversation_id>', methods=['GET'])
@require_admin
def get_conversation_details(admin_user_id, conversation_id):
    """Get conversation details with all messages (admin only)"""
    try:
        supabase = get_supabase_admin_client()

        # Get conversation details (without user join - auth.users not accessible via PostgREST)
        conversation_query = supabase.table('tutor_conversations').select('''
            id, title, conversation_mode, quest_id, task_id, user_id,
            is_active, message_count, last_message_at, created_at,
            quests(title)
        ''').eq('id', conversation_id).single()

        conversation_result = conversation_query.execute()

        # Get user info separately from public.users table
        if conversation_result.data:
            user_query = supabase.table('users').select('first_name, last_name, email').eq('id', conversation_result.data['user_id']).single()
            user_result = user_query.execute()

            # Add user info to conversation data
            if user_result.data:
                conversation_result.data['user'] = user_result.data

        # Get all messages for this conversation
        messages_query = supabase.table('tutor_messages').select('''
            id, role, content, safety_level, created_at, context_data
        ''').eq('conversation_id', conversation_id).order('created_at')

        messages_result = messages_query.execute()

        return success_response({
            'conversation': conversation_result.data,
            'messages': messages_result.data,
            'message_count': len(messages_result.data)
        })

    except Exception as e:
        logger.error(f"Error fetching conversation details: {str(e)}")
        return error_response(f"Failed to fetch conversation details: {str(e)}", status_code=500, error_code="internal_error")

@bp.route('/users/<target_user_id>/quest-enrollments', methods=['GET'])
@require_admin
def get_user_quest_enrollments(user_id, target_user_id):
    """
    Get all quests for a student - both enrolled and available.
    Used by advisors to add tasks to student quests.
    """
    supabase = get_supabase_admin_client()

    try:
        # Get all active quests
        all_quests = supabase.table('quests')\
            .select('id, title, big_idea, description, source')\
            .eq('is_active', True)\
            .order('created_at', desc=True)\
            .execute()

        # Get student's enrollments
        enrollments = supabase.table('user_quests')\
            .select('*, quests(id, title, big_idea, description)')\
            .eq('user_id', target_user_id)\
            .eq('is_active', True)\
            .execute()

        # Get task counts for enrolled quests
        enrolled_quest_ids = [e['quest_id'] for e in enrollments.data] if enrollments.data else []
        task_counts = {}

        if enrolled_quest_ids:
            for quest_id in enrolled_quest_ids:
                tasks = supabase.table('user_quest_tasks')\
                    .select('id', count='exact')\
                    .eq('quest_id', quest_id)\
                    .eq('user_id', target_user_id)\
                    .execute()
                task_counts[quest_id] = tasks.count or 0

        # Build enrolled quests list
        enrolled_quests = []
        for enrollment in (enrollments.data or []):
            quest = enrollment.get('quests', {})
            enrolled_quests.append({
                'quest_id': enrollment['quest_id'],
                'user_quest_id': enrollment['id'],
                'title': quest.get('title', 'Unknown Quest'),
                'big_idea': quest.get('big_idea', ''),
                'description': quest.get('description', ''),
                'task_count': task_counts.get(enrollment['quest_id'], 0),
                'started_at': enrollment.get('started_at'),
                'completed_at': enrollment.get('completed_at'),
                'is_enrolled': True
            })

        # Build available quests list (not enrolled)
        available_quests = []
        for quest in (all_quests.data or []):
            if quest['id'] not in enrolled_quest_ids:
                available_quests.append({
                    'quest_id': quest['id'],
                    'title': quest['title'],
                    'big_idea': quest.get('big_idea', ''),
                    'description': quest.get('description', ''),
                    'source': quest.get('source', 'optio'),
                    'is_enrolled': False
                })

        return jsonify({
            'success': True,
            'enrolled_quests': enrolled_quests,
            'available_quests': available_quests,
            'total_enrolled': len(enrolled_quests),
            'total_available': len(available_quests)
        })

    except Exception as e:
        logger.error(f"Error getting quest enrollments: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve quest enrollments'
        }), 500