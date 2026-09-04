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
from utils.auth.decorators import require_superadmin, require_org_admin, require_org_front_office
from services.organization_service import OrganizationService
from database import get_supabase_admin_client
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger
from datetime import datetime
import re

logger = get_logger(__name__)

bp = Blueprint('organization_management', __name__)


@bp.route('', methods=['GET'])
@require_superadmin
def list_organizations(superadmin_user_id):
    """List all organizations (superadmin only).

    ?include_archived=true also returns archived orgs, so the dashboard can
    offer Restore / Delete on them. Every other caller keeps the active-only
    default.
    """
    try:
        include_archived = request.args.get('include_archived', '').lower() in ('1', 'true', 'yes')

        service = OrganizationService()
        organizations = service.list_all_organizations(include_archived=include_archived)

        return jsonify({
            'organizations': organizations,
            'total': len(organizations)
        }), 200
    except Exception as e:
        logger.error(f"Error listing organizations: {e}")
        raise


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
        raise


# Front office, not finance: the SIS console reads this for the rooms, blocks and
# registration funnel a coordinator runs; prices come out per-field, see
# utils/org_finance_flags.py.
@bp.route('/<org_id>', methods=['GET'])
@require_org_front_office
def get_organization(current_user_id, current_org_id, is_superadmin, org_id):
    """Get organization details (front office or superadmin)"""
    try:
        logger.info(f"get_organization called: user={current_user_id}, current_org={current_org_id}, is_superadmin={is_superadmin}, target_org={org_id}")

        # Verify access: org admin can only view their org, superadmin can view all
        if not is_superadmin and current_org_id != org_id:
            logger.warning(f"Access denied: not superadmin and org mismatch ({current_org_id} != {org_id})")
            return jsonify({'error': 'Access denied'}), 403

        from services import sis_service
        org = OrganizationService().get_organization_dashboard_data(
            org_id, include_finance=sis_service.caller_sees_pay(current_user_id))
        logger.info(f"Organization data fetched successfully for {org_id}")

        return jsonify(org), 200
    except Exception as e:
        logger.error(f"Error getting organization {org_id}: {e}")
        raise


