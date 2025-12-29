"""
REPOSITORY MIGRATION: PARTIALLY MIGRATED - Needs Completion
- Already imports UserRepository (lines 10-20)
- BUT: Many endpoints still use direct database access
- Mixed pattern creates inconsistency
- User role changes, status updates, chat logs - all via direct DB calls
- Should consolidate user management into UserRepository methods

Recommendation: Complete migration by using existing UserRepository for all user operations

Admin User Management Routes

Handles user CRUD operations, subscription management, role changes,
user status updates, and chat log viewing for admin interface.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from repositories import (
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
from utils.auth.decorators import require_admin, require_advisor, get_advisor_assigned_students
from utils.api_response import success_response, error_response
from datetime import datetime, timedelta
import json
import uuid
import magic
from werkzeug.utils import secure_filename

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_user_management', __name__, url_prefix='/api/admin')

# Using repository pattern for database access
@bp.route('/users', methods=['GET'])
@require_advisor
def get_users(user_id):
    """
    Get all users with filtering and pagination for admin dashboard.
    Advisors see only their assigned students; admins see all users.
    """
    supabase = get_supabase_admin_client()

    try:
        # Get filter parameters
        subscription_filter = request.args.get('subscription', 'all')
        role_filter = request.args.get('role', 'all')
        activity_filter = request.args.get('activity', 'all')
        organization_filter = request.args.get('organization', 'all')
        search_term = request.args.get('search', '').strip()
        sort_by = request.args.get('sortBy', 'created_at')
        sort_order = request.args.get('sortOrder', 'desc')

        # Pagination
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 20)), 100)
        offset = (page - 1) * per_page

        # Get assigned students for advisor filtering
        # Returns None for admins (all students), list of student IDs for advisors
        assigned_student_ids = get_advisor_assigned_students(user_id)

        # Build query
        query = supabase.table('users').select('*', count='exact')

        # Advisors can only see their assigned students
        if assigned_student_ids is not None:  # None means admin (all access)
            if len(assigned_student_ids) == 0:
                # Advisor with no assigned students - return empty list
                return jsonify({
                    'success': True,
                    'users': [],
                    'total': 0,
                    'page': page,
                    'per_page': per_page,
                    'total_pages': 0
                })
            # Filter to only assigned students
            query = query.in_('id', assigned_student_ids)
            # Force role filter to 'student' for advisors
            query = query.eq('role', 'student')

        # Apply filters (skip role filter if advisor already applied it)
        # Subscription filter removed - no subscription tiers in Phase 2

        if role_filter != 'all' and assigned_student_ids is None:  # Only admins can filter by role
            query = query.eq('role', role_filter)

        # Organization filter
        if organization_filter != 'all':
            if organization_filter == 'none':
                query = query.is_('organization_id', 'null')
            else:
                query = query.eq('organization_id', organization_filter)

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

        # Enrich with organization names
        if users:
            # Get unique organization IDs
            org_ids = list(set(u.get('organization_id') for u in users if u.get('organization_id')))
            org_names = {}

            if org_ids:
                orgs_response = supabase.table('organizations')\
                    .select('id, name')\
                    .in_('id', org_ids)\
                    .execute()
                if orgs_response.data:
                    org_names = {o['id']: o['name'] for o in orgs_response.data}

            # Add organization_name to each user
            for user in users:
                user['organization_name'] = org_names.get(user.get('organization_id'))

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
    print(f"[USER DETAILS] ===== ENDPOINT CALLED for user {target_user_id} =====", flush=True)
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

        # Include organization data if user has an organization
        print(f"[USER DETAILS] user_data org_id: {user_data.get('organization_id')}", flush=True)
        if user_data.get('organization_id'):
            org_response = supabase.table('organizations')\
                .select('id, name, slug')\
                .eq('id', user_data['organization_id'])\
                .maybe_single()\
                .execute()
            print(f"[USER DETAILS] org_response.data: {org_response.data}", flush=True)
            if org_response.data:
                user_data['organization'] = org_response.data
                user_data['organization_name'] = org_response.data['name']
        print(f"[USER DETAILS] Final org_name: {user_data.get('organization_name')}", flush=True)

        return jsonify({
            'success': True,
            **user_data,
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
        allowed_fields = [
            'first_name', 'last_name', 'email',
            'phone_number', 'address_line1', 'address_line2',
            'city', 'state', 'postal_code', 'country',
            'date_of_birth'
        ]

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

        valid_roles = ['student', 'parent', 'advisor', 'educator', 'admin', 'school_admin']
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

@bp.route('/users/<target_user_id>', methods=['DELETE'])
@require_admin
def delete_user(user_id, target_user_id):
    """Delete a user account from both auth.users and public.users (admin only)"""
    supabase = get_supabase_admin_client()

    try:
        # Prevent admin from deleting themselves
        if target_user_id == user_id:
            return jsonify({'success': False, 'error': 'Cannot delete your own account'}), 403

        # Check if user exists in public.users
        user = supabase.table('users').select('*').eq('id', target_user_id).single().execute()

        if not user.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        # Step 1: Delete from auth.users first (source of truth for authentication)
        try:
            supabase.auth.admin.delete_user(target_user_id)
            logger.info(f"Deleted user {target_user_id} from auth.users")
        except Exception as auth_error:
            logger.error(f"Error deleting from auth.users: {str(auth_error)}")
            # Continue to delete from public.users even if auth deletion fails
            # (user might only exist in public.users due to sync issues)

        # Step 2: Delete from public.users (cascade should handle related records)
        supabase.table('users').delete().eq('id', target_user_id).execute()
        logger.info(f"Deleted user {target_user_id} from public.users")

        return jsonify({
            'success': True,
            'message': 'User deleted successfully from both authentication and profile tables'
        })

    except Exception as e:
        logger.error(f"Error deleting user: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to delete user: {str(e)}'
        }), 500

@bp.route('/users/<target_user_id>/reset-password', methods=['POST'])
@require_admin
def admin_reset_password(user_id, target_user_id):
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
        user = supabase.table('users').select('email').eq('id', target_user_id).single().execute()

        if not user.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        user_email = user.data['email']

        # Update password using Supabase Admin API
        try:
            auth_response = supabase.auth.admin.update_user_by_id(
                target_user_id,
                {'password': new_password}
            )

            if not auth_response:
                return jsonify({'success': False, 'error': 'Failed to update password'}), 500

            # Clear any account lockouts for this user
            from routes.auth import reset_login_attempts
            reset_login_attempts(user_email)

            logger.info(f"Admin {user_id} reset password for user {target_user_id}")

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
        logger.error(f"Error resetting password: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to reset password: {str(e)}'
        }), 500

@bp.route('/users/<target_user_id>/verify-email', methods=['POST'])
@require_admin
def admin_verify_email(user_id, target_user_id):
    """Manually verify a user's email (admin only)"""
    supabase = get_supabase_admin_client()

    try:
        # Check if user exists
        user = supabase.table('users').select('email, first_name, last_name').eq('id', target_user_id).single().execute()

        if not user.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        user_email = user.data['email']
        user_name = f"{user.data.get('first_name', '')} {user.data.get('last_name', '')}".strip()

        # Update user's email_confirmed_at in Supabase Auth
        try:
            # Use Supabase Admin API to confirm the user's email
            auth_response = supabase.auth.admin.update_user_by_id(
                target_user_id,
                {'email_confirm': True}
            )

            if not auth_response:
                return jsonify({'success': False, 'error': 'Failed to verify email'}), 500

            logger.info(f"Admin {user_id} manually verified email for user {target_user_id} ({user_email})")

            return jsonify({
                'success': True,
                'message': f'Email verified for {user_name or user_email}'
            })

        except Exception as auth_error:
            logger.error(f"Error verifying email via Supabase Auth: {str(auth_error)}")
            return jsonify({
                'success': False,
                'error': 'Failed to verify email in authentication system'
            }), 500

    except Exception as e:
        logger.error(f"Error verifying email: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to verify email: {str(e)}'
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
@require_advisor
def get_user_quest_enrollments(user_id, target_user_id):
    """
    Get all quests for a student - both enrolled and available.
    Used by advisors to add tasks to student quests.
    Advisors can only access their assigned students; admins see all.
    """
    supabase = get_supabase_admin_client()

    try:
        # Check if advisor is allowed to access this student
        assigned_student_ids = get_advisor_assigned_students(user_id)

        # If advisor (not admin) and student is not assigned, deny access
        if assigned_student_ids is not None and target_user_id not in assigned_student_ids:
            return jsonify({
                'success': False,
                'error': 'Not authorized to access this student'
            }), 403

        # Get all active quests
        all_quests = supabase.table('quests')\
            .select('id, title, big_idea, description, quest_type')\
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

@bp.route('/users/<target_user_id>/upload-avatar', methods=['POST'])
@require_admin
def upload_user_avatar(user_id, target_user_id):
    """Upload profile picture for a user (admin only)"""
    supabase = get_supabase_admin_client()

    try:
        # Check if file was provided
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Read file content
        file_content = file.read()

        # Validate file size (5MB max for profile pictures)
        MAX_SIZE = 5 * 1024 * 1024
        if len(file_content) > MAX_SIZE:
            return jsonify({'error': 'Image size must be less than 5MB'}), 400

        # Validate file type using magic bytes (images only)
        try:
            mime_type = magic.from_buffer(file_content[:2048], mime=True)
        except Exception as e:
            return jsonify({'error': 'Failed to detect file type'}), 400

        ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}
        if mime_type not in ALLOWED_IMAGE_TYPES:
            return jsonify({'error': 'Only image files (JPEG, PNG, GIF, WEBP) are allowed'}), 400

        # Sanitize filename
        safe_filename = secure_filename(file.filename)
        if not safe_filename or '..' in safe_filename:
            return jsonify({'error': 'Invalid filename'}), 400

        # Generate unique filename
        file_extension = safe_filename.rsplit('.', 1)[1].lower() if '.' in safe_filename else 'jpg'
        unique_filename = f"avatars/{target_user_id}/{uuid.uuid4()}.{file_extension}"

        # Create avatars bucket if it doesn't exist
        try:
            supabase.storage.create_bucket('avatars', {'public': True})
        except:
            pass  # Bucket might already exist

        # Delete old avatar if exists
        user_result = supabase.table('users').select('avatar_url').eq('id', target_user_id).single().execute()
        if user_result.data and user_result.data.get('avatar_url'):
            old_url = user_result.data['avatar_url']
            # Extract path from URL if it's a Supabase storage URL
            if '/storage/v1/object/public/avatars/' in old_url:
                old_path = old_url.split('/storage/v1/object/public/avatars/')[1]
                try:
                    supabase.storage.from_('avatars').remove([old_path])
                except:
                    pass  # Ignore if old file doesn't exist

        # Upload new avatar
        upload_response = supabase.storage.from_('avatars').upload(
            path=unique_filename,
            file=file_content,
            file_options={"content-type": mime_type}
        )

        # Get public URL
        avatar_url = supabase.storage.from_('avatars').get_public_url(unique_filename)

        # Update user's avatar_url
        update_result = supabase.table('users').update({
            'avatar_url': avatar_url
        }).eq('id', target_user_id).execute()

        return jsonify({
            'success': True,
            'avatar_url': avatar_url,
            'message': 'Profile picture uploaded successfully'
        }), 200

    except Exception as e:
        logger.error(f"Error uploading avatar for user {target_user_id}: {str(e)}")
        return jsonify({'error': 'Failed to upload profile picture'}), 500

