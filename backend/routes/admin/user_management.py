"""
Admin User Management Routes

Handles user CRUD operations, subscription management, role changes,
user status updates, and chat log viewing for admin interface.

REPOSITORY MIGRATION: COMPLETE
- Uses UserRepository for all user operations
- Complex queries remain in routes for readability
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from repositories import (
    UserRepository
)
from utils.auth.decorators import require_admin, require_advisor, require_school_admin, get_advisor_assigned_students
from utils.auth.relationships import require_relationship_to
from utils.api_response import success_response, error_response
from datetime import datetime
import uuid
import magic
from werkzeug.utils import secure_filename

from utils.logger import get_logger
from utils.storage_urls import public_object_url, sign_stored_url
from utils.validation.sanitizers import pgrst_uuid

logger = get_logger(__name__)

bp = Blueprint('admin_user_management', __name__, url_prefix='/api/admin')

@bp.route('/users', methods=['GET'])
@require_advisor
def get_users(user_id):
    """
    Get all users with filtering and pagination for admin dashboard.
    Advisors see only their assigned students; admins see all users.
    """
    try:
        user_repo = UserRepository()

        # Get filter parameters
        filters = {
            'role': request.args.get('role', 'all'),
            'activity': request.args.get('activity', 'all'),
            'organization': request.args.get('organization', 'all'),
            'search': request.args.get('search', '').strip()
        }
        sort_by = request.args.get('sortBy', 'created_at')
        sort_order = request.args.get('sortOrder', 'desc')
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 20)), 100)

        # Get assigned students for advisor filtering
        assigned_student_ids = get_advisor_assigned_students(user_id)

        result = user_repo.get_users_paginated(
            filters=filters,
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            assigned_student_ids=assigned_student_ids
        )

        return jsonify({
            'success': True,
            **result
        })

    except Exception as e:
        logger.error(f"Error getting users: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve users'
        }), 500

@bp.route('/users/<target_user_id>', methods=['GET'])
@require_admin
def get_user_details(admin_id, target_user_id):
    """Get detailed information about a specific user"""
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
    supabase = get_supabase_admin_client()

    try:
        # Get user details
        user_response = supabase.table('users').select('*').eq('id', target_user_id).execute()

        if not user_response.data:
            return jsonify({'error': 'User not found'}), 404

        user = user_response.data[0]

        # `user-uploads` is private — the stored pointer is an identifier, not a
        # fetchable link. Sign it for this render.
        if user.get('avatar_url'):
            user['avatar_url'] = sign_stored_url(user['avatar_url'], 'user-uploads')

        # Get organization name if user has an organization_id
        if user.get('organization_id'):
            org_response = supabase.table('organizations')\
                .select('id, name')\
                .eq('id', user['organization_id'])\
                .maybe_single()\
                .execute()
            user['organization_name'] = org_response.data.get('name') if org_response.data else None
        else:
            user['organization_name'] = None

        # Get XP by pillar
        xp_response = supabase.table('user_skill_xp')\
            .select('pillar, xp_amount')\
            .eq('user_id', target_user_id)\
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
            .eq('user_id', target_user_id)\
            .not_.is_('completed_at', 'null')\
            .order('completed_at', desc=True)\
            .execute()

        completed_quests = []
        quests_completed = 0
        if completed_quests_response.data:
            quests_completed = len(completed_quests_response.data)
            for quest in completed_quests_response.data:
                completed_quests.append({
                    'id': quest.get('quest_id'),
                    'title': quest.get('quests', {}).get('title') if quest.get('quests') else 'Unknown Quest',
                    'completed_at': quest.get('completed_at'),
                    'xp_earned': 0  # Would need to be derived from the quest's tasks
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
        raise

@bp.route('/users/<target_user_id>', methods=['PUT'])
@require_school_admin
@require_relationship_to('target_user_id', allow=('org_staff',))
def update_user_profile(admin_id, target_user_id):
    """
    Update user profile information.

    Superadmins can update any user; org admins are scoped to their own
    organization.

    Org admins need this because the org People tab saves the profile before it
    saves roles — a superadmin-only gate here 403'd the whole save and blocked
    org admins from promoting anyone to org_admin.
    """
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
    supabase = get_supabase_admin_client()
    data = request.json

    try:
        from utils.roles import get_effective_role

        admin_rows = (supabase.table('users').select('role, org_role, org_roles, organization_id')
                      .eq('id', admin_id).limit(1).execute()).data
        if not admin_rows:
            return jsonify({'error': 'Admin user not found'}), 404

        if get_effective_role(admin_rows[0]) != 'superadmin':
            admin_org_id = admin_rows[0].get('organization_id')
            target_rows = (supabase.table('users').select('organization_id')
                           .eq('id', target_user_id).limit(1).execute()).data
            if not target_rows:
                return jsonify({'error': 'User not found'}), 404
            if not admin_org_id or admin_org_id != target_rows[0].get('organization_id'):
                return jsonify({'error': 'You can only modify users in your organization'}), 403

        # Blank strings for these optional fields must be stored as NULL, not ''.
        # Critically, dependents must have email IS NULL (check_dependent_no_email):
        # edit forms submit the whole user object with an empty email for a
        # dependent, and persisting '' would violate the constraint on ANY update.
        def _blank_to_none(value):
            return None if isinstance(value, str) and value.strip() == '' else value

        update_data = {}
        if 'first_name' in data:
            update_data['first_name'] = data['first_name']
        if 'last_name' in data:
            update_data['last_name'] = data['last_name']
        for field in ('email', 'phone_number', 'address_line1', 'address_line2',
                      'city', 'state', 'postal_code', 'country'):
            if field in data:
                update_data[field] = _blank_to_none(data[field])
        if 'date_of_birth' in data:
            update_data['date_of_birth'] = data['date_of_birth'] or None

        # Keep the COPPA promotion date in sync when a dependent's birthday
        # changes (mirrors DependentRepository.update_dependent). Non-dependents
        # leave promotion_eligible_at NULL.
        if update_data.get('date_of_birth'):
            target = supabase.table('users').select('is_dependent').eq('id', target_user_id).single().execute()
            if target.data and target.data.get('is_dependent'):
                from dateutil.relativedelta import relativedelta
                dob = datetime.strptime(update_data['date_of_birth'], '%Y-%m-%d').date()
                update_data['promotion_eligible_at'] = str(dob + relativedelta(years=13))

        if update_data:
            response = supabase.table('users')\
                .update(update_data)\
                .eq('id', target_user_id)\
                .execute()

            if not response.data:
                return jsonify({'error': 'User not found'}), 404

        # If a non-blank email was provided, also sync it to auth.users. Skip when
        # blank/None (e.g. dependents, who have no auth account until promoted) —
        # pushing an empty email to auth would error.
        if update_data.get('email'):
            try:
                supabase.auth.admin.update_user_by_id(
                    target_user_id,
                    {'email': update_data['email']}
                )
                logger.info(f"Admin {admin_id} updated email for user {target_user_id}")
            except Exception as e:
                logger.warning(f"Failed to update auth.users email: {e}")
                # Continue anyway since users table was updated successfully

        return jsonify({'message': 'User updated successfully'}), 200

    except Exception as e:
        logger.error(f"Error updating user: {str(e)}")
        raise

@bp.route('/users/<target_user_id>/role', methods=['PUT'])
@require_admin
def update_user_role(admin_id, target_user_id):
    """
    Update user's platform role (superadmin only).
    Platform roles: superadmin, org_admin, student, parent, advisor, observer, org_managed
    When setting org_managed, the user's actual role comes from their org_role column.
    """
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
    supabase = get_supabase_admin_client()

    try:
        data = request.json
        new_role = data.get('role')

        if not new_role:
            return jsonify({'success': False, 'error': 'Role is required'}), 400

        # Valid platform roles including org_managed
        valid_roles = ['student', 'parent', 'advisor', 'org_admin', 'superadmin', 'observer', 'org_managed']
        if new_role not in valid_roles:
            return jsonify({'success': False, 'error': f'Invalid role. Must be one of: {valid_roles}'}), 400

        # Prevent user from removing their own admin role
        if target_user_id == admin_id and new_role not in ['org_admin', 'superadmin']:
            return jsonify({'success': False, 'error': 'Cannot remove your own admin privileges'}), 403

        target_rows = (supabase.table('users').select('organization_id, role, org_role')
                       .eq('id', target_user_id).limit(1).execute()).data
        if not target_rows:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        target_user = target_rows[0]
        target_org_id = target_user.get('organization_id')

        # The users table enforces (users_role_check / direct_role_no_org_role /
        # org_managed_requires_org): 'org_admin' is never a value of the role
        # column, org users keep role='org_managed' with the real role in
        # org_role, and a direct role requires org_role to be NULL.
        if new_role == 'org_managed':
            if not target_org_id:
                return jsonify({
                    'success': False,
                    'error': 'Cannot set role to org_managed for user without an organization'
                }), 400
            update_data = {'role': 'org_managed'}
            # If they don't have an org_role yet, default to student
            if not target_user.get('org_role'):
                update_data['org_role'] = 'student'
        elif target_org_id and new_role != 'superadmin':
            # Org user: their platform role stays org_managed; the requested
            # role goes in org_role (writing it to role violates the DB checks).
            update_data = {'role': 'org_managed', 'org_role': new_role}
        elif new_role == 'org_admin':
            return jsonify({
                'success': False,
                'error': 'org_admin is an organization role — the user must belong to an organization'
            }), 400
        else:
            # Direct platform role: clear any leftover org_role so the
            # direct_role_no_org_role constraint is satisfied.
            update_data = {'role': new_role, 'org_role': None}

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
        raise

@bp.route('/users/<target_user_id>', methods=['DELETE'])
@require_admin
def delete_user(admin_id, target_user_id):
    """Permanently delete a user account and all associated data"""
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
    supabase = get_supabase_admin_client()

    try:
        # Prevent admin from deleting themselves
        if target_user_id == admin_id:
            return jsonify({'error': 'Cannot delete your own account'}), 403

        # Delete user data in proper order to avoid foreign key violations

        # Delete user XP data
        supabase.table('user_skill_xp').delete().eq('user_id', target_user_id).execute()

        # Clean up org_invitations references
        supabase.table('org_invitations').delete().eq('accepted_by', target_user_id).execute()
        supabase.table('org_invitations').update({'invited_by': None}).eq('invited_by', target_user_id).execute()

        # Delete user quest enrollments and completions
        # NOTE: With CASCADE constraint, quest_task_completions will auto-delete when user_quest_tasks are deleted
        # But we delete explicitly here for clarity and to handle any edge cases
        supabase.table('quest_task_completions').delete().eq('user_id', target_user_id).execute()
        supabase.table('user_quest_tasks').delete().eq('user_id', target_user_id).execute()
        supabase.table('user_quests').delete().eq('user_id', target_user_id).execute()

        # Delete user profile
        # Note: AFTER DELETE trigger automatically syncs deletion to auth.users
        response = supabase.table('users').delete().eq('id', target_user_id).execute()

        if not response.data:
            return jsonify({'error': 'User not found'}), 404

        return jsonify({'message': 'User account deleted successfully'}), 200

    except Exception as e:
        logger.error(f"Error deleting user: {str(e)}")
        raise


@bp.route('/users/bulk-delete', methods=['POST'])
@require_admin
def bulk_delete_users(user_id):
    """Delete multiple user accounts (admin only)"""
    try:
        data = request.json
        user_ids = data.get('user_ids', [])

        if not user_ids:
            return jsonify({'success': False, 'error': 'No user IDs provided'}), 400

        if len(user_ids) > 50:
            return jsonify({'success': False, 'error': 'Maximum 50 users can be deleted at once'}), 400

        # Prevent admin from deleting themselves
        if user_id in user_ids:
            return jsonify({'success': False, 'error': 'Cannot delete your own account'}), 403

        user_repo = UserRepository()
        result = user_repo.bulk_delete_users(user_ids, user_id)

        return jsonify({
            'success': True,
            **result
        })

    except Exception as e:
        logger.error(f"Error in bulk delete: {str(e)}")
        raise


@bp.route('/users/<target_user_id>/reset-password', methods=['POST'])
@require_admin
def admin_reset_password(user_id, target_user_id):
    """Reset a user's password (admin only)"""
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
    supabase = get_supabase_admin_client()

    try:
        data = request.json or {}
        new_password = (data.get('new_password') or '').strip()

        # Default to a known temporary password when the admin doesn't supply one,
        # so resets can be one-click. Strength validation only runs on custom values.
        if not new_password:
            new_password = 'changeme!'
        else:
            from utils.validation import validate_password
            is_valid, error_message = validate_password(new_password)
            if not is_valid:
                return jsonify({'success': False, 'error': error_message}), 400

        # Check if user exists
        user = supabase.table('users').select('email').eq('id', target_user_id).single().execute()

        if not user.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        user_email = user.data['email']

        # Update password by writing directly to auth.users via a SECURITY DEFINER RPC.
        # We bypass supabase.auth.admin.update_user_by_id because Supabase Auth runs
        # an HIBP/leaked-password check that rejects common temporary passwords like
        # "changeme!". Strength validation for non-default passwords is handled above.
        try:
            supabase.rpc('admin_set_user_password', {
                'target_user_id': target_user_id,
                'new_password': new_password
            }).execute()

            # Confirm the email too, or this route can't fix the case it exists
            # for. An invited user who never completed their first reset has
            # email_confirmed_at NULL; setting a password alone leaves them
            # bouncing off "Incorrect email or password" with a password that is
            # actually correct, and the admin with no way to tell. An admin
            # setting someone's password by hand has already established who
            # they are. (Cost us a locked-out iCreate teacher on 2026-08-13.)
            try:
                supabase.auth.admin.update_user_by_id(
                    target_user_id, {'email_confirm': True})
            except Exception as confirm_error:  # noqa: BLE001
                logger.warning(
                    f"Could not confirm email for {target_user_id}: {confirm_error}")

            # Clear any account lockouts for this user
            try:
                from routes.auth.login.security import reset_login_attempts
                reset_login_attempts(user_email)
            except Exception as lockout_error:
                logger.warning(f"Could not clear login attempts for {user_email}: {lockout_error}")

            logger.info(f"Admin {user_id} reset password for user {target_user_id}")

            return jsonify({
                'success': True,
                'message': 'Password reset successfully',
                'new_password': new_password
            })

        except Exception as auth_error:
            logger.error(f"Error updating password via RPC: {str(auth_error)}")
            return jsonify({
                'success': False,
                'error': 'Failed to update password in authentication system'
            }), 500

    except Exception as e:
        logger.error(f"Error resetting password: {str(e)}")
        raise

