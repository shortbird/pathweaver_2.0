"""
Admin Task Feedback Routes

Endpoints for superadmin to review draft submissions and provide iterative feedback.
Part of the "process is the goal" diploma credit system.

Endpoints:
- GET /api/admin/drafts/pending - List drafts awaiting feedback
- POST /api/admin/drafts/<completion_id>/feedback - Add feedback to a draft
- PUT /api/admin/drafts/<completion_id>/suggest-ready - Suggest draft is ready for credit
- GET /api/admin/drafts/stats - Dashboard stats for pending drafts
- GET /api/admin/drafts/<completion_id> - Get draft details with feedback history
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_superadmin
from utils.api_response_v1 import success_response, error_response
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('task_feedback', __name__, url_prefix='/api/admin/drafts')


def enrich_drafts_with_relations(supabase, drafts):
    """Fetch and attach user, task, and quest data to drafts."""
    if not drafts:
        return drafts

    # Collect IDs
    user_ids = list(set(d['user_id'] for d in drafts if d.get('user_id')))
    task_ids = list(set(d['user_quest_task_id'] for d in drafts if d.get('user_quest_task_id')))
    quest_ids = list(set(d['quest_id'] for d in drafts if d.get('quest_id')))

    # Fetch users
    users_map = {}
    if user_ids:
        users_result = supabase.table('users')\
            .select('id, display_name, email, avatar_url')\
            .in_('id', user_ids)\
            .execute()
        users_map = {u['id']: u for u in users_result.data}

    # Fetch tasks
    tasks_map = {}
    if task_ids:
        tasks_result = supabase.table('user_quest_tasks')\
            .select('id, title, description, pillar, xp_value, diploma_subjects, subject_xp_distribution')\
            .in_('id', task_ids)\
            .execute()
        tasks_map = {t['id']: t for t in tasks_result.data}

    # Fetch quests
    quests_map = {}
    if quest_ids:
        quests_result = supabase.table('quests')\
            .select('id, title')\
            .in_('id', quest_ids)\
            .execute()
        quests_map = {q['id']: q for q in quests_result.data}

    # Attach to drafts
    for draft in drafts:
        draft['users'] = users_map.get(draft.get('user_id'), {})
        draft['user_quest_tasks'] = tasks_map.get(draft.get('user_quest_task_id'), {})
        draft['quests'] = quests_map.get(draft.get('quest_id'), {})

    return drafts


@bp.route('/pending', methods=['GET'])
@require_superadmin
def get_pending_drafts(user_id: str):
    """
    Get all task completions awaiting feedback (diploma_status = 'draft').
    """
    try:
        supabase = get_supabase_admin_client()

        limit = min(int(request.args.get('limit', 50)), 100)
        offset = int(request.args.get('offset', 0))
        sort_order = request.args.get('sort', 'oldest')

        # Get drafts awaiting review
        query = supabase.table('quest_task_completions')\
            .select('*')\
            .eq('diploma_status', 'draft')\
            .range(offset, offset + limit - 1)

        # Apply sort order
        if sort_order == 'newest':
            query = query.order('completed_at', desc=True)
        else:
            query = query.order('completed_at', desc=False)

        result = query.execute()

        # Enrich with related data
        drafts = enrich_drafts_with_relations(supabase, result.data or [])

        # Get feedback counts for each draft
        draft_ids = [d['id'] for d in drafts]
        feedback_counts = {}

        if draft_ids:
            feedback_result = supabase.table('task_feedback')\
                .select('completion_id')\
                .in_('completion_id', draft_ids)\
                .execute()

            for fb in feedback_result.data:
                cid = fb['completion_id']
                feedback_counts[cid] = feedback_counts.get(cid, 0) + 1

        # Add feedback count to each draft
        for draft in drafts:
            draft['feedback_count'] = feedback_counts.get(draft['id'], 0)

        return success_response(data={
            'drafts': drafts,
            'total': len(drafts),
            'limit': limit,
            'offset': offset
        })

    except Exception as e:
        logger.error(f"Error fetching pending drafts: {str(e)}")
        return error_response(
            code='FETCH_ERROR',
            message='Failed to fetch pending drafts',
            status=500
        )


@bp.route('/ready-for-student', methods=['GET'])
@require_superadmin
def get_drafts_ready_for_student(user_id: str):
    """
    Get all drafts marked as ready for credit (awaiting student finalization).
    """
    try:
        supabase = get_supabase_admin_client()

        limit = min(int(request.args.get('limit', 50)), 100)
        offset = int(request.args.get('offset', 0))

        result = supabase.table('quest_task_completions')\
            .select('*')\
            .eq('diploma_status', 'ready_for_credit')\
            .order('ready_suggested_at', desc=True)\
            .range(offset, offset + limit - 1)\
            .execute()

        # Enrich with related data
        drafts = enrich_drafts_with_relations(supabase, result.data or [])

        return success_response(data={
            'drafts': drafts,
            'total': len(drafts)
        })

    except Exception as e:
        logger.error(f"Error fetching ready drafts: {str(e)}")
        return error_response(
            code='FETCH_ERROR',
            message='Failed to fetch ready drafts',
            status=500
        )


@bp.route('/<completion_id>', methods=['GET'])
@require_superadmin
def get_draft_details(user_id: str, completion_id: str):
    """
    Get detailed draft information including full feedback history.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get completion details
        completion = supabase.table('quest_task_completions')\
            .select('*')\
            .eq('id', completion_id)\
            .single()\
            .execute()

        if not completion.data:
            return error_response(
                code='NOT_FOUND',
                message='Draft not found',
                status=404
            )

        # Enrich with related data
        drafts = enrich_drafts_with_relations(supabase, [completion.data])
        result = drafts[0] if drafts else completion.data

        # Get feedback history
        feedback = supabase.table('task_feedback')\
            .select('id, feedback_text, revision_number, created_at, reviewer_id')\
            .eq('completion_id', completion_id)\
            .order('created_at', desc=False)\
            .execute()

        # Get reviewer names
        reviewer_ids = list(set(f['reviewer_id'] for f in feedback.data if f.get('reviewer_id')))
        reviewers_map = {}
        if reviewer_ids:
            reviewers = supabase.table('users')\
                .select('id, display_name')\
                .in_('id', reviewer_ids)\
                .execute()
            reviewers_map = {r['id']: r for r in reviewers.data}

        # Attach reviewer info to feedback
        for fb in feedback.data:
            fb['users'] = reviewers_map.get(fb.get('reviewer_id'), {})

        result['feedback_history'] = feedback.data

        return success_response(data=result)

    except Exception as e:
        logger.error(f"Error fetching draft details: {str(e)}")
        return error_response(
            code='FETCH_ERROR',
            message='Failed to fetch draft details',
            status=500
        )


