"""
Admin Task Flags Routes
API endpoints for reviewing and managing flagged tasks.

REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Already uses TaskLibraryService (service layer pattern) - best practice
- No direct database calls
- Service layer is the preferred pattern over direct repository usage
"""

from flask import Blueprint, jsonify, request
from utils.auth.decorators import require_auth, require_role
from services.task_library_service import TaskLibraryService
import logging

bp = Blueprint('admin_task_flags', __name__, url_prefix='/api/admin')
logger = logging.getLogger(__name__)


@bp.route('/flagged-tasks', methods=['GET'])
@require_auth
@require_role('admin')
def get_flagged_tasks():
    """
    Get all tasks flagged for admin review.
    Admin only endpoint.
    """
    try:
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)

        logger.info(f"Admin fetching flagged tasks (limit={limit}, offset={offset})")

        library_service = TaskLibraryService()
        flagged_tasks = library_service.get_flagged_tasks(limit=limit, offset=offset)

        return jsonify({
            'success': True,
            'tasks': flagged_tasks,
            'count': len(flagged_tasks)
        }), 200

    except Exception as e:
        logger.error(f"Error getting flagged tasks: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to load flagged tasks'
        }), 500


@bp.route('/flagged-tasks/<task_id>/flags', methods=['GET'])
@require_auth
@require_role('admin')
def get_task_flags(task_id):
    """
    Get all flag reports for a specific task.
    Shows who flagged it and why.
    Admin only endpoint.
    """
    try:
        logger.info(f"Admin fetching flag reports for task {task_id}")

        library_service = TaskLibraryService()
        flags = library_service.get_task_flags(task_id)

        return jsonify({
            'success': True,
            'flags': flags,
            'count': len(flags)
        }), 200

    except Exception as e:
        logger.error(f"Error getting task flags: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to load flag reports'
        }), 500


@bp.route('/flagged-tasks/<task_id>/approve', methods=['POST'])
@require_auth
@require_role('admin')
def approve_flagged_task(task_id):
    """
    Admin approval: Clear flags and make task visible again.
    Resets flag_count and is_flagged.
    Admin only endpoint.
    """
    try:
        logger.info(f"Admin approving task {task_id}")

        library_service = TaskLibraryService()
        success = library_service.approve_task(task_id)

        if success:
            return jsonify({
                'success': True,
                'message': 'Task approved and unflagged'
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to approve task'
            }), 500

    except Exception as e:
        logger.error(f"Error approving task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to approve task'
        }), 500


@bp.route('/flagged-tasks/<task_id>', methods=['DELETE'])
@require_auth
@require_role('admin')
def delete_flagged_task(task_id):
    """
    Admin deletion: Permanently remove task from library.
    Use for truly inappropriate content.
    Admin only endpoint.
    """
    try:
        logger.info(f"Admin deleting task {task_id}")

        library_service = TaskLibraryService()
        success = library_service.delete_task(task_id)

        if success:
            return jsonify({
                'success': True,
                'message': 'Task permanently deleted from library'
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to delete task'
            }), 500

    except Exception as e:
        logger.error(f"Error deleting task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to delete task'
        }), 500
