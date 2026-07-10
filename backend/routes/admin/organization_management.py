"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Uses OrganizationService exclusively (service layer pattern)
- Service wraps OrganizationRepository for business logic
- Proper separation: Route -> Service -> Repository
- Phase 2 implementation already follows best practices

Organization Management Routes

Handles superadmin and org admin operations for multi-organization platform.
Created: 2025-12-07
Phase 2: Backend Repository & Service Layer
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_superadmin, require_org_admin
from services.organization_service import OrganizationService
from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.validation.password_validator import validate_password_strength
from datetime import datetime, date
import re
import secrets

logger = get_logger(__name__)

# Username validation pattern: 3-30 chars, alphanumeric, dots, underscores, hyphens
# Cannot start or end with dot/underscore/hyphen
USERNAME_PATTERN = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9._-]{1,28}[a-zA-Z0-9]$|^[a-zA-Z0-9]{1,2}$')

# Kid-friendly words for password generation
KID_FRIENDLY_WORDS = [
    'apple', 'banana', 'cherry', 'dragon', 'eagle', 'forest', 'garden', 'happy',
    'island', 'jungle', 'kitten', 'lemon', 'mango', 'ocean', 'panda', 'rabbit',
    'sunny', 'tiger', 'umbrella', 'violet', 'whale', 'yellow', 'zebra', 'cloud',
    'star', 'moon', 'river', 'mountain', 'flower', 'bird', 'fish', 'tree',
    'rainbow', 'rocket', 'planet', 'cookie', 'puppy', 'dolphin', 'penguin', 'lion'
]


def generate_simple_password():
    """
    Generate a kid-friendly password: 4-digit PIN + word
    Example: 1234apple, 5678tiger
    """
    import random
    pin = str(random.randint(1000, 9999))
    word = random.choice(KID_FRIENDLY_WORDS)
    return f"{pin}{word}"


def validate_simple_password(password: str):
    """
    Validate password for young students using PIN + word format.
    Accepts: 4+ digits followed by 4+ letters, OR 4+ letters followed by 4+ digits
    Examples: 1234apple, sunny5678

    Returns: (is_valid, error_message)
    """
    if not password or len(password) < 8:
        return False, 'Password must be at least 8 characters (4 digits + 4 letters)'

    pattern = re.compile(r'^\d{4,}[a-zA-Z]{4,}$|^[a-zA-Z]{4,}\d{4,}$')
    if pattern.match(password):
        return True, None

    return False, 'Password must be a PIN (4+ digits) followed by a word (4+ letters), like "1234apple"'


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
                       if m.get('relationship') in ('guardian', 'other') and m.get('household_id')]
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


bp = Blueprint('organization_management', __name__)


