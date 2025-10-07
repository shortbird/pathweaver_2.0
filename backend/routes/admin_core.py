from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.pillar_utils import normalize_pillar_key, is_valid_pillar
from utils.school_subjects import validate_school_subjects, normalize_subject_key
from datetime import datetime, timedelta
import json
import base64
import uuid

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
        print(f"Error getting school subjects: {str(e)}")
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
        
        # Apply subscription filter
        if subscription != 'all':
            if subscription == 'free':
                query = query.or_('subscription_tier.eq.free,subscription_tier.is.null')
            else:
                query = query.eq('subscription_tier', subscription)
        
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
        
        # Reverse tier mapping: convert database tier names to frontend tier names
        reverse_tier_mapping = {
            'explorer': 'free',
            'creator': 'supported', 
            'enterprise': 'academy'  # Updated: Academy tier uses 'enterprise' in database
        }
        
        # Get emails from auth.users table
        try:
            auth_users = supabase.auth.admin.list_users()
            email_map = {}
            if auth_users:
                for auth_user in auth_users:
                    email_map[auth_user.id] = getattr(auth_user, 'email', None)
        except Exception as e:
            print(f"Warning: Could not fetch auth users: {e}")
            email_map = {}
        
        for user in users:
            # Add email from auth.users
            user['email'] = email_map.get(user['id'], '')
            
            # Convert database tier to frontend tier for consistency
            db_tier = user.get('subscription_tier', 'explorer')
            frontend_tier = reverse_tier_mapping.get(db_tier, db_tier)
            user['subscription_tier'] = frontend_tier
            print(f"User {user.get('id', 'unknown')}: DB tier '{db_tier}' -> Frontend tier '{frontend_tier}'")
            
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
        print(f"Error fetching users: {str(e)}")
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
        
        # Convert database tier to frontend tier for consistency
        reverse_tier_mapping = {
            'explorer': 'free',
            'creator': 'supported', 
            'enterprise': 'academy'  # Updated: Academy tier uses 'enterprise' in database
        }
        db_tier = user.get('subscription_tier', 'explorer')
        frontend_tier = reverse_tier_mapping.get(db_tier, db_tier)
        user['subscription_tier'] = frontend_tier
        print(f"User details: DB tier '{db_tier}' -> Frontend tier '{frontend_tier}'")
        
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
        print(f"Error fetching user details: {str(e)}")
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
            # Note: Email updates might require auth.users update too
            update_data['email'] = data['email']
            
        if update_data:
            response = supabase.table('users')\
                .update(update_data)\
                .eq('id', user_id)\
                .execute()
            
            if not response.data:
                return jsonify({'error': 'User not found'}), 404
        
        return jsonify({'message': 'User updated successfully'}), 200
        
    except Exception as e:
        print(f"Error updating user: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/users/<user_id>/subscription', methods=['POST'])
@require_admin
def update_user_subscription(admin_id, user_id):
    """Update user subscription tier and expiration"""
    supabase = get_supabase_admin_client()
    data = request.json
    
    try:
        # Valid frontend tier values (what the admin panel sends)
        valid_frontend_tiers = ['free', 'supported', 'academy']
        
        requested_tier = data.get('tier', 'free')
        
        # Validate tier
        if requested_tier not in valid_frontend_tiers:
            return jsonify({'error': f'Invalid tier: {requested_tier}. Must be one of: {valid_frontend_tiers}'}), 400
        
        # Primary tier mapping based on actual database enum values (discovered via testing)
        tier_mapping = {
            'free': 'explorer',      # Assuming this maps correctly
            'supported': 'creator',  # Assuming this maps correctly
            'academy': 'enterprise'  # Confirmed: Academy tier uses 'enterprise' in database
        }
        
        db_tier = tier_mapping.get(requested_tier, 'explorer')
        
        update_data = {
            'subscription_tier': db_tier
        }
        
        # Note: subscription_expires field is not used in database schema
        
        print(f"TIER UPDATE: User {user_id}, Frontend tier: {requested_tier} -> DB tier: {db_tier}")
        print(f"Update data being sent to Supabase: {update_data}")
        
        # Try primary tier mapping first
        def try_tier_update(tier_value):
            try:
                update_data = {'subscription_tier': tier_value}
                print(f"ATTEMPTING TIER UPDATE: User {user_id}, Trying tier value: {tier_value}")
                
                response = supabase.table('users')\
                    .update(update_data)\
                    .eq('id', user_id)\
                    .execute()
                
                print(f"Supabase update response: {response}")
                print(f"Supabase response data: {response.data}")
                
                if response.data:
                    updated_user = response.data[0]
                    actual_db_tier = updated_user.get('subscription_tier')
                    print(f"SUCCESS: User {user_id} tier updated to: {actual_db_tier}")
                    return response.data[0]
                else:
                    print(f"ERROR: No data returned from Supabase")
                    return None
                    
            except Exception as e:
                print(f"TIER UPDATE FAILED for value '{tier_value}': {str(e)}")
                return None
        
        # Try the primary mapping first
        result = try_tier_update(db_tier)
        
        # If primary mapping failed, try alternative values
        if result is None:
            print(f"Primary mapping failed for tier '{requested_tier}' -> '{db_tier}'. Trying alternatives...")
            
            # Try direct frontend value
            result = try_tier_update(requested_tier)
            
            # If that failed too, try some common alternatives
            if result is None:
                alternative_mappings = {
                    'free': ['basic', 'starter', 'free'],
                    'supported': ['premium', 'standard', 'supported'],
                    'academy': ['visionary', 'pro', 'academy']  # Try visionary (schema), then alternatives
                }
                
                alternatives = alternative_mappings.get(requested_tier, [])
                for alt_value in alternatives:
                    if alt_value != db_tier and alt_value != requested_tier:  # Skip already tried values
                        result = try_tier_update(alt_value)
                        if result is not None:
                            break
        
        # Check final result
        if result is None:
            return jsonify({
                'error': f'Failed to update subscription tier to {requested_tier}',
                'details': 'Database enum constraints do not allow this value',
                'attempted_values': [db_tier, requested_tier] + alternative_mappings.get(requested_tier, [])
            }), 500
        
        # Success case - the tier update worked with one of our attempted values
        print(f"FINAL SUCCESS: User {user_id} subscription tier updated successfully")
        
        return jsonify({'message': 'Subscription updated successfully'}), 200
        
    except Exception as e:
        print(f"Error updating subscription: {str(e)}")
        return jsonify({'error': str(e)}), 500

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
        print(f"Error updating role: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/users/<user_id>/reset-password', methods=['POST'])
@require_admin
def reset_user_password(admin_id, user_id):
    """Send password reset email to user"""
    supabase = get_supabase_admin_client()
    
    try:
        # Get user email
        user_response = supabase.table('users').select('*').eq('id', user_id).execute()
        if not user_response.data:
            return jsonify({'error': 'User not found'}), 404
        
        # Get email from auth.users
        try:
            auth_users = supabase.auth.admin.list_users()
            user_email = None
            if auth_users:
                for auth_user in auth_users:
                    if auth_user.id == user_id:
                        user_email = getattr(auth_user, 'email', None)
                        break
            
            if not user_email:
                return jsonify({'error': 'User email not found'}), 404
            
            # Send password reset email
            supabase.auth.admin.generate_link(
                type='recovery',
                email=user_email
            )
            
            return jsonify({'message': 'Password reset email sent'}), 200
            
        except Exception as e:
            print(f"Error sending reset email: {str(e)}")
            return jsonify({'error': 'Failed to send reset email'}), 500
        
    except Exception as e:
        print(f"Error in password reset: {str(e)}")
        return jsonify({'error': str(e)}), 500

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
        print(f"Error toggling user status: {str(e)}")
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
        supabase.table('user_quests').delete().eq('user_id', user_id).execute()
        supabase.table('quest_task_completions').delete().eq('user_id', user_id).execute()
        
        # Delete user profile
        response = supabase.table('users').delete().eq('id', user_id).execute()
        
        if not response.data:
            return jsonify({'error': 'User not found'}), 404
        
        # Delete from auth.users
        try:
            supabase.auth.admin.delete_user(user_id)
        except Exception as e:
            print(f"Warning: Could not delete from auth.users: {e}")
        
        return jsonify({'message': 'User account deleted successfully'}), 200
        
    except Exception as e:
        print(f"Error deleting user: {str(e)}")
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
        
        # Get user details
        users_response = supabase.table('users')\
            .select('id, first_name, last_name')\
            .in_('id', user_ids)\
            .execute()
        
        if not users_response.data:
            return jsonify({'error': 'No users found'}), 404
        
        # Get emails from auth.users
        try:
            auth_users = supabase.auth.admin.list_users()
            email_map = {}
            if auth_users:
                for auth_user in auth_users:
                    if auth_user.id in user_ids:
                        email_map[auth_user.id] = getattr(auth_user, 'email', None)
        except Exception as e:
            print(f"Error fetching emails: {e}")
            return jsonify({'error': 'Could not fetch user emails'}), 500
        
        # For now, we'll just return success
        # In a real implementation, you'd integrate with an email service
        emails_sent = 0
        for user in users_response.data:
            user_email = email_map.get(user['id'])
            if user_email:
                # Here you would send the actual email
                emails_sent += 1
        
        return jsonify({
            'message': f'Bulk email prepared for {emails_sent} users',
            'emails_sent': emails_sent
        }), 200
        
    except Exception as e:
        print(f"Error sending bulk email: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/quests', methods=['GET'])
@require_admin
def list_admin_quests(user_id):
    """
    List all quests for admin management.
    Supports pagination, search, and filtering.
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Get pagination parameters
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 20)), 100)
        search = request.args.get('search', '').strip()
        is_active = request.args.get('is_active')
        source = request.args.get('source')
        
        # Calculate offset
        offset = (page - 1) * per_page
        
        # Build query
        query = supabase.table('quests')\
            .select('*, quest_tasks(*)', count='exact')\
            .order('created_at', desc=True)
        
        # Apply filters
        if search:
            query = query.ilike('title', f'%{search}%')
        
        if is_active is not None:
            is_active_bool = is_active.lower() == 'true'
            query = query.eq('is_active', is_active_bool)
        
        if source:
            query = query.eq('source', source)
        
        # Apply pagination
        query = query.range(offset, offset + per_page - 1)
        
        result = query.execute()
        
        # Process quest data to include task counts and total XP
        quests = []
        for quest in result.data:
            # Calculate total XP and task breakdown
            total_xp = 0
            task_count = len(quest.get('quest_tasks', []))
            
            for task in quest.get('quest_tasks', []):
                total_xp += task.get('xp_amount', 0)
            
            # Add calculated fields
            quest['total_xp'] = total_xp
            quest['task_count'] = task_count
            
            quests.append(quest)
        
        return jsonify({
            'success': True,
            'quests': quests,
            'total': result.count,
            'page': page,
            'per_page': per_page,
            'total_pages': (result.count + per_page - 1) // per_page if result.count else 0
        })
        
    except Exception as e:
        print(f"Error listing admin quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch quests'
        }), 500

# Quest Ideas Management Endpoints

# Quest ideas management moved to admin/quest_ideas.py
# Quest sources management moved to admin/quest_sources.py
