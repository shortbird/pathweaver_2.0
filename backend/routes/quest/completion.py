"""
Quest Completion API endpoints.
Handles quest progress tracking, completion, and task management.

Part of the quests.py refactoring (P2-ARCH-1).
"""

from flask import Blueprint, request, jsonify, g
from datetime import datetime
from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_auth
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('quest_completion', __name__, url_prefix='/api/quests')


@bp.route('/my-active', methods=['GET'])
@require_auth
def get_user_active_quests(user_id: str):
    """
    Get all active quests for the current user.
    Includes progress information.
    """
    try:
        # Use admin client - user authentication enforced by @require_auth
        supabase = get_supabase_admin_client()

        # Get user's active quests with progress
        # Note: In V3 personalized system, quest_tasks table is archived
        # Each user has personalized tasks in user_quest_tasks table
        user_quests = supabase.table('user_quests')\
            .select('*, quests(*)')\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .is_('completed_at', 'null')\
            .order('started_at', desc=True)\
            .execute()

        if not user_quests.data:
            return jsonify({
                'success': True,
                'quests': [],
                'message': 'No active quests'
            })

        # Process each quest to add progress info
        active_quests = []
        for uq in user_quests.data:
            quest = uq.get('quests')
            if not quest:
                continue

            user_quest_id = uq['id']

            # Get user's personalized tasks for this quest
            user_tasks = supabase.table('user_quest_tasks')\
                .select('id, xp_value')\
                .eq('user_quest_id', user_quest_id)\
                .eq('approval_status', 'approved')\
                .execute()

            # Get completed tasks for this quest
            completed_tasks_response = supabase.table('quest_task_completions')\
                .select('task_id')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest['id'])\
                .execute()

            completed_task_ids = {t['task_id'] for t in (completed_tasks_response.data or [])}
            total_tasks = len(user_tasks.data) if user_tasks.data else 0
            completed_count = len(completed_task_ids)

            quest['enrollment_id'] = uq['id']
            quest['started_at'] = uq['started_at']
            quest['progress'] = {
                'completed_tasks': completed_count,
                'total_tasks': total_tasks,
                'percentage': (completed_count / total_tasks * 100) if total_tasks > 0 else 0
            }

            # Calculate XP earned from completed tasks
            xp_earned = sum(
                task['xp_value'] for task in (user_tasks.data or [])
                if task['id'] in completed_task_ids
            )
            quest['xp_earned'] = xp_earned

            active_quests.append(quest)

        return jsonify({
            'success': True,
            'quests': active_quests,
            'total': len(active_quests)
        })

    except Exception as e:
        logger.error(f"Error getting user active quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch active quests'
        }), 500


