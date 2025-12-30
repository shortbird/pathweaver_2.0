"""
Curriculum API endpoints for quest curriculum builder.

Handles curriculum content management and file attachments.
Only accessible by school admins and advisors.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from middleware.error_handler import ValidationError, AuthorizationError, NotFoundError
from middleware.rate_limiter import rate_limit
from services.curriculum_service import CurriculumService
from services.curriculum_lesson_service import CurriculumLessonService
# Simple file validation - curriculum files (PDFs, docs, images, etc.)
from werkzeug.utils import secure_filename
from utils.logger import get_logger
import uuid

logger = get_logger(__name__)

bp = Blueprint('curriculum', __name__, url_prefix='/api/quests')


# Debug endpoint - remove after testing
@bp.route('/_debug/<quest_id>', methods=['GET'])
def debug_curriculum(quest_id: str):
    """Debug endpoint to test curriculum service without auth."""
    import traceback
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumService(supabase)

        # Test the service
        curriculum = service.get_curriculum(quest_id)
        attachments = service.get_attachments(quest_id)

        return jsonify({
            'success': True,
            'quest': curriculum.get('quest') if curriculum else None,
            'curriculum_content': curriculum.get('curriculum_content') if curriculum else None,
            'attachments': attachments,
            'debug': 'OK'
        }), 200
    except Exception as e:
        tb = traceback.format_exc()
        print(f"DEBUG ERROR: {tb}")
        return jsonify({
            'error': str(e),
            'type': type(e).__name__,
            'traceback': tb
        }), 500


# Debug endpoint for lessons - remove after testing
@bp.route('/_debug_lessons/<quest_id>', methods=['GET'])
def debug_lessons(quest_id: str):
    """Debug endpoint to test lessons service without auth."""
    import traceback
    try:
        supabase = get_supabase_admin_client()
        lesson_service = CurriculumLessonService(supabase)

        # Test the service
        lessons = lesson_service.get_lessons(quest_id, include_unpublished=True)

        return jsonify({
            'success': True,
            'lessons': lessons,
            'count': len(lessons),
            'debug': 'OK'
        }), 200
    except Exception as e:
        tb = traceback.format_exc()
        print(f"DEBUG LESSONS ERROR: {tb}")
        return jsonify({
            'error': str(e),
            'type': type(e).__name__,
            'traceback': tb
        }), 500


def verify_curriculum_read_permission(user_id: str, quest_id: str, supabase) -> bool:
    """
    Verify user can read curriculum for this quest.
    Allows enrolled students, advisors, and admins.

    Args:
        user_id: User ID to check
        quest_id: Quest ID
        supabase: Supabase client

    Returns:
        True if permitted

    Raises:
        ValidationError: If permission denied
    """
    try:
        if not user_id or not quest_id:
            raise ValidationError("Missing user_id or quest_id")

        user_result = supabase.table('users').select('role, organization_id').eq('id', user_id).execute()
        if not user_result.data:
            raise NotFoundError("User not found")
        user = user_result.data[0]

        user_role = user.get('role')
        user_org = user.get('organization_id')

        # Admins, advisors, and teachers can always read
        if user_role in ['superadmin', 'org_admin', 'advisor']:
            return True

        # Check if user is enrolled in quest
        quest_result = supabase.table('quests').select('organization_id').eq('id', quest_id).execute()
        if not quest_result.data:
            raise NotFoundError("Quest not found")
        quest = quest_result.data[0]

        quest_org = quest.get('organization_id')

        # For organization quests, user must be in same org
        # For public quests (no org), anyone can access if enrolled
        if quest_org is not None and quest_org != user_org:
            raise AuthorizationError("You cannot access this quest")

        # Check enrollment (user_quests is the correct table name)
        enrollment = supabase.table('user_quests').select('id').eq('user_id', user_id).eq('quest_id', quest_id).eq('is_active', True).execute()
        if enrollment.data:
            return True

        # Also check if user is enrolled in a course containing this quest
        try:
            course_enrollment = supabase.table('course_enrollments')\
                .select('id, course_id')\
                .eq('user_id', user_id)\
                .eq('status', 'active')\
                .execute()

            if course_enrollment.data:
                course_ids = [e['course_id'] for e in course_enrollment.data]
                if course_ids:
                    quest_in_course = supabase.table('course_quests')\
                        .select('id')\
                        .eq('quest_id', quest_id)\
                        .in_('course_id', course_ids)\
                        .execute()
                    if quest_in_course.data:
                        return True
        except Exception as course_err:
            logger.warning(f"Error checking course enrollment: {course_err}")

        raise AuthorizationError("You must be enrolled in this quest to access curriculum")
    except (ValidationError, AuthorizationError, NotFoundError):
        raise
    except Exception as e:
        logger.error(f"Error checking curriculum read permission: {str(e)}", exc_info=True)
        raise AuthorizationError(f"Permission check failed: {str(e)}")


def verify_curriculum_permission(user_id: str, quest_id: str, supabase) -> dict:
    """
    Verify user has permission to CREATE curriculum for this quest.
    This allows creating org-specific curriculum for any quest.

    Args:
        user_id: User ID to check
        quest_id: Quest ID
        supabase: Supabase client

    Returns:
        Quest data with organization_id and user info

    Raises:
        ValidationError: If permission denied
    """
    try:
        # Get user role and organization
        user_result = supabase.table('users')\
            .select('role, organization_id')\
            .eq('id', user_id)\
            .execute()

        if not user_result.data:
            raise ValidationError("User not found", 404)
        user = user_result.data[0]

        user_role = user.get('role')
        user_org = user.get('organization_id')

        # Check role - allow admins, advisors, teachers, and superadmins
        if user_role not in ['superadmin', 'org_admin', 'advisor']:
            raise ValidationError(
                "Only administrators and advisors can edit curriculum",
                403
            )

        # Get quest organization
        quest_result = supabase.table('quests')\
            .select('organization_id, title')\
            .eq('id', quest_id)\
            .execute()

        if not quest_result.data:
            raise ValidationError("Quest not found", 404)
        quest = quest_result.data[0]

        quest_org = quest.get('organization_id')

        # For org-specific quests, user must be in the same org (unless superadmin)
        if user_role != 'superadmin' and quest_org is not None and quest_org != user_org:
            raise ValidationError(
                "You can only edit curriculum for quests in your organization",
                403
            )

        # Add user info to quest for downstream use
        quest['_user_role'] = user_role
        quest['_user_org'] = user_org

        return quest
    except ValidationError:
        raise
    except Exception as e:
        logger.error(f"Error checking curriculum permission: {str(e)}", exc_info=True)
        raise ValidationError(f"Permission check failed: {str(e)}", 500)


def verify_lesson_edit_permission(user_id: str, lesson_id: str, quest_id: str, supabase) -> dict:
    """
    Verify user has permission to EDIT a specific lesson.
    Users can only edit lessons created by their organization.

    Args:
        user_id: User ID to check
        lesson_id: Lesson ID to edit
        quest_id: Quest ID
        supabase: Supabase client

    Returns:
        Lesson data

    Raises:
        ValidationError: If permission denied
    """
    try:
        # Get user info
        user_result = supabase.table('users')\
            .select('role, organization_id')\
            .eq('id', user_id)\
            .execute()

        if not user_result.data:
            raise ValidationError("User not found", 404)
        user = user_result.data[0]

        user_role = user.get('role')
        user_org = user.get('organization_id')

        # Get lesson info
        lesson_result = supabase.table('curriculum_lessons')\
            .select('id, quest_id, organization_id, created_by')\
            .eq('id', lesson_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if not lesson_result.data:
            raise ValidationError("Lesson not found", 404)
        lesson = lesson_result.data[0]

        lesson_org = lesson.get('organization_id')

        # Superadmins can edit anything
        if user_role == 'superadmin':
            return lesson

        # Non-superadmins can only edit lessons from their organization
        if lesson_org != user_org:
            raise ValidationError(
                "You can only edit curriculum created by your organization",
                403
            )

        return lesson
    except ValidationError:
        raise
    except Exception as e:
        logger.error(f"Error checking lesson edit permission: {str(e)}", exc_info=True)
        raise ValidationError(f"Permission check failed: {str(e)}", 500)


@bp.route('/<quest_id>/curriculum', methods=['GET'])
@require_auth
def get_curriculum(user_id: str, quest_id: str):
    """
    Get curriculum content and attachments for a quest.

    Returns:
        200: Curriculum data with attachments
        404: Quest or curriculum not found
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumService(supabase)

        # Verify read permission (less restrictive than edit)
        verify_curriculum_read_permission(user_id, quest_id, supabase)

        # Get curriculum content
        curriculum = service.get_curriculum(quest_id)

        # Get attachments
        attachments = service.get_attachments(quest_id)

        return jsonify({
            'success': True,
            'quest': curriculum.get('quest') if curriculum else None,
            'curriculum_content': curriculum.get('curriculum_content') if curriculum else None,
            'attachments': attachments
        }), 200

    except ValidationError as e:
        logger.error(f"ValidationError in get_curriculum: {str(e)}")
        return jsonify({'error': str(e), 'error_type': 'validation'}), e.status_code or 400
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logger.error(f"Error fetching curriculum: {str(e)}\n{tb}")
        return jsonify({
            'error': f'Failed to fetch curriculum: {str(e)}',
            'error_type': type(e).__name__,
            'traceback': tb
        }), 500


