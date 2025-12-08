"""
Organization Management Routes

Handles superadmin and org admin operations for multi-organization platform.
Created: 2025-12-07
Phase 2: Backend Repository & Service Layer
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_superadmin, require_org_admin
from backend.services.organization_service import OrganizationService
from backend.database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('organization_management', __name__)


@bp.route('/organizations', methods=['GET'])
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


@bp.route('/organizations', methods=['POST'])
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


@bp.route('/organizations/<org_id>', methods=['GET'])
@require_org_admin
def get_organization(current_user_id, current_org_id, is_superadmin, org_id):
    """Get organization details (org admin or superadmin)"""
    try:
        # Verify access: org admin can only view their org, superadmin can view all
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        service = OrganizationService()
        org = service.get_organization_dashboard_data(org_id)

        return jsonify(org), 200
    except Exception as e:
        logger.error(f"Error getting organization {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/organizations/<org_id>', methods=['PUT'])
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
            from backend.repositories.organization_repository import OrganizationRepository
            repo = OrganizationRepository(client=get_supabase_admin_client())
            org = repo.update_organization(org_id, update_data)

        return jsonify(org), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error updating organization {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/organizations/<org_id>/quests/grant', methods=['POST'])
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


@bp.route('/organizations/<org_id>/quests/revoke', methods=['POST'])
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


@bp.route('/organizations/<org_id>/users', methods=['GET'])
@require_org_admin
def list_organization_users(current_user_id, current_org_id, is_superadmin, org_id):
    """List users in organization"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        from backend.repositories.organization_repository import OrganizationRepository
        repo = OrganizationRepository(client=get_supabase_admin_client())
        users = repo.get_organization_users(org_id)

        return jsonify({
            'users': users,
            'total': len(users)
        }), 200
    except Exception as e:
        logger.error(f"Error listing users for org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/organizations/<org_id>/analytics', methods=['GET'])
@require_org_admin
def get_organization_analytics(current_user_id, current_org_id, is_superadmin, org_id):
    """Get analytics for organization"""
    try:
        # Verify access
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        from backend.repositories.organization_repository import OrganizationRepository
        repo = OrganizationRepository(client=get_supabase_admin_client())
        analytics = repo.get_organization_analytics(org_id)

        return jsonify(analytics), 200
    except Exception as e:
        logger.error(f"Error getting analytics for org {org_id}: {e}")
        return jsonify({'error': str(e)}), 500
