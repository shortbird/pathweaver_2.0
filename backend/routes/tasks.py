"""
REPOSITORY MIGRATION: FULLY MIGRATED (Phase 3 Complete)
- First route file migrated to repository pattern (November 2024)
- Uses TaskRepository and TaskCompletionRepository exclusively
- Exemplar implementation of repository pattern
- All direct database calls replaced with repository methods
- See backend/docs/REPOSITORY_MIGRATION_STATUS.md for details

Task completion endpoints for Quest V3 system.
Handles task completion with evidence upload and XP awards.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client, get_user_client
from repositories import (
    UserRepository,
    QuestRepository,
    EvidenceRepository,
    ParentRepository,
    TutorRepository,
    AnalyticsRepository
)
from repositories.base_repository import NotFoundError
from utils.auth.decorators import require_auth
from middleware.idempotency import require_idempotency
from services.evidence_service import EvidenceService
from services.xp_service import XPService
from services.webhook_service import WebhookService
from services.atomic_quest_service import atomic_quest_service
from datetime import datetime
import os
import math
import mimetypes
from werkzeug.utils import secure_filename
from typing import Dict, Any, Optional
from utils.api_response_v1 import success_response, error_response

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('tasks', __name__, url_prefix='/api/tasks')

# Initialize services
evidence_service = EvidenceService()
xp_service = XPService()

# Import file upload configuration from centralized config
from config.constants import MAX_IMAGE_SIZE, ALLOWED_IMAGE_EXTENSIONS

# File upload configuration
UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'uploads/evidence')
MAX_FILE_SIZE = int(os.getenv('MAX_IMAGE_UPLOAD_SIZE', MAX_IMAGE_SIZE))  # Use centralized constant as default

# Using repository pattern for database access
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
            # Handle file upload to Supabase storage
            if 'file' not in request.files:
                return error_response(
                    code='VALIDATION_ERROR',
                    message=f'File is required for {evidence_type} evidence',
                    status=400
                )

            file = request.files['file']
            if file.filename == '':
                return error_response(
                    code='VALIDATION_ERROR',
                    message='No file selected',
                    status=400
                )

            # Validate file extension
            filename = secure_filename(file.filename)
            ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

            # Set allowed extensions based on evidence type
            if evidence_type == 'image':
                allowed_extensions = ALLOWED_IMAGE_EXTENSIONS
                max_file_size = MAX_FILE_SIZE
            elif evidence_type == 'document':
                allowed_extensions = {'pdf', 'doc', 'docx', 'txt'}
                max_file_size = 25 * 1024 * 1024  # 25MB for documents
            else:
                return error_response(
                    code='VALIDATION_ERROR',
                    message=f'Unsupported file evidence type: {evidence_type}',
                    status=400
                )

            if ext not in allowed_extensions:
                return error_response(
                    code='INVALID_FILE_TYPE',
                    message=f'Invalid {evidence_type} format. Extension "{ext}" not allowed. Allowed: {", ".join(allowed_extensions)}',
                    details={'allowed_extensions': list(allowed_extensions)},
                    status=400
                )

            # Check file size
            file.seek(0, os.SEEK_END)
            file_size = file.tell()
            file.seek(0)

            if file_size > max_file_size:
                return error_response(
                    code='FILE_TOO_LARGE',
                    message=f'File too large. Maximum size: {max_file_size // (1024*1024)}MB',
                    details={'max_size_mb': max_file_size // (1024*1024)},
                    status=400
                )

            # Upload to Supabase storage
            try:
                # Generate unique filename for Supabase storage
                timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                unique_filename = f"task-evidence/{effective_user_id}/{task_id}_{timestamp}_{filename}"

                # Read file content
                file_content = file.read()
                file.seek(0)  # Reset file pointer

                # Determine content type
                content_type = file.content_type or mimetypes.guess_type(filename)[0] or 'application/octet-stream'

                # Upload to Supabase storage
                storage_response = admin_supabase.storage.from_('quest-evidence').upload(
                    path=unique_filename,
                    file=file_content,
                    file_options={"content-type": content_type}
                )

                # Get public URL
                public_url = admin_supabase.storage.from_('quest-evidence').get_public_url(unique_filename)

                evidence_data['file_url'] = public_url
                evidence_data['file_size'] = file_size
                evidence_data['original_name'] = filename
                evidence_data['validated_extension'] = ext  # Flag that we already validated this
                evidence_content = public_url

            except Exception as upload_error:
                logger.error(f"Error uploading to Supabase storage: {str(upload_error)}")
                return error_response(
                    code='UPLOAD_ERROR',
                    message='Failed to upload image. Please try again.',
                    status=500
                )

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
        # Draft feedback system: completions start as 'draft' status
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
        # Get user's personalized tasks for this quest
        all_required_tasks = supabase.table('user_quest_tasks')\
            .select('id')\
            .eq('quest_id', quest_id)\
            .eq('user_id', effective_user_id)\
            .eq('is_required', True)\
            .execute()

        # Also get ALL user tasks for completion bonus check
        all_tasks = supabase.table('user_quest_tasks')\
            .select('id, xp_value, pillar')\
            .eq('quest_id', quest_id)\
            .eq('user_id', effective_user_id)\
            .execute()

        # Get completed task IDs from quest_task_completions
        completed_tasks = supabase.table('quest_task_completions')\
            .select('user_quest_task_id')\
            .eq('user_id', effective_user_id)\
            .eq('quest_id', quest_id)\
            .execute()

        required_task_ids = {t['id'] for t in all_required_tasks.data}
        all_task_ids = {t['id'] for t in all_tasks.data}
        completed_task_ids = {t['user_quest_task_id'] for t in completed_tasks.data}
        
        # Check if all tasks (required and optional) are completed for bonus
        all_tasks_completed = all_task_ids.issubset(completed_task_ids)
        
        # If no required tasks are specified, treat all tasks as required
        # This ensures quests are marked complete when all tasks are done
        if not required_task_ids:
            required_task_ids = all_task_ids
            
        # Check if all required tasks are now completed
        # NOTE: We do NOT auto-complete the quest here. Instead, we return
        # all_tasks_completed=True so the frontend can prompt the user to
        # either end the quest or add more tasks. The quest stays active
        # until the user explicitly ends it via POST /api/quests/{id}/end.
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
            # Don't fail task completion if webhook fails
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

# REMOVED: get_task_completions endpoint (originally lines 421-482)
# Reason: Unused - no frontend references found
# Feature: View other students' task completions - never implemented in UI

# REMOVED: suggest_task endpoint (originally lines 484-569)
# Reason: Unused - superseded by quest personalization system
# Feature: Student task suggestions - replaced by AI-powered task generation

# Note: The above functions have been removed because:
# 1. get_task_completions() - queried non-existent quest_tasks table and had no UI
# 2. suggest_task() - created quest_tasks entries which conflict with personalized quest system


@bp.route('/<task_id>', methods=['PUT'])
@require_auth
def update_task(user_id: str, task_id: str):
    """
    Update a task's details (title, description, pillar, xp_value, evidence_prompt).

    Permission check:
    - Superadmins can edit any task
    - Users can edit tasks they created (user_id matches)
    - Org admins/advisors can edit tasks in quests belonging to their organization

    Args:
        user_id: The authenticated user's ID
        task_id: The ID of the user_quest_tasks record to update

    Body:
        title: Task title (optional)
        description: Task description (optional)
        pillar: Task pillar (optional, must be valid)
        xp_value: XP value (optional, 1-1000)
        is_required: Whether task is required (optional, boolean)

    Returns:
        JSON response with updated task data
    """
    try:
        from repositories.task_repository import TaskRepository
        from utils.roles import get_effective_role
        from utils.pillar_utils import is_valid_pillar

        supabase = get_supabase_admin_client()
        task_repo = TaskRepository()

        # Get task data
        try:
            task_data = task_repo.find_by_id(task_id)
        except NotFoundError:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404

        if not task_data:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404

        # Get user data for permission check
        user_result = supabase.table('users')\
            .select('role, org_role, organization_id')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not user_result.data:
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404

        user = user_result.data
        user_role = get_effective_role(user)
        user_org = user.get('organization_id')

        # Check permission to edit this task
        can_edit = False

        # Superadmin can edit any task
        if user_role == 'superadmin':
            can_edit = True
        # User can edit their own tasks
        elif task_data.get('user_id') == user_id:
            can_edit = True
        # Org admin/advisor can edit tasks in their organization's quests
        elif user_role in ('org_admin', 'advisor') and user_org:
            # Get quest organization
            quest_id = task_data.get('quest_id')
            if quest_id:
                quest_result = supabase.table('quests')\
                    .select('organization_id')\
                    .eq('id', quest_id)\
                    .single()\
                    .execute()

                if quest_result.data:
                    quest_org = quest_result.data.get('organization_id')
                    if quest_org == user_org:
                        can_edit = True

        if not can_edit:
            logger.warning(f"User {user_id} denied permission to edit task {task_id}")
            return jsonify({
                'success': False,
                'error': 'You do not have permission to edit this task'
            }), 403

        # Get and validate update data
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400

        # Build update payload with only allowed fields
        update_payload = {}

        if 'title' in data:
            title = data['title'].strip() if data['title'] else ''
            if not title:
                return jsonify({
                    'success': False,
                    'error': 'Task title cannot be empty'
                }), 400
            update_payload['title'] = title

        if 'description' in data:
            update_payload['description'] = data['description'].strip() if data['description'] else ''

        if 'pillar' in data:
            pillar = data['pillar'].lower().strip() if data['pillar'] else 'stem'
            if not is_valid_pillar(pillar):
                return jsonify({
                    'success': False,
                    'error': f'Invalid pillar: {pillar}. Valid pillars are: stem, wellness, communication, civics, art'
                }), 400
            update_payload['pillar'] = pillar

        if 'xp_value' in data:
            try:
                xp_value = int(data['xp_value'])
                if xp_value < 1 or xp_value > 1000:
                    return jsonify({
                        'success': False,
                        'error': 'XP value must be between 1 and 1000'
                    }), 400
                update_payload['xp_value'] = xp_value
            except (ValueError, TypeError):
                return jsonify({
                    'success': False,
                    'error': 'XP value must be a valid number'
                }), 400

        if 'is_required' in data:
            update_payload['is_required'] = bool(data['is_required'])

        if not update_payload:
            return jsonify({
                'success': False,
                'error': 'No valid fields to update'
            }), 400

        # Add updated timestamp
        update_payload['updated_at'] = datetime.utcnow().isoformat()

        # Update the task
        result = supabase.table('user_quest_tasks')\
            .update(update_payload)\
            .eq('id', task_id)\
            .execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Failed to update task'
            }), 500

        updated_task = result.data[0]
        logger.info(f"User {user_id} updated task {task_id}: {list(update_payload.keys())}")

        return jsonify({
            'success': True,
            'task': updated_task,
            'message': 'Task updated successfully'
        }), 200

    except Exception as e:
        logger.error(f"Error updating task {task_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update task'
        }), 500


@bp.route('/<task_id>', methods=['DELETE'])
@require_auth
def drop_task(user_id: str, task_id: str):
    """
    Drop/remove a task from user's active quest.
    Allows users to deactivate tasks and re-add them later from the task library.

    Args:
        user_id: The authenticated user's ID
        task_id: The ID of the user_quest_tasks record to remove

    Returns:
        JSON response with success status
    """
    try:
        # Initialize repositories without user_id to use admin client
        # User authentication is already enforced by @require_auth decorator
        from repositories.task_repository import TaskRepository, TaskCompletionRepository
        task_repo = TaskRepository()
        completion_repo = TaskCompletionRepository()

        # Verify task belongs to user using repository
        try:
            task_data = task_repo.find_by_id(task_id)
            if not task_data or task_data.get('user_id') != user_id:
                logger.warning(f"Task {task_id} not found for user {user_id}")
                return jsonify({
                    'success': False,
                    'error': 'Task not found or not owned by you'
                }), 404
        except NotFoundError:
            logger.warning(f"Task {task_id} not found for user {user_id}")
            return jsonify({
                'success': False,
                'error': 'Task not found or not owned by you'
            }), 404

        # Check if task is already completed using repository
        if completion_repo.check_existing_completion(user_id, task_id):
            logger.warning(f"Cannot drop completed task {task_id} for user {user_id}")
            return jsonify({
                'success': False,
                'error': 'Cannot remove completed tasks'
            }), 400

        # Delete the task using repository
        logger.info(f"Deleting task {task_id} ({task_data['title']}) for user {user_id}")
        task_repo.delete_task(task_id)

        logger.info(f"User {user_id} dropped task {task_id} ({task_data['title']}) from quest {task_data['quest_id']}")

        return jsonify({
            'success': True,
            'message': f"Task '{task_data['title']}' removed from your quest"
        }), 200

    except Exception as e:
        logger.error(f"Error dropping task {task_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to remove task'
        }), 500


@bp.route('/<task_id>/finalize', methods=['POST'])
@require_auth
def finalize_task(user_id: str, task_id: str):
    """
    Finalize a task that has been marked ready for diploma credit.
    Moves subject XP from pending to finalized.

    This endpoint is called by students after superadmin suggests the work
    is ready for diploma credit. It completes the iterative feedback loop.

    Args:
        user_id: The authenticated user's ID
        task_id: The ID of the user_quest_tasks record to finalize

    Returns:
        JSON response with finalization status and XP awarded
    """
    try:
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

        # Subject name normalization mapping
        SUBJECT_NORMALIZATION = {
            'Electives': 'electives', 'Language Arts': 'language_arts', 'Math': 'math',
            'Mathematics': 'math', 'Science': 'science', 'Social Studies': 'social_studies',
            'Financial Literacy': 'financial_literacy', 'Health': 'health', 'PE': 'pe',
            'Physical Education': 'pe', 'Fine Arts': 'fine_arts', 'Arts': 'fine_arts',
            'CTE': 'cte', 'Career & Technical Education': 'cte',
            'Digital Literacy': 'digital_literacy', 'Technology': 'digital_literacy',
            'Business': 'cte', 'Music': 'fine_arts', 'Communication': 'language_arts'
        }

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

        # Clear the feedback notification on the task
        admin_supabase.table('user_quest_tasks').update({
            'latest_feedback': None,
            'feedback_at': None
        }).eq('id', task_id).execute()

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


@bp.route('/<task_id>/draft-status', methods=['GET'])
@require_auth
def get_draft_status(user_id: str, task_id: str):
    """
    Get the draft/feedback status for a completed task.

    Returns:
        diploma_status, feedback history, and finalization eligibility
    """
    try:
        admin_supabase = get_supabase_admin_client()

        # Get completion record (use admin client to avoid RLS issues)
        completion = admin_supabase.table('quest_task_completions')\
            .select('''
                id, diploma_status, revision_number,
                reviewed_at, ready_suggested_at, finalized_at
            ''')\
            .eq('user_quest_task_id', task_id)\
            .eq('user_id', user_id)\
            .single()\
            .execute()

        if not completion.data:
            return success_response(data={
                'has_completion': False,
                'diploma_status': None
            })

        completion_data = completion.data

        # Get feedback history
        feedback = admin_supabase.table('task_feedback')\
            .select('id, feedback_text, revision_number, created_at')\
            .eq('completion_id', completion_data['id'])\
            .order('created_at', desc=False)\
            .execute()

        # Get latest feedback from task record
        task_feedback = admin_supabase.table('user_quest_tasks')\
            .select('latest_feedback, feedback_at')\
            .eq('id', task_id)\
            .single()\
            .execute()

        return success_response(data={
            'has_completion': True,
            'diploma_status': completion_data['diploma_status'],
            'revision_number': completion_data['revision_number'],
            'reviewed_at': completion_data['reviewed_at'],
            'ready_suggested_at': completion_data['ready_suggested_at'],
            'finalized_at': completion_data['finalized_at'],
            'can_finalize': completion_data['diploma_status'] in ('ready_for_credit', 'approved'),
            'feedback_history': feedback.data,
            'latest_feedback': task_feedback.data.get('latest_feedback') if task_feedback.data else None,
            'feedback_at': task_feedback.data.get('feedback_at') if task_feedback.data else None
        })

    except Exception as e:
        logger.error(f"Error getting draft status for task {task_id}: {str(e)}")
        return error_response(
            code='FETCH_ERROR',
            message='Failed to get draft status',
            status=500
        )


# Subject name normalization mapping (shared across credit endpoints)
SUBJECT_NORMALIZATION = {
    'Electives': 'electives', 'Language Arts': 'language_arts', 'Math': 'math',
    'Mathematics': 'math', 'Science': 'science', 'Social Studies': 'social_studies',
    'Financial Literacy': 'financial_literacy', 'Health': 'health', 'PE': 'pe',
    'Physical Education': 'pe', 'Fine Arts': 'fine_arts', 'Arts': 'fine_arts',
    'CTE': 'cte', 'Career & Technical Education': 'cte',
    'Digital Literacy': 'digital_literacy', 'Technology': 'digital_literacy',
    'Business': 'cte', 'Music': 'fine_arts', 'Communication': 'language_arts'
}


def get_subject_xp_distribution(task_data, xp_value):
    """Compute normalized subject XP distribution from task data."""
    subject_xp_distribution = task_data.get('subject_xp_distribution', {}) or {}

    if not subject_xp_distribution:
        diploma_subjects = task_data.get('diploma_subjects')
        if diploma_subjects:
            if isinstance(diploma_subjects, dict):
                for subject, percentage in diploma_subjects.items():
                    if isinstance(percentage, (int, float)) and percentage > 0:
                        subject_xp = int(xp_value * percentage / 100)
                        if subject_xp > 0:
                            subject_xp_distribution[subject] = subject_xp
            elif isinstance(diploma_subjects, list) and diploma_subjects:
                per_subject_xp = xp_value // len(diploma_subjects)
                for subject in diploma_subjects:
                    if per_subject_xp > 0:
                        subject_xp_distribution[subject] = per_subject_xp

    # Normalize subject names
    normalized = {}
    for subject, xp in subject_xp_distribution.items():
        norm_name = SUBJECT_NORMALIZATION.get(subject, subject.lower().replace(' ', '_'))
        normalized[norm_name] = normalized.get(norm_name, 0) + xp

    return normalized


def add_pending_subject_xp(admin_supabase, user_id, subject_xp_distribution):
    """Add subject XP to pending_xp in user_subject_xp table."""
    if not subject_xp_distribution:
        return

    subject_names = list(subject_xp_distribution.keys())

    existing_records = admin_supabase.table('user_subject_xp')\
        .select('school_subject, xp_amount, pending_xp')\
        .eq('user_id', user_id)\
        .in_('school_subject', subject_names)\
        .execute()

    existing_map = {
        record['school_subject']: record.get('pending_xp', 0) or 0
        for record in existing_records.data
    }

    now = datetime.utcnow().isoformat()
    for subject, new_xp in subject_xp_distribution.items():
        if subject in existing_map:
            new_pending = existing_map[subject] + new_xp
            admin_supabase.table('user_subject_xp')\
                .update({'pending_xp': new_pending, 'updated_at': now})\
                .eq('user_id', user_id)\
                .eq('school_subject', subject)\
                .execute()
        else:
            admin_supabase.table('user_subject_xp').insert({
                'user_id': user_id,
                'school_subject': subject,
                'xp_amount': 0,
                'pending_xp': new_xp,
                'updated_at': now
            }).execute()


def remove_pending_subject_xp(admin_supabase, user_id, subject_xp_distribution):
    """Remove subject XP from pending_xp in user_subject_xp table."""
    if not subject_xp_distribution:
        return

    now = datetime.utcnow().isoformat()
    for subject, xp_to_remove in subject_xp_distribution.items():
        existing = admin_supabase.table('user_subject_xp')\
            .select('id, pending_xp')\
            .eq('user_id', user_id)\
            .eq('school_subject', subject)\
            .execute()

        if existing.data:
            current_pending = existing.data[0].get('pending_xp', 0) or 0
            new_pending = max(0, current_pending - xp_to_remove)
            admin_supabase.table('user_subject_xp')\
                .update({'pending_xp': new_pending, 'updated_at': now})\
                .eq('id', existing.data[0]['id'])\
                .execute()


def finalize_subject_xp(admin_supabase, user_id, subject_xp_distribution):
    """Move subject XP from pending to finalized (xp_amount)."""
    if not subject_xp_distribution:
        return 0

    now = datetime.utcnow().isoformat()
    total = 0

    for subject, subject_xp in subject_xp_distribution.items():
        existing = admin_supabase.table('user_subject_xp')\
            .select('id, xp_amount, pending_xp')\
            .eq('user_id', user_id)\
            .eq('school_subject', subject)\
            .execute()

        if existing.data:
            record = existing.data[0]
            new_xp = record['xp_amount'] + subject_xp
            new_pending = max(0, (record.get('pending_xp') or 0) - subject_xp)
            admin_supabase.table('user_subject_xp')\
                .update({'xp_amount': new_xp, 'pending_xp': new_pending, 'updated_at': now})\
                .eq('id', record['id'])\
                .execute()
        else:
            admin_supabase.table('user_subject_xp').insert({
                'user_id': user_id,
                'school_subject': subject,
                'xp_amount': subject_xp,
                'pending_xp': 0,
                'updated_at': now
            }).execute()

        total += subject_xp

    return total


@bp.route('/<task_id>/request-credit', methods=['POST'])
@require_auth
def request_diploma_credit(user_id: str, task_id: str):
    """
    Request diploma credit for a completed task.
    Student-initiated flow: snapshots evidence, creates review round,
    adds subject XP to pending, notifies assigned advisor.

    Can be called on tasks with diploma_status 'none' or 'grow_this' (resubmit).
    """
    try:
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
            if completion_data['diploma_status'] == 'pending_review':
                return error_response(
                    code='ALREADY_PENDING',
                    message='Credit request is already pending advisor review.',
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

        # Get subject XP distribution
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
            # Get max existing round number
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

        # Update completion status
        new_revision = round_number
        admin_supabase.table('quest_task_completions').update({
            'diploma_status': 'pending_review',
            'credit_requested_at': now,
            'revision_number': new_revision
        }).eq('id', completion_data['id']).execute()

        # Add subject XP to pending
        try:
            add_pending_subject_xp(admin_supabase, user_id, subject_xp)
        except Exception as xp_err:
            logger.error(f"Failed to add pending subject XP for credit request: {xp_err}")

        # Notify assigned advisor
        try:
            from services.notification_service import NotificationService
            advisor_assignments = admin_supabase.table('advisor_student_assignments')\
                .select('advisor_id')\
                .eq('student_id', user_id)\
                .eq('is_active', True)\
                .execute()

            if advisor_assignments.data:
                student_result = admin_supabase.table('users')\
                    .select('display_name')\
                    .eq('id', user_id)\
                    .single()\
                    .execute()
                student_name = student_result.data.get('display_name', 'A student') if student_result.data else 'A student'

                notification_service = NotificationService()
                for assignment in advisor_assignments.data:
                    notification_service.create_notification(
                        user_id=assignment['advisor_id'],
                        notification_type='diploma_credit_requested',
                        title='Diploma Credit Requested',
                        message=f'{student_name} requested diploma credit for "{task_data.get("title", "a task")}"',
                        link='/advisor',
                        metadata={
                            'student_id': user_id,
                            'task_id': task_id,
                            'completion_id': completion_data['id']
                        }
                    )
        except Exception as notify_err:
            logger.warning(f"Failed to notify advisor of credit request: {notify_err}")

        logger.info(f"User {user_id[:8]} requested diploma credit for task {task_id[:8]} (round {round_number})")

        return success_response(
            data={
                'success': True,
                'round_number': round_number,
                'diploma_status': 'pending_review',
                'subjects': subject_xp,
                'completion_id': completion_data['id'],
                'message': 'Diploma credit requested. Your advisor will review your work.'
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
        admin_supabase = get_supabase_admin_client()

        # Get all completions with credit activity
        completions = admin_supabase.table('quest_task_completions')\
            .select('id, user_quest_task_id, quest_id, diploma_status, revision_number, credit_requested_at, finalized_at, completed_at')\
            .eq('user_id', user_id)\
            .neq('diploma_status', 'none')\
            .order('credit_requested_at', desc=True)\
            .execute()

        if not completions.data:
            return success_response(data={'credit_requests': []})

        # Collect IDs for enrichment
        task_ids = list(set(c['user_quest_task_id'] for c in completions.data if c.get('user_quest_task_id')))
        quest_ids = list(set(c['quest_id'] for c in completions.data if c.get('quest_id')))
        completion_ids = [c['id'] for c in completions.data]

        # Fetch tasks
        tasks_map = {}
        if task_ids:
            tasks_result = admin_supabase.table('user_quest_tasks')\
                .select('id, title, pillar, xp_value, diploma_subjects, subject_xp_distribution')\
                .in_('id', task_ids)\
                .execute()
            tasks_map = {t['id']: t for t in tasks_result.data}

        # Fetch quests
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

        # Build response
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
        admin_supabase = get_supabase_admin_client()

        # Get completion record
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

        # Get all review rounds
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

        # Enrich rounds with reviewer names
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