@bp.route('/<quest_id>/curriculum', methods=['PUT'])
@require_auth
@rate_limit(limit=30, per=60)  # 30 saves per minute
def save_curriculum(user_id: str, quest_id: str):
    """
    Save or update curriculum content for a quest.

    Body:
        content (str): Curriculum content (markdown/HTML)

    Returns:
        200: Curriculum saved successfully
        400: Validation error
        403: Permission denied
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumService(supabase)

        # Verify permission
        quest = verify_curriculum_permission(user_id, quest_id, supabase)

        # Get request data
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400

        # Support both 'content' and 'curriculum_content' keys
        content = data.get('curriculum_content') or data.get('content', {})

        # Validate content length (if string)
        content_str = str(content) if not isinstance(content, str) else content
        if len(content_str) > 1000000:  # 1MB text limit
            return jsonify({'error': 'Content too large (max 1MB)'}), 400

        # Save curriculum
        result = service.save_curriculum(
            quest_id=quest_id,
            content=content,
            user_id=user_id,
            organization_id=quest.get('organization_id')
        )

        return jsonify({
            'success': True,
            'curriculum': result,
            'message': 'Curriculum saved successfully'
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error saving curriculum: {str(e)}")
        return jsonify({'error': 'Failed to save curriculum'}), 500


@bp.route('/<quest_id>/curriculum/attachments', methods=['POST'])
@require_auth
@rate_limit(limit=20, per=3600)  # 20 uploads per hour
def upload_attachment(user_id: str, quest_id: str):
    """
    Upload a curriculum attachment file.

    Accepts multipart/form-data with 'file' field.

    Returns:
        201: File uploaded successfully
        400: Invalid file or validation error
        403: Permission denied
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumService(supabase)

        # Verify permission (returns quest data including organization_id)
        quest = verify_curriculum_permission(user_id, quest_id, supabase)
        organization_id = quest.get('organization_id')  # May be None for public quests

        # Check file provided
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']

        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Validate file type (documents, images, videos)
        allowed_extensions = {
            'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',  # Documents
            'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',  # Images
            'mp4', 'mov', 'avi', 'webm',  # Videos
            'mp3', 'wav', 'm4a',  # Audio
            'zip', 'txt', 'csv'  # Other
        }
        original_filename = file.filename
        file_extension = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else ''

        if file_extension not in allowed_extensions:
            return jsonify({
                'error': f'Invalid file type ".{file_extension}". Allowed: PDF, Word, PowerPoint, Excel, images, videos, audio'
            }), 400

        # Check file size (50MB max for curriculum files)
        file.seek(0, 2)  # Seek to end
        file_size = file.tell()
        file.seek(0)  # Reset to beginning

        max_size = 50 * 1024 * 1024  # 50MB
        if file_size > max_size:
            return jsonify({'error': 'File size exceeds 50MB limit'}), 400

        # Read file content
        file_data = file.read()

        # Sanitize filename
        safe_filename = secure_filename(original_filename)
        if not safe_filename or '..' in safe_filename:
            return jsonify({'error': 'Invalid filename'}), 400

        # Generate unique filename
        file_ext = safe_filename.rsplit('.', 1)[-1] if '.' in safe_filename else 'bin'
        unique_filename = f"{quest_id}_{uuid.uuid4().hex[:12]}.{file_ext}"

        # Create curriculum bucket if needed
        try:
            supabase.storage.create_bucket('curriculum', {'public': True})
            logger.info("Created 'curriculum' storage bucket")
        except Exception as bucket_err:
            # Bucket might already exist, which is fine
            if 'already exists' not in str(bucket_err).lower():
                logger.warning(f"Bucket creation note: {bucket_err}")

        # Upload to storage
        file_path = f"quest_{quest_id}/{unique_filename}"
        try:
            supabase.storage.from_('curriculum').upload(
                file_path,
                file_data,
                {'content-type': file.content_type or 'application/octet-stream'}
            )
        except Exception as upload_err:
            error_msg = str(upload_err)
            if 'not found' in error_msg.lower() or 'bucket' in error_msg.lower():
                logger.error(f"Storage bucket 'curriculum' not found. Please create it in Supabase dashboard.")
                return jsonify({'error': "Storage not configured. Please contact administrator."}), 500
            raise

        # Get public URL
        file_url = supabase.storage.from_('curriculum').get_public_url(file_path)

        # Record attachment in database
        attachment = service.add_attachment(
            quest_id=quest_id,
            filename=original_filename,
            file_url=file_url,
            file_size=len(file_data),
            mime_type=file.content_type or 'application/octet-stream',
            user_id=user_id,
            organization_id=organization_id
        )

        return jsonify({
            'success': True,
            'attachment': attachment,
            'message': 'File uploaded successfully'
        }), 201

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error uploading attachment: {str(e)}")
        return jsonify({'error': 'Failed to upload file'}), 500


