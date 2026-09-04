"""Organization membership: who is in an org, and their login.

Split out of routes/admin/organization_management.py on 2026-09-03 (QB-04),
which was 1,554 lines and carried a standing exemption from the 1,400-line
route cap. It no longer needs one.

The seam is membership vs. the organization record itself. What moved here adds
and removes members, mints username-login student accounts, and resets their
passwords. What stayed is the org row, its settings and secrets, quest/course
grants, and analytics.

This is a SEPARATE blueprint at the SAME url_prefix, which is the pattern this
file's earlier splits already established (organization_courses, org_modules,
org_member_status). Paths do not overlap, so every URL is unchanged; the
endpoint NAMES change from organization_management.* to organization_users.*,
which is safe here only because nothing resolves these five by name -- checked
across the backend before moving them.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_org_admin, require_org_front_office
from utils.auth.relationships import require_relationship_to
from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.org_student_credentials import (
    USERNAME_PATTERN,
    generate_simple_password,
    validate_simple_password,
)
from utils.validation.password_validator import validate_password_strength
from datetime import datetime
import secrets
from config.constants import GUARDIAN_RELATIONSHIPS

logger = get_logger(__name__)

bp = Blueprint('organization_users', __name__)


def _ensure_shared_household(client, org_id, guardian_id, guardian_last_name, student_id):
    """Ensure the guardian and student share a household in this org.

    Family surfaces (Schedule Builder, parent context) resolve a parent's
    children from household membership and users.managed_by_parent_id, NOT from
    parent_student_links. So linking a student to a guardian is only fully
    effective if they also share a household. This find-or-creates the guardian's
    household and adds the student as a member. Idempotent.
    """
    household_id = None

    # 1) Reuse a household in this org where the guardian is already a guardian.
    memberships = (client.table('household_members')
                   .select('household_id, relationship')
                   .eq('user_id', guardian_id).execute().data) or []
    guardian_hh_ids = [m['household_id'] for m in memberships
                       if m.get('relationship') in GUARDIAN_RELATIONSHIPS and m.get('household_id')]
    if guardian_hh_ids:
        rows = (client.table('households').select('id')
                .in_('id', guardian_hh_ids).eq('organization_id', org_id)
                .limit(1).execute().data) or []
        if rows:
            household_id = rows[0]['id']

    # 2) Otherwise reuse a household they're the primary contact of, or create one,
    #    then ensure the guardian membership row exists.
    if not household_id:
        owned = (client.table('households').select('id')
                 .eq('organization_id', org_id)
                 .eq('primary_contact_user_id', guardian_id)
                 .limit(1).execute().data) or []
        if owned:
            household_id = owned[0]['id']
        else:
            created = (client.table('households').insert({
                'organization_id': org_id,
                'name': f"{(guardian_last_name or 'New').strip() or 'New'} Family",
                'primary_contact_user_id': guardian_id,
            }).execute().data)
            household_id = created[0]['id']

        already_guardian = (client.table('household_members').select('id')
                            .eq('household_id', household_id)
                            .eq('user_id', guardian_id).execute().data) or []
        if not already_guardian:
            client.table('household_members').insert({
                'household_id': household_id, 'user_id': guardian_id,
                'relationship': 'guardian', 'is_primary_guardian': True,
            }).execute()

    # 3) Add the student to the household (idempotent).
    already_member = (client.table('household_members').select('id')
                      .eq('household_id', household_id)
                      .eq('user_id', student_id).execute().data) or []
    if not already_member:
        client.table('household_members').insert({
            'household_id': household_id, 'user_id': student_id,
            'relationship': 'student', 'is_primary_guardian': False,
        }).execute()

    return household_id


@bp.route('/<org_id>/users/add', methods=['POST'])
@require_org_admin
def add_users_to_organization(current_user_id, current_org_id, is_superadmin, org_id):
    """Add users to organization (superadmin or org admin)

    When adding a user to an org:
    - Their current role becomes their org_role
    - Their role changes to 'org_managed'
    - organization_id is set to the org
    """
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        user_ids = data.get('user_ids', [])
        default_org_role = data.get('org_role', 'student')  # Default role in org

        if not user_ids:
            return jsonify({'error': 'user_ids is required'}), 400

        # Validate the requested org_role instead of trusting the raw body
        # (mass-assignment). Fall back to 'student' for anything unrecognized.
        from utils.roles import VALID_ORG_ROLES
        if default_org_role not in VALID_ORG_ROLES:
            default_org_role = 'student'

        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()

        skipped = 0
        # Update users to join organization with org_managed pattern
        for user_id in user_ids:
            # Get user's current role + org to preserve role and enforce scoping
            user_data = client.table('users').select('role, organization_id').eq('id', user_id).single().execute()
            current_role = user_data.data.get('role', 'student') if user_data.data else 'student'
            current_user_org = user_data.data.get('organization_id') if user_data.data else None

            # Don't change superadmin users
            if current_role == 'superadmin':
                logger.warning(f"Skipping superadmin user {user_id} - cannot add to organization")
                skipped += 1
                continue

            # IDOR-H6 fix: never absorb a user who already belongs to a DIFFERENT
            # org (that would pull another tenant's users + their minors' data
            # into this org). Only a superadmin may move a user across orgs.
            if current_user_org and current_user_org != org_id and not is_superadmin:
                logger.warning(f"Skipping user {user_id} - belongs to a different organization")
                skipped += 1
                continue

            # If already org_managed, just update org_id (they keep their org_role)
            if current_role == 'org_managed':
                client.table('users')\
                    .update({'organization_id': org_id})\
                    .eq('id', user_id)\
                    .execute()
            else:
                # Convert platform user to org user
                # Use their current role as org_role, or default if provided
                org_role = current_role if current_role in ['student', 'parent', 'advisor', 'observer'] else default_org_role
                client.table('users')\
                    .update({
                        'organization_id': org_id,
                        'role': 'org_managed',
                        'org_role': org_role
                    })\
                    .eq('id', user_id)\
                    .execute()

        users_added = len(user_ids) - skipped
        logger.info(f"Added {users_added} users to organization {org_id} ({skipped} skipped)")

        return jsonify({
            'message': f'Added {users_added} users to organization',
            'users_added': users_added,
            'skipped': skipped
        }), 200
    except Exception as e:
        logger.error(f"Error adding users to org {org_id}: {e}")
        raise


@bp.route('/<org_id>/users/remove', methods=['POST'])
@require_org_admin
def remove_user_from_organization(current_user_id, current_org_id, is_superadmin, org_id):
    """Remove user from organization (superadmin or org admin)

    User becomes a platform user (organization_id = NULL) with their org_role as their direct role.
    To fully delete a user, use the delete user endpoint instead.
    """
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        user_id = data.get('user_id')
        delete_user = data.get('delete_user', False)

        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400

        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()

        # IDOR-C5 fix: resolve the target and enforce that it actually belongs to
        # the org named in the URL BEFORE mutating. Previously the update was
        # scoped by user id only, so an org_admin could evict users from other
        # orgs and demote a superadmin (whose org_role is NULL -> 'student').
        target = client.table('users').select('role, org_role, organization_id').eq('id', user_id).single().execute()
        if not target.data:
            return jsonify({'error': 'User not found'}), 404
        target_role = target.data.get('role')
        target_org = target.data.get('organization_id')

        # Never remove/demote a superadmin through the org membership endpoint.
        if target_role == 'superadmin':
            return jsonify({'error': 'Cannot remove a superadmin from an organization'}), 403

        # This endpoint is org-scoped (/<org_id>/users/remove): the target must
        # be a member of that org, for every caller (superadmin included).
        if target_org != org_id:
            return jsonify({'error': 'User is not a member of this organization'}), 404

        if delete_user and is_superadmin:
            # Superadmin can fully delete user
            try:
                # Delete from Supabase Auth
                client.auth.admin.delete_user(user_id)
                logger.info(f"Deleted user {user_id} from organization {org_id}")
                return jsonify({'message': 'User deleted successfully'}), 200
            except Exception as auth_error:
                logger.error(f"Failed to delete auth user {user_id}: {auth_error}")
                return jsonify({'error': 'Failed to delete user from auth system'}), 500
        else:
            # Use their org_role as the resulting platform role, sanitized to a
            # valid platform role (org_admin is not a platform role -> student).
            platform_role = target.data.get('org_role') or 'student'
            if platform_role not in ('student', 'parent', 'advisor', 'observer'):
                platform_role = 'student'

            # Convert to platform user: NULL org, direct role, clear org_role.
            # Org filter on the update is defense-in-depth against races.
            client.table('users')\
                .update({
                    'organization_id': None,
                    'role': platform_role,
                    'org_role': None,
                    'is_org_admin': False
                })\
                .eq('id', user_id)\
                .eq('organization_id', org_id)\
                .execute()

            logger.info(f"Removed user {user_id} from organization {org_id} (now platform user with role={platform_role})")

            return jsonify({
                'message': 'User removed from organization',
                'note': 'User is now a platform user'
            }), 200
    except Exception as e:
        logger.error(f"Error removing user from org {org_id}: {e}")
        raise


@bp.route('/<org_id>/users/bulk-remove', methods=['POST'])
@require_org_admin
def bulk_remove_users_from_organization(current_user_id, current_org_id, is_superadmin, org_id):
    """Remove multiple users from organization (superadmin or org admin)

    Users become platform users (organization_id = NULL) with their org_role as direct role.
    """
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        user_ids = data.get('user_ids', [])

        if not user_ids:
            return jsonify({'error': 'No user IDs provided'}), 400

        if len(user_ids) > 50:
            return jsonify({'error': 'Maximum 50 users can be removed at once'}), 400

        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()

        removed = []
        failed = []

        for user_id in user_ids:
            try:
                # Get user's current org_role to use as their platform role
                user_data = client.table('users').select('org_role').eq('id', user_id).single().execute()
                platform_role = user_data.data.get('org_role', 'student') if user_data.data else 'student'

                # Convert to platform user: NULL org, direct role, clear org_role
                client.table('users')\
                    .update({
                        'organization_id': None,
                        'role': platform_role,
                        'org_role': None,
                        'is_org_admin': False
                    })\
                    .eq('id', user_id)\
                    .eq('organization_id', org_id)\
                    .execute()
                removed.append(user_id)
            except Exception as e:
                logger.error(f"Failed to remove user {user_id} from org {org_id}: {e}")
                failed.append({'id': user_id, 'error': str(e)[:100]})

        logger.info(f"Bulk removed {len(removed)} users from organization {org_id}")

        return jsonify({
            'success': True,
            'removed': len(removed),
            'failed': len(failed),
            'removed_ids': removed,
            'failed_details': failed
        }), 200
    except Exception as e:
        logger.error(f"Error bulk removing users from org {org_id}: {e}")
        raise


@bp.route('/<org_id>/users/create-username', methods=['POST'])
@require_org_front_office
def create_username_student(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Create a no-email org member account using username + auto-generated password.

    Primarily used by org admins to create accounts for students who don't have
    email addresses (e.g., young students in K-12 settings), but org_role also
    accepts 'parent', 'advisor', and 'observer' for no-email accounts of those
    types. 'org_admin' is intentionally excluded: admin accounts should always
    have a real email (invite flow) for credential recovery and audit trail.

    Password is auto-generated in kid-friendly format: PIN + word (e.g., "1234apple")

    Request body:
        username: str - Unique username within the organization (3-30 chars)
        first_name: str - Member's first name
        last_name: str - Member's last name
        org_role: str - Optional ('student', 'parent', 'advisor', 'observer'), defaults to 'student'

    Returns:
        201: User created with auto-generated credentials
        400: Validation error
        403: Access denied
        409: Username already exists in organization
    """
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        # Extract and validate required fields
        username = data.get('username', '').strip().lower()
        first_name = data.get('first_name', '').strip()
        last_name = data.get('last_name', '').strip()
        org_role = data.get('org_role', 'student')
        # When the admin creating the account is the student's own parent, link the
        # new student to the admin's account so it appears on their parent surfaces.
        link_to_me = bool(data.get('link_to_me'))

        # Validate required fields
        if not username:
            return jsonify({'error': 'username is required'}), 400
        if not first_name:
            return jsonify({'error': 'first_name is required'}), 400
        if not last_name:
            return jsonify({'error': 'last_name is required'}), 400

        # Validate username format
        if not USERNAME_PATTERN.match(username):
            return jsonify({
                'error': 'Invalid username format. Must be 1-30 characters, using only letters, numbers, dots, underscores, or hyphens. Cannot start or end with special characters.'
            }), 400

        # Validate org_role
        valid_roles = ['student', 'parent', 'advisor', 'observer']
        if org_role not in valid_roles:
            return jsonify({'error': f'org_role must be one of: {", ".join(valid_roles)}'}), 400
        from services.sis_service import caller_may_grant
        if not caller_may_grant(current_user_id, org_role):
            return jsonify({'error': 'Only an organization admin can add staff.'}), 403

        # Auto-generate kid-friendly password (PIN + word)
        password = generate_simple_password()

        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()

        # Get organization details (for slug in response)
        org_result = client.table('organizations').select('id, slug, name').eq('id', org_id).single().execute()
        if not org_result.data:
            return jsonify({'error': 'Organization not found'}), 404

        org_slug = org_result.data.get('slug')

        # Check username uniqueness within organization
        existing = client.table('users')\
            .select('id')\
            .eq('organization_id', org_id)\
            .ilike('username', username)\
            .execute()

        if existing.data:
            return jsonify({
                'error': f'Username "{username}" already exists in this organization'
            }), 409

        # Generate placeholder email for Supabase Auth
        # Format: orgstudent_{random}@optio-internal-placeholder.local
        random_suffix = secrets.token_hex(16)
        placeholder_email = f"orgstudent_{random_suffix}@optio-internal-placeholder.local"

        try:
            # Create Supabase Auth user with placeholder email and real password
            auth_response = client.auth.admin.create_user({
                'email': placeholder_email,
                'password': password,
                'email_confirm': True,  # Mark as confirmed (no verification email needed)
                'user_metadata': {
                    'username': username,
                    'organization_id': org_id,
                    'first_name': first_name,
                    'last_name': last_name,
                    'created_via': 'org_username_registration'
                },
                'app_metadata': {
                    'provider': 'org_username',
                    'providers': ['org_username']
                }
            })

            if not auth_response.user:
                return jsonify({'error': 'Failed to create auth account'}), 500

            user_id = auth_response.user.id

            # Create user record in public.users
            user_data = {
                'id': user_id,
                'username': username,
                'first_name': first_name,
                'last_name': last_name,
                'display_name': f"{first_name} {last_name}",
                'email': None,  # No email for username-based accounts
                'organization_id': org_id,
                'role': 'org_managed',
                'org_role': org_role,
                'total_xp': 0,
                'level': 1,
                'streak_days': 0
            }

            result = client.table('users').insert(user_data).execute()

            if not result.data:
                # Rollback: delete auth user if users table insert fails
                try:
                    client.auth.admin.delete_user(user_id)
                except Exception as cleanup_error:
                    logger.warning(f"Failed to cleanup auth user {user_id} after user creation failure: {cleanup_error}")
                return jsonify({'error': 'Failed to create user profile'}), 500

            logger.info(f"Created username-based student {user_id} ({username}) in org {org_id} by {current_user_id}")

            # Optionally link the new student to the admin as their parent. Only
            # meaningful for student accounts; mirrors how the iCreate funnel lets
            # same-org staff register their own kids (keeps their admin role primary
            # and gains 'parent' so parent surfaces light up).
            linked_to_parent = False
            if link_to_me and org_role == 'student':
                try:
                    now = datetime.utcnow().isoformat()
                    client.table('parent_student_links').insert({
                        'parent_user_id': current_user_id,
                        'student_user_id': user_id,
                        'status': 'approved',
                        'admin_verified': True,
                        'verified_by_admin_id': current_user_id,
                        'verified_at': now,
                        'admin_notes': 'Linked by org admin who is the student\'s parent'
                    }).execute()

                    # Ensure the admin carries a 'parent' role so parent-side
                    # features appear, without disturbing their primary admin role.
                    admin_row = client.table('users') \
                        .select('org_roles, org_role, last_name') \
                        .eq('id', current_user_id) \
                        .single() \
                        .execute()
                    current_roles = admin_row.data.get('org_roles') if admin_row.data else None
                    if not isinstance(current_roles, list):
                        legacy = (admin_row.data or {}).get('org_role')
                        current_roles = [legacy] if legacy else []
                    current_roles = [r for r in current_roles if r]
                    if 'parent' not in current_roles:
                        client.table('users') \
                            .update({'org_roles': current_roles + ['parent']}) \
                            .eq('id', current_user_id) \
                            .execute()

                    # Put the student in the admin's household. The Schedule Builder
                    # and other family surfaces resolve a parent's children from
                    # household membership (and managed_by_parent_id), NOT from
                    # parent_student_links, so a link alone leaves the child invisible
                    # there. Mirror the iCreate funnel by ensuring a shared household.
                    _ensure_shared_household(
                        client, org_id, current_user_id,
                        (admin_row.data or {}).get('last_name'), user_id
                    )

                    linked_to_parent = True
                    logger.info(f"Linked student {user_id} to parent/admin {current_user_id}")
                except Exception as link_error:
                    # Linking is best-effort; the account was created successfully.
                    logger.error(f"Failed to link student {user_id} to admin {current_user_id}: {link_error}")

            return jsonify({
                'success': True,
                'user': result.data[0],
                'linked_to_parent': linked_to_parent,
                'login_credentials': {
                    'username': username,
                    'password': password,  # Include generated password for org admin to share
                    'organization_slug': org_slug,
                    'login_url': f'/login/{org_slug}'
                },
                'message': 'Student account created successfully. Share the login credentials with the student.'
            }), 201

        except Exception as auth_error:
            logger.error(f"Error creating auth account for username student: {auth_error}")
            raise

    except Exception as e:
        logger.error(f"Error creating username student in org {org_id}: {e}")
        raise


