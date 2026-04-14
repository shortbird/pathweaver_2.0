"""Task completion + finalization endpoints.

Split from ``routes/tasks.py`` on 2026-04-14.
"""

from datetime import datetime

from flask import request

from database import get_supabase_admin_client, get_user_client
from repositories.base_repository import NotFoundError
from routes.tasks import bp
from routes.tasks.xp_helpers import SUBJECT_NORMALIZATION
from services.atomic_quest_service import atomic_quest_service  # noqa: F401 (historical import kept for parity)
from services.evidence_service import EvidenceService
from services.webhook_service import WebhookService
from services.xp_service import XPService
from utils.api_response_v1 import error_response, success_response
from utils.auth.decorators import require_auth
from middleware.idempotency import require_idempotency
from utils.logger import get_logger

logger = get_logger(__name__)

evidence_service = EvidenceService()
xp_service = XPService()


@bp.route('/<task_id>/complete', methods=['POST'])
@require_auth
@require_idempotency(ttl_seconds=86400)
def complete_task(user_id: str, task_id: str):
    """
    Complete a task with evidence submission.
    Handles file uploads and awards XP.

    Optional form parameter:
        acting_as_dependent_id: UUID of dependent (if parent is acting on behalf of child)
    """
    try:
        # Get optional acting_as_dependent_id from form data
        acting_as_dependent_id = request.form.get('acting_as_dependent_id')

        # Determine effective user ID (handles parent -> dependent delegation)
        effective_user_id = user_id
        if acting_as_dependent_id:
            from repositories.dependent_repository import DependentRepository
            from repositories.base_repository import PermissionError as RepoPermissionError

            try:
                # admin client justified: parent acting-as dependent verification before allowing task ops on dependent's behalf
                admin_client = get_supabase_admin_client()
                dependent_repo = DependentRepository(client=admin_client)
                # Verify parent owns dependent
                dependent_repo.get_dependent(acting_as_dependent_id, user_id)
                effective_user_id = acting_as_dependent_id
                logger.info(f"Parent {user_id[:8]} completing task for dependent {acting_as_dependent_id[:8]}")
            except RepoPermissionError as e:
                logger.warning(f"Unauthorized dependent access attempt: {str(e)}")
                return error_response(
                    code='PERMISSION_DENIED',
                    message='You do not have permission to manage this dependent profile',
                    status=403
                )

        # Use user client for user operations (RLS enforcement)
        supabase = get_user_client()
        # Admin client: Storage and XP operations only (ADR-002, Rule 2)
        # admin client justified: task CRUD writes scoped to caller (self) under @require_auth; cross-user only after parent/advisor relationship verification
        admin_supabase = get_supabase_admin_client()

        # Initialize repositories with user client for RLS
        from repositories.task_repository import TaskRepository, TaskCompletionRepository
        task_repo = TaskRepository(client=supabase)
        completion_repo = TaskCompletionRepository(client=supabase)

        # Get user-specific task details using repository
        try:
            task_data = task_repo.get_task_with_relations(task_id, effective_user_id)
        except NotFoundError:
            return error_response(
                code='TASK_NOT_FOUND',
                message='Task not found or not owned by you',
                status=404
            )

        quest_id = task_data['quest_id']
        user_quest_id = task_data['user_quest_id']

        # Verify task is approved (for manual tasks)
        if task_data.get('approval_status') != 'approved':
            return error_response(
                code='TASK_NOT_APPROVED',
                message='This task is pending approval and cannot be completed yet',
                status=403
            )

        # Check if task already completed using repository
        if completion_repo.check_existing_completion(effective_user_id, task_id):
            return error_response(
                code='TASK_ALREADY_COMPLETED',
                message='Task already completed',
                status=400
            )

        # Get evidence from request
        evidence_type = request.form.get('evidence_type')
        if not evidence_type:
            return error_response(
                code='VALIDATION_ERROR',
                message='Evidence type is required',
                status=400
            )

        # For text and link evidence, require non-empty content
        if evidence_type in ['text', 'link', 'video']:
            text_content = request.form.get('text_content', '').strip()
            if not text_content:
                return error_response(
                    code='VALIDATION_ERROR',
                    message='Evidence content is required. Please provide text or a URL.',
                    status=400
                )

        # Get confidential flag
        is_confidential = request.form.get('is_confidential', 'false').lower() == 'true'

        # Prepare evidence data based on type
        evidence_data = {}
        evidence_content = ''

        if evidence_type == 'text':
            evidence_data['content'] = request.form.get('text_content', '')
            evidence_content = evidence_data['content']

        elif evidence_type == 'link' or evidence_type == 'video':
            evidence_data['url'] = request.form.get('text_content', '')
            evidence_data['title'] = request.form.get('link_title', '')
            evidence_content = evidence_data['url']

        elif evidence_type == 'image' or evidence_type == 'document':
            file = request.files.get('file')

            from services.media_upload_service import MediaUploadService
            result = MediaUploadService(admin_supabase).upload_evidence_file(
                file,
                user_id=effective_user_id,
                context_type='task_evidence',
                context_id=task_id,
                block_type=evidence_type,
            )

            if not result.success:
                status = 400 if result.error_code != 'FILE_TOO_LARGE' else 400
                return error_response(
                    code=result.error_code or 'VALIDATION_ERROR',
                    message=result.error_message,
                    status=status,
                )

            evidence_data['file_url'] = result.file_url
            evidence_data['file_size'] = result.file_size
            evidence_data['original_name'] = result.filename
            evidence_data['validated_extension'] = result.filename.rsplit('.', 1)[1].lower() if '.' in result.filename else ''
            evidence_content = result.file_url

        # Validate evidence
        is_valid, error_msg = evidence_service.validate_evidence(evidence_type, evidence_data)
        if not is_valid:
            return error_response(
                code='VALIDATION_ERROR',
                message=error_msg,
                status=400
            )

        # Get base XP from task
        base_xp = task_data.get('xp_value', 100)
        final_xp = base_xp

        # Create task completion record using repository
        try:
            completion_data = completion_repo.create_completion({
                'user_id': effective_user_id,
                'quest_id': quest_id,
                'task_id': task_id,
                'user_quest_task_id': task_id,  # Reference to personalized task
                'evidence_text': evidence_content if evidence_type == 'text' else None,
                'evidence_url': evidence_content if evidence_type != 'text' else None,
                'is_confidential': is_confidential,
                'xp_awarded': final_xp,
                'diploma_status': 'none',  # Student must explicitly request diploma credit
                'revision_number': 1
            })
        except ValueError as e:
            return error_response(
                code='COMPLETION_ERROR',
                message=str(e),
                status=500
            )

        # Collaboration sharing removed (March 2026 - Feature pruning)

        # Award XP to user
        logger.debug(f"=== TASK COMPLETION XP DEBUG ===")
        logger.info(f"Task ID: {task_id}, User ID: {effective_user_id}")
        logger.info(f"Task pillar: {task_data.get('pillar')}")
        logger.info(f"Base XP: {base_xp}, Final XP: {final_xp}")
        if acting_as_dependent_id:
            logger.info(f"Parent {user_id[:8]} completing for dependent {acting_as_dependent_id[:8]}")
        logger.info("================================")

        # Award XP using XP service
        task_pillar = task_data.get('pillar', 'stem')  # Default to 'stem' (valid current pillar)
        xp_awarded = xp_service.award_xp(
            effective_user_id,
            task_pillar,
            final_xp,
            f'task_completion:{task_id}'
        )

        xp_award_pending = False
        if not xp_awarded:
            logger.error(f"Failed to award XP for task {task_id} to user {effective_user_id}")
            xp_award_pending = True
            # Track failed XP award for later reconciliation
            try:
                admin_supabase.table('xp_award_failures').insert({
                    'user_id': effective_user_id,
                    'task_id': task_id,
                    'pillar': task_pillar,
                    'xp_amount': final_xp,
                    'reason': 'XP service award_xp returned False'
                }).execute()
                logger.info(f"Tracked failed XP award for reconciliation: user={effective_user_id}, task={task_id}, xp={final_xp}")
            except Exception as track_error:
                # If tracking fails, log it but don't fail the task completion
                logger.error(f"Failed to track XP award failure: {track_error}")

        # Subject XP is NO LONGER auto-added at completion time.
        # Students must explicitly request diploma credit via POST /api/tasks/<id>/request-credit.
        # Subject XP gets added to pending_xp only when credit is requested,
        # then moves to xp_amount when advisor approves.
        logger.info(f"Task {task_id} completed with diploma_status='none' - subject XP deferred until credit request")

        # Check if all required tasks are completed (personalized quest system)
        all_required_tasks = supabase.table('user_quest_tasks')\
            .select('id')\
            .eq('quest_id', quest_id)\
            .eq('user_id', effective_user_id)\
            .eq('is_required', True)\
            .execute()

        all_tasks = supabase.table('user_quest_tasks')\
            .select('id, xp_value, pillar')\
            .eq('quest_id', quest_id)\
            .eq('user_id', effective_user_id)\
            .execute()

        completed_tasks = supabase.table('quest_task_completions')\
            .select('user_quest_task_id')\
            .eq('user_id', effective_user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        required_task_ids = {t['id'] for t in all_required_tasks.data}
        all_task_ids = {t['id'] for t in all_tasks.data}
        completed_task_ids = {t['user_quest_task_id'] for t in completed_tasks.data}

        all_tasks_completed = all_task_ids.issubset(completed_task_ids)

        # If no required tasks are specified, treat all tasks as required
        if not required_task_ids:
            required_task_ids = all_task_ids

        # NOTE: We do NOT auto-complete the quest here. Instead, we return
        # all_tasks_completed=True so the frontend can prompt the user to
        # either end the quest or add more tasks.
        if required_task_ids and required_task_ids.issubset(completed_task_ids):
            quest_completed = True
        else:
            quest_completed = False

        # Emit webhook event for task completion
        try:
            webhook_service = WebhookService(supabase)
            user_data = supabase.table('users').select('organization_id').eq('id', effective_user_id).single().execute()
            organization_id = user_data.data.get('organization_id') if user_data.data else None

            webhook_service.emit_event(
                event_type='task.completed',
                data={
                    'user_id': effective_user_id,
                    'task_id': task_id,
                    'quest_id': quest_id,
                    'task_title': task_data.get('title', 'Unknown Task'),
                    'xp_awarded': final_xp,
                    'xp_award_pending': xp_award_pending,
                    'pillar': task_pillar,
                    'completed_at': datetime.utcnow().isoformat() + 'Z'
                },
                organization_id=organization_id
            )
        except Exception as webhook_error:
            logger.warning(f"Failed to emit task.completed webhook: {str(webhook_error)}")

        return success_response(
            data={
                'message': f'Task completed! Earned {final_xp} XP',
                'xp_awarded': final_xp,
                'xp_award_pending': xp_award_pending,
                'quest_completed': quest_completed,
                'completion': completion_data
            }
        )

    except Exception as e:
        logger.error(f"Error completing task: {str(e)}")
        return error_response(
            code='TASK_COMPLETION_ERROR',
            message='Failed to complete task',
            status=500
        )


@bp.route('/<task_id>/finalize', methods=['POST'])
@require_auth
def finalize_task(user_id: str, task_id: str):
    """
    Finalize a task that has been marked ready for diploma credit.
    Moves subject XP from pending to finalized.

    This endpoint is called by students after superadmin suggests the work
    is ready for diploma credit. It completes the iterative feedback loop.
    """
    try:
        # admin client justified: task CRUD writes scoped to caller (self) under @require_auth; cross-user only after parent/advisor relationship verification
        admin_supabase = get_supabase_admin_client()

        # Get the completion record for this task
        completion = admin_supabase.table('quest_task_completions')\
            .select('''
                id, user_id, diploma_status, xp_awarded,
                user_quest_task_id,
                user_quest_tasks!user_quest_task_id(
                    diploma_subjects, subject_xp_distribution, xp_value, title
                )
            ''')\
            .eq('user_quest_task_id', task_id)\
            .eq('user_id', user_id)\
            .single()\
            .execute()

        if not completion.data:
            return error_response(
                code='NOT_FOUND',
                message='Task completion not found',
                status=404
            )

        completion_data = completion.data

        # Verify the task is ready for finalization
        # Support both old 'ready_for_credit' and new 'approved' statuses
        if completion_data['diploma_status'] not in ('ready_for_credit', 'approved'):
            if completion_data['diploma_status'] in ('finalized', 'approved'):
                return error_response(
                    code='ALREADY_FINALIZED',
                    message='This task has already been finalized',
                    status=400
                )
            return error_response(
                code='NOT_READY',
                message='This task is not yet ready for diploma credit. Wait for reviewer feedback.',
                status=400
            )

        # Get subject XP distribution
        task_data = completion_data.get('user_quest_tasks') or {}
        subject_xp_distribution = task_data.get('subject_xp_distribution', {})

        if not subject_xp_distribution:
            # Convert diploma_subjects to XP distribution
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

        now = datetime.utcnow().isoformat()
        total_xp_finalized = 0

        # Move XP from pending to finalized for each subject
        for subject, subject_xp in subject_xp_distribution.items():
            normalized = SUBJECT_NORMALIZATION.get(subject, subject.lower().replace(' ', '_'))

            existing = admin_supabase.table('user_subject_xp')\
                .select('id, xp_amount, pending_xp')\
                .eq('user_id', user_id)\
                .eq('school_subject', normalized)\
                .execute()

            if existing.data:
                record = existing.data[0]
                # Move from pending to actual XP
                new_xp = record['xp_amount'] + subject_xp
                new_pending = max(0, (record.get('pending_xp') or 0) - subject_xp)

                admin_supabase.table('user_subject_xp')\
                    .update({
                        'xp_amount': new_xp,
                        'pending_xp': new_pending,
                        'updated_at': now
                    })\
                    .eq('id', record['id'])\
                    .execute()
            else:
                # Create new record with finalized XP
                admin_supabase.table('user_subject_xp').insert({
                    'user_id': user_id,
                    'school_subject': normalized,
                    'xp_amount': subject_xp,
                    'pending_xp': 0,
                    'updated_at': now
                }).execute()

            total_xp_finalized += subject_xp
            logger.info(f"Finalized {subject_xp} XP for {normalized} subject for user {user_id[:8]}")

        # Update completion record to approved/finalized
        admin_supabase.table('quest_task_completions').update({
            'diploma_status': 'approved',
            'finalized_at': now
        }).eq('id', completion_data['id']).execute()

        task_title = task_data.get('title', 'Task')
        logger.info(f"User {user_id[:8]} finalized task {task_id[:8]} for {total_xp_finalized} subject XP")

        return success_response(
            data={
                'task_id': task_id,
                'diploma_status': 'approved',
                'subject_xp_finalized': total_xp_finalized,
                'subjects': list(subject_xp_distribution.keys())
            },
            message=f"'{task_title}' finalized! {total_xp_finalized} XP added to your diploma credits."
        )

    except Exception as e:
        logger.error(f"Error finalizing task {task_id}: {str(e)}")
        return error_response(
            code='FINALIZE_ERROR',
            message='Failed to finalize task for diploma credit',
            status=500
        )