@bp.route('/<completion_id>/feedback', methods=['POST'])
@require_superadmin
def add_feedback(user_id: str, completion_id: str):
    """
    Add feedback to a draft submission.
    """
    try:
        supabase = get_supabase_admin_client()

        data = request.get_json()
        if not data:
            return error_response(
                code='VALIDATION_ERROR',
                message='Request body is required',
                status=400
            )

        feedback_text = data.get('feedback_text', '').strip()
        if not feedback_text:
            return error_response(
                code='VALIDATION_ERROR',
                message='Feedback text is required',
                status=400
            )

        # Get the completion to verify it exists and get revision number
        completion = supabase.table('quest_task_completions')\
            .select('id, user_id, revision_number, diploma_status, user_quest_task_id')\
            .eq('id', completion_id)\
            .single()\
            .execute()

        if not completion.data:
            return error_response(
                code='NOT_FOUND',
                message='Draft not found',
                status=404
            )

        completion_data = completion.data

        if completion_data['diploma_status'] == 'finalized':
            return error_response(
                code='INVALID_STATE',
                message='Cannot add feedback to finalized tasks',
                status=400
            )

        # Create feedback record
        feedback_record = supabase.table('task_feedback').insert({
            'completion_id': completion_id,
            'reviewer_id': user_id,
            'feedback_text': feedback_text,
            'revision_number': completion_data.get('revision_number', 1)
        }).execute()

        # Update the task with latest feedback
        supabase.table('user_quest_tasks').update({
            'latest_feedback': feedback_text,
            'feedback_at': datetime.utcnow().isoformat()
        }).eq('id', completion_data['user_quest_task_id']).execute()

        # Update completion with reviewer info
        supabase.table('quest_task_completions').update({
            'reviewed_by': user_id,
            'reviewed_at': datetime.utcnow().isoformat()
        }).eq('id', completion_id).execute()

        logger.info(f"Superadmin {user_id[:8]} added feedback to completion {completion_id[:8]}")

        return success_response(
            data=feedback_record.data[0] if feedback_record.data else None,
            message='Feedback added successfully'
        )

    except Exception as e:
        logger.error(f"Error adding feedback: {str(e)}")
        return error_response(
            code='FEEDBACK_ERROR',
            message='Failed to add feedback',
            status=500
        )