@bp.route('/<quest_id>/curriculum/images', methods=['POST'])
@require_auth
@rate_limit(limit=20, per=3600)  # 20 uploads per hour
def upload_image(user_id: str, quest_id: str):
    """
    Upload an image for curriculum lesson blocks.

    Accepts multipart/form-data with 'file' field.
    Images are resized to max 2000px width and uploaded to Supabase storage.

    Returns:
        201: Image uploaded successfully with public URL
        400: Invalid file or validation error
        403: Permission denied
    """
    try:
        import io

        # Try to import PIL for image resizing (optional)
        try:
            from PIL import Image
            PIL_AVAILABLE = True
        except ImportError:
            PIL_AVAILABLE = False
            logger.warning("PIL not available - images will be uploaded without resizing")

        supabase = get_supabase_admin_client()

        # Verify permission
        verify_curriculum_permission(user_id, quest_id, supabase)

        # Check file provided
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']

        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Validate file type (images only)
        allowed_extensions = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
        original_filename = file.filename
        file_extension = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else ''

        if file_extension not in allowed_extensions:
            return jsonify({
                'error': f'Invalid file type ".{file_extension}". Allowed: jpg, jpeg, png, gif, webp'
            }), 400

        # Check file size (25MB max)
        file.seek(0, 2)  # Seek to end
        file_size = file.tell()
        file.seek(0)  # Reset to beginning

        max_size = 25 * 1024 * 1024  # 25MB
        if file_size > max_size:
            return jsonify({'error': 'File size exceeds 25MB limit'}), 400

        # Read and process image
        file_data = file.read()

        # Resize image if PIL is available and image is too large
        if PIL_AVAILABLE:
            try:
                img = Image.open(io.BytesIO(file_data))

                # Resize if width > 2000px
                max_width = 2000
                if img.width > max_width:
                    ratio = max_width / img.width
                    new_height = int(img.height * ratio)
                    img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)

                    # Save resized image
                    output = io.BytesIO()
                    img_format = 'PNG' if file_extension == 'png' else 'JPEG'
                    img.save(output, format=img_format, quality=90, optimize=True)
                    file_data = output.getvalue()
            except Exception as img_error:
                logger.warning(f"Image processing skipped: {img_error}")
                # Continue with original file data

        # Generate unique filename
        unique_filename = f"{uuid.uuid4().hex[:16]}.{file_extension}"

        # Ensure curriculum-images bucket exists
        bucket_name = 'curriculum-images'
        try:
            # Try to get the bucket first
            bucket = supabase.storage.get_bucket(bucket_name)
            if not bucket:
                raise Exception("Bucket not found")
        except Exception:
            # Bucket doesn't exist, create it
            try:
                supabase.storage.create_bucket(
                    bucket_name,
                    options={"public": True}
                )
                logger.info(f"Created '{bucket_name}' storage bucket")
            except Exception as create_err:
                error_str = str(create_err).lower()
                if 'already exists' not in error_str and 'duplicate' not in error_str:
                    logger.warning(f"Bucket creation note: {create_err}")

        # Upload to storage
        file_path = f"quests/{quest_id}/images/{unique_filename}"
        try:
            supabase.storage.from_('curriculum-images').upload(
                file_path,
                file_data,
                {'content-type': file.content_type or 'image/jpeg'}
            )
        except Exception as upload_err:
            error_msg = str(upload_err)
            if 'not found' in error_msg.lower() or 'bucket' in error_msg.lower():
                logger.error(f"Storage bucket 'curriculum-images' not found.")
                return jsonify({'error': "Storage not configured. Please contact administrator."}), 500
            raise

        # Get public URL
        file_url = supabase.storage.from_('curriculum-images').get_public_url(file_path)

        return jsonify({
            'success': True,
            'url': file_url,
            'message': 'Image uploaded successfully'
        }), 201

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error uploading image: {str(e)}")
        return jsonify({'error': 'Failed to upload image'}), 500


