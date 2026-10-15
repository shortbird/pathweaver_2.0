"""
Credit Dashboard - the school stage of credit review.

A student's credit request at an org without feature_flags.credit_review_by_optio
waits at diploma_status 'pending_org_approval' for the school
(routes/tasks/credit.py). The school approves it or sends it back here.

Who may act (since 2026-10-15): org admins, campus coordinators and teachers
(advisors), plus superadmins. Admins and coordinators act on any student in
their school; a teacher acts only on the students they teach. The scope rules
live in school_review.py (verify_org_scope).

What an approval does depends on the student's transcript
(school_review.final_reviewer_for, from utils.accreditation):

- Transcript under the school's own accreditation, or none ('self' / 'none'):
  the school is the final reviewer. Approval FINALIZES the credit -- it goes on
  the transcript -- and the reviewer may set the final XP, because there is no
  second reviewer to be surprised by it. The review round records the school
  reviewer in both the org_reviewer_* and the reviewer_* seats. No superadmin
  is notified.
- Transcript under Optio's accreditation ('optio': an Optio Academy enrollment,
  or an Academy-extension org): approval hands the request to Optio's queue at
  'pending_review' and notifies the superadmins. The XP is Optio's call there,
  so an xp_value in the body is refused (403 XP_ADJUST_FORBIDDEN).
- A superadmin is both seats at once, so their approval always finalizes.

The response's diploma_status says which happened ('finalized' or
'pending_review'), and final_reviewer says whose call it was.

Endpoints:
- POST /api/credit-dashboard/items/<completion_id>/org-approve    - Approve (finalize, or send to Optio)
- POST /api/credit-dashboard/items/<completion_id>/org-grow-this  - Return to student with feedback
"""

from flask import request
from database import get_supabase_admin_singleton
from utils.auth.decorators import require_role
from utils.api_response_v1 import success_response, error_response
from utils.roles import get_effective_role
from utils.sis_roles import STAFF_ROLES
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

from . import bp
from .school_review import (  # noqa: F401 -- verify_org_scope re-exported for callers of the old home
    FINAL_OPTIO,
    FINAL_SCHOOL,
    final_reviewer_for,
    finalize_credit,
    verify_org_scope,
)