@bp.route('/<org_id>/users/<user_id>/reset-password', methods=['POST'])
@require_org_admin
@require_relationship_to('user_id', allow=('org_staff',))
def reset_user_password(current_user_id, current_org_id, is_superadmin, org_id, user_id):
    """
    Reset password for a user in the organization.

    This is especially useful for username-based accounts that cannot use
    the "Forgot Password" flow since they don't have email addresses.

    For username-based accounts, auto-generates a kid-friendly password if none provided.

    Request body:
        new_password: str - Optional. If not provided, auto-generates a new password.
        regenerate: bool - Optional. If true, generates a new password even if new_password provided.

    Returns:
        200: Password reset successfully with new password
        400: Validation error
        403: Access denied or user not in organization
        404: User not found
    """
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json() or {}

        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()

        # Verify user exists and belongs to this organization
        user_result = client.table('users')\
            .select('id, username, email, organization_id, first_name, last_name')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        if user_result.data.get('organization_id') != org_id:
            return jsonify({'error': 'User does not belong to this organization'}), 403

        # Check if this is a username-based account (no email)
        is_username_account = user_result.data.get('username') and not user_result.data.get('email')

        # Determine password to use
        regenerate = data.get('regenerate', False)
        new_password = data.get('new_password', '')

        if regenerate or (not new_password and is_username_account):
            # Auto-generate a kid-friendly password for username accounts
            new_password = generate_simple_password()
        elif not new_password:
            return jsonify({'error': 'new_password is required'}), 400
        elif is_username_account:
            # Validate simple password format for username accounts
            is_valid, error_msg = validate_simple_password(new_password)
            if not is_valid:
                return jsonify({'error': error_msg}), 400
        else:
            # Use standard password validation for email accounts
            is_valid, password_errors = validate_password_strength(new_password)
            if not is_valid:
                return jsonify({
                    'error': 'Password does not meet requirements',
                    'details': password_errors
                }), 400

        # Update password in Supabase Auth
        try:
            client.auth.admin.update_user_by_id(user_id, {
                'password': new_password
            })
        except Exception as auth_error:
            logger.error(f"Failed to reset password for user {user_id}: {auth_error}")
            return jsonify({'error': 'Failed to reset password'}), 500

        user_name = f"{user_result.data.get('first_name', '')} {user_result.data.get('last_name', '')}".strip()
        username = user_result.data.get('username')

        logger.info(f"Password reset for user {user_id} ({username or user_name}) in org {org_id} by {current_user_id}")

        response_data = {
            'success': True,
            'message': f'Password reset successfully for {user_name}',
            'username': username
        }

        # Include the new password in response for username accounts (so admin can share it)
        if is_username_account or regenerate:
            response_data['new_password'] = new_password

        return jsonify(response_data), 200

    except Exception as e:
        logger.error(f"Error resetting password for user {user_id} in org {org_id}: {e}")
        raise

