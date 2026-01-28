"""
Admin Curriculum Upload Routes

AI-powered curriculum upload and transformation pipeline.
Accepts various formats (IMSCC, PDF, DOCX, text) and transforms
them into Optio-philosophy-aligned courses.

Processing happens in background - user receives notification when complete.
Draft course is auto-created and user is redirected to CourseBuilder.

Endpoints:
- POST /api/admin/curriculum/upload - Start upload processing (returns immediately)
- GET /api/admin/curriculum/upload/<id>/status - Get processing status
- DELETE /api/admin/curriculum/upload/<id> - Cancel/delete upload
- GET /api/admin/curriculum/uploads - List recent uploads
"""

import uuid
import atexit
from concurrent.futures import ThreadPoolExecutor
from typing import Dict
from flask import Blueprint, request, jsonify, current_app
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from services.curriculum_upload_service import CurriculumUploadService
from services.notification_service import NotificationService

from utils.logger import get_logger

logger = get_logger(__name__)

# Bounded thread pool for curriculum processing (prevents memory exhaustion)
# Max 3 concurrent uploads to stay within Gunicorn's 400MB worker memory limit
CURRICULUM_THREAD_POOL = ThreadPoolExecutor(
    max_workers=3,
    thread_name_prefix="curriculum_upload"
)


def _shutdown_curriculum_pool():
    """Shutdown thread pool on application exit."""
    logger.info("Shutting down curriculum upload thread pool")
    CURRICULUM_THREAD_POOL.shutdown(wait=False)


atexit.register(_shutdown_curriculum_pool)

bp = Blueprint('admin_curriculum_upload', __name__, url_prefix='/api/admin/curriculum')

# Initialize services (lazy initialization to avoid app context issues)
curriculum_service = None
notification_service = None


def get_curriculum_service():
    """Get or create curriculum service instance."""
    global curriculum_service
    if curriculum_service is None:
        curriculum_service = CurriculumUploadService()
    return curriculum_service


def get_notification_service():
    """Get or create notification service instance."""
    global notification_service
    if notification_service is None:
        notification_service = NotificationService()
    return notification_service

# Valid source types
VALID_SOURCE_TYPES = ['imscc', 'pdf', 'docx', 'text']
VALID_EXTENSIONS = {
    'imscc': ['.imscc', '.zip'],
    'pdf': ['.pdf'],
    'docx': ['.docx', '.doc'],
}

# Max file size: 25MB (general limit)
MAX_FILE_SIZE = 25 * 1024 * 1024

# File size limits by type
MAX_PDF_SIZE = 25 * 1024 * 1024   # 25MB for PDFs
MAX_DOCX_SIZE = 20 * 1024 * 1024  # 20MB for Word docs


def _process_curriculum_background(
    app,
    upload_id: str,
    user_id: str,
    organization_id: str,
    source_type: str,
    content: bytes,
    filename: str,
    options: dict
):
    """
    Background task to process curriculum and create draft course.

    This runs in a separate thread so the API can return immediately.
    When complete, creates the draft course and sends a notification.

    Args:
        app: Flask app instance for creating application context
    """
    with app.app_context():
        _process_curriculum_in_context(
            upload_id, user_id, organization_id, source_type, content, filename, options
        )


def _process_curriculum_in_context(
    upload_id: str,
    user_id: str,
    organization_id: str,
    source_type: str,
    content: bytes,
    filename: str,
    options: dict
):
    """
    Actual processing logic, runs within Flask app context.
    Uses the new process_upload_with_tracking for checkpoint/progress support.
    """
    try:
        logger.info(f"Background processing started for upload {upload_id}")

        # Run the AI pipeline with tracking
        result = get_curriculum_service().process_upload_with_tracking(
            upload_id=upload_id,
            source_type=source_type,
            content=content,
            filename=filename,
            options=options,
            resume_from=1
        )

        if not result.get('success'):
            # Notify user of failure (error already marked in service)
            get_notification_service().create_notification(
                user_id=user_id,
                notification_type='system_alert',
                title='Curriculum Upload Failed',
                message=f'Failed to process "{filename}": {result.get("error", "Unknown error")}',
                organization_id=organization_id,
                metadata={'upload_id': upload_id}
            )

            logger.error(f"Background processing failed for upload {upload_id}: {result.get('error')}")
            return

        # Finalize: create course and send notification
        _finalize_curriculum_upload(upload_id, user_id, organization_id, result)

        logger.info(f"Background processing complete for upload {upload_id}")

    except Exception as e:
        logger.error(f"Background processing error for upload {upload_id}: {str(e)}")

        try:
            supabase = get_supabase_admin_client()
            supabase.table('curriculum_uploads').update({
                'status': 'error',
                'error_message': str(e),
                'can_resume': True
            }).eq('id', upload_id).execute()

            get_notification_service().create_notification(
                user_id=user_id,
                notification_type='system_alert',
                title='Curriculum Upload Failed',
                message=f'An error occurred while processing your curriculum: {str(e)[:100]}',
                organization_id=organization_id,
                metadata={'upload_id': upload_id, 'error': str(e)}
            )
        except Exception as notify_error:
            logger.error(f"Failed to send error notification: {str(notify_error)}")