@bp.route('/completed', methods=['GET'])
@require_auth
def get_user_completed_quests(user_id: str):
    """
    Get all completed and in-progress quests for the current user.
    Used for diploma page and achievement display.
    Optimized to fetch all data in bulk to prevent N+1 queries.
    """
    try:
        # Use admin client - user authentication already enforced by @require_auth
        # Queries are explicitly filtered by user_id
        supabase = get_supabase_admin_client()

        # Fetch ALL user data in parallel using just 3 queries
        # Query 1: Get all user quests (completed + in-progress)
        user_quests_response = supabase.table('user_quests')\
            .select('*, quests(*)')\
            .eq('user_id', user_id)\
            .order('completed_at', desc=True)\
            .execute()

        # Query 2: Get ALL task completions for this user with task details
        quest_task_completions = supabase.table('quest_task_completions')\
            .select('*, user_quest_tasks!inner(title, pillar, quest_id, user_quest_id, xp_value)')\
            .eq('user_id', user_id)\
            .execute()

        # Query 3: Get ALL evidence documents with blocks for this user
        evidence_documents_response = supabase.table('user_task_evidence_documents')\
            .select('*, evidence_document_blocks(*)')\
            .eq('user_id', user_id)\
            .execute()

        # Map evidence documents by task_id for quick lookup
        evidence_docs_by_task = {}
        if evidence_documents_response.data:
            for doc in evidence_documents_response.data:
                task_id = doc.get('task_id')
                if task_id:
                    evidence_docs_by_task[task_id] = doc

        # Separate completed and in-progress quests from the fetched data
        completed_quests = [q for q in (user_quests_response.data or []) if q.get('completed_at')]
        in_progress_quests = [q for q in (user_quests_response.data or []) if not q.get('completed_at') and q.get('is_active')]

        # Get task counts for all user quests in one query (for progress calculation)
        all_user_quest_ids = [q['id'] for q in (user_quests_response.data or [])]
        task_counts_by_quest = {}
        if all_user_quest_ids:
            # Fetch all user quest tasks to count them by user_quest_id
            all_tasks_response = supabase.table('user_quest_tasks')\
                .select('id, user_quest_id')\
                .in_('user_quest_id', all_user_quest_ids)\
                .execute()

            # Count tasks per quest
            for task in (all_tasks_response.data or []):
                uq_id = task.get('user_quest_id')
                if uq_id:
                    task_counts_by_quest[uq_id] = task_counts_by_quest.get(uq_id, 0) + 1

        # Process quests with evidence
        achievements = []

        # Add completed quests
        for cq in completed_quests:
            quest = cq.get('quests')
            if not quest:
                continue

            user_quest_id = cq.get('id')
            quest_id = quest.get('id')

            # Get task completions for this quest
            quest_completions = [
                tc for tc in (quest_task_completions.data or [])
                if tc.get('user_quest_tasks', {}).get('quest_id') == quest_id
                and tc.get('user_quest_tasks', {}).get('user_quest_id') == user_quest_id
            ]

            # Organize evidence by task
            task_evidence = {}
            total_xp = 0

            for tc in quest_completions:
                task_info = tc.get('user_quest_tasks', {})
                task_title = task_info.get('title', 'Unknown Task')
                user_quest_task_id = tc.get('user_quest_task_id')

                # Get XP from user_quest_tasks
                task_xp = task_info.get('xp_value', 0)
                total_xp += task_xp

                # Check for multi-format evidence document
                evidence_doc = evidence_docs_by_task.get(user_quest_task_id)

                if evidence_doc and evidence_doc.get('evidence_document_blocks'):
                    # Multi-format evidence
                    task_evidence[task_title] = {
                        'evidence_type': 'multi_format',
                        'evidence_blocks': evidence_doc.get('evidence_document_blocks', []),
                        'evidence_content': '',  # Not used for multi-format
                        'xp_awarded': task_xp,
                        'completed_at': tc.get('completed_at'),
                        'pillar': task_info.get('pillar', 'Arts & Creativity')
                    }
                else:
                    # Legacy single-format evidence
                    evidence_content = tc.get('evidence_text', '') or tc.get('evidence_url', '')
                    task_evidence[task_title] = {
                        'evidence_type': 'text' if tc.get('evidence_text') else 'link',
                        'evidence_content': evidence_content,
                        'xp_awarded': task_xp,
                        'completed_at': tc.get('completed_at'),
                        'pillar': task_info.get('pillar', 'Arts & Creativity')
                    }

            # Only include completed quests that have at least one completed task
            if len(task_evidence) > 0:
                achievement = {
                    'quest': quest,
                    'completed_at': cq['completed_at'],
                    'task_evidence': task_evidence,
                    'total_xp_earned': total_xp,
                    'status': 'completed'
                }

                achievements.append(achievement)

        # Add in-progress quests with at least one submitted task
        for cq in in_progress_quests:
            quest = cq.get('quests')
            if not quest:
                continue

            user_quest_id = cq.get('id')
            quest_id = quest.get('id')

            # Get task completions for this quest
            quest_completions = [
                tc for tc in (quest_task_completions.data or [])
                if tc.get('user_quest_tasks', {}).get('quest_id') == quest_id
                and tc.get('user_quest_tasks', {}).get('user_quest_id') == user_quest_id
            ]

            # Skip if no tasks completed yet
            if not quest_completions:
                continue

            # Organize evidence by task
            task_evidence = {}
            total_xp = 0

            for tc in quest_completions:
                task_info = tc.get('user_quest_tasks', {})
                task_title = task_info.get('title', 'Unknown Task')
                user_quest_task_id = tc.get('user_quest_task_id')

                # Get XP from user_quest_tasks
                task_xp = task_info.get('xp_value', 0)
                total_xp += task_xp

                # Check for multi-format evidence document
                evidence_doc = evidence_docs_by_task.get(user_quest_task_id)

                if evidence_doc and evidence_doc.get('evidence_document_blocks'):
                    # Multi-format evidence
                    task_evidence[task_title] = {
                        'evidence_type': 'multi_format',
                        'evidence_blocks': evidence_doc.get('evidence_document_blocks', []),
                        'evidence_content': '',  # Not used for multi-format
                        'xp_awarded': task_xp,
                        'completed_at': tc.get('completed_at'),
                        'pillar': task_info.get('pillar', 'Arts & Creativity')
                    }
                else:
                    # Legacy single-format evidence
                    evidence_content = tc.get('evidence_text', '') or tc.get('evidence_url', '')
                    task_evidence[task_title] = {
                        'evidence_type': 'text' if tc.get('evidence_text') else 'link',
                        'evidence_content': evidence_content,
                        'xp_awarded': task_xp,
                        'completed_at': tc.get('completed_at'),
                        'pillar': task_info.get('pillar', 'Arts & Creativity')
                    }

            # Use pre-fetched task count
            total_tasks = task_counts_by_quest.get(user_quest_id, 0)
            completed_tasks = len(task_evidence)

            achievement = {
                'quest': quest,
                'started_at': cq['started_at'],
                'task_evidence': task_evidence,
                'total_xp_earned': total_xp,
                'status': 'in_progress',
                'progress': {
                    'completed_tasks': completed_tasks,
                    'total_tasks': total_tasks,
                    'percentage': (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
                }
            }

            achievements.append(achievement)

        # Sort achievements by date (completed_at for completed, started_at for in-progress)
        achievements.sort(key=lambda x: x.get('completed_at') or x.get('started_at'), reverse=True)

        return jsonify({
            'success': True,
            'achievements': achievements,
            'total': len(achievements)
        })

    except Exception as e:
        logger.error(f"Error getting completed quests: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch completed quests'
        }), 500


