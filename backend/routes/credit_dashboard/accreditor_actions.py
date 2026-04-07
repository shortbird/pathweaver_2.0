"""
Credit Dashboard - Accreditor action endpoints.

Endpoints:
- POST /api/credit-dashboard/items/<completion_id>/confirm    - Confirm advisor decision
- POST /api/credit-dashboard/items/<completion_id>/flag       - Flag with concern
- POST /api/credit-dashboard/items/<completion_id>/override   - Override decision
"""

from flask import request
from database import get_supabase_admin_singleton
from utils.auth.decorators import require_role
from utils.api_response_v1 import success_response, error_response
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

from . import bp


@bp.route('/items/<completion_id>/confirm', methods=['POST'])
@require_role('accreditor', 'superadmin')
def confirm_credit(user_id: str, completion_id: str):
    """Confirm an advisor's credit approval decision."""
    try:
        admin_supabase = get_supabase_admin_singleton()
        data = request.get_json() or {}

        # Get completion
        completion = admin_supabase.table('quest_task_completions') \
            .select('id, user_id, diploma_status, accreditor_status') \
            .eq('id', completion_id) \
            .single() \
            .execute()

        if not completion.data:
            return error_response(code='NOT_FOUND', message='Completion not found', status=404)

        if completion.data['diploma_status'] != 'approved':
            return error_response(code='INVALID_STATE', message='Can only confirm approved items', status=400)

        now = datetime.utcnow().isoformat()

        # Create accreditor review record
        admin_supabase.table('accreditor_reviews').insert({
            'completion_id': completion_id,
            'reviewer_id': user_id,
            'status': 'confirmed',
            'notes': data.get('notes', ''),
            'reviewed_at': now
        }).execute()

        # Update completion
        admin_supabase.table('quest_task_completions').update({
            'accreditor_status': 'confirmed'
        }).eq('id', completion_id).execute()

        logger.info(f"Accreditor {user_id[:8]} confirmed credit {completion_id[:8]}")

        return success_response(data={
            'completion_id': completion_id,
            'accreditor_status': 'confirmed'
        })

    except Exception as e:
        logger.error(f"Error confirming credit {completion_id}: {str(e)}")
        return error_response(code='CONFIRM_ERROR', message='Failed to confirm credit', status=500)


@bp.route('/items/<completion_id>/return-to-advisor', methods=['POST'])
@require_role('accreditor', 'superadmin')
def return_to_advisor(user_id: str, completion_id: str):
    """Return a credit back to advisor review with feedback."""
    try:
        admin_supabase = get_supabase_admin_singleton()
        data = request.get_json() or {}

        feedback = (data.get('feedback') or '').strip()
        if not feedback:
            return error_response(code='VALIDATION_ERROR', message='Feedback is required', status=400)

        completion = admin_supabase.table('quest_task_completions') \
            .select('id, user_id, diploma_status, accreditor_status, credit_reviewer_id, user_quest_task_id') \
            .eq('id', completion_id) \
            .single() \
            .execute()

        if not completion.data:
            return error_response(code='NOT_FOUND', message='Completion not found', status=404)

        if completion.data['diploma_status'] != 'approved':
            return error_response(code='INVALID_STATE', message='Can only return approved items', status=400)

        now = datetime.utcnow().isoformat()

        # Create accreditor review record
        admin_supabase.table('accreditor_reviews').insert({
            'completion_id': completion_id,
            'reviewer_id': user_id,
            'status': 'returned',
            'notes': feedback,
            'reviewed_at': now
        }).execute()

        # Determine return status based on whether student is in an org
        student_result = admin_supabase.table('users') \
            .select('organization_id') \
            .eq('id', completion.data['user_id']) \
            .single() \
            .execute()
        has_org = student_result.data and student_result.data.get('organization_id')
        return_status = 'pending_optio_approval' if has_org else 'pending_review'

        # Reset completion back to appropriate review step
        admin_supabase.table('quest_task_completions').update({
            'diploma_status': return_status,
            'accreditor_status': 'returned',
            'credit_reviewer_id': None,
            'finalized_at': None
        }).eq('id', completion_id).execute()

        # Notify the advisor who approved it
        advisor_id = completion.data.get('credit_reviewer_id')
        if advisor_id:
            try:
                from services.notification_service import NotificationService
                notification_service = NotificationService()
                notification_service.create_notification(
                    user_id=advisor_id,
                    notification_type='accreditor_return',
                    title='Credit Returned by Accreditor',
                    message=f'A credit you approved has been returned for re-review: {feedback}',
                    link='/credit-dashboard',
                    metadata={
                        'completion_id': completion_id,
                        'feedback': feedback
                    }
                )
            except Exception as notify_err:
                logger.warning(f"Failed to notify advisor of return: {notify_err}")

        logger.info(f"Accreditor {user_id[:8]} returned credit {completion_id[:8]} to advisor: {feedback}")

        return success_response(data={
            'completion_id': completion_id,
            'diploma_status': 'pending_review',
            'accreditor_status': 'returned'
        })

    except Exception as e:
        logger.error(f"Error returning credit {completion_id}: {str(e)}")
        return error_response(code='RETURN_ERROR', message='Failed to return credit', status=500)


