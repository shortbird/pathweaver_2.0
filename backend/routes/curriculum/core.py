"""Curriculum read/write endpoints.

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
        # admin client justified: see file docstring; CurriculumPermissionService gates access
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
        # admin client justified: see file docstring; CurriculumPermissionService gates access
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


