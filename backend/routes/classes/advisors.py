"""
Class Advisor Management Routes

Endpoints for managing advisors assigned to classes.
"""

from flask import request, jsonify
from . import bp
from services.class_service import ClassService
from utils.auth.decorators import require_role
from utils.roles import get_effective_roles
from ._caller import get_caller, is_superadmin
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


@bp.route('/organizations/<org_id>/classes/<class_id>/advisors', methods=['GET'])
@require_role('student', 'org_admin', 'advisor', 'superadmin')
def get_class_advisors(user_id, org_id, class_id):
    """
    Get all advisors assigned to a class.

    Returns:
    {
        "success": true,
        "advisors": [
            {
                "id": "...",
                "advisor_id": "...",
                "users": {
                    "id": "...",
                    "display_name": "...",
                    "email": "..."
                },
                "assigned_at": "...",
                "is_active": true
            }
        ]
    }
    """
    try:
        effective_roles, user_org_id, _ = get_caller(user_id)

        service = ClassService()

        # Check access
        if not service.can_access_class(class_id, user_id, effective_roles, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        advisors = service.get_class_advisors(class_id)

        return jsonify({
            'success': True,
            'advisors': advisors
        })

    except Exception as e:
        logger.error(f"Error getting class advisors: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get advisors'
        }), 500


@bp.route('/organizations/<org_id>/classes/<class_id>/advisors', methods=['POST'])
@require_role('org_admin', 'superadmin')
def add_class_advisor(user_id, org_id, class_id):
    """
    Add an advisor to a class.

    Request body:
    {
        "advisor_id": "user-uuid"
    }

    Returns:
    {
        "success": true,
        "assignment": {...}
    }
    """
    try:
        effective_roles, user_org_id, _ = get_caller(user_id)

        service = ClassService()

        # Check management access (only org_admin and superadmin can add advisors)
        if not service.can_manage_class(class_id, user_id, effective_roles, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        # For non-superadmins, verify they can only add advisors from their org
        if not is_superadmin(effective_roles):
            cls = service.get_class(class_id)
            if cls.get('organization_id') != user_org_id:
                return jsonify({'success': False, 'error': 'Access denied'}), 403

        data = request.json or {}
        advisor_id = data.get('advisor_id')

        if not advisor_id:
            return jsonify({'success': False, 'error': 'advisor_id is required'}), 400

        # Verify advisor exists and has advisor role in the same org
        # admin client justified: class advisor mgmt under @require_role(org_admin/superadmin); cross-org user lookup for advisor verification
        supabase = get_supabase_admin_client()
        advisor = supabase.table('users').select('id, role, org_role, org_roles, organization_id').eq('id', advisor_id).execute()

        if not advisor.data:
            return jsonify({'success': False, 'error': 'Advisor not found'}), 404

        advisor_data = advisor.data[0]
        advisor_roles = get_effective_roles(advisor_data)

        # Verify the user is actually an advisor -- on every role they hold, not
        # on whichever one sorts first in org_roles.
        if not any(r in ('advisor', 'org_admin', 'campus_coordinator', 'superadmin')
                   for r in advisor_roles):
            return jsonify({'success': False, 'error': 'User is not an advisor'}), 400

        # For non-superadmins, verify advisor is in the same org
        if not is_superadmin(effective_roles):
            if advisor_data.get('organization_id') != user_org_id:
                return jsonify({'success': False, 'error': 'Cannot add advisor from another organization'}), 403

        result = service.add_advisor(class_id, advisor_id, user_id)

        return jsonify({
            'success': True,
            'assignment': result
        }), 201

    except Exception as e:
        logger.error(f"Error adding class advisor: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to add advisor'
        }), 500


@bp.route('/organizations/<org_id>/classes/<class_id>/advisors/<advisor_id>', methods=['DELETE'])
@require_role('org_admin', 'superadmin')
def remove_class_advisor(user_id, org_id, class_id, advisor_id):
    """
    Remove an advisor from a class.

    Returns:
    {
        "success": true,
        "message": "Advisor removed successfully"
    }
    """
    try:
        effective_roles, user_org_id, _ = get_caller(user_id)

        service = ClassService()

        # Check management access
        if not service.can_manage_class(class_id, user_id, effective_roles, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        success = service.remove_advisor(class_id, advisor_id, user_id)

        if success:
            return jsonify({
                'success': True,
                'message': 'Advisor removed successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Advisor not found in class'
            }), 404

    except Exception as e:
        logger.error(f"Error removing class advisor: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to remove advisor'
        }), 500