@bp.route('/<quest_id>/end', methods=['POST'])
@require_auth
def end_quest(user_id: str, quest_id: str):
    """
    End an active quest enrollment.
    Keeps all progress, submitted tasks, and XP earned.
    Simply marks the quest as inactive.

    Note: This endpoint can be called even if the quest is already completed
    (from auto-completion when all tasks are done). We handle both cases gracefully.
    """
    try:
        # Use admin client - @require_auth already validated user
        # Using admin client avoids RLS issues with JWT tokens
        supabase = get_supabase_admin_client()

        # Check if user is enrolled in this quest (allow both active and completed)
        # Quest might already be auto-completed when last task was submitted
        enrollment = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if not enrollment.data:
            return jsonify({
                'success': False,
                'error': 'Not enrolled in this quest'
            }), 404

        # Get the most recent enrollment (in case of multiple)
        current_enrollment = enrollment.data[0]

        # Check if already marked as inactive and completed
        if not current_enrollment.get('is_active') and current_enrollment.get('completed_at'):
            # Quest is already fully completed - return success with stats
            user_quest_id = current_enrollment['id']

            # Get ONLY completed tasks by joining with quest_task_completions
            completed_tasks = supabase.table('quest_task_completions')\
                .select('user_quest_task_id, user_quest_tasks!inner(xp_value)')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            total_xp = sum(task.get('user_quest_tasks', {}).get('xp_value', 0) for task in (completed_tasks.data or []))
            task_count = len(completed_tasks.data or [])

            return jsonify({
                'success': True,
                'message': f'Quest already completed! You finished {task_count} tasks and earned {total_xp} XP.',
                'already_completed': True,
                'stats': {
                    'tasks_completed': task_count,
                    'xp_earned': total_xp
                }
            })

        # If not already inactive, mark it as such

        user_quest_id = enrollment.data[0]['id']

        # Mark the quest as inactive (ended) and set completed_at timestamp
        result = supabase.table('user_quests')\
            .update({
                'is_active': False,
                'completed_at': datetime.utcnow().isoformat(),
                'last_set_down_at': datetime.utcnow().isoformat()
            })\
            .eq('id', user_quest_id)\
            .execute()

        # Get ONLY completed tasks by joining with quest_task_completions
        completed_tasks = supabase.table('quest_task_completions')\
            .select('user_quest_task_id, user_quest_tasks!inner(xp_value)')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        total_xp = sum(task.get('user_quest_tasks', {}).get('xp_value', 0) for task in (completed_tasks.data or []))
        task_count = len(completed_tasks.data or [])

        return jsonify({
            'success': True,
            'message': f'Quest ended successfully. You completed {task_count} tasks and earned {total_xp} XP.',
            'stats': {
                'tasks_completed': task_count,
                'xp_earned': total_xp
            }
        })

    except Exception as e:
        logger.error(f"Error ending quest: {str(e)}")
        import traceback
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/<quest_id>/tasks/reorder', methods=['PUT'])
@require_auth
def reorder_quest_tasks(user_id: str, quest_id: str):
    """
    Reorder tasks for a quest.
    Body: { task_ids: [id1, id2, id3...] }
    """
    try:
        data = request.get_json()
        task_ids = data.get('task_ids', [])

        if not task_ids:
            return jsonify({'error': 'task_ids is required'}), 400

        # Use admin client to bypass RLS for updates
        supabase = get_supabase_admin_client()

        # Verify user is enrolled in this quest
        enrollment = supabase.table('user_quests')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .maybe_single()\
            .execute()

        if not enrollment.data:
            return jsonify({'error': 'Quest not found or not enrolled'}), 404

        # Update order_index for each task
        for index, task_id in enumerate(task_ids):
            result = supabase.table('user_quest_tasks')\
                .update({'order_index': index})\
                .eq('id', task_id)\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            logger.debug(f"Updated task {task_id} to order_index {index}: {result.data}")

        logger.info(f"User {user_id[:8]} reordered {len(task_ids)} tasks for quest {quest_id}")

        return jsonify({
            'success': True,
            'message': 'Task order updated successfully'
        }), 200

    except Exception as e:
        logger.error(f"Error reordering tasks for quest {quest_id}: {str(e)}", exc_info=True)
        return jsonify({'error': f'Failed to reorder tasks: {str(e)}'}), 500


