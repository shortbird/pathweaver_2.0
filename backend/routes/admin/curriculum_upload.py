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
import threading
from flask import Blueprint, request, jsonify, current_app
from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from services.curriculum_upload_service import CurriculumUploadService
from services.notification_service import NotificationService

from utils.logger import get_logger

logger = get_logger(__name__)

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

# Max file size: 100MB
MAX_FILE_SIZE = 100 * 1024 * 1024


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
    """
    try:
        supabase = get_supabase_admin_client()

        logger.info(f"Background processing started for upload {upload_id}")

        # Run the AI pipeline
        result = get_curriculum_service().process_upload(
            source_type=source_type,
            content=content,
            filename=filename,
            options=options
        )

        if not result.get('success'):
            # Update record with error
            supabase.table('curriculum_uploads').update({
                'status': 'error',
                'error_message': result.get('error', 'Processing failed')
            }).eq('id', upload_id).execute()

            # Notify user of failure
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

        # Extract course and lesson data
        preview = result.get('preview', {})
        course_data = preview.get('course', {})
        lessons_data = preview.get('lessons', [])

        # Step 1: Create the course record in 'courses' table
        course_insert = {
            'title': course_data.get('title', 'Untitled Course'),
            'description': course_data.get('description', ''),
            'status': 'draft',  # Draft - not visible to others
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

        # Step 2: Create a quest to hold the lessons
        quest_insert = {
            'title': course_data.get('title', 'Untitled Course'),
            'description': course_data.get('description', ''),
            'big_idea': course_data.get('big_idea', ''),
            'quest_type': 'course',
            'is_active': False,  # Draft
            'is_public': False,
            'created_by': user_id,
            'organization_id': organization_id
        }

        quest_result = supabase.table('quests').insert(quest_insert).execute()

        if not quest_result.data:
            raise Exception("Failed to create quest")

        quest_id = quest_result.data[0]['id']
        logger.info(f"Created quest {quest_id} for course {course_id}")

        # Step 3: Link the quest to the course via course_quests
        course_quest_insert = {
            'course_id': course_id,
            'quest_id': quest_id,
            'sequence_order': 0,
            'is_required': True,
            'is_published': False
        }

        supabase.table('course_quests').insert(course_quest_insert).execute()
        logger.info(f"Linked quest {quest_id} to course {course_id}")

        # Step 4: Create curriculum lessons linked to the quest
        if lessons_data:
            for i, lesson in enumerate(lessons_data):
                lesson_insert = {
                    'quest_id': quest_id,
                    'title': lesson.get('title', f'Lesson {i+1}'),
                    'description': lesson.get('description', ''),
                    'content': lesson.get('curriculum_content', {'version': 2, 'steps': []}),
                    'sequence_order': lesson.get('order_index', i),
                    'is_published': False,
                    'is_required': True,
                    'organization_id': organization_id,
                    'created_by': user_id
                }
                supabase.table('curriculum_lessons').insert(lesson_insert).execute()

            logger.info(f"Created {len(lessons_data)} lessons for quest {quest_id}")

        # Update upload record with success
        supabase.table('curriculum_uploads').update({
            'status': 'approved',
            'created_quest_id': quest_id,  # Keep for backward compatibility
            'generated_content': preview,
            'raw_content': result.get('stages', {}).get('parse', {}),
            'structured_content': result.get('stages', {}).get('structure', {}),
            'aligned_content': result.get('stages', {}).get('alignment', {}),
            'reviewed_by': user_id,
            'reviewed_at': 'now()'
        }).eq('id', upload_id).execute()

        # Send success notification with link to CourseBuilder
        get_notification_service().create_notification(
            user_id=user_id,
            notification_type='system_alert',
            title='Curriculum Ready',
            message=f'"{course_data.get("title", "Your course")}" is ready to edit. {len(lessons_data)} lessons created.',
            link=f'/courses/{course_id}/edit',  # Link to the course, not the quest
            organization_id=organization_id,
            metadata={
                'upload_id': upload_id,
                'course_id': course_id,
                'quest_id': quest_id,
                'lessons_count': len(lessons_data)
            }
        )

        logger.info(f"Background processing complete for upload {upload_id}, course {course_id}")

    except Exception as e:
        logger.error(f"Background processing error for upload {upload_id}: {str(e)}")

        try:
            supabase = get_supabase_admin_client()
            supabase.table('curriculum_uploads').update({
                'status': 'error',
                'error_message': str(e)
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
    - transformation_level: 'light', 'moderate', 'full' (default: 'moderate')
    - preserve_structure: 'true' or 'false' (default: 'true')

    JSON fields:
    - text: Raw curriculum text
    - title: Optional title for the text
    - transformation_level: 'light', 'moderate', 'full' (default: 'moderate')
    - preserve_structure: boolean (default: true)

    Returns:
        JSON with upload_id and status 'processing'
    """
    try:
        supabase = get_supabase_admin_client()

        # Get user's organization
        user_result = supabase.table('users').select('organization_id').eq('id', user_id).execute()
        organization_id = user_result.data[0]['organization_id'] if user_result.data else None

        # Determine input type
        content_type = request.content_type or ''

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

    # Validate file size
    if len(file_content) > MAX_FILE_SIZE:
        return jsonify({
            'success': False,
            'error': f'File too large. Maximum size is 100MB.'
        }), 400

    # Get transformation options
    transformation_level = request.form.get('transformation_level', 'moderate')
    preserve_structure = request.form.get('preserve_structure', 'true').lower() == 'true'

    if transformation_level not in ['light', 'moderate', 'full']:
        transformation_level = 'moderate'

    # Create upload record
    upload_id = str(uuid.uuid4())

    upload_record = {
        'id': upload_id,
        'source_type': source_type,
        'original_filename': file.filename,
        'file_size_bytes': len(file_content),
        'status': 'processing',
        'uploaded_by': user_id,
        'organization_id': organization_id
    }

    supabase.table('curriculum_uploads').insert(upload_record).execute()

    logger.info(f"Admin {user_id} uploading curriculum: {file.filename} ({source_type})")

    # Start background processing
    options = {
        'transformation_level': transformation_level,
        'preserve_structure': preserve_structure
    }

    # Get app reference for background thread
    app = current_app._get_current_object()

    thread = threading.Thread(
        target=_process_curriculum_background,
        args=(app, upload_id, user_id, organization_id, source_type, file_content, file.filename, options),
        daemon=True
    )
    thread.start()

    # Return immediately
    return jsonify({
        'success': True,
        'upload_id': upload_id,
        'status': 'processing',
        'message': 'Processing started. You will receive a notification when your course is ready.'
    }), 202  # 202 Accepted


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
        'organization_id': organization_id
    }

    supabase.table('curriculum_uploads').insert(upload_record).execute()

    logger.info(f"Admin {user_id} uploading curriculum text ({len(text)} chars)")

    # Start background processing
    options = {
        'transformation_level': transformation_level,
        'preserve_structure': preserve_structure
    }

    # Get app reference for background thread
    app = current_app._get_current_object()

    thread = threading.Thread(
        target=_process_curriculum_background,
        args=(app, upload_id, user_id, organization_id, 'text', text.encode('utf-8'), title, options),
        daemon=True
    )
    thread.start()

    # Return immediately
    return jsonify({
        'success': True,
        'upload_id': upload_id,
        'status': 'processing',
        'message': 'Processing started. You will receive a notification when your course is ready.'
    }), 202  # 202 Accepted