@bp.route('/<completion_id>/suggest-ready', methods=['PUT'])
@require_superadmin
def suggest_ready_for_credit(user_id: str, completion_id: str):
    """
    Mark a draft as ready for diploma credit.
    """
    try:
        supabase = get_supabase_admin_client()

        data = request.get_json() or {}
        feedback_text = data.get('feedback_text', '').strip()
        fast_track = data.get('fast_track', False)

        # Get the completion
        completion = supabase.table('quest_task_completions')\
            .select('id, user_id, revision_number, diploma_status, xp_awarded, user_quest_task_id')\
            .eq('id', completion_id)\
            .single()\
            .execute()

        if not completion.data:
            return error_response(
                code='NOT_FOUND',
                message='Draft not found',
                status=404
            )

        completion_data = completion.data

        if completion_data['diploma_status'] == 'finalized':
            return error_response(
                code='INVALID_STATE',
                message='Task already finalized',
                status=400
            )

        # Get task data for subject XP
        task_result = supabase.table('user_quest_tasks')\
            .select('diploma_subjects, subject_xp_distribution, xp_value')\
            .eq('id', completion_data['user_quest_task_id'])\
            .single()\
            .execute()

        task_data = task_result.data or {}

        # Add optional feedback
        if feedback_text:
            supabase.table('task_feedback').insert({
                'completion_id': completion_id,
                'reviewer_id': user_id,
                'feedback_text': feedback_text,
                'revision_number': completion_data.get('revision_number', 1)
            }).execute()

        now = datetime.utcnow().isoformat()

        if fast_track:
            # Fast track: directly finalize without student confirmation
            subject_xp_distribution = task_data.get('subject_xp_distribution', {})

            if not subject_xp_distribution:
                diploma_subjects = task_data.get('diploma_subjects')
                task_xp = task_data.get('xp_value') or completion_data.get('xp_awarded', 0)

                if diploma_subjects:
                    if isinstance(diploma_subjects, dict):
                        for subject, percentage in diploma_subjects.items():
                            if isinstance(percentage, (int, float)) and percentage > 0:
                                subject_xp = int(task_xp * percentage / 100)
                                if subject_xp > 0:
                                    subject_xp_distribution[subject] = subject_xp
                    elif isinstance(diploma_subjects, list) and diploma_subjects:
                        per_subject_xp = task_xp // len(diploma_subjects)
                        for subject in diploma_subjects:
                            if per_subject_xp > 0:
                                subject_xp_distribution[subject] = per_subject_xp

            # Award subject XP directly (finalized)
            student_id = completion_data['user_id']
            SUBJECT_NORMALIZATION = {
                'Electives': 'electives', 'Language Arts': 'language_arts', 'Math': 'math',
                'Mathematics': 'math', 'Science': 'science', 'Social Studies': 'social_studies',
                'Financial Literacy': 'financial_literacy', 'Health': 'health', 'PE': 'pe',
                'Physical Education': 'pe', 'Fine Arts': 'fine_arts', 'Arts': 'fine_arts',
                'CTE': 'cte', 'Career & Technical Education': 'cte',
                'Digital Literacy': 'digital_literacy', 'Technology': 'digital_literacy',
                'Business': 'cte', 'Music': 'fine_arts', 'Communication': 'language_arts'
            }

            for subject, subject_xp in subject_xp_distribution.items():
                normalized = SUBJECT_NORMALIZATION.get(subject, subject.lower().replace(' ', '_'))

                existing = supabase.table('user_subject_xp')\
                    .select('id, xp_amount')\
                    .eq('user_id', student_id)\
                    .eq('school_subject', normalized)\
                    .execute()

                if existing.data:
                    new_total = existing.data[0]['xp_amount'] + subject_xp
                    supabase.table('user_subject_xp')\
                        .update({'xp_amount': new_total, 'updated_at': now})\
                        .eq('id', existing.data[0]['id'])\
                        .execute()
                else:
                    supabase.table('user_subject_xp').insert({
                        'user_id': student_id,
                        'school_subject': normalized,
                        'xp_amount': subject_xp,
                        'pending_xp': 0,
                        'updated_at': now
                    }).execute()

            # Update completion as finalized
            result = supabase.table('quest_task_completions').update({
                'diploma_status': 'finalized',
                'reviewed_by': user_id,
                'reviewed_at': now,
                'ready_suggested_at': now,
                'finalized_at': now
            }).eq('id', completion_id).execute()

            logger.info(f"Superadmin {user_id[:8]} fast-tracked completion {completion_id[:8]} to finalized")
            message = 'Task fast-tracked and finalized for diploma credit'
        else:
            # Normal flow: mark as ready, student will finalize
            result = supabase.table('quest_task_completions').update({
                'diploma_status': 'ready_for_credit',
                'reviewed_by': user_id,
                'reviewed_at': now,
                'ready_suggested_at': now
            }).eq('id', completion_id).execute()

            logger.info(f"Superadmin {user_id[:8]} marked completion {completion_id[:8]} ready for credit")
            message = 'Draft marked ready for diploma credit'

        # Update the task record
        supabase.table('user_quest_tasks').update({
            'latest_feedback': feedback_text if feedback_text else 'Ready for diploma credit!',
            'feedback_at': now
        }).eq('id', completion_data['user_quest_task_id']).execute()

        return success_response(
            data=result.data[0] if result.data else None,
            message=message
        )

    except Exception as e:
        logger.error(f"Error suggesting ready for credit: {str(e)}")
        return error_response(
            code='UPDATE_ERROR',
            message='Failed to update draft status',
            status=500
        )


