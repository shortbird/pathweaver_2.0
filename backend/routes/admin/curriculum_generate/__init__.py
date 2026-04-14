"""
Admin Course Generation Routes
==============================

Multi-stage AI course generation wizard endpoints.
Creates hands-on, action-oriented courses through a 4-stage process.

Stages:
1. Outline - Generate course title and project outlines (3 alternatives)
2. Lessons - Generate lessons for each project
3. Tasks - Generate task suggestions for each lesson
4. Finalize - Publish the course

Endpoints:
- POST /api/admin/curriculum/generate/outline - Stage 1: Generate outline alternatives
- POST /api/admin/curriculum/generate/outline/select - Select outline and create draft
- GET /api/admin/curriculum/generate/<id> - Get current generation state
- POST /api/admin/curriculum/generate/<id>/lessons - Stage 2: Generate all lessons
- POST /api/admin/curriculum/generate/<id>/tasks - Stage 3: Generate all tasks
- POST /api/admin/curriculum/generate/<id>/finalize - Stage 4: Publish course
- POST /api/admin/curriculum/generate/<id>/regenerate-outline - Regenerate outline alternatives
- POST /api/admin/curriculum/generate/<id>/regenerate-lesson/<lesson_id> - Regenerate lesson
- POST /api/admin/curriculum/generate/<id>/regenerate-tasks/<lesson_id> - Regenerate tasks
- DELETE /api/admin/curriculum/generate/<id> - Delete draft course
"""

import threading
import time

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_role
from services.course_generation_service import CourseGenerationService
from services.course_generation_job_service import CourseGenerationJobService
from services.base_ai_service import AIGenerationError

from utils.logger import get_logger

logger = get_logger(__name__)

# Progress tracker for fix-images background job
_fix_images_progress = {
    'running': False,
    'total': 0,
    'completed': 0,
    'errors': 0,
    'logs': []
}

bp = Blueprint('admin_curriculum_generate', __name__, url_prefix='/api/admin/curriculum/generate')




def get_organization_id(user_id: str) -> str:
    """Get organization ID for user. Returns None for superadmin (platform-level courses)."""
    # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
    supabase = get_supabase_admin_client()
    user = supabase.table('users').select('organization_id, role').eq('id', user_id).execute()

    if not user.data:
        raise Exception("User not found")

    # Superadmin creates platform-level courses (no organization)
    if user.data[0].get('role') == 'superadmin':
        return None

    # For org users, return their organization
    if user.data[0].get('organization_id'):
        return user.data[0]['organization_id']

    # Platform users without org - return None for platform-level content
    return None



# Submodule imports trigger route registration on bp:
from . import outline  # noqa: F401,E402
from . import lessons  # noqa: F401,E402
from . import tasks  # noqa: F401,E402
from . import project  # noqa: F401,E402
from . import finalize  # noqa: F401,E402
from . import jobs  # noqa: F401,E402
from . import bulk  # noqa: F401,E402
