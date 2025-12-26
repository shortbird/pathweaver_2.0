"""
Admin Observer Audit Routes - COPPA/FERPA compliance

Admin interface for viewing observer access audit logs.
"""

from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from typing import Optional

from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from services.observer_audit_service import ObserverAuditService
from utils.logger import get_logger

logger = get_logger(__name__)
bp = Blueprint('admin_observer_audit', __name__)


@bp.route('/api/admin/observer-audit/logs', methods=['GET'])
@require_admin
def get_audit_logs(user_id: str):
    """
    Get paginated observer audit logs with filtering.

    Query parameters:
        page: Page number (default: 1)
        limit: Results per page (default: 50, max: 100)
        observer_id: Filter by observer UUID
        student_id: Filter by student UUID
        action_type: Filter by action type
        start_date: Filter logs after this date (ISO format)
        end_date: Filter logs before this date (ISO format)

    Returns:
        200: Paginated audit logs with metadata
        400: Invalid parameters
        500: Server error
    """
    try:
        # Parse pagination parameters
        page = max(1, int(request.args.get('page', 1)))
        limit = min(100, max(1, int(request.args.get('limit', 50))))
        offset = (page - 1) * limit

        # Parse filters
        filters = {}
        if request.args.get('observer_id'):
            filters['observer_id'] = request.args.get('observer_id')
        if request.args.get('student_id'):
            filters['student_id'] = request.args.get('student_id')
        if request.args.get('action_type'):
            filters['action_type'] = request.args.get('action_type')

        # Initialize service with admin privileges
        audit_service = ObserverAuditService(user_id=None)  # Admin client

        # Get paginated logs
        result = audit_service.get_audit_logs_paginated(
            limit=limit,
            offset=offset,
            filters=filters if filters else None
        )

        # Enrich logs with user details
        logs = result['logs']
        if logs:
            # Get unique user IDs
            observer_ids = list(set(log['observer_id'] for log in logs))
            student_ids = list(set(log['student_id'] for log in logs))
            all_user_ids = list(set(observer_ids + student_ids))

            # Fetch user details
            supabase = get_supabase_admin_client()
            users = supabase.table('users') \
                .select('id, email, first_name, last_name, display_name, role') \
                .in_('id', all_user_ids) \
                .execute()

            # Create user lookup map
            user_map = {user['id']: user for user in users.data}

            # Add user details to each log
            for log in logs:
                log['observer'] = user_map.get(log['observer_id'], {})
                log['student'] = user_map.get(log['student_id'], {})

        return jsonify({
            'logs': logs,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': result['total'],
                'pages': (result['total'] + limit - 1) // limit  # Ceiling division
            }
        }), 200

    except ValueError as e:
        return jsonify({'error': f'Invalid parameters: {str(e)}'}), 400
    except Exception as e:
        logger.error(f"Failed to fetch audit logs: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch audit logs'}), 500


@bp.route('/api/admin/observer-audit/observer/<observer_id>', methods=['GET'])
@require_admin
def get_observer_activity(user_id: str, observer_id: str):
    """
    Get all activity for a specific observer.

    Args:
        observer_id: UUID of the observer

    Query parameters:
        limit: Number of logs to return (default: 100)
        offset: Number of logs to skip (default: 0)
        start_date: Filter logs after this date (ISO format)
        end_date: Filter logs before this date (ISO format)

    Returns:
        200: Observer activity logs with statistics
        400: Invalid parameters
        500: Server error
    """
    try:
        # Parse parameters
        limit = min(500, max(1, int(request.args.get('limit', 100))))
        offset = max(0, int(request.args.get('offset', 0)))

        start_date = None
        end_date = None
        if request.args.get('start_date'):
            start_date = datetime.fromisoformat(request.args.get('start_date'))
        if request.args.get('end_date'):
            end_date = datetime.fromisoformat(request.args.get('end_date'))

        # Initialize service with admin privileges
        audit_service = ObserverAuditService(user_id=None)

        # Get activity logs
        logs = audit_service.get_observer_activity(
            observer_id=observer_id,
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date
        )

        # Get statistics
        stats = audit_service.get_observer_statistics(
            observer_id=observer_id,
            start_date=start_date,
            end_date=end_date
        )

        return jsonify({
            'logs': logs,
            'statistics': stats
        }), 200

    except ValueError as e:
        return jsonify({'error': f'Invalid parameters: {str(e)}'}), 400
    except Exception as e:
        logger.error(f"Failed to fetch observer activity: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch observer activity'}), 500


@bp.route('/api/admin/observer-audit/student/<student_id>', methods=['GET'])
@require_admin
def get_student_access_history(user_id: str, student_id: str):
    """
    Get all access history for a specific student.

    Args:
        student_id: UUID of the student

    Query parameters:
        limit: Number of logs to return (default: 100)
        offset: Number of logs to skip (default: 0)
        start_date: Filter logs after this date (ISO format)
        end_date: Filter logs before this date (ISO format)

    Returns:
        200: Student access history
        400: Invalid parameters
        500: Server error
    """
    try:
        # Parse parameters
        limit = min(500, max(1, int(request.args.get('limit', 100))))
        offset = max(0, int(request.args.get('offset', 0)))

        start_date = None
        end_date = None
        if request.args.get('start_date'):
            start_date = datetime.fromisoformat(request.args.get('start_date'))
        if request.args.get('end_date'):
            end_date = datetime.fromisoformat(request.args.get('end_date'))

        # Initialize service with admin privileges
        audit_service = ObserverAuditService(user_id=None)

        # Get access history
        logs = audit_service.get_student_access_history(
            student_id=student_id,
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date
        )

        # Enrich with observer details
        if logs:
            observer_ids = list(set(log['observer_id'] for log in logs))
            supabase = get_supabase_admin_client()
            observers = supabase.table('users') \
                .select('id, email, first_name, last_name, display_name') \
                .in_('id', observer_ids) \
                .execute()

            observer_map = {obs['id']: obs for obs in observers.data}

            for log in logs:
                log['observer'] = observer_map.get(log['observer_id'], {})

        return jsonify({
            'logs': logs,
            'total': len(logs)
        }), 200

    except ValueError as e:
        return jsonify({'error': f'Invalid parameters: {str(e)}'}), 400
    except Exception as e:
        logger.error(f"Failed to fetch student access history: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch student access history'}), 500


@bp.route('/api/admin/observer-audit/recent', methods=['GET'])
@require_admin
def get_recent_activity(user_id: str):
    """
    Get recent observer activity across the platform.

    Query parameters:
        hours: Number of hours to look back (default: 24, max: 168)
        limit: Number of logs to return (default: 100, max: 500)

    Returns:
        200: Recent activity logs
        400: Invalid parameters
        500: Server error
    """
    try:
        # Parse parameters
        hours = min(168, max(1, int(request.args.get('hours', 24))))  # Max 1 week
        limit = min(500, max(1, int(request.args.get('limit', 100))))

        # Initialize service with admin privileges
        audit_service = ObserverAuditService(user_id=None)

        # Get recent logs
        logs = audit_service.get_recent_activity(
            hours=hours,
            limit=limit
        )

        # Enrich with user details
        if logs:
            observer_ids = list(set(log['observer_id'] for log in logs))
            student_ids = list(set(log['student_id'] for log in logs))
            all_user_ids = list(set(observer_ids + student_ids))

            supabase = get_supabase_admin_client()
            users = supabase.table('users') \
                .select('id, email, first_name, last_name, display_name, role') \
                .in_('id', all_user_ids) \
                .execute()

            user_map = {user['id']: user for user in users.data}

            for log in logs:
                log['observer'] = user_map.get(log['observer_id'], {})
                log['student'] = user_map.get(log['student_id'], {})

        return jsonify({
            'logs': logs,
            'timeframe_hours': hours,
            'total': len(logs)
        }), 200

    except ValueError as e:
        return jsonify({'error': f'Invalid parameters: {str(e)}'}), 400
    except Exception as e:
        logger.error(f"Failed to fetch recent activity: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch recent activity'}), 500


@bp.route('/api/admin/observer-audit/statistics', methods=['GET'])
@require_admin
def get_platform_statistics(user_id: str):
    """
    Get platform-wide observer audit statistics.

    Query parameters:
        start_date: Filter logs after this date (ISO format)
        end_date: Filter logs before this date (ISO format)

    Returns:
        200: Platform statistics
        500: Server error
    """
    try:
        start_date = None
        end_date = None
        if request.args.get('start_date'):
            start_date = datetime.fromisoformat(request.args.get('start_date'))
        if request.args.get('end_date'):
            end_date = datetime.fromisoformat(request.args.get('end_date'))

        # Initialize service with admin privileges
        audit_service = ObserverAuditService(user_id=None)

        # Get all logs for the period
        logs = audit_service.get_recent_activity(
            hours=8760,  # 1 year max
            limit=10000
        )

        # Filter by date if provided
        if start_date or end_date:
            filtered_logs = []
            for log in logs:
                log_date = datetime.fromisoformat(log['created_at'].replace('Z', '+00:00'))
                if start_date and log_date < start_date.replace(tzinfo=log_date.tzinfo):
                    continue
                if end_date and log_date > end_date.replace(tzinfo=log_date.tzinfo):
                    continue
                filtered_logs.append(log)
            logs = filtered_logs

        # Calculate statistics
        total_accesses = len(logs)
        unique_observers = len(set(log['observer_id'] for log in logs))
        unique_students = len(set(log['student_id'] for log in logs))

        action_breakdown = {}
        for log in logs:
            action_type = log['action_type']
            action_breakdown[action_type] = action_breakdown.get(action_type, 0) + 1

        return jsonify({
            'total_accesses': total_accesses,
            'unique_observers': unique_observers,
            'unique_students': unique_students,
            'action_breakdown': action_breakdown,
            'period': {
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None
            }
        }), 200

    except Exception as e:
        logger.error(f"Failed to fetch platform statistics: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch statistics'}), 500
