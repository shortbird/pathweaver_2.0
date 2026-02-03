"""
Parent Dashboard - Quest Progress Views.
Provides quest calendar, completed quests, and detailed quest view for parents.
Part of parent/dashboard.py refactoring (Month 6 - Backend Optimization).
"""
from flask import Blueprint, jsonify
from datetime import datetime, date
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from middleware.error_handler import AuthorizationError, NotFoundError
from utils.pillar_utils import get_pillar_name
from utils.logger import get_logger
from .dashboard_overview import verify_parent_access
import logging
import re
from typing import Optional, List, Dict, Any

logger = get_logger(__name__)
logger = logging.getLogger(__name__)

bp = Blueprint('parent_quests_view', __name__, url_prefix='/api/parent')


# Helper functions for evidence display enhancement
def parse_document_id_from_evidence_text(evidence_text: str) -> Optional[str]:
    """
    Extract document ID from multi-format evidence placeholder string.

    Args:
        evidence_text: Text from quest_task_completions.evidence_text

    Returns:
        Document UUID if found, None otherwise
    """
    if evidence_text and evidence_text.startswith('Multi-format evidence document'):
        match = re.search(r'Document ID: ([\w-]+)', evidence_text)
        if match:
            return match.group(1)
    return None


def fetch_evidence_blocks_by_document_id(
    supabase,
    document_id: str,
    filter_private: bool = False,
    viewer_user_id: str = None
) -> tuple[List[Dict[str, Any]], bool, str]:
    """
    Fetch evidence blocks directly by document ID.
    Used as fallback when task_id matching fails.

    Args:
        supabase: Supabase client
        document_id: UUID of user_task_evidence_documents record
        filter_private: If True, exclude private blocks (False for parents)
        viewer_user_id: User ID of the person viewing

    Returns:
        Tuple of (blocks list, is_confidential boolean, owner_user_id string)
    """
    try:
        query = supabase.table('user_task_evidence_documents').select('''
            id,
            user_id,
            is_confidential,
            evidence_document_blocks (
                id, block_type, content, order_index, is_private
            )
        ''').eq('id', document_id)

        if filter_private:
            query = query.eq('evidence_document_blocks.is_private', False)

        result = query.execute()

        if result.data and len(result.data) > 0:
            doc = result.data[0]
            is_confidential = doc.get('is_confidential', False)
            owner_user_id = doc.get('user_id')

            blocks = doc.get('evidence_document_blocks', [])
            sorted_blocks = sorted(blocks, key=lambda b: b.get('order_index', 0))

            return sorted_blocks, is_confidential, owner_user_id

        logger.warning(f"No evidence blocks found for document ID: {document_id}")
        return [], False, None

    except Exception as e:
        logger.error(f"Error fetching evidence blocks for document {document_id}: {e}")
        return [], False, None