@bp.route('/stats', methods=['GET'])
@require_superadmin
def get_draft_stats(user_id: str):
    """
    Get dashboard statistics for draft management.
    """
    try:
        supabase = get_supabase_admin_client()

        # Get pending drafts count
        pending = supabase.table('quest_task_completions')\
            .select('id', count='exact')\
            .eq('diploma_status', 'draft')\
            .execute()

        # Get ready for student count
        ready = supabase.table('quest_task_completions')\
            .select('id', count='exact')\
            .eq('diploma_status', 'ready_for_credit')\
            .execute()

        # Get finalized today
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        finalized = supabase.table('quest_task_completions')\
            .select('id', count='exact')\
            .eq('diploma_status', 'finalized')\
            .gte('finalized_at', today_start.isoformat())\
            .execute()

        # Get total feedback count
        feedback_count = supabase.table('task_feedback')\
            .select('id', count='exact')\
            .execute()

        return success_response(data={
            'pending_drafts': pending.count or 0,
            'ready_for_student': ready.count or 0,
            'finalized_today': finalized.count or 0,
            'total_feedback_given': feedback_count.count or 0
        })

    except Exception as e:
        logger.error(f"Error fetching draft stats: {str(e)}")
        return error_response(
            code='FETCH_ERROR',
            message='Failed to fetch stats',
            status=500
        )