def _process_to_review_background(
    app,
    upload_id: str,
    user_id: str,
    organization_id: str,
    source_type: str,
    content: bytes,
    filename: str,
    options: dict
):
    """
    Background task to process curriculum to Stage 2 only, then pause for review.
    """
    with app.app_context():
        try:
            logger.info(f"Processing upload {upload_id} to review stage")

            result = get_curriculum_service().process_upload_to_review(
                upload_id=upload_id,
                source_type=source_type,
                content=content,
                filename=filename,
                options=options
            )

            if result.get('success') and result.get('status') == 'ready_for_review':
                # Send notification that structure is ready for review
                get_notification_service().create_notification(
                    user_id=user_id,
                    notification_type='system_alert',
                    title='Structure Ready for Review',
                    message=f'The structure of "{filename}" has been detected. Please review and approve before content generation.',
                    link=f'/admin/curriculum/upload/{upload_id}/review',
                    organization_id=organization_id,
                    metadata={'upload_id': upload_id, 'status': 'ready_for_review'}
                )
                logger.info(f"Upload {upload_id} ready for structure review")
            elif not result.get('success'):
                get_notification_service().create_notification(
                    user_id=user_id,
                    notification_type='system_alert',
                    title='Curriculum Upload Failed',
                    message=f'Failed to process "{filename}": {result.get("error", "Unknown error")}',
                    organization_id=organization_id,
                    metadata={'upload_id': upload_id}
                )
                logger.error(f"Process to review failed for upload {upload_id}: {result.get('error')}")

        except Exception as e:
            logger.error(f"Process to review background error: {str(e)}")
            try:
                supabase = get_supabase_admin_client()
                supabase.table('curriculum_uploads').update({
                    'status': 'error',
                    'error_message': str(e),
                    'can_resume': True
                }).eq('id', upload_id).execute()

                get_notification_service().create_notification(
                    user_id=user_id,
                    notification_type='system_alert',
                    title='Curriculum Upload Failed',
                    message=f'An error occurred: {str(e)[:100]}',
                    organization_id=organization_id,
                    metadata={'upload_id': upload_id, 'error': str(e)}
                )
            except Exception as notify_error:
                logger.error(f"Failed to send error notification: {str(notify_error)}")


@bp.route('/upload', methods=['POST'])
@require_admin
def upload_curriculum(user_id):
    """
    Upload curriculum file and start background processing.

    Returns immediately with upload_id. Processing happens in background.
    User will receive a notification when processing is complete.

    Accepts either:
    - multipart/form-data with 'file' field (for IMSCC, PDF, DOCX)
    - application/json with 'text' and 'source_type' fields (for raw text)

    Form data fields:
    - file: The uploaded file
    - organization_id: Optional org ID (for masquerading)
    - transformation_level: 'light', 'moderate', 'full' (default: 'moderate')
    - preserve_structure: 'true' or 'false' (default: 'true')

    JSON fields:
    - text: Raw curriculum text
    - title: Optional title for the text
    - organization_id: Optional org ID (for masquerading)
    - transformation_level: 'light', 'moderate', 'full' (default: 'moderate')
    - preserve_structure: boolean (default: true)

    Returns:
        JSON with upload_id and status 'processing'
    """
    try:
        supabase = get_supabase_admin_client()

        # Get user's organization (can be overridden by request for masquerading)
        user_result = supabase.table('users').select('organization_id, role').eq('id', user_id).execute()
        user_org_id = user_result.data[0]['organization_id'] if user_result.data else None
        user_role = user_result.data[0]['role'] if user_result.data else None

        # Check rate limit (5 uploads per hour per org/user)
        rate_limit_result = _check_rate_limit(supabase, user_id, user_org_id)
        if not rate_limit_result['allowed']:
            return jsonify({
                'success': False,
                'error': rate_limit_result['message']
            }), 429

        # Determine input type
        content_type = request.content_type or ''

        # Get organization_id from request if provided (for masquerading by superadmin)
        if 'multipart/form-data' in content_type:
            request_org_id = request.form.get('organization_id')
        elif 'application/json' in content_type:
            data = request.get_json() or {}
            request_org_id = data.get('organization_id')
        else:
            request_org_id = None

        # Use request org_id if provided and user is superadmin, otherwise use user's org
        if request_org_id and user_role == 'superadmin':
            organization_id = request_org_id
        else:
            organization_id = user_org_id

        if 'multipart/form-data' in content_type:
            return _handle_file_upload(user_id, organization_id, supabase)
        elif 'application/json' in content_type:
            return _handle_text_upload(user_id, organization_id, supabase)
        else:
            return jsonify({
                'success': False,
                'error': 'Invalid content type. Use multipart/form-data for files or application/json for text.'
            }), 400

    except Exception as e:
        logger.error(f"Error in curriculum upload: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Upload failed: {str(e)}'
        }), 500


