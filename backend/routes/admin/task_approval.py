"""
REPOSITORY MIGRATION: MIGRATION CANDIDATE
- 10+ direct database calls for task approval workflow
- Task review, approval, rejection, flagging operations
- Could create TaskApprovalRepository with methods:
  - get_pending_approvals(filters)
  - approve_task(task_id, admin_id)
  - reject_task(task_id, admin_id, reason)
  - get_approval_history(task_id)
- Currently imports repositories but doesn't use them (lines 10-20)

Admin Task Approval Routes
===========================

Handles admin review and approval of student-created manual tasks.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from repositories import (
    UserRepository,
    QuestRepository,
    BadgeRepository,
    EvidenceRepository,
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
    AnalyticsRepository
)
from utils.auth.decorators import require_admin
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_task_approval', __name__, url_prefix='/api/admin')

# Using repository pattern for database access
@bp.route('/manual-tasks/pending', methods=['GET'])
@require_admin
def list_pending_tasks(user_id: str):
    """
    Get all student-created tasks awaiting approval.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get pagination params
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 20)), 100)
        offset = (page - 1) * per_page

        # Get pending manual tasks with user and quest info
        tasks = supabase.table('user_quest_tasks')\
            .select('*, users(first_name, last_name), quests(title)', count='exact')\
            .eq('is_manual', True)\
            .eq('approval_status', 'pending')\
            .order('created_at', desc=True)\
            .range(offset, offset + per_page - 1)\
            .execute()

        return jsonify({
            'success': True,
            'tasks': tasks.data or [],
            'total': tasks.count,
            'page': page,
            'per_page': per_page,
            'total_pages': (tasks.count + per_page - 1) // per_page if tasks.count else 0
        })

    except Exception as e:
        logger.error(f"Error listing pending tasks: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch pending tasks'
        }), 500

@bp.route('/manual-tasks/<task_id>/approve', methods=['PUT'])
@require_admin
def approve_task(user_id: str, task_id: str):
    """
    Approve a student-created task.
    """
    try:
        supabase = get_supabase_admin_client()

        # Update task status
        result = supabase.table('user_quest_tasks')\
            .update({
                'approval_status': 'approved',
                'updated_at': datetime.utcnow().isoformat()
            })\
            .eq('id', task_id)\
            .eq('is_manual', True)\
            .execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Task not found or already processed'
            }), 404

        return jsonify({
            'success': True,
            'task': result.data[0],
            'message': 'Task approved successfully'
        })

    except Exception as e:
        logger.error(f"Error approving task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to approve task'
        }), 500

@bp.route('/manual-tasks/<task_id>/reject', methods=['PUT'])
@require_admin
def reject_task(user_id: str, task_id: str):
    """
    Reject a student-created task with optional feedback.

    Request body:
    {
        "feedback": "Reason for rejection (optional)"
    }
    """
    try:
        supabase = get_supabase_admin_client()
        data = request.get_json() or {}

        feedback = data.get('feedback', '')

        # Update task status
        update_data = {
            'approval_status': 'rejected',
            'updated_at': datetime.utcnow().isoformat()
        }

        # Store feedback in description if provided
        if feedback:
            result = supabase.table('user_quest_tasks')\
                .select('description')\
                .eq('id', task_id)\
                .single()\
                .execute()

            if result.data:
                current_desc = result.data.get('description', '')
                update_data['description'] = f"{current_desc}\n\n[ADMIN FEEDBACK]: {feedback}"

        result = supabase.table('user_quest_tasks')\
            .update(update_data)\
            .eq('id', task_id)\
            .eq('is_manual', True)\
            .execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Task not found or already processed'
            }), 404

        return jsonify({
            'success': True,
            'task': result.data[0],
            'message': 'Task rejected'
        })

    except Exception as e:
        logger.error(f"Error rejecting task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to reject task'
        }), 500

@bp.route('/manual-tasks/<task_id>', methods=['DELETE'])
@require_admin
def delete_task(user_id: str, task_id: str):
    """
    Delete a rejected task.
    """
    try:
        supabase = get_supabase_admin_client()

        # Only allow deleting rejected tasks
        result = supabase.table('user_quest_tasks')\
            .delete()\
            .eq('id', task_id)\
            .eq('is_manual', True)\
            .eq('approval_status', 'rejected')\
            .execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Task not found or cannot be deleted (must be rejected)'
            }), 404

        return jsonify({
            'success': True,
            'message': 'Task deleted successfully'
        })

    except Exception as e:
        logger.error(f"Error deleting task: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to delete task'
        }), 500

@bp.route('/manual-tasks/stats', methods=['GET'])
@require_admin
def get_approval_stats(user_id: str):
    """
    Get statistics about manual task approvals.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get counts by status
        pending = supabase.table('user_quest_tasks')\
            .select('id', count='exact')\
            .eq('is_manual', True)\
            .eq('approval_status', 'pending')\
            .execute()

        approved = supabase.table('user_quest_tasks')\
            .select('id', count='exact')\
            .eq('is_manual', True)\
            .eq('approval_status', 'approved')\
            .execute()

        rejected = supabase.table('user_quest_tasks')\
            .select('id', count='exact')\
            .eq('is_manual', True)\
            .eq('approval_status', 'rejected')\
            .execute()

        return jsonify({
            'success': True,
            'stats': {
                'pending': pending.count or 0,
                'approved': approved.count or 0,
                'rejected': rejected.count or 0,
                'total': (pending.count or 0) + (approved.count or 0) + (rejected.count or 0)
            }
        })

    except Exception as e:
        logger.error(f"Error getting stats: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get stats'
        }), 500
