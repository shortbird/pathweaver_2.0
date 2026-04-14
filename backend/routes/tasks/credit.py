"""Diploma-credit endpoints (status, request, history, my-requests).

Split from ``routes/tasks.py`` on 2026-04-14.
"""

from datetime import datetime

from database import get_supabase_admin_client
from routes.tasks import bp
from routes.tasks.xp_helpers import (
    add_pending_subject_xp,
    get_subject_xp_distribution,
)
from utils.api_response_v1 import error_response, success_response
from utils.auth.decorators import require_auth
from utils.logger import get_logger

logger = get_logger(__name__)


@bp.route('/<task_id>/credit-status', methods=['GET'])
@require_auth
def get_credit_status(user_id: str, task_id: str):
    """Get the diploma credit status for a completed task."""
    try:
        # admin client justified: task CRUD writes scoped to caller (self) under @require_auth; cross-user only after parent/advisor relationship verification
        admin_supabase = get_supabase_admin_client()
        completion = admin_supabase.table('quest_task_completions')\
            .select('diploma_status')\
            .eq('user_quest_task_id', task_id)\
            .eq('user_id', user_id)\
            .single()\
            .execute()

        if not completion.data:
            return success_response(data={'has_completion': False, 'diploma_status': None})

        return success_response(data={
            'has_completion': True,
            'diploma_status': completion.data['diploma_status']
        })
    except Exception as e:
        logger.error(f"Error getting credit status for task {task_id}: {str(e)}")
        return error_response(code='FETCH_ERROR', message='Failed to get credit status', status=500)


