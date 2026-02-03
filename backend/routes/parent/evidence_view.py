"""
Parent Dashboard - Evidence Viewing.
Provides task details and recent completions with evidence for parent viewing.
Part of parent/dashboard.py refactoring (Month 6 - Backend Optimization).
"""
from flask import Blueprint, jsonify
from datetime import datetime, date, timedelta
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from middleware.error_handler import AuthorizationError, NotFoundError
from utils.pillar_utils import get_pillar_name
from utils.logger import get_logger
from .dashboard_overview import verify_parent_access
from .quests_view import parse_document_id_from_evidence_text, fetch_evidence_blocks_by_document_id
import logging

logger = get_logger(__name__)
logger = logging.getLogger(__name__)

bp = Blueprint('parent_evidence_view', __name__, url_prefix='/api/parent')


@bp.route('/task/<student_id>/<task_id>', methods=['GET'])
@require_auth
def get_task_details(user_id, student_id, task_id):
    """
    Get detailed task information including evidence for parent viewing.
    Parents can view task details and any submitted evidence.
    """
    supabase = None
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Get task details from user_quest_tasks
        task_response = supabase.table('user_quest_tasks').select('''
            id, quest_id, user_quest_id, title, description, pillar, xp_value, order_index, is_required
        ''').eq('user_id', student_id).eq('id', task_id).single().execute()

        if not task_response.data:
            raise NotFoundError("Task not found")

        task = task_response.data

        # Get quest details
        quest_response = supabase.table('quests').select('''
            id, title, description, image_url, header_image_url
        ''').eq('id', task['quest_id']).single().execute()

        quest = quest_response.data if quest_response.data else {}

        # Get completion status and evidence
        completion_response = supabase.table('quest_task_completions').select('''
            id, completed_at, evidence_url, evidence_text
        ''').eq('user_id', student_id).eq('task_id', task_id).execute()

        completion = completion_response.data[0] if completion_response.data else None

        # Note: Evidence is stored in the completion record as text and URL fields
        # No separate file uploads table exists

        # Get scheduled date if exists
        deadline_response = supabase.table('user_quest_deadlines').select(
            'scheduled_date'
        ).eq('user_id', student_id).eq('task_id', task_id).execute()

        scheduled_date = deadline_response.data[0]['scheduled_date'] if deadline_response.data else None

        # Determine status
        status = 'not_started'
        if completion:
            status = 'completed'
        elif scheduled_date:
            scheduled_date_obj = datetime.strptime(scheduled_date, '%Y-%m-%d').date()
            if scheduled_date_obj < date.today():
                status = 'overdue'
            else:
                status = 'scheduled'

        return jsonify({
            'task': {
                'id': task['id'],
                'title': task['title'],
                'description': task.get('description'),
                'pillar': get_pillar_name(task['pillar']),
                'xp_value': task.get('xp_value', 0),
                'order_index': task.get('order_index'),
                'is_required': task.get('is_required', False),
                'status': status,
                'scheduled_date': scheduled_date
            },
            'quest': {
                'id': quest.get('id'),
                'title': quest.get('title'),
                'description': quest.get('description'),
                'image_url': quest.get('image_url') or quest.get('header_image_url')
            },
            'completion': {
                'completed_at': completion['completed_at'] if completion else None,
                'evidence_text': completion['evidence_text'] if completion else None,
                'evidence_url': completion['evidence_url'] if completion else None,
                'xp_awarded': task.get('xp_value', 0)  # XP comes from task, not completion
            } if completion else None
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting task details: {str(e)}")
        import traceback
        return jsonify({'error': 'Failed to get task details'}), 500


@bp.route('/completions/<student_id>', methods=['GET'])
@require_auth
def get_recent_completions(user_id, student_id):
    """
    Get recent task completions with evidence for parent viewing.
    Returns last 30 days of completed tasks with full evidence details.
    """
    supabase = None
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Get completions from last 30 days
        thirty_days_ago = (date.today() - timedelta(days=30)).isoformat()
        completions_response = supabase.table('quest_task_completions').select('''
            id, task_id, user_quest_task_id, completed_at, evidence_url, evidence_text, is_confidential
        ''').eq('user_id', student_id).gte('completed_at', thirty_days_ago).order('completed_at', desc=True).execute()

        if not completions_response.data:
            return jsonify({'completions': []}), 200

        # Get task details
        task_ids = [comp['user_quest_task_id'] for comp in completions_response.data if comp.get('user_quest_task_id')]

        tasks_map = {}
        quests_map = {}

        if task_ids:
            tasks_response = supabase.table('user_quest_tasks').select('''
                id, quest_id, title, description, pillar, xp_value
            ''').in_('id', task_ids).execute()

            tasks_map = {task['id']: task for task in tasks_response.data}

            # Get quest details
            quest_ids = list(set(task['quest_id'] for task in tasks_response.data))
            quests_response = supabase.table('quests').select('''
                id, title, image_url, header_image_url
            ''').in_('id', quest_ids).execute()

            quests_map = {q['id']: q for q in quests_response.data}

        # Build completions list with evidence enhancement
        completions = []
        for comp in completions_response.data:
            task_id = comp.get('user_quest_task_id')
            if not task_id or task_id not in tasks_map:
                continue

            task = tasks_map[task_id]
            quest = quests_map.get(task['quest_id'], {})

            evidence_text = comp.get('evidence_text')
            evidence_url = comp.get('evidence_url')
            evidence_blocks = []
            evidence_type = 'legacy_text'  # Default
            is_confidential = comp.get('is_confidential', False)
            owner_user_id = student_id

            # Check if evidence_text contains multi-format document reference
            document_id = parse_document_id_from_evidence_text(evidence_text)

            if document_id:
                # Fetch blocks directly by document ID
                logger.info(f"Fetching evidence blocks for completion {comp['id']} via document ID: {document_id}")
                blocks, doc_confidential, doc_owner = fetch_evidence_blocks_by_document_id(
                    supabase, document_id, filter_private=False, viewer_user_id=user_id
                )

                if blocks:
                    evidence_blocks = blocks
                    evidence_type = 'multi_format'
                    # Clear placeholder text so frontend doesn't display it
                    evidence_text = None
                    is_confidential = doc_confidential
                    owner_user_id = doc_owner

            completions.append({
                'completion_id': comp['id'],
                'task': {
                    'id': comp['task_id'],
                    'title': task['title'],
                    'description': task.get('description'),
                    'pillar': get_pillar_name(task['pillar']),
                    'xp_value': task.get('xp_value', 0)
                },
                'quest': {
                    'id': task['quest_id'],
                    'title': quest.get('title'),
                    'image_url': quest.get('image_url') or quest.get('header_image_url')
                },
                'completed_at': comp['completed_at'],
                'evidence_type': evidence_type,
                'evidence_text': evidence_text,
                'evidence_url': evidence_url,
                'evidence_blocks': evidence_blocks,
                'is_confidential': is_confidential,
                'owner_user_id': owner_user_id
            })

        return jsonify({
            'completions': completions,
            'total_count': len(completions)
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting recent completions: {str(e)}")
        import traceback
        return jsonify({'error': 'Failed to get recent completions'}), 500
