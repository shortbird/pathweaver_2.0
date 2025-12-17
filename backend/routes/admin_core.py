"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED - Utility/Helper Endpoints
- Helper endpoints (school subjects lookup, pillar normalization)
- Minimal database access (mostly static data/utility functions)
- Not suitable for repository abstraction
- Utility endpoints don't follow standard CRUD patterns

Admin Core Routes
Utility and helper endpoints for admin panel
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
from utils.pillar_utils import is_valid_pillar
from utils.pillar_mapping import normalize_pillar_name
from utils.school_subjects import validate_school_subjects, normalize_subject_key
from datetime import datetime, timedelta
import json
import base64
import uuid

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin', __name__, url_prefix='/api/admin')

@bp.route('/school-subjects', methods=['GET'])
def get_school_subjects():
    """
    Get all available school subjects for quest creation.
    Public endpoint - no auth required for getting subject list.
    """
    try:
        from utils.school_subjects import get_all_subjects_with_info
        subjects = get_all_subjects_with_info()
        
        return jsonify({
            'success': True,
            'school_subjects': subjects
        })
        
    except Exception as e:
        logger.error(f"Error getting school subjects: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch school subjects'
        }), 500


# ============================================================================
# REMOVED: Old quest management endpoints (originally lines 35-730)
# ============================================================================
# All quest creation/update/delete functions have been removed because:
# 1. They create quest_tasks entries incompatible with personalized quest system
# 2. They are DUPLICATES of the v3 admin endpoints in quest_management.py  
# 3. Frontend uses /api/v3/admin/quests/* endpoints exclusively
#
# Removed functions (~696 lines):
# - create_quest_v3_clean() - POST /api/admin/quests/create-v3
# - create_quest_v2() - POST /api/admin/quests/create  
# - create_quest() - POST /api/admin/quests
# - update_quest() - PUT /api/admin/quests/<quest_id>
# - delete_quest() - DELETE /api/admin/quests/<quest_id>
# - list_admin_quests() - GET /api/admin/quests
#
# All quest management now happens through /api/v3/admin/* endpoints
# which support the personalized quest system (user_quest_tasks)
# ============================================================================

# =============================================================================
# USER MANAGEMENT ENDPOINTS - V3
# =============================================================================