@bp.route('/<task_id>/request-credit', methods=['POST'])
@require_auth
def request_diploma_credit(user_id: str, task_id: str):
    """
    Request diploma credit for a completed task.
    Student-initiated flow: snapshots evidence, creates review round,
    adds subject XP to pending, notifies superadmin.

    Can be called on tasks with diploma_status 'none' or 'grow_this' (resubmit).
    """
    try:
        # admin client justified: task CRUD writes scoped to caller (self) under @require_auth; cross-user only after parent/advisor relationship verification
        admin_supabase = get_supabase_admin_client()

        # Get completion record
        completion = admin_supabase.table('quest_task_completions')\
            .select('id, user_id, quest_id, diploma_status, revision_number, user_quest_task_id')\
            .eq('user_quest_task_id', task_id)\
            .eq('user_id', user_id)\
            .single()\
            .execute()

        if not completion.data:
            return error_response(
                code='NOT_FOUND',
                message='No completion record found for this task. Complete the task first.',
                status=404
            )

        completion_data = completion.data

        # Verify eligible status
        if completion_data['diploma_status'] not in ('none', 'grow_this'):
            if completion_data['diploma_status'] in ('pending_review', 'pending_org_approval', 'pending_optio_approval'):
                return error_response(
                    code='ALREADY_PENDING',
                    message='Credit request is already pending review.',
                    status=400
                )
            if completion_data['diploma_status'] == 'approved':
                return error_response(
                    code='ALREADY_APPROVED',
                    message='Diploma credit has already been approved for this task.',
                    status=400
                )
            return error_response(
                code='INVALID_STATE',
                message=f'Cannot request credit in current state: {completion_data["diploma_status"]}',
                status=400
            )

        # Get task data for subject distribution
        task_result = admin_supabase.table('user_quest_tasks')\
            .select('title, diploma_subjects, subject_xp_distribution, xp_value, quest_id')\
            .eq('id', task_id)\
            .single()\
            .execute()

        if not task_result.data:
            return error_response(code='NOT_FOUND', message='Task not found', status=404)

        task_data = task_result.data
        xp_value = task_data.get('xp_value') or completion_data.get('xp_awarded', 0)

        subject_xp = get_subject_xp_distribution(task_data, xp_value)

        # Snapshot evidence blocks (blocks are linked via document_id)
        evidence_snapshot = []
        doc_result = admin_supabase.table('user_task_evidence_documents')\
            .select('id')\
            .eq('task_id', task_id)\
            .eq('user_id', user_id)\
            .limit(1)\
            .execute()

        if doc_result.data:
            doc_id = doc_result.data[0]['id']
            evidence_blocks = admin_supabase.table('evidence_document_blocks')\
                .select('*')\
                .eq('document_id', doc_id)\
                .order('order_index')\
                .execute()
            evidence_snapshot = evidence_blocks.data or []

        # Determine round number
        current_revision = completion_data.get('revision_number', 1) or 1
        is_resubmit = completion_data['diploma_status'] == 'grow_this'
        round_number = current_revision if is_resubmit else 1

        if is_resubmit:
            max_round = admin_supabase.table('diploma_review_rounds')\
                .select('round_number')\
                .eq('completion_id', completion_data['id'])\
                .order('round_number', desc=True)\
                .limit(1)\
                .execute()

            if max_round.data:
                round_number = max_round.data[0]['round_number'] + 1
            else:
                round_number = 1

        # Create review round
        now = datetime.utcnow().isoformat()
        admin_supabase.table('diploma_review_rounds').insert({
            'completion_id': completion_data['id'],
            'round_number': round_number,
            'evidence_snapshot': evidence_snapshot,
            'subject_suggestion': subject_xp if subject_xp else None,
            'submitted_at': now
        }).execute()

        # Check if student is in an organization (determines approval flow)
        student_user = admin_supabase.table('users')\
            .select('organization_id')\
            .eq('id', user_id)\
            .single()\
            .execute()
        student_org_id = student_user.data.get('organization_id') if student_user.data else None
        is_org_student = student_org_id is not None

        # Org students go to org_admin first; platform students go to superadmin
        new_diploma_status = 'pending_org_approval' if is_org_student else 'pending_review'

        # Update completion status
        new_revision = round_number
        admin_supabase.table('quest_task_completions').update({
            'diploma_status': new_diploma_status,
            'credit_requested_at': now,
            'revision_number': new_revision
        }).eq('id', completion_data['id']).execute()

        # Add subject XP to pending
        try:
            add_pending_subject_xp(admin_supabase, user_id, subject_xp)
        except Exception as xp_err:
            logger.error(f"Failed to add pending subject XP for credit request: {xp_err}")

        # Send notifications
        try:
            from services.notification_service import NotificationService

            student_result = admin_supabase.table('users')\
                .select('display_name, first_name, last_name, email')\
                .eq('id', user_id)\
                .single()\
                .execute()
            if student_result.data:
                student_name = (
                    student_result.data.get('display_name')
                    or f"{student_result.data.get('first_name', '')} {student_result.data.get('last_name', '')}".strip()
                    or student_result.data.get('email')
                    or 'A student'
                )
            else:
                student_name = 'A student'

            notification_service = NotificationService()

            if is_org_student:
                org_admins = admin_supabase.table('users')\
                    .select('id')\
                    .eq('organization_id', student_org_id)\
                    .eq('role', 'org_managed')\
                    .contains('org_roles', ['org_admin'])\
                    .execute()

                if not org_admins.data:
                    org_admins = admin_supabase.table('users')\
                        .select('id')\
                        .eq('organization_id', student_org_id)\
                        .eq('role', 'org_managed')\
                        .eq('org_role', 'org_admin')\
                        .execute()

                for oa in (org_admins.data or []):
                    notification_service.create_notification(
                        user_id=oa['id'],
                        notification_type='diploma_credit_requested',
                        title='Student Credit Request',
                        message=f'{student_name} requested diploma credit for "{task_data.get("title", "a task")}"',
                        link='/credit-dashboard',
                        metadata={
                            'student_id': user_id,
                            'task_id': task_id,
                            'completion_id': completion_data['id']
                        }
                    )
            else:
                superadmin_result = admin_supabase.table('users')\
                    .select('id')\
                    .eq('role', 'superadmin')\
                    .execute()

                for sa in (superadmin_result.data or []):
                    notification_service.create_notification(
                        user_id=sa['id'],
                        notification_type='diploma_credit_requested',
                        title='Diploma Credit Requested',
                        message=f'{student_name} requested diploma credit for "{task_data.get("title", "a task")}"',
                        link='/credit-dashboard',
                        metadata={
                            'student_id': user_id,
                            'task_id': task_id,
                            'completion_id': completion_data['id']
                        }
                    )
        except Exception as notify_err:
            logger.warning(f"Failed to send credit request notification: {notify_err}")

        review_message = (
            'Diploma credit requested. Your organization admin will review your work.'
            if is_org_student else
            'Diploma credit requested. Your advisor will review your work.'
        )
        logger.info(f"User {user_id[:8]} requested diploma credit for task {task_id[:8]} (round {round_number}, status={new_diploma_status})")

        return success_response(
            data={
                'success': True,
                'round_number': round_number,
                'diploma_status': new_diploma_status,
                'subjects': subject_xp,
                'completion_id': completion_data['id'],
                'message': review_message
            }
        )

    except Exception as e:
        logger.error(f"Error requesting diploma credit for task {task_id}: {str(e)}")
        return error_response(
            code='CREDIT_REQUEST_ERROR',
            message='Failed to request diploma credit',
            status=500
        )


