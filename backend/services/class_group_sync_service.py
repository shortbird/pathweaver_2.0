"""
Class messaging groups: keep one group chat per class, mirroring the roster.

Members are the class's ACTIVE students (role: member) plus its advisors
(role: admin — teachers administer their class group). Linked via
group_conversations.source_class_id; idempotent, so every enrollment write path
calls sync_class_group() best-effort after changing class_enrollments:

    - Schedule Builder add/drop (sis_parent_service)
    - staff direct enrollment (routes/sis/catalog)
    - registration completion (sis_registration_service)
    - waitlist offer acceptance (sis_waitlist_service)

The group is created lazily on the first sync that finds any members.
"""

from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


def _admin():
    return get_supabase_admin_client()


def sync_class_group(class_id: str, actor_id: Optional[str] = None) -> Optional[str]:
    """Create/sync the class's messaging group from its roster. Returns the
    group id (or None). Never raises — messaging must not break enrollment."""
    try:
        admin = _admin()
        cls = (admin.table('org_classes')
               .select('id, name, organization_id')
               .eq('id', class_id).limit(1).execute()).data
        if not cls:
            return None
        cls = cls[0]

        student_ids = {
            r['student_id'] for r in (
                admin.table('class_enrollments').select('student_id, status')
                .eq('class_id', class_id).eq('status', 'active').execute()
            ).data or [] if r.get('student_id')
        }
        advisor_ids = {
            r['advisor_id'] for r in (
                admin.table('class_advisors').select('advisor_id')
                .eq('class_id', class_id).execute()
            ).data or [] if r.get('advisor_id')
        }

        group_rows = (admin.table('group_conversations').select('id')
                      .eq('source_class_id', class_id).eq('is_active', True)
                      .limit(1).execute()).data
        group_id = group_rows[0]['id'] if group_rows else None

        if not group_id:
            if not (student_ids or advisor_ids):
                return None
            # Created_by must reference a user; prefer a teacher, else the actor.
            creator = next(iter(advisor_ids), None) or actor_id
            if not creator:
                return None
            name = (cls.get('name') or 'Class')
            created = admin.table('group_conversations').insert({
                'name': f'{name} Class Chat',
                'description': f'Group chat for {name}',
                'created_by': creator,
                'organization_id': cls.get('organization_id'),
                'source_class_id': class_id,
                'is_active': True,
            }).execute()
            group_id = created.data[0]['id']

        have = {
            m['user_id']: m for m in (
                admin.table('group_members').select('id, user_id, role')
                .eq('group_id', group_id).execute()
            ).data or []
        }

        # Teachers: present as admin (add or upgrade).
        for aid in advisor_ids:
            row = have.get(aid)
            if not row:
                admin.table('group_members').insert({
                    'group_id': group_id, 'user_id': aid, 'role': 'admin',
                    'added_by': actor_id or aid,
                }).execute()
            elif row.get('role') != 'admin':
                admin.table('group_members').update({'role': 'admin'}).eq('id', row['id']).execute()

        # Students: present as member.
        for sid in student_ids:
            if sid not in have and sid not in advisor_ids:
                admin.table('group_members').insert({
                    'group_id': group_id, 'user_id': sid, 'role': 'member',
                    'added_by': actor_id or next(iter(advisor_ids), sid),
                }).execute()

        # Dropped students leave the group. Admins (teachers, staff who joined)
        # are never auto-removed.
        desired = student_ids | advisor_ids
        for uid, row in have.items():
            if uid not in desired and row.get('role') != 'admin':
                admin.table('group_members').delete().eq('id', row['id']).execute()

        return group_id
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Class group sync failed for class {class_id}: {e}')
        return None