@bp.route('/upload/<upload_id>/status', methods=['GET'])
@require_admin
def get_upload_status(user_id, upload_id):
    """
    Get the current status of a curriculum upload.

    Returns:
        JSON with status, quest_id (if complete), and metadata
    """
    try:
        supabase = get_supabase_admin_client()

        result = supabase.table('curriculum_uploads').select(
            'id, status, source_type, original_filename, error_message, uploaded_at, created_quest_id'
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
            'quest_id': upload.get('created_quest_id')  # Available when complete
        }), 200

    except Exception as e:
        logger.error(f"Error getting upload status: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to get status: {str(e)}'
        }), 500


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
    - limit: Max results (default 20)

    Returns:
        JSON with list of uploads
    """
    try:
        supabase = get_supabase_admin_client()

        status_filter = request.args.get('status')
        limit = min(int(request.args.get('limit', 20)), 100)

        query = supabase.table('curriculum_uploads').select(
            'id, status, source_type, original_filename, uploaded_at, created_quest_id'
        ).order('uploaded_at', desc=True).limit(limit)

        if status_filter:
            query = query.eq('status', status_filter)

        result = query.execute()

        return jsonify({
            'success': True,
            'uploads': result.data,
            'count': len(result.data)
        }), 200

    except Exception as e:
        logger.error(f"Error listing uploads: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to list uploads: {str(e)}'
        }), 500