@bp.route('/<org_id>', methods=['PUT'])
@require_org_front_office
def update_organization(current_user_id, current_org_id, is_superadmin, org_id):
    """Update organization (org_admin for own org, superadmin for any)"""
    try:
        # Org admins can only update their own organization
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'You can only update your own organization'}), 403

        data = request.get_json()

        from services import sis_service
        sees_finance = sis_service.caller_sees_pay(current_user_id)

        # Define allowed fields based on role
        # Org admins can update branding, AI settings, and course visibility policy
        if not sees_finance:
            # Campus coordinator: the settings blob only, never the org's name,
            # branding, AI entitlements or visibility policies.
            allowed_fields = ['feature_flags']
        elif is_superadmin:
            # Slug is superadmin-only: it is the school's login URL (/login/<slug>),
            # so renaming it invalidates every link and printed QR an org has handed out.
            allowed_fields = ['name', 'slug', 'quest_visibility_policy', 'course_visibility_policy', 'branding_config', 'is_active',
                            'ai_features_enabled', 'ai_chatbot_enabled', 'ai_lesson_helper_enabled', 'ai_task_generation_enabled',
                            'feature_flags']
        else:
            # Org admins can update name, branding, AI settings, visibility policies, and feature flags
            allowed_fields = ['name', 'branding_config', 'quest_visibility_policy', 'course_visibility_policy', 'ai_features_enabled',
                            'ai_chatbot_enabled', 'ai_lesson_helper_enabled', 'ai_task_generation_enabled', 'feature_flags']

        update_data = {k: v for k, v in data.items() if k in allowed_fields}

        if not update_data:
            return jsonify({'error': 'No valid fields to update'}), 400

        # Slug rename. It is the org's login URL and its identity in the program
        # registry, so it is validated here rather than passed straight to the
        # repository (where a duplicate surfaces as an unreadable 500).
        if 'slug' in update_data:
            from repositories.organization_repository import OrganizationRepository as _SlugRepo
            slug_repo = _SlugRepo()
            new_slug = (update_data['slug'] or '').strip().lower()
            current_org = slug_repo.find_by_id(org_id)
            if not current_org:
                return jsonify({'error': 'Organization not found'}), 404
            current_slug = current_org.get('slug')

            if new_slug == current_slug:
                del update_data['slug']
            else:
                if not re.match(r'^[a-z0-9-]+$', new_slug):
                    return jsonify({'error': 'Slug must contain only lowercase letters, numbers, and hyphens'}), 400

                existing = slug_repo.get_by_slug(new_slug)
                if existing and existing.get('id') != org_id:
                    return jsonify({'error': f"Another organization already uses the slug '{new_slug}'"}), 400

                # Programs are wired to a member org by slug (backend/programs/registry.py
                # and frontend/src/programs/registry.jsx). Renaming out from under the
                # registry would silently turn the program's tab and rules off.
                from programs.registry import program_for_org_slug
                program = program_for_org_slug(current_slug)
                if program:
                    return jsonify({'error': (
                        f"'{current_slug}' is wired to the {program.name} program by slug. "
                        f"Update org_slugs in backend/programs/registry.py and "
                        f"frontend/src/programs/registry.jsx first, then rename."
                    )}), 400

                update_data['slug'] = new_slug

        # The Stripe secret key is submitted through the same feature_flags blob
        # the settings UI round-trips, but it must never be STORED there:
        # organizations.feature_flags is anon-readable by row policy (RLS filters
        # rows, not columns) and is echoed to clients, which is how a live key
        # reached the public internet -- AUDIT.md C1. Divert it to
        # organization_secrets and strip it from the blob before any write.
        #
        # `absent` vs `empty string` matters: the settings UI PUTs the whole blob
        # back, and it does not receive the key (by design), so a plain PUT must
        # LEAVE the stored key alone. Only an explicit empty string clears it.
        from utils.org_secrets import (
            STRIPE_SECRET_KEY, secret_shaped_keys, set_org_secret,
            strip_secrets_from_feature_flags,
        )

        incoming_flags = update_data.get('feature_flags')

        # Guarded blob write: restores superadmin-owned `modules`, merges the
        # finance paths for non-finance writers — org_finance_flags.guard_org_flags_write.
        if isinstance(incoming_flags, dict) and not is_superadmin:
            from utils.org_finance_flags import guard_org_flags_write
            from repositories.organization_repository import OrganizationRepository as _OrgRepo
            stored_flags = (_OrgRepo().find_by_id(org_id) or {}).get('feature_flags') or {}
            incoming_flags, blocked = guard_org_flags_write(stored_flags, incoming_flags, sees_finance)
            if blocked:
                return jsonify({'error': 'Tuition and registration fees are managed by an organization admin.', 'fields': blocked}), 403
            update_data['feature_flags'] = incoming_flags

        submitted_key = None
        if isinstance(incoming_flags, dict):
            # The funnel config lives at 'registration' (org-neutral key); the
            # legacy 'icreate_registration' mirror is checked for stale tabs.
            for reg_key in ('registration', 'icreate_registration'):
                reg = incoming_flags.get(reg_key)
                if isinstance(reg, dict) and STRIPE_SECRET_KEY in reg:
                    submitted_key = (reg.get(STRIPE_SECRET_KEY) or '').strip()
                    break

        # The card-payment credential is finance: a coordinator may not set it,
        # and may not clear it either.
        if submitted_key is not None and not sees_finance:
            return jsonify({'error': 'Card payment settings are managed by an '
                                     'organization admin.'}), 403

        # A malformed Stripe key breaks the iCreate registration funnel at the
        # "Pay securely" step, so reject it at save time. Secret keys are sk_…
        # (or restricted rk_…); loose enough for legacy keys without live/test.
        if submitted_key and not re.match(r'^(sk|rk)_[A-Za-z0-9_]{20,}$', submitted_key):
            return jsonify({'error': "That doesn't look like a Stripe secret key — it should start with "
                                     "sk_live_ or rk_live_. Copy the full key from Stripe Dashboard -> "
                                     "Developers -> API keys."}), 400

        # Always strip, even when nothing was submitted: a stale tab can PUT back
        # a blob that still carries the pre-migration nested key.
        if isinstance(incoming_flags, dict):
            cleaned_flags = strip_secrets_from_feature_flags(incoming_flags)

            # Refuse to store any OTHER credential-shaped key. This is the guard
            # that stops the next stripe_secret_key: feature_flags is anon-readable
            # by row policy and is echoed to every org member, so a credential in
            # here is public by construction. Named explicitly so the admin knows
            # what to remove rather than seeing a generic 400.
            suspicious = secret_shaped_keys(cleaned_flags)
            if suspicious:
                return jsonify({
                    'error': 'Credentials cannot be stored in organization settings.',
                    'message': (
                        'These fields look like secrets and would be readable by '
                        'everyone in the organization: '
                        + ', '.join(suspicious)
                        + '. Secrets belong in organization_secrets — ask an Optio '
                          'admin to add a dedicated field for this credential.'
                    ),
                    'fields': suspicious,
                }), 400

            update_data['feature_flags'] = cleaned_flags

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

        # Persist the credential only after the org row itself saved cleanly, so a
        # failed update never leaves a key pointing at a state that was rolled back.
        # submitted_key is None when the field was absent (leave as-is) and '' when
        # the admin explicitly cleared it (delete).
        if submitted_key is not None:
            set_org_secret(org_id, STRIPE_SECRET_KEY, submitted_key or None,
                           updated_by=current_user_id)

        # Never echo the config blob back with a secret in it. The stored blob is
        # already clean; this guards the case where `org` came from a code path
        # that read a row written before this migration.
        if isinstance(org, dict) and isinstance(org.get('feature_flags'), dict):
            org = {**org, 'feature_flags': strip_secrets_from_feature_flags(org['feature_flags'])}

        return jsonify(org), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error updating organization {org_id}: {e}")
        raise


