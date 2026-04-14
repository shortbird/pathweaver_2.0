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




# Submodule imports trigger route registration on bp:
from . import core  # noqa: F401,E402
from . import attachments  # noqa: F401,E402
from . import lessons  # noqa: F401,E402
from . import progress  # noqa: F401,E402
from . import tasks  # noqa: F401,E402
from . import catalog  # noqa: F401,E402