@bp.route('/users/<user_id>/organization', methods=['PUT'])
@require_admin
def assign_user_to_organization(admin_user_id, user_id):
    """
    Admin endpoint to manually assign a user to an organization.
    Only platform admins can change user organizations.
    Pass organization_id: null to remove from organization.
    """
    try:
        data = request.json
        organization_id = data.get('organization_id')

        print(f"[ORG UPDATE] Updating user {user_id} organization to: {organization_id}", flush=True)

        from database import get_supabase_admin_client
        admin_client = get_supabase_admin_client()

        # If null, remove from organization
        if organization_id is None:
            admin_client.table('users')\
                .update({'organization_id': None})\
                .eq('id', user_id)\
                .execute()

            logger.info(f"[ADMIN] User {user_id} removed from organization by admin {admin_user_id}")

            return jsonify({
                'success': True,
                'message': 'User removed from organization',
                'organization': None
            }), 200

        # Use organization repository to validate and assign
        from repositories.organization_repository import OrganizationRepository
        org_repo = OrganizationRepository()

        # Verify organization exists
        org = org_repo.find_by_id(organization_id)
        if not org:
            return jsonify({
                'success': False,
                'error': 'Organization not found'
            }), 404

        # Assign user to organization
        update_result = admin_client.table('users')\
            .update({'organization_id': organization_id})\
            .eq('id', user_id)\
            .execute()

        print(f"[ORG UPDATE] Update result: {update_result.data}", flush=True)

        # Verify the update worked
        verify = admin_client.table('users').select('organization_id').eq('id', user_id).single().execute()
        print(f"[ORG UPDATE] After update, user org_id is: {verify.data.get('organization_id') if verify.data else 'NOT FOUND'}", flush=True)

        logger.info(f"[ADMIN] User {user_id} assigned to organization {organization_id} by admin {admin_user_id}")

        return jsonify({
            'success': True,
            'message': f'User assigned to {org["name"]} successfully',
            'organization': {
                'id': org['id'],
                'name': org['name'],
                'slug': org['slug']
            }
        }), 200

    except Exception as e:
        logger.error(f"Error assigning user to organization: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to assign user to organization'
        }), 500