@bp.route('', methods=['GET'])
@require_superadmin
def list_organizations(superadmin_user_id):
    """List all organizations (superadmin only)"""
    try:
        service = OrganizationService()
        organizations = service.list_all_organizations()

        return jsonify({
            'organizations': organizations,
            'total': len(organizations)
        }), 200
    except Exception as e:
        logger.error(f"Error listing organizations: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('', methods=['POST'])
@require_superadmin
def create_organization(superadmin_user_id):
    """Create new organization (superadmin only)"""
    try:
        data = request.get_json()

        # Validate required fields
        required = ['name', 'slug', 'quest_visibility_policy']
        for field in required:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        service = OrganizationService()
        org = service.create_organization(
            name=data['name'],
            slug=data['slug'],
            policy=data['quest_visibility_policy'],
            created_by=superadmin_user_id
        )

        return jsonify(org), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error creating organization: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>', methods=['GET'])
@require_org_admin
def get_organization(current_user_id, current_org_id, is_superadmin, org_id):
    """Get organization details (org admin or superadmin)"""
    try:
        logger.info(f"get_organization called: user={current_user_id}, current_org={current_org_id}, is_superadmin={is_superadmin}, target_org={org_id}")

        # Verify access: org admin can only view their org, superadmin can view all
        if not is_superadmin and current_org_id != org_id:
            logger.warning(f"Access denied: not superadmin and org mismatch ({current_org_id} != {org_id})")
            return jsonify({'error': 'Access denied'}), 403

        service = OrganizationService()
        org = service.get_organization_dashboard_data(org_id)
        logger.info(f"Organization data fetched successfully for {org_id}")

        return jsonify(org), 200
    except Exception as e:
        logger.error(f"Error getting organization {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>', methods=['PUT'])
@require_org_admin
def update_organization(current_user_id, current_org_id, is_superadmin, org_id):
    """Update organization (org_admin for own org, superadmin for any)"""
    try:
        # Org admins can only update their own organization
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'You can only update your own organization'}), 403

        data = request.get_json()

        # Define allowed fields based on role
        # Org admins can update branding, AI settings, and course visibility policy
        if is_superadmin:
            allowed_fields = ['name', 'quest_visibility_policy', 'course_visibility_policy', 'branding_config', 'is_active',
                            'ai_features_enabled', 'ai_chatbot_enabled', 'ai_lesson_helper_enabled', 'ai_task_generation_enabled',
                            'feature_flags']
        else:
            # Org admins can update name, branding, AI settings, visibility policies, and feature flags
            allowed_fields = ['name', 'branding_config', 'quest_visibility_policy', 'course_visibility_policy', 'ai_features_enabled',
                            'ai_chatbot_enabled', 'ai_lesson_helper_enabled', 'ai_task_generation_enabled', 'feature_flags']

        update_data = {k: v for k, v in data.items() if k in allowed_fields}

        if not update_data:
            return jsonify({'error': 'No valid fields to update'}), 400

        # A malformed Stripe key breaks the iCreate registration funnel at the
        # "Pay securely" step, so reject it at save time. Secret keys are sk_…
        # (or restricted rk_…); loose enough for legacy keys without live/test.
        stripe_key = (((update_data.get('feature_flags') or {}).get('icreate_registration') or {})
                      .get('stripe_secret_key') or '').strip()
        if stripe_key and not re.match(r'^(sk|rk)_[A-Za-z0-9_]{20,}$', stripe_key):
            return jsonify({'error': "That doesn't look like a Stripe secret key — it should start with "
                                     "sk_live_ or rk_live_. Copy the full key from Stripe Dashboard -> "
                                     "Developers -> API keys."}), 400

        service = OrganizationService()
        org = None

        # If updating quest policy, use dedicated method (superadmin only)
        if 'quest_visibility_policy' in update_data:
            org = service.update_organization_policy(
                org_id,
                update_data['quest_visibility_policy'],
                current_user_id
            )
            del update_data['quest_visibility_policy']

        # If updating course policy, use dedicated method
        if 'course_visibility_policy' in update_data:
            org = service.update_course_visibility_policy(
                org_id,
                update_data['course_visibility_policy'],
                current_user_id
            )
            del update_data['course_visibility_policy']

        # Handle remaining updates
        if update_data:
            from repositories.organization_repository import OrganizationRepository
            repo = OrganizationRepository()
            org = repo.update_organization(org_id, update_data)

        # If no updates were made, fetch current org data
        if org is None:
            from repositories.organization_repository import OrganizationRepository
            repo = OrganizationRepository()
            org = repo.find_by_id(org_id)

        return jsonify(org), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error updating organization {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/quests/grant', methods=['POST'])
@require_org_admin
def grant_quest_access(current_user_id, current_org_id, is_superadmin, org_id):
    """Grant organization access to a quest (curated policy only)"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        quest_id = data.get('quest_id')

        if not quest_id:
            return jsonify({'error': 'quest_id is required'}), 400

        service = OrganizationService()
        result = service.grant_quest_access(org_id, quest_id, current_user_id)

        return jsonify(result), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error granting quest access to org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/quests/revoke', methods=['POST'])
@require_org_admin
def revoke_quest_access(current_user_id, current_org_id, is_superadmin, org_id):
    """Revoke organization access to a quest"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        quest_id = data.get('quest_id')

        if not quest_id:
            return jsonify({'error': 'quest_id is required'}), 400

        service = OrganizationService()
        success = service.revoke_quest_access(org_id, quest_id, current_user_id)

        if success:
            return jsonify({'message': 'Quest access revoked'}), 200
        else:
            return jsonify({'error': 'Failed to revoke access'}), 500
    except Exception as e:
        logger.error(f"Error revoking quest access from org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/quests', methods=['GET'])
@require_org_admin
def list_organization_quests(current_user_id, current_org_id, is_superadmin, org_id):
    """
    List all quests created by this organization.

    Org admins can only view quests for their own organization.
    Superadmins can view quests for any organization.

    Returns:
        200: List of organization quests
        403: Access denied
    """
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()

        # Get quests created by this organization
        result = client.table('quests')\
            .select('*')\
            .eq('organization_id', org_id)\
            .order('created_at', desc=True)\
            .execute()

        quests = result.data or []

        return jsonify({
            'quests': quests,
            'total': len(quests)
        }), 200

    except Exception as e:
        logger.error(f"Error listing quests for org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/courses/grant', methods=['POST'])
@require_org_admin
def grant_course_access(current_user_id, current_org_id, is_superadmin, org_id):
    """Grant organization access to a course (curated policy only)"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        course_id = data.get('course_id')

        if not course_id:
            return jsonify({'error': 'course_id is required'}), 400

        service = OrganizationService()
        result = service.grant_course_access(org_id, course_id, current_user_id)

        return jsonify(result), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error granting course access to org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/courses/revoke', methods=['POST'])
@require_org_admin
def revoke_course_access(current_user_id, current_org_id, is_superadmin, org_id):
    """Revoke organization access to a course"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        course_id = data.get('course_id')

        if not course_id:
            return jsonify({'error': 'course_id is required'}), 400

        service = OrganizationService()
        success = service.revoke_course_access(org_id, course_id, current_user_id)

        if success:
            return jsonify({'message': 'Course access revoked'}), 200
        else:
            return jsonify({'error': 'Failed to revoke access'}), 500
    except Exception as e:
        logger.error(f"Error revoking course access from org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/users', methods=['GET'])
@require_org_admin
def list_organization_users(current_user_id, current_org_id, is_superadmin, org_id):
    """List users in organization, optionally filtered by role"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        role = request.args.get('role')

        from repositories.organization_repository import OrganizationRepository
        repo = OrganizationRepository()
        users = repo.get_organization_users(org_id, role=role)

        return jsonify({
            'users': users,
            'total': len(users)
        }), 200
    except Exception as e:
        logger.error(f"Error listing users for org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/analytics', methods=['GET'])
@require_org_admin
def get_organization_analytics(current_user_id, current_org_id, is_superadmin, org_id):
    """Get analytics for organization"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        from repositories.organization_repository import OrganizationRepository
        repo = OrganizationRepository()
        analytics = repo.get_organization_analytics(org_id)

        return jsonify(analytics), 200
    except Exception as e:
        logger.error(f"Error getting analytics for org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/ai-access', methods=['POST'])
@require_org_admin
def toggle_organization_ai_access(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Enable or disable AI features for the entire organization.
    Org admins can toggle this for their own organization.
    Superadmins can toggle for any organization.

    Required fields:
        - enabled: bool

    Returns:
        200: AI access updated successfully
        400: Validation error
        403: Access denied
    """
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        enabled = data.get('enabled')
        if enabled is None:
            return jsonify({'error': 'enabled field is required'}), 400

        if not isinstance(enabled, bool):
            return jsonify({'error': 'enabled must be a boolean'}), 400

        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()

        # Update organization AI settings
        result = client.table('organizations').update({
            'ai_features_enabled': enabled
        }).eq('id', org_id).execute()

        if not result.data:
            return jsonify({'error': 'Failed to update AI access setting'}), 500

        action = "enabled" if enabled else "disabled"
        logger.info(f"User {current_user_id} {action} AI features for organization {org_id}")

        return jsonify({
            'success': True,
            'message': f'AI features {action} for organization',
            'organization_id': org_id,
            'ai_features_enabled': enabled
        }), 200

    except Exception as e:
        logger.error(f"Error toggling AI access for org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


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

        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()

        # Update users to join organization with org_managed pattern
        for user_id in user_ids:
            # Get user's current role to preserve it as org_role
            user_data = client.table('users').select('role').eq('id', user_id).single().execute()
            current_role = user_data.data.get('role', 'student') if user_data.data else 'student'

            # Don't change superadmin users
            if current_role == 'superadmin':
                logger.warning(f"Skipping superadmin user {user_id} - cannot add to organization")
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

        logger.info(f"Added {len(user_ids)} users to organization {org_id}")

        return jsonify({
            'message': f'Added {len(user_ids)} users to organization',
            'users_added': len(user_ids)
        }), 200
    except Exception as e:
        logger.error(f"Error adding users to org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


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
                .execute()

            logger.info(f"Removed user {user_id} from organization {org_id} (now platform user with role={platform_role})")

            return jsonify({
                'message': 'User removed from organization',
                'note': 'User is now a platform user'
            }), 200
    except Exception as e:
        logger.error(f"Error removing user from org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


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
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/students/progress', methods=['GET'])
@require_org_admin
def get_student_progress(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Get detailed progress report for all students in an organization.

    Query params:
        start_date: Optional start date filter (YYYY-MM-DD)
        end_date: Optional end date filter (YYYY-MM-DD)
        format: 'json' (default) or 'csv'
        role: Filter by role (default: 'student')

    Returns per-student:
        - name, email
        - total XP
        - quests enrolled / completed
        - tasks completed (period and all-time)
        - last active date
        - badge count
    """
    from datetime import datetime, timedelta
    import csv
    import io

    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        # Parse query params
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        output_format = request.args.get('format', 'json')
        role_filter = request.args.get('role', 'student')

        # Default date range: last 30 days
        if not end_date:
            end_date = datetime.now().strftime('%Y-%m-%d')
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')

        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()

        # Get students in organization
        # Note: Org users have role='org_managed' with actual role in org_role
        users_query = client.table('users')\
            .select('id, email, display_name, first_name, last_name, total_xp, last_active, created_at, org_role')\
            .eq('organization_id', org_id)\
            .eq('org_role', role_filter)\
            .order('first_name')

        users_response = users_query.execute()
        students = users_response.data or []

        if not students:
            return jsonify({
                'success': True,
                'students': [],
                'summary': {
                    'total_students': 0,
                    'total_xp': 0,
                    'total_completions': 0,
                    'avg_xp': 0,
                    'date_range': {'start': start_date, 'end': end_date}
                }
            }), 200

        student_ids = [s['id'] for s in students]

        # Initialize empty results in case there are no students
        user_quests_data = []
        completed_tasks_period_raw = []
        completed_tasks_all_raw = []

        # Only query if we have students (avoid empty IN clause)
        if student_ids:
            # Get quest enrollments for all students
            user_quests = client.table('user_quests')\
                .select('user_id, quest_id, status')\
                .in_('user_id', student_ids)\
                .execute()
            user_quests_data = user_quests.data or []

            # Get COMPLETED tasks for all students (in date range)
            # Note: quest_task_completions contains tasks actually marked as done with evidence
            # Join with user_quest_tasks via user_quest_task_id FK to get the xp_value
            completed_tasks_period = client.table('quest_task_completions')\
                .select('user_id, user_quest_task_id, completed_at, user_quest_tasks(xp_value)')\
                .in_('user_id', student_ids)\
                .gte('completed_at', f"{start_date}T00:00:00")\
                .lte('completed_at', f"{end_date}T23:59:59")\
                .execute()
            completed_tasks_period_raw = completed_tasks_period.data or []

            # Get all-time completed tasks
            completed_tasks_all = client.table('quest_task_completions')\
                .select('user_id, user_quest_task_id, user_quest_tasks(xp_value)')\
                .in_('user_id', student_ids)\
                .execute()
            completed_tasks_all_raw = completed_tasks_all.data or []


        # Aggregate data by student
        quest_data = {}
        for uq in user_quests_data:
            uid = uq['user_id']
            if uid not in quest_data:
                quest_data[uid] = {'enrolled': 0, 'completed': 0}
            quest_data[uid]['enrolled'] += 1
            if uq.get('status') in ['completed', 'set_down']:
                quest_data[uid]['completed'] += 1

        # Aggregate completed tasks (period) - count and XP
        completion_period_data = {}
        xp_period_data = {}
        for t in completed_tasks_period_raw:
            uid = t['user_id']
            completion_period_data[uid] = completion_period_data.get(uid, 0) + 1
            # XP comes from the joined user_quest_tasks record
            task_data = t.get('user_quest_tasks') or {}
            xp_value = task_data.get('xp_value') or 0
            xp_period_data[uid] = xp_period_data.get(uid, 0) + xp_value

        # Aggregate completed tasks (all-time) - count and XP
        completion_all_data = {}
        xp_all_data = {}
        for t in completed_tasks_all_raw:
            uid = t['user_id']
            completion_all_data[uid] = completion_all_data.get(uid, 0) + 1
            # XP comes from the joined user_quest_tasks record
            task_data = t.get('user_quest_tasks') or {}
            xp_value = task_data.get('xp_value') or 0
            xp_all_data[uid] = xp_all_data.get(uid, 0) + xp_value

        # Build student progress list
        student_progress = []
        total_xp = 0
        total_completions = 0

        for student in students:
            sid = student['id']
            # Use XP calculated from actually completed tasks (with evidence)
            xp = xp_all_data.get(sid, 0)
            total_xp += xp

            quests = quest_data.get(sid, {'enrolled': 0, 'completed': 0})
            tasks_period = completion_period_data.get(sid, 0)
            tasks_all = completion_all_data.get(sid, 0)

            total_completions += tasks_period

            display_name = student.get('display_name') or \
                f"{student.get('first_name', '')} {student.get('last_name', '')}".strip() or \
                student.get('email', 'Unknown')

            student_progress.append({
                'id': sid,
                'name': display_name,
                'email': student.get('email'),
                'total_xp': xp,
                'quests_enrolled': quests['enrolled'],
                'quests_completed': quests['completed'],
                'tasks_completed_period': tasks_period,
                'tasks_completed_all': tasks_all,
                'last_active': student.get('last_active'),
                'joined': student.get('created_at')
            })

        # Sort by total XP (descending) by default
        student_progress.sort(key=lambda x: x['total_xp'], reverse=True)

        # Calculate summary
        avg_xp = total_xp / len(students) if students else 0

        summary = {
            'total_students': len(students),
            'total_xp': total_xp,
            'total_completions_period': total_completions,
            'avg_xp': round(avg_xp, 2),
            'date_range': {'start': start_date, 'end': end_date}
        }

        # Handle CSV export
        if output_format == 'csv':
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow([
                'Name', 'Email', 'Total XP', 'Quests Enrolled', 'Quests Completed',
                'Tasks (Period)', 'Tasks (All Time)', 'Last Active', 'Joined'
            ])
            for s in student_progress:
                writer.writerow([
                    s['name'], s['email'], s['total_xp'], s['quests_enrolled'],
                    s['quests_completed'], s['tasks_completed_period'],
                    s['tasks_completed_all'],
                    s['last_active'] or '', s['joined'] or ''
                ])

            output.seek(0)
            from flask import Response
            return Response(
                output.getvalue(),
                mimetype='text/csv',
                headers={'Content-Disposition': f'attachment; filename=student_progress_{org_id}_{start_date}_to_{end_date}.csv'}
            )

        return jsonify({
            'success': True,
            'students': student_progress,
            'summary': summary
        }), 200

    except Exception as e:
        logger.error(f"Error getting student progress for org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/users/create-username', methods=['POST'])
@require_org_admin
def create_username_student(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Create a student account using username + auto-generated password (no email required).

    This allows org admins to create accounts for students who don't have
    email addresses (e.g., young students in K-12 settings).

    Password is auto-generated in kid-friendly format: PIN + word (e.g., "1234apple")

    Request body:
        username: str - Unique username within the organization (3-30 chars)
        first_name: str - Student's first name
        last_name: str - Student's last name
        org_role: str - Optional, defaults to 'student'

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
            return jsonify({'error': f'Failed to create account: {str(auth_error)}'}), 500

    except Exception as e:
        logger.error(f"Error creating username student in org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


EMAIL_PATTERN = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

# Pillars used to initialize a new student's skill XP rows
SKILL_PILLARS = [
    'Arts & Creativity', 'STEM & Logic', 'Life & Wellness',
    'Language & Communication', 'Society & Culture'
]


def generate_email_temp_password(length=12):
    """Generate a secure temporary password for an email-based account."""
    import string
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def _join_titles(titles):
    """Join titles into a readable phrase: 'A', 'A and B', or 'A, B, and C'."""
    titles = [t for t in titles if t]
    if not titles:
        return ''
    if len(titles) == 1:
        return titles[0]
    if len(titles) == 2:
        return f"{titles[0]} and {titles[1]}"
    return f"{', '.join(titles[:-1])}, and {titles[-1]}"


@bp.route('/<org_id>/register-student-for-course', methods=['POST'])
@require_org_admin
def register_student_for_course(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Register a student into the organization and enroll them in one or more
    Optio courses in a single step.

    Designed for partner programs that sell one-off course purchases: the
    partner's org_admin fills out a simple form (student details + a multi-select
    of courses) after a purchase.

    Handles both cases:
      - New student: creates an org-managed account with a temporary password and
        emails the family their login plus a "how Optio works" overview.
      - Returning student (e.g. a second purchase months later): finds the
        existing account by email and enrolls it in the newly selected courses,
        skipping any they are already in. No new password is issued.

    Request body:
        first_name: str (required)
        last_name: str (required)
        student_email: str (required) - the student's login
        course_ids: list[str] (required) - one or more published courses
                    (a single course_id string is also accepted)
        date_of_birth: str (optional, YYYY-MM-DD)
        family_email: str (optional) - where the email is sent (defaults to student_email)
    """
    try:
        # Verify access - org admin can only register into their own org
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        first_name = (data.get('first_name') or '').strip()
        last_name = (data.get('last_name') or '').strip()
        student_email = (data.get('student_email') or '').strip().lower()
        dob = (data.get('date_of_birth') or '').strip()

        # Accept either a list of course_ids or a single course_id
        course_ids = data.get('course_ids')
        if not course_ids:
            single = (data.get('course_id') or '').strip()
            course_ids = [single] if single else []
        # Normalize: stringify, strip, drop blanks, de-duplicate (order preserved)
        seen = set()
        course_ids = [c for c in (str(cid).strip() for cid in course_ids)
                      if c and not (c in seen or seen.add(c))]

        # Validate required fields
        if not first_name:
            return jsonify({'error': 'first_name is required'}), 400
        if not last_name:
            return jsonify({'error': 'last_name is required'}), 400
        if not student_email or not EMAIL_PATTERN.match(student_email):
            return jsonify({'error': 'A valid student_email is required'}), 400
        if not course_ids:
            return jsonify({'error': 'Select at least one course'}), 400

        # Validate date of birth if provided
        dob_iso = None
        requires_parental_consent = False
        if dob:
            try:
                dob_date = datetime.strptime(dob, '%Y-%m-%d').date()
            except ValueError:
                return jsonify({'error': 'date_of_birth must be in YYYY-MM-DD format'}), 400
            if dob_date > date.today():
                return jsonify({'error': 'date_of_birth cannot be in the future'}), 400
            dob_iso = dob_date.isoformat()
            if (date.today() - dob_date).days / 365.25 < 13:
                requires_parental_consent = True

        # admin client justified: admin-only route (@require_org_admin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()

        # Verify organization exists
        org_result = client.table('organizations').select('id, slug, name').eq('id', org_id).single().execute()
        if not org_result.data:
            return jsonify({'error': 'Organization not found'}), 404
        org_name = org_result.data.get('name')

        # Verify every selected course exists and is published
        courses_result = client.table('courses').select('id, title, status').in_('id', course_ids).execute()
        found = {c['id']: c for c in (courses_result.data or [])}
        missing = [cid for cid in course_ids if cid not in found]
        if missing:
            return jsonify({'error': 'One or more selected courses were not found'}), 404
        unpublished = [found[cid]['title'] for cid in course_ids if found[cid].get('status') != 'published']
        if unpublished:
            return jsonify({'error': f"These courses are not published: {', '.join(unpublished)}"}), 400
        ordered_courses = [found[cid] for cid in course_ids]  # preserve requested order

        # Look up an existing account by email
        existing = client.table('users').select('id, organization_id, role, org_role').eq('email', student_email).execute()
        existing_user = existing.data[0] if existing.data else None
        is_new_account = existing_user is None
        temp_password = None
        user_record = None

        if existing_user:
            existing_org = existing_user.get('organization_id')
            # Only an account already in THIS org counts as a returning student.
            # Never adopt or modify an account that belongs to another org or to no
            # org at all (a platform user, or staff such as an advisor/superadmin) -
            # doing so could overwrite their role. Refuse and let a human sort it out.
            if existing_org != org_id:
                return jsonify({
                    'error': (
                        f"An account already exists for {student_email} outside this program, "
                        f"so it can't be registered here. Use a different email, or contact "
                        f"support to add this course to that account."
                    )
                }), 409
            user_id = existing_user['id']
        else:
            # Create the Supabase Auth account with a temporary password
            temp_password = generate_email_temp_password()
            try:
                auth_response = client.auth.admin.create_user({
                    'email': student_email,
                    'password': temp_password,
                    'email_confirm': True,
                    'user_metadata': {
                        'first_name': first_name,
                        'last_name': last_name,
                        'organization_id': org_id,
                        'created_via': 'org_course_registration'
                    }
                })
            except Exception as auth_error:
                error_str = str(auth_error).lower()
                if 'already registered' in error_str or 'already exists' in error_str:
                    return jsonify({
                        'error': f'An account already exists for {student_email}. Try again, or use the enrollment manager.'
                    }), 409
                logger.error(f"Failed to create auth account for {student_email}: {auth_error}")
                return jsonify({'error': 'Failed to create student account'}), 500

            if not auth_response.user:
                return jsonify({'error': 'Failed to create student account'}), 500
            user_id = auth_response.user.id

            user_data = {
                'id': user_id,
                'email': student_email,
                'first_name': first_name,
                'last_name': last_name,
                'display_name': f"{first_name} {last_name}",
                'organization_id': org_id,
                'role': 'org_managed',
                'org_role': 'student',
                'total_xp': 0,
                'level': 1,
                'streak_days': 0
            }
            if dob_iso:
                user_data['date_of_birth'] = dob_iso
            if requires_parental_consent:
                user_data['requires_parental_consent'] = True

            try:
                profile_result = client.table('users').insert(user_data).execute()
                if not profile_result.data:
                    raise Exception('Profile insert returned no data')
                user_record = profile_result.data[0]
            except Exception as profile_error:
                try:
                    client.auth.admin.delete_user(user_id)
                except Exception as cleanup_error:
                    logger.warning(f"Failed to clean up auth user {user_id} after profile failure: {cleanup_error}")
                logger.error(f"Failed to create profile for {student_email}: {profile_error}")
                return jsonify({'error': 'Failed to create student profile'}), 500

            # Initialize skill XP rows (best-effort)
            try:
                client.table('user_skill_xp').upsert(
                    [{'user_id': user_id, 'pillar': pillar, 'xp_amount': 0} for pillar in SKILL_PILLARS],
                    on_conflict='user_id,pillar'
                ).execute()
            except Exception as skill_error:
                logger.warning(f"Failed to initialize skill XP for {user_id}: {skill_error}")

        # Enroll the student in each selected course
        from services.course_enrollment_service import CourseEnrollmentService
        enrollment_service = CourseEnrollmentService(client)

        course_results = []
        newly_enrolled_titles = []
        for course in ordered_courses:
            result = enrollment_service.enroll_user(user_id, course['id'])
            status = result.get('status', 'failed') if result.get('success') else 'failed'
            course_results.append({
                'course_id': course['id'],
                'course_title': course['title'],
                'status': status,
                'quests_enrolled': result.get('quests_enrolled', 0) if result.get('success') else 0,
                'error': None if result.get('success') else result.get('error')
            })
            if status in ('enrolled', 'reactivated'):
                newly_enrolled_titles.append(course['title'])

        any_enrolled = any(r['status'] in ('enrolled', 'reactivated', 'already_enrolled') for r in course_results)
        if is_new_account and not any_enrolled:
            logger.error(f"Created student {user_id} but no course enrollment succeeded: {course_results}")
            return jsonify({
                'error': 'The account was created but course enrollment failed. Enroll them manually from the enrollment manager.',
                'user_id': user_id,
                'courses': course_results
            }), 500

        # Human-readable course phrase for the email
        email_titles = newly_enrolled_titles if newly_enrolled_titles else [c['title'] for c in ordered_courses]
        courses_sentence = _join_titles(email_titles)

        # Send the appropriate email (best-effort; never fail the request on email)
        email_sent = False
        try:
            from app_config import Config
            from services.email_service import email_service
            frontend_url = (Config.FRONTEND_URL or '').rstrip('/')
            login_url = f"{frontend_url}/login"
            if is_new_account:
                email_sent = email_service.send_org_course_welcome_email(
                    to_email=student_email,
                    student_name=first_name,
                    student_email=student_email,
                    temp_password=temp_password,
                    org_name=org_name,
                    courses_sentence=courses_sentence,
                    course_count=len(email_titles),
                    login_url=login_url
                )
            elif newly_enrolled_titles:
                email_sent = email_service.send_org_courses_added_email(
                    to_email=student_email,
                    student_name=first_name,
                    org_name=org_name,
                    courses_sentence=courses_sentence,
                    course_count=len(newly_enrolled_titles),
                    login_url=login_url
                )
        except Exception as email_error:
            logger.warning(f"Welcome/added email to {student_email} failed: {email_error}")

        logger.info(
            f"{'Created' if is_new_account else 'Updated'} student {user_id} ({student_email}) in org {org_id}; "
            f"courses={[r['status'] for r in course_results]}; email_sent={email_sent} by {current_user_id}"
        )

        response = {
            'success': True,
            'is_new_account': is_new_account,
            'user_id': user_id,
            'courses': course_results,
            'email_to': student_email,
            'email_sent': email_sent,
        }
        if user_record is not None:
            response['user'] = user_record
        if is_new_account:
            # The temp password is emailed directly to the student; it is intentionally
            # NOT returned to the admin's browser.
            response['message'] = 'Student registered and enrolled. A welcome email was sent to the student.'
        else:
            response['message'] = 'Existing student enrolled in the selected course(s).'
        return jsonify(response), 201

    except Exception as e:
        logger.error(f"Error registering student for courses in org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/course-enrollments', methods=['GET'])
@require_org_admin
def list_org_course_enrollments(current_user_id, current_org_id, is_superadmin, org_id):
    """
    List course enrollments for every student in the organization, with student
    and course details. Used by the partner dashboard's "Active Enrollments" tab.

    Query params:
        status: enrollment status filter (default 'active'; pass 'all' for everything)
    """
    try:
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        status_filter = (request.args.get('status') or 'active').strip().lower()

        # admin client justified: admin-only route (@require_org_admin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()

        # All users in the organization
        users_res = client.table('users')\
            .select('id, first_name, last_name, display_name, email, date_of_birth')\
            .eq('organization_id', org_id)\
            .execute()
        users_by_id = {u['id']: u for u in (users_res.data or [])}
        if not users_by_id:
            return jsonify({'success': True, 'enrollments': [], 'total': 0}), 200

        user_ids = list(users_by_id.keys())

        # Enrollments for those users
        query = client.table('course_enrollments')\
            .select('id, user_id, course_id, status, enrolled_at')\
            .in_('user_id', user_ids)
        if status_filter != 'all':
            query = query.eq('status', status_filter)
        enroll_res = query.order('enrolled_at', desc=True).execute()
        enrollments = enroll_res.data or []

        # Course titles
        course_ids = list({e['course_id'] for e in enrollments if e.get('course_id')})
        courses_by_id = {}
        if course_ids:
            courses_res = client.table('courses').select('id, title').in_('id', course_ids).execute()
            courses_by_id = {c['id']: c['title'] for c in (courses_res.data or [])}

        result = []
        for e in enrollments:
            u = users_by_id.get(e['user_id'], {})
            name = (u.get('display_name') or f"{u.get('first_name', '') or ''} {u.get('last_name', '') or ''}").strip()
            result.append({
                'enrollment_id': e['id'],
                'student_id': e['user_id'],
                'student_name': name or u.get('email'),
                'student_email': u.get('email'),
                'date_of_birth': u.get('date_of_birth'),
                'course_id': e.get('course_id'),
                'course_title': courses_by_id.get(e.get('course_id'), 'Unknown course'),
                'status': e.get('status'),
                'enrolled_at': e.get('enrolled_at'),
            })

        return jsonify({'success': True, 'enrollments': result, 'total': len(result)}), 200

    except Exception as e:
        logger.error(f"Error listing course enrollments for org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/course-enrollments/remove', methods=['POST'])
@require_org_admin
def remove_org_course_enrollment(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Remove a student's access to a course (unenroll). Used by the partner
    dashboard's "Remove access" action.

    Request body:
        student_id: str (required) - the student to unenroll
        course_id: str (required) - the course to remove access to
    """
    try:
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json() or {}
        student_id = (data.get('student_id') or '').strip()
        course_id = (data.get('course_id') or '').strip()
        if not student_id or not course_id:
            return jsonify({'error': 'student_id and course_id are required'}), 400

        # admin client justified: admin-only route (@require_org_admin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()

        # The student must belong to this organization
        student_res = client.table('users').select('id, organization_id').eq('id', student_id).single().execute()
        if not student_res.data or student_res.data.get('organization_id') != org_id:
            return jsonify({'error': 'Student not found in this organization'}), 404

        from services.course_enrollment_service import CourseEnrollmentService
        result = CourseEnrollmentService(client).unenroll_user(student_id, course_id)
        if not result.get('success'):
            return jsonify({'error': result.get('error', 'Failed to remove access')}), 500

        logger.info(f"Removed course {course_id} access for student {student_id} in org {org_id} by {current_user_id}")
        return jsonify({'success': True, 'message': 'Access removed.'}), 200

    except Exception as e:
        logger.error(f"Error removing course enrollment in org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/<org_id>/users/<user_id>/reset-password', methods=['POST'])
@require_org_admin
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
        return jsonify({'error': str(e)}), 500
