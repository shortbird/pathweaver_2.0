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
from services.curriculum_permission_service import CurriculumPermissionService
from services.file_upload_service import FileUploadService
from utils.logger import get_logger
from utils.ai_access import require_ai_access

logger = get_logger(__name__)

bp = Blueprint('curriculum', __name__, url_prefix='/api/quests')


def _check_read_permission(user_id: str, quest_id: str, supabase) -> bool:
    """Verify read permission using CurriculumPermissionService."""
    permission_service = CurriculumPermissionService(supabase)
    return permission_service.can_read_curriculum(user_id, quest_id)


def _check_edit_permission(user_id: str, quest_id: str, supabase) -> dict:
    """Verify edit permission using CurriculumPermissionService."""
    permission_service = CurriculumPermissionService(supabase)
    result = permission_service.can_edit_curriculum(user_id, quest_id)
    if not result.permitted:
        if result.error_code == 404:
            raise NotFoundError(result.error_message)
        raise ValidationError(result.error_message, result.error_code)
    return result.data


def _check_lesson_edit_permission(user_id: str, lesson_id: str, quest_id: str, supabase) -> dict:
    """Verify lesson edit permission using CurriculumPermissionService."""
    permission_service = CurriculumPermissionService(supabase)
    result = permission_service.can_edit_lesson(user_id, lesson_id, quest_id)
    if not result.permitted:
        if result.error_code == 404:
            raise NotFoundError(result.error_message)
        raise ValidationError(result.error_message, result.error_code)
    return result.data


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

        _check_read_permission(user_id, quest_id, supabase)

        curriculum = service.get_curriculum(quest_id)
        attachments = service.get_attachments(quest_id)

        return jsonify({
            'success': True,
            'quest': curriculum.get('quest') if curriculum else None,
            'curriculum_content': curriculum.get('curriculum_content') if curriculum else None,
            'attachments': attachments
        }), 200

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
    except Exception as e:
        logger.error(f"Error fetching curriculum: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to fetch curriculum'}), 500


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

        quest = _check_edit_permission(user_id, quest_id, supabase)

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400

        content = data.get('curriculum_content') or data.get('content', {})

        content_str = str(content) if not isinstance(content, str) else content
        if len(content_str) > 1000000:
            return jsonify({'error': 'Content too large (max 1MB)'}), 400

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

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
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
        curriculum_service = CurriculumService(supabase)
        upload_service = FileUploadService(supabase)

        quest = _check_edit_permission(user_id, quest_id, supabase)
        organization_id = quest.get('organization_id')

        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        result = upload_service.upload_attachment(
            file_data=file.read(),
            filename=file.filename,
            content_type=file.content_type or 'application/octet-stream',
            quest_id=quest_id,
            user_id=user_id,
            organization_id=organization_id
        )

        if not result.success:
            return jsonify({'error': result.error_message}), 400

        attachment = curriculum_service.add_attachment(
            quest_id=quest_id,
            filename=result.filename,
            file_url=result.url,
            file_size=result.file_size,
            mime_type=file.content_type or 'application/octet-stream',
            user_id=user_id,
            organization_id=organization_id
        )

        return jsonify({
            'success': True,
            'attachment': attachment,
            'message': 'File uploaded successfully'
        }), 201

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
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
        supabase = get_supabase_admin_client()
        upload_service = FileUploadService(supabase)

        _check_edit_permission(user_id, quest_id, supabase)

        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        result = upload_service.upload_image(
            file_data=file.read(),
            filename=file.filename,
            content_type=file.content_type or 'image/jpeg',
            quest_id=quest_id,
            max_width=2000
        )

        if not result.success:
            return jsonify({'error': result.error_message}), 400

        return jsonify({
            'success': True,
            'url': result.url,
            'message': 'Image uploaded successfully'
        }), 201

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
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

        _check_edit_permission(user_id, quest_id, supabase)

        data = request.get_json()
        if not data or 'file_name' not in data:
            return jsonify({'error': 'file_name is required'}), 400

        new_name = data['file_name'].strip()
        if not new_name:
            return jsonify({'error': 'file_name cannot be empty'}), 400

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

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
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

        _check_edit_permission(user_id, quest_id, supabase)

        service.delete_attachment(attachment_id, quest_id)

        return jsonify({
            'success': True,
            'message': 'Attachment deleted successfully'
        }), 200

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
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

        quest = _check_edit_permission(user_id, quest_id, supabase)

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400

        title = data.get('title')
        if not title:
            return jsonify({'error': 'Title is required'}), 400

        user_org_id = quest.get('_user_org')
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

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
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
        permission_service = CurriculumPermissionService(supabase)

        _check_read_permission(user_id, quest_id, supabase)

        # Get user info from permission service
        user_result = supabase.table('users')\
            .select('organization_id, role')\
            .eq('id', user_id)\
            .execute()
        user_org_id = user_result.data[0].get('organization_id') if user_result.data else None
        user_role = user_result.data[0].get('role') if user_result.data else None

        include_unpublished = request.args.get('include_unpublished', 'false').lower() == 'true'

        if include_unpublished:
            _check_edit_permission(user_id, quest_id, supabase)

        lessons = service.get_lessons_for_organization(
            quest_id,
            organization_id=user_org_id,
            include_unpublished=include_unpublished,
            is_superadmin=(user_role == 'superadmin')
        )

        return jsonify({
            'success': True,
            'lessons': lessons
        }), 200

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
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

        _check_lesson_edit_permission(user_id, lesson_id, quest_id, supabase)

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400

        lesson = service.update_lesson(lesson_id, quest_id, user_id, **data)

        return jsonify({
            'success': True,
            'lesson': lesson,
            'message': 'Lesson updated successfully'
        }), 200

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
    except Exception as e:
        logger.error(f"Error updating lesson: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to update lesson'}), 500


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

        _check_lesson_edit_permission(user_id, lesson_id, quest_id, supabase)

        service.delete_lesson(lesson_id, quest_id)

        return jsonify({
            'success': True,
            'message': 'Lesson deleted successfully'
        }), 200

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
    except Exception as e:
        logger.error(f"Error deleting lesson: {str(e)}")
        return jsonify({'error': 'Failed to delete lesson'}), 500


@bp.route('/<quest_id>/curriculum/lessons/<lesson_id>/move', methods=['PUT'])
@require_auth
@rate_limit(limit=20, per=60)
def move_lesson_to_project(user_id: str, quest_id: str, lesson_id: str):
    """
    Move a lesson to a different project within the same course.

    Body:
        target_quest_id (str): The quest/project ID to move the lesson to
        course_id (str, optional): Course ID to validate both projects are in the same course

    Returns:
        200: Lesson moved successfully
        400: Validation error
        403: Permission denied
        404: Lesson not found
    """
    try:
        supabase = get_supabase_admin_client()

        # Check permission on source quest
        _check_lesson_edit_permission(user_id, lesson_id, quest_id, supabase)

        data = request.get_json()
        target_quest_id = data.get('target_quest_id')
        course_id = data.get('course_id')

        if not target_quest_id:
            return jsonify({'error': 'target_quest_id is required'}), 400

        # Validate both quests are in the same course (if course_id provided)
        if course_id:
            source_cq = supabase.table('course_quests').select('id').eq('course_id', course_id).eq('quest_id', quest_id).execute()
            target_cq = supabase.table('course_quests').select('id').eq('course_id', course_id).eq('quest_id', target_quest_id).execute()
            if not source_cq.data or not target_cq.data:
                return jsonify({'error': 'Both projects must be in the same course'}), 400

        # Check permission on target quest
        _check_edit_permission(user_id, target_quest_id, supabase)

        # Get max sequence_order in target
        max_order = supabase.table('curriculum_lessons').select('sequence_order').eq('quest_id', target_quest_id).order('sequence_order', desc=True).limit(1).execute()
        new_order = (max_order.data[0]['sequence_order'] + 1) if max_order.data else 0

        # Update lesson's quest_id
        result = supabase.table('curriculum_lessons').update({
            'quest_id': target_quest_id,
            'sequence_order': new_order
        }).eq('id', lesson_id).eq('quest_id', quest_id).execute()

        if not result.data:
            return jsonify({'error': 'Lesson not found'}), 404

        # Update curriculum_lesson_tasks too
        supabase.table('curriculum_lesson_tasks').update({
            'quest_id': target_quest_id
        }).eq('lesson_id', lesson_id).execute()

        logger.info(f"Lesson {lesson_id} moved from quest {quest_id} to quest {target_quest_id}")

        return jsonify({
            'success': True,
            'lesson': result.data[0]
        }), 200

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
    except Exception as e:
        logger.error(f"Error moving lesson: {str(e)}")
        return jsonify({'error': 'Failed to move lesson'}), 500


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

        quest = _check_edit_permission(user_id, quest_id, supabase)

        data = request.get_json()
        if not data or 'lesson_order' not in data:
            return jsonify({'error': 'lesson_order is required'}), 400

        lesson_order = data.get('lesson_order')
        if not isinstance(lesson_order, list):
            return jsonify({'error': 'lesson_order must be an array'}), 400

        user_org = quest.get('_user_org')
        user_role = quest.get('_user_role')

        if user_role != 'superadmin' and lesson_order:
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

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
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

        _check_read_permission(user_id, quest_id, supabase)

        progress = service.get_lesson_progress(user_id, quest_id)

        return jsonify({
            'success': True,
            'progress': progress
        }), 200

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
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

        _check_read_permission(user_id, quest_id, supabase)

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

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
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

        _check_read_permission(user_id, quest_id, supabase)

        supabase.table('curriculum_lesson_progress').delete().eq('user_id', user_id).eq('lesson_id', lesson_id).execute()

        return jsonify({
            'success': True,
            'message': 'Progress reset successfully'
        }), 200

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
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

        _check_read_permission(user_id, quest_id, supabase)

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

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
    except Exception as e:
        logger.error(f"Error searching lessons: {str(e)}")
        return jsonify({'error': 'Failed to search lessons'}), 500


@bp.route('/<quest_id>/curriculum/lessons/<lesson_id>/generate-tasks', methods=['POST'])
@require_auth
@rate_limit(limit=100, per=3600)  # 100 AI generations per hour (increased for bulk operations)
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
        # Check AI access before proceeding
        ai_access_error = require_ai_access(user_id)
        if ai_access_error:
            return ai_access_error

        supabase = get_supabase_admin_client()
        service = CurriculumLessonService(supabase)

        _check_edit_permission(user_id, quest_id, supabase)

        data = request.get_json()
        if not data or 'lesson_content' not in data:
            return jsonify({'error': 'lesson_content is required'}), 400

        quest_result = supabase.table('quests').select('title, description').eq('id', quest_id).execute()
        quest_title = quest_result.data[0].get('title') if quest_result.data else None
        quest_description = quest_result.data[0].get('description') if quest_result.data else None

        tasks = service.generate_ai_tasks(
            lesson_id=lesson_id,
            lesson_content=data.get('lesson_content'),
            num_tasks=data.get('num_tasks', 5),
            lesson_title=data.get('lesson_title'),
            quest_title=quest_title,
            quest_description=quest_description,
            curriculum_context=data.get('curriculum_context'),
            focus_pillar=data.get('focus_pillar'),
            custom_prompt=data.get('custom_prompt'),
            existing_tasks_context=data.get('existing_tasks_context')
        )

        return jsonify({
            'success': True,
            'tasks': tasks,
            'message': f'Generated {len(tasks)} task suggestions'
        }), 200

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
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

        _check_read_permission(user_id, quest_id, supabase)

        result = supabase.table('user_quest_tasks')\
            .select('id, title, description, pillar, xp_value, order_index, approval_status')\
            .eq('quest_id', quest_id)\
            .order('order_index')\
            .execute()

        tasks = result.data or []

        if tasks:
            task_ids = [t['id'] for t in tasks]

            completions_result = supabase.table('quest_task_completions')\
                .select('task_id, user_quest_task_id')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            completed_task_ids = set()
            for comp in (completions_result.data or []):
                if comp.get('task_id'):
                    completed_task_ids.add(comp['task_id'])
                if comp.get('user_quest_task_id'):
                    completed_task_ids.add(comp['user_quest_task_id'])

            for task in tasks:
                task['is_completed'] = task['id'] in completed_task_ids

        return jsonify({
            'success': True,
            'tasks': tasks
        }), 200

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
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

        _check_edit_permission(user_id, quest_id, supabase)

        data = request.get_json()
        if not data or 'task_id' not in data:
            return jsonify({'error': 'task_id is required'}), 400

        link = service.link_task_to_lesson(lesson_id, data.get('task_id'), quest_id)

        return jsonify({
            'success': True,
            'link': link,
            'message': 'Task linked to lesson successfully'
        }), 201

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
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

        _check_edit_permission(user_id, quest_id, supabase)

        service.unlink_task_from_lesson(lesson_id, task_id)

        return jsonify({
            'success': True,
            'message': 'Task unlinked from lesson successfully'
        }), 200

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
    except Exception as e:
        logger.error(f"Error unlinking task from lesson: {str(e)}")
        return jsonify({'error': 'Failed to unlink task from lesson'}), 500


@bp.route('/<quest_id>/curriculum/lessons/<lesson_id>/create-tasks', methods=['POST'])
@require_auth
@rate_limit(limit=200, per=3600)  # Increased for bulk operations
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

        _check_edit_permission(user_id, quest_id, supabase)

        data = request.get_json()
        if not data or 'tasks' not in data:
            return jsonify({'error': 'tasks array is required'}), 400

        tasks = data.get('tasks', [])
        if not tasks:
            return jsonify({'error': 'At least one task is required'}), 400

        created_tasks = service.create_tasks_from_suggestions(
            quest_id=quest_id,
            lesson_id=lesson_id,
            user_id=user_id,
            tasks=tasks,
            link_to_lesson=data.get('link_to_lesson', True)
        )

        return jsonify({
            'success': True,
            'tasks': created_tasks,
            'message': f'Created {len(created_tasks)} tasks'
        }), 201

    except (ValidationError, AuthorizationError, NotFoundError) as e:
        return jsonify({'error': str(e)}), getattr(e, 'status_code', getattr(e, 'code', 400))
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
