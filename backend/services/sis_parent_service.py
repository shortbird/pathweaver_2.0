"""
SIS Parent self-service — guardians register their own children for classes.

Reuses the staff registration/catalog/billing services but authorizes by FAMILY
RELATIONSHIP (the requesting user must be a guardian of the student, via household
membership or users.managed_by_parent_id) instead of by staff role. Self-service
stops at 'submitted': staff review/invoice, and paying the invoice in full
auto-enrolls the student (see sis_billing_service._maybe_autocomplete_registration).

Admin (service_role) client throughout — SIS tables are RLS-locked to backend-only;
authorization is enforced here in code, never by passing through a caller's role.
"""

from typing import Dict, List, Any, Optional

from database import get_supabase_admin_client
from services import sis_registration_service as regs
from services import sis_catalog_service as catalog
from services import sis_billing_service as billing
from services import sis_planned_absence_service as absences
from utils.org_features import org_has_feature
from utils.logger import get_logger

logger = get_logger(__name__)

# A household member counts as a guardian for self-service if they're not the student.
GUARDIAN_RELATIONSHIPS = ('guardian', 'other')


def _admin():
    return get_supabase_admin_client()


def _student_name(u: Dict[str, Any]) -> str:
    name = (u.get('display_name') or
            f"{u.get('first_name') or ''} {u.get('last_name') or ''}").strip()
    return name or (u.get('username') or u.get('email') or 'Unnamed')


# ── Authorization: which students may this guardian register? ─────────────────
def registerable_students(guardian_user_id: str) -> List[Dict[str, Any]]:
    """Students the guardian may register, as [{student_id, name, org_id, household_id}].

    Limited to SIS-enabled orgs. Resolves family via household membership (microschool
    model) and the platform managed_by_parent_id link (dependent accounts).
    """
    found: Dict[tuple, Dict[str, Any]] = {}  # (student_id, org_id) -> partial

    # 1) Household path — guardian + student share a household.
    memberships = (
        _admin().table('household_members').select('household_id, relationship')
        .eq('user_id', guardian_user_id).execute()
    ).data or []
    hh_ids = [m['household_id'] for m in memberships
              if m.get('relationship') in GUARDIAN_RELATIONSHIPS and m.get('household_id')]
    if hh_ids:
        households = {
            h['id']: h for h in (
                _admin().table('households').select('id, organization_id')
                .in_('id', hh_ids).execute()
            ).data or []
        }
        students = (
            _admin().table('household_members').select('user_id, household_id, relationship')
            .in_('household_id', hh_ids).eq('relationship', 'student').execute()
        ).data or []
        for s in students:
            hh = households.get(s['household_id'])
            org_id = hh.get('organization_id') if hh else None
            if org_id:
                found[(s['user_id'], org_id)] = {
                    'student_id': s['user_id'], 'org_id': org_id, 'household_id': s['household_id'],
                }

    # 2) Dependent accounts — users.managed_by_parent_id points at the guardian.
    managed = (
        _admin().table('users').select('id, organization_id')
        .eq('managed_by_parent_id', guardian_user_id).execute()
    ).data or []
    for m in managed:
        org_id = m.get('organization_id')
        if org_id:
            found.setdefault((m['id'], org_id), {
                'student_id': m['id'], 'org_id': org_id, 'household_id': None,
            })

    if not found:
        return []

    # Gate to SIS-enabled orgs + hydrate names.
    student_ids = list({k[0] for k in found})
    users_map = {
        u['id']: u for u in (
            _admin().table('users')
            .select('id, display_name, first_name, last_name, username, email')
            .in_('id', student_ids).execute()
        ).data or []
    }
    org_enabled: Dict[str, bool] = {}
    out: List[Dict[str, Any]] = []
    for (sid, oid), v in found.items():
        if oid not in org_enabled:
            org_enabled[oid] = org_has_feature(oid, 'sis_enabled')
        if not org_enabled[oid]:
            continue
        out.append({**v, 'name': _student_name(users_map.get(sid, {}))})
    return out


def context(user_id: str) -> Dict[str, Any]:
    """Orgs (SIS-enabled) where the user is a guardian, each with its registerable students."""
    students = registerable_students(user_id)
    orgs: Dict[str, Dict[str, Any]] = {}
    for s in students:
        o = orgs.setdefault(s['org_id'], {'organization_id': s['org_id'], 'students': []})
        o['students'].append({'student_id': s['student_id'], 'name': s['name'],
                              'household_id': s['household_id']})
    if orgs:
        rows = (
            _admin().table('organizations').select('id, name')
            .in_('id', list(orgs.keys())).execute()
        ).data or []
        for r in rows:
            if r['id'] in orgs:
                orgs[r['id']]['organization_name'] = r['name']
    return {'orgs': list(orgs.values())}


def _has_org_access(user_id: str, org_id: str) -> bool:
    return any(s['org_id'] == org_id for s in registerable_students(user_id))


def _can_register(user_id: str, org_id: str, student_user_id: str) -> bool:
    return any(s['student_id'] == student_user_id and s['org_id'] == org_id
               for s in registerable_students(user_id))


def _owned_registration(user_id: str, org_id: str, reg_id: str) -> Optional[Dict[str, Any]]:
    reg = regs.get_registration(org_id, reg_id)
    if not reg or reg.get('guardian_user_id') != user_id:
        return None
    return reg


