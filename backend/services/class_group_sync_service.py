"""
Class messaging groups: keep one group chat per class, mirroring the roster.

Members are the GUARDIANS of the class's ACTIVE students (role: member) plus its
teachers (role: admin — teachers administer their class group). Students are
deliberately NOT in the class chat: the school's direction (2026-08-22) is that
the class-wide conversation is between the adults, and a student talks to their
teachers over DMs instead (every teacher of their classes is already in their
messaging contacts). A student who is on a roster with no linked guardian adds
nobody — the sync never falls back to adding the student.

"Teacher" means any of the three sources utils.class_membership knows about: the
primary instructor, assistant instructors, and active class_advisors rows.
Guardians come from utils.class_membership.parents_of_students (dependent
accounts via managed_by_parent_id, independent ones via approved
parent_student_links). Linked via group_conversations.source_class_id;
idempotent, so every enrollment write path calls sync_class_group() best-effort
after changing class_enrollments:

    - Schedule Builder add/drop (sis_parent_service)
    - staff direct enrollment (routes/sis/catalog)
    - registration completion (sis_registration_service)
    - waitlist offer acceptance (sis_waitlist_service)

The group is created lazily on the first sync that finds any members. A resync
also REMOVES stale non-admin members (students from the old membership model,
guardians whose children all dropped), so the first sync after this change
sweeps the students out of existing class chats.
"""

from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from utils import class_membership as membership
from utils.logger import get_logger

logger = get_logger(__name__)


def _admin():
    return get_supabase_admin_client()


def sync_class_group(class_id: str, actor_id: Optional[str] = None) -> Optional[str]:
    """Create/sync the class's messaging group from its roster (teachers as
    admins, guardians of active students as members). Returns the group id (or
    None). Never raises — messaging must not break enrollment."""
    try:
        admin = _admin()
        cls = (admin.table('org_classes')
               .select('id, name, organization_id, primary_instructor_id, '
                       'assistant_instructor_ids')
               .eq('id', class_id).limit(1).execute()).data
        if not cls:
            return None
        cls = cls[0]

        student_ids = membership.class_student_ids(class_id)
        parent_ids = membership.parents_of_students(student_ids)
        advisor_ids = membership.class_teacher_ids(class_id, class_row=cls)
        # A guardian who also teaches the class belongs in the admin bucket.
        parent_ids -= advisor_ids

        group_rows = (admin.table('group_conversations').select('id')
                      .eq('source_class_id', class_id).eq('is_active', True)
                      .limit(1).execute()).data
        group_id = group_rows[0]['id'] if group_rows else None

        if not group_id:
            if not (parent_ids or advisor_ids):
                return None
            # Created_by must reference a user; prefer a teacher, else the actor.
            creator = next(iter(advisor_ids), None) or actor_id
            if not creator:
                return None
            name = (cls.get('name') or 'Class')
            created = admin.table('group_conversations').insert({
                'name': f'{name} Class Chat',
                'description': f'Group chat for {name} families and teachers',
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

        # Guardians of enrolled students: present as member.
        for pid in parent_ids:
            if pid not in have:
                admin.table('group_members').insert({
                    'group_id': group_id, 'user_id': pid, 'role': 'member',
                    'added_by': actor_id or next(iter(advisor_ids), pid),
                }).execute()

        # Anyone else leaves the group: students (the pre-2026-08-22 membership),
        # and guardians whose children all dropped. Admins (teachers, staff who
        # joined) are never auto-removed.
        desired = parent_ids | advisor_ids
        for uid, row in have.items():
            if uid not in desired and row.get('role') != 'admin':
                admin.table('group_members').delete().eq('id', row['id']).execute()

        return group_id
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Class group sync failed for class {class_id}: {e}')
        return None