@bp.route('/calendar/<student_id>', methods=['GET'])
@require_auth
def get_student_calendar(user_id, student_id):
    """
    Get student's calendar view with tasks and deadlines.
    Read-only access for parents. Optimized for connection reuse.
    """
    supabase = None
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Get active quests
        user_quests_response = supabase.table('user_quests').select(
            'quest_id'
        ).eq('user_id', student_id).is_('completed_at', 'null').eq('is_active', True).execute()

        active_quest_ids = [uq['quest_id'] for uq in user_quests_response.data]

        if not active_quest_ids:
            return jsonify({'items': []}), 200

        # Get tasks with deadlines
        deadlines_response = supabase.table('user_quest_deadlines').select('''
            quest_id, task_id, scheduled_date
        ''').eq('user_id', student_id).in_('quest_id', active_quest_ids).execute()

        if not deadlines_response.data:
            return jsonify({'items': []}), 200

        task_ids = [d['task_id'] for d in deadlines_response.data if d.get('task_id')]

        if not task_ids:
            return jsonify({'items': []}), 200

        # Get task details from user_quest_tasks
        tasks_response = supabase.table('user_quest_tasks').select('''
            id, quest_id, title, description, pillar, xp_value
        ''').eq('user_id', student_id).in_('id', task_ids).execute()

        # Get quest info
        quest_ids = list(set(task['quest_id'] for task in tasks_response.data))
        quests_response = supabase.table('quests').select('''
            id, title, image_url, header_image_url
        ''').in_('id', quest_ids).execute()

        # Get completions
        completions_response = supabase.table('quest_task_completions').select(
            'task_id, completed_at'
        ).eq('user_id', student_id).in_('task_id', task_ids).execute()

        # Build maps
        quests_map = {q['id']: q for q in quests_response.data}
        completions_map = {c['task_id']: c for c in completions_response.data}
        deadline_map = {d['task_id']: d['scheduled_date'] for d in deadlines_response.data if d.get('task_id')}

        # Build calendar items
        today = date.today()
        calendar_items = []

        for task in tasks_response.data:
            task_id = task['id']
            quest = quests_map.get(task['quest_id'], {})
            completion = completions_map.get(task_id)
            scheduled_date_str = deadline_map.get(task_id)

            status = 'completed' if completion else 'on-track'
            if not completion and scheduled_date_str:
                scheduled_date = datetime.strptime(scheduled_date_str, '%Y-%m-%d').date()
                if scheduled_date < today:
                    status = 'wandering'

            calendar_items.append({
                'id': task_id,
                'quest_id': task['quest_id'],
                'quest_title': quest.get('title', 'Unknown Quest'),
                'quest_image': quest.get('image_url') or quest.get('header_image_url'),
                'task_title': task['title'],
                'task_description': task.get('description'),
                'pillar': get_pillar_name(task['pillar']),
                'xp_value': task.get('xp_value'),
                'scheduled_date': scheduled_date_str,
                'completed_at': completion['completed_at'] if completion else None,
                'status': status
            })

        return jsonify({'items': calendar_items}), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting student calendar: {str(e)}")
        import traceback
        return jsonify({'error': 'Failed to get student calendar'}), 500