def _check_rate_limit(supabase, user_id: str, organization_id: str) -> dict:
    """
    Check if user/org has exceeded the upload rate limit.
    Limit: 5 uploads per hour per organization (or per user if no org).
    Superadmins are exempt from rate limiting.
    """
    from datetime import datetime, timedelta

    # Check if superadmin (exempt from rate limiting)
    user_result = supabase.table('users').select('role').eq('id', user_id).execute()
    if user_result.data and user_result.data[0].get('role') == 'superadmin':
        return {'allowed': True}

    # Calculate time window (1 hour ago)
    one_hour_ago = (datetime.utcnow() - timedelta(hours=1)).isoformat()

    # Count recent uploads
    if organization_id:
        # Count by organization
        result = supabase.table('curriculum_uploads').select('id', count='exact').eq(
            'organization_id', organization_id
        ).gte('uploaded_at', one_hour_ago).execute()
    else:
        # Count by user (for platform users without org)
        result = supabase.table('curriculum_uploads').select('id', count='exact').eq(
            'uploaded_by', user_id
        ).gte('uploaded_at', one_hour_ago).execute()

    count = result.count if hasattr(result, 'count') else len(result.data)
    max_uploads = 5

    if count >= max_uploads:
        return {
            'allowed': False,
            'message': f'Rate limit exceeded. Maximum {max_uploads} uploads per hour. Please try again later.'
        }

    return {'allowed': True, 'remaining': max_uploads - count}


def _handle_file_upload(user_id: str, organization_id: str, supabase):
    """Handle multipart file upload - start background processing."""
    if 'file' not in request.files:
        return jsonify({
            'success': False,
            'error': 'No file uploaded. Include a file in the "file" field.'
        }), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({
            'success': False,
            'error': 'No file selected'
        }), 400

    # Determine source type from extension
    filename = file.filename.lower()
    source_type = None

    for stype, extensions in VALID_EXTENSIONS.items():
        if any(filename.endswith(ext) for ext in extensions):
            source_type = stype
            break

    if not source_type:
        return jsonify({
            'success': False,
            'error': f'Unsupported file type. Supported: .imscc, .zip, .pdf, .docx, .doc'
        }), 400

    # Read file content
    file_content = file.read()
    file_size = len(file_content)

    # Validate file size (type-specific limits due to memory requirements)
    if file_size > MAX_FILE_SIZE:
        return jsonify({
            'success': False,
            'error': f'File too large. Maximum size is 25MB.'
        }), 400

    # PDF-specific size limit (PDFs use ~10-20x memory during AI processing)
    if source_type == 'pdf' and file_size > MAX_PDF_SIZE:
        size_mb = file_size / (1024 * 1024)
        max_mb = MAX_PDF_SIZE / (1024 * 1024)
        return jsonify({
            'success': False,
            'error': f'PDF file too large ({size_mb:.1f}MB). Maximum PDF size is {max_mb:.0f}MB due to memory requirements during AI processing. Please condense the content or use a shorter excerpt.'
        }), 400

    # DOCX-specific size limit
    if source_type == 'docx' and file_size > MAX_DOCX_SIZE:
        size_mb = file_size / (1024 * 1024)
        max_mb = MAX_DOCX_SIZE / (1024 * 1024)
        return jsonify({
            'success': False,
            'error': f'Word document too large ({size_mb:.1f}MB). Maximum size is {max_mb:.0f}MB. Please condense the content or use a shorter excerpt.'
        }), 400

    # Get transformation options
    transformation_level = request.form.get('transformation_level', 'moderate')
    preserve_structure = request.form.get('preserve_structure', 'true').lower() == 'true'
    pause_for_review = request.form.get('pause_for_review', 'false').lower() == 'true'

    if transformation_level not in ['light', 'moderate', 'full']:
        transformation_level = 'moderate'

    # Get content type selections (for IMSCC files)
    content_types_str = request.form.get('content_types')
    content_types = None
    if content_types_str:
        try:
            import json
            content_types = json.loads(content_types_str)
        except (json.JSONDecodeError, TypeError):
            pass

    # Get user-provided learning objectives (one per line)
    learning_objectives_str = request.form.get('learning_objectives', '').strip()
    learning_objectives = None
    if learning_objectives_str:
        # Split by newlines and filter empty lines
        learning_objectives = [obj.strip() for obj in learning_objectives_str.split('\n') if obj.strip()]
        logger.info(f"User provided {len(learning_objectives)} learning objectives")

    # Create upload record
    upload_id = str(uuid.uuid4())

    upload_record = {
        'id': upload_id,
        'source_type': source_type,
        'original_filename': file.filename,
        'file_size_bytes': len(file_content),
        'status': 'processing',
        'uploaded_by': user_id,
        'organization_id': organization_id,
        'progress_percent': 0,
        'current_stage_name': 'Starting',
        'current_stage': 0
    }

    supabase.table('curriculum_uploads').insert(upload_record).execute()

    logger.info(f"Admin {user_id} uploading curriculum: {file.filename} ({source_type}), pause_for_review={pause_for_review}")

    # Build options
    options = {
        'transformation_level': transformation_level,
        'preserve_structure': preserve_structure,
        'content_types': content_types,
        'learning_objectives': learning_objectives
    }

    # Get app reference for background thread
    app = current_app._get_current_object()

    if pause_for_review:
        # Process to Stage 2 only, then pause for review
        # Use bounded thread pool instead of unbounded daemon threads
        CURRICULUM_THREAD_POOL.submit(
            _process_to_review_background,
            app, upload_id, user_id, organization_id, source_type, file_content, file.filename, options
        )

        return jsonify({
            'success': True,
            'upload_id': upload_id,
            'status': 'processing',
            'pauseForReview': True,
            'message': 'Processing started. You will be able to review the detected structure before content generation.'
        }), 202
    else:
        # Full background processing
        # Use bounded thread pool instead of unbounded daemon threads
        CURRICULUM_THREAD_POOL.submit(
            _process_curriculum_background,
            app, upload_id, user_id, organization_id, source_type, file_content, file.filename, options
        )

        return jsonify({
            'success': True,
            'upload_id': upload_id,
            'status': 'processing',
            'message': 'Processing started. You will receive a notification when your course is ready.'
        }), 202


