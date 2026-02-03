"""
Admin Audit Logs Routes

Provides endpoints for viewing administrative action audit logs.
For admins and superadmins to track changes and ensure compliance.
"""

from flask import Blueprint, request, jsonify
from datetime import datetime
from utils.auth.decorators import require_admin, require_org_admin
from services.admin_audit_service import AdminAuditService
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_audit_logs', __name__)


@bp.route('/audit-logs', methods=['GET'])
@require_org_admin
def get_audit_logs(current_user_id, current_org_id, is_superadmin):
    """
    Get paginated audit logs with filtering.

    Query params:
        - limit: Number of logs to return (default: 50, max: 200)
        - offset: Number of logs to skip (default: 0)
        - admin_id: Filter by specific admin UUID
        - action_type: Filter by action type
        - resource_type: Filter by resource type (user, organization, quest, etc.)
        - start_date: ISO datetime string (filter logs after this date)
        - end_date: ISO datetime string (filter logs before this date)

    Returns:
        200: Paginated audit logs with total count
        400: Invalid parameters
        403: Access denied
        500: Server error
    """
    try:
        # Get query parameters
        limit = min(int(request.args.get('limit', 50)), 200)
        offset = int(request.args.get('offset', 0))

        # Build filters
        filters = {}

        # Org admins can only see logs for their organization
        if not is_superadmin:
            filters['organization_id'] = current_org_id

        # Apply optional filters
        if request.args.get('admin_id'):
            filters['admin_id'] = request.args.get('admin_id')
        if request.args.get('action_type'):
            filters['action_type'] = request.args.get('action_type')
        if request.args.get('resource_type'):
            filters['resource_type'] = request.args.get('resource_type')
        if request.args.get('start_date'):
            try:
                filters['start_date'] = datetime.fromisoformat(request.args.get('start_date'))
            except ValueError:
                return jsonify({'error': 'Invalid start_date format. Use ISO datetime.'}), 400
        if request.args.get('end_date'):
            try:
                filters['end_date'] = datetime.fromisoformat(request.args.get('end_date'))
            except ValueError:
                return jsonify({'error': 'Invalid end_date format. Use ISO datetime.'}), 400

        # Fetch logs
        service = AdminAuditService()
        result = service.get_audit_logs_paginated(
            limit=limit,
            offset=offset,
            filters=filters
        )

        return jsonify({
            'logs': result['logs'],
            'total': result['total'],
            'limit': limit,
            'offset': offset
        }), 200

    except Exception as e:
        logger.error(f"Error fetching audit logs: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/audit-logs/admin/<admin_id>', methods=['GET'])
@require_org_admin
def get_admin_activity(current_user_id, current_org_id, is_superadmin, admin_id):
    """
    Get activity logs for a specific admin.

    Query params:
        - limit: Number of logs to return (default: 100)
        - offset: Number of logs to skip (default: 0)
        - start_date: ISO datetime string
        - end_date: ISO datetime string

    Returns:
        200: List of audit logs for the admin
        403: Access denied
        500: Server error
    """
    try:
        limit = min(int(request.args.get('limit', 100)), 200)
        offset = int(request.args.get('offset', 0))

        start_date = None
        end_date = None
        if request.args.get('start_date'):
            try:
                start_date = datetime.fromisoformat(request.args.get('start_date'))
            except ValueError:
                return jsonify({'error': 'Invalid start_date format'}), 400
        if request.args.get('end_date'):
            try:
                end_date = datetime.fromisoformat(request.args.get('end_date'))
            except ValueError:
                return jsonify({'error': 'Invalid end_date format'}), 400

        service = AdminAuditService()
        logs = service.get_admin_activity(
            admin_id=admin_id,
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date
        )

        return jsonify({
            'logs': logs,
            'total': len(logs)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching admin activity for {admin_id[:8]}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/audit-logs/resource/<resource_type>/<resource_id>', methods=['GET'])
@require_org_admin
def get_resource_history(current_user_id, current_org_id, is_superadmin, resource_type, resource_id):
    """
    Get audit trail for a specific resource (user, quest, organization, etc.).

    Query params:
        - limit: Number of logs to return (default: 100)
        - offset: Number of logs to skip (default: 0)

    Returns:
        200: List of audit logs for the resource
        403: Access denied
        500: Server error
    """
    try:
        limit = min(int(request.args.get('limit', 100)), 200)
        offset = int(request.args.get('offset', 0))

        service = AdminAuditService()
        logs = service.get_resource_history(
            resource_type=resource_type,
            resource_id=resource_id,
            limit=limit,
            offset=offset
        )

        return jsonify({
            'logs': logs,
            'resource_type': resource_type,
            'resource_id': resource_id,
            'total': len(logs)
        }), 200

    except Exception as e:
        logger.error(
            f"Error fetching resource history for {resource_type}/{resource_id[:8]}: {e}"
        )
        return jsonify({'error': str(e)}), 500


@bp.route('/audit-logs/organization/<org_id>', methods=['GET'])
@require_org_admin
def get_organization_activity(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Get all administrative actions within an organization.

    Org admins can only view their own organization.
    Superadmins can view any organization.

    Query params:
        - limit: Number of logs to return (default: 100)
        - offset: Number of logs to skip (default: 0)
        - start_date: ISO datetime string
        - end_date: ISO datetime string

    Returns:
        200: List of audit logs for the organization
        403: Access denied
        500: Server error
    """
    try:
        # Verify access: org admin can only view their org, superadmin can view all
        if not is_superadmin and current_org_id != org_id:
            return jsonify({'error': 'Access denied'}), 403

        limit = min(int(request.args.get('limit', 100)), 200)
        offset = int(request.args.get('offset', 0))

        start_date = None
        end_date = None
        if request.args.get('start_date'):
            try:
                start_date = datetime.fromisoformat(request.args.get('start_date'))
            except ValueError:
                return jsonify({'error': 'Invalid start_date format'}), 400
        if request.args.get('end_date'):
            try:
                end_date = datetime.fromisoformat(request.args.get('end_date'))
            except ValueError:
                return jsonify({'error': 'Invalid end_date format'}), 400

        service = AdminAuditService()
        logs = service.get_organization_activity(
            organization_id=org_id,
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date
        )

        return jsonify({
            'logs': logs,
            'organization_id': org_id,
            'total': len(logs)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching organization activity for {org_id[:8]}: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/audit-logs/recent', methods=['GET'])
@require_admin
def get_recent_activity(admin_user_id):
    """
    Get recent administrative actions (last 24 hours by default).

    Query params:
        - hours: Number of hours to look back (default: 24, max: 168)
        - limit: Number of logs to return (default: 100)
        - offset: Number of logs to skip (default: 0)

    Returns:
        200: List of recent audit logs
        500: Server error
    """
    try:
        hours = min(int(request.args.get('hours', 24)), 168)
        limit = min(int(request.args.get('limit', 100)), 200)
        offset = int(request.args.get('offset', 0))

        service = AdminAuditService()
        logs = service.get_recent_activity(
            hours=hours,
            limit=limit,
            offset=offset
        )

        return jsonify({
            'logs': logs,
            'hours': hours,
            'total': len(logs)
        }), 200

    except Exception as e:
        logger.error(f"Error fetching recent activity: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/audit-logs/statistics/<admin_id>', methods=['GET'])
@require_org_admin
def get_admin_statistics(current_user_id, current_org_id, is_superadmin, admin_id):
    """
    Get statistics about an admin's activity.

    Query params:
        - start_date: ISO datetime string
        - end_date: ISO datetime string

    Returns:
        200: Statistics object (total_actions, action_breakdown, etc.)
        500: Server error
    """
    try:
        start_date = None
        end_date = None
        if request.args.get('start_date'):
            try:
                start_date = datetime.fromisoformat(request.args.get('start_date'))
            except ValueError:
                return jsonify({'error': 'Invalid start_date format'}), 400
        if request.args.get('end_date'):
            try:
                end_date = datetime.fromisoformat(request.args.get('end_date'))
            except ValueError:
                return jsonify({'error': 'Invalid end_date format'}), 400

        service = AdminAuditService()
        stats = service.get_admin_statistics(
            admin_id=admin_id,
            start_date=start_date,
            end_date=end_date
        )

        return jsonify(stats), 200

    except Exception as e:
        logger.error(f"Error fetching admin statistics for {admin_id[:8]}: {e}")
        return jsonify({'error': str(e)}), 500