# Using repository pattern for database access
@bp.route('/users', methods=['GET'])
@require_admin
def get_users_list(user_id):
    """Get paginated list of users with search and filtering capabilities"""
    supabase = get_supabase_admin_client()
    
    try:
        # Get query parameters
        page = request.args.get('page', 1, type=int)
        limit = request.args.get('limit', 20, type=int)
        search = request.args.get('search', '')
        subscription = request.args.get('subscription', 'all')
        role = request.args.get('role', 'all')
        activity = request.args.get('activity', 'all')
        sort_by = request.args.get('sort_by', 'created_at')
        sort_order = request.args.get('sort_order', 'desc')
        
        # Start building query
        query = supabase.table('users').select('*', count='exact')
        
        # Apply search filter
        if search:
            # Build search query safely
            query = query.or_(f"first_name.ilike.%{search}%,last_name.ilike.%{search}%,username.ilike.%{search}%")
        
        # Subscription filter removed - no subscription tiers in Phase 2
        
        # Apply role filter
        if role != 'all':
            query = query.eq('role', role)
        
        # Apply activity filter
        if activity != 'all':
            from datetime import datetime, timedelta
            if activity == 'active_7':
                cutoff = (datetime.utcnow() - timedelta(days=7)).isoformat()
                query = query.gte('last_active', cutoff)
            elif activity == 'active_30':
                cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()
                query = query.gte('last_active', cutoff)
            elif activity == 'inactive':
                cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()
                query = query.or_(f'last_active.lt.{cutoff},last_active.is.null')
        
        # Apply sorting
        if sort_order == 'desc':
            query = query.order(sort_by, desc=True)
        else:
            query = query.order(sort_by)
        
        # Apply pagination
        start = (page - 1) * limit
        end = start + limit - 1
        query = query.range(start, end)
        
        # Execute query
        response = query.execute()
        
        # Enhance user data
        users = response.data if response.data else []

        # Email is already included in the users table SELECT * query
        # No need for separate auth.users lookup

        for user in users:
            # Calculate total XP across all pillars
            try:
                xp_response = supabase.table('user_skill_xp')\
                    .select('xp_amount')\
                    .eq('user_id', user['id'])\
                    .execute()
                
                user['total_xp'] = sum(x['xp_amount'] for x in xp_response.data) if xp_response.data else 0
            except Exception:
                user['total_xp'] = 0
        
        # Calculate total count for pagination
        total_count = response.count if hasattr(response, 'count') else len(users)
        
        return jsonify({
            'users': users,
            'total': total_count,
            'page': page,
            'limit': limit
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching users: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/users/<user_id>', methods=['GET'])
@require_admin
def get_user_details(admin_id, user_id):
    """Get detailed information about a specific user"""
    supabase = get_supabase_admin_client()
    
    try:
        # Get user details
        user_response = supabase.table('users').select('*').eq('id', user_id).execute()
        
        if not user_response.data:
            return jsonify({'error': 'User not found'}), 404
        
        user = user_response.data[0]

        # Get XP by pillar
        xp_response = supabase.table('user_skill_xp')\
            .select('pillar, xp_amount')\
            .eq('user_id', user_id)\
            .execute()
        
        xp_by_pillar = {}
        total_xp = 0
        if xp_response.data:
            for xp in xp_response.data:
                xp_by_pillar[xp['pillar']] = xp['xp_amount']
                total_xp += xp['xp_amount']
        
        # Get completed quests
        completed_quests_response = supabase.table('user_quests')\
            .select('*, quests(title)')\
            .eq('user_id', user_id)\
            .not_.is_('completed_at', 'null')\
            .order('completed_at', desc=True)\
            .execute()
        
        completed_quests = []
        quests_completed = 0
        if completed_quests_response.data:
            quests_completed = len(completed_quests_response.data)
            for quest in completed_quests_response.data:
                # Calculate XP for this quest completion
                quest_xp = 0  # We'd need to calculate this based on quest tasks
                completed_quests.append({
                    'id': quest.get('quest_id'),
                    'title': quest.get('quests', {}).get('title') if quest.get('quests') else 'Unknown Quest',
                    'completed_at': quest.get('completed_at'),
                    'xp_earned': quest_xp
                })
        
        return jsonify({
            'user': user,
            'xp_by_pillar': xp_by_pillar,
            'total_xp': total_xp,
            'completed_quests': completed_quests,
            'quests_completed': quests_completed,
            'last_active': user.get('last_active'),
            'current_streak': 0  # Could implement streak calculation
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching user details: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/users/<user_id>', methods=['PUT'])
@require_admin
def update_user_profile(admin_id, user_id):
    """Update user profile information"""
    supabase = get_supabase_admin_client()
    data = request.json

    try:
        # Update user profile
        update_data = {}
        if 'first_name' in data:
            update_data['first_name'] = data['first_name']
        if 'last_name' in data:
            update_data['last_name'] = data['last_name']
        if 'email' in data:
            update_data['email'] = data['email']
        if 'phone_number' in data:
            update_data['phone_number'] = data['phone_number']
        if 'address_line1' in data:
            update_data['address_line1'] = data['address_line1']
        if 'address_line2' in data:
            update_data['address_line2'] = data['address_line2']
        if 'city' in data:
            update_data['city'] = data['city']
        if 'state' in data:
            update_data['state'] = data['state']
        if 'postal_code' in data:
            update_data['postal_code'] = data['postal_code']
        if 'country' in data:
            update_data['country'] = data['country']
        if 'date_of_birth' in data:
            update_data['date_of_birth'] = data['date_of_birth']

        if update_data:
            response = supabase.table('users')\
                .update(update_data)\
                .eq('id', user_id)\
                .execute()

            if not response.data:
                return jsonify({'error': 'User not found'}), 404

        # If email was updated, also update auth.users
        if 'email' in data:
            try:
                supabase.auth.admin.update_user_by_id(
                    user_id,
                    {'email': data['email']}
                )
                logger.info(f"Admin {admin_id} updated email for user {user_id}")
            except Exception as e:
                logger.warning(f"Failed to update auth.users email: {e}")
                # Continue anyway since users table was updated successfully

        return jsonify({'message': 'User updated successfully'}), 200

    except Exception as e:
        logger.error(f"Error updating user: {str(e)}")
        return jsonify({'error': str(e)}), 500

# REMOVED: update_user_subscription endpoint (Phase 2 refactoring - January 2025)
# Subscription tier functionality removed - all users have equal access

@bp.route('/users/<user_id>/role', methods=['PUT'])
@require_admin
def update_user_role(admin_id, user_id):
    """Update user role with audit logging"""
    supabase = get_supabase_admin_client()
    data = request.json
    
    try:
        new_role = data.get('role')
        reason = data.get('reason', 'Role change by admin')
        
        # Validate role
        valid_roles = ['student', 'parent', 'advisor', 'admin']
        if new_role not in valid_roles:
            return jsonify({'error': 'Invalid role'}), 400
        
        # Update user role
        response = supabase.table('users')\
            .update({'role': new_role})\
            .eq('id', user_id)\
            .execute()
        
        if not response.data:
            return jsonify({'error': 'User not found'}), 404
        
        # Get role display name
        role_display_names = {
            'student': 'Student',
            'parent': 'Parent',
            'advisor': 'Advisor',
            'admin': 'Administrator'
        }
        
        return jsonify({
            'message': 'Role updated successfully',
            'display_name': role_display_names.get(new_role, new_role)
        }), 200
        
    except Exception as e:
        logger.error(f"Error updating role: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/users/<user_id>/reset-password', methods=['POST'])
@require_admin
def reset_user_password(admin_id, user_id):
    """Reset a user's password (admin only)"""
    supabase = get_supabase_admin_client()

    try:
        data = request.json
        new_password = data.get('new_password')

        if not new_password:
            return jsonify({'success': False, 'error': 'New password is required'}), 400

        # Validate password strength
        from utils.validation import validate_password
        is_valid, error_message = validate_password(new_password)
        if not is_valid:
            return jsonify({'success': False, 'error': error_message}), 400

        # Check if user exists
        user = supabase.table('users').select('email').eq('id', user_id).single().execute()

        if not user.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        user_email = user.data['email']

        # Update password using Supabase Admin API
        try:
            auth_response = supabase.auth.admin.update_user_by_id(
                user_id,
                {'password': new_password}
            )

            if not auth_response:
                return jsonify({'success': False, 'error': 'Failed to update password'}), 500

            # Clear any account lockouts for this user
            from backend.routes.auth import reset_login_attempts
            reset_login_attempts(user_email)

            logger.info(f"Admin {admin_id} reset password for user {user_id}")

            return jsonify({
                'success': True,
                'message': 'Password reset successfully'
            })

        except Exception as auth_error:
            logger.error(f"Error updating password via Supabase Auth: {str(auth_error)}")
            return jsonify({
                'success': False,
                'error': 'Failed to update password in authentication system'
            }), 500

    except Exception as e:
        logger.error(f"Error in password reset: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to reset password: {str(e)}'
        }), 500

@bp.route('/users/<user_id>/toggle-status', methods=['POST'])
@require_admin
def toggle_user_status(admin_id, user_id):
    """Enable or disable a user account"""
    supabase = get_supabase_admin_client()
    
    try:
        # Get current status
        user_response = supabase.table('users').select('status').eq('id', user_id).execute()
        if not user_response.data:
            return jsonify({'error': 'User not found'}), 404
        
        current_status = user_response.data[0].get('status', 'active')
        new_status = 'disabled' if current_status == 'active' else 'active'
        
        # Update status
        response = supabase.table('users')\
            .update({
                'status': new_status,
                'updated_at': datetime.utcnow().isoformat()
            })\
            .eq('id', user_id)\
            .execute()
        
        if not response.data:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'message': f'User account {"enabled" if new_status == "active" else "disabled"} successfully',
            'status': new_status
        }), 200
        
    except Exception as e:
        logger.error(f"Error toggling user status: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/users/<user_id>', methods=['DELETE'])
@require_admin
def delete_user_account(admin_id, user_id):
    """Permanently delete a user account and all associated data"""
    supabase = get_supabase_admin_client()
    
    try:
        # Delete user data in proper order to avoid foreign key violations

        # Delete user XP data
        supabase.table('user_skill_xp').delete().eq('user_id', user_id).execute()

        # Delete user quest enrollments and completions
        # NOTE: With CASCADE constraint, quest_task_completions will auto-delete when user_quest_tasks are deleted
        # But we delete explicitly here for clarity and to handle any edge cases
        supabase.table('quest_task_completions').delete().eq('user_id', user_id).execute()
        supabase.table('user_quest_tasks').delete().eq('user_id', user_id).execute()
        supabase.table('user_quests').delete().eq('user_id', user_id).execute()
        
        # Delete user profile
        response = supabase.table('users').delete().eq('id', user_id).execute()
        
        if not response.data:
            return jsonify({'error': 'User not found'}), 404
        
        # Delete from auth.users
        try:
            supabase.auth.admin.delete_user(user_id)
        except Exception as e:
            logger.warning(f"Warning: Could not delete from auth.users: {e}")
        
        return jsonify({'message': 'User account deleted successfully'}), 200
        
    except Exception as e:
        logger.error(f"Error deleting user: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/users/bulk-email', methods=['POST'])
@require_admin
def send_bulk_email(admin_id):
    """Send email to multiple users"""
    supabase = get_supabase_admin_client()
    data = request.json
    
    try:
        user_ids = data.get('user_ids', [])
        subject = data.get('subject', '')
        message = data.get('message', '')
        
        if not user_ids or not subject or not message:
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Get user details with email from users table
        users_response = supabase.table('users')\
            .select('id, first_name, last_name, email')\
            .in_('id', user_ids)\
            .execute()

        if not users_response.data:
            return jsonify({'error': 'No users found'}), 404

        # For now, we'll just return success
        # In a real implementation, you'd integrate with an email service
        emails_sent = 0
        for user in users_response.data:
            user_email = user.get('email')
            if user_email:
                # Here you would send the actual email
                emails_sent += 1
        
        return jsonify({
            'message': f'Bulk email prepared for {emails_sent} users',
            'emails_sent': emails_sent
        }), 200
        
    except Exception as e:
        logger.error(f"Error sending bulk email: {str(e)}")
        return jsonify({'error': str(e)}), 500

# ============================================================================
# REMOVED: Duplicate /quests endpoint (originally lines 639-706)
# ============================================================================
# This duplicate GET /api/admin/quests endpoint was removed because:
# 1. It used @require_admin decorator (blocking advisors)
# 2. It conflicts with the proper implementation in quest_management.py
# 3. quest_management.py uses @require_advisor (allows both advisors and admins)
# 4. Flask was routing to this duplicate first, causing authorization errors
#
# The proper endpoint is in routes/admin/quest_management.py (line 439)

# Quest Ideas Management Endpoints

# Quest ideas management moved to admin/quest_ideas.py
# Quest sources management moved to admin/quest_sources.py
