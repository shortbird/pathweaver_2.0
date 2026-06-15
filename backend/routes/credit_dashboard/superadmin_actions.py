"""
Credit Dashboard - Superadmin action endpoints.

The superadmin is the final stamp on diploma credit requests (Optio is
platform-accredited; there is no separate accreditor step).

Endpoints:
- POST /api/credit-dashboard/items/<completion_id>/approve          - Finalize credit
- POST /api/credit-dashboard/items/<completion_id>/grow-this        - Return with feedback
- POST /api/credit-dashboard/items/<completion_id>/suggest-feedback - AI drafts Grow This feedback

The approve / grow-this endpoints used to live at /api/advisor/credit-queue/* --
the "advisor" namespace was misleading since only superadmin can call them.
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


@bp.route('/items/<completion_id>/approve', methods=['POST'])
@require_role('superadmin')
def approve_credit(user_id: str, completion_id: str):
    """
    Approve diploma credit for a student's task.
    Moves subject XP from pending to finalized.
    """
    try:
        admin_supabase = get_supabase_admin_singleton()
        data = request.get_json() or {}

        completion_result = admin_supabase.table('quest_task_completions')\
            .select('id, user_id, quest_id, diploma_status, revision_number, user_quest_task_id, credit_requested_at')\
            .eq('id', completion_id)\
            .single()\
            .execute()

        if not completion_result.data:
            return error_response(code='NOT_FOUND', message='Completion not found', status=404)

        completion_data = completion_result.data
        student_id = completion_data['user_id']

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

        # Use superadmin-overridden subjects if provided, otherwise use task suggestion
        from routes.tasks import get_subject_xp_distribution, finalize_subject_xp, remove_pending_subject_xp
        override_subjects = data.get('subjects')
        if override_subjects and isinstance(override_subjects, dict):
            approved_subjects = override_subjects
        else:
            approved_subjects = get_subject_xp_distribution(task_data, xp_value)

        feedback = data.get('feedback', '').strip()
        now = datetime.utcnow().isoformat()

        # Update the latest review round (or create one for legacy requests)
        latest_round = admin_supabase.table('diploma_review_rounds')\
            .select('id')\
            .eq('completion_id', completion_id)\
            .order('round_number', desc=True)\
            .limit(1)\
            .execute()

        review_data = {
            'reviewer_id': user_id,
            'reviewer_action': 'approved',
            'reviewer_feedback': feedback if feedback else None,
            'approved_subjects': approved_subjects,
            'reviewed_at': now
        }
        if latest_round.data:
            admin_supabase.table('diploma_review_rounds').update(
                review_data
            ).eq('id', latest_round.data[0]['id']).execute()
        else:
            review_data.update({
                'completion_id': completion_id,
                'round_number': 1,
                'evidence_snapshot': [],
                'submitted_at': completion_data.get('credit_requested_at', now)
            })
            admin_supabase.table('diploma_review_rounds').insert(review_data).execute()

        # First remove pending XP (the amount added at request time),
        # then finalize with the approved amount.
        original_subjects = get_subject_xp_distribution(task_data, xp_value)
        try:
            remove_pending_subject_xp(admin_supabase, student_id, original_subjects)
        except Exception as e:
            logger.warning(f"Could not remove pending XP before finalizing: {e}")

        total_xp_finalized = finalize_subject_xp(admin_supabase, student_id, approved_subjects)

        # Superadmin approval is the final stamp.
        admin_supabase.table('quest_task_completions').update({
            'diploma_status': 'finalized',
            'credit_reviewer_id': user_id,
            'finalized_at': now
        }).eq('id', completion_id).execute()

        # Clear task-level feedback notification
        if completion_data.get('user_quest_task_id'):
            admin_supabase.table('user_quest_tasks').update({
                'latest_feedback': feedback if feedback else 'Diploma credit approved!',
                'feedback_at': now
            }).eq('id', completion_data['user_quest_task_id']).execute()

        # Notify student
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

        logger.info(f"Superadmin {user_id[:8]} finalized credit {completion_id[:8]}, {total_xp_finalized} XP finalized")

        return success_response(
            data={
                'success': True,
                'completion_id': completion_id,
                'diploma_status': 'finalized',
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


@bp.route('/items/<completion_id>/grow-this', methods=['POST'])
@require_role('superadmin')
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

        completion_result = admin_supabase.table('quest_task_completions')\
            .select('id, user_id, quest_id, diploma_status, revision_number, user_quest_task_id, credit_requested_at')\
            .eq('id', completion_id)\
            .single()\
            .execute()

        if not completion_result.data:
            return error_response(code='NOT_FOUND', message='Completion not found', status=404)

        completion_data = completion_result.data
        student_id = completion_data['user_id']

        if completion_data['diploma_status'] != 'pending_review':
            return error_response(
                code='INVALID_STATE',
                message=f'Cannot return: current status is {completion_data["diploma_status"]}',
                status=400
            )

        now = datetime.utcnow().isoformat()

        latest_round = admin_supabase.table('diploma_review_rounds')\
            .select('id')\
            .eq('completion_id', completion_id)\
            .order('round_number', desc=True)\
            .limit(1)\
            .execute()

        review_data = {
            'reviewer_id': user_id,
            'reviewer_action': 'grow_this',
            'reviewer_feedback': feedback,
            'reviewed_at': now
        }
        if latest_round.data:
            admin_supabase.table('diploma_review_rounds').update(
                review_data
            ).eq('id', latest_round.data[0]['id']).execute()
        else:
            review_data.update({
                'completion_id': completion_id,
                'round_number': 1,
                'evidence_snapshot': [],
                'submitted_at': completion_data.get('credit_requested_at', now)
            })
            admin_supabase.table('diploma_review_rounds').insert(review_data).execute()

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

        admin_supabase.table('quest_task_completions').update({
            'diploma_status': 'grow_this',
            'credit_reviewer_id': user_id
        }).eq('id', completion_id).execute()

        if completion_data.get('user_quest_task_id'):
            admin_supabase.table('user_quest_tasks').update({
                'latest_feedback': feedback,
                'feedback_at': now
            }).eq('id', completion_data['user_quest_task_id']).execute()

        # Notify student
        try:
            from services.notification_service import NotificationService
            notification_service = NotificationService()
            quest_id = completion_data.get('quest_id', '')
            task_id_for_link = completion_data.get('user_quest_task_id', '')
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
                    'task_id': completion_data.get('user_quest_task_id'),
                    'completion_id': completion_id,
                    'feedback': feedback
                }
            )
        except Exception as notify_err:
            logger.warning(f"Failed to notify student of grow-this: {notify_err}")

        logger.info(f"Superadmin {user_id[:8]} returned credit {completion_id[:8]} with feedback")

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


@bp.route('/items/<completion_id>/suggest-feedback', methods=['POST'])
@require_role('superadmin', 'org_admin')
def suggest_grow_this_feedback(user_id: str, completion_id: str):
    """
    Ask Gemini to draft Grow This feedback for this completion. The reviewer
    is expected to edit the draft before sending — this is a writing assist,
    not an auto-send.

    Returns a markdown-bulleted string the frontend can drop into the feedback
    textarea.
    """
    try:
        # Org admins can only ask for feedback on items in their own org.
        admin_supabase = get_supabase_admin_singleton()
        caller = admin_supabase.table('users') \
            .select('role, organization_id') \
            .eq('id', user_id) \
            .single() \
            .execute()
        caller_data = caller.data or {}
        if caller_data.get('role') != 'superadmin':
            completion = admin_supabase.table('quest_task_completions') \
                .select('user_id') \
                .eq('id', completion_id) \
                .single() \
                .execute()
            if not completion.data:
                return error_response(
                    code='NOT_FOUND', message='Completion not found', status=404,
                )
            student = admin_supabase.table('users') \
                .select('organization_id') \
                .eq('id', completion.data['user_id']) \
                .single() \
                .execute()
            student_org = (student.data or {}).get('organization_id')
            caller_org = caller_data.get('organization_id')
            if not caller_org or caller_org != student_org:
                return error_response(
                    code='FORBIDDEN',
                    message='Not authorized to draft feedback for this student',
                    status=403,
                )

        from services.credit_feedback_ai_service import CreditFeedbackAIService
        service = CreditFeedbackAIService()
        result = service.suggest_grow_this_feedback(completion_id)

        if not result.get('success'):
            return error_response(
                code='AI_SUGGEST_ERROR',
                message=result.get('error', 'Failed to generate feedback'),
                status=502,
            )

        logger.info(
            f"User {user_id[:8]} requested AI grow-this draft for completion {completion_id[:8]}"
        )

        return success_response(data={
            'completion_id': completion_id,
            'suggested_feedback': result['suggested_feedback'],
        })

    except Exception as e:
        logger.error(f"Error generating grow-this suggestion for {completion_id}: {e}")
        return error_response(
            code='AI_SUGGEST_ERROR',
            message='Failed to generate suggested feedback',
            status=500,
        )