@bp.route('/items/<completion_id>/flag', methods=['POST'])
@require_role('accreditor', 'superadmin')
def flag_credit(user_id: str, completion_id: str):
    """Flag a credit with a concern, notifying the advisor."""
    try:
        admin_supabase = get_supabase_admin_singleton()
        data = request.get_json() or {}

        flag_reason = (data.get('flag_reason') or '').strip()
        if not flag_reason:
            return error_response(code='VALIDATION_ERROR', message='Flag reason is required', status=400)

        # Get completion
        completion = admin_supabase.table('quest_task_completions') \
            .select('id, user_id, diploma_status, accreditor_status, credit_reviewer_id, user_quest_task_id') \
            .eq('id', completion_id) \
            .single() \
            .execute()

        if not completion.data:
            return error_response(code='NOT_FOUND', message='Completion not found', status=404)

        if completion.data['diploma_status'] != 'approved':
            return error_response(code='INVALID_STATE', message='Can only flag approved items', status=400)

        now = datetime.utcnow().isoformat()

        # Create accreditor review record
        admin_supabase.table('accreditor_reviews').insert({
            'completion_id': completion_id,
            'reviewer_id': user_id,
            'status': 'flagged',
            'flag_reason': flag_reason,
            'notes': data.get('notes', ''),
            'reviewed_at': now
        }).execute()

        # Update completion
        admin_supabase.table('quest_task_completions').update({
            'accreditor_status': 'flagged'
        }).eq('id', completion_id).execute()

        # Notify the advisor who approved it
        advisor_id = completion.data.get('credit_reviewer_id')
        if advisor_id:
            try:
                from services.notification_service import NotificationService
                notification_service = NotificationService()
                notification_service.create_notification(
                    user_id=advisor_id,
                    notification_type='accreditor_flag',
                    title='Credit Flagged by Accreditor',
                    message=f'A credit you approved has been flagged: {flag_reason}',
                    link='/credit-dashboard',
                    metadata={
                        'completion_id': completion_id,
                        'flag_reason': flag_reason
                    }
                )
            except Exception as notify_err:
                logger.warning(f"Failed to notify advisor of flag: {notify_err}")

        logger.info(f"Accreditor {user_id[:8]} flagged credit {completion_id[:8]}: {flag_reason}")

        return success_response(data={
            'completion_id': completion_id,
            'accreditor_status': 'flagged'
        })

    except Exception as e:
        logger.error(f"Error flagging credit {completion_id}: {str(e)}")
        return error_response(code='FLAG_ERROR', message='Failed to flag credit', status=500)