@bp.route('/<quest_id>/curriculum/attachments/<attachment_id>', methods=['PATCH'])
@require_auth
def rename_attachment(user_id: str, quest_id: str, attachment_id: str):
    """
    Rename a curriculum attachment.

    Body:
        file_name (str): New file name

    Returns:
        200: Attachment renamed successfully
        403: Permission denied
        404: Attachment not found
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify permission
        verify_curriculum_permission(user_id, quest_id, supabase)

        data = request.get_json()
        if not data or 'file_name' not in data:
            return jsonify({'error': 'file_name is required'}), 400

        new_name = data['file_name'].strip()
        if not new_name:
            return jsonify({'error': 'file_name cannot be empty'}), 400

        # Update attachment name
        result = supabase.table('curriculum_attachments')\
            .update({'file_name': new_name})\
            .eq('id', attachment_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if not result.data:
            return jsonify({'error': 'Attachment not found'}), 404

        return jsonify({
            'success': True,
            'attachment': result.data[0],
            'message': 'Attachment renamed successfully'
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error renaming attachment: {str(e)}")
        return jsonify({'error': 'Failed to rename attachment'}), 500


@bp.route('/<quest_id>/curriculum/attachments/<attachment_id>', methods=['DELETE'])
@require_auth
def delete_attachment(user_id: str, quest_id: str, attachment_id: str):
    """
    Delete a curriculum attachment.

    Returns:
        200: Attachment deleted successfully
        403: Permission denied
        404: Attachment not found
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumService(supabase)

        # Verify permission
        verify_curriculum_permission(user_id, quest_id, supabase)

        # Delete attachment
        service.delete_attachment(attachment_id, quest_id)

        return jsonify({
            'success': True,
            'message': 'Attachment deleted successfully'
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error deleting attachment: {str(e)}")
        return jsonify({'error': 'Failed to delete attachment'}), 500


# ========================================
# Curriculum Lessons Endpoints
# ========================================

@bp.route('/<quest_id>/curriculum/lessons', methods=['POST'])
@require_auth
@rate_limit(limit=30, per=60)
def create_lesson(user_id: str, quest_id: str):
    """
    Create a new curriculum lesson.

    Body:
        title (str): Lesson title
        description (str): Lesson description
        content (dict): Lesson content (JSONB structure)
        sequence_order (int, optional): Order in sequence
        is_published (bool, optional): Whether published (default True)
        is_required (bool, optional): Whether required (default False)
        estimated_duration_minutes (int, optional): Estimated duration
        prerequisite_lesson_ids (list, optional): Prerequisite lesson IDs
        xp_threshold (int, optional): XP students must earn to unlock next lesson

    Returns:
        201: Lesson created successfully
        400: Validation error
        403: Permission denied
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumLessonService(supabase)

        quest = verify_curriculum_permission(user_id, quest_id, supabase)

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400

        title = data.get('title')
        if not title:
            return jsonify({'error': 'Title is required'}), 400

        # Debug logging for content
        logger.info(f"[CREATE_LESSON] Received data keys: {list(data.keys())}")
        logger.info(f"[CREATE_LESSON] Content type: {type(data.get('content'))}")
        content_val = data.get('content')
        if content_val:
            logger.info(f"[CREATE_LESSON] Content preview: {str(content_val)[:200]}")
        else:
            logger.info(f"[CREATE_LESSON] Content is None/empty")

        # Get the creating user's organization_id (required for curriculum_lessons)
        user_result = supabase.table('users').select('organization_id').eq('id', user_id).execute()
        user_org_id = user_result.data[0].get('organization_id') if user_result.data else None

        if not user_org_id:
            return jsonify({'error': 'User must belong to an organization to create lessons'}), 400

        lesson = service.create_lesson(
            quest_id=quest_id,
            title=title,
            description=data.get('description', ''),
            content=data.get('content', {'blocks': []}),
            user_id=user_id,
            organization_id=user_org_id,
            sequence_order=data.get('sequence_order'),
            is_published=data.get('is_published', True),
            is_required=data.get('is_required', False),
            estimated_duration_minutes=data.get('estimated_duration_minutes'),
            prerequisite_lesson_ids=data.get('prerequisite_lesson_ids'),
            xp_threshold=data.get('xp_threshold'),
            video_url=data.get('video_url'),
            files=data.get('files')
        )

        return jsonify({
            'success': True,
            'lesson': lesson,
            'message': 'Lesson created successfully'
        }), 201

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error creating lesson: {str(e)}")
        return jsonify({'error': 'Failed to create lesson'}), 500


@bp.route('/<quest_id>/curriculum/lessons', methods=['GET'])
@require_auth
def get_lessons(user_id: str, quest_id: str):
    """
    Get all lessons for a quest.
    Returns lessons from the user's organization for this quest.

    Query params:
        include_unpublished (bool): Include unpublished lessons (admin only)

    Returns:
        200: List of lessons
        403: Permission denied
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumLessonService(supabase)

        verify_curriculum_read_permission(user_id, quest_id, supabase)

        # Get user's organization_id for filtering
        user_result = supabase.table('users')\
            .select('organization_id, role')\
            .eq('id', user_id)\
            .execute()
        user_org_id = user_result.data[0].get('organization_id') if user_result.data else None
        user_role = user_result.data[0].get('role') if user_result.data else None

        # DEBUG: Log org filtering info
        logger.info(f"[CURRICULUM] get_lessons: user_id={user_id[:8]}..., org_id={user_org_id}, role={user_role}, quest_id={quest_id[:8]}...")

        include_unpublished = request.args.get('include_unpublished', 'false').lower() == 'true'

        if include_unpublished:
            verify_curriculum_permission(user_id, quest_id, supabase)

        # Get lessons filtered by user's organization
        lessons = service.get_lessons_for_organization(
            quest_id,
            organization_id=user_org_id,
            include_unpublished=include_unpublished,
            is_superadmin=(user_role == 'superadmin')
        )

        # DEBUG: Log how many lessons returned
        logger.info(f"[CURRICULUM] get_lessons: Returning {len(lessons)} lessons for org {user_org_id}")

        return jsonify({
            'success': True,
            'lessons': lessons
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error fetching lessons: {str(e)}")
        return jsonify({'error': 'Failed to fetch lessons'}), 500


@bp.route('/<quest_id>/curriculum/lessons/<lesson_id>', methods=['PUT'])
@require_auth
@rate_limit(limit=30, per=60)
def update_lesson(user_id: str, quest_id: str, lesson_id: str):
    """
    Update a curriculum lesson.
    Users can only edit lessons created by their organization.

    Body: Any lesson fields to update

    Returns:
        200: Lesson updated successfully
        400: Validation error
        403: Permission denied
        404: Lesson not found
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumLessonService(supabase)

        # Verify user can edit THIS specific lesson (org ownership check)
        verify_lesson_edit_permission(user_id, lesson_id, quest_id, supabase)

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400

        # Debug logging
        logger.info(f"[UPDATE_LESSON] Received data keys: {list(data.keys())}")
        logger.info(f"[UPDATE_LESSON] Content type: {type(data.get('content'))}, preview: {str(data.get('content'))[:100] if data.get('content') else 'None'}")

        lesson = service.update_lesson(lesson_id, quest_id, user_id, **data)

        return jsonify({
            'success': True,
            'lesson': lesson,
            'message': 'Lesson updated successfully'
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logger.error(f"Error updating lesson: {str(e)}\n{tb}")
        return jsonify({'error': f'Failed to update lesson: {str(e)}'}), 500


@bp.route('/<quest_id>/curriculum/lessons/<lesson_id>', methods=['DELETE'])
@require_auth
def delete_lesson(user_id: str, quest_id: str, lesson_id: str):
    """
    Delete a curriculum lesson.
    Users can only delete lessons created by their organization.

    Returns:
        200: Lesson deleted successfully
        403: Permission denied
        404: Lesson not found
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumLessonService(supabase)

        # Verify user can delete THIS specific lesson (org ownership check)
        verify_lesson_edit_permission(user_id, lesson_id, quest_id, supabase)

        service.delete_lesson(lesson_id, quest_id)

        return jsonify({
            'success': True,
            'message': 'Lesson deleted successfully'
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error deleting lesson: {str(e)}")
        return jsonify({'error': 'Failed to delete lesson'}), 500


@bp.route('/<quest_id>/curriculum/lessons/reorder', methods=['PUT'])
@require_auth
@rate_limit(limit=20, per=60)
def reorder_lessons(user_id: str, quest_id: str):
    """
    Reorder lessons within a quest.
    Users can only reorder lessons from their own organization.

    Body:
        lesson_order (list): Ordered list of lesson IDs

    Returns:
        200: Lessons reordered successfully
        400: Validation error
        403: Permission denied
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumLessonService(supabase)

        quest = verify_curriculum_permission(user_id, quest_id, supabase)

        data = request.get_json()
        if not data or 'lesson_order' not in data:
            return jsonify({'error': 'lesson_order is required'}), 400

        lesson_order = data.get('lesson_order')
        if not isinstance(lesson_order, list):
            return jsonify({'error': 'lesson_order must be an array'}), 400

        # Verify all lessons being reordered belong to user's organization
        user_org = quest.get('_user_org')
        user_role = quest.get('_user_role')

        if user_role != 'superadmin' and lesson_order:
            # Check that all lessons belong to user's org
            lessons_result = supabase.table('curriculum_lessons')\
                .select('id, organization_id')\
                .in_('id', lesson_order)\
                .execute()

            for lesson in (lessons_result.data or []):
                if lesson.get('organization_id') != user_org:
                    raise ValidationError(
                        "You can only reorder lessons from your organization",
                        403
                    )

        lessons = service.reorder_lessons(quest_id, lesson_order)

        return jsonify({
            'success': True,
            'lessons': lessons,
            'message': 'Lessons reordered successfully'
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error reordering lessons: {str(e)}")
        return jsonify({'error': 'Failed to reorder lessons'}), 500


@bp.route('/<quest_id>/curriculum/progress', methods=['GET'])
@require_auth
def get_lesson_progress(user_id: str, quest_id: str):
    """
    Get user's progress for all lessons in a quest.

    Returns:
        200: Progress records
        403: Permission denied
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumLessonService(supabase)

        verify_curriculum_read_permission(user_id, quest_id, supabase)

        progress = service.get_lesson_progress(user_id, quest_id)

        return jsonify({
            'success': True,
            'progress': progress
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error fetching lesson progress: {str(e)}")
        return jsonify({'error': 'Failed to fetch lesson progress'}), 500


@bp.route('/<quest_id>/curriculum/progress/<lesson_id>', methods=['POST'])
@require_auth
@rate_limit(limit=60, per=60)
def update_lesson_progress(user_id: str, quest_id: str, lesson_id: str):
    """
    Update user's progress for a lesson.

    Body:
        status (str, optional): 'not_started', 'in_progress', or 'completed'
        progress_percentage (int, optional): 0-100
        time_spent_seconds (int, optional): Time spent in seconds
        last_position (dict, optional): Last position data

    Returns:
        200: Progress updated successfully
        400: Validation error
        403: Permission denied
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumLessonService(supabase)

        verify_curriculum_read_permission(user_id, quest_id, supabase)

        user = supabase.table('users').select('organization_id').eq('id', user_id).single().execute()
        organization_id = user.data.get('organization_id')

        data = request.get_json() or {}

        progress = service.update_lesson_progress(
            user_id=user_id,
            lesson_id=lesson_id,
            quest_id=quest_id,
            organization_id=organization_id,
            status=data.get('status'),
            progress_percentage=data.get('progress_percentage'),
            time_spent_seconds=data.get('time_spent_seconds'),
            last_position=data.get('last_position')
        )

        return jsonify({
            'success': True,
            'progress': progress,
            'message': 'Progress updated successfully'
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error updating lesson progress: {str(e)}")
        return jsonify({'error': 'Failed to update lesson progress'}), 500


@bp.route('/<quest_id>/curriculum/progress/<lesson_id>', methods=['DELETE'])
@require_auth
def delete_lesson_progress(user_id: str, quest_id: str, lesson_id: str):
    """
    Delete/reset user's progress for a lesson.

    Returns:
        200: Progress deleted successfully
        403: Permission denied
        404: Progress not found
    """
    try:
        supabase = get_supabase_admin_client()

        verify_curriculum_read_permission(user_id, quest_id, supabase)

        # Delete the progress record
        result = supabase.table('curriculum_lesson_progress').delete().eq('user_id', user_id).eq('lesson_id', lesson_id).execute()

        return jsonify({
            'success': True,
            'message': 'Progress reset successfully'
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error deleting lesson progress: {str(e)}")
        return jsonify({'error': 'Failed to reset lesson progress'}), 500


@bp.route('/<quest_id>/curriculum/lessons/search', methods=['GET'])
@require_auth
def search_lessons(user_id: str, quest_id: str):
    """
    Search lessons using full-text search.

    Query params:
        q (str): Search query
        limit (int, optional): Max results (default 20)

    Returns:
        200: Search results
        400: Validation error
        403: Permission denied
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumLessonService(supabase)

        verify_curriculum_read_permission(user_id, quest_id, supabase)

        query = request.args.get('q', '').strip()
        if not query:
            return jsonify({'error': 'Search query (q) is required'}), 400

        limit = int(request.args.get('limit', 20))

        results = service.search_lessons(quest_id, query, limit)

        return jsonify({
            'success': True,
            'results': results,
            'query': query
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error searching lessons: {str(e)}")
        return jsonify({'error': 'Failed to search lessons'}), 500


@bp.route('/<quest_id>/curriculum/lessons/<lesson_id>/generate-tasks', methods=['POST'])
@require_auth
@rate_limit(limit=10, per=3600)  # 10 AI generations per hour
def generate_ai_tasks(user_id: str, quest_id: str, lesson_id: str):
    """
    Generate task suggestions from lesson content using AI with curriculum context.

    Body:
        lesson_content (str): Lesson content text
        num_tasks (int, optional): Number of tasks to generate (default 5)
        lesson_title (str, optional): Lesson title for context
        curriculum_context (str, optional): Additional curriculum context
        focus_pillar (str, optional): Pillar to focus tasks on
        custom_prompt (str, optional): Custom instructions for task generation
        existing_tasks_context (str, optional): Context about existing tasks

    Returns:
        200: Generated tasks
        400: Validation error
        403: Permission denied
        503: AI not available
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumLessonService(supabase)

        verify_curriculum_permission(user_id, quest_id, supabase)

        data = request.get_json()
        if not data or 'lesson_content' not in data:
            return jsonify({'error': 'lesson_content is required'}), 400

        lesson_content = data.get('lesson_content')
        num_tasks = data.get('num_tasks', 5)
        lesson_title = data.get('lesson_title')
        curriculum_context = data.get('curriculum_context')
        focus_pillar = data.get('focus_pillar')
        custom_prompt = data.get('custom_prompt')
        existing_tasks_context = data.get('existing_tasks_context')

        # Get quest info for context
        quest_result = supabase.table('quests').select('title, description').eq('id', quest_id).execute()
        quest_title = None
        quest_description = None
        if quest_result.data:
            quest_title = quest_result.data[0].get('title')
            quest_description = quest_result.data[0].get('description')

        tasks = service.generate_ai_tasks(
            lesson_id=lesson_id,
            lesson_content=lesson_content,
            num_tasks=num_tasks,
            lesson_title=lesson_title,
            quest_title=quest_title,
            quest_description=quest_description,
            curriculum_context=curriculum_context,
            focus_pillar=focus_pillar,
            custom_prompt=custom_prompt,
            existing_tasks_context=existing_tasks_context
        )

        return jsonify({
            'success': True,
            'tasks': tasks,
            'message': f'Generated {len(tasks)} task suggestions'
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error generating AI tasks: {str(e)}")
        return jsonify({'error': 'Failed to generate AI tasks'}), 500


@bp.route('/<quest_id>/tasks', methods=['GET'])
@require_auth
def get_quest_tasks(user_id: str, quest_id: str):
    """
    Get all tasks for a quest (for curriculum task linking).
    Includes completion status for the current user.

    Returns:
        200: List of quest tasks with is_completed field
        403: Permission denied
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify user has curriculum permission for this quest
        verify_curriculum_read_permission(user_id, quest_id, supabase)

        # Get all tasks for this quest
        result = supabase.table('user_quest_tasks')\
            .select('id, title, description, pillar, xp_value, order_index, approval_status')\
            .eq('quest_id', quest_id)\
            .order('order_index')\
            .execute()

        tasks = result.data or []

        if tasks:
            # Get task IDs
            task_ids = [t['id'] for t in tasks]

            # Get completion status for current user
            completions_result = supabase.table('quest_task_completions')\
                .select('task_id, user_quest_task_id')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            # Create set of completed task IDs (check both task_id and user_quest_task_id)
            completed_task_ids = set()
            for comp in (completions_result.data or []):
                if comp.get('task_id'):
                    completed_task_ids.add(comp['task_id'])
                if comp.get('user_quest_task_id'):
                    completed_task_ids.add(comp['user_quest_task_id'])

            # Add is_completed field to each task
            for task in tasks:
                task['is_completed'] = task['id'] in completed_task_ids

        return jsonify({
            'success': True,
            'tasks': tasks
        }), 200

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'code', 400)
    except Exception as e:
        logger.error(f"Error fetching quest tasks: {str(e)}")
        return jsonify({'error': 'Failed to fetch quest tasks'}), 500


@bp.route('/<quest_id>/curriculum/lessons/<lesson_id>/link-task', methods=['POST'])
@require_auth
@rate_limit(limit=30, per=60)
def link_task_to_lesson(user_id: str, quest_id: str, lesson_id: str):
    """
    Link an existing quest task to a lesson.

    Body:
        task_id (str): Task ID to link

    Returns:
        201: Task linked successfully
        400: Validation error
        403: Permission denied
        404: Task or lesson not found
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumLessonService(supabase)

        verify_curriculum_permission(user_id, quest_id, supabase)

        data = request.get_json()
        if not data or 'task_id' not in data:
            return jsonify({'error': 'task_id is required'}), 400

        task_id = data.get('task_id')

        link = service.link_task_to_lesson(lesson_id, task_id, quest_id)

        return jsonify({
            'success': True,
            'link': link,
            'message': 'Task linked to lesson successfully'
        }), 201

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error linking task to lesson: {str(e)}")
        return jsonify({'error': 'Failed to link task to lesson'}), 500


@bp.route('/<quest_id>/curriculum/lessons/<lesson_id>/link-task/<task_id>', methods=['DELETE'])
@require_auth
def unlink_task_from_lesson(user_id: str, quest_id: str, lesson_id: str, task_id: str):
    """
    Unlink a task from a lesson.

    Returns:
        200: Task unlinked successfully
        403: Permission denied
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumLessonService(supabase)

        verify_curriculum_permission(user_id, quest_id, supabase)

        service.unlink_task_from_lesson(lesson_id, task_id)

        return jsonify({
            'success': True,
            'message': 'Task unlinked from lesson successfully'
        }), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error unlinking task from lesson: {str(e)}")
        return jsonify({'error': 'Failed to unlink task from lesson'}), 500


@bp.route('/<quest_id>/curriculum/lessons/<lesson_id>/create-tasks', methods=['POST'])
@require_auth
@rate_limit(limit=20, per=3600)
def create_curriculum_tasks(user_id: str, quest_id: str, lesson_id: str):
    """
    Create tasks from AI-generated suggestions and optionally link them to the lesson.

    Body:
        tasks (list): Array of task objects with title, description, pillar, xp_value, evidence_prompt
        link_to_lesson (bool, optional): Whether to link created tasks to the lesson (default True)

    Returns:
        201: Tasks created successfully
        400: Validation error
        403: Permission denied
    """
    try:
        supabase = get_supabase_admin_client()
        service = CurriculumLessonService(supabase)

        quest = verify_curriculum_permission(user_id, quest_id, supabase)

        data = request.get_json()
        if not data or 'tasks' not in data:
            return jsonify({'error': 'tasks array is required'}), 400

        tasks = data.get('tasks', [])
        link_to_lesson = data.get('link_to_lesson', True)

        if not tasks:
            return jsonify({'error': 'At least one task is required'}), 400

        # Get or create user_quest enrollment for the creating user
        enrollment = supabase.table('user_quests')\
            .select('id')\
            .eq('user_id', user_id)\
            .eq('quest_id', quest_id)\
            .eq('is_active', True)\
            .execute()

        if enrollment.data:
            user_quest_id = enrollment.data[0]['id']
        else:
            # Create enrollment for the user
            from datetime import datetime
            new_enrollment = supabase.table('user_quests').insert({
                'user_id': user_id,
                'quest_id': quest_id,
                'started_at': datetime.utcnow().isoformat(),
                'is_active': True,
                'personalization_completed': True
            }).execute()

            if not new_enrollment.data:
                return jsonify({'error': 'Failed to create quest enrollment'}), 500
            user_quest_id = new_enrollment.data[0]['id']

        # Get current max order_index for quest tasks
        existing_tasks = supabase.table('user_quest_tasks')\
            .select('order_index')\
            .eq('quest_id', quest_id)\
            .order('order_index', desc=True)\
            .limit(1)\
            .execute()
        max_order = existing_tasks.data[0]['order_index'] if existing_tasks.data else 0

        created_tasks = []
        valid_pillars = ['stem', 'wellness', 'communication', 'civics', 'art']

        for i, task in enumerate(tasks):
            title = task.get('title')
            if not title:
                continue

            pillar = task.get('pillar', 'stem').lower()
            if pillar not in valid_pillars:
                pillar = 'stem'

            xp_value = task.get('xp_value', 100)
            xp_value = max(50, min(300, int(xp_value)))

            # Build task data with only columns that exist in user_quest_tasks
            task_data = {
                'user_id': user_id,
                'quest_id': quest_id,
                'user_quest_id': user_quest_id,
                'title': title,
                'description': task.get('description', ''),
                'pillar': pillar,
                'xp_value': xp_value,
                'order_index': max_order + i + 1,
                'is_required': False,
                'is_manual': False,
                'approval_status': 'approved'
            }

            result = supabase.table('user_quest_tasks').insert(task_data).execute()

            if result.data:
                created_task = result.data[0]
                created_tasks.append(created_task)

                # Link to lesson if requested
                if link_to_lesson:
                    try:
                        service.link_task_to_lesson(lesson_id, created_task['id'], quest_id)
                    except Exception as link_err:
                        logger.warning(f"Failed to link task to lesson: {link_err}")

        logger.info(f"Created {len(created_tasks)} curriculum tasks for quest {quest_id}")

        return jsonify({
            'success': True,
            'tasks': created_tasks,
            'message': f'Created {len(created_tasks)} tasks'
        }), 201

    except ValidationError as e:
        return jsonify({'error': str(e)}), e.status_code or 400
    except Exception as e:
        logger.error(f"Error creating curriculum tasks: {str(e)}")
        return jsonify({'error': 'Failed to create tasks'}), 500


# ========================================
# Organization Curriculum Projects Endpoint
# ========================================

@bp.route('/curriculum-projects/<org_id>', methods=['GET'])
@require_auth
def get_curriculum_projects(user_id: str, org_id: str):
    """
    Get all curriculum projects for an organization.
    A curriculum project is a quest that has at least one lesson in curriculum_lessons.

    Returns:
        200: List of quests with curriculum (includes lesson count)
        403: Permission denied
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify user belongs to this organization or is superadmin
        user_result = supabase.table('users')\
            .select('organization_id, role')\
            .eq('id', user_id)\
            .execute()

        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user = user_result.data[0]
        user_org = user.get('organization_id')
        user_role = user.get('role')

        # Must be in same org or superadmin
        if user_org != org_id and user_role != 'superadmin':
            return jsonify({'error': 'Permission denied'}), 403

        # Must be advisor, admin, or superadmin
        if user_role not in ['advisor', 'org_admin', 'superadmin']:
            return jsonify({'error': 'Permission denied'}), 403

        # Get all quest IDs that have lessons for this organization
        lessons_result = supabase.table('curriculum_lessons')\
            .select('quest_id')\
            .eq('organization_id', org_id)\
            .execute()

        # Count lessons per quest
        quest_lesson_counts = {}
        for lesson in lessons_result.data:
            quest_id = lesson['quest_id']
            quest_lesson_counts[quest_id] = quest_lesson_counts.get(quest_id, 0) + 1

        quest_ids = list(quest_lesson_counts.keys())

        if not quest_ids:
            return jsonify({
                'success': True,
                'projects': [],
                'message': 'No curriculum projects found'
            }), 200

        # Get quest details for quests with lessons
        quests_result = supabase.table('quests')\
            .select('id, title, description, quest_type, is_active, is_public, header_image_url, organization_id, created_at')\
            .in_('id', quest_ids)\
            .order('created_at', desc=True)\
            .execute()

        # Build response with lesson counts
        projects = []
        for quest in quests_result.data:
            quest['lesson_count'] = quest_lesson_counts.get(quest['id'], 0)
            projects.append(quest)

        return jsonify({
            'success': True,
            'projects': projects
        }), 200

    except Exception as e:
        logger.error(f"Error fetching curriculum projects: {str(e)}")
        return jsonify({'error': 'Failed to fetch curriculum projects'}), 500


@bp.route('/available-quests/<org_id>', methods=['GET'])
@require_auth
def get_available_quests_for_curriculum(user_id: str, org_id: str):
    """
    Get quests available for adding curriculum.
    Returns quests that do NOT have any curriculum lessons yet.
    Filters based on organization's quest visibility policy.

    Returns:
        200: List of quests without curriculum
        403: Permission denied
    """
    try:
        supabase = get_supabase_admin_client()

        # Verify user belongs to this organization or is superadmin
        user_result = supabase.table('users')\
            .select('organization_id, role')\
            .eq('id', user_id)\
            .execute()

        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user = user_result.data[0]
        user_org = user.get('organization_id')
        user_role = user.get('role')

        # Must be in same org or superadmin
        if user_org != org_id and user_role != 'superadmin':
            return jsonify({'error': 'Permission denied'}), 403

        # Must be advisor, admin, or superadmin
        if user_role not in ['advisor', 'org_admin', 'superadmin']:
            return jsonify({'error': 'Permission denied'}), 403

        # Get quest IDs that already have lessons for this org
        lessons_result = supabase.table('curriculum_lessons')\
            .select('quest_id')\
            .eq('organization_id', org_id)\
            .execute()

        quests_with_curriculum = {lesson['quest_id'] for lesson in lessons_result.data}

        # Fetch only public, active quests
        quests_result = supabase.table('quests')\
            .select('id, title, description, quest_type, is_active, is_public, organization_id')\
            .eq('is_active', True)\
            .eq('is_public', True)\
            .order('title')\
            .execute()

        # Exclude quests that already have curriculum for this org
        available_quests = [
            quest for quest in quests_result.data
            if quest['id'] not in quests_with_curriculum
        ]

        return jsonify({
            'success': True,
            'quests': available_quests
        }), 200

    except Exception as e:
        logger.error(f"Error fetching available quests: {str(e)}")
        return jsonify({'error': 'Failed to fetch available quests'}), 500