@bp.route('/<quest_id>/display-mode', methods=['PUT'])
@require_auth
def update_display_mode(user_id: str, quest_id: str):
    """
    Update the display mode for a quest (timeline or flexible).
    Body: { display_mode: 'timeline' | 'flexible' }
    """
    try:
        data = request.get_json()
        display_mode = data.get('display_mode')

        if display_mode not in ['timeline', 'flexible']:
            return jsonify({'error': 'display_mode must be "timeline" or "flexible"'}), 400

        supabase = get_user_client()

        # First, get the user_quest record to find its ID
        user_quest = supabase.table('user_quests')\
            .select('id')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .maybe_single()\
            .execute()

        if not user_quest.data:
            return jsonify({'error': 'Quest not found or not enrolled'}), 404

        # Update using the primary key
        result = supabase.table('user_quests')\
            .update({'task_display_mode': display_mode})\
            .eq('id', user_quest.data['id'])\
            .execute()

        logger.info(f"User {user_id[:8]} set display mode to '{display_mode}' for quest {quest_id}")

        return jsonify({
            'success': True,
            'display_mode': display_mode
        }), 200

    except Exception as e:
        logger.error(f"Error updating display mode for quest {quest_id}: {str(e)}")
        return jsonify({'error': 'Failed to update display mode'}), 500