def _handle_text_upload(user_id: str, organization_id: str, supabase):
    """Handle JSON text upload - start background processing."""
    data = request.get_json()

    if not data:
        return jsonify({
            'success': False,
            'error': 'No JSON data provided'
        }), 400

    text = data.get('text', '')
    if not text or not text.strip():
        return jsonify({
            'success': False,
            'error': 'No text content provided'
        }), 400

    title = data.get('title', 'Pasted Curriculum')

    # Get transformation options
    transformation_level = data.get('transformation_level', 'moderate')
    preserve_structure = data.get('preserve_structure', True)
    pause_for_review = data.get('pause_for_review', False)

    if transformation_level not in ['light', 'moderate', 'full']:
        transformation_level = 'moderate'

    # Create upload record
    upload_id = str(uuid.uuid4())

    upload_record = {
        'id': upload_id,
        'source_type': 'text',
        'original_filename': title,
        'file_size_bytes': len(text.encode('utf-8')),
        'status': 'processing',
        'uploaded_by': user_id,
        'organization_id': organization_id,
        'progress_percent': 0,
        'current_stage_name': 'Starting',
        'current_stage': 0
    }

    supabase.table('curriculum_uploads').insert(upload_record).execute()

    logger.info(f"Admin {user_id} uploading curriculum text ({len(text)} chars), pause_for_review={pause_for_review}")

    # Build options
    options = {
        'transformation_level': transformation_level,
        'preserve_structure': preserve_structure
    }

    # Get app reference for background thread
    app = current_app._get_current_object()

    if pause_for_review:
        # Process to Stage 2 only, then pause for review
        # Use bounded thread pool instead of unbounded daemon threads
        CURRICULUM_THREAD_POOL.submit(
            _process_to_review_background,
            app, upload_id, user_id, organization_id, 'text', text.encode('utf-8'), title, options
        )

        return jsonify({
            'success': True,
            'upload_id': upload_id,
            'status': 'processing',
            'pauseForReview': True,
            'message': 'Processing started. You will be able to review the detected structure before content generation.'
        }), 202
    else:
        # Full background processing
        # Use bounded thread pool instead of unbounded daemon threads
        CURRICULUM_THREAD_POOL.submit(
            _process_curriculum_background,
            app, upload_id, user_id, organization_id, 'text', text.encode('utf-8'), title, options
        )

        return jsonify({
            'success': True,
            'upload_id': upload_id,
            'status': 'processing',
            'message': 'Processing started. You will receive a notification when your course is ready.'
        }), 202


