"""A whole new family from the SIS People page, in one request.

The People page's "+ Add" used to offer "Family", which made an empty household
with a name and nothing else. The office then opened it and added each parent
and each child through the family record's own forms -- four dialogs for one
family, and an empty family on the list if they stopped halfway. The add
wizard (2026-10-12) asks for the parents and children together and sends them
here.

This module adds no new way to make a person. It checks the whole family
first, then makes the household and runs the two doors the family record
already uses, in order:
  - family_guardian_service.add_guardian_to_household for each parent (the
    first one is the primary contact);
  - family_student_service.add_child_to_household for each child (the age split
    lives there: under 13 is a parent-managed profile, 13+ gets a login).

Everything that can be refused is refused before the household exists, so a
typo never leaves an empty family behind. What can still fail afterwards (an
auth call, an email) is reported per person; the family stays, and the office
finishes it on the family record.
"""

from typing import Any, Dict, List

from utils.logger import get_logger

logger = get_logger(__name__)

# admin client justified: reads accounts by email across the platform to
# refuse a taken address before anything is created; the route is staff-gated.
from utils.admin_client import admin_client as _admin

MAX_GUARDIANS = 2
MAX_CHILDREN = 10


def _valid_email(email: str) -> bool:
    return bool(email) and '@' in email and '.' in email.split('@')[-1]


def _clean_person(raw: Dict[str, Any]) -> Dict[str, str]:
    return {
        'first_name': (raw.get('first_name') or '').strip(),
        'last_name': (raw.get('last_name') or '').strip(),
        'email': (raw.get('email') or '').strip().lower(),
        'date_of_birth': (raw.get('date_of_birth') or '').strip(),
    }


def validate(org_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Every refusal the family can earn, before anything is written.

    Returns {'guardians', 'children', 'name'} cleaned, or {'error', 'status'}.
    """
    from repositories.user_repository import UserRepository
    from services import sis_attach_service
    from services.family_student_service import calculate_age
    from services.registration_identity_service import parse_dob

    guardians = [_clean_person(g) for g in (data.get('guardians') or []) if isinstance(g, dict)]
    children = [_clean_person(c) for c in (data.get('children') or []) if isinstance(c, dict)]
    if not guardians:
        return {'error': 'Add at least one parent', 'status': 400}
    if len(guardians) > MAX_GUARDIANS:
        return {'error': f'A family can have at most {MAX_GUARDIANS} parents here', 'status': 400}
    if len(children) > MAX_CHILDREN:
        return {'error': f'Add at most {MAX_CHILDREN} children at once', 'status': 400}

    for g in guardians:
        if not g['first_name'] or not g['last_name']:
            return {'error': 'Each parent needs a first and last name', 'status': 400}
        if not _valid_email(g['email']):
            return {'error': f"{g['first_name']} needs a valid email address", 'status': 400}
    for c in children:
        if not c['first_name'] or not c['last_name']:
            return {'error': 'Each child needs a first and last name', 'status': 400}
        dob = parse_dob(c['date_of_birth'])
        if not dob:
            return {'error': f"{c['first_name']} needs a date of birth", 'status': 400}
        if calculate_age(dob) >= 13:
            if not _valid_email(c['email']):
                return {'error': f"{c['first_name']} is 13 or older and needs their own email "
                                 'to have a login', 'status': 400}
        else:
            # Under 13 is a profile the parent manages: no email, no login.
            c['email'] = ''

    emails = [p['email'] for p in guardians + children if p['email']]
    if len(set(emails)) != len(emails):
        return {'error': 'Each person needs their own email address', 'status': 400}

    users = UserRepository(client=_admin())
    for g in guardians:
        user = users.find_by_email(g['email'])
        if not user:
            continue
        if user.get('organization_id') != org_id:
            return {'error': f"{g['email']} already has an Optio account outside this school. "
                             'Email support@optioeducation.com and we will connect it.',
                    'status': 409}
        if user.get('org_role') == 'student' or 'student' in (user.get('org_roles') or []):
            return {'error': f"{g['email']} belongs to a student at this school.", 'status': 409}
        # A parent already in a family here gets their new children there, not
        # a second family with the same parent in it.
        if sis_attach_service.household_for_guardian(org_id, user['id']):
            return {'error': f"{g['email']} is already a parent in a family here. Open that "
                             'family to add children to it.',
                    'code': 'has_family', 'status': 409}
    for c in children:
        if c['email'] and users.find_by_email(c['email']):
            return {'error': f"{c['email']} already has an Optio account. Add {c['first_name']} "
                             "from that account's family instead.", 'status': 409}

    name = (data.get('name') or '').strip() or f"{guardians[0]['last_name']} Family"
    return {'guardians': guardians, 'children': children, 'name': name}


def create_family(org_id: str, actor_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate, then make the household, the parents and the children.

    Body: name (optional), guardians [{first_name, last_name, email}],
    children [{first_name, last_name, date_of_birth, email}], send_emails.

    Returns {'household', 'guardians': [...], 'children': [...], 'problems'}
    or {'error', 'status'}.
    """
    from repositories.household_repository import HouseholdRepository
    from services import family_guardian_service, family_student_service

    checked = validate(org_id, data)
    if checked.get('error'):
        return checked
    send_email = data.get('send_emails', True) is not False

    households = HouseholdRepository(client=_admin())
    household = households.create(org_id, {'name': checked['name']})
    household_id = household['id']

    added_guardians: List[Dict[str, Any]] = []
    added_children: List[Dict[str, Any]] = []
    problems: List[Dict[str, Any]] = []

    for index, g in enumerate(checked['guardians']):
        res = family_guardian_service.add_guardian_to_household(
            org_id, household_id, actor_id,
            {**g, 'send_email': send_email, 'is_primary': index == 0})
        name = f"{g['first_name']} {g['last_name']}"
        if res.get('error'):
            if index == 0:
                # No first parent means no family a child can be created under:
                # take the empty household back rather than leave it listed.
                households.delete(household_id)
                return {'error': res['error'], 'status': res.get('status', 400)}
            problems.append({'name': name, 'error': res['error']})
            continue
        if index == 0 and res.get('user_id'):
            households.update(household_id, {'primary_contact_user_id': res['user_id']})
        added_guardians.append({'name': name, 'email': g['email'], 'kind': res.get('kind'),
                                'invite_sent': bool(res.get('invite_sent'))})

    for c in checked['children']:
        res = family_student_service.add_child_to_household(
            org_id, household_id, actor_id,
            # A brand-new family has nobody to be a duplicate of.
            {**c, 'confirm_duplicate': True, 'send_email': send_email})
        name = f"{c['first_name']} {c['last_name']}"
        if res.get('error'):
            problems.append({'name': name, 'error': res['error']})
            continue
        added_children.append({'name': name, 'kind': res.get('kind'),
                               'invite_sent': bool(res.get('invite_sent'))})

    logger.info(f'sis create-family: household {household_id[:8]} at org {org_id[:8]} '
                f'({len(added_guardians)} parents, {len(added_children)} children, '
                f'{len(problems)} problems)')
    return {'household': {'id': household_id, 'name': checked['name']},
            'guardians': added_guardians, 'children': added_children,
            'problems': problems}
