"""
One path that puts a person in a family at a school (M16, 2026-09-18).

Eleven entry points put people into households -- the registration funnel,
the learning app's "add a student" for an org admin, the SIS People page's
add-member, a roster import, three one-off scripts -- and each did the steps
in its own order with its own idea of which steps there were: find the
guardian's household or make one, put the guardian in it, put the student in
it, give the student the org's role shape and a parent link, apply the
directive the office staged by email, tell the log. The funnel did all of
them; the admin path did four; the People page did three and the scripts one
(docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, K4/NB3/NW8).

The first cut of M16 (2026-09-17) made sis_person_service.join_household the
one household_members write. This is the rest: the steps around it, in one
order, with one name per step, so a student attached from any door is the
same student afterwards.

    household_for_guardian(org, guardian)          the family they already have here
    attach_guardian(org, guardian, household, ...)  a grown-up joins a family
    attach_student(org, student, household, ...)    a child joins a family
    attach_family(org, guardian, students, ...)     the funnel's whole family step

Enrolling at the school (school_enrollments, M4) is deliberately NOT here:
the funnel enrolls at completion, not at the family step, and the People
page's add-member does not enroll at all. sis_person_service.enroll_students
stays the one write for that, called where each door decides.

`client` is for the scripts, which run under their own connection; the app
paths use the admin client, justified where the callers are.
"""

from typing import Any, Dict, Iterable, List, Optional

from utils.logger import get_logger

logger = get_logger(__name__)


def _client(client=None):
    if client is not None:
        return client
    from utils.admin_client import admin_client  # admin client justified: household and membership rows are RLS-locked to backend-only; every caller is a gated route or a script
    return admin_client()


def _households(client=None):
    from repositories.household_repository import HouseholdRepository
    return HouseholdRepository(client=_client(client))


def household_for_guardian(org_id: str, guardian_id: str, *, client=None) -> Optional[str]:
    """The guardian's existing household in this org: one they already guard
    (a school import, a staff-created family, a prior registration), else one
    they are the primary contact of. None when they have neither.

    The funnel and the learning app's admin path each had a copy of this
    lookup; a returning parent must never get a second '<Last> Family'.
    """
    try:
        return _households(client).for_guardian(guardian_id, org_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'attach: household lookup failed for guardian {guardian_id[:8]}: {e}')
        return None


def attach_guardian(org_id: str, guardian_id: str, household_id: str, *,
                    relationship: str = 'guardian', primary: bool = False,
                    source: str, client=None) -> List[Dict[str, Any]]:
    """A grown-up joins a family: the membership row, and parent links to the
    students already in it -- adding members in the order student-then-
    guardian used to create no links, so the family looked right in the SIS
    while the parent's dashboard stayed empty."""
    from services import sis_person_service, sis_service
    db = _client(client)
    students = [m['user_id'] for m in sis_person_service.household_members(household_id, client=db)
                if m.get('relationship') == 'student']
    sis_service.link_guardian_to_students(guardian_id, students, client=db)
    rows = sis_person_service.join_household(
        household_id, guardians=[guardian_id], guardian_relationship=relationship,
        primary_guardian=guardian_id if primary else None, client=db)
    logger.info(f'attach[{source}]: guardian {guardian_id[:8]} -> household {household_id[:8]} ({relationship})')
    return rows


def attach_student(org_id: str, student_id: str, household_id: str, *,
                   source: str, guardian_ids: Iterable[str] = (), client=None) -> Dict[str, Any]:
    """A child joins a family at the school.

    Order matters: the account takes the org's student shape (org fields,
    parent links to the family's guardians) FIRST, so a refused attach -- an
    account from another school, a non-student -- never leaves a member in
    the household but invisible to the roster. Then the membership row.
    `guardian_ids` are linked as well as the family's own guardians -- the
    parent a child was just created under, who may not be a member yet.
    Returns {'attached': True, 'member': row} or {'attached': False,
    'error': why}.
    """
    from services import sis_person_service, sis_service
    db = _client(client)
    guardians = list(dict.fromkeys(
        [g for g in guardian_ids if g]
        + [m['user_id'] for m in sis_person_service.household_members(household_id, client=db)
           if m.get('relationship') != 'student']))
    if not sis_service.attach_student_to_org(org_id, student_id, guardian_ids=guardians, client=db):
        logger.info(f'attach[{source}]: refused student {student_id[:8]} for org {org_id[:8]}')
        return {'attached': False,
                'error': "This account can't be connected — it may belong to "
                         'another school or not be a student account.'}
    rows = sis_person_service.join_household(household_id, students=[student_id], client=db)
    logger.info(f'attach[{source}]: student {student_id[:8]} -> household {household_id[:8]}')
    return {'attached': True, 'member': rows[0] if rows else None}


def attach_family(org_id: str, guardian_id: str, student_ids: Iterable[str], *,
                  household_fields: Optional[Dict[str, Any]] = None,
                  directive: Optional[Dict[str, Any]] = None,
                  source: str, client=None) -> Dict[str, Any]:
    """The whole family step: the guardian's household (found, or made from
    `household_fields`, which needs at least a `name`), the guardian in it
    as primary contact, each student in it, and the directive the office
    staged for this family applied exactly once (sis_holds, M2).

    A household that already exists keeps its name and org; the other fields
    given (address, phone, the UFA flag) are filled from this call, which is
    what a returning parent's fresh submission means.

    Returns {'household_id', 'created': bool, 'attached': [ids], 'refused':
    {id: why}}.
    """
    from services import sis_holds
    db = _client(client)
    households = _households(db)
    fields = dict(household_fields or {})
    existing = household_for_guardian(org_id, guardian_id, client=db)
    created = False
    household_id: str
    if existing:
        household_id = existing
        fill = {k: v for k, v in fields.items() if k not in ('name', 'organization_id')}
        if fill:
            households.update(household_id, fill)
    else:
        row = {k: v for k, v in fields.items() if k != 'organization_id'}
        row.setdefault('name', 'New Family')
        row['primary_contact_user_id'] = guardian_id
        household_id = households.create(org_id, row)['id']
        created = True
    attach_guardian(org_id, guardian_id, household_id, primary=True, source=source, client=db)
    attached: List[str] = []
    refused: Dict[str, str] = {}
    for sid in dict.fromkeys(s for s in student_ids if s):
        res = attach_student(org_id, sid, household_id, source=source, client=db)
        if res.get('attached'):
            attached.append(sid)
        else:
            refused[sid] = res.get('error') or 'refused'
    if directive:
        sis_holds.apply_directives(household_id, directive)
    return {'household_id': household_id, 'created': created, 'attached': attached, 'refused': refused}