def _generate_course_background(
    app,
    upload_id: str,
    user_id: str,
    organization_id: str,
    topic: str,
    learning_objectives: list
):
    """
    Background task to generate a course from scratch.

    This runs in a separate thread so the API can return immediately.
    When complete, creates the draft course and sends a notification.
    """
    with app.app_context():
        try:
            service = get_curriculum_service()
            result = service.process_generation(
                upload_id=upload_id,
                topic=topic,
                learning_objectives=learning_objectives,
                user_id=user_id,
                organization_id=organization_id
            )

            if result.get('success'):
                # Send success notification
                get_notification_service().create_notification(
                    user_id=user_id,
                    notification_type='system_alert',
                    title='Course Generated',
                    message=f'Your course "{topic}" has been created and is ready to edit.',
                    organization_id=organization_id,
                    metadata={'upload_id': upload_id, 'course_id': result.get('course_id')}
                )
            else:
                # Send error notification
                get_notification_service().create_notification(
                    user_id=user_id,
                    notification_type='system_alert',
                    title='Course Generation Failed',
                    message=f'Failed to generate course: {result.get("error", "Unknown error")[:100]}',
                    organization_id=organization_id,
                    metadata={'upload_id': upload_id}
                )

        except Exception as e:
            logger.error(f"Generate course background error: {str(e)}")
            try:
                supabase = get_supabase_admin_client()
                supabase.table('curriculum_uploads').update({
                    'status': 'error',
                    'error_message': str(e),
                    'can_resume': False
                }).eq('id', upload_id).execute()

                get_notification_service().create_notification(
                    user_id=user_id,
                    notification_type='system_alert',
                    title='Course Generation Failed',
                    message=f'An error occurred: {str(e)[:100]}',
                    organization_id=organization_id,
                    metadata={'upload_id': upload_id, 'error': str(e)}
                )
            except Exception as notify_error:
                logger.error(f"Failed to send error notification: {str(notify_error)}")


@bp.route('/generate', methods=['POST'])
@require_admin
def generate_course(user_id):
    """
    Generate a course from scratch based on topic and optional learning objectives.

    No source curriculum needed - AI generates everything from a prompt.

    JSON fields:
    - topic: Required course topic/name
    - learning_objectives: Optional string with objectives (one per line)

    Returns:
        JSON with upload_id and status 'processing'
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({
                'success': False,
                'error': 'No JSON data provided'
            }), 400

        topic = data.get('topic', '').strip()
        if not topic:
            return jsonify({
                'success': False,
                'error': 'Topic is required'
            }), 400

        # Parse learning objectives if provided
        learning_objectives_str = data.get('learning_objectives', '')
        learning_objectives = None
        if learning_objectives_str and learning_objectives_str.strip():
            learning_objectives = [obj.strip() for obj in learning_objectives_str.split('\n') if obj.strip()]
            logger.info(f"User provided {len(learning_objectives)} learning objectives for generation")

        supabase = get_supabase_admin_client()

        # Get user's organization
        user_result = supabase.table('users').select('organization_id').eq('id', user_id).execute()
        organization_id = user_result.data[0]['organization_id'] if user_result.data else None

        # Create upload record
        upload_id = str(uuid.uuid4())

        upload_record = {
            'id': upload_id,
            'source_type': 'generate',  # New source type for generation
            'original_filename': topic,  # Use topic as filename
            'file_size_bytes': 0,
            'status': 'processing',
            'uploaded_by': user_id,
            'organization_id': organization_id,
            'progress_percent': 0,
            'current_stage_name': 'Starting Generation',
            'current_stage': 0
        }

        supabase.table('curriculum_uploads').insert(upload_record).execute()

        logger.info(f"Admin {user_id} generating course from topic: {topic}")

        # Get app reference for background thread
        app = current_app._get_current_object()

        # Start background processing using bounded thread pool
        CURRICULUM_THREAD_POOL.submit(
            _generate_course_background,
            app, upload_id, user_id, organization_id, topic, learning_objectives
        )

        return jsonify({
            'success': True,
            'upload_id': upload_id,
            'status': 'processing',
            'message': 'Generation started. You will receive a notification when your course is ready.'
        }), 202

    except Exception as e:
        logger.error(f"Error in course generation: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Generation failed: {str(e)}'
        }), 500


@bp.route('/upload/<upload_id>/status', methods=['GET'])
@require_admin
def get_upload_status(user_id, upload_id):
    """
    Get the current status of a curriculum upload with progress information.

    Returns:
        JSON with status, progress, stages, quest_id (if complete), and metadata
    """
    try:
        supabase = get_supabase_admin_client()

        result = supabase.table('curriculum_uploads').select(
            'id, status, source_type, original_filename, error_message, uploaded_at, '
            'created_quest_id, created_course_id, progress_percent, current_stage_name, current_item, '
            'stage_1_completed_at, stage_2_completed_at, stage_3_completed_at, stage_4_completed_at, '
            'can_resume, resume_from_stage, current_stage'
        ).eq('id', upload_id).execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Upload not found'
            }), 404

        upload = result.data[0]

        return jsonify({
            'success': True,
            'upload_id': upload_id,
            'status': upload['status'],
            'source_type': upload['source_type'],
            'filename': upload['original_filename'],
            'error': upload.get('error_message'),
            'uploaded_at': upload['uploaded_at'],
            'quest_id': upload.get('created_quest_id'),
            'course_id': upload.get('created_course_id'),
            # Progress tracking
            'progress': upload.get('progress_percent', 0),
            'currentStage': upload.get('current_stage_name'),
            'currentItem': upload.get('current_item'),
            'stages': {
                'parse': bool(upload.get('stage_1_completed_at')),
                'structure': bool(upload.get('stage_2_completed_at')),
                'align': bool(upload.get('stage_3_completed_at')),
                'generate': bool(upload.get('stage_4_completed_at'))
            },
            # Resume capability
            'canResume': upload.get('can_resume', False),
            'resumeFromStage': upload.get('resume_from_stage')
        }), 200

    except Exception as e:
        logger.error(f"Error getting upload status: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to get status: {str(e)}'
        }), 500


@bp.route('/upload/<upload_id>/resume', methods=['POST'])
@require_admin
def resume_curriculum_upload(user_id, upload_id):
    """
    Resume a failed curriculum upload from the last checkpoint.

    Returns:
        JSON with status 'processing' if resumed successfully
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify upload exists and can be resumed
        result = supabase.table('curriculum_uploads').select(
            'id, status, can_resume, resume_from_stage, uploaded_by, organization_id'
        ).eq('id', upload_id).execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Upload not found'
            }), 404

        upload = result.data[0]

        if not upload.get('can_resume'):
            return jsonify({
                'success': False,
                'error': 'This upload cannot be resumed'
            }), 400

        # Get optional new options from request
        data = request.get_json() or {}
        options = {
            'transformation_level': data.get('transformation_level', 'moderate'),
            'preserve_structure': data.get('preserve_structure', True)
        }

        # Start background processing from checkpoint using bounded thread pool
        app = current_app._get_current_object()

        CURRICULUM_THREAD_POOL.submit(
            _resume_curriculum_background,
            app, upload_id, upload['uploaded_by'], upload.get('organization_id'), options
        )

        logger.info(f"Resuming upload {upload_id} from stage {upload.get('resume_from_stage')}")

        return jsonify({
            'success': True,
            'upload_id': upload_id,
            'status': 'processing',
            'resumeFromStage': upload.get('resume_from_stage'),
            'message': 'Processing resumed. You will receive a notification when your course is ready.'
        }), 202

    except Exception as e:
        logger.error(f"Error resuming upload: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to resume: {str(e)}'
        }), 500


