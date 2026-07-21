"""
SIS CLP (Customized Learning Plan) service — composed reads for the admin CLP
meeting view.

During a CLP meeting an iCreate admin sits with a family, pulls up one kid, and
finalizes their schedule: they see the classes the kid is already registered for,
every class available (with open seats + waitlist counts), and enroll / drop /
waitlist changes live. A "presentation" (parent-safe) view reuses the very same
per-student payload — which by construction contains NO other student's data, so
the screen can be turned toward the parent and child without leaking anyone else.

NEW, additive, read-only aggregation. Writes reuse the existing catalog/waitlist
endpoints. Admin (service_role) client, same justification as sis_service.py: the
SIS tables are RLS-locked to backend-only and this is a cross-table read.
"""

from datetime import date
from typing import Dict, List, Any, Optional

from database import get_supabase_admin_client
from services import sis_service
from services import sis_catalog_service as catalog
from utils.logger import get_logger

logger = get_logger(__name__)

# Enrollment standings we never surface in a CLP meeting (the family isn't active).
_HIDDEN_ENROLLMENT_STATUSES = ('withdrawn', 'graduated')


def _admin():
    return get_supabase_admin_client()


def _full_name(u: Dict[str, Any]) -> str:
    name = f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
    return name or u.get('display_name') or u.get('username') or u.get('email') or 'Unknown'


def _age(dob: Any) -> Optional[int]:
    """Whole years from an ISO date (or date) — None when unknown/unparseable."""
    if not dob:
        return None
    if not isinstance(dob, date):
        try:
            dob = date.fromisoformat(str(dob)[:10])
        except ValueError:
            return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def _last_first(s: Dict[str, Any]) -> str:
    """Sort key that always leads with the last name, so solo students interleave
    correctly with '<Last> Family' households."""
    return f"{s.get('last_name') or ''} {s.get('first_name') or ''}".strip() or (s.get('name') or '')


def _norm_meeting(m: Dict[str, Any]) -> Dict[str, Any]:
    """Trim times to HH:MM so the frontend can compare/overlap them directly."""
    return {
        'id': m.get('id'),
        'day_of_week': m.get('day_of_week'),
        'specific_date': m.get('specific_date'),
        'start_time': str(m.get('start_time') or '')[:5],
        'end_time': str(m.get('end_time') or '')[:5],
        'location': m.get('location'),
    }


def clp_directory(org_id: str) -> Dict[str, Any]:
    """The CLP student picker: active students grouped by family + a flat list.

    Built from the roster so it carries household + enrollment standing in one
    pass. Withdrawn/graduated students are omitted (a CLP meeting is for active
    families). Students without a household form single-child "families" so
    everyone is reachable.
    """
    roster = sis_service.get_roster(org_id)
    students = [{
        'student_id': r['student_id'],
        'name': r['name'],
        'first_name': r.get('first_name'),
        'last_name': r.get('last_name'),
        'date_of_birth': r.get('date_of_birth'),
        'age': _age(r.get('date_of_birth')),
        'household_id': r.get('household_id'),
        'household_name': r.get('household_name'),
        'grade_level': r.get('grade_level'),
        'enrollment_status': r.get('enrollment_status'),
    } for r in roster
        if r.get('is_student')
        and (r.get('enrollment_status') or 'unassigned') not in _HIDDEN_ENROLLMENT_STATUSES]

    families: Dict[str, Dict[str, Any]] = {}
    order: List[str] = []
    for s in students:
        key = s['household_id'] or f"solo:{s['student_id']}"
        if key not in families:
            families[key] = {
                'household_id': s['household_id'],
                'name': s['household_name'] or s['name'],
                # Households are named "<Last> Family"; solo students would sort
                # by FIRST name under their own full name, so they get a
                # last-name-first key to interleave consistently.
                '_sort': (s['household_name'] or _last_first(s)),
                'students': [],
            }
            order.append(key)
        families[key]['students'].append(s)

    family_list = [families[k] for k in order]
    for f in family_list:
        f['students'].sort(key=lambda s: (s.get('name') or '').lower())
        f['student_count'] = len(f['students'])
    family_list.sort(key=lambda f: (f.pop('_sort') or '').lower())

    return {'families': family_list, 'students': students}


def _student_profile(student_id: str) -> Optional[Dict[str, Any]]:
    rows = (
        _admin().table('users')
        .select('id, first_name, last_name, display_name, username, email, '
                'date_of_birth, preferred_name')
        .eq('id', student_id).limit(1).execute()
    ).data
    if not rows:
        return None
    u = rows[0]
    return {
        'student_id': u['id'],
        'name': _full_name(u),
        'first_name': u.get('first_name'),
        'last_name': u.get('last_name'),
        'preferred_name': u.get('preferred_name'),
        'date_of_birth': u.get('date_of_birth'),
        'age': _age(u.get('date_of_birth')),
    }


