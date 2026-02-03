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
from services.webhook_service import WebhookService
from services.course_progress_service import CourseProgressService

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
            .select('*, user_quest_tasks!inner(title, pillar, quest_id, user_quest_id, xp_value, diploma_subjects)')\
            .eq('user_id', user_id)\
            .execute()

        # Query 2b: Get ALL approved tasks from user_quest_tasks as fallback
        # This is needed for org students whose completions aren't synced to quest_task_completions
        approved_tasks = supabase.table('user_quest_tasks')\
            .select('id, title, pillar, quest_id, user_quest_id, xp_value, diploma_subjects, approval_status, updated_at')\
            .eq('user_id', user_id)\
            .eq('approval_status', 'approved')\
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

        # If quest_task_completions is empty but we have approved tasks, create completion-like entries
        # This handles org students whose completions aren't synced to quest_task_completions
        if not quest_task_completions.data and approved_tasks.data:
            logger.info(f"Using approved_tasks fallback for {len(approved_tasks.data)} tasks (user: {user_id})")
            synthetic_completions = []
            for task in approved_tasks.data:
                synthetic_completions.append({
                    'id': task.get('id'),
                    'user_quest_task_id': task.get('id'),
                    'completed_at': task.get('updated_at'),
                    'evidence_text': None,
                    'evidence_url': None,
                    'user_quest_tasks': {
                        'title': task.get('title'),
                        'pillar': task.get('pillar'),
                        'quest_id': task.get('quest_id'),
                        'user_quest_id': task.get('user_quest_id'),
                        'xp_value': task.get('xp_value', 0),
                        'diploma_subjects': task.get('diploma_subjects')
                    }
                })
            # Replace the empty completions with synthetic ones
            quest_task_completions = type('obj', (object,), {'data': synthetic_completions})()

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
                        'pillar': task_info.get('pillar', 'Arts & Creativity'),
                        'diploma_subjects': task_info.get('diploma_subjects')
                    }
                else:
                    # Legacy single-format evidence
                    evidence_content = tc.get('evidence_text', '') or tc.get('evidence_url', '')
                    task_evidence[task_title] = {
                        'evidence_type': 'text' if tc.get('evidence_text') else 'link',
                        'evidence_content': evidence_content,
                        'xp_awarded': task_xp,
                        'completed_at': tc.get('completed_at'),
                        'pillar': task_info.get('pillar', 'Arts & Creativity'),
                        'diploma_subjects': task_info.get('diploma_subjects')
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
                        'pillar': task_info.get('pillar', 'Arts & Creativity'),
                        'diploma_subjects': task_info.get('diploma_subjects')
                    }
                else:
                    # Legacy single-format evidence
                    evidence_content = tc.get('evidence_text', '') or tc.get('evidence_url', '')
                    task_evidence[task_title] = {
                        'evidence_type': 'text' if tc.get('evidence_text') else 'link',
                        'evidence_content': evidence_content,
                        'xp_awarded': task_xp,
                        'completed_at': tc.get('completed_at'),
                        'pillar': task_info.get('pillar', 'Arts & Creativity'),
                        'diploma_subjects': task_info.get('diploma_subjects')
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
    Marks the quest as inactive and sets completed_at timestamp.

    This is called when the user explicitly chooses to finish a quest,
    either from the quest completion celebration modal (after all tasks are done)
    or manually from the quest detail page.

    For course projects, completion requires BOTH:
    - XP threshold met (if set)
    - ALL required tasks completed
    """
    try:
        # Use admin client - @require_auth already validated user
        # Using admin client avoids RLS issues with JWT tokens
        supabase = get_supabase_admin_client()

        # Check if user is enrolled in this quest (allow both active and completed)
        # Handle case where user tries to end an already-ended quest
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

        # Check completion eligibility for course projects
        # Allow force parameter to bypass the check (for admin use or testing)
        data = request.get_json(silent=True) or {}
        force_complete = data.get('force', False)

        if not force_complete:
            progress_service = CourseProgressService(supabase)
            eligibility = progress_service.check_quest_completion_eligibility(user_id, quest_id)

            if eligibility.get('is_course_quest') and not eligibility.get('can_complete'):
                # Cannot complete - return error with details
                error_reasons = []

                if not eligibility.get('xp_met'):
                    error_reasons.append(
                        f"XP goal not reached ({eligibility.get('earned_xp', 0)}/{eligibility.get('required_xp', 0)} XP)"
                    )

                if not eligibility.get('required_tasks_met'):
                    incomplete = eligibility.get('incomplete_lessons', [])
                    task_count = eligibility.get('total_required', 0) - eligibility.get('completed_required', 0)
                    error_reasons.append(
                        f"{task_count} required task{'s' if task_count != 1 else ''} incomplete"
                    )

                return jsonify({
                    'success': False,
                    'error': 'Cannot complete project yet',
                    'reason': 'INCOMPLETE_REQUIREMENTS',
                    'message': ' and '.join(error_reasons) if error_reasons else 'Requirements not met',
                    'requirements': {
                        'xp_met': eligibility.get('xp_met', True),
                        'required_tasks_met': eligibility.get('required_tasks_met', True),
                        'earned_xp': eligibility.get('earned_xp', 0),
                        'required_xp': eligibility.get('required_xp', 0),
                        'completed_required_tasks': eligibility.get('completed_required', 0),
                        'total_required_tasks': eligibility.get('total_required', 0),
                        'incomplete_lessons': eligibility.get('incomplete_lessons', [])
                    }
                }), 400

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

        # Emit webhook event for quest completion
        try:
            webhook_service = WebhookService(supabase)
            user_data = supabase.table('users').select('organization_id').eq('id', user_id).single().execute()
            organization_id = user_data.data.get('organization_id') if user_data.data else None

            # Get quest details for webhook
            quest_data = supabase.table('quests').select('title').eq('id', quest_id).single().execute()
            quest_title = quest_data.data.get('title', 'Unknown Quest') if quest_data.data else 'Unknown Quest'

            webhook_service.emit_event(
                event_type='quest.completed',
                data={
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'quest_title': quest_title,
                    'tasks_completed': task_count,
                    'total_xp_earned': total_xp,
                    'completed_at': datetime.utcnow().isoformat() + 'Z'
                },
                organization_id=organization_id
            )
        except Exception as webhook_error:
            # Don't fail quest completion if webhook fails
            logger.warning(f"Failed to emit quest.completed webhook: {str(webhook_error)}")

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

        admin = get_supabase_admin_client()

        # First, get the user_quest record to find its ID
        user_quest = admin.table('user_quests')\
            .select('id')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .maybe_single()\
            .execute()

        if not user_quest.data:
            return jsonify({'error': 'Quest not found or not enrolled'}), 404

        # Update using the primary key and admin client (bypasses RLS)
        admin.table('user_quests')\
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