@bp.route('/upload/<upload_id>/approve-structure', methods=['POST'])
@require_admin
def approve_structure(user_id, upload_id):
    """
    Approve detected structure and continue processing from Stage 3.

    Used when pause_for_review is enabled. Allows user to verify/edit
    detected structure before AI philosophy alignment.

    Request body (optional):
    {
        "edits": {
            "module_1": {"title": "New Title"},
            "lesson_2": {"title": "New Title", "parent_module": "module_1"}
        },
        "transformation_level": "moderate",
        "preserve_structure": true
    }

    Returns:
        JSON with status 'processing' if approved successfully
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify upload exists and is ready for review
        result = supabase.table('curriculum_uploads').select(
            'id, status, uploaded_by, organization_id'
        ).eq('id', upload_id).execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Upload not found'
            }), 404

        upload = result.data[0]

        if upload.get('status') != 'ready_for_review':
            return jsonify({
                'success': False,
                'error': f'Upload is not ready for review (status: {upload.get("status")})'
            }), 400

        # Get edits and options from request
        data = request.get_json() or {}
        edits = data.get('edits')
        options = {
            'transformation_level': data.get('transformation_level', 'moderate'),
            'preserve_structure': data.get('preserve_structure', True)
        }

        # Start background processing from Stage 3 using bounded thread pool
        app = current_app._get_current_object()

        CURRICULUM_THREAD_POOL.submit(
            _approve_structure_background,
            app, upload_id, upload['uploaded_by'], upload.get('organization_id'), edits, options
        )

        logger.info(f"Structure approved for upload {upload_id}, continuing from Stage 3")

        return jsonify({
            'success': True,
            'upload_id': upload_id,
            'status': 'processing',
            'message': 'Structure approved. Processing will continue. You will receive a notification when your course is ready.'
        }), 202

    except Exception as e:
        logger.error(f"Error approving structure: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to approve structure: {str(e)}'
        }), 500


@bp.route('/upload/<upload_id>/structure', methods=['GET'])
@require_admin
def get_upload_structure(user_id, upload_id):
    """
    Get the detected structure for review (when status is ready_for_review).

    Returns:
        JSON with structured_content for review
    """
    try:
        supabase = get_supabase_admin_client()

        result = supabase.table('curriculum_uploads').select(
            'id, status, structured_content, original_filename'
        ).eq('id', upload_id).execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Upload not found'
            }), 404

        upload = result.data[0]

        if upload.get('status') != 'ready_for_review':
            return jsonify({
                'success': False,
                'error': f'Upload is not ready for review (status: {upload.get("status")})'
            }), 400

        return jsonify({
            'success': True,
            'upload_id': upload_id,
            'filename': upload['original_filename'],
            'structure': upload.get('structured_content', {})
        }), 200

    except Exception as e:
        logger.error(f"Error getting structure: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to get structure: {str(e)}'
        }), 500


def _resume_curriculum_background(app, upload_id: str, user_id: str, organization_id: str, options: dict):
    """Background task to resume curriculum processing."""
    with app.app_context():
        try:
            service = get_curriculum_service()
            result = service.resume_upload(upload_id, options)

            if result.get('success'):
                _finalize_curriculum_upload(upload_id, user_id, organization_id, result)
            # Error handling is done in service._mark_error
        except Exception as e:
            logger.error(f"Resume background error: {str(e)}")


def _approve_structure_background(app, upload_id: str, user_id: str, organization_id: str, edits: dict, options: dict):
    """Background task to continue processing after structure approval."""
    with app.app_context():
        try:
            service = get_curriculum_service()
            result = service.approve_structure(upload_id, edits, options)

            if result.get('success'):
                _finalize_curriculum_upload(upload_id, user_id, organization_id, result)
            # Error handling is done in service._mark_error
        except Exception as e:
            logger.error(f"Approve structure background error: {str(e)}")


def _finalize_curriculum_upload(upload_id: str, user_id: str, organization_id: str, result: dict):
    """
    Finalize a successful curriculum upload by creating course and sending notification.
    Shared by both normal processing and resume/approve paths.
    """
    supabase = get_supabase_admin_client()

    # Extract course and projects data
    preview = result.get('preview', {})
    course_data = preview.get('course', {})
    projects_data = preview.get('projects', [])

    # Create the course record
    course_insert = {
        'title': course_data.get('title', 'Untitled Course'),
        'description': course_data.get('description', ''),
        'status': 'draft',
        'visibility': 'organization',
        'navigation_mode': 'sequential',
        'created_by': user_id,
        'organization_id': organization_id
    }

    course_result = supabase.table('courses').insert(course_insert).execute()

    if not course_result.data:
        raise Exception("Failed to create course")

    course_id = course_result.data[0]['id']
    logger.info(f"Created draft course {course_id}: {course_data.get('title')}")

    # Create Projects and Lessons
    total_lessons = 0
    quest_ids = []

    for i, project in enumerate(projects_data):
        quest_insert = {
            'title': project.get('title', f'Project {i+1}'),
            'description': project.get('description', ''),
            'big_idea': project.get('big_idea', ''),
            'quest_type': 'optio',
            'is_active': False,
            'is_public': False,
            'created_by': user_id,
            'organization_id': organization_id,
            'topic_primary': project.get('topic_primary', 'Academic'),
            'topics': project.get('topics', [])
        }

        quest_result = supabase.table('quests').insert(quest_insert).execute()

        if not quest_result.data:
            logger.error(f"Failed to create quest for project {i+1}")
            continue

        quest_id = quest_result.data[0]['id']
        quest_ids.append(quest_id)

        # Link to course
        supabase.table('course_quests').insert({
            'course_id': course_id,
            'quest_id': quest_id,
            'sequence_order': project.get('order', i),
            'is_required': True,
            'is_published': False,
            'xp_threshold': 500
        }).execute()

        # Create lessons
        for j, lesson in enumerate(project.get('lessons', [])):
            supabase.table('curriculum_lessons').insert({
                'quest_id': quest_id,
                'title': lesson.get('title', f'Lesson {j+1}'),
                'description': lesson.get('description', ''),
                'content': lesson.get('curriculum_content', {'version': 2, 'steps': []}),
                'sequence_order': lesson.get('order_index', j) + 1,
                'is_published': False,
                'is_required': True,
                'organization_id': organization_id,
                'created_by': user_id
            }).execute()
            total_lessons += 1

    # Update upload record
    supabase.table('curriculum_uploads').update({
        'status': 'approved',
        'created_quest_id': quest_ids[0] if quest_ids else None,
        'created_course_id': course_id,
        'generated_content': preview,
        'reviewed_by': user_id,
        'reviewed_at': 'now()',
        'progress_percent': 100,
        'current_stage_name': 'Complete',
        'current_item': None
    }).eq('id', upload_id).execute()

    # Send notification
    get_notification_service().create_notification(
        user_id=user_id,
        notification_type='system_alert',
        title='Curriculum Ready',
        message=f'"{course_data.get("title", "Your course")}" is ready to edit. {len(quest_ids)} projects, {total_lessons} lessons created.',
        link=f'/courses/{course_id}/edit',
        organization_id=organization_id,
        metadata={
            'upload_id': upload_id,
            'course_id': course_id,
            'project_count': len(quest_ids),
            'lessons_count': total_lessons
        }
    )

    logger.info(f"Finalized upload {upload_id}, course {course_id}")


@bp.route('/upload/<upload_id>', methods=['DELETE'])
@require_admin
def delete_upload(user_id, upload_id):
    """
    Delete/cancel a curriculum upload.

    Returns:
        JSON with success status
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify upload exists
        result = supabase.table('curriculum_uploads').select('id, status').eq('id', upload_id).execute()

        if not result.data:
            return jsonify({
                'success': False,
                'error': 'Upload not found'
            }), 404

        # Don't allow deleting approved uploads (quest already created)
        if result.data[0]['status'] == 'approved':
            return jsonify({
                'success': False,
                'error': 'Cannot delete - course already created. Delete the course instead.'
            }), 400

        # Delete the upload record
        supabase.table('curriculum_uploads').delete().eq('id', upload_id).execute()

        return jsonify({
            'success': True,
            'message': 'Upload deleted'
        }), 200

    except Exception as e:
        logger.error(f"Error deleting upload: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to delete: {str(e)}'
        }), 500


