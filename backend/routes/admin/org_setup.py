"""
Organization Setup Status Routes

Powers the org admin "Getting Started" checklist: reports whether the
organization has teachers, students, parents, classes, class quests, and
parent-student links yet. Read-only aggregation.
"""

from flask import Blueprint, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_org_admin
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('org_setup', __name__, url_prefix='/api/admin/organizations')


def _org_role_set(user):
    """All org roles a member carries (org_roles array plus legacy org_role)"""
    roles = user.get('org_roles')
    if not isinstance(roles, list):
        roles = []
    legacy = user.get('org_role')
    if legacy:
        roles = roles + [legacy]
    return {r for r in roles if r}


@bp.route('/<org_id>/setup-status', methods=['GET'])
@require_org_admin
def get_setup_status(current_user_id, current_org_id, is_superadmin, org_id):
    """
    Aggregate counts for the org admin Getting Started checklist.

    Returns:
    {
        "success": true,
        "counts": {
            "teachers": 2, "students": 38, "parents": 20,
            "classes": 3, "class_quests": 5,
            "parent_links": 17, "pending_invitations": 4
        }
    }
    """
    if not is_superadmin and current_org_id != org_id:
        return jsonify({'success': False, 'error': 'Access denied'}), 403

    # admin client justified: admin-only route (@require_org_admin) — org-scoped read-only aggregation for the setup checklist
    supabase = get_supabase_admin_client()

    try:
        members = supabase.table('users')\
            .select('id, org_role, org_roles')\
            .eq('organization_id', org_id)\
            .execute().data or []

        teachers = students = parents = 0
        student_ids = []
        for member in members:
            roles = _org_role_set(member)
            if 'advisor' in roles:
                teachers += 1
            if 'student' in roles:
                students += 1
                student_ids.append(member['id'])
            if 'parent' in roles:
                parents += 1

        # Paged: class_ids drives the counts below, so a silently truncated read
        # here would undercount everything downstream.
        classes = fetch_all_rows(lambda: (
            supabase.table('org_classes')
            .select('id')
            .eq('organization_id', org_id)
            .eq('status', 'active')))
        class_ids = [c['id'] for c in classes]

        # These are counts, so let Postgres count (head=True transfers no rows).
        # Fetching rows to call len() on them is wrong once an org outgrows the
        # 1000-row cap — the number silently stops growing. See CLAUDE.md rule 9.
        class_quests = 0
        if class_ids:
            class_quests = supabase.table('class_quests')\
                .select('id', count='exact', head=True)\
                .in_('class_id', class_ids)\
                .execute().count or 0

        parent_links = 0
        if student_ids:
            parent_links = supabase.table('parent_student_links')\
                .select('id', count='exact', head=True)\
                .in_('student_user_id', student_ids)\
                .execute().count or 0

        pending_invitations = supabase.table('org_invitations')\
            .select('id', count='exact', head=True)\
            .eq('organization_id', org_id)\
            .eq('status', 'pending')\
            .execute().count or 0

        return jsonify({
            'success': True,
            'counts': {
                'teachers': teachers,
                'students': students,
                'parents': parents,
                'classes': len(classes),
                'class_quests': class_quests,
                'parent_links': parent_links,
                'pending_invitations': pending_invitations
            }
        })

    except Exception as e:
        logger.error(f"Error building setup status for org {org_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to load setup status'}), 500