@bp.route('/items/<completion_id>/override', methods=['POST'])
@require_role('accreditor', 'superadmin')
def override_credit(user_id: str, completion_id: str):
    """Override a credit decision with justification."""
    try:
        admin_supabase = get_supabase_admin_singleton()
        data = request.get_json() or {}

        justification = (data.get('justification') or '').strip()
        if not justification:
            return error_response(code='VALIDATION_ERROR', message='Justification is required for overrides', status=400)

        override_subjects = data.get('override_subjects')
        override_xp = data.get('override_xp')

        # Get completion
        completion = admin_supabase.table('quest_task_completions') \
            .select('id, user_id, diploma_status, accreditor_status, credit_reviewer_id, user_quest_task_id') \
            .eq('id', completion_id) \
            .single() \
            .execute()

        if not completion.data:
            return error_response(code='NOT_FOUND', message='Completion not found', status=404)

        if completion.data['diploma_status'] != 'approved':
            return error_response(code='INVALID_STATE', message='Can only override approved items', status=400)

        student_id = completion.data['user_id']
        now = datetime.utcnow().isoformat()

        # Create accreditor review record
        admin_supabase.table('accreditor_reviews').insert({
            'completion_id': completion_id,
            'reviewer_id': user_id,
            'status': 'overridden',
            'notes': justification,
            'override_subjects': override_subjects,
            'override_xp': override_xp,
            'reviewed_at': now
        }).execute()

        # If override includes new subject distribution, update XP
        if override_subjects and isinstance(override_subjects, dict):
            from routes.tasks import get_subject_xp_distribution, finalize_subject_xp, remove_pending_subject_xp

            # Get original task data to remove old finalized XP
            task_result = admin_supabase.table('user_quest_tasks') \
                .select('xp_value, subject_xp_distribution, diploma_subjects') \
                .eq('id', completion.data['user_quest_task_id']) \
                .single() \
                .execute()

            if task_result.data:
                original_subjects = get_subject_xp_distribution(task_result.data, task_result.data.get('xp_value', 0))
                # Reverse the original finalization
                for subject, xp in original_subjects.items():
                    existing = admin_supabase.table('user_subject_xp') \
                        .select('id, xp_amount') \
                        .eq('user_id', student_id) \
                        .eq('school_subject', subject) \
                        .execute()
                    if existing.data:
                        new_xp = max(0, existing.data[0]['xp_amount'] - xp)
                        admin_supabase.table('user_subject_xp') \
                            .update({'xp_amount': new_xp, 'updated_at': now}) \
                            .eq('id', existing.data[0]['id']) \
                            .execute()

                # Apply override distribution
                finalize_subject_xp(admin_supabase, student_id, override_subjects)

        # Update XP value on task if overridden
        if override_xp is not None and completion.data.get('user_quest_task_id'):
            admin_supabase.table('user_quest_tasks').update({
                'xp_value': override_xp
            }).eq('id', completion.data['user_quest_task_id']).execute()

        # Update completion
        admin_supabase.table('quest_task_completions').update({
            'accreditor_status': 'overridden'
        }).eq('id', completion_id).execute()

        # Notify the advisor
        advisor_id = completion.data.get('credit_reviewer_id')
        if advisor_id:
            try:
                from services.notification_service import NotificationService
                notification_service = NotificationService()
                notification_service.create_notification(
                    user_id=advisor_id,
                    notification_type='accreditor_override',
                    title='Credit Overridden by Accreditor',
                    message=f'A credit you approved has been overridden. Reason: {justification}',
                    link='/credit-dashboard',
                    metadata={
                        'completion_id': completion_id,
                        'override_subjects': override_subjects,
                        'override_xp': override_xp
                    }
                )
            except Exception as notify_err:
                logger.warning(f"Failed to notify advisor of override: {notify_err}")

        logger.info(f"Accreditor {user_id[:8]} overrode credit {completion_id[:8]}: {justification}")

        return success_response(data={
            'completion_id': completion_id,
            'accreditor_status': 'overridden'
        })

    except Exception as e:
        logger.error(f"Error overriding credit {completion_id}: {str(e)}")
        return error_response(code='OVERRIDE_ERROR', message='Failed to override credit', status=500)