@bp.route('/uploads', methods=['GET'])
@require_admin
def list_uploads(user_id):
    """
    List recent curriculum uploads.

    Query params:
    - status: Filter by status (optional)
    - organization_id: Filter by org (optional, for superadmin)
    - limit: Max results (default 20)

    Returns:
        JSON with list of uploads
        - Superadmin sees all uploads with organization info
        - Org admins see only their organization's uploads
    """
    try:
        supabase = get_supabase_admin_client()

        # Get user role and organization
        user_result = supabase.table('users').select('role, organization_id').eq('id', user_id).execute()
        user_role = user_result.data[0]['role'] if user_result.data else None
        user_org_id = user_result.data[0]['organization_id'] if user_result.data else None

        is_superadmin = user_role == 'superadmin'

        status_filter = request.args.get('status')
        org_filter = request.args.get('organization_id')
        limit = min(int(request.args.get('limit', 20)), 100)

        # Build query with organization info for superadmin
        if is_superadmin:
            query = supabase.table('curriculum_uploads').select(
                'id, status, source_type, original_filename, uploaded_at, created_quest_id, created_course_id, '
                'error_message, current_stage_name, current_item, can_resume, progress_percent, '
                'organization_id, organizations(id, name, slug)'
            ).order('uploaded_at', desc=True).limit(limit)

            # Superadmin can filter by specific org
            if org_filter:
                query = query.eq('organization_id', org_filter)
        else:
            # Org admins only see their organization's uploads
            query = supabase.table('curriculum_uploads').select(
                'id, status, source_type, original_filename, uploaded_at, created_quest_id, created_course_id, '
                'error_message, current_stage_name, current_item, can_resume, progress_percent, organization_id'
            ).order('uploaded_at', desc=True).limit(limit)

            if user_org_id:
                query = query.eq('organization_id', user_org_id)
            else:
                # Platform admin without org - only show their own uploads
                query = query.eq('uploaded_by', user_id)

        if status_filter:
            query = query.eq('status', status_filter)

        result = query.execute()

        # Format response
        uploads = result.data
        for upload in uploads:
            # Flatten organization info for easier frontend consumption
            if 'organizations' in upload and upload['organizations']:
                upload['organization_name'] = upload['organizations'].get('name')
                upload['organization_slug'] = upload['organizations'].get('slug')
                del upload['organizations']
            else:
                upload['organization_name'] = None
                upload['organization_slug'] = None

        return jsonify({
            'success': True,
            'uploads': uploads,
            'count': len(uploads),
            'is_superadmin': is_superadmin
        }), 200

    except Exception as e:
        logger.error(f"Error listing uploads: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to list uploads: {str(e)}'
        }), 500


