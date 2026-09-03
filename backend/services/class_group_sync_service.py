"""
Class messaging groups: keep two group chats per class, mirroring the roster.

Since 2026-08-31 a class has a PARENT chat and a STUDENT chat, told apart by
group_conversations.audience:

    - 'family'  — the adults (2026-08-22): guardians of the class's ACTIVE
      students as members, teachers as admins. Students are deliberately NOT in
      it; the class-wide conversation between adults stays between adults.
    - 'student' — the class's ACTIVE students as members, teachers as admins.
      This replaces the retired class discussion board as the students'
      class-wide space.

"Teacher" means any of the three sources utils.class_membership knows about: the
primary instructor, assistant instructors, and active class_advisors rows.
Guardians come from utils.class_membership.parents_of_students (dependent
accounts via managed_by_parent_id, independent ones via approved
parent_student_links). Linked via group_conversations (source_class_id,
audience); idempotent, so every enrollment write path calls sync_class_group()
best-effort after changing class_enrollments:

    - Schedule Builder add/drop (sis_parent_service)
    - staff direct enrollment (routes/sis/catalog)
    - registration completion (sis_registration_service)
    - waitlist offer acceptance (sis_waitlist_service)

Each group is created lazily on the first sync that finds any members. A resync
also REMOVES stale non-admin members (a guardian whose children all dropped, a
student who dropped), so membership self-heals on the next enrollment change or
teacher visit to the Messages tab.
"""

from typing import Any, Dict, Optional, Set

from database import get_supabase_admin_client
from utils import class_membership as membership
from utils.logger import get_logger

logger = get_logger(__name__)


def _admin():
    return get_supabase_admin_client()


def sync_class_groups(class_id: str, actor_id: Optional[str] = None) -> Dict[str, Optional[str]]:
    """Create/sync both of the class's messaging groups from its roster.
    Returns {'family': group_id_or_None, 'student': group_id_or_None}.
    Never raises — messaging must not break enrollment."""
    out: Dict[str, Optional[str]] = {'family': None, 'student': None}
    try:
        admin = _admin()
        cls = (admin.table('org_classes')
               .select('id, name, organization_id, primary_instructor_id, '
                       'assistant_instructor_ids')
               .eq('id', class_id).limit(1).execute()).data
        if not cls:
            return out
        cls = cls[0]

        student_ids = membership.class_student_ids(class_id)
        parent_ids = membership.parents_of_students(student_ids)
        advisor_ids = membership.class_teacher_ids(class_id, class_row=cls)
        # A guardian who also teaches the class belongs in the admin bucket.
        parent_ids -= advisor_ids
        student_ids = set(student_ids) - advisor_ids

        name = (cls.get('name') or 'Class')
        out['family'] = _sync_one(
            admin, cls, class_id, actor_id, audience='family',
            group_name=f'{name} Class Chat',
            description=f'Group chat for {name} families and teachers',
            member_ids=parent_ids, advisor_ids=advisor_ids,
        )
        out['student'] = _sync_one(
            admin, cls, class_id, actor_id, audience='student',
            group_name=f'{name} Student Chat',
            description=f'Group chat for {name} students and teachers',
            member_ids=student_ids, advisor_ids=advisor_ids,
        )
        return out
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Class group sync failed for class {class_id}: {e}')
        return out


def sync_class_group(class_id: str, actor_id: Optional[str] = None) -> Optional[str]:
    """Back-compat wrapper for the enrollment write paths: syncs BOTH groups,
    returns the family (parent chat) group id or None."""
    return sync_class_groups(class_id, actor_id=actor_id).get('family')


def _sync_one(admin, cls: Dict[str, Any], class_id: str, actor_id: Optional[str],
              audience: str, group_name: str, description: str,
              member_ids: Set[str], advisor_ids: Set[str]) -> Optional[str]:
    group_rows = (admin.table('group_conversations').select('id')
                  .eq('source_class_id', class_id).eq('audience', audience)
                  .eq('is_active', True).limit(1).execute()).data
    group_id = group_rows[0]['id'] if group_rows else None

    if not group_id:
        if not (member_ids or advisor_ids):
            return None
        # Created_by must reference a user; prefer a teacher, else the actor.
        creator = next(iter(advisor_ids), None) or actor_id
        if not creator:
            return None
        created = admin.table('group_conversations').insert({
            'name': group_name,
            'description': description,
            'created_by': creator,
            'organization_id': cls.get('organization_id'),
            'source_class_id': class_id,
            'audience': audience,
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

    # The audience (guardians or students): present as member.
    for mid in member_ids:
        if mid not in have:
            admin.table('group_members').insert({
                'group_id': group_id, 'user_id': mid, 'role': 'member',
                'added_by': actor_id or next(iter(advisor_ids), mid),
            }).execute()

    # Anyone else leaves the group (e.g. a guardian whose children all dropped,
    # a student who dropped). Admins (teachers, staff who joined) are never
    # auto-removed.
    desired = member_ids | advisor_ids
    for uid, row in have.items():
        if uid not in desired and row.get('role') != 'admin':
            admin.table('group_members').delete().eq('id', row['id']).execute()

    return group_id
