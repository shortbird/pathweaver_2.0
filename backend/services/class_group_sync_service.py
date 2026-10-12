"""
Class messaging groups: keep two group chats per class, mirroring the roster.

Since 2026-08-31 a class has a PARENT chat and a STUDENT chat, told apart by
group_conversations.audience:

    - 'family'  — the adults (2026-08-22), named "<Class> Parent Chat":
      guardians of the class's ACTIVE students as members, teachers as admins.
      Students are deliberately NOT in it; the class-wide conversation between
      adults stays between adults.
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
also REMOVES stale members (a guardian whose children all dropped, a student who
dropped, and since 2026-10-12 a teacher who no longer teaches the class -- the
front office keeps its seat), so membership self-heals on the next enrollment
change, instructor change, or teacher visit to the Messages tab.
"""

from typing import Any, Dict, List, Optional, Set, Tuple

from utils import class_membership as membership
from utils.sis_roles import ADMIN_ROLES
from utils.logger import get_logger

logger = get_logger(__name__)


# admin client justified: messaging spans both sides of a conversation, and
#   a sender cannot read the recipient's rows under RLS; membership is checked
#   before every use
from utils.admin_client import admin_client as _admin


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
            group_name=f'{name} Parent Chat',
            description=f'Group chat for {name} families and teachers',
            member_ids=parent_ids, advisor_ids=advisor_ids,
            # "Class Chat" was the parent chat's name for its first fortnight,
            # and it reads as "the chat for this class" — which is how a teacher
            # came to write to her students in it for two days and wonder why
            # none of them answered (iCreate, 2026-09-03: "the students saw each
            # others messages, just not the teacher's"). Rename the ones nobody
            # has touched; a group the school renamed by hand keeps its name.
            rename_from=(f'{name} Class Chat',),
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


def _auto_names(name: str) -> Dict[str, Tuple[str, ...]]:
    """Every group name this service has ever generated for a class called
    `name`, by audience. The first entry is the current one."""
    return {
        'family': (f'{name} Parent Chat', f'{name} Class Chat'),
        'student': (f'{name} Student Chat',),
    }


def _auto_descriptions(name: str) -> Dict[str, str]:
    return {
        'family': f'Group chat for {name} families and teachers',
        'student': f'Group chat for {name} students and teachers',
    }


def rename_class_groups(class_id: str, old_name: Optional[str],
                        new_name: Optional[str]) -> int:
    """Follow a class rename into its chats. Returns how many groups changed.

    The group name is written once, when _sync_one creates the group, so a
    renamed class kept showing its old chat name (iCreate, ticket 644d46d5:
    "Math Minds: Glow" showed "Math Minds: Beam Parent Chat" — the class had
    been copied from Beam and renamed). Only a name this service generated
    from the OLD class name is replaced; a name the school typed by hand is
    theirs and stays. The description follows the same rule.

    Never raises — a stale chat name must not fail the class save."""
    old = (old_name or 'Class')
    new = (new_name or 'Class')
    if old == new:
        return 0
    renamed = 0
    try:
        from repositories.group_repository import GroupRepository
        groups = GroupRepository(client=_admin())
        rows = groups.chats_for_class(class_id)
        old_names, new_names = _auto_names(old), _auto_names(new)
        old_desc, new_desc = _auto_descriptions(old), _auto_descriptions(new)
        for g in rows:
            audience = g.get('audience')
            if audience not in old_names:
                continue
            patch: Dict[str, Any] = {}
            if g.get('name') in old_names[audience]:
                patch['name'] = new_names[audience][0]
            if g.get('description') == old_desc[audience]:
                patch['description'] = new_desc[audience]
            if not patch:
                continue
            groups.rename_generated_chat(g['id'], patch)
            if 'name' in patch:
                renamed += 1
    except Exception as e:  # noqa: BLE001 — messaging must not break the class save
        logger.warning(f'Could not rename the chats of class {class_id}: {e}')
    return renamed


def ensure_admin_member(group_id: str, user_id: str, admin=None) -> None:
    """Put a staff member in a class chat as an admin: insert them, or promote
    a plain membership. Reading a group requires membership, and staff who can
    reach a class administer its chats. Shared by the class Messages tab
    (routes/sis/staff_portal.class_messaging) and the admin's "All class chats"
    list (ticket bbb477db), so both joins write the same row."""
    from repositories.group_repository import GroupRepository
    GroupRepository(client=admin or _admin()).ensure_admin_member(group_id, user_id)


def sync_class_group(class_id: str, actor_id: Optional[str] = None) -> Optional[str]:
    """Back-compat wrapper for the enrollment write paths: syncs BOTH groups,
    returns the family (parent chat) group id or None."""
    return sync_class_groups(class_id, actor_id=actor_id).get('family')


def _sync_one(admin, cls: Dict[str, Any], class_id: str, actor_id: Optional[str],
              audience: str, group_name: str, description: str,
              member_ids: Set[str], advisor_ids: Set[str],
              rename_from: Tuple[str, ...] = ()) -> Optional[str]:
    group_rows = (admin.table('group_conversations').select('id, name')
                  .eq('source_class_id', class_id).eq('audience', audience)
                  .eq('is_active', True).limit(1).execute()).data
    group_id = group_rows[0]['id'] if group_rows else None

    # A superseded auto-name is corrected in place. Matching the exact old
    # generated string (rather than renaming whatever is there) is what keeps a
    # school's own rename: only a name this service itself wrote is replaced.
    if group_id and group_rows[0].get('name') in rename_from:
        try:
            admin.table('group_conversations').update({'name': group_name}) \
                .eq('id', group_id).execute()
        except Exception as e:  # noqa: BLE001 — a stale name must not stop the sync
            logger.warning(f'Could not rename group {group_id}: {e}')

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
    # a student who dropped).
    #
    # Admins too, since 2026-10-12. Until then an admin row was never removed,
    # so a teacher replaced on a class stayed in its chats for good (iCreate,
    # ticket 3bdf06bb: "I'm included in chats for classes that I'm not
    # responsible for. I would only like to be in chats for classes that I
    # teach."). An admin who is not a current teacher stays only when they are
    # the school's front office -- the people the class Messages tab and the
    # "All class chats" list legitimately join (ensure_admin_member): org
    # admins and campus coordinators of this school, a superadmin, and the
    # school inbox account. The group's created_by is a teacher at creation and
    # nothing reads it for a class chat's ownership, so it gets no exemption.
    desired = member_ids | advisor_ids
    stale = {uid: row for uid, row in have.items() if uid not in desired}
    stale_admins = [uid for uid, row in stale.items() if row.get('role') == 'admin']
    keep = _office_admins(admin, cls.get('organization_id'), stale_admins)
    for uid, row in stale.items():
        if uid in keep:
            continue
        admin.table('group_members').delete().eq('id', row['id']).execute()

    return group_id


# The roles that administer every class chat at their school without teaching
# the class (utils.sis_roles.ADMIN_ROLES).
_OFFICE_ROLES = frozenset(ADMIN_ROLES)


def _office_admins(admin, org_id: Optional[str], user_ids: List[str]) -> Set[str]:
    """Which of `user_ids` are this school's front office, and so keep their
    admin seat in a class chat they do not teach.

    When the lookup fails every one of them is kept: a failed read must never
    empty a chat of its staff."""
    if not user_ids:
        return set()
    try:
        from repositories.organization_repository import OrganizationRepository
        from repositories.user_repository import UserRepository
        from utils.roles import get_effective_roles
        rows = UserRepository(client=admin).find_by_ids(
            list(user_ids), 'id, role, org_role, org_roles, organization_id')
        keep: Set[str] = set()
        for u in rows.values():
            roles = set(get_effective_roles(u))
            if 'superadmin' in roles:
                keep.add(u['id'])
            elif org_id and u.get('organization_id') == org_id and roles & _OFFICE_ROLES:
                keep.add(u['id'])
        if org_id:
            org = OrganizationRepository(client=admin).find_by_id(org_id) or {}
            inbox_id = org.get('inbox_user_id')
            if inbox_id and inbox_id in user_ids:
                keep.add(inbox_id)
        return keep
    except Exception as e:  # noqa: BLE001 -- keep everyone rather than guess
        logger.warning(f'Class chat admin check failed for org {org_id}: {e}')
        return set(user_ids)


def archived_class_ids(class_ids) -> Set[str]:
    """The archived classes among `class_ids`. Their chats are hidden from the
    inbox lists (ticket 3bdf06bb); the group rows and their history stay.
    Best-effort: a failed read hides nothing."""
    ids = sorted({c for c in (class_ids or []) if c})
    if not ids:
        return set()
    try:
        from repositories.sis_class_repository import SisClassRepository
        return SisClassRepository(client=_admin()).archived_ids(ids)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Archived class lookup failed: {e}')
        return set()
