"""
Credit Dashboard - Org Admin action endpoints.

Org admins review credit requests from students in their organization
before they are escalated to superadmin (Optio) for final approval.

Endpoints:
- POST /api/credit-dashboard/items/<completion_id>/org-approve    - Approve for Optio review
- POST /api/credit-dashboard/items/<completion_id>/org-grow-this  - Return to student with feedback
"""

from flask import request
from database import get_supabase_admin_singleton
from utils.auth.decorators import require_role
from utils.api_response_v1 import success_response, error_response
from utils.roles import get_effective_role
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

from . import bp


def verify_org_scope(admin_supabase, reviewer_id, student_id):
    """
    Verify the reviewer has org_admin access to the student's organization.
    Superadmins bypass org scoping.
    Returns the student's organization_id or raises an error.
    """
    reviewer = admin_supabase.table('users') \
        .select('role, organization_id') \
        .eq('id', reviewer_id) \
        .single() \
        .execute()

    if not reviewer.data:
        raise PermissionError('Reviewer not found')

    # Superadmin bypasses org scoping
    if reviewer.data.get('role') == 'superadmin':
        return None

    reviewer_org = reviewer.data.get('organization_id')

    student = admin_supabase.table('users') \
        .select('organization_id') \
        .eq('id', student_id) \
        .single() \
        .execute()

    if not student.data:
        raise ValueError('Student not found')

    student_org = student.data.get('organization_id')

    if not reviewer_org or not student_org or reviewer_org != student_org:
        raise PermissionError('Not authorized to review students outside your organization')

    return student_org


@bp.route('/items/<completion_id>/org-approve', methods=['POST'])
@require_role('org_admin', 'superadmin')
def org_approve_credit(user_id: str, completion_id: str):
    """Org admin approves a credit request, escalating it to Optio (superadmin) review."""
    try:
        admin_supabase = get_supabase_admin_singleton()
        data = request.get_json() or {}

        # Get completion
        completion = admin_supabase.table('quest_task_completions') \
            .select('id, user_id, quest_id, diploma_status, user_quest_task_id, credit_requested_at') \
            .eq('id', completion_id) \
            .single() \
            .execute()

        if not completion.data:
            return error_response(code='NOT_FOUND', message='Completion not found', status=404)

        if completion.data['diploma_status'] != 'pending_org_approval':
            return error_response(
                code='INVALID_STATE',
                message=f'Cannot org-approve: current status is {completion.data["diploma_status"]}',
                status=400
            )

        # Verify org scoping
        try:
            verify_org_scope(admin_supabase, user_id, completion.data['user_id'])
        except PermissionError as e:
            return error_response(code='FORBIDDEN', message=str(e), status=403)
        except ValueError as e:
            return error_response(code='NOT_FOUND', message=str(e), status=404)

        now = datetime.utcnow().isoformat()
        feedback = (data.get('feedback') or '').strip()
        override_subjects = data.get('subjects')

        # If org_admin overrode the subject distribution, save it on the task
        if override_subjects and isinstance(override_subjects, dict) and completion.data.get('user_quest_task_id'):
            admin_supabase.table('user_quest_tasks').update({
                'subject_xp_distribution': override_subjects
            }).eq('id', completion.data['user_quest_task_id']).execute()

        # Update the latest review round with org_admin action
        latest_round = admin_supabase.table('diploma_review_rounds') \
            .select('id') \
            .eq('completion_id', completion_id) \
            .order('round_number', desc=True) \
            .limit(1) \
            .execute()

        if latest_round.data:
            admin_supabase.table('diploma_review_rounds').update({
                'org_reviewer_id': user_id,
                'org_reviewer_action': 'approved',
                'org_reviewer_feedback': feedback if feedback else None,
                'org_reviewed_at': now
            }).eq('id', latest_round.data[0]['id']).execute()

        # Update completion status to pending Optio approval
        admin_supabase.table('quest_task_completions').update({
            'diploma_status': 'pending_optio_approval',
            'org_reviewer_id': user_id
        }).eq('id', completion_id).execute()

        # Notify superadmin(s)
        try:
            from services.notification_service import NotificationService
            notification_service = NotificationService()

            # Get student name
            student = admin_supabase.table('users') \
                .select('display_name, first_name, last_name, email') \
                .eq('id', completion.data['user_id']) \
                .single() \
                .execute()
            student_name = 'A student'
            if student.data:
                student_name = (
                    student.data.get('display_name')
                    or f"{student.data.get('first_name', '')} {student.data.get('last_name', '')}".strip()
                    or student.data.get('email')
                    or 'A student'
                )

            # Get task title
            task_title = 'a task'
            if completion.data.get('user_quest_task_id'):
                task = admin_supabase.table('user_quest_tasks') \
                    .select('title') \
                    .eq('id', completion.data['user_quest_task_id']) \
                    .single() \
                    .execute()
                if task.data:
                    task_title = task.data.get('title', 'a task')

            superadmins = admin_supabase.table('users') \
                .select('id') \
                .eq('role', 'superadmin') \
                .execute()

            for sa in (superadmins.data or []):
                notification_service.create_notification(
                    user_id=sa['id'],
                    notification_type='org_approved_credit',
                    title='Org-Approved Credit Ready for Review',
                    message=f'{student_name}\'s credit for "{task_title}" was approved by their org admin and is ready for your review.',
                    link='/credit-dashboard',
                    metadata={
                        'student_id': completion.data['user_id'],
                        'completion_id': completion_id,
                        'org_reviewer_id': user_id
                    }
                )
        except Exception as notify_err:
            logger.warning(f"Failed to notify superadmin of org approval: {notify_err}")

        logger.info(f"Org admin {user_id[:8]} approved credit {completion_id[:8]} for Optio review")

        return success_response(data={
            'completion_id': completion_id,
            'diploma_status': 'pending_optio_approval'
        })

    except Exception as e:
        logger.error(f"Error in org-approve for credit {completion_id}: {str(e)}")
        return error_response(code='ORG_APPROVE_ERROR', message='Failed to approve credit', status=500)


