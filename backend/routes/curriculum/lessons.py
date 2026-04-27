"""Lesson CRUD + reorder + move + search.

Split from routes/curriculum.py on 2026-04-14 (Q1).
"""

"""
Curriculum API endpoints for quest curriculum builder.

Handles curriculum content management and file attachments.
Only accessible by school admins and advisors.

ADMIN CLIENT USAGE: Every endpoint in this file uses get_supabase_admin_client()
because curriculum content is org-scoped and edit permission is gated by
CurriculumPermissionService, which is invoked at the top of each endpoint via
_check_read_permission / _check_edit_permission / _check_lesson_edit_permission.
The permission service performs cross-row checks (quest -> course -> course_quests
-> organization, plus user role + org membership) that would require many overlapping
RLS policies to express. Each call site below is annotated `# admin client justified`
to satisfy the H1 audit; the actual access control lives in the permission helpers
above.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from utils.roles import get_effective_role  # A2: org_managed users have actual role in org_role
from middleware.error_handler import ValidationError, AuthorizationError, NotFoundError
from middleware.rate_limiter import rate_limit
from services.curriculum_service import CurriculumService
from services.curriculum_lesson_service import CurriculumLessonService
from services.curriculum_permission_service import CurriculumPermissionService
from services.file_upload_service import FileUploadService
from utils.logger import get_logger
from utils.ai_access import require_ai_access

logger = get_logger(__name__)



from routes.curriculum import (
    bp,
    _check_read_permission,
    _check_edit_permission,
    _check_lesson_edit_permission,
)


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
        # admin client justified: see file docstring; CurriculumPermissionService gates access
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
        user_role = quest.get('_user_role')

        # Allow superadmin to create lessons without org requirement
        if not user_org_id and user_role != 'superadmin':
            return jsonify({'error': 'User must belong to an organization to create lessons'}), 400

        # For superadmin without org, use quest's organization_id or null
        if user_role == 'superadmin' and not user_org_id:
            user_org_id = quest.get('organization_id')

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
        # admin client justified: see file docstring; CurriculumPermissionService gates access
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
        # admin client justified: see file docstring; CurriculumPermissionService gates access
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
        # admin client justified: see file docstring; CurriculumPermissionService gates access
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
        # admin client justified: see file docstring; CurriculumPermissionService gates access
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
        # admin client justified: see file docstring; CurriculumPermissionService gates access
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
        # admin client justified: see file docstring; CurriculumPermissionService gates access
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