@bp.route('/users/<user_id>/org-role', methods=['PUT', 'OPTIONS'])
@require_admin
def update_user_org_role(admin_user_id, user_id):
    """
    Admin endpoint to update a user's organizational role.
    Sets is_org_admin to true/false based on the role.
    Only platform admins can change organizational roles.
    """
    try:
        data = request.json
        org_role = data.get('org_role')

        if org_role not in ['member', 'admin']:
            return jsonify({
                'success': False,
                'error': 'Invalid org_role. Must be "member" or "admin"'
            }), 400

        is_org_admin = org_role == 'admin'

        from database import get_supabase_admin_client
        admin_client = get_supabase_admin_client()

        # Update the user's org admin status
        admin_client.table('users')\
            .update({'is_org_admin': is_org_admin})\
            .eq('id', user_id)\
            .execute()

        logger.info(f"[ADMIN] User {user_id} org_role set to {org_role} (is_org_admin={is_org_admin}) by admin {admin_user_id}")

        return jsonify({
            'success': True,
            'message': f'Organizational role updated to {org_role}',
            'is_org_admin': is_org_admin
        }), 200

    except Exception as e:
        logger.error(f"Error updating user org role: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update organizational role'
        }), 500

@bp.route('/organizations', methods=['GET'])
@require_admin
def get_organizations(admin_user_id):
    """
    Get all organizations for admin dropdown/selection.
    Returns organization list with user counts.
    """
    try:
        from repositories.organization_repository import OrganizationRepository
        org_repo = OrganizationRepository()

        # Get all active organizations
        orgs = org_repo.get_all_active()

        # Return organizations with basic info (stats can be added later if needed)
        orgs_list = []
        for org in orgs:
            orgs_list.append({
                'id': org['id'],
                'name': org['name'],
                'slug': org['slug'],
                'full_domain': org.get('full_domain'),
                'subdomain': org.get('subdomain'),
                'is_active': org['is_active']
            })

        return jsonify({
            'success': True,
            'organizations': orgs_list,
            'total': len(orgs_list)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching organizations: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch organizations'
        }), 500


