"""
"Invite second parents": the office's bulk door for the parent who exists only
as an emergency contact.

Ticket d11e5168 (no way to message BOTH parents). The compose and family
messages reach guardians with an account linked to the child. At iCreate most
second parents were never that: the registration funnel recorded them as an
emergency contact ('parent', 'father', ...) with an email address, and nothing
else. They had no account, so no message could reach them.

The one-family door is "+ Add a parent" on the family record
(services/family_guardian_service.add_guardian_to_household, 8da99c99). This
module only finds the candidates and calls that door once per row, so the
account creation, the "already at this school" connect, the refusals and the
invite email all keep one owner.

A candidate is an emergency contact of a student at this school whose
relationship reads as a parent, who has an email address, and whose email is
not already one of the child's linked guardians through ANY of the three link
types (utils.class_membership.guardians_by_student). Rows are per family and
email, so a parent listed on three siblings is one invite.

The POST takes the preview's keys, never names or emails: it rebuilds the
preview for the caller's own org and acts only on keys found there, so a key
for another school's student matches nothing and writes nothing.
"""

from typing import Any, Dict, Iterable, List, Optional, Set

from utils.logger import get_logger

logger = get_logger(__name__)

# admin client justified: the SIS console acts for the whole school; the
#   routes are ADMIN_ROLES-gated and every read is scoped to the caller's org
from utils.admin_client import admin_client as _admin

# What a family typed in the relationship box when they meant a parent.
# Grandparents, aunts and friends are emergency contacts, not guardians.
PARENT_RELATIONSHIPS = frozenset({
    'parent', 'mother', 'father', 'mom', 'dad', 'mum', 'guardian', 'legal guardian',
    'stepmother', 'stepfather', 'stepparent', 'step-parent', 'step parent',
    'step mother', 'step father', 'step-mother', 'step-father',
})

MAX_INVITES = 500
_CHUNK = 100


def _chunks(items: List[str], size: int = _CHUNK) -> Iterable[List[str]]:
    for i in range(0, len(items), size):
        yield items[i:i + size]


def _clean_email(value: Optional[str]) -> Optional[str]:
    email = (value or '').strip().lower()
    if not email or '@' not in email or '.' not in email.split('@')[-1]:
        return None
    return email


def _is_parent(relationship: Optional[str]) -> bool:
    return (relationship or '').strip().lower() in PARENT_RELATIONSHIPS


def _person_name(u: Dict[str, Any]) -> str:
    full = f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
    return full or u.get('display_name') or 'Student'


# ── Loaders (one per table, so tests replace them whole) ─────────────────────

def _students(org_id: str) -> List[Dict[str, Any]]:
    from services import sis_service
    return sis_service._org_students(org_id)


def _contacts(student_ids: List[str]) -> List[Dict[str, Any]]:
    from repositories.emergency_contact_repository import EmergencyContactRepository
    by_student = EmergencyContactRepository(client=_admin()).for_students(student_ids)
    return [c for rows in by_student.values() for c in rows]


