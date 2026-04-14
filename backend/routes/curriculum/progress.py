"""Lesson progress read/update/delete.

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



from routes.curriculum import bp


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
        # admin client justified: see file docstring; CurriculumPermissionService gates access
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
        # admin client justified: see file docstring; CurriculumPermissionService gates access
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
        # admin client justified: see file docstring; CurriculumPermissionService gates access
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