def _family_and_siblings(org_id: str, student_id: str):
    """(family, siblings, guardian_ids) for a student. Siblings are the other
    students in the same household — used only to jump between the family's own
    kids, so they are parent-safe to show in presentation mode. Guardian ids feed
    the registration lookup (payment intent)."""
    hh = sis_service._household_by_user(org_id).get(student_id)
    if not hh:
        return None, [], []
    family = {'household_id': hh['household_id'], 'name': hh['household_name']}
    members = (
        _admin().table('household_members')
        .select('user_id, relationship')
        .eq('household_id', hh['household_id']).execute()
    ).data or []
    sib_ids = [m['user_id'] for m in members
               if m.get('relationship') == 'student' and m['user_id'] != student_id]
    guardian_ids = [m['user_id'] for m in members if m.get('relationship') != 'student']
    siblings: List[Dict[str, Any]] = []
    if sib_ids:
        rows = (
            _admin().table('users')
            .select('id, first_name, last_name, display_name, username, email, date_of_birth')
            .in_('id', sib_ids).execute()
        ).data or []
        siblings = [{'student_id': r['id'], 'name': _full_name(r),
                     'age': _age(r.get('date_of_birth'))} for r in rows]
        siblings.sort(key=lambda s: s['name'].lower())
    return family, siblings, guardian_ids


def _family_payment_intent(org_id: str, guardian_ids: List[str]) -> Optional[List[str]]:
    """The 'Form of Payment' the family chose during iCreate registration (the
    `payment_intent` registration question). Latest registration of any household
    guardian wins. None when the family never answered (pre-funnel imports)."""
    if not guardian_ids:
        return None
    try:
        rows = (
            _admin().table('icreate_registrations')
            .select('parent_user_id, answers, created_at')
            .eq('organization_id', org_id)
            .in_('parent_user_id', guardian_ids)
            .order('created_at', desc=True).execute()
        ).data or []
    except Exception as e:  # noqa: BLE001 — payment info is best-effort context
        logger.warning(f'CLP: payment-intent lookup failed for org {org_id}: {e}')
        return None
    for r in rows:
        val = (r.get('answers') or {}).get('payment_intent')
        if val:
            return [str(v) for v in val] if isinstance(val, list) else [str(val)]
    return None


def get_clp_student(org_id: str, student_id: str) -> Optional[Dict[str, Any]]:
    """The full CLP payload for one student: profile, family/siblings, the classes
    they're enrolled in (their schedule), and every class in the catalog annotated
    with whether THIS student is enrolled / waitlisted, plus live seat + waitlist
    counts. Returns None when the student isn't in this org."""
    if not sis_service.student_in_org(student_id, org_id):
        return None
    student = _student_profile(student_id)
    if not student:
        return None

    family, siblings, guardian_ids = _family_and_siblings(org_id, student_id)
    if family is not None:
        family['payment_intent'] = _family_payment_intent(org_id, guardian_ids)

    enrolled_rows = (
        _admin().table('class_enrollments').select('class_id')
        .eq('student_id', student_id).eq('status', 'active').execute()
    ).data or []
    enrolled_ids = {e['class_id'] for e in enrolled_rows}

    wl_rows = (
        _admin().table('sis_waitlist_entries')
        .select('id, class_id, status, position')
        .eq('organization_id', org_id).eq('student_user_id', student_id)
        .in_('status', ['waiting', 'offered']).execute()
    ).data or []
    wl_by_class = {w['class_id']: w for w in wl_rows}

    classes = catalog.list_classes(org_id)
    out_classes: List[Dict[str, Any]] = []
    for c in classes:
        wl = wl_by_class.get(c['id'])
        out_classes.append({
            'class_id': c['id'],
            'name': c.get('name'),
            'description': c.get('description'),
            'location': c.get('location'),
            'capacity': c.get('capacity'),
            'enrolled_count': c.get('enrolled_count'),
            'waitlist_count': c.get('waitlist_count'),
            'spots_left': c.get('spots_left'),
            'is_full': c.get('is_full'),
            'registration_status': c.get('registration_status'),
            'waitlist_enabled': c.get('waitlist_enabled'),
            'price_cents': c.get('price_cents'),
            'supply_fee': c.get('supply_fee'),
            'min_age': c.get('min_age'),
            'max_age': c.get('max_age'),
            'primary_instructor': c.get('primary_instructor'),
            'meetings': [_norm_meeting(m) for m in c.get('meetings', [])],
            'is_enrolled': c['id'] in enrolled_ids,
            'on_waitlist': bool(wl),
            'waitlist_entry_id': wl['id'] if wl else None,
            'waitlist_position': wl.get('position') if wl else None,
        })

    out_classes.sort(key=lambda c: (c['name'] or '').lower())
    schedule = [c for c in out_classes if c['is_enrolled']]

    return {
        'student': student,
        'family': family,
        'siblings': siblings,
        'classes': out_classes,
        'schedule': schedule,
    }
