"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED - Integration Layer
- SSO authentication endpoint (JWT signature validation)
- Webhook handler for external LMS events (HMAC signature validation)
- Uses XPService for XP calculations from LMS submissions
- Integration layer, not standard CRUD operations
- Security-focused code (JWT, HMAC, rate limiting, replay protection)
- Direct DB access acceptable for SSO user provisioning and webhook processing
- Per migration guidelines: Integration endpoints don't benefit from repository abstraction

Spark LMS Integration Routes

Handles SSO authentication and evidence webhooks from Spark LMS.
Implements simple JWT-based SSO (not LTI 1.3) and HMAC-signed webhooks.

Security features:
- JWT signature validation
- HMAC webhook signature validation
- Rate limiting
- Replay attack protection
- SSRF protection for file downloads
"""

from flask import Blueprint, request, redirect, jsonify
from app_config import Config
import jwt
import hmac
import hashlib
import json
import requests
from datetime import datetime, timedelta
from urllib.parse import urlparse
import uuid

from database import get_supabase_admin_client
from utils.session_manager import session_manager
from services.xp_service import XPService
from middleware.rate_limiter import rate_limit
from middleware.activity_tracker import track_custom_event
from routes.quest_types import get_course_tasks_for_quest
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('spark', __name__)



def generate_auth_code() -> str:
    """Generate a cryptographically secure random authorization code"""
    import secrets
    return secrets.token_urlsafe(32)


# ============================================
# TOKEN EXCHANGE ENDPOINT
# ============================================

def validate_spark_signature(payload: bytes, signature: str) -> bool:
    """
    Validate webhook HMAC signature

    Args:
        payload: Raw request body bytes
        signature: Signature from X-Spark-Signature header

    Returns:
        True if signature is valid, False otherwise
    """
    secret = Config.SPARK_WEBHOOK_SECRET
    if not secret:
        logger.error("SPARK_WEBHOOK_SECRET not configured")
        return False

    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()

    # Use constant-time comparison to prevent timing attacks
    return hmac.compare_digest(signature, expected)


def create_or_update_spark_user(claims: dict, course_ids: list = None) -> dict:
    """
    Create or update user from Spark SSO claims

    Args:
        claims: JWT claims from Spark SSO token
        course_ids: List of SPARK course IDs to enroll user in (optional)

    Returns:
        User dict with 'id' field
    """
    # admin client justified: Spark SSO user provisioning helper; cross-user user creation/lookup from JWT claims
    supabase = get_supabase_admin_client()
    spark_user_id = claims['sub']

    # Check if LMS integration exists for this Spark user
    integration = supabase.table('lms_integrations') \
        .select('user_id') \
        .eq('lms_platform', 'spark') \
        .eq('lms_user_id', spark_user_id) \
        .execute()

    if integration.data:
        # User already linked to Spark
        user_id = integration.data[0]['user_id']
        logger.info(f"Existing Spark user found: {user_id}")
        return {'id': user_id}

    # Check if user exists by email (account merging)
    email = claims['email']
    user = supabase.table('users') \
        .select('id') \
        .eq('email', email) \
        .execute()

    if user.data:
        # Link existing Optio account to Spark
        user_id = user.data[0]['id']
        logger.info(f"Linking existing user {user_id} to Spark")
    else:
        # Create new user in Supabase Auth first
        import secrets
        temp_password = secrets.token_urlsafe(32)  # Generate random password

        auth_user = supabase.auth.admin.create_user({
            'email': email,
            'password': temp_password,
            'email_confirm': True,  # Auto-confirm email for SSO users
            'user_metadata': {
                'first_name': claims.get('given_name', ''),
                'last_name': claims.get('family_name', ''),
                'display_name': f"{claims.get('given_name', '')} {claims.get('family_name', '')}".strip(),
                'sso_provider': 'spark'
            }
        })

        user_id = auth_user.user.id
        logger.info(f"Created auth user {user_id} from Spark SSO")

        # Create user profile in public.users table
        new_user = supabase.table('users').insert({
            'id': user_id,  # Use auth user ID
            'email': email,
            'first_name': claims.get('given_name', ''),
            'last_name': claims.get('family_name', ''),
            'role': 'student',
            'display_name': f"{claims.get('given_name', '')} {claims.get('family_name', '')}".strip()
        }).execute()

        logger.info(f"Created user profile {user_id} from Spark SSO")

    # Create LMS integration record
    supabase.table('lms_integrations').insert({
        'user_id': user_id,
        'lms_platform': 'spark',
        'lms_user_id': spark_user_id,
        'sync_enabled': True,
        'sync_status': 'active'
    }).execute()

    # Create LMS session for tracking
    supabase.table('lms_sessions').insert({
        'user_id': user_id,
        'lms_platform': 'spark',
        'session_token': str(uuid.uuid4()),
        'expires_at': (datetime.utcnow() + timedelta(hours=24)).isoformat()
    }).execute()

    # Auto-enroll user in SPARK course quests
    # If course_ids provided, enroll only in those courses
    # Otherwise, enroll in all SPARK courses (backward compatibility)
    auto_enroll_spark_courses(user_id, spark_user_id, course_ids)

    return {'id': user_id}


def process_spark_submission(data: dict, files=None) -> dict:
    """
    Process Spark assignment submission with direct file uploads

    Args:
        data: Webhook payload from Spark (JSON metadata)
        files: Flask request.files object (multipart uploads) or None (text-only)

    Returns:
        Dict with user_id and completion_id

    Raises:
        ValueError: If user or task not found, or file validation fails
        Exception: For other processing errors
    """
    # admin client justified: Spark webhook handler; cross-user task completion writes attributed to spark_user_id from HMAC-validated payload
    supabase = get_supabase_admin_client()

    # Find user by Spark ID
    spark_user_id = data['spark_user_id']
    integration = supabase.table('lms_integrations') \
        .select('user_id') \
        .eq('lms_platform', 'spark') \
        .eq('lms_user_id', spark_user_id) \
        .execute()

    if not integration.data:
        raise ValueError(f"User not found for Spark ID: {spark_user_id}")

    user_id = integration.data[0]['user_id']

    # Find quest for this assignment
    spark_assignment_id = data['spark_assignment_id']
    quest = supabase.table('quests') \
        .select('id') \
        .eq('lms_assignment_id', spark_assignment_id) \
        .eq('lms_platform', 'spark') \
        .execute()

    if not quest.data:
        raise ValueError(f"Quest not found for assignment: {spark_assignment_id}")

    quest_id = quest.data[0]['id']

    # Auto-enroll user in quest if not already enrolled, or reactivate if completed
    enrollment = supabase.table('user_quests') \
        .select('id, is_active, completed_at') \
        .eq('user_id', user_id) \
        .eq('quest_id', quest_id) \
        .execute()

    enrollment_id = None
    if not enrollment.data:
        # Create enrollment
        enrollment_result = supabase.table('user_quests').insert({
            'user_id': user_id,
            'quest_id': quest_id,
            'is_active': True,
            'started_at': datetime.utcnow().isoformat()
        }).execute()
        enrollment_id = enrollment_result.data[0]['id']
        logger.info(f"Auto-enrolled user {user_id} in Spark quest {quest_id}")

        # Copy course tasks to user_quest_tasks (since this is a course quest)
        from routes.quest_types import get_course_tasks_for_quest
        preset_tasks = get_course_tasks_for_quest(quest_id)

        if preset_tasks:
            user_tasks_data = []
            for task in preset_tasks:
                task_data = {
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'user_quest_id': enrollment_id,
                    'title': task['title'],
                    'description': task.get('description', ''),
                    'pillar': task['pillar'],
                    'xp_value': task.get('xp_value', 100),
                    'order_index': task.get('order_index', 0),
                    'is_required': task.get('is_required', False),
                    'is_manual': False,
                    'approval_status': 'approved',
                    'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                    'subject_xp_distribution': task.get('subject_xp_distribution', {})
                }
                user_tasks_data.append(task_data)

            if user_tasks_data:
                supabase.table('user_quest_tasks').insert(user_tasks_data).execute()
                logger.info(f"Copied {len(user_tasks_data)} preset tasks to user_quest_tasks for Spark enrollment")
    elif enrollment.data[0].get('is_active') == False or enrollment.data[0].get('completed_at'):
        # Reactivate completed quest on new submission
        enrollment_id = enrollment.data[0]['id']
        supabase.table('user_quests') \
            .update({
                'is_active': True,
                'completed_at': None
            }) \
            .eq('id', enrollment_id) \
            .execute()
        logger.info(f"Reactivated completed Spark quest {quest_id} for user {user_id}")
    else:
        enrollment_id = enrollment.data[0]['id']

    # Find user's tasks for this quest (should exist after enrollment)
    tasks = supabase.table('user_quest_tasks') \
        .select('id, xp_value, pillar') \
        .eq('user_id', user_id) \
        .eq('quest_id', quest_id) \
        .execute()

    if not tasks.data:
        raise ValueError(f"No tasks found for quest: {spark_assignment_id}. Quest may not have tasks configured.")

    # Use first task (or we could mark all tasks complete)
    task_data = tasks.data[0]
    task_id = task_data['id']

    # Check for duplicate submission (idempotency)
    existing = supabase.table('quest_task_completions') \
        .select('id') \
        .eq('user_quest_task_id', task_id) \
        .eq('user_id', user_id) \
        .execute()

    if existing.data:
        logger.info(f"Duplicate submission ignored for task {task_id}")
        return {
            'user_id': user_id,
            'completion_id': existing.data[0]['id']
        }

    # Process uploaded files directly (no URL downloads)
    evidence_files = []
    if files:
        # File size limits
        MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB per file
        MAX_TOTAL_SIZE = 200 * 1024 * 1024  # 200MB total
        total_size = 0

        # Allowed MIME types
        ALLOWED_TYPES = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
            'video/mp4', 'video/quicktime', 'video/x-msvideo',
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
        ]

        for file_key in files:
            file = files[file_key]
            if not file or file.filename == '':
                continue

            # Read file content
            file_content = file.read()
            file_size = len(file_content)

            # Validate file size
            if file_size > MAX_FILE_SIZE:
                raise ValueError(f"File {file.filename} exceeds 50MB limit")

            total_size += file_size
            if total_size > MAX_TOTAL_SIZE:
                raise ValueError("Total file size exceeds 200MB limit")

            # Validate MIME type
            mime_type = file.content_type or 'application/octet-stream'
            if mime_type not in ALLOWED_TYPES:
                raise ValueError(f"File type {mime_type} not allowed")

            # Generate unique filename
            file_extension = file.filename.rsplit('.', 1)[-1] if '.' in file.filename else 'bin'
            unique_filename = f"{user_id}/{uuid.uuid4()}.{file_extension}"

            # Upload to Supabase storage
            supabase.storage.from_('evidence-files').upload(
                unique_filename,
                file_content,
                file_options={"content-type": mime_type}
            )

            # Get public URL
            public_url = supabase.storage.from_('evidence-files').get_public_url(unique_filename)

            evidence_files.append({
                'url': public_url,
                'filename': file.filename,
                'type': mime_type
            })

            logger.info(f"Uploaded Spark file {file.filename} to {unique_filename}")

    # ✅ BLOCK-BASED EVIDENCE: Create evidence document with blocks
    # This allows UI editing after webhook submission and unifies evidence system
    document_id = create_block_based_evidence(
        supabase=supabase,
        user_id=user_id,
        quest_id=quest_id,
        task_id=task_id,
        submission_text=data.get('submission_text', ''),
        files=evidence_files,
        submitted_at=data['submitted_at']
    )

    # Mark task complete (need both task_id and user_quest_task_id for schema compatibility)
    completion = supabase.table('quest_task_completions').insert({
        'user_id': user_id,
        'quest_id': quest_id,
        'task_id': task_id,  # Legacy column (NOT NULL constraint)
        'user_quest_task_id': task_id,  # New column (this is the id from user_quest_tasks table)
        'evidence_text': data.get('submission_text', ''),  # Keep for backward compatibility
        'evidence_url': evidence_files[0]['url'] if evidence_files else None,  # Keep for backward compatibility
        'completed_at': data['submitted_at']
    }).execute()

    completion_id = completion.data[0]['id']

    # Award XP
    xp_service = XPService()
    xp_service.award_xp(
        user_id=user_id,
        xp_amount=task_data['xp_value'],
        pillar=task_data['pillar']
    )

    logger.info(f"Awarded {task_data['xp_value']} XP to user {user_id} for Spark submission")

    return {
        'user_id': user_id,
        'quest_id': quest_id,
        'completion_id': completion_id
    }


def create_block_based_evidence(supabase, user_id: str, quest_id: str, task_id: str,
                               submission_text: str, files: list, submitted_at: str) -> str:
    """
    Create block-based evidence document for Spark webhook submissions.
    This allows evidence to be editable in the UI after webhook submission.

    Args:
        supabase: Supabase admin client
        user_id: Optio user ID
        quest_id: Quest ID
        task_id: Task ID from user_quest_tasks
        submission_text: Text submission from Spark
        files: List of uploaded files with {url, filename, type}
        submitted_at: ISO timestamp of submission

    Returns:
        Evidence document ID

    Creates:
        - user_task_evidence_documents record
        - evidence_document_blocks for text content
        - evidence_document_blocks for each file attachment
    """
    from datetime import datetime

    # Get or create evidence document (handle existing documents from UI edits)
    existing = supabase.table('user_task_evidence_documents')\
        .select('id, status')\
        .eq('user_id', user_id)\
        .eq('task_id', task_id)\
        .execute()

    if existing.data:
        # Update existing document to completed status
        document_id = existing.data[0]['id']
        supabase.table('user_task_evidence_documents')\
            .update({
                'status': 'completed',
                'completed_at': submitted_at,
                'updated_at': submitted_at
            })\
            .eq('id', document_id)\
            .execute()

        # Delete existing blocks (Spark submission is authoritative)
        supabase.table('evidence_document_blocks')\
            .delete()\
            .eq('document_id', document_id)\
            .execute()

        logger.info(f"Updated existing evidence document {document_id} and cleared old blocks for Spark submission")
    else:
        # Create new evidence document
        document = supabase.table('user_task_evidence_documents').insert({
            'user_id': user_id,
            'quest_id': quest_id,
            'task_id': task_id,
            'status': 'completed',
            'completed_at': submitted_at,
            'created_at': submitted_at,
            'updated_at': submitted_at
        }).execute()

        if not document.data:
            logger.error(f"Failed to create evidence document for task {task_id}")
            raise ValueError("Failed to create evidence document")

        document_id = document.data[0]['id']
        logger.info(f"Created new evidence document {document_id} for Spark submission")

    # Create blocks for the evidence
    blocks = []
    order_index = 0

    # Add text block if submission has text
    if submission_text and submission_text.strip():
        blocks.append({
            'document_id': document_id,
            'block_type': 'text',
            'content': {'text': submission_text},
            'order_index': order_index,
            'is_private': False
        })
        order_index += 1

    # Add file blocks for each attachment
    for file in files:
        file_type = file['type']

        # Determine block type based on MIME type
        if file_type.startswith('image/'):
            block_type = 'image'
            content = {
                'url': file['url'],
                'alt': file['filename'],
                'caption': f"Submitted via Spark LMS: {file['filename']}"
            }
        elif file_type.startswith('video/'):
            block_type = 'video'
            content = {
                'url': file['url'],
                'title': file['filename'],
                'platform': 'custom'  # Not YouTube/Vimeo, direct video file
            }
        else:
            # PDFs, docs, etc.
            block_type = 'document'
            content = {
                'url': file['url'],
                'title': file['filename'],
                'filename': file['filename']
            }

        blocks.append({
            'document_id': document_id,
            'block_type': block_type,
            'content': content,
            'order_index': order_index,
            'is_private': False
        })
        order_index += 1

    # Batch insert all blocks
    if blocks:
        supabase.table('evidence_document_blocks').insert(blocks).execute()
        logger.info(f"Created {len(blocks)} evidence blocks for document {document_id}")

    return document_id


def process_spark_course_sync(
    spark_org_id: str,
    spark_course_id: str,
    course_title: str,
    course_description: str,
    assignments: list
) -> dict:
    """
    Create or update Optio quest from Spark course data

    Args:
        spark_org_id: Spark organization ID
        spark_course_id: Spark course ID (used as lms_course_id)
        course_title: Course name (becomes quest title)
        course_description: Course description
        assignments: List of assignment dicts with spark_assignment_id, title, description

    Returns:
        Dict with quest_id and task_count
    """
    # admin client justified: Spark course-to-quest mapping; writes new quest + sample tasks for SPARK course (system-level operation)
    supabase = get_supabase_admin_client()

    # Check if quest already exists for this course
    existing_quest = supabase.table('quests')\
        .select('id, title, description')\
        .eq('lms_course_id', spark_course_id)\
        .eq('quest_type', 'course')\
        .execute()

    if existing_quest.data:
        # Update existing quest
        quest_id = existing_quest.data[0]['id']
        logger.info(f"Updating existing quest {quest_id} for course {spark_course_id}")

        supabase.table('quests')\
            .update({
                'title': course_title,
                'description': course_description,
                'updated_at': datetime.utcnow().isoformat()
            })\
            .eq('id', quest_id)\
            .execute()

    else:
        # Create new quest
        logger.info(f"Creating new quest for course {spark_course_id}")

        quest = supabase.table('quests').insert({
            'title': course_title,
            'description': course_description,
            'quest_type': 'course',
            'lms_course_id': spark_course_id,
            'is_active': True,
            'is_public': False,  # Course quests are not public
            'material_link': 'https://www.onfirelearning.com/',
            'created_at': datetime.utcnow().isoformat()
        }).execute()

        if not quest.data:
            raise ValueError("Failed to create quest")

        quest_id = quest.data[0]['id']
        logger.info(f"Created quest {quest_id} for course {spark_course_id}")

    # Sync assignments as sample tasks (quest task library)
    # Get existing sample tasks for this quest
    existing_tasks = supabase.table('quest_sample_tasks')\
        .select('id, spark_assignment_id')\
        .eq('quest_id', quest_id)\
        .execute()

    existing_task_map = {
        task['spark_assignment_id']: task['id']
        for task in existing_tasks.data
        if task.get('spark_assignment_id')
    }

    tasks_created = 0
    tasks_updated = 0

    for index, assignment in enumerate(assignments):
        spark_assignment_id = assignment.get('spark_assignment_id')
        assignment_title = assignment.get('title')
        assignment_description = assignment.get('description', '')

        if not spark_assignment_id or not assignment_title:
            logger.warning(f"Skipping assignment with missing ID or title: {assignment}")
            continue

        if spark_assignment_id in existing_task_map:
            # Update existing task
            task_id = existing_task_map[spark_assignment_id]
            supabase.table('quest_sample_tasks')\
                .update({
                    'title': assignment_title,
                    'description': assignment_description,
                    'order_index': index,
                    'updated_at': datetime.utcnow().isoformat()
                })\
                .eq('id', task_id)\
                .execute()
            tasks_updated += 1
            logger.info(f"Updated sample task {task_id} for assignment {spark_assignment_id}")

        else:
            # Create new sample task
            supabase.table('quest_sample_tasks').insert({
                'quest_id': quest_id,
                'title': assignment_title,
                'description': assignment_description,
                'pillar': 'stem',  # Default pillar for course tasks
                'xp_value': 100,   # Default XP, can be adjusted
                'spark_assignment_id': spark_assignment_id,
                'order_index': index,
                'created_at': datetime.utcnow().isoformat()
            }).execute()
            tasks_created += 1
            logger.info(f"Created sample task for assignment {spark_assignment_id}")

    logger.info(f"Course sync complete: quest_id={quest_id}, created={tasks_created}, updated={tasks_updated}")

    return {
        'quest_id': quest_id,
        'task_count': tasks_created + tasks_updated
    }


def auto_enroll_spark_courses(user_id: str, spark_user_id: str, course_ids: list = None):
    """
    Auto-enroll a SPARK user in SPARK course quests when they log in via SSO.
    This ensures students are automatically enrolled in their courses without needing
    to manually start each quest or wait for a submission webhook.

    Args:
        user_id: Optio user ID
        spark_user_id: SPARK LMS user ID (for logging)
        course_ids: List of SPARK course IDs to enroll in (optional)
                   If None or empty, enrolls in ALL SPARK courses (backward compatibility)

    Creates:
        - user_quests enrollment records for each SPARK course
        - user_quest_tasks from quest_sample_tasks for each enrollment
    """
    # admin client justified: bulk SPARK course enrollment helper for SSO user; cross-user user_quests + user_quest_tasks writes
    supabase = get_supabase_admin_client()

    try:
        # Build query to find active SPARK course quests
        query = supabase.table('quests')\
            .select('id, title, lms_course_id')\
            .eq('quest_type', 'course')\
            .eq('is_active', True)\
            .not_.is_('lms_course_id', 'null')

        # If specific course IDs provided, filter by those courses
        if course_ids and len(course_ids) > 0:
            query = query.in_('lms_course_id', course_ids)
            logger.info(f"Filtering SPARK quests by course_ids: {course_ids}")
        else:
            logger.info(f"No course_ids specified - enrolling in all SPARK courses")

        spark_quests = query.execute()

        if not spark_quests.data:
            if course_ids:
                logger.warning(f"No SPARK quests found for course_ids: {course_ids}")
            else:
                logger.info(f"No SPARK course quests found for auto-enrollment")
            return

        logger.info(f"Found {len(spark_quests.data)} SPARK course quests for enrollment")

        enrolled_count = 0
        skipped_count = 0

        for quest in spark_quests.data:
            quest_id = quest['id']
            quest_title = quest['title']

            # Check if user is already enrolled
            existing = supabase.table('user_quests')\
                .select('id, is_active')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            if existing.data:
                # User already enrolled - skip or reactivate if needed
                enrollment = existing.data[0]
                if enrollment['is_active']:
                    skipped_count += 1
                    logger.debug(f"User {user_id} already enrolled in quest {quest_id}")
                    continue
                else:
                    # Reactivate inactive enrollment
                    supabase.table('user_quests')\
                        .update({'is_active': True, 'completed_at': None})\
                        .eq('id', enrollment['id'])\
                        .execute()
                    logger.info(f"Reactivated quest {quest_id} for user {user_id}")
                    enrolled_count += 1
                    continue

            # Create new enrollment
            enrollment_result = supabase.table('user_quests').insert({
                'user_id': user_id,
                'quest_id': quest_id,
                'is_active': True,
                'started_at': datetime.utcnow().isoformat()
            }).execute()

            if not enrollment_result.data:
                logger.error(f"Failed to enroll user {user_id} in quest {quest_id}")
                continue

            enrollment_id = enrollment_result.data[0]['id']
            logger.info(f"Auto-enrolled user {user_id} in SPARK quest: {quest_title} (quest_id={quest_id})")

            # Copy course tasks to user_quest_tasks
            preset_tasks = get_course_tasks_for_quest(quest_id)

            if preset_tasks:
                user_tasks_data = []
                for task in preset_tasks:
                    task_data = {
                        'user_id': user_id,
                        'quest_id': quest_id,
                        'user_quest_id': enrollment_id,
                        'title': task['title'],
                        'description': task.get('description', ''),
                        'pillar': task['pillar'],
                        'xp_value': task.get('xp_value', 100),
                        'order_index': task.get('order_index', 0),
                        'is_required': task.get('is_required', False),
                        'is_manual': False,
                        'approval_status': 'approved',
                        'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                        'subject_xp_distribution': task.get('subject_xp_distribution', {})
                    }
                    user_tasks_data.append(task_data)

                if user_tasks_data:
                    supabase.table('user_quest_tasks').insert(user_tasks_data).execute()
                    logger.info(f"Copied {len(user_tasks_data)} tasks to user_quest_tasks for SPARK enrollment")

            enrolled_count += 1

        logger.info(f"SPARK auto-enrollment complete: user_id={user_id}, enrolled={enrolled_count}, skipped={skipped_count}")

    except Exception as e:
        # Don't fail SSO login if auto-enrollment fails
        logger.error(f"Error during SPARK auto-enrollment for user {user_id}: {str(e)}", exc_info=True)




# Submodule imports trigger route registration on bp:
from . import sso  # noqa: F401,E402
from . import webhooks  # noqa: F401,E402
