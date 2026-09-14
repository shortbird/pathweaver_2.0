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

from utils.fk_errors import fk_blocker, fk_blocker_label
from utils.logger import get_logger
from utils import person_name

logger = get_logger(__name__)

STAFF_ROLES = ('org_admin', 'campus_coordinator', 'advisor')


# admin client justified: the SIS console acts for the whole school — this
#   reads/writes rows belonging to every family in the org, which no single
#   caller can see under RLS; the route's role+org gate is the authorization
from utils.admin_client import admin_client as _admin


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


def withdraw_household(org_id: str, household_id: str) -> Dict[str, Any]:
    """A whole family leaving the school, from the family record.

    The only way to withdraw a family was one person at a time from People >
    Everyone > Remove from school, and it was not findable from the Families
    tab, which is where the office is standing when a family leaves. iCreate,
    2026-09-08 (e40080a8): "Trying to unenroll family. But the instructions
    don't explain how to do it" -- filed after opening Delete family and
    cancelling it three times, because deleting is the wrong act and the dialog
    says so.

    Each STUDENT in the family is archived exactly as the roster's Archive does
    it (withdrawn, class seats released, history kept). Guardians and the family
    record itself are left alone on purpose: the family may still owe or be
    owed money, the office may still need to reach them, and the record is
    what groups the children's history. Removing the accounts entirely stays a
    per-person act, because it is rarely what is meant.

    Returns {'withdrawn': [{id, name, seats_released}], 'already': [names]}.
    """
    from repositories.household_repository import HouseholdRepository
    repo = HouseholdRepository(client=_admin())
    household = repo.find_by_id(household_id)
    if not household or household.get('organization_id') != org_id:
        return {'error': 'Household not found'}

    student_ids = [m['user_id'] for m in repo.members_for_households([household_id])
                   if m.get('relationship') == 'student' and m.get('user_id')]
    withdrawn: List[Dict[str, Any]] = []
    already: List[str] = []
    for student_id in student_ids:
        u = _user(org_id, student_id)
        if not u:
            continue
        name = _full_name(u)
        # Nothing left to withdraw: no active seats and already marked. A
        # second click must not report the same family withdrawn twice.
        if not _history(org_id, student_id)['class_enrollments'] \
                and _is_withdrawn(org_id, student_id):
            already.append(name)
            continue
        result = _archive(org_id, student_id, name, student=True)
        withdrawn.append({'id': student_id, 'name': name,
                          'seats_released': result.get('seats_released', 0)})
    return {'withdrawn': withdrawn, 'already': already,
            'household_name': household.get('name')}


def set_student_standing(org_id: str, student_id: str, withdrawn: bool) -> Dict[str, Any]:
    """Withdraw one student, or take a withdrawal back, from the org admin's
    People tab on the web platform.

    Schools that do not run the SIS console had Remove (the account leaves the
    org, its class seats and history left dangling) and nothing gentler
    (2026-09-14). Withdrawing is the same act the SIS roster does: the student
    stays on file as withdrawn, their active class seats are released, and the
    lists stop showing them. Reinstating sets the enrollment back to enrolled;
    seats are not re-taken, since the classes may have filled since.
    """
    u = _user(org_id, student_id)
    if not u:
        return {'error': 'Person not found in this organization'}
    if not is_student(u):
        return {'error': 'Only a student can be withdrawn. Remove a parent or staff member instead.'}
    name = _full_name(u)
    if withdrawn:
        result = _archive(org_id, student_id, name, student=True)
        return {'withdrawn': True, 'name': name, 'seats_released': result.get('seats_released', 0)}
    _admin().table('school_enrollments').upsert({
        'organization_id': org_id, 'student_user_id': student_id,
        'status': 'enrolled', 'updated_at': _now_iso(),
    }, on_conflict='organization_id,student_user_id').execute()
    return {'withdrawn': False, 'name': name}


def remove_people(org_id: str, user_ids: List[str], actor_id: str) -> Dict[str, Any]:
    """Take several people off the school at once, deleting each account when
    nothing depends on it and archiving it when something does.

    Deleting a family never deleted the people in it, and the dialog sent the
    office to People > Everyone to remove them one at a time. iCreate,
    2026-09-14 (75037697): "This still doesn't make sense how to permanently
    delete someone" -- filed from the Delete family dialog, third visit.

    Students first, then guardians: a guardian cannot be deleted while a
    dependent still points at them, and the student's outcome decides that.
    Each person's outcome is reported separately, because "gone" means two
    different things here and the office needs to know which: deleted outright,
    or kept on file as withdrawn / detached because attendance, work or a
    registration still refers to them (the same rule as one-at-a-time delete).

    Returns {'removed': [{id, name, outcome: 'deleted'|'archived'|'error', detail}]}.
    """
    people = []
    for uid in user_ids:
        u = _user(org_id, uid)
        if u:
            people.append(u)
    people.sort(key=lambda u: 0 if is_student(u) else 1)
    out: List[Dict[str, Any]] = []
    for u in people:
        uid = u['id']
        name = _full_name(u)
        try:
            result = remove_person(org_id, uid, actor_id=actor_id, mode='delete')
            if result.get('error') and result.get('blocking'):
                # Records rule out deleting; archive is what one-at-a-time
                # offers next, so offer it without a second round trip.
                result = remove_person(org_id, uid, actor_id=actor_id, mode='archive')
            if result.get('error'):
                out.append({'id': uid, 'name': name, 'outcome': 'error',
                            'detail': result['error']})
            elif result.get('deleted'):
                out.append({'id': uid, 'name': name, 'outcome': 'deleted', 'detail': ''})
            else:
                out.append({'id': uid, 'name': name, 'outcome': 'archived',
                            'detail': result.get('message') or ''})
        except Exception as e:  # noqa: BLE001 -- one person must not stop the rest
            logger.error(f'[People] batch removal of {uid[:8]} failed: {e}')
            out.append({'id': uid, 'name': name, 'outcome': 'error', 'detail': 'Could not remove'})
    return {'removed': out}


def _is_withdrawn(org_id: str, student_id: str) -> bool:
    """Whether the school already lists this student as withdrawn."""
    from repositories.school_enrollment_repository import SchoolEnrollmentRepository
    row = SchoolEnrollmentRepository(client=_admin()).find_for_student(org_id, student_id)
    return bool(row and row.get('status') == 'withdrawn')