def _households(org_id: str, student_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """{student_id: {'id', 'name'}} for students in a family of THIS org."""
    from repositories.household_repository import HouseholdRepository
    repo = HouseholdRepository(client=_admin())
    house_by_student = repo.student_household_ids(student_ids)
    houses = {h['id']: {'id': h['id'], 'name': h.get('name') or ''}
              for h in repo.list_for_org(org_id)}
    return {sid: houses[hid] for sid, hid in house_by_student.items() if hid in houses}


def _linked_guardian_emails(student_ids: List[str]) -> Dict[str, Set[str]]:
    """{student_id: {email, ...}} of the guardians already linked to each child."""
    from repositories.user_repository import UserRepository
    from utils.class_membership import guardians_by_student
    by_student = guardians_by_student(student_ids)
    ids = sorted({g for gs in by_student.values() for g in gs})
    users = UserRepository(client=_admin())
    email_of: Dict[str, str] = {}
    for chunk in _chunks(ids):
        for uid, r in users.find_by_ids(chunk, 'id, email').items():
            if r.get('email'):
                email_of[uid] = r['email'].strip().lower()
    return {sid: {email_of[g] for g in gs if g in email_of} for sid, gs in by_student.items()}


def _accounts(emails: List[str]) -> Dict[str, Dict[str, Any]]:
    from repositories.user_repository import UserRepository
    return UserRepository(client=_admin()).find_by_emails(
        emails, 'id, email, organization_id, org_role, org_roles')


# ── The preview ──────────────────────────────────────────────────────────────

def _account_status(account: Optional[Dict[str, Any]], org_id: str) -> str:
    """What add_guardian_to_household will do with this email."""
    if not account:
        return 'new'
    if account.get('organization_id') != org_id:
        return 'other_school'
    if account.get('org_role') == 'student' or 'student' in (account.get('org_roles') or []):
        return 'student'
    return 'existing'


_REASONS = {
    'other_school': 'An Optio account outside this school uses this email.',
    'student': 'This email belongs to a student.',
    'no_family': 'The student has no family record to add the parent to.',
}


def preview(org_id: str) -> List[Dict[str, Any]]:
    """Every emergency-contact parent who could be invited, one row per family
    and email. See the module docstring."""
    students = {s['id']: s for s in _students(org_id) if s.get('id')}
    if not students:
        return []
    student_ids = sorted(students)
    contacts = [c for c in _contacts(student_ids)
                if c.get('student_user_id') in students
                and _is_parent(c.get('relationship')) and _clean_email(c.get('email'))]
    if not contacts:
        return []
    households = _households(org_id, student_ids)
    linked = _linked_guardian_emails(student_ids)
    accounts = _accounts([e for e in (_clean_email(c['email']) for c in contacts) if e])

    rows: Dict[str, Dict[str, Any]] = {}
    for c in contacts:
        sid = c['student_user_id']
        email = _clean_email(c['email']) or ''
        student = students[sid]
        if email in linked.get(sid, set()):
            continue  # already a guardian of this child
        if email == (student.get('email') or '').strip().lower():
            continue  # the child's own address, typed in the wrong box
        house = households.get(sid)
        key = f"{house['id'] if house else 'student:' + sid}|{email}"
        row = rows.get(key)
        if row is None:
            parts = (c.get('name') or '').split()
            first = parts[0] if parts else ''
            last = ' '.join(parts[1:]) or (student.get('last_name') or '')
            status = _account_status(accounts.get(email), org_id)
            invitable = bool(house) and status in ('new', 'existing') and bool(first and last)
            reason = None
            if not house:
                reason = _REASONS['no_family']
            elif status in _REASONS:
                reason = _REASONS[status]
            elif not (first and last):
                reason = 'The contact has no name to give the account.'
            row = rows[key] = {
                'key': key,
                'household_id': house['id'] if house else None,
                'household_name': house['name'] if house else None,
                'students': [],
                'name': (c.get('name') or '').strip(),
                'first_name': first,
                'last_name': last,
                'email': email,
                'relationship': (c.get('relationship') or '').strip(),
                'account': status,
                'invitable': invitable,
                'reason': reason,
            }
        if not any(s['id'] == sid for s in row['students']):
            row['students'].append({'id': sid, 'name': _person_name(student)})

    # A household where this email is linked to one sibling but listed as a
    # contact on another is already that family's guardian; the family
    # record, not each child, is what the invite joins.
    for row in list(rows.values()):
        if row['household_id'] and any(row['email'] in linked.get(s, set())
                                       for s, h in households.items()
                                       if h['id'] == row['household_id']):
            rows.pop(row['key'], None)

    return sorted(rows.values(), key=lambda r: ((r['household_name'] or '').lower(),
                                                r['email']))


def invite(org_id: str, actor_id: str, keys: Iterable[str]) -> Dict[str, Any]:
    """Invite (or connect) the selected preview rows through the one-family
    door. Keys the caller's own preview does not hold are reported, not acted
    on."""
    from services import family_guardian_service

    wanted = [k for k in dict.fromkeys(keys or []) if isinstance(k, str) and k]
    if not wanted:
        return {'error': 'Pick at least one parent to invite', 'status': 400}
    if len(wanted) > MAX_INVITES:
        return {'error': f'At most {MAX_INVITES} at a time', 'status': 400}

    by_key = {r['key']: r for r in preview(org_id)}
    results: List[Dict[str, Any]] = []
    for key in wanted:
        row = by_key.get(key)
        if not row:
            results.append({'key': key, 'status': 'not_found'})
            continue
        if not row['invitable']:
            results.append({'key': key, 'status': 'skipped', 'reason': row['reason']})
            continue
        try:
            out = family_guardian_service.add_guardian_to_household(
                org_id, row['household_id'], actor_id,
                {'first_name': row['first_name'], 'last_name': row['last_name'],
                 'email': row['email']})
        except Exception as e:  # noqa: BLE001
            # One family's failure must not stop the rest of the list.
            logger.error(f'second-parent invite failed for household '
                         f'{str(row["household_id"])[:8]}: {e}', exc_info=True)
            out = {'error': 'Could not add this parent. Please try again.', 'status': 500}
        if out.get('error'):
            results.append({'key': key, 'status': 'failed', 'reason': out['error']})
        else:
            results.append({'key': key, 'status': out.get('kind') or 'invited',
                            'invite_sent': bool(out.get('invite_sent'))})

    counts: Dict[str, int] = {}
    for r in results:
        counts[r['status']] = counts.get(r['status'], 0) + 1
    return {'results': results, 'counts': counts}