@bp.route('/items/<completion_id>/org-approve', methods=['POST'])
@require_role(*STAFF_ROLES)
def org_approve_credit(user_id: str, completion_id: str):
    """The school approves a credit request: finalize it, or send it to Optio."""
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

        # Verify org (and, for a teacher, class) scoping. None means superadmin.
        try:
            student_org = verify_org_scope(admin_supabase, user_id, completion.data['user_id'])
        except PermissionError as e:
            return error_response(code='FORBIDDEN', message=str(e), status=403)
        except ValueError as e:
            return error_response(code='NOT_FOUND', message=str(e), status=404)

        now = datetime.utcnow().isoformat()
        feedback = (data.get('feedback') or '').strip()
        override_subjects = data.get('subjects')

        # If the reviewer overrode the subject distribution, save it on the task
        if override_subjects and isinstance(override_subjects, dict) and completion.data.get('user_quest_task_id'):
            admin_supabase.table('user_quest_tasks').update({
                'subject_xp_distribution': override_subjects
            }).eq('id', completion.data['user_quest_task_id']).execute()

        # Who makes the final call. A superadmin is both the school's seat and
        # Optio's, so forcing them through two stages only duplicates their
        # click. Otherwise it follows the student's transcript: Optio's
        # accreditation needs Optio's stamp; the school's own (or none) is the
        # school's to give.
        is_superadmin = student_org is None
        if is_superadmin:
            final_reviewer = FINAL_OPTIO
        else:
            final_reviewer = final_reviewer_for(
                admin_supabase, completion.data['user_id'], student_org)
        finalizes = is_superadmin or final_reviewer == FINAL_SCHOOL

        # On the way to Optio the final XP is Optio's call: a second reviewer
        # would otherwise be looking at a number they did not set and cannot
        # see the reason for. When this approval IS the final call there is no
        # second reviewer, so the XP is the reviewer's to set.
        if data.get('xp_value') is not None and not finalizes:
            return error_response(
                code='XP_ADJUST_FORBIDDEN',
                message='Only Optio sets the final XP for a credit request.',
                status=403,
            )

        # Update the latest review round. When this approval is the final
        # call, the same reviewer also fills the final seat, so the audit trail
        # shows who put the credit on the transcript.
        latest_round = admin_supabase.table('diploma_review_rounds') \
            .select('id') \
            .eq('completion_id', completion_id) \
            .order('round_number', desc=True) \
            .limit(1) \
            .execute()

        if latest_round.data:
            round_update = {
                'org_reviewer_id': user_id,
                'org_reviewer_action': 'approved',
                'org_reviewer_feedback': feedback if feedback else None,
                'org_reviewed_at': now,
            }
            if finalizes:
                round_update.update({
                    'reviewer_id': user_id,
                    'reviewer_action': 'approved',
                    'reviewer_feedback': feedback if feedback else None,
                    'reviewed_at': now,
                })
            admin_supabase.table('diploma_review_rounds').update(
                round_update
            ).eq('id', latest_round.data[0]['id']).execute()

        if finalizes:
            result, error = finalize_credit(
                admin_supabase, completion=completion.data, reviewer_id=user_id,
                data=data, feedback=feedback, override_subjects=override_subjects,
                now=now)
            if error:
                return error

            # No superadmin notification: nothing waits on Optio.
            who = 'Superadmin' if is_superadmin else 'School reviewer'
            logger.info(
                f"{who} {user_id[:8]} finalized credit {completion_id[:8]}, "
                f"{result['xp_finalized']} XP finalized"
            )
            return success_response(data={
                'completion_id': completion_id,
                'diploma_status': 'finalized',
                'final_reviewer': FINAL_OPTIO if is_superadmin else FINAL_SCHOOL,
                'approved_subjects': result['approved_subjects'],
                'xp_finalized': result['xp_finalized'],
                'collapsed': is_superadmin,
            })

        # Hand off to Optio's review (the student's transcript is Optio's).
        admin_supabase.table('quest_task_completions').update({
            'diploma_status': 'pending_review',
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
                    message=f'{student_name}\'s credit for "{task_title}" was approved by their school and is ready for your review.',
                    link='/credit-dashboard',
                    metadata={
                        'student_id': completion.data['user_id'],
                        'completion_id': completion_id,
                        'org_reviewer_id': user_id
                    }
                )
        except Exception as notify_err:
            logger.warning(f"Failed to notify superadmin of org approval: {notify_err}")

        logger.info(f"School reviewer {user_id[:8]} sent credit {completion_id[:8]} to Optio review")

        return success_response(data={
            'completion_id': completion_id,
            'diploma_status': 'pending_review',
            'final_reviewer': FINAL_OPTIO,
        })

    except Exception as e:
        logger.error(f"Error in org-approve for credit {completion_id}: {str(e)}")
        return error_response(code='ORG_APPROVE_ERROR', message='Failed to approve credit', status=500)


@bp.route('/items/<completion_id>/org-grow-this', methods=['POST'])
@require_role(*STAFF_ROLES)
def org_grow_this(user_id: str, completion_id: str):
    """The school returns a credit request to the student with feedback."""
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
            reviewer = admin_supabase.table('users').select(
                'display_name, first_name, last_name, role, org_role, org_roles'
            ).eq('id', user_id).single().execute().data or {}
            reviewer_label = 'Optio' if get_effective_role(reviewer) == 'superadmin' else (
                reviewer.get('display_name')
                or ' '.join(filter(None, [reviewer.get('first_name'), reviewer.get('last_name')])).strip()
                or 'Your teacher'
            )
            grow_title = 'Grow This: Optio Feedback' if reviewer_label == 'Optio' else f'Grow This: Feedback from {reviewer_label}'
            notification_service.create_notification(
                user_id=student_id,
                notification_type='diploma_credit_grow_this',
                title=grow_title,
                message=f'{reviewer_label} has feedback on "{task_data.get("title", "a task")}". Review and resubmit when ready.',
                link=notification_link,
                metadata={
                    'task_id': completion.data.get('user_quest_task_id'),
                    'completion_id': completion_id,
                    'feedback': feedback
                }
            )
        except Exception as notify_err:
            logger.warning(f"Failed to notify student of org grow-this: {notify_err}")

        logger.info(f"School reviewer {user_id[:8]} returned credit {completion_id[:8]} with feedback")

        return success_response(data={
            'completion_id': completion_id,
            'diploma_status': 'grow_this',
            'feedback': feedback
        })

    except Exception as e:
        logger.error(f"Error in org grow-this for credit {completion_id}: {str(e)}")
        return error_response(code='ORG_GROW_THIS_ERROR', message='Failed to return work for revision', status=500)
