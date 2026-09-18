"""
Emergency contacts: one writer for the per-student rows.

An emergency contact is a row per student in `emergency_contacts`. The funnel
wrote them (and deleted them again on a back-edit), the SIS student endpoint
wrote them, the household endpoints wrote them across a family, and
copy-from-family wrote them once more -- and a family re-submitting its
details deleted the contacts the office had added
(docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, C1; M4 in
docs/sis/CONSOLIDATION_PLAN.md). Every write goes through here now;
`registrations.emergency_contacts` is the funnel's draft only.

`replace_for_students` is the funnel's write: it replaces the contacts THIS
source wrote and leaves the office's alone, so a family who back-edits the
details step no longer wipes what staff added after them.
"""

from typing import Any, Dict, List, Optional

from services import sis_service
from services.sis_service import student_in_org
from utils.logger import get_logger

logger = get_logger(__name__)

# What the funnel writes is tagged so it can replace its own rows and only
# its own: contacts a family typed on the details step.
FUNNEL_SOURCE = 'registration_funnel'

# admin client justified: the SIS console and the funnel act for the whole
#   school; the routes are role-gated and the student is org-checked
from utils.admin_client import admin_client as _admin


def list_emergency_contacts(student_id: str) -> List[Dict[str, Any]]:
    resp = (
        _admin().table('emergency_contacts')
        .select('*')
        .eq('student_user_id', student_id)
        .order('priority')
        .execute()
    )
    return resp.data or []


