"""
Class CRUD Routes

Endpoints for creating, reading, updating, and archiving organization classes.
"""

from flask import request, jsonify
from . import bp
from services.class_service import ClassService
from utils.auth.decorators import require_role, require_auth
from utils.roles import get_effective_role
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


def get_user_info(user_id: str):
    """Get user role and organization info"""
    supabase = get_supabase_admin_client()
    user = supabase.table('users').select('role, org_role, organization_id').eq('id', user_id).execute()
    if not user.data:
        return None, None, None
    user_data = user.data[0]
    effective_role = get_effective_role(user_data)
    return effective_role, user_data.get('organization_id'), user_data


@bp.route('/organizations/<org_id>/classes', methods=['GET'])
@require_role('org_admin', 'advisor', 'superadmin')
def list_org_classes(user_id, org_id):
    """
    List all classes for an organization.

    Query Parameters:
    - status: Filter by status ('active', 'archived', or omit for all active)

    Returns:
    {
        "success": true,
        "classes": [...]
    }
    """
    try:
        effective_role, user_org_id, _ = get_user_info(user_id)

        # Authorization: superadmin can access any org, others only their own
        if effective_role != 'superadmin' and user_org_id != org_id:
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        status = request.args.get('status', 'active')

        service = ClassService()
        classes = service.list_org_classes(org_id, status=status)

        return jsonify({
            'success': True,
            'classes': classes
        })

    except Exception as e:
        logger.error(f"Error listing org classes: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to list classes'
        }), 500


@bp.route('/organizations/<org_id>/classes', methods=['POST'])
@require_role('org_admin', 'superadmin')
def create_class(user_id, org_id):
    """
    Create a new class for an organization.

    Request body:
    {
        "name": "Class Name",
        "description": "Optional description",
        "xp_threshold": 100
    }

    Returns:
    {
        "success": true,
        "class": {...}
    }
    """
    try:
        effective_role, user_org_id, _ = get_user_info(user_id)

        # Authorization: superadmin can create in any org, org_admin only in their own
        if effective_role != 'superadmin' and user_org_id != org_id:
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        data = request.json or {}
        name = data.get('name', '').strip()
        description = data.get('description', '')
        xp_threshold = int(data.get('xp_threshold', 100))

        if not name:
            return jsonify({'success': False, 'error': 'Class name is required'}), 400

        service = ClassService()
        cls = service.create_class(
            org_id=org_id,
            name=name,
            description=description,
            xp_threshold=xp_threshold,
            created_by=user_id
        )

        return jsonify({
            'success': True,
            'class': cls
        }), 201

    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error creating class: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to create class'
        }), 500


@bp.route('/organizations/<org_id>/classes/<class_id>', methods=['GET'])
@require_role('org_admin', 'advisor', 'superadmin')
def get_class(user_id, org_id, class_id):
    """
    Get a class by ID with details.

    Returns:
    {
        "success": true,
        "class": {...}
    }
    """
    try:
        effective_role, user_org_id, _ = get_user_info(user_id)

        service = ClassService()

        # Check access
        if not service.can_access_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        cls = service.get_class(class_id)

        return jsonify({
            'success': True,
            'class': cls
        })

    except Exception as e:
        if 'not found' in str(e).lower():
            return jsonify({'success': False, 'error': 'Class not found'}), 404
        logger.error(f"Error getting class: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get class'
        }), 500


@bp.route('/organizations/<org_id>/classes/<class_id>', methods=['PUT'])
@require_role('org_admin', 'advisor', 'superadmin')
def update_class(user_id, org_id, class_id):
    """
    Update a class.

    Request body:
    {
        "name": "New Name",
        "description": "New description",
        "xp_threshold": 150
    }

    Returns:
    {
        "success": true,
        "class": {...}
    }
    """
    try:
        effective_role, user_org_id, _ = get_user_info(user_id)

        service = ClassService()

        # Check management access
        if not service.can_manage_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        data = request.json or {}
        updates = {}

        if 'name' in data:
            updates['name'] = data['name']
        if 'description' in data:
            updates['description'] = data['description']
        if 'xp_threshold' in data:
            updates['xp_threshold'] = int(data['xp_threshold'])

        if not updates:
            return jsonify({'success': False, 'error': 'No updates provided'}), 400

        cls = service.update_class(class_id, updates, user_id)

        return jsonify({
            'success': True,
            'class': cls
        })

    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        if 'not found' in str(e).lower():
            return jsonify({'success': False, 'error': 'Class not found'}), 404
        logger.error(f"Error updating class: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update class'
        }), 500


@bp.route('/organizations/<org_id>/classes/<class_id>', methods=['DELETE'])
@require_role('org_admin', 'superadmin')
def archive_class(user_id, org_id, class_id):
    """
    Archive a class (soft delete).

    Returns:
    {
        "success": true,
        "message": "Class archived successfully"
    }
    """
    try:
        effective_role, user_org_id, _ = get_user_info(user_id)

        service = ClassService()

        # Check management access
        if not service.can_manage_class(class_id, user_id, effective_role, user_org_id):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        service.archive_class(class_id, user_id)

        return jsonify({
            'success': True,
            'message': 'Class archived successfully'
        })

    except Exception as e:
        if 'not found' in str(e).lower():
            return jsonify({'success': False, 'error': 'Class not found'}), 404
        logger.error(f"Error archiving class: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to archive class'
        }), 500


@bp.route('/advisor/classes', methods=['GET'])
@require_role('advisor', 'org_admin', 'superadmin')
def get_advisor_classes(user_id):
    """
    Get all classes the current user is assigned to as an advisor.

    Query Parameters:
    - status: Filter by status ('active', 'archived', or omit for all active)

    Returns:
    {
        "success": true,
        "classes": [...]
    }
    """
    try:
        status = request.args.get('status', 'active')

        service = ClassService()
        classes = service.get_advisor_classes(user_id, status=status)

        return jsonify({
            'success': True,
            'classes': classes
        })

    except Exception as e:
        logger.error(f"Error getting advisor classes: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get classes'
        }), 500