@bp.route('/items/<completion_id>/org-grow-this', methods=['POST'])
@require_role('org_admin', 'superadmin')
def org_grow_this(user_id: str, completion_id: str):
    """Org admin returns a credit request to the student with feedback."""
    try:
        admin_supabase = get_supabase_admin_singleton()
        data = request.get_json() or {}

        feedback = (data.get('feedback') or '').strip()
        if not feedback:
            return error_response(
                code='VALIDATION_ERROR',
                message='Feedback is required when returning work for revision',
                status=400
            )

        # Get completion
        completion = admin_supabase.table('quest_task_completions') \
            .select('id, user_id, quest_id, diploma_status, user_quest_task_id, credit_requested_at') \
            .eq('id', completion_id) \
            .single() \
            .execute()

        if not completion.data:
            return error_response(code='NOT_FOUND', message='Completion not found', status=404)

        if completion.data['diploma_status'] != 'pending_org_approval':
            return error_response(
                code='INVALID_STATE',
                message=f'Cannot return: current status is {completion.data["diploma_status"]}',
                status=400
            )

        # Verify org scoping
        try:
            verify_org_scope(admin_supabase, user_id, completion.data['user_id'])
        except PermissionError as e:
            return error_response(code='FORBIDDEN', message=str(e), status=403)
        except ValueError as e:
            return error_response(code='NOT_FOUND', message=str(e), status=404)

        now = datetime.utcnow().isoformat()
        student_id = completion.data['user_id']

        # Update the latest review round
        latest_round = admin_supabase.table('diploma_review_rounds') \
            .select('id') \
            .eq('completion_id', completion_id) \
            .order('round_number', desc=True) \
            .limit(1) \
            .execute()

        if latest_round.data:
            admin_supabase.table('diploma_review_rounds').update({
                'org_reviewer_id': user_id,
                'org_reviewer_action': 'grow_this',
                'org_reviewer_feedback': feedback,
                'org_reviewed_at': now
            }).eq('id', latest_round.data[0]['id']).execute()

        # Remove pending subject XP
        task_result = admin_supabase.table('user_quest_tasks') \
            .select('title, diploma_subjects, subject_xp_distribution, xp_value') \
            .eq('id', completion.data['user_quest_task_id']) \
            .single() \
            .execute()

        task_data = task_result.data or {}
        xp_value = task_data.get('xp_value', 0)

        from routes.tasks import get_subject_xp_distribution, remove_pending_subject_xp
        subjects = get_subject_xp_distribution(task_data, xp_value)
        try:
            remove_pending_subject_xp(admin_supabase, student_id, subjects)
        except Exception as xp_err:
            logger.error(f"Failed to remove pending XP on org grow-this: {xp_err}")

        # Update completion
        admin_supabase.table('quest_task_completions').update({
            'diploma_status': 'grow_this',
            'org_reviewer_id': user_id
        }).eq('id', completion_id).execute()

        # Update task with feedback
        if completion.data.get('user_quest_task_id'):
            admin_supabase.table('user_quest_tasks').update({
                'latest_feedback': feedback,
                'feedback_at': now
            }).eq('id', completion.data['user_quest_task_id']).execute()

        # Notify student
        try:
            from services.notification_service import NotificationService
            notification_service = NotificationService()
            quest_id = completion.data.get('quest_id', '')
            task_id_for_link = completion.data.get('user_quest_task_id', '')
            notification_link = f'/quests/{quest_id}?task={task_id_for_link}' if quest_id else '/dashboard'
            notification_service.create_notification(
                user_id=student_id,
                notification_type='diploma_credit_grow_this',
                title='Grow This: Org Admin Feedback',
                message=f'Your organization admin has feedback on "{task_data.get("title", "a task")}". Review and resubmit when ready.',
                link=notification_link,
                metadata={
                    'task_id': completion.data.get('user_quest_task_id'),
                    'completion_id': completion_id,
                    'feedback': feedback
                }
            )
        except Exception as notify_err:
            logger.warning(f"Failed to notify student of org grow-this: {notify_err}")

        logger.info(f"Org admin {user_id[:8]} returned credit {completion_id[:8]} with feedback")

        return success_response(data={
            'completion_id': completion_id,
            'diploma_status': 'grow_this',
            'feedback': feedback
        })

    except Exception as e:
        logger.error(f"Error in org grow-this for credit {completion_id}: {str(e)}")
        return error_response(code='ORG_GROW_THIS_ERROR', message='Failed to return work for revision', status=500)
