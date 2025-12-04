"""
Admin endpoint for backfilling subject XP distributions on tasks.
"""

from flask import Blueprint, jsonify, request
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth, require_admin
from services.subject_classification_service import SubjectClassificationService
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_subject_backfill', __name__, url_prefix='/api/admin/subject-backfill')

@bp.route('/task/<task_id>', methods=['POST'])
@require_auth
@require_admin
def backfill_single_task(user_id: str, task_id: str):
    """
    Backfill subject distribution for a single task.

    POST /api/admin/subject-backfill/task/<task_id>
    """
    try:
        admin_supabase = get_supabase_admin_client()
        service = SubjectClassificationService(client=admin_supabase)

        success = service.backfill_task_subjects(task_id)

        if success:
            return jsonify({
                'success': True,
                'message': f'Task {task_id} successfully backfilled with subject distribution'
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to backfill task'
            }), 500

    except Exception as e:
        logger.error(f"Error backfilling task {task_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/all', methods=['POST'])
@require_auth
@require_admin
def backfill_all_tasks(user_id: str):
    """
    Backfill subject distributions for all tasks without them.

    POST /api/admin/subject-backfill/all
    Body: { "batch_size": 100 } (optional)

    Returns statistics on success/failure counts.
    """
    try:
        data = request.get_json() or {}
        batch_size = data.get('batch_size', 100)

        admin_supabase = get_supabase_admin_client()
        service = SubjectClassificationService(client=admin_supabase)

        logger.info(f"Starting backfill of all tasks (batch_size={batch_size})")

        stats = service.backfill_all_tasks(batch_size=batch_size)

        return jsonify({
            'success': True,
            'message': f'Backfill complete',
            'stats': stats
        }), 200

    except Exception as e:
        logger.error(f"Error in backfill_all_tasks: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/preview/<task_id>', methods=['GET'])
@require_auth
@require_admin
def preview_task_classification(user_id: str, task_id: str):
    """
    Preview what subject distribution would be assigned to a task without saving.

    GET /api/admin/subject-backfill/preview/<task_id>
    """
    try:
        admin_supabase = get_supabase_admin_client()

        # Get task details
        task = admin_supabase.table('user_quest_tasks')\
            .select('id, title, description, pillar, xp_value, subject_xp_distribution')\
            .eq('id', task_id)\
            .single()\
            .execute()

        if not task.data:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404

        task_data = task.data

        # Classify the task
        service = SubjectClassificationService(client=admin_supabase)
        subject_distribution = service.classify_task_subjects(
            task_data['title'],
            task_data.get('description', ''),
            task_data['pillar'],
            task_data.get('xp_value', 100)
        )

        return jsonify({
            'success': True,
            'task': {
                'id': task_data['id'],
                'title': task_data['title'],
                'description': task_data.get('description'),
                'pillar': task_data['pillar'],
                'xp_value': task_data.get('xp_value', 100),
                'current_distribution': task_data.get('subject_xp_distribution'),
                'proposed_distribution': subject_distribution
            }
        }), 200

    except Exception as e:
        logger.error(f"Error previewing task {task_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/stats', methods=['GET'])
@require_auth
@require_admin
def get_backfill_stats(user_id: str):
    """
    Get statistics on how many tasks have subject distributions.

    GET /api/admin/subject-backfill/stats
    """
    try:
        admin_supabase = get_supabase_admin_client()

        # Count total tasks
        total = admin_supabase.table('user_quest_tasks')\
            .select('id', count='exact')\
            .execute()

        # Count tasks with subject distribution
        with_distribution = admin_supabase.table('user_quest_tasks')\
            .select('id', count='exact')\
            .not_.is_('subject_xp_distribution', 'null')\
            .execute()

        # Count tasks without subject distribution
        without_distribution = admin_supabase.table('user_quest_tasks')\
            .select('id', count='exact')\
            .is_('subject_xp_distribution', 'null')\
            .execute()

        total_count = total.count
        with_count = with_distribution.count
        without_count = without_distribution.count

        return jsonify({
            'success': True,
            'stats': {
                'total_tasks': total_count,
                'with_distribution': with_count,
                'without_distribution': without_count,
                'percentage_complete': round((with_count / total_count * 100) if total_count > 0 else 0, 1)
            }
        }), 200

    except Exception as e:
        logger.error(f"Error getting backfill stats: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