def add_emergency_contact(student_id: str, org_id: Optional[str],
                          fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    payload = {
        'student_user_id': student_id,
        'organization_id': org_id,
        'name': fields.get('name'),
        'relationship': fields.get('relationship'),
        'phone': fields.get('phone'),
        'email': fields.get('email'),
        'priority': fields.get('priority') or 1,
        'can_pickup': bool(fields.get('can_pickup')),
    }
    resp = _admin().table('emergency_contacts').insert(payload).execute()
    return resp.data[0] if resp.data else None


def delete_emergency_contact(contact_id: str, org_id: str) -> bool:
    """Delete a single emergency contact, but only when it belongs to the
    caller's org (IDOR-H10). Ownership is the contact's own organization_id when
    set, else the org of the student it belongs to (older rows may have NULL
    organization_id). Returns True if deleted, False if not found / forbidden."""
    row = (
        _admin().table('emergency_contacts')
        .select('id, student_user_id, organization_id')
        .eq('id', contact_id).limit(1).execute()
    ).data
    if not row:
        return False
    c = row[0]
    contact_org = c.get('organization_id')
    if contact_org:
        if contact_org != org_id:
            return False
    elif not student_in_org(c.get('student_user_id'), org_id):
        return False
    _admin().table('emergency_contacts').delete().eq('id', contact_id).execute()
    return True


def _contact_key(c: Dict[str, Any]):
    return ((c.get('name') or '').strip().lower(), (c.get('phone') or '').strip())


def household_emergency_contacts(org_id: str, household_id: str) -> List[Dict[str, Any]]:
    """Emergency contacts across a household's students, deduped into one family list.
    Each item carries the underlying per-student row ids so it can be removed family-wide."""
    sids = household_student_ids(org_id, household_id)
    if not sids:
        return []
    rows = (
        _admin().table('emergency_contacts').select('*')
        .in_('student_user_id', sids).execute()
    ).data or []
    agg: Dict[Any, Dict[str, Any]] = {}
    for r in rows:
        key = _contact_key(r)
        a = agg.setdefault(key, {
            'name': r.get('name'), 'relationship': r.get('relationship'),
            'phone': r.get('phone'), 'email': r.get('email'),
            'ids': [], 'student_ids': set(),
        })
        a['ids'].append(r['id'])
        a['student_ids'].add(r['student_user_id'])
    out = [{
        'name': a['name'], 'relationship': a['relationship'], 'phone': a['phone'], 'email': a['email'],
        'ids': a['ids'], 'student_count': len(a['student_ids']), 'total_students': len(sids),
    } for a in agg.values()]
    out.sort(key=lambda x: (x['name'] or '').lower())
    return out


def add_household_emergency_contact(org_id: str, household_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
    """Add a contact to every student in the household (skipping students who already have it)."""
    sids = household_student_ids(org_id, household_id)
    name = (fields.get('name') or '').strip()
    if not name or not sids:
        return {'added': 0}
    key = _contact_key({'name': name, 'phone': fields.get('phone')})
    added = 0
    for sid in sids:
        existing = list_emergency_contacts(sid)
        if any(_contact_key(c) == key for c in existing):
            continue
        add_emergency_contact(sid, org_id, fields)
        added += 1
    return {'added': added}


def remove_household_emergency_contacts(org_id: str, household_id: str, ids: List[str]) -> int:
    """Delete the given emergency-contact rows, but only those belonging to a
    student in this household + org (IDOR-H10). Any ids outside the household are
    ignored rather than trusted from the request body. Returns the count deleted."""
    if not ids:
        return 0
    sids = set(household_student_ids(org_id, household_id))
    if not sids:
        return 0
    rows = (
        _admin().table('emergency_contacts').select('id, student_user_id')
        .in_('id', ids).execute()
    ).data or []
    allowed = [r['id'] for r in rows if r.get('student_user_id') in sids]
    if allowed:
        _admin().table('emergency_contacts').delete().in_('id', allowed).execute()
    return len(allowed)


def copy_family_contacts_to_student(org_id: str, student_id: str) -> Dict[str, Any]:
    """Copy the student's family contacts onto their own record (skipping ones they have)."""
    hh = sis_service._household_by_user(org_id).get(student_id)
    if not hh:
        return {'copied': 0, 'no_family': True}
    fam = household_emergency_contacts(org_id, hh['household_id'])
    have = {_contact_key(c) for c in list_emergency_contacts(student_id)}
    copied = 0
    for c in fam:
        if _contact_key(c) in have:
            continue
        add_emergency_contact(student_id, org_id, c)
        copied += 1
    return {'copied': copied}


def household_student_ids(org_id: str, household_id: str) -> List[str]:
    return sis_service.household_student_ids(org_id, household_id)


def _repo():
    from repositories.emergency_contact_repository import EmergencyContactRepository
    return EmergencyContactRepository(client=_admin())


def delete_for_students(student_ids: List[str]) -> None:
    """Drop every contact on these students (the funnel's family step
    re-creating its kids; the accounts go with them)."""
    _repo().delete_for_students(student_ids)


def replace_for_students(org_id: str, student_ids: List[str], contacts: List[Dict[str, Any]],
                         source: str = FUNNEL_SOURCE) -> int:
    """Set these contacts on each student, replacing the rows this `source`
    wrote before and nobody else's. Contacts are {name, relationship, phone,
    email}; priority follows their order. Returns the rows written.

    Rows from before the `source` column (NULL) are replaced only when they
    are the same contact being re-submitted (same name and phone), so a
    family's back-edit refreshes what they typed and leaves the office's
    additions alone."""
    ids = [s for s in (student_ids or []) if s]
    if not ids:
        return 0
    repo = _repo()
    repo.delete_for_students(ids, source=source)
    incoming = {_contact_key(c) for c in (contacts or [])}
    stale = [r['id'] for r in repo.unsourced_for_students(ids) if _contact_key(r) in incoming]
    repo.delete_ids(stale)
    rows = []
    for sid in ids:
        for pri, c in enumerate(contacts or [], start=1):
            rows.append({
                'student_user_id': sid, 'organization_id': org_id,
                'name': c.get('name'), 'relationship': c.get('relationship'),
                'phone': c.get('phone'), 'email': c.get('email'),
                'priority': pri, 'source': source,
            })
    return repo.insert_rows(rows)
