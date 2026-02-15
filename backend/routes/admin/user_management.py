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
    UserRepository,
    QuestRepository,
    EvidenceRepository,
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
    AnalyticsRepository
)
from utils.auth.decorators import require_admin, require_advisor, require_school_admin, get_advisor_assigned_students
from utils.api_response import success_response, error_response
from datetime import datetime, timedelta
import json
import uuid
import magic
from werkzeug.utils import secure_filename

from utils.logger import get_logger

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
def get_user_details(user_id, target_user_id):
    """Get detailed information about a specific user"""
    try:
        user_repo = UserRepository()

        # Get user with stats
        user_data = user_repo.get_user_with_stats(target_user_id)

        if not user_data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        # Get organization info if needed
        if user_data.get('organization_id'):
            user_with_org = user_repo.get_user_with_organization(target_user_id)
            if user_with_org:
                user_data['organization'] = user_with_org.get('organization')
                user_data['organization_name'] = user_with_org.get('organization_name')

        stats = user_data.pop('stats', {})

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
@require_school_admin
def update_user(user_id, target_user_id):
    """
    Update user information.
    Superadmins can update any user.
    Org admins can update users in their own organization.
    """
    from utils.roles import get_effective_role

    supabase = get_supabase_admin_client()

    try:
        # Check if caller is superadmin or org_admin
        admin_user = supabase.table('users').select('role, org_role, organization_id').eq('id', user_id).single().execute()
        if not admin_user.data:
            return jsonify({'success': False, 'error': 'Admin user not found'}), 404

        admin_effective_role = get_effective_role(admin_user.data)
        is_superadmin = admin_effective_role == 'superadmin'

        # If not superadmin, verify target user is in same org
        if not is_superadmin:
            target_user = supabase.table('users').select('organization_id').eq('id', target_user_id).single().execute()
            if not target_user.data:
                return jsonify({'success': False, 'error': 'User not found'}), 404

            admin_org_id = admin_user.data.get('organization_id')
            target_org_id = target_user.data.get('organization_id')

            if not admin_org_id or admin_org_id != target_org_id:
                return jsonify({'success': False, 'error': 'You can only modify users in your organization'}), 403

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
    """
    Update user's platform role (superadmin only).
    Platform roles: superadmin, org_admin, student, parent, advisor, observer, org_managed
    When setting org_managed, the user's actual role comes from their org_role column.
    """
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
        if target_user_id == user_id and new_role not in ['org_admin', 'superadmin']:
            return jsonify({'success': False, 'error': 'Cannot remove your own admin privileges'}), 403

        # Build update data
        update_data = {
            'role': new_role
        }

        # If setting to org_managed, check if user has an organization
        if new_role == 'org_managed':
            target_user = supabase.table('users').select('organization_id, role, org_role').eq('id', target_user_id).single().execute()
            if not target_user.data or not target_user.data.get('organization_id'):
                return jsonify({
                    'success': False,
                    'error': 'Cannot set role to org_managed for user without an organization'
                }), 400
            # If they don't have an org_role yet, default to student
            if not target_user.data.get('org_role'):
                update_data['org_role'] = 'student'

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
    try:
        # Prevent admin from deleting themselves
        if target_user_id == user_id:
            return jsonify({'success': False, 'error': 'Cannot delete your own account'}), 403

        user_repo = UserRepository()

        # Check if user exists
        user = user_repo.find_by_id(target_user_id)
        if not user:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        # Delete user and all related data using repository
        user_repo.delete_user_complete(target_user_id, user_id)

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
        return jsonify({
            'success': False,
            'error': f'Failed to delete users: {str(e)}'
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

    Valid org_role values: student, parent, advisor, org_admin, observer
    """
    try:
        data = request.json
        org_role = data.get('org_role')

        # Valid organization roles
        valid_org_roles = ['student', 'parent', 'advisor', 'org_admin', 'observer']
        if org_role not in valid_org_roles:
            return jsonify({
                'success': False,
                'error': f'Invalid org_role. Must be one of: {valid_org_roles}'
            }), 400

        from database import get_supabase_admin_client
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
    import json

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