@bp.route('/<org_id>/archive', methods=['POST'])
@require_superadmin
def archive_organization(superadmin_user_id, org_id):
    """Archive an organization (superadmin only).

    Reversible. Detaches every member to a standalone platform account -- they
    keep all of their own data -- and hides the org from every list. See
    services/organization_lifecycle.py for why this is separate from delete.
    """
    from services import organization_lifecycle as lifecycle

    try:
        # admin client justified: admin-only route (@require_superadmin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()
        result = lifecycle.archive_organization(client, org_id, superadmin_user_id)
        return jsonify(result), 200
    except lifecycle.OrganizationNotFound as e:
        return jsonify({'error': str(e)}), 404
    except lifecycle.OrganizationLifecycleError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error archiving organization {org_id}: {e}")
        raise


@bp.route('/<org_id>/restore', methods=['POST'])
@require_superadmin
def restore_organization(superadmin_user_id, org_id):
    """Un-archive an organization (superadmin only).

    Brings the org back everywhere. Former members stay platform users; re-add
    them from the People tab.
    """
    from services import organization_lifecycle as lifecycle

    try:
        # admin client justified: admin-only route (@require_superadmin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()
        result = lifecycle.restore_organization(client, org_id, superadmin_user_id)
        return jsonify(result), 200
    except lifecycle.OrganizationNotFound as e:
        return jsonify({'error': str(e)}), 404
    except lifecycle.OrganizationLifecycleError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error restoring organization {org_id}: {e}")
        raise


@bp.route('/<org_id>/deletion-preview', methods=['GET'])
@require_superadmin
def preview_organization_deletion(superadmin_user_id, org_id):
    """What still points at this org, and whether it can be deleted."""
    from services import organization_lifecycle as lifecycle

    try:
        # admin client justified: admin-only route (@require_superadmin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()
        return jsonify(lifecycle.deletion_preview(client, org_id)), 200
    except lifecycle.OrganizationNotFound as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error building deletion preview for {org_id}: {e}")
        raise


@bp.route('/<org_id>', methods=['DELETE'])
@require_superadmin
def delete_organization(superadmin_user_id, org_id):
    """Permanently delete an archived, empty organization (superadmin only).

    Refuses unless the org is archived, nothing references it, and the caller
    retyped its name. 409 carries the blocking table counts so the UI can say
    what is in the way instead of just "no".
    """
    from services import organization_lifecycle as lifecycle

    try:
        data = request.get_json(silent=True) or {}

        # admin client justified: admin-only route (@require_superadmin) — needs RLS bypass for cross-tenant administration
        client = get_supabase_admin_client()
        result = lifecycle.delete_organization(
            client, org_id, superadmin_user_id, data.get('confirm_name')
        )
        return jsonify(result), 200
    except lifecycle.OrganizationNotFound as e:
        return jsonify({'error': str(e)}), 404
    except lifecycle.OrganizationNotEmpty as e:
        return jsonify({'error': str(e), 'blockers': e.blockers}), 409
    except lifecycle.OrganizationLifecycleError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error deleting organization {org_id}: {e}")
        raise


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
        raise


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
        raise


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

        # Attach the template-task count. A quest saved with no tasks still
        # works (students get the create-your-own wizard) but that is almost
        # never what an org admin intended, and without this count the
        # dashboard gives them no way to notice.
        quest_ids = [q['id'] for q in quests]
        task_counts = {}
        if quest_ids:
            task_rows = fetch_all_rows(lambda: (
                client.table('quest_template_tasks')
                .select('id, quest_id')
                .in_('quest_id', quest_ids)
            ))
            for row in task_rows:
                task_counts[row['quest_id']] = task_counts.get(row['quest_id'], 0) + 1

        for quest in quests:
            quest['template_task_count'] = task_counts.get(quest['id'], 0)

        return jsonify({
            'quests': quests,
            'total': len(quests)
        }), 200

    except Exception as e:
        logger.error(f"Error listing quests for org {org_id}: {e}")
        raise


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
        raise


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
        raise


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
        raise


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
        raise


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
        raise


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
    from datetime import timedelta
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
        # Paged: total_students below is len() of this read.
        students = fetch_all_rows(lambda: (
            client.table('users')
            .select('id, email, display_name, first_name, last_name, total_xp, last_active, created_at, org_role')
            .eq('organization_id', org_id)
            .eq('org_role', role_filter)
            .order('first_name')
        ))

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
        raise

