"""Curriculum catalog reads (projects + available quests).

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
        # admin client justified: see file docstring; CurriculumPermissionService gates access
        supabase = get_supabase_admin_client()

        # Verify user belongs to this organization or is superadmin
        user_result = supabase.table('users')\
            .select('organization_id, role, org_role, org_roles')\
            .eq('id', user_id)\
            .execute()

        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user = user_result.data[0]
        user_org = user.get('organization_id')
        user_role = get_effective_role(user)  # A2: resolves org_managed → real role

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
        # admin client justified: see file docstring; CurriculumPermissionService gates access
        supabase = get_supabase_admin_client()

        # Verify user belongs to this organization or is superadmin
        user_result = supabase.table('users')\
            .select('organization_id, role, org_role, org_roles')\
            .eq('id', user_id)\
            .execute()

        if not user_result.data:
            return jsonify({'error': 'User not found'}), 404

        user = user_result.data[0]
        user_org = user.get('organization_id')
        user_role = get_effective_role(user)  # A2: resolves org_managed → real role

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
