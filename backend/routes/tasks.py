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
    BadgeRepository,
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
        try:
            completion_data = completion_repo.create_completion({
                'user_id': effective_user_id,
                'quest_id': quest_id,
                'task_id': task_id,
                'user_quest_task_id': task_id,  # Reference to personalized task
                'evidence_text': evidence_content if evidence_type == 'text' else None,
                'evidence_url': evidence_content if evidence_type != 'text' else None,
                'is_confidential': is_confidential,
                'xp_awarded': final_xp
            })
        except ValueError as e:
            return error_response(
                code='COMPLETION_ERROR',
                message=str(e),
                status=500
            )

        # Award XP to user
        logger.debug(f"=== TASK COMPLETION XP DEBUG ===")
        logger.info(f"Task ID: {task_id}, User ID: {effective_user_id}")
        logger.info(f"Task pillar: {task_data.get('pillar')}")
        logger.info(f"Base XP: {base_xp}, Final XP: {final_xp}")
        if acting_as_dependent_id:
            logger.info(f"Parent {user_id[:8]} completing for dependent {acting_as_dependent_id[:8]}")
        logger.info("================================")

        # Award XP using XP service
        xp_awarded = xp_service.award_xp(
            effective_user_id,
            task_data.get('pillar', 'creativity'),  # Default to old key, service will normalize
            final_xp,
            f'task_completion:{task_id}'
        )

        if not xp_awarded:
            logger.error(f"Warning: Failed to award XP for task {task_id} to user {effective_user_id}")

        # Award subject-specific XP for diploma credits (optional - for backward compatibility with old tasks)
        subject_xp_distribution = task_data.get('subject_xp_distribution', {})
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
                'Business': 'cte', 'Music': 'fine_arts'
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
                # Single query to fetch all existing subject XP records
                existing_records = admin_supabase.table('user_subject_xp')\
                    .select('school_subject, xp_amount')\
                    .eq('user_id', effective_user_id)\
                    .in_('school_subject', subject_names)\
                    .execute()

                # Build maps for existing vs new subjects
                existing_map = {record['school_subject']: record['xp_amount'] for record in existing_records.data}

                # Prepare batch operations
                records_to_update = []
                records_to_insert = []

                for subject, new_xp in xp_updates.items():
                    if subject in existing_map:
                        # Existing record - will update
                        current_xp = existing_map[subject]
                        new_total = current_xp + new_xp
                        records_to_update.append({
                            'user_id': effective_user_id,
                            'school_subject': subject,
                            'xp_amount': new_total,
                            'updated_at': datetime.utcnow().isoformat()
                        })
                        logger.info(f"Will update {subject}: {current_xp} + {new_xp} = {new_total} XP")
                    else:
                        # New record - will insert
                        records_to_insert.append({
                            'user_id': effective_user_id,
                            'school_subject': subject,
                            'xp_amount': new_xp,
                            'updated_at': datetime.utcnow().isoformat()
                        })
                        logger.info(f"Will create {subject}: {new_xp} XP")

                # Batch insert new records
                if records_to_insert:
                    admin_supabase.table('user_subject_xp').insert(records_to_insert).execute()
                    logger.info(f"Batch inserted {len(records_to_insert)} new subject XP records")

                # Batch upsert updated records (upsert handles conflicts automatically)
                if records_to_update:
                    admin_supabase.table('user_subject_xp').upsert(records_to_update).execute()
                    logger.info(f"Batch updated {len(records_to_update)} existing subject XP records")

            except Exception as e:
                logger.error(f"Batch operation failed, falling back to individual operations: {e}")
                # Fallback to original N-query approach if batch fails
                for subject, subject_xp in xp_updates.items():
                    try:
                        existing_subject_xp = admin_supabase.table('user_subject_xp')\
                            .select('id, xp_amount')\
                            .eq('user_id', effective_user_id)\
                            .eq('school_subject', subject)\
                            .execute()

                        if existing_subject_xp.data:
                            current_xp = existing_subject_xp.data[0]['xp_amount']
                            new_total = current_xp + subject_xp
                            admin_supabase.table('user_subject_xp')\
                                .update({'xp_amount': new_total, 'updated_at': datetime.utcnow().isoformat()})\
                                .eq('user_id', effective_user_id)\
                                .eq('school_subject', subject)\
                                .execute()
                        else:
                            admin_supabase.table('user_subject_xp')\
                                .insert({
                                    'user_id': effective_user_id,
                                    'school_subject': subject,
                                    'xp_amount': subject_xp,
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
            
        # If all required tasks completed, mark quest as complete
        if required_task_ids and required_task_ids.issubset(completed_task_ids):
            supabase.table('user_quests')\
                .update({
                    'completed_at': datetime.utcnow().isoformat(),
                    'is_active': False
                })\
                .eq('id', user_quest_id)\
                .execute()
            
            quest_completed = True

            # Completion bonus removed in Phase 1 refactoring (January 2025)
            # Users now only receive XP from individual task completions
        else:
            quest_completed = False

        return success_response(
            data={
                'message': f'Task completed! Earned {final_xp} XP',
                'xp_awarded': final_xp,
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