# ── Catalog (open classes only) ───────────────────────────────────────────────
def open_classes(user_id: str, org_id: str) -> Optional[List[Dict[str, Any]]]:
    if not _has_org_access(user_id, org_id):
        return None
    return [c for c in catalog.list_classes(org_id)
            if c.get('registration_status') == 'open']


# ── Registration lifecycle (guardian-scoped) ─────────────────────────────────
def create_registration(user_id: str, org_id: str, student_user_id: str) -> Dict[str, Any]:
    if not _can_register(user_id, org_id, student_user_id):
        return {'error': 'Not authorized to register this student'}
    reg = regs.create_registration(org_id, student_user_id, guardian_user_id=user_id)
    return {'registration': reg}


def list_my_registrations(user_id: str) -> List[Dict[str, Any]]:
    regs_rows = (
        _admin().table('sis_registrations').select('*')
        .eq('guardian_user_id', user_id).order('created_at', desc=True).execute()
    ).data or []
    if not regs_rows:
        return []
    student_ids = list({r['student_user_id'] for r in regs_rows})
    org_ids = list({r['organization_id'] for r in regs_rows})
    users_map = {
        u['id']: u for u in (
            _admin().table('users')
            .select('id, display_name, first_name, last_name, username, email')
            .in_('id', student_ids).execute()
        ).data or []
    }
    org_names = {
        o['id']: o['name'] for o in (
            _admin().table('organizations').select('id, name').in_('id', org_ids).execute()
        ).data or []
    }
    reg_ids = [r['id'] for r in regs_rows]
    items = (
        _admin().table('sis_registration_items').select('registration_id')
        .in_('registration_id', reg_ids).execute()
    ).data or []
    counts: Dict[str, int] = {}
    for it in items:
        counts[it['registration_id']] = counts.get(it['registration_id'], 0) + 1
    for r in regs_rows:
        r['student_name'] = _student_name(users_map.get(r['student_user_id'], {}))
        r['organization_name'] = org_names.get(r['organization_id'])
        r['item_count'] = counts.get(r['id'], 0)
    return regs_rows


def get_registration(user_id: str, org_id: str, reg_id: str) -> Optional[Dict[str, Any]]:
    return _owned_registration(user_id, org_id, reg_id)


def add_item(user_id: str, org_id: str, reg_id: str, class_id: str) -> Dict[str, Any]:
    reg = _owned_registration(user_id, org_id, reg_id)
    if not reg:
        return {'error': 'Registration not found'}
    if reg.get('status') in ('submitted', 'completed', 'cancelled'):
        return {'error': 'This registration can no longer be edited'}
    # Parents may only add classes that are open for registration.
    allowed = {c['id'] for c in (open_classes(user_id, org_id) or [])}
    if class_id not in allowed:
        return {'error': 'This class is not open for registration'}
    return regs.add_item(org_id, reg_id, class_id)


def remove_item(user_id: str, org_id: str, reg_id: str, item_id: str) -> Dict[str, Any]:
    reg = _owned_registration(user_id, org_id, reg_id)
    if not reg:
        return {'error': 'Registration not found'}
    if reg.get('status') in ('submitted', 'completed', 'cancelled'):
        return {'error': 'This registration can no longer be edited'}
    regs.remove_item(reg_id, item_id)
    return {'ok': True}


def quote(user_id: str, org_id: str, reg_id: str) -> Dict[str, Any]:
    if not _owned_registration(user_id, org_id, reg_id):
        return {'error': 'Registration not found'}
    return billing.quote_for_registration(org_id, reg_id)


def submit(user_id: str, org_id: str, reg_id: str) -> Dict[str, Any]:
    reg = _owned_registration(user_id, org_id, reg_id)
    if not reg:
        return {'error': 'Registration not found'}
    if not reg.get('items'):
        return {'error': 'Add at least one class before submitting'}
    return {'registration': regs.submit(org_id, reg_id)}


# ── Planned absences (guardian-scoped) ────────────────────────────────────────
def list_absences(user_id: str, org_id: str, student_user_id: str) -> Dict[str, Any]:
    """Upcoming planned absences for a child + the classes the parent can pick from."""
    if not _can_register(user_id, org_id, student_user_id):
        return {'error': 'Not authorized for this student'}
    return {
        'absences': absences.list_for_student(org_id, student_user_id),
        'classes': absences.student_scheduled_classes(org_id, student_user_id),
    }


def create_absence(user_id: str, org_id: str, student_user_id: str, absence_date: str,
                   class_id: Optional[str] = None, reason: Optional[str] = None) -> Dict[str, Any]:
    if not _can_register(user_id, org_id, student_user_id):
        return {'error': 'Not authorized for this student'}
    return absences.create(org_id, student_user_id, reported_by=user_id,
                           absence_date=absence_date, class_id=class_id, reason=reason)


def cancel_absence(user_id: str, absence_id: str) -> Dict[str, Any]:
    row = absences.get(absence_id)
    if not row:
        return {'error': 'Absence not found'}
    if not _can_register(user_id, row['organization_id'], row['student_user_id']):
        return {'error': 'Not authorized for this student'}
    return {'ok': absences.cancel(absence_id, row['organization_id'])}