@bp.route('/users/<target_user_id>/toggle-status', methods=['POST'])
@require_admin
def toggle_user_status(admin_id, target_user_id):
    """Enable or disable a user account"""
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
    supabase = get_supabase_admin_client()

    try:
        # Get current status
        user_response = supabase.table('users').select('status').eq('id', target_user_id).execute()
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
            .eq('id', target_user_id)\
            .execute()

        if not response.data:
            return jsonify({'error': 'User not found'}), 404

        return jsonify({
            'message': f'User account {"enabled" if new_status == "active" else "disabled"} successfully',
            'status': new_status
        }), 200

    except Exception as e:
        logger.error(f"Error toggling user status: {str(e)}")
        raise


@bp.route('/users/bulk-email', methods=['POST'])
@require_admin
def send_bulk_email(admin_id):
    """Send email to multiple users"""
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
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

        # NOTE: this endpoint has never actually sent anything — it counts
        # addressable users and reports success. Wire it to the email service
        # before relying on it.
        emails_sent = sum(1 for user in users_response.data if user.get('email'))

        return jsonify({
            'message': f'Bulk email prepared for {emails_sent} users',
            'emails_sent': emails_sent
        }), 200

    except Exception as e:
        logger.error(f"Error sending bulk email: {str(e)}")
        raise


