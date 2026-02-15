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
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
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
                'diploma_status': 'draft',  # Iterative feedback system
                'revision_number': 1
            })
        except ValueError as e:
            return error_response(
                code='COMPLETION_ERROR',
                message=str(e),
                status=500
            )

        # Check for collaboration and share evidence with collaborators
        try:
            # Check if user is in a collaboration for this quest
            collaboration_check = admin_supabase.table('quest_collaborations')\
                .select('id, members')\
                .eq('quest_id', quest_id)\
                .contains('members', [effective_user_id])\
                .execute()

            if collaboration_check.data and len(collaboration_check.data) > 0:
                collaboration = collaboration_check.data[0]
                collaboration_id = collaboration['id']
                members = collaboration.get('members', [])

                # Get collaborators (all members except the submitter)
                collaborators = [m for m in members if m != effective_user_id]

                if collaborators and not is_confidential:
                    # Create shared evidence record
                    shared_evidence = {
                        'collaboration_id': collaboration_id,
                        'task_completion_id': completion_data.get('id'),
                        'submitted_by': effective_user_id,
                        'evidence_type': evidence_type,
                        'evidence_content': evidence_content,
                        'shared_at': datetime.utcnow().isoformat()
                    }
                    admin_supabase.table('shared_evidence').insert(shared_evidence).execute()

                    # Create pending approvals for all collaborators
                    approvals = []
                    for collaborator_id in collaborators:
                        approvals.append({
                            'collaboration_id': collaboration_id,
                            'task_completion_id': completion_data.get('id'),
                            'reviewer_id': collaborator_id,
                            'status': 'pending',
                            'created_at': datetime.utcnow().isoformat()
                        })

                    if approvals:
                        admin_supabase.table('collaboration_approvals').insert(approvals).execute()
                        logger.info(f"Created {len(approvals)} pending approvals for collaboration {collaboration_id}")
        except Exception as collab_error:
            # Don't fail task completion if collaboration sharing fails
            logger.warning(f"Failed to share evidence with collaborators: {str(collab_error)}")

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

        # Award subject-specific XP for diploma credits
        # Prefer subject_xp_distribution (direct XP values), fall back to diploma_subjects (percentages)
        subject_xp_distribution = task_data.get('subject_xp_distribution', {})

        # If no subject_xp_distribution, convert diploma_subjects percentages to XP values
        if not subject_xp_distribution:
            diploma_subjects = task_data.get('diploma_subjects')
            if diploma_subjects:
                logger.info(f"Converting diploma_subjects to subject XP for task {task_id}")
                logger.info(f"diploma_subjects: {diploma_subjects}, task_xp: {final_xp}")
                subject_xp_distribution = {}

                # Handle dict format: {'Math': 75, 'Science': 25}
                if isinstance(diploma_subjects, dict):
                    for subject, percentage in diploma_subjects.items():
                        if isinstance(percentage, (int, float)) and percentage > 0:
                            subject_xp = int(final_xp * percentage / 100)
                            if subject_xp > 0:
                                subject_xp_distribution[subject] = subject_xp

                # Handle array format: ['Electives'] - split XP evenly
                elif isinstance(diploma_subjects, list) and diploma_subjects:
                    per_subject_xp = final_xp // len(diploma_subjects)
                    for subject in diploma_subjects:
                        if per_subject_xp > 0:
                            subject_xp_distribution[subject] = per_subject_xp

        if subject_xp_distribution:
            logger.info(f"=== SUBJECT XP TRACKING ===")
            logger.info(f"Task ID: {task_id}, User ID: {effective_user_id}")
            logger.info(f"Subject XP Distribution: {subject_xp_distribution}")

            # Subject name normalization mapping to match enum values
            SUBJECT_NORMALIZATION = {
                'Electives': 'electives', 'Language Arts': 'language_arts', 'Math': 'math',
                'Mathematics': 'math', 'Science': 'science', 'Social Studies': 'social_studies',
                'Financial Literacy': 'financial_literacy', 'Health': 'health', 'PE': 'pe',
                'Physical Education': 'pe', 'Fine Arts': 'fine_arts', 'Arts': 'fine_arts',
                'CTE': 'cte', 'Career & Technical Education': 'cte',
                'Digital Literacy': 'digital_literacy', 'Technology': 'digital_literacy',
                'Business': 'cte', 'Music': 'fine_arts', 'Communication': 'language_arts'
            }

            # Optimize: Fetch all existing subject XP records in a single query
            subject_names = []
            xp_updates = {}

            for subject, subject_xp in subject_xp_distribution.items():
                # Normalize subject name to match database enum
                normalized_subject = SUBJECT_NORMALIZATION.get(subject, subject.lower().replace(' ', '_'))
                subject_names.append(normalized_subject)
                xp_updates[normalized_subject] = subject_xp

            try:
                # Draft feedback system: Store subject XP in pending_xp
                # XP moves to xp_amount when student finalizes after reviewer approval
                # Single query to fetch all existing subject XP records
                existing_records = admin_supabase.table('user_subject_xp')\
                    .select('school_subject, xp_amount, pending_xp')\
                    .eq('user_id', effective_user_id)\
                    .in_('school_subject', subject_names)\
                    .execute()

                # Build maps for existing vs new subjects
                existing_map = {
                    record['school_subject']: {
                        'xp_amount': record['xp_amount'],
                        'pending_xp': record.get('pending_xp', 0) or 0
                    }
                    for record in existing_records.data
                }

                # Prepare batch operations
                records_to_update = []
                records_to_insert = []

                for subject, new_xp in xp_updates.items():
                    if subject in existing_map:
                        # Existing record - add to pending_xp
                        current_pending = existing_map[subject]['pending_xp']
                        new_pending = current_pending + new_xp
                        records_to_update.append({
                            'user_id': effective_user_id,
                            'school_subject': subject,
                            'pending_xp': new_pending,
                            'updated_at': datetime.utcnow().isoformat()
                        })
                        logger.info(f"Will add {subject} pending XP: {current_pending} + {new_xp} = {new_pending} XP")
                    else:
                        # New record - insert with pending_xp
                        records_to_insert.append({
                            'user_id': effective_user_id,
                            'school_subject': subject,
                            'xp_amount': 0,  # Finalized XP starts at 0
                            'pending_xp': new_xp,  # Draft XP goes to pending
                            'updated_at': datetime.utcnow().isoformat()
                        })
                        logger.info(f"Will create {subject}: {new_xp} pending XP")

                # Batch insert new records
                if records_to_insert:
                    admin_supabase.table('user_subject_xp').insert(records_to_insert).execute()
                    logger.info(f"Batch inserted {len(records_to_insert)} new subject XP records (pending)")

                # Batch upsert updated records
                if records_to_update:
                    for record in records_to_update:
                        admin_supabase.table('user_subject_xp')\
                            .update({
                                'pending_xp': record['pending_xp'],
                                'updated_at': record['updated_at']
                            })\
                            .eq('user_id', effective_user_id)\
                            .eq('school_subject', record['school_subject'])\
                            .execute()
                    logger.info(f"Updated {len(records_to_update)} existing subject XP records (pending)")

            except Exception as e:
                logger.error(f"Batch operation failed, falling back to individual operations: {e}")
                # Fallback to original N-query approach if batch fails
                for subject, subject_xp in xp_updates.items():
                    try:
                        existing_subject_xp = admin_supabase.table('user_subject_xp')\
                            .select('id, xp_amount, pending_xp')\
                            .eq('user_id', effective_user_id)\
                            .eq('school_subject', subject)\
                            .execute()

                        if existing_subject_xp.data:
                            current_pending = existing_subject_xp.data[0].get('pending_xp', 0) or 0
                            new_pending = current_pending + subject_xp
                            admin_supabase.table('user_subject_xp')\
                                .update({'pending_xp': new_pending, 'updated_at': datetime.utcnow().isoformat()})\
                                .eq('user_id', effective_user_id)\
                                .eq('school_subject', subject)\
                                .execute()
                        else:
                            admin_supabase.table('user_subject_xp')\
                                .insert({
                                    'user_id': effective_user_id,
                                    'school_subject': subject,
                                    'xp_amount': 0,
                                    'pending_xp': subject_xp,
                                    'updated_at': datetime.utcnow().isoformat()
                                })\
                                .execute()
                    except Exception as inner_e:
                        logger.error(f"Failed to process {subject}: {inner_e}")

            logger.info("==========================")
        else:
            logger.info(f"No subject XP distribution found for task {task_id}")

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
        if completion_data['diploma_status'] != 'ready_for_credit':
            if completion_data['diploma_status'] == 'finalized':
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

        # Update completion record to finalized
        admin_supabase.table('quest_task_completions').update({
            'diploma_status': 'finalized',
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
                'diploma_status': 'finalized',
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
        supabase = get_user_client()
        admin_supabase = get_supabase_admin_client()

        # Get completion record
        completion = supabase.table('quest_task_completions')\
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
        task_feedback = supabase.table('user_quest_tasks')\
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
            'can_finalize': completion_data['diploma_status'] == 'ready_for_credit',
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