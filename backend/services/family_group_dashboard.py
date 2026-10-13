"""A family group's own dashboard, for the person outside the school who runs it.

OpenEd pays Optio Academy for a cohort of families. Until 2026-10-13 OpenEd's
Eliza Paskett kept a weekly spreadsheet of students to add and drop, and
Tanner typed it into Optio. She now does it herself on /family-groups/<id>:
the group's students, a roster import that files every family it adds under
the group, and Drop / Re-enroll for each student.

She is not Optio Academy staff. Access is a row in family_group_managers (or
superadmin), checked here on every call, and every read and write is held to
households already in the group:
  - the roster lists only the group's households;
  - an import refuses a row whose parent or student already belongs to a family
    at the school that is NOT in the group, because filing it would retag a
    family OpenEd does not pay for (funding_source 'opened' turns off its card
    billing);
  - Drop and Re-enroll refuse a student whose family is not in the group.

What a family added here is given comes from the group row:
family_groups.funding_source onto the household, and family_groups.
academy_pathway as an Optio Academy enrollment for each imported student.

Drop is the SIS roster's withdraw (sis_person_service.set_student_standing:
the account and its work stay, the student is marked withdrawn) plus the
Academy enrollment set to withdrawn, which is what takes the accreditation
mark off. Nothing here deletes an account; Re-enroll undoes a Drop.
"""
from typing import Any, Dict, List, Optional, Set

from repositories.family_group_dashboard_repository import FamilyGroupDashboardRepository
from utils.logger import get_logger

logger = get_logger(__name__)

# admin client justified: family_group_managers and family_groups are
#   service-role only, and the manager is not a member of the school whose
#   rows these are; require_manager below is the authorization.
from utils.admin_client import admin_client as _admin


def _repo() -> FamilyGroupDashboardRepository:
    return FamilyGroupDashboardRepository(client=_admin())


class DashboardError(ValueError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


# ── access ──────────────────────────────────────────────────────────────────

def _is_superadmin(user_id: str) -> bool:
    return _repo().user_role(user_id) == 'superadmin'


def _group(group_id: str) -> Optional[Dict[str, Any]]:
    return _repo().group(group_id)


def _org_name(org_id: str) -> str:
    return _repo().org_name(org_id)


def managed_groups(user_id: str) -> List[Dict[str, Any]]:
    """The groups this person may open, with the school's name."""
    out = []
    for group_id in _repo().granted_group_ids(user_id):
        group = _group(group_id)
        if group:
            out.append({'id': group['id'], 'name': group['name'],
                        'school_name': _org_name(group['organization_id'])})
    return sorted(out, key=lambda g: g['name'].lower())


def require_manager(user_id: str, group_id: str) -> Dict[str, Any]:
    """The group row when this person may run it; a 404 otherwise, so the
    page never confirms that a group it cannot open exists."""
    group = _group(group_id)
    if not group:
        raise DashboardError('Group not found', 404)
    if not _repo().is_granted(group_id, user_id) and not _is_superadmin(user_id):
        raise DashboardError('Group not found', 404)
    return group


# ── reads ───────────────────────────────────────────────────────────────────

def _group_household_ids(group_id: str) -> Set[str]:
    return set(_repo().group_household_ids(group_id))


def _all_households_of(user_ids: List[str]) -> Dict[str, List[str]]:
    ids = [u for u in dict.fromkeys(user_ids) if u]
    if not ids:
        return {}
    rows = _repo().memberships_of_users(ids)
    out: Dict[str, List[str]] = {}
    for r in rows:
        out.setdefault(r['user_id'], []).append(r['household_id'])
    return out


def roster(group: Dict[str, Any]) -> Dict[str, Any]:
    """Every student in the group's families, with their parents and where
    they stand: 'enrolled' or 'dropped'."""
    from services.sis_person_service import is_student

    org_id = group['organization_id']
    household_ids = sorted(_group_household_ids(group['id']))
    if not household_ids:
        return {'students': [], 'family_count': 0}
    repo = _repo()
    members = repo.members_of_households(household_ids)
    user_ids = list({m['user_id'] for m in members})
    users = {u['id']: u for u in repo.users(user_ids)}
    standing = repo.school_standing(org_id, user_ids)
    academy: Dict[str, Dict[str, Any]] = {}
    for row in repo.academy_enrollments(user_ids):
        held = academy.get(row['user_id'])
        # The active row wins; otherwise the newest.
        if (not held or row['status'] == 'active'
                or (held['status'] != 'active' and (row['enrolled_at'] or '') > (held['enrolled_at'] or ''))):
            academy[row['user_id']] = row

    by_household: Dict[str, List[Dict[str, Any]]] = {}
    for m in members:
        u = users.get(m['user_id'])
        if u:
            by_household.setdefault(m['household_id'], []).append(u)

    def _name(u: Dict[str, Any]) -> str:
        return f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip() or (u.get('email') or '')

    students = []
    for household_id, people in by_household.items():
        parents = [p for p in people if not is_student(p) and p.get('organization_id') == org_id]
        for s in people:
            if not is_student(s) or s.get('organization_id') != org_id:
                continue
            ae = academy.get(s['id']) or {}
            dropped = standing.get(s['id']) == 'withdrawn' or ae.get('status') == 'withdrawn'
            students.append({
                'id': s['id'],
                'household_id': household_id,
                'name': _name(s),
                'first_name': s.get('first_name') or '',
                'last_name': s.get('last_name') or '',
                'email': s.get('email') or '',
                # A profile the parent manages has no login of its own.
                'managed_by_parent': bool(s.get('managed_by_parent_id')),
                'parents': [{'name': _name(p), 'email': p.get('email') or ''} for p in parents],
                'status': 'dropped' if dropped else 'enrolled',
                'enrolled_at': ae.get('enrolled_at') or s.get('created_at'),
                'dropped_at': ae.get('withdrawn_at') if dropped else None,
                'last_active': s.get('last_active'),
            })
    students.sort(key=lambda s: (s['last_name'].lower(), s['first_name'].lower()))
    from services import credit_bank_service
    try:
        bank = credit_bank_service.balances([s['id'] for s in students])
    except Exception as e:  # noqa: BLE001 -- the roster still works without balances
        logger.warning(f'group dashboard: credit balances unavailable: {e}')
        bank = {}
    for s in students:
        s['credits'] = bank.get(s['id'])
    return {'students': students, 'family_count': len(household_ids)}


# ── roster import ───────────────────────────────────────────────────────────

def _outside_group_errors(plan: Dict[str, Any], org_id: str,
                          group_households: Set[str]) -> List[Dict[str, Any]]:
    """Rows that would pull a family outside the group into it (see the
    module docstring). Also: every student needs a parent, since the parent's
    family is what gets filed under the group."""
    from services import sis_attach_service

    errors: Dict[int, List[str]] = {}
    student_email_for_row: Dict[int, str] = {}

    def add(row: int, message: str) -> None:
        errors.setdefault(row, []).append(message)

    for s in plan['students']:
        student_email_for_row[s['row']] = s['email'] or f"{s['first_name']} {s['last_name']}"
        if not s['parent_email']:
            add(s['row'], 'Add a parent email: each student joins their parent\'s family')

    existing_students = [s for s in plan['students'] if s.get('existing_user_id')]
    homes = _all_households_of([s['existing_user_id'] for s in existing_students])
    for s in existing_students:
        theirs = homes.get(s['existing_user_id']) or []
        if theirs and not any(h in group_households for h in theirs):
            add(s['row'], f"{s['first_name']} is already in a family at the school that is not "
                          'in this group. Email support@optioeducation.com to move them.')

    for p in plan['parents']:
        if not p.get('existing_user_id'):
            continue
        household_id = sis_attach_service.household_for_guardian(org_id, p['existing_user_id'])
        if household_id and household_id not in group_households:
            student_rows = [s['row'] for s in plan['students'] if s['parent_email'] == p['email']]
            for row in student_rows or [p['row']]:
                add(row, f"{p['email']} is already a parent in a family at the school that is not "
                         'in this group. Email support@optioeducation.com to move them.')

    return [{'row': row, 'student_email': student_email_for_row.get(row, '(empty)'),
             'errors': msgs} for row, msgs in sorted(errors.items())]


def plan_import(group: Dict[str, Any], csv_text: Any) -> Dict[str, Any]:
    """The roster planner, held to this group. Raises DashboardError on a
    sheet that cannot be read."""
    from services import roster_import_service

    rows, parse_error = roster_import_service.parse_roster_csv(csv_text)
    if parse_error or rows is None:
        raise DashboardError(parse_error or 'That sheet has no rows we can read')
    org_id = group['organization_id']
    # superadmin=False: never names another school, never pulls in a platform
    # account. The manager is outside the school, so this holds for a
    # superadmin running the dashboard too.
    plan = roster_import_service.build_plan(rows, org_id, _admin(), superadmin=False)
    extra = _outside_group_errors(plan, org_id, _group_household_ids(group['id']))
    if extra:
        bad_rows = {e['row'] for e in extra}
        plan['row_errors'] = sorted(plan['row_errors'] + extra, key=lambda e: e['row'])
        plan['students'] = [s for s in plan['students'] if s['row'] not in bad_rows]
        plan['counts']['invalid_rows'] = len({e['row'] for e in plan['row_errors']})
    return plan


def commit_import(group: Dict[str, Any], plan: Dict[str, Any], actor_id: str,
                  send_emails: bool) -> Dict[str, Any]:
    """Run the import, then file each family under the group, give it the
    group's funding source, and enroll each imported student (at the school
    and, when the group says so, in Optio Academy). A student who was dropped
    and comes back on a later sheet is re-enrolled the same way."""
    from services import academy_enrollment_service, roster_import_service, sis_attach_service
    from services.sis_person_service import enroll_students

    org_id = group['organization_id']
    repo = _repo()
    outcome = roster_import_service.execute_plan(
        plan, org_id, _org_name(org_id) or 'Optio Academy', _admin(), send_emails=send_emails)

    student_ids = [r['user_id'] for r in outcome['results']
                   if r.get('kind') == 'student' and r.get('user_id')
                   and r.get('status') in ('created', 'existing', 'adopted')]
    household_ids: Set[str] = set()
    for p in plan['parents']:
        parent = next((r for r in outcome['results']
                       if r.get('kind') == 'parent' and r.get('email') == p['email']), None)
        parent_id = (parent or {}).get('user_id') or p.get('existing_user_id')
        if parent_id:
            hh = sis_attach_service.household_for_guardian(org_id, parent_id)
            if hh:
                household_ids.add(hh)

    problems: List[str] = []
    for hh in household_ids:
        try:
            repo.file_household(hh, group['id'], actor_id)
            if group.get('funding_source'):
                repo.set_funding_source(hh, org_id, group['funding_source'])
        except Exception as e:  # noqa: BLE001 -- report it; the accounts exist
            logger.error(f'group dashboard: filing household {hh[:8]} failed: {e}')
            problems.append('A family was added but not filed under the group. Optio has been told.')

    try:
        enroll_students(org_id, student_ids)
    except Exception as e:  # noqa: BLE001
        logger.error(f'group dashboard: school enrollment failed: {e}')
        problems.append('Some students were added but not marked enrolled. Optio has been told.')
    if group.get('academy_pathway'):
        for sid in student_ids:
            if not academy_enrollment_service.enroll(sid, group['academy_pathway'],
                                                     created_by=actor_id):
                problems.append('An Optio Academy enrollment failed. Optio has been told.')
    problems += _bank_year(group, student_ids, actor_id)

    try:
        repo.audit({
            **roster_import_service.audit_entry(actor_id, org_id, outcome['counts'], send_emails),
            'action_type': 'family_group_roster_import',
            'resource_type': 'family_group',
            'resource_id': group['id'],
        })
    except Exception as e:  # noqa: BLE001 -- an audit failure must not undo the import
        logger.warning(f'group dashboard: audit log failed: {e}')
    logger.info(f"group dashboard: import into group {group['id'][:8]} -> {outcome['counts']}")
    return {**outcome, 'problems': list(dict.fromkeys(problems))}


def _bank_year(group: Dict[str, Any], student_ids: List[str], actor_id: str) -> List[str]:
    """OpenEd's year carries its credits: bank them on enrollment, once per
    school year (a re-enrolled or re-imported student is not banked twice)."""
    if group.get('funding_source') != 'opened':
        return []
    from services import credit_bank_service
    problems = []
    for sid in student_ids:
        try:
            credit_bank_service.bank_opened_year(sid, actor_id)
        except Exception as e:  # noqa: BLE001 -- the enrollment stands; report the credits
            logger.error(f'group dashboard: banking the year for {sid[:8]} failed: {e}')
            problems.append("A student's included credits were not added. Optio has been told.")
    return problems


def add_credits(group: Dict[str, Any], student_id: str, body: Dict[str, Any],
                actor_id: str) -> Dict[str, Any]:
    """An order from the group's manager: accelerated or prior learning
    credits. Corrections are Optio staff's, on the SIS student record."""
    from services import credit_bank_service
    _student_in_group(group, student_id)
    try:
        return credit_bank_service.add_entry(
            student_id, body.get('credits'), body.get('kind') or 'accelerated', body.get('note'),
            actor_id, source='opened' if group.get('funding_source') == 'opened' else 'manual',
            order_reference=body.get('order_reference'),
            allowed_kinds=credit_bank_service.PURCHASE_KINDS)
    except credit_bank_service.CreditBankError as e:
        raise DashboardError(str(e), e.status) from None


# ── drop and re-enroll ──────────────────────────────────────────────────────

def _student_in_group(group: Dict[str, Any], student_id: str) -> None:
    homes = _all_households_of([student_id]).get(student_id) or []
    if not set(homes) & _group_household_ids(group['id']):
        raise DashboardError('Student not found', 404)


def set_dropped(group: Dict[str, Any], student_id: str, dropped: bool,
                actor_id: str) -> Dict[str, Any]:
    from services import academy_enrollment_service, sis_person_service

    _student_in_group(group, student_id)
    org_id = group['organization_id']
    result = sis_person_service.set_student_standing(org_id, student_id, withdrawn=dropped)
    if result.get('error'):
        raise DashboardError(result['error'])

    if dropped:
        _repo().withdraw_academy(student_id)
    elif group.get('academy_pathway'):
        academy_enrollment_service.enroll(student_id, group['academy_pathway'], created_by=actor_id)
    if not dropped:
        _bank_year(group, [student_id], actor_id)

    sis_person_service.audit_removal(
        org_id, actor_id,
        'family_group_student_dropped' if dropped else 'family_group_student_reenrolled',
        'user', student_id, {'group_id': group['id'], 'name': result.get('name') or ''})
    return {'name': result.get('name'), 'status': 'dropped' if dropped else 'enrolled'}