@bp.route('/users/<target_user_id>/verify-email', methods=['POST'])
@require_admin
def admin_verify_email(user_id, target_user_id):
    """Manually verify a user's email (admin only)"""
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
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
        raise

@bp.route('/users/<user_id>/conversations', methods=['GET'])
@require_admin
def get_user_conversations(admin_user_id, user_id):
    """Get all conversations for a specific user (admin only)"""
    try:
        user_repo = UserRepository()

        limit = min(int(request.args.get('limit', 50)), 100)
        offset = int(request.args.get('offset', 0))

        result = user_repo.get_user_conversations(user_id, limit, offset)

        return success_response(result)

    except Exception as e:
        logger.error(f"Error fetching user conversations: {str(e)}")
        return error_response(f"Failed to fetch conversations: {str(e)}", status_code=500, error_code="internal_error")

@bp.route('/conversations/<conversation_id>', methods=['GET'])
@require_admin
def get_conversation_details(admin_user_id, conversation_id):
    """Get conversation details with all messages (admin only)"""
    try:
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
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
@require_relationship_to('target_user_id', allow=('advisor', 'org_staff'), discloses='quests')
def get_user_quest_enrollments(user_id, target_user_id):
    """
    Get all quests for a student - both enrolled and available.
    Used by advisors to add tasks to student quests.
    Advisors can only access their assigned students; admins see all.
    """
    try:
        # Check if advisor is allowed to access this student
        assigned_student_ids = get_advisor_assigned_students(user_id)

        # If advisor (not admin) and student is not assigned, deny access
        if assigned_student_ids is not None and target_user_id not in assigned_student_ids:
            return jsonify({
                'success': False,
                'error': 'Not authorized to access this student'
            }), 403

        user_repo = UserRepository()
        result = user_repo.get_user_quest_enrollments(target_user_id)

        return jsonify({
            'success': True,
            **result
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
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
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
        except Exception:
            return jsonify({'error': 'Failed to detect file type'}), 400

        ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'}
        if mime_type not in ALLOWED_IMAGE_TYPES:
            return jsonify({'error': 'Only image files (JPEG, PNG, GIF, WEBP, HEIC) are allowed'}), 400

        # Sanitize filename
        safe_filename = secure_filename(file.filename)
        if not safe_filename or '..' in safe_filename:
            return jsonify({'error': 'Invalid filename'}), 400

        # Generate unique filename
        file_extension = safe_filename.rsplit('.', 1)[1].lower() if '.' in safe_filename else 'jpg'
        unique_filename = f"avatars/{target_user_id}/{uuid.uuid4()}.{file_extension}"

        # Delete old avatar if exists
        user_result = supabase.table('users').select('avatar_url').eq('id', target_user_id).single().execute()
        if user_result.data and user_result.data.get('avatar_url'):
            old_url = user_result.data['avatar_url']
            # Extract path from URL if it's a Supabase storage URL
            if '/storage/v1/object/public/user-uploads/' in old_url:
                old_path = old_url.split('/storage/v1/object/public/user-uploads/')[1]
                try:
                    supabase.storage.from_('user-uploads').remove([old_path])
                except Exception:
                    logger.debug("avatar old file delete failed (non-fatal)", exc_info=True)

        # Upload new avatar
        supabase.storage.from_('user-uploads').upload(
            path=unique_filename,
            file=file_content,
            file_options={"content-type": mime_type}
        )

        # `user-uploads` is private: persist the canonical pointer, serve a
        # short-lived signed URL. See utils/storage_urls.py.
        avatar_url = public_object_url('user-uploads', unique_filename)

        # Update user's avatar_url
        supabase.table('users').update({
            'avatar_url': avatar_url
        }).eq('id', target_user_id).execute()

        return jsonify({
            'success': True,
            'avatar_url': sign_stored_url(avatar_url, 'user-uploads'),
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

        user_repo = UserRepository()

        # Verify organization exists if assigning
        if organization_id is not None:
            from repositories.organization_repository import OrganizationRepository
            org_repo = OrganizationRepository()
            org = org_repo.find_by_id(organization_id)
            if not org:
                return jsonify({
                    'success': False,
                    'error': 'Organization not found'
                }), 404

        try:
            user_repo.update_user_organization(user_id, organization_id, admin_user_id)
        except Exception as e:
            error_msg = str(e)
            if 'superadmin' in error_msg.lower():
                return jsonify({'success': False, 'error': 'Cannot add superadmin to organization'}), 400
            raise

        if organization_id is None:
            return jsonify({
                'success': True,
                'message': 'User removed from organization',
                'organization': None
            }), 200
        else:
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
    Sets the org_role column and is_org_admin flag.
    Also sets role to 'org_managed' if not already.
    Only platform admins (superadmin) can use this endpoint.

    Valid org_role values: whatever OrgRole holds (utils.roles.VALID_ORG_ROLES).
    """
    from utils.roles import VALID_ORG_ROLES

    try:
        data = request.json
        org_role = data.get('org_role')

        # OrgRole is the one list, not a copy of it — a hardcoded copy here is
        # what left campus_coordinator unsettable from this endpoint after the
        # role shipped.
        if org_role not in VALID_ORG_ROLES:
            return jsonify({
                'success': False,
                'error': f'Invalid org_role. Must be one of: {sorted(VALID_ORG_ROLES)}'
            }), 400

        from database import get_supabase_admin_client
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        admin_client = get_supabase_admin_client()

        # First check if user has an organization
        target_user = admin_client.table('users').select('organization_id, role').eq('id', user_id).single().execute()
        if not target_user.data or not target_user.data.get('organization_id'):
            return jsonify({
                'success': False,
                'error': 'Cannot set org_role for user without an organization'
            }), 400

        # Set is_org_admin based on whether org_role is 'org_admin'
        is_org_admin = org_role == 'org_admin'

        # Build update - set org_role, is_org_admin, and ensure role is org_managed
        update_data = {
            'org_role': org_role,
            'is_org_admin': is_org_admin
        }

        # If user is not already org_managed, set them to org_managed
        if target_user.data.get('role') != 'org_managed' and target_user.data.get('role') != 'superadmin':
            update_data['role'] = 'org_managed'

        admin_client.table('users')\
            .update(update_data)\
            .eq('id', user_id)\
            .execute()

        logger.info(f"[ADMIN] User {user_id} org_role set to {org_role} (is_org_admin={is_org_admin}) by admin {admin_user_id}")

        return jsonify({
            'success': True,
            'message': f'Organizational role updated to {org_role}',
            'org_role': org_role,
            'is_org_admin': is_org_admin
        }), 200

    except Exception as e:
        logger.error(f"Error updating user org role: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update organizational role'
        }), 500


@bp.route('/org/users/<user_id>/role', methods=['PUT', 'OPTIONS'])
@require_school_admin
@require_relationship_to('user_id', allow=('org_staff',))
def update_org_user_role(admin_user_id, user_id):
    """
    Org admin endpoint to update a user's role within their organization.
    Org admins can only modify users in their own organization.
    Supports multiple roles via org_roles array (e.g., ["parent", "advisor"]).

    Request body can be:
    - { "org_role": "advisor" } - Single role (legacy, still supported)
    - { "org_roles": ["parent", "advisor"] } - Multiple roles (new format)

    Valid org_role values: student, parent, advisor, org_admin, observer
    """
    from utils.roles import get_effective_role, VALID_ORG_ROLES

    try:
        data = request.json

        # Support both single role and array of roles
        org_roles = data.get('org_roles')  # New format: array
        new_org_role = data.get('org_role')  # Legacy format: single string

        # Normalize to array
        if org_roles is not None:
            # Validate it's a list
            if not isinstance(org_roles, list) or len(org_roles) == 0:
                return jsonify({
                    'success': False,
                    'error': 'org_roles must be a non-empty array of role strings'
                }), 400
            # Validate each role
            for role in org_roles:
                if role not in VALID_ORG_ROLES:
                    return jsonify({
                        'success': False,
                        'error': f'Invalid role "{role}". Must be one of: {list(VALID_ORG_ROLES)}'
                    }), 400
            roles_to_set = org_roles
        elif new_org_role is not None:
            # Legacy single role format
            if new_org_role not in VALID_ORG_ROLES:
                return jsonify({
                    'success': False,
                    'error': f'Invalid org_role. Must be one of: {list(VALID_ORG_ROLES)}'
                }), 400
            roles_to_set = [new_org_role]
        else:
            return jsonify({
                'success': False,
                'error': 'Either org_role or org_roles is required'
            }), 400

        from database import get_supabase_admin_client
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        admin_client = get_supabase_admin_client()

        # Get admin's organization
        admin_user = admin_client.table('users').select('organization_id, role, org_role, org_roles').eq('id', admin_user_id).single().execute()
        if not admin_user.data:
            return jsonify({'success': False, 'error': 'Admin user not found'}), 404

        admin_org_id = admin_user.data.get('organization_id')
        admin_effective_role = get_effective_role(admin_user.data)

        # Superadmins can modify any user
        is_superadmin = admin_effective_role == 'superadmin'

        # Get target user
        target_user = admin_client.table('users').select('organization_id, role, org_role, org_roles').eq('id', user_id).single().execute()
        if not target_user.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        target_org_id = target_user.data.get('organization_id')

        # Org admins can only modify users in their organization
        if not is_superadmin:
            if not admin_org_id or admin_org_id != target_org_id:
                return jsonify({
                    'success': False,
                    'error': 'You can only modify users in your organization'
                }), 403

        # Prevent org_admin from removing their own org_admin role (unless superadmin)
        if user_id == admin_user_id and 'org_admin' not in roles_to_set and not is_superadmin:
            return jsonify({
                'success': False,
                'error': 'Cannot remove your own org_admin privileges'
            }), 403

        # Set is_org_admin based on whether 'org_admin' is in the roles list
        is_org_admin = 'org_admin' in roles_to_set

        # Use first role as the primary org_role (for backward compatibility)
        primary_role = roles_to_set[0]

        # Build update - set both org_role (legacy) and org_roles (new)
        update_data = {
            'org_role': primary_role,  # Legacy field - set to primary role
            'org_roles': roles_to_set,  # New field - full array
            'is_org_admin': is_org_admin
        }

        # If user is not already org_managed, set them to org_managed (unless superadmin)
        if target_user.data.get('role') not in ['org_managed', 'superadmin']:
            update_data['role'] = 'org_managed'

        admin_client.table('users')\
            .update(update_data)\
            .eq('id', user_id)\
            .execute()

        roles_str = ', '.join(roles_to_set)
        logger.info(f"[ORG_ADMIN] User {user_id} org_roles set to [{roles_str}] by {admin_user_id}")

        return jsonify({
            'success': True,
            'message': f'User roles updated to {roles_str}',
            'org_role': primary_role,  # Primary role (backward compatibility)
            'org_roles': roles_to_set,  # Full roles array
            'is_org_admin': is_org_admin
        }), 200

    except Exception as e:
        logger.error(f"Error updating org user role: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update user role'
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
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
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
        is_superadmin = (requester_role == 'superadmin')

        # Only org_admin and superadmin can assign advisor role
        if not (is_superadmin or requester_role == 'org_admin'):
            return jsonify({
                'success': False,
                'error': 'Only org admins can assign advisor role'
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

        # Org admins can only assign within their org
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
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
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
        is_superadmin = (requester_role == 'superadmin')

        # Only org_admin and superadmin can revoke advisor role
        if not (is_superadmin or requester_role == 'org_admin'):
            return jsonify({
                'success': False,
                'error': 'Only org admins can revoke advisor role'
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

        # Org admins can only revoke within their org
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


def _person(row: dict) -> dict:
    """Shrink a users row to the fields the connections list renders."""
    row = row or {}
    name = f"{row.get('first_name') or ''} {row.get('last_name') or ''}".strip()
    return {
        'id': row.get('id'),
        'name': name or row.get('display_name') or 'Unknown',
        'email': row.get('email'),
    }


@bp.route('/users/<user_id>/connections', methods=['GET'])
@require_admin
def get_user_connections(admin_user_id: str, user_id: str):
    """Every person linked to this user, in one response.

    The admin user-details modal used to assemble this client-side, and the
    advisor half cost 1 + N requests: fetch every advisor, then fetch each
    advisor's whole roster just to test whether this one user appeared in it.
    Six of the seven calls were wrapped in silent `catch {}`, so a failing
    endpoint rendered as "No connections" — indistinguishable from a user who
    genuinely has none. This does the same work in a fixed number of queries
    and lets failures surface as a 500.

    Returns links in both directions for all three relationship types:
      advisor  -> direction 'student' (this user teaches them) | 'advisor'
      parent   -> direction 'child'   (this user parents them) | 'parent'
      observer -> direction 'observing'                        | 'observed_by'
    """
    try:
        # admin client justified: admin-only route (@require_admin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()
        connections = []

        # --- Advisor assignments, both directions, in two queries ---------
        assignments = supabase.table('advisor_student_assignments') \
            .select('id, advisor_id, student_id, assigned_at') \
            .or_(f'advisor_id.eq.{pgrst_uuid(user_id, "user_id")},'
                 f'student_id.eq.{pgrst_uuid(user_id, "user_id")}') \
            .eq('is_active', True) \
            .execute()

        assignment_rows = assignments.data or []
        counterpart_ids = {
            row['student_id'] if row['advisor_id'] == user_id else row['advisor_id']
            for row in assignment_rows
        }

        # --- Parent links, both directions, in one query ------------------
        parent_links = supabase.table('parent_student_links') \
            .select('id, parent_user_id, student_user_id, created_at') \
            .or_(f'parent_user_id.eq.{pgrst_uuid(user_id, "user_id")},'
                 f'student_user_id.eq.{pgrst_uuid(user_id, "user_id")}') \
            .execute()

        parent_rows = parent_links.data or []
        counterpart_ids |= {
            row['student_user_id'] if row['parent_user_id'] == user_id else row['parent_user_id']
            for row in parent_rows
        }

        # --- Observer links, both directions, in one query ----------------
        observer_links = supabase.table('observer_student_links') \
            .select('id, observer_id, student_id, created_at') \
            .or_(f'observer_id.eq.{pgrst_uuid(user_id, "user_id")},'
                 f'student_id.eq.{pgrst_uuid(user_id, "user_id")}') \
            .execute()

        observer_rows = observer_links.data or []
        counterpart_ids |= {
            row['student_id'] if row['observer_id'] == user_id else row['observer_id']
            for row in observer_rows
        }

        # --- One lookup for every counterpart -----------------------------
        counterpart_ids.discard(user_id)
        counterpart_ids.discard(None)
        people = {}
        if counterpart_ids:
            people_rows = supabase.table('users') \
                .select('id, first_name, last_name, display_name, email') \
                .in_('id', list(counterpart_ids)) \
                .execute()
            people = {row['id']: row for row in (people_rows.data or [])}

        for row in assignment_rows:
            this_user_is_advisor = row['advisor_id'] == user_id
            other_id = row['student_id'] if this_user_is_advisor else row['advisor_id']
            connections.append({
                'id': f"advisor-{row['id']}",
                'link_id': row['id'],
                'type': 'advisor',
                'direction': 'student' if this_user_is_advisor else 'advisor',
                'advisor_id': row['advisor_id'],
                'student_id': row['student_id'],
                'person': _person(people.get(other_id)),
                'created_at': row.get('assigned_at'),
            })

        for row in parent_rows:
            this_user_is_parent = row['parent_user_id'] == user_id
            other_id = row['student_user_id'] if this_user_is_parent else row['parent_user_id']
            connections.append({
                'id': f"parent-{row['id']}",
                'link_id': row['id'],
                'type': 'parent',
                'direction': 'child' if this_user_is_parent else 'parent',
                'person': _person(people.get(other_id)),
                'created_at': row.get('created_at'),
            })

        for row in observer_rows:
            this_user_is_observer = row['observer_id'] == user_id
            other_id = row['student_id'] if this_user_is_observer else row['observer_id']
            connections.append({
                'id': f"observer-{row['id']}",
                'link_id': row['id'],
                'type': 'observer',
                'direction': 'observing' if this_user_is_observer else 'observed_by',
                'person': _person(people.get(other_id)),
                'created_at': row.get('created_at'),
            })

        return success_response(data={'connections': connections})

    except Exception as e:
        logger.error(f"Error fetching connections for {user_id}: {str(e)}")
        return error_response('Failed to load connections', status_code=500, error_code='FETCH_ERROR')