@bp.route('/users/<target_user_id>/assign-advisor', methods=['POST'])
@require_admin
def assign_advisor_role(user_id, target_user_id):
    """
    School admins can promote users to advisor role within their organization.
    Superadmins can assign advisor role in any organization.

    This endpoint allows school admins to grant advisor privileges to users
    so they can create quests, invite students, and manage announcements.
    """
    supabase = get_supabase_admin_client()

    try:
        # Get requesting user's info
        requester = supabase.table('users')\
            .select('id, role, email, organization_id')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not requester.data:
            return jsonify({'success': False, 'error': 'Requester not found'}), 404

        requester_role = requester.data.get('role')
        requester_org_id = requester.data.get('organization_id')
        requester_email = requester.data.get('email')

        # Check if superadmin
        from app_config import Config
        is_superadmin = (requester_role == 'admin' and requester_email == Config.SUPERADMIN_EMAIL)

        # Only school_admin and superadmin can assign advisor role
        if not (is_superadmin or requester_role == 'school_admin'):
            return jsonify({
                'success': False,
                'error': 'Only school admins can assign advisor role'
            }), 403

        # Get target user's info
        target_user = supabase.table('users')\
            .select('id, role, organization_id, display_name, email')\
            .eq('id', target_user_id)\
            .single()\
            .execute()

        if not target_user.data:
            return jsonify({'success': False, 'error': 'Target user not found'}), 404

        target_org_id = target_user.data.get('organization_id')

        # School admins can only assign within their org
        if not is_superadmin and requester_org_id != target_org_id:
            return jsonify({
                'success': False,
                'error': 'You can only assign advisor role to users in your organization'
            }), 403

        # Assign advisor role
        update_data = {'role': 'advisor'}

        result = supabase.table('users')\
            .update(update_data)\
            .eq('id', target_user_id)\
            .execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Failed to assign advisor role'
            }), 500

        logger.info(
            f"[ROLE ASSIGNMENT] User {target_user_id} ({target_user.data.get('email')}) "
            f"promoted to advisor by {user_id} ({requester_email})"
        )

        return jsonify({
            'success': True,
            'message': f"{target_user.data.get('display_name', 'User')} is now an advisor",
            'user': result.data[0]
        }), 200

    except Exception as e:
        import traceback
        logger.error(f"Error assigning advisor role: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': 'Failed to assign advisor role'
        }), 500