@bp.route('/completed-quests/<student_id>', methods=['GET'])
@require_auth
def get_completed_quests(user_id, student_id):
    """
    Get all completed quests for a student.
    Returns quest details with completion stats for parent viewing.
    """
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Get completed quests with quest details
        completed_quests_response = supabase.table('user_quests').select('''
            quest_id, started_at, completed_at,
            quests!inner(id, title, description, image_url, header_image_url)
        ''').eq('user_id', student_id).not_.is_('completed_at', 'null').order('completed_at', desc=True).execute()

        completed_quest_ids = [uq['quest_id'] for uq in completed_quests_response.data]

        # DEBUG: Log quest counts
        logger.info(f"DEBUG - Student {student_id} has {len(completed_quest_ids)} completed quests: {completed_quest_ids}")

        # Batch fetch all tasks and completions for completed quests
        tasks_map = {}
        completions_map = {}

        if completed_quest_ids:
            # Get all user tasks for completed quests
            all_tasks_response = supabase.table('user_quest_tasks').select('id, quest_id').eq(
                'user_id', student_id
            ).in_('quest_id', completed_quest_ids).execute()

            for task in all_tasks_response.data:
                qid = task['quest_id']
                if qid not in tasks_map:
                    tasks_map[qid] = []
                tasks_map[qid].append(task['id'])

            # DEBUG: Log task counts per quest
            logger.info(f"DEBUG - Task counts by quest: {[(qid, len(tasks)) for qid, tasks in tasks_map.items()]}")

            # Get all completions for completed quests in one query
            all_completions_response = supabase.table('quest_task_completions').select('task_id, quest_id, user_quest_task_id').eq(
                'user_id', student_id
            ).in_('quest_id', completed_quest_ids).execute()

            for comp in all_completions_response.data:
                qid = comp['quest_id']
                # Use user_quest_task_id as the canonical task identifier
                task_id = comp.get('user_quest_task_id') or comp.get('task_id')
                if qid not in completions_map:
                    completions_map[qid] = []
                if task_id:
                    completions_map[qid].append(task_id)

        # Build completed quests list
        completed_quests = []
        for uq in completed_quests_response.data:
            quest = uq['quests']
            quest_id = quest['id']

            total_tasks = len(tasks_map.get(quest_id, []))
            completed_tasks = len(completions_map.get(quest_id, []))

            completed_quests.append({
                'quest_id': quest_id,
                'title': quest['title'],
                'description': quest.get('description'),
                'image_url': quest.get('image_url') or quest.get('header_image_url'),
                'started_at': uq['started_at'],
                'completed_at': uq['completed_at'],
                'progress': {
                    'completed_tasks': completed_tasks,
                    'total_tasks': total_tasks,
                    'percentage': 100  # Always 100% for completed quests
                }
            })

        # DEBUG: Log final completed quests
        logger.info(f"DEBUG - Returning {len(completed_quests)} completed quests: {[(q['quest_id'], q['title'], q['completed_at']) for q in completed_quests]}")

        return jsonify({
            'quests': completed_quests,
            'total_count': len(completed_quests)
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        logger.error(f"Error getting completed quests: {str(e)}")
        import traceback
        return jsonify({'error': 'Failed to get completed quests'}), 500


@bp.route('/quest/<student_id>/<quest_id>', methods=['GET'])
@require_auth
def get_student_quest_view(user_id, student_id, quest_id):
    """
    Get read-only quest view for parents.
    Shows student's personalized tasks and completion status.
    """
    try:
        supabase = get_supabase_admin_client()
        verify_parent_access(supabase, user_id, student_id)

        # Get quest details
        quest_response = supabase.table('quests').select('''
            id, title, description, image_url, header_image_url, quest_type
        ''').eq('id', quest_id).single().execute()

        if not quest_response.data:
            raise NotFoundError("Quest not found")

        quest = quest_response.data

        # Get student's personalized tasks for this quest
        tasks_response = supabase.table('user_quest_tasks').select('''
            id, title, description, pillar, xp_value, order_index, is_required
        ''').eq('user_id', student_id).eq('quest_id', quest_id).order('order_index').execute()

        # Get task completions
        task_ids = [task['id'] for task in tasks_response.data]
        completions_map = {}

        if task_ids:
            completions_response = supabase.table('quest_task_completions').select('''
                user_quest_task_id, completed_at, evidence_text, evidence_url, is_confidential
            ''').eq('user_id', student_id).in_('user_quest_task_id', task_ids).execute()

            completions_map = {
                comp['user_quest_task_id']: comp
                for comp in completions_response.data
            }

        # Build tasks list with completion status and enhanced evidence
        tasks = []
        for task in tasks_response.data:
            task_id = task['id']
            completion = completions_map.get(task_id)

            # Enhanced evidence handling
            evidence_text = None
            evidence_url = None
            evidence_blocks = []
            evidence_type = 'legacy_text'
            is_confidential = False

            # Check for evidence document (draft or completed)
            evidence_doc_response = supabase.table('user_task_evidence_documents')\
                .select('id')\
                .eq('task_id', task_id)\
                .eq('user_id', student_id)\
                .execute()

            if evidence_doc_response.data:
                # Fetch evidence blocks
                doc_id = evidence_doc_response.data[0]['id']
                blocks_response = supabase.table('evidence_document_blocks')\
                    .select('id, block_type, content, order_index, is_private, uploaded_by_user_id, uploaded_by_role, created_at')\
                    .eq('document_id', doc_id)\
                    .order('order_index')\
                    .execute()

                if blocks_response.data:
                    # Batch fetch uploader names (N+1 optimization)
                    uploader_ids = list(set(
                        block['uploaded_by_user_id']
                        for block in blocks_response.data
                        if block.get('uploaded_by_user_id')
                    ))

                    uploaders_map = {}
                    if uploader_ids:
                        uploaders_response = supabase.table('users')\
                            .select('id, display_name, first_name, last_name')\
                            .in_('id', uploader_ids)\
                            .execute()

                        for uploader in uploaders_response.data:
                            uploaders_map[uploader['id']] = (
                                uploader.get('display_name') or
                                f"{uploader.get('first_name', '')} {uploader.get('last_name', '')}".strip() or
                                'Unknown'
                            )

                    # Enrich blocks with uploader names
                    enriched_blocks = []
                    for block in blocks_response.data:
                        enriched_block = dict(block)

                        if block.get('uploaded_by_user_id'):
                            enriched_block['uploaded_by_name'] = uploaders_map.get(
                                block['uploaded_by_user_id'],
                                'Unknown'
                            )

                        enriched_blocks.append(enriched_block)

                    evidence_blocks = enriched_blocks
                    evidence_type = 'multi_format'

            # Also check legacy completion evidence
            if completion:
                evidence_text = completion.get('evidence_text')
                evidence_url = completion.get('evidence_url')
                is_confidential = completion.get('is_confidential', False)

                # Check if evidence_text contains multi-format document reference
                document_id = parse_document_id_from_evidence_text(evidence_text)

                if document_id and not evidence_blocks:
                    # Fetch blocks directly by document ID (fallback for legacy format)
                    logger.info(f"Fetching evidence blocks for task {task_id} via document ID: {document_id}")
                    blocks, doc_confidential, doc_owner = fetch_evidence_blocks_by_document_id(
                        supabase, document_id, filter_private=False, viewer_user_id=user_id
                    )

                    if blocks:
                        evidence_blocks = blocks
                        evidence_type = 'multi_format'
                        # Clear placeholder text so frontend doesn't display it
                        evidence_text = None
                        is_confidential = doc_confidential

            tasks.append({
                'id': task_id,
                'title': task['title'],
                'description': task.get('description'),
                'pillar': get_pillar_name(task['pillar']),
                'xp_value': task.get('xp_value', 0),
                'order_index': task.get('order_index', 0),
                'is_required': task.get('is_required', False),
                'is_completed': completion is not None,
                'completed_at': completion['completed_at'] if completion else None,
                'evidence_type': evidence_type,
                'evidence_text': evidence_text,
                'evidence_url': evidence_url,
                'evidence_blocks': evidence_blocks,
                'is_confidential': is_confidential
            })

        # Calculate progress
        completed_count = len([t for t in tasks if t['is_completed']])
        total_count = len(tasks)
        progress_percentage = round((completed_count / total_count * 100)) if total_count > 0 else 0

        # Check if student has started this quest
        user_quest_response = supabase.table('user_quests').select('''
            started_at, completed_at, is_active
        ''').eq('user_id', student_id).eq('quest_id', quest_id).execute()

        quest_status = 'not_started'
        started_at = None
        completed_at = None

        if user_quest_response.data and len(user_quest_response.data) > 0:
            user_quest = user_quest_response.data[0]
            started_at = user_quest.get('started_at')
            completed_at = user_quest.get('completed_at')

            if completed_at:
                quest_status = 'completed'
            elif user_quest.get('is_active'):
                quest_status = 'in_progress'
            else:
                quest_status = 'abandoned'

        return jsonify({
            'quest': {
                'id': quest['id'],
                'title': quest['title'],
                'description': quest.get('description'),
                'image_url': quest.get('image_url') or quest.get('header_image_url'),
                'quest_type': quest.get('quest_type'),
                'status': quest_status,
                'started_at': started_at,
                'completed_at': completed_at
            },
            'tasks': tasks,
            'progress': {
                'completed_tasks': completed_count,
                'total_tasks': total_count,
                'percentage': progress_percentage
            }
        }), 200

    except AuthorizationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting student quest view: {str(e)}")
        import traceback
        return jsonify({'error': 'Failed to get quest details'}), 500
