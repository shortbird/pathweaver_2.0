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

logger = get_logger(__name__)

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
@require_superadmin
def update_organization(superadmin_user_id, org_id):
    """Update organization (superadmin only)"""
    try:
        data = request.get_json()

        # Only allow updating specific fields
        allowed_fields = ['name', 'quest_visibility_policy', 'branding_config', 'is_active']
        update_data = {k: v for k, v in data.items() if k in allowed_fields}

        if not update_data:
            return jsonify({'error': 'No valid fields to update'}), 400

        service = OrganizationService()

        # If updating policy, use dedicated method
        if 'quest_visibility_policy' in update_data:
            org = service.update_organization_policy(
                org_id,
                update_data['quest_visibility_policy'],
                superadmin_user_id
            )
        else:
            # Use repository directly for other updates
            from repositories.organization_repository import OrganizationRepository
            repo = OrganizationRepository()
            org = repo.update_organization(org_id, update_data)

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


@bp.route('/<org_id>/users', methods=['GET'])
@require_org_admin
def list_organization_users(current_user_id, current_org_id, is_superadmin, org_id):
    """List users in organization"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        from repositories.organization_repository import OrganizationRepository
        repo = OrganizationRepository()
        users = repo.get_organization_users(org_id)

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


@bp.route('/<org_id>/users/add', methods=['POST'])
@require_org_admin
def add_users_to_organization(current_user_id, current_org_id, is_superadmin, org_id):
    """Add users to organization (superadmin or org admin)"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        user_ids = data.get('user_ids', [])

        if not user_ids:
            return jsonify({'error': 'user_ids is required'}), 400

        client = get_supabase_admin_client()

        # Update users to set their organization_id
        for user_id in user_ids:
            client.table('users')\
                .update({'organization_id': org_id})\
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
    """Remove user from organization (superadmin or org admin)"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        user_id = data.get('user_id')

        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400

        client = get_supabase_admin_client()

        # Set user's organization_id to null
        client.table('users')\
            .update({'organization_id': None})\
            .eq('id', user_id)\
            .execute()

        logger.info(f"Removed user {user_id} from organization {org_id}")

        return jsonify({'message': 'User removed from organization'}), 200
    except Exception as e:
        logger.error(f"Error removing user from org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500
