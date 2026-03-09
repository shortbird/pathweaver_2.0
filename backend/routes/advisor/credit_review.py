"""
Advisor Credit Review Routes

Endpoints for advisors to review and approve/return student diploma credit requests.
Part of the student-initiated, advisor-reviewed diploma credit approval flow.

Endpoints:
- GET  /api/advisor/credit-queue                     - All pending reviews for advisor's students
- GET  /api/advisor/credit-queue/<completion_id>      - Full detail for one review item
- POST /api/advisor/credit-queue/<completion_id>/approve   - Approve credit
- POST /api/advisor/credit-queue/<completion_id>/grow-this - Return with feedback
- GET  /api/advisor/students/<student_id>/subject-xp       - Student's current subject XP
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client, get_supabase_admin_singleton
from utils.auth.decorators import require_advisor
from utils.api_response_v1 import success_response, error_response
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('advisor_credit_review', __name__, url_prefix='/api/advisor')


def verify_advisor_for_completion(admin_supabase, advisor_id, completion_id):
    """
    Verify that the advisor is assigned to the student who owns this completion.
    Returns (completion_data, student_id) or raises ValueError.
    """
    # Get completion
    completion = admin_supabase.table('quest_task_completions')\
        .select('id, user_id, quest_id, diploma_status, revision_number, user_quest_task_id, credit_requested_at')\
        .eq('id', completion_id)\
        .single()\
        .execute()

    if not completion.data:
        raise ValueError('Completion not found')

    student_id = completion.data['user_id']

    # Check if superadmin (universal access)
    user_result = admin_supabase.table('users')\
        .select('role')\
        .eq('id', advisor_id)\
        .single()\
        .execute()

    if user_result.data and user_result.data.get('role') == 'superadmin':
        return completion.data, student_id

    # Verify advisor assignment
    assignment = admin_supabase.table('advisor_student_assignments')\
        .select('id')\
        .eq('advisor_id', advisor_id)\
        .eq('student_id', student_id)\
        .eq('is_active', True)\
        .execute()

    if not assignment.data:
        raise PermissionError('Not authorized to review this student')

    return completion.data, student_id


@bp.route('/credit-queue', methods=['GET'])
@require_advisor
def get_credit_queue(user_id: str):
    """
    Get all pending credit reviews for the advisor's assigned students.
    Superadmins see all pending reviews.
    """
    try:
        admin_supabase = get_supabase_admin_singleton()

        # Always filter by assigned students (even for superadmins)
        assignments = admin_supabase.table('advisor_student_assignments')\
            .select('student_id')\
            .eq('advisor_id', user_id)\
            .eq('is_active', True)\
            .execute()

        student_ids = [a['student_id'] for a in assignments.data] if assignments.data else []

        if not student_ids:
            return success_response(data={'queue': [], 'total_pending': 0})

        completions = admin_supabase.table('quest_task_completions')\
            .select('id, user_id, quest_id, diploma_status, revision_number, user_quest_task_id, credit_requested_at')\
            .eq('diploma_status', 'pending_review')\
            .in_('user_id', student_ids)\
            .execute()

        if not completions.data:
            return success_response(data={'queue': [], 'total_pending': 0})

        # Enrich with student, task, quest data
        student_ids = list(set(c['user_id'] for c in completions.data))
        task_ids = list(set(c['user_quest_task_id'] for c in completions.data if c.get('user_quest_task_id')))
        quest_ids = list(set(c['quest_id'] for c in completions.data if c.get('quest_id')))
        completion_ids = [c['id'] for c in completions.data]

        # Students
        students_map = {}
        if student_ids:
            students = admin_supabase.table('users')\
                .select('id, display_name, email, avatar_url')\
                .in_('id', student_ids)\
                .execute()
            students_map = {s['id']: s for s in students.data}

        # Tasks
        tasks_map = {}
        if task_ids:
            tasks = admin_supabase.table('user_quest_tasks')\
                .select('id, title, pillar, xp_value, diploma_subjects, subject_xp_distribution')\
                .in_('id', task_ids)\
                .execute()
            tasks_map = {t['id']: t for t in tasks.data}

        # Quests
        quests_map = {}
        if quest_ids:
            quests = admin_supabase.table('quests')\
                .select('id, title')\
                .in_('id', quest_ids)\
                .execute()
            quests_map = {q['id']: q for q in quests.data}

        # Evidence block counts - batch query (2 queries total instead of 2 per item)
        evidence_counts = {}
        if task_ids:
            from collections import Counter

            # 1) Get all evidence documents for these tasks at once
            all_docs = admin_supabase.table('user_task_evidence_documents')\
                .select('id, task_id, user_id')\
                .in_('task_id', task_ids)\
                .execute()

            # Map (task_id, user_id) -> doc_id
            doc_map = {}
            for d in (all_docs.data or []):
                doc_map[(d['task_id'], d['user_id'])] = d['id']

            doc_ids = list(doc_map.values())
            block_counts = Counter()

            if doc_ids:
                # 2) Get all blocks for those documents at once
                all_blocks = admin_supabase.table('evidence_document_blocks')\
                    .select('document_id')\
                    .in_('document_id', doc_ids)\
                    .execute()
                block_counts = Counter(b['document_id'] for b in (all_blocks.data or []))

            # Map back to completion_id
            for c in completions.data:
                tid = c.get('user_quest_task_id')
                uid = c.get('user_id')
                doc_id = doc_map.get((tid, uid))
                if doc_id:
                    evidence_counts[c['id']] = block_counts.get(doc_id, 0)

        # Build response
        from routes.tasks import get_subject_xp_distribution
        queue = []
        for c in completions.data:
            student = students_map.get(c['user_id'], {})
            task = tasks_map.get(c.get('user_quest_task_id'), {})
            quest = quests_map.get(c.get('quest_id'), {})

            xp_value = task.get('xp_value', 0)
            subjects = get_subject_xp_distribution(task, xp_value) if task else {}

            queue.append({
                'completion_id': c['id'],
                'student_id': c['user_id'],
                'student_name': student.get('display_name', 'Unknown'),
                'student_avatar': student.get('avatar_url'),
                'task_id': c.get('user_quest_task_id'),
                'task_title': task.get('title', 'Unknown Task'),
                'quest_title': quest.get('title', 'Unknown Quest'),
                'pillar': task.get('pillar'),
                'xp_value': xp_value,
                'suggested_subjects': subjects,
                'revision_number': c.get('revision_number', 1),
                'submitted_at': c.get('credit_requested_at'),
                'evidence_block_count': evidence_counts.get(c['id'], 0)
            })

        return success_response(data={
            'queue': queue,
            'total_pending': len(queue)
        })

    except Exception as e:
        logger.error(f"Error fetching credit queue for advisor {user_id}: {str(e)}")
        return error_response(
            code='FETCH_ERROR',
            message='Failed to fetch credit review queue',
            status=500
        )


@bp.route('/credit-queue/<completion_id>', methods=['GET'])
@require_advisor
def get_credit_review_detail(user_id: str, completion_id: str):
    """
    Get full detail for a credit review item including evidence and review history.
    """
    try:
        admin_supabase = get_supabase_admin_singleton()

        try:
            completion_data, student_id = verify_advisor_for_completion(admin_supabase, user_id, completion_id)
        except ValueError:
            return error_response(code='NOT_FOUND', message='Completion not found', status=404)
        except PermissionError:
            return error_response(code='FORBIDDEN', message='Not authorized', status=403)

        # Get task data
        task_data = {}
        if completion_data.get('user_quest_task_id'):
            task_result = admin_supabase.table('user_quest_tasks')\
                .select('id, title, description, pillar, xp_value, diploma_subjects, subject_xp_distribution')\
                .eq('id', completion_data['user_quest_task_id'])\
                .single()\
                .execute()
            task_data = task_result.data or {}

        # Get quest
        quest_data = {}
        if completion_data.get('quest_id'):
            quest_result = admin_supabase.table('quests')\
                .select('id, title')\
                .eq('id', completion_data['quest_id'])\
                .single()\
                .execute()
            quest_data = quest_result.data or {}

        # Get student info
        student = admin_supabase.table('users')\
            .select('id, display_name, email, avatar_url')\
            .eq('id', student_id)\
            .single()\
            .execute()

        # Get evidence blocks (linked via document_id through user_task_evidence_documents)
        evidence_blocks_data = []
        task_id_for_evidence = completion_data.get('user_quest_task_id', '')
        if task_id_for_evidence:
            doc_result = admin_supabase.table('user_task_evidence_documents')\
                .select('id')\
                .eq('task_id', task_id_for_evidence)\
                .eq('user_id', student_id)\
                .limit(1)\
                .execute()
            if doc_result.data:
                evidence_blocks_result = admin_supabase.table('evidence_document_blocks')\
                    .select('*')\
                    .eq('document_id', doc_result.data[0]['id'])\
                    .order('order_index')\
                    .execute()
                evidence_blocks_data = evidence_blocks_result.data or []

        # Get review rounds
        rounds = admin_supabase.table('diploma_review_rounds')\
            .select('*')\
            .eq('completion_id', completion_id)\
            .order('round_number')\
            .execute()

        # Get subject XP distribution
        from routes.tasks import get_subject_xp_distribution
        xp_value = task_data.get('xp_value', 0)
        subjects = get_subject_xp_distribution(task_data, xp_value) if task_data else {}

        # Get student's current subject XP for context
        student_subject_xp = admin_supabase.table('user_subject_xp')\
            .select('school_subject, xp_amount, pending_xp')\
            .eq('user_id', student_id)\
            .execute()

        return success_response(data={
            'completion': completion_data,
            'task': task_data,
            'quest': quest_data,
            'student': student.data,
            'evidence_blocks': evidence_blocks_data,
            'review_rounds': rounds.data or [],
            'suggested_subjects': subjects,
            'student_subject_xp': student_subject_xp.data or []
        })

    except Exception as e:
        logger.error(f"Error fetching credit review detail: {str(e)}")
        return error_response(
            code='FETCH_ERROR',
            message='Failed to fetch review detail',
            status=500
        )


@bp.route('/credit-queue/<completion_id>/approve', methods=['POST'])
@require_advisor
def approve_credit(user_id: str, completion_id: str):
    """
    Approve diploma credit for a student's task.
    Moves subject XP from pending to finalized.
    """
    try:
        admin_supabase = get_supabase_admin_singleton()
        data = request.get_json() or {}

        try:
            completion_data, student_id = verify_advisor_for_completion(admin_supabase, user_id, completion_id)
        except ValueError:
            return error_response(code='NOT_FOUND', message='Completion not found', status=404)
        except PermissionError:
            return error_response(code='FORBIDDEN', message='Not authorized', status=403)

        if completion_data['diploma_status'] != 'pending_review':
            return error_response(
                code='INVALID_STATE',
                message=f'Cannot approve: current status is {completion_data["diploma_status"]}',
                status=400
            )

        # Get task data for subject distribution
        task_result = admin_supabase.table('user_quest_tasks')\
            .select('title, diploma_subjects, subject_xp_distribution, xp_value')\
            .eq('id', completion_data['user_quest_task_id'])\
            .single()\
            .execute()

        task_data = task_result.data or {}
        xp_value = task_data.get('xp_value', 0)

        # Use advisor-overridden subjects if provided, otherwise use task suggestion
        from routes.tasks import get_subject_xp_distribution, finalize_subject_xp, remove_pending_subject_xp
        override_subjects = data.get('subjects')
        if override_subjects and isinstance(override_subjects, dict):
            # Advisor overrode the distribution
            approved_subjects = override_subjects
        else:
            approved_subjects = get_subject_xp_distribution(task_data, xp_value)

        feedback = data.get('feedback', '').strip()
        now = datetime.utcnow().isoformat()

        # Update the latest review round
        latest_round = admin_supabase.table('diploma_review_rounds')\
            .select('id')\
            .eq('completion_id', completion_id)\
            .order('round_number', desc=True)\
            .limit(1)\
            .execute()

        if latest_round.data:
            admin_supabase.table('diploma_review_rounds').update({
                'reviewer_id': user_id,
                'reviewer_action': 'approved',
                'reviewer_feedback': feedback if feedback else None,
                'approved_subjects': approved_subjects,
                'reviewed_at': now
            }).eq('id', latest_round.data[0]['id']).execute()

        # First remove pending XP (the amount added at request time),
        # then finalize with the approved amount
        original_subjects = get_subject_xp_distribution(task_data, xp_value)
        try:
            remove_pending_subject_xp(admin_supabase, student_id, original_subjects)
        except Exception as e:
            logger.warning(f"Could not remove pending XP before finalizing: {e}")

        total_xp_finalized = finalize_subject_xp(admin_supabase, student_id, approved_subjects)

        # Update completion (also set accreditor_status for accreditor review pipeline)
        admin_supabase.table('quest_task_completions').update({
            'diploma_status': 'approved',
            'credit_reviewer_id': user_id,
            'finalized_at': now,
            'accreditor_status': 'pending_accreditor'
        }).eq('id', completion_id).execute()

        # Clear task-level feedback notification
        if completion_data.get('user_quest_task_id'):
            admin_supabase.table('user_quest_tasks').update({
                'latest_feedback': feedback if feedback else 'Diploma credit approved!',
                'feedback_at': now
            }).eq('id', completion_data['user_quest_task_id']).execute()

        # Notify student - link to the quest page with task selected
        try:
            from services.notification_service import NotificationService
            notification_service = NotificationService()
            quest_id = completion_data.get('quest_id', '')
            task_id_for_link = completion_data.get('user_quest_task_id', '')
            notification_link = f'/quests/{quest_id}?task={task_id_for_link}' if quest_id else '/dashboard'
            notification_service.create_notification(
                user_id=student_id,
                notification_type='diploma_credit_approved',
                title='Diploma Credit Approved',
                message=f'Your diploma credit for "{task_data.get("title", "a task")}" has been approved! {total_xp_finalized} subject XP earned.',
                link=notification_link,
                metadata={
                    'task_id': completion_data.get('user_quest_task_id'),
                    'completion_id': completion_id,
                    'xp_finalized': total_xp_finalized
                }
            )
        except Exception as notify_err:
            logger.warning(f"Failed to notify student of credit approval: {notify_err}")

        logger.info(f"Advisor {user_id[:8]} approved credit for completion {completion_id[:8]}, {total_xp_finalized} XP finalized")

        return success_response(
            data={
                'success': True,
                'completion_id': completion_id,
                'diploma_status': 'approved',
                'approved_subjects': approved_subjects,
                'xp_finalized': total_xp_finalized
            }
        )

    except Exception as e:
        logger.error(f"Error approving credit {completion_id}: {str(e)}")
        return error_response(
            code='APPROVE_ERROR',
            message='Failed to approve diploma credit',
            status=500
        )


@bp.route('/credit-queue/<completion_id>/grow-this', methods=['POST'])
@require_advisor
def grow_this(user_id: str, completion_id: str):
    """
    Return a credit request with feedback ("Grow This").
    Removes pending subject XP and notifies student.
    """
    try:
        admin_supabase = get_supabase_admin_singleton()
        data = request.get_json() or {}

        feedback = data.get('feedback', '').strip()
        if not feedback:
            return error_response(
                code='VALIDATION_ERROR',
                message='Feedback is required when returning work for revision',
                status=400
            )

        try:
            completion_data, student_id = verify_advisor_for_completion(admin_supabase, user_id, completion_id)
        except ValueError:
            return error_response(code='NOT_FOUND', message='Completion not found', status=404)
        except PermissionError:
            return error_response(code='FORBIDDEN', message='Not authorized', status=403)

        if completion_data['diploma_status'] != 'pending_review':
            return error_response(
                code='INVALID_STATE',
                message=f'Cannot return: current status is {completion_data["diploma_status"]}',
                status=400
            )

        now = datetime.utcnow().isoformat()

        # Update the latest review round
        latest_round = admin_supabase.table('diploma_review_rounds')\
            .select('id')\
            .eq('completion_id', completion_id)\
            .order('round_number', desc=True)\
            .limit(1)\
            .execute()

        if latest_round.data:
            admin_supabase.table('diploma_review_rounds').update({
                'reviewer_id': user_id,
                'reviewer_action': 'grow_this',
                'reviewer_feedback': feedback,
                'reviewed_at': now
            }).eq('id', latest_round.data[0]['id']).execute()

        # Remove pending subject XP
        task_result = admin_supabase.table('user_quest_tasks')\
            .select('title, diploma_subjects, subject_xp_distribution, xp_value')\
            .eq('id', completion_data['user_quest_task_id'])\
            .single()\
            .execute()

        task_data = task_result.data or {}
        xp_value = task_data.get('xp_value', 0)

        from routes.tasks import get_subject_xp_distribution, remove_pending_subject_xp
        subjects = get_subject_xp_distribution(task_data, xp_value)
        try:
            remove_pending_subject_xp(admin_supabase, student_id, subjects)
        except Exception as xp_err:
            logger.error(f"Failed to remove pending XP on grow-this: {xp_err}")

        # Update completion
        admin_supabase.table('quest_task_completions').update({
            'diploma_status': 'grow_this',
            'credit_reviewer_id': user_id
        }).eq('id', completion_id).execute()

        # Update task with feedback
        if completion_data.get('user_quest_task_id'):
            admin_supabase.table('user_quest_tasks').update({
                'latest_feedback': feedback,
                'feedback_at': now
            }).eq('id', completion_data['user_quest_task_id']).execute()

        # Notify student - link to the quest page with task selected
        try:
            from services.notification_service import NotificationService
            notification_service = NotificationService()
            quest_id = completion_data.get('quest_id', '')
            task_id_for_link = completion_data.get('user_quest_task_id', '')
            notification_link = f'/quests/{quest_id}?task={task_id_for_link}' if quest_id else '/dashboard'
            notification_service.create_notification(
                user_id=student_id,
                notification_type='diploma_credit_grow_this',
                title='Grow This: Advisor Feedback',
                message=f'Your advisor has feedback on "{task_data.get("title", "a task")}". Review and resubmit when ready.',
                link=notification_link,
                metadata={
                    'task_id': completion_data.get('user_quest_task_id'),
                    'completion_id': completion_id,
                    'feedback': feedback
                }
            )
        except Exception as notify_err:
            logger.warning(f"Failed to notify student of grow-this: {notify_err}")

        logger.info(f"Advisor {user_id[:8]} returned credit {completion_id[:8]} with feedback")

        return success_response(
            data={
                'success': True,
                'completion_id': completion_id,
                'diploma_status': 'grow_this',
                'feedback': feedback
            }
        )

    except Exception as e:
        logger.error(f"Error returning credit {completion_id}: {str(e)}")
        return error_response(
            code='GROW_THIS_ERROR',
            message='Failed to return work for revision',
            status=500
        )


@bp.route('/students/<student_id>/subject-xp', methods=['GET'])
@require_advisor
def get_student_subject_xp(user_id: str, student_id: str):
    """
    Get a student's current subject XP breakdown (finalized + pending).
    """
    try:
        admin_supabase = get_supabase_admin_singleton()

        # Verify access
        user_result = admin_supabase.table('users')\
            .select('role')\
            .eq('id', user_id)\
            .single()\
            .execute()

        is_superadmin = user_result.data and user_result.data.get('role') == 'superadmin'

        if not is_superadmin:
            assignment = admin_supabase.table('advisor_student_assignments')\
                .select('id')\
                .eq('advisor_id', user_id)\
                .eq('student_id', student_id)\
                .eq('is_active', True)\
                .execute()

            if not assignment.data:
                return error_response(code='FORBIDDEN', message='Not authorized', status=403)

        subject_xp = admin_supabase.table('user_subject_xp')\
            .select('school_subject, xp_amount, pending_xp')\
            .eq('user_id', student_id)\
            .execute()

        return success_response(data={
            'student_id': student_id,
            'subject_xp': subject_xp.data or []
        })

    except Exception as e:
        logger.error(f"Error fetching subject XP for student {student_id}: {str(e)}")
        return error_response(
            code='FETCH_ERROR',
            message='Failed to fetch subject XP',
            status=500
        )