@bp.route('/users/<target_user_id>/revoke-advisor', methods=['POST'])
@require_admin
def revoke_advisor_role(user_id, target_user_id):
    """
    School admins can revoke advisor role from users in their organization.
    This demotes the user back to student role.
    """
    supabase = get_supabase_admin_client()

    try:
        # Get requesting user's info
        requester = supabase.table('users')\
            .select('id, role, email, organization_id')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not requester.data:
            return jsonify({'success': False, 'error': 'Requester not found'}), 404

        requester_role = requester.data.get('role')
        requester_org_id = requester.data.get('organization_id')
        requester_email = requester.data.get('email')

        # Check if superadmin
        from app_config import Config
        is_superadmin = (requester_role == 'admin' and requester_email == Config.SUPERADMIN_EMAIL)

        # Only school_admin and superadmin can revoke advisor role
        if not (is_superadmin or requester_role == 'school_admin'):
            return jsonify({
                'success': False,
                'error': 'Only school admins can revoke advisor role'
            }), 403

        # Get target user's info
        target_user = supabase.table('users')\
            .select('id, role, organization_id, display_name, email')\
            .eq('id', target_user_id)\
            .single()\
            .execute()

        if not target_user.data:
            return jsonify({'success': False, 'error': 'Target user not found'}), 404

        target_org_id = target_user.data.get('organization_id')

        # School admins can only revoke within their org
        if not is_superadmin and requester_org_id != target_org_id:
            return jsonify({
                'success': False,
                'error': 'You can only revoke advisor role from users in your organization'
            }), 403

        # Prevent revoking non-advisor users
        if target_user.data.get('role') != 'advisor':
            return jsonify({
                'success': False,
                'error': 'User is not an advisor'
            }), 400

        # Demote to student role
        update_data = {'role': 'student'}

        result = supabase.table('users')\
            .update(update_data)\
            .eq('id', target_user_id)\
            .execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Failed to revoke advisor role'
            }), 500

        logger.info(
            f"[ROLE REVOCATION] User {target_user_id} ({target_user.data.get('email')}) "
            f"demoted from advisor by {user_id} ({requester_email})"
        )

        return jsonify({
            'success': True,
            'message': f"{target_user.data.get('display_name', 'User')} is no longer an advisor",
            'user': result.data[0]
        }), 200

    except Exception as e:
        import traceback
        logger.error(f"Error revoking advisor role: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': 'Failed to revoke advisor role'
        }), 500