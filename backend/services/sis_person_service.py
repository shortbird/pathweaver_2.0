"""Removing a person from a school.

Staff already had this (sis_staff_service.archive_staff / delete_staff); students
and parents did not. That gap is how iCreate ended up stuck on 2026-07-29: a
duplicate family was deleted, and its three accounts — a parent and two students
— stayed in the People list with no way to get rid of them. Deleting a household
only ever removed the household and its member links; the accounts it grouped
survive on purpose (a real family's students must not vanish with a mis-typed
family name), so something has to be able to remove *people*.

Two modes, deliberately:

  delete   Remove the account outright. Refused when the person has school
           records — attendance, completed work, submissions, registrations —
           because deleting the row would orphan them. This is the mode for the
           duplicate/typo accounts that make up almost every real request.

  archive  Keep everything, stop showing them. A student is marked withdrawn
           (which the People list already hides) and their active class seats
           are released so rosters and counts stay honest. A parent or observer
           is detached from the organization: the account itself survives, it
           simply no longer belongs to this school.

Staff are delegated to sis_staff_service so there is exactly one code path for
teachers, whichever page the admin happens to be on.
"""

from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from utils.fk_errors import fk_blocker, fk_blocker_label
from utils.logger import get_logger
from utils import person_name

logger = get_logger(__name__)

STAFF_ROLES = ('org_admin', 'campus_coordinator', 'advisor')


def _admin():
    # admin client justified: the SIS console acts for the whole school — this
    #   reads/writes rows belonging to every family in the org, which no single
    #   caller can see under RLS; the route's role+org gate is the authorization
    return get_supabase_admin_client()


from utils.timestamps import now_iso as _now_iso  # noqa: E402


def _full_name(u: Dict[str, Any]) -> str:
    """Delegates to utils.person_name.full_name — one rule for the whole SIS.
    Ten copies of this function with two different fallback orders is half of
    why names differed screen to screen (iCreate, 2026-08-25)."""
    return person_name.full_name(u, 'Unnamed')


def _user(org_id: str, target_id: str) -> Optional[Dict[str, Any]]:
    rows = (
        _admin().table('users')
        .select('id, first_name, last_name, display_name, preferred_name, username, email, role, '
                'org_role, org_roles, organization_id, is_dependent, managed_by_parent_id')
        .eq('id', target_id).limit(1).execute()
    ).data or []
    u = rows[0] if rows else None
    if not u or u.get('organization_id') != org_id:
        return None
    return u


def _roles(u: Dict[str, Any]) -> List[str]:
    roles = list(u.get('org_roles') or [])
    if u.get('org_role') and u['org_role'] not in roles:
        roles.append(u['org_role'])
    if u.get('role') and u['role'] != 'org_managed' and u['role'] not in roles:
        roles.append(u['role'])
    return roles


def is_staff(u: Dict[str, Any]) -> bool:
    return any(r in STAFF_ROLES for r in _roles(u))


def is_student(u: Dict[str, Any]) -> bool:
    return 'student' in _roles(u)


def _history(org_id: str, target_id: str) -> Dict[str, int]:
    """What this account is tied to. Any non-zero entry means a delete would
    orphan real school records, so the caller is told to archive instead."""
    admin = _admin()

    def _count(table: str, column: str, **extra) -> int:
        try:
            q = admin.table(table).select('id').eq(column, target_id)
            for k, v in extra.items():
                q = q.eq(k, v)
            return len(q.limit(50).execute().data or [])
        except Exception:  # noqa: BLE001 — a missing table must not block removal
            logger.debug('history probe failed for %s.%s', table, column, exc_info=True)
            return 0

    return {
        'class_enrollments': _count('class_enrollments', 'student_id', status='active'),
        'attendance': _count('sis_attendance', 'student_user_id'),
        'completed_work': _count('quest_task_completions', 'user_id'),
        'registrations': _count('sis_registration_items', 'student_user_id'),
        'forms': _count('sis_form_submissions', 'submitted_by'),
    }


def removal_preview(org_id: str, target_id: str) -> Dict[str, Any]:
    """What removing this person would affect, for the confirm dialog."""
    u = _user(org_id, target_id)
    if not u:
        return {'error': 'Person not found in this organization'}
    if u.get('role') == 'superadmin':
        return {'error': 'Superadmin accounts cannot be removed from an organization'}

    if is_staff(u):
        from services import sis_staff_service
        preview = sis_staff_service.staff_removal_preview(org_id, target_id)
        if preview.get('error'):
            return preview
        return {**preview, 'kind': 'staff', 'name': preview['staff']['name']}

    history = _history(org_id, target_id)
    # An active class seat isn't history — it's released on the way out — so it
    # doesn't block a delete. Everything else is a record we must not orphan.
    blocking = {k: v for k, v in history.items() if k != 'class_enrollments' and v}
    dependents = 0
    if not is_student(u):
        dependents = len((
            _admin().table('users').select('id')
            .eq('managed_by_parent_id', target_id).limit(50).execute()
        ).data or [])
    return {
        'kind': 'student' if is_student(u) else 'guardian',
        'name': _full_name(u),
        'history': history,
        'dependents': dependents,
        'can_delete': not blocking and not dependents,
        'blocking': {**blocking, **({'dependents': dependents} if dependents else {})},
    }


def remove_person(org_id: str, target_id: str, actor_id: str,
                  mode: str = 'archive') -> Dict[str, Any]:
    """Archive (default) or delete a non-staff person. Staff are delegated."""
    u = _user(org_id, target_id)
    if not u:
        return {'error': 'Person not found in this organization'}
    if target_id == actor_id:
        return {'error': "You can't remove your own account"}
    if u.get('role') == 'superadmin':
        return {'error': 'Superadmin accounts cannot be removed from an organization'}

    if is_staff(u):
        from services import sis_staff_service
        if mode == 'delete':
            return sis_staff_service.delete_staff(org_id, target_id, actor_id=actor_id)
        return sis_staff_service.archive_staff(org_id, target_id, actor_id=actor_id)

    preview = removal_preview(org_id, target_id)
    if preview.get('error'):
        return preview
    name = preview['name']

    if mode == 'delete':
        if not preview['can_delete']:
            return {'error': (f'{name} has school records attached '
                              f'({", ".join(sorted(preview["blocking"]))}). '
                              'Archive them instead — it hides them without losing history.'),
                    'blocking': preview['blocking']}
        return _delete(org_id, target_id, name)

    return _archive(org_id, target_id, name, student=is_student(u))


def _release_class_seats(org_id: str, target_id: str) -> int:
    """Withdraw the student's active class seats and free anything they hold on a
    waitlist, so class counts don't keep counting someone who is gone."""
    rows = (
        _admin().table('class_enrollments').select('id, class_id')
        .eq('student_id', target_id).eq('status', 'active').execute()
    ).data or []
    for r in rows:
        _admin().table('class_enrollments').update(
            {'status': 'withdrawn'}).eq('id', r['id']).execute()
    try:
        from services.class_group_sync_service import sync_class_group
        for r in rows:
            sync_class_group(r['class_id'], actor_id=None)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'[People] class group sync skipped during removal: {e}')
    try:
        _admin().table('sis_waitlist_entries').delete() \
            .eq('organization_id', org_id).eq('student_user_id', target_id) \
            .in_('status', ['waiting', 'offered']).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f'[People] waitlist cleanup skipped during removal: {e}')
    return len(rows)


def _archive(org_id: str, target_id: str, name: str, student: bool) -> Dict[str, Any]:
    seats = _release_class_seats(org_id, target_id)
    if student:
        # Withdrawn is the status the People list and dashboards already treat as
        # "no longer here", so nothing else needs to learn a new state.
        _admin().table('school_enrollments').upsert({
            'organization_id': org_id, 'student_user_id': target_id,
            'status': 'withdrawn', 'updated_at': _now_iso(),
        }, on_conflict='organization_id,student_user_id').execute()
        return {'archived': True, 'name': name, 'seats_released': seats}

    # A guardian/observer has no enrollment lifecycle to mark, so "archive" for
    # them means leaving the school: the account survives, the membership ends.
    # An org_managed account must gain a real platform role on the way out —
    # `org_managed_requires_org` forbids the combination otherwise.
    u = _user(org_id, target_id) or {}
    payload = {'organization_id': None, 'org_role': None, 'org_roles': None}
    if u.get('role') == 'org_managed':
        payload['role'] = u.get('org_role') if u.get('org_role') in ('parent', 'observer') else 'parent'
    _admin().table('household_members').delete().eq('user_id', target_id).execute()
    _admin().table('users').update(payload).eq('id', target_id).execute()
    return {'archived': True, 'name': name, 'detached': True, 'seats_released': seats}


def _delete(org_id: str, target_id: str, name: str) -> Dict[str, Any]:
    seats = _release_class_seats(org_id, target_id)
    admin = _admin()
    for table, column in (('household_members', 'user_id'),
                          ('school_enrollments', 'student_user_id'),
                          ('class_enrollments', 'student_id')):
        try:
            admin.table(table).delete().eq(column, target_id).execute()
        except Exception as e:  # noqa: BLE001 — a stray link must not block the delete
            logger.warning(f'[People] could not clear {table} for {target_id[:8]}: {e}')
    try:
        admin.table('sis_waitlist_entries').delete() \
            .eq('organization_id', org_id).eq('student_user_id', target_id).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f'[People] could not clear waitlist entries: {e}')
    try:
        admin.table('users').delete().eq('id', target_id).eq('organization_id', org_id).execute()
    except Exception as e:  # noqa: BLE001
        blocker = fk_blocker(e)
        if blocker is None:
            raise
        # removal_preview only probes five tables, so an account can pass the
        # can_delete check and still be referenced by something it never looked
        # at (iCreate, 2026-08-19: group_members.added_by, a 500 in the admin's
        # face). The child rows above are already gone, so finish as an archive
        # rather than leaving the person half-removed, and say so plainly.
        label = fk_blocker_label(blocker)
        logger.warning(f'[People] delete of {target_id[:8]} blocked by {blocker}; archiving instead')
        u = _user(org_id, target_id) or {}
        _archive(org_id, target_id, name, student=is_student(u))
        return {'archived': True, 'name': name, 'seats_released': seats,
                'delete_blocked_by': blocker,
                'message': (f'{name} could not be deleted outright because the school still has '
                            f'{label}. They have been archived instead, which hides them '
                            f'without losing those records.')}
    logger.info(f'[People] deleted account {target_id[:8]} from org {org_id[:8]}')
    return {'deleted': True, 'name': name, 'seats_released': seats}