@bp.route('/diagnose', methods=['POST'])
@require_admin
def diagnose_curriculum(user_id):
    """
    Analyze an IMSCC file and report what content will be extracted.

    Use this to verify extraction coverage before processing.
    Does NOT process the file - just analyzes its contents.

    Accepts: multipart/form-data with 'file' field (IMSCC only)

    Returns:
        JSON with diagnostic information:
        {
            'success': bool,
            'total_files': int,
            'resources': {type: {found, extracted}},
            'coverage_estimate': '85%',
            'file_sample': [...]
        }
    """
    try:
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file uploaded. Include an IMSCC file in the "file" field.'
            }), 400

        file = request.files['file']

        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400

        # Only IMSCC files supported for diagnosis
        filename = file.filename.lower()
        if not (filename.endswith('.imscc') or filename.endswith('.zip')):
            return jsonify({
                'success': False,
                'error': 'Only IMSCC files (.imscc or .zip) can be diagnosed'
            }), 400

        # Check file size
        file.seek(0, 2)
        file_size = file.tell()
        file.seek(0)

        if file_size > MAX_FILE_SIZE:
            return jsonify({
                'success': False,
                'error': f'File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB'
            }), 400

        # Read file content
        content = file.read()

        # Get IMSCC parser and run diagnosis
        from services.imscc_parser_service import IMSCCParserService
        parser = IMSCCParserService()
        diagnosis = parser.diagnose_imscc_file(content)

        if not diagnosis.get('success'):
            return jsonify({
                'success': False,
                'error': diagnosis.get('error', 'Diagnosis failed')
            }), 400

        return jsonify({
            'success': True,
            'filename': file.filename,
            'file_size': file_size,
            **diagnosis
        }), 200

    except Exception as e:
        logger.error(f"Error diagnosing curriculum: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Diagnosis failed: {str(e)}'
        }), 500