@bp.route('/my-credit-requests', methods=['GET'])
@require_auth
def get_my_credit_requests(user_id: str):
    """
    Get all of the student's credit requests (completions with diploma_status != 'none').
    Powers the Diploma Credit Tracker on the student dashboard.
    """
    try:
        # admin client justified: task CRUD writes scoped to caller (self) under @require_auth; cross-user only after parent/advisor relationship verification
        admin_supabase = get_supabase_admin_client()

        completions = admin_supabase.table('quest_task_completions')\
            .select('id, user_quest_task_id, quest_id, diploma_status, revision_number, credit_requested_at, finalized_at, completed_at')\
            .eq('user_id', user_id)\
            .neq('diploma_status', 'none')\
            .order('credit_requested_at', desc=True)\
            .execute()

        if not completions.data:
            return success_response(data={'credit_requests': []})

        task_ids = list(set(c['user_quest_task_id'] for c in completions.data if c.get('user_quest_task_id')))
        quest_ids = list(set(c['quest_id'] for c in completions.data if c.get('quest_id')))
        completion_ids = [c['id'] for c in completions.data]

        tasks_map = {}
        if task_ids:
            tasks_result = admin_supabase.table('user_quest_tasks')\
                .select('id, title, pillar, xp_value, diploma_subjects, subject_xp_distribution')\
                .in_('id', task_ids)\
                .execute()
            tasks_map = {t['id']: t for t in tasks_result.data}

        quests_map = {}
        if quest_ids:
            quests_result = admin_supabase.table('quests')\
                .select('id, title')\
                .in_('id', quest_ids)\
                .execute()
            quests_map = {q['id']: q for q in quests_result.data}

        # Fetch latest review round for each completion (for feedback)
        latest_rounds = {}
        if completion_ids:
            rounds_result = admin_supabase.table('diploma_review_rounds')\
                .select('completion_id, reviewer_feedback, reviewer_action, reviewed_at, round_number')\
                .in_('completion_id', completion_ids)\
                .order('round_number', desc=True)\
                .execute()

            for r in rounds_result.data:
                cid = r['completion_id']
                if cid not in latest_rounds:
                    latest_rounds[cid] = r

        credit_requests = []
        for c in completions.data:
            task = tasks_map.get(c.get('user_quest_task_id'), {})
            quest = quests_map.get(c.get('quest_id'), {})
            latest_round = latest_rounds.get(c['id'], {})

            xp_value = task.get('xp_value') or c.get('xp_awarded', 0)
            subjects = get_subject_xp_distribution(task, xp_value) if task else {}

            credit_requests.append({
                'completion_id': c['id'],
                'task_id': c.get('user_quest_task_id'),
                'quest_id': c.get('quest_id'),
                'task_title': task.get('title', 'Unknown Task'),
                'quest_title': quest.get('title', 'Unknown Quest'),
                'pillar': task.get('pillar'),
                'xp_value': xp_value,
                'diploma_status': c['diploma_status'],
                'subjects': subjects,
                'revision_number': c.get('revision_number', 1),
                'credit_requested_at': c.get('credit_requested_at'),
                'latest_feedback': latest_round.get('reviewer_feedback'),
                'reviewed_at': latest_round.get('reviewed_at'),
                'finalized_at': c.get('finalized_at')
            })

        return success_response(data={'credit_requests': credit_requests})

    except Exception as e:
        logger.error(f"Error fetching credit requests for user {user_id}: {str(e)}")
        return error_response(
            code='FETCH_ERROR',
            message='Failed to fetch credit requests',
            status=500
        )


@bp.route('/<task_id>/credit-history', methods=['GET'])
@require_auth
def get_credit_history(user_id: str, task_id: str):
    """
    Get all diploma review rounds for a task completion.
    Shows the iteration trail: submissions, feedback, and approvals.
    Accessible by the task owner, assigned advisors, and superadmins.
    """
    try:
        # admin client justified: task CRUD writes scoped to caller (self) under @require_auth; cross-user only after parent/advisor relationship verification
        admin_supabase = get_supabase_admin_client()

        completion = admin_supabase.table('quest_task_completions')\
            .select('id, user_id, diploma_status, revision_number')\
            .eq('user_quest_task_id', task_id)\
            .execute()

        if not completion.data:
            return error_response(code='NOT_FOUND', message='No completion found', status=404)

        completion_data = completion.data[0]

        # Verify access: owner, assigned advisor, or superadmin
        is_owner = completion_data['user_id'] == user_id
        if not is_owner:
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
                    .eq('student_id', completion_data['user_id'])\
                    .eq('is_active', True)\
                    .execute()

                if not assignment.data:
                    return error_response(
                        code='FORBIDDEN',
                        message='You do not have access to this credit history',
                        status=403
                    )

        rounds = admin_supabase.table('diploma_review_rounds')\
            .select('*')\
            .eq('completion_id', completion_data['id'])\
            .order('round_number')\
            .execute()

        # Get reviewer names
        reviewer_ids = list(set(r['reviewer_id'] for r in rounds.data if r.get('reviewer_id')))
        reviewers_map = {}
        if reviewer_ids:
            reviewers = admin_supabase.table('users')\
                .select('id, display_name')\
                .in_('id', reviewer_ids)\
                .execute()
            reviewers_map = {r['id']: r['display_name'] for r in reviewers.data}

        for r in rounds.data:
            if r.get('reviewer_id'):
                r['reviewer_name'] = reviewers_map.get(r['reviewer_id'], 'Unknown')

        return success_response(data={
            'completion_id': completion_data['id'],
            'diploma_status': completion_data['diploma_status'],
            'revision_number': completion_data.get('revision_number', 1),
            'rounds': rounds.data
        })

    except Exception as e:
        logger.error(f"Error fetching credit history for task {task_id}: {str(e)}")
        return error_response(
            code='FETCH_ERROR',
            message='Failed to fetch credit history',
            status=500
        )
