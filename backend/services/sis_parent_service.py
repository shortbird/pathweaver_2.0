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
    """Orgs (SIS-enabled) where the user is a guardian, each with its registerable students.
    Includes each person's avatar_url so family surfaces can prompt for missing photos."""
    students = registerable_students(user_id)
    avatar_by_id: Dict[str, Any] = {}
    ids = list({s['student_id'] for s in students} | {user_id})
    try:
        rows = (_admin().table('users').select('id, avatar_url')
                .in_('id', ids).execute()).data or []
        avatar_by_id = {r['id']: r.get('avatar_url') for r in rows}
    except Exception:  # noqa: BLE001
        pass
    orgs: Dict[str, Dict[str, Any]] = {}
    for s in students:
        o = orgs.setdefault(s['org_id'], {'organization_id': s['org_id'], 'students': []})
        o['students'].append({'student_id': s['student_id'], 'name': s['name'],
                              'household_id': s['household_id'],
                              'avatar_url': avatar_by_id.get(s['student_id'])})
    if orgs:
        rows = (
            _admin().table('organizations').select('id, name')
            .in_('id', list(orgs.keys())).execute()
        ).data or []
        for r in rows:
            if r['id'] in orgs:
                orgs[r['id']]['organization_name'] = r['name']
    return {'orgs': list(orgs.values()), 'my_avatar_url': avatar_by_id.get(user_id)}


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
    gate = _family_gate(org_id, reg.get('student_user_id'))
    if gate:
        return gate
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


# ── Schedule builder (guardian-scoped add/drop/waitlist until first day) ──────
def _first_day_of_school(org_id: str) -> Optional[str]:
    """ISO date (YYYY-MM-DD) from feature_flags.sis_settings.first_day_of_school, or None."""
    row = (
        _admin().table('organizations').select('feature_flags')
        .eq('id', org_id).limit(1).execute()
    ).data or []
    flags = (row[0].get('feature_flags') or {}) if row else {}
    return (flags.get('sis_settings') or {}).get('first_day_of_school') or None


def _changes_locked(org_id: str) -> bool:
    """Families may self-serve schedule changes only BEFORE the first day of school.
    From that day on, changes are staff-only. No date configured = never locked."""
    from datetime import date
    first_day = _first_day_of_school(org_id)
    if not first_day:
        return False
    try:
        return date.today() >= date.fromisoformat(str(first_day)[:10])
    except ValueError:
        return False


# ── Family registration gates: hold + staggered tier opening ─────────────────
def _sis_settings(org_id: str) -> Dict[str, Any]:
    row = (
        _admin().table('organizations').select('feature_flags')
        .eq('id', org_id).limit(1).execute()
    ).data or []
    flags = (row[0].get('feature_flags') or {}) if row else {}
    return flags.get('sis_settings') or {}


def _student_household(org_id: str, student_user_id: str) -> Optional[Dict[str, Any]]:
    """The student's household in this org (hold fields), or None."""
    memberships = (
        _admin().table('household_members').select('household_id')
        .eq('user_id', student_user_id).execute()
    ).data or []
    hh_ids = [m['household_id'] for m in memberships if m.get('household_id')]
    if not hh_ids:
        return None
    rows = (
        _admin().table('households')
        .select('id, organization_id, registration_hold, registration_hold_reason')
        .in_('id', hh_ids).eq('organization_id', org_id).limit(1).execute()
    ).data or []
    return rows[0] if rows else None


def _family_gate(org_id: str, student_user_id: str) -> Optional[Dict[str, Any]]:
    """The error blocking this family from class signup, or None if clear.

    A registration hold (unresolved fee/question from the school) blocks all
    self-service adds. Access to registration itself is controlled by who has
    the registration link — there are no date-staggered tiers. Families with no
    household are not gated — staff-created edge cases shouldn't lock parents out.
    """
    household = _student_household(org_id, student_user_id)
    if household and household.get('registration_hold'):
        return {'error': "Your family's registration is on hold — please contact the school "
                         'to resolve it before signing up for classes.',
                'registration_hold': True}
    return None


# ── At-home learning: Optio courses (untimed) selectable in the builder ───────
import re as _re

_COURSE_CODE_RE = _re.compile(r'^[A-Za-z]{2,8}\s\d{3,4}\b')


def _selectable_courses(org_id: str) -> List[Dict[str, Any]]:
    """Optio platform courses an org family can pick for at-home learning.
    Mirrors the SIS staff catalog filter: published + public + not the org's own,
    not credit-bearing, not a college course code."""
    rows = (
        _admin().table('courses')
        .select('id, title, description, status, visibility, organization_id, '
                'credit_subject, cover_image_url, estimated_hours, age_range')
        .eq('status', 'published').eq('visibility', 'public').execute()
    ).data or []
    from services import sis_catalog_service
    tuition_cents = sis_catalog_service.optio_course_tuition_cents(org_id)
    return [{
        'id': c['id'], 'title': c['title'], 'description': c.get('description'),
        'estimated_hours': c.get('estimated_hours'), 'age_range': c.get('age_range'),
        'cover_image_url': c.get('cover_image_url'),
        'tuition_cents': tuition_cents,
    } for c in rows
        if c.get('organization_id') != org_id
        and not c.get('credit_subject')
        and not _COURSE_CODE_RE.match((c.get('title') or '').strip())]


def _student_course_enrollments(student_user_id: str) -> List[str]:
    rows = (
        _admin().table('course_enrollments').select('course_id, status')
        .eq('user_id', student_user_id).execute()
    ).data or []
    return [r['course_id'] for r in rows if r.get('status') != 'dropped']


def _optio_courses_enabled(org_id: str) -> bool:
    """Org toggle: whether Optio platform courses (at-home learning) are offered
    to this org's families in the Schedule Builder. Defaults ON."""
    row = (
        _admin().table('organizations').select('feature_flags')
        .eq('id', org_id).limit(1).execute()
    ).data or []
    flags = (row[0].get('feature_flags') or {}) if row else {}
    return bool((flags.get('sis_settings') or {}).get('optio_courses_enabled', True))


def home_learning_courses(user_id: str, org_id: str) -> Optional[List[Dict[str, Any]]]:
    if not _has_org_access(user_id, org_id):
        return None
    if not _optio_courses_enabled(org_id):
        return []
    return _selectable_courses(org_id)


def add_course(user_id: str, org_id: str, student_user_id: str, course_id: str) -> Dict[str, Any]:
    """Enroll the student in an Optio course for at-home learning. Same first-day
    lock as class changes."""
    if not _can_register(user_id, org_id, student_user_id):
        return {'error': 'Not authorized for this student'}
    if _changes_locked(org_id):
        return {'error': 'Schedule changes are now handled by the school — please contact them directly.'}
    gate = _family_gate(org_id, student_user_id)
    if gate:
        return gate
    if not _optio_courses_enabled(org_id):
        return {'error': 'Optio courses are not enabled for your school'}
    if not any(c['id'] == course_id for c in _selectable_courses(org_id)):
        return {'error': 'This course is not available'}
    from services.course_enrollment_service import CourseEnrollmentService
    result = CourseEnrollmentService(_admin()).enroll_user(student_user_id, course_id)
    if not result.get('success') and result.get('status') != 'already_enrolled':
        return {'error': result.get('error') or 'Could not enroll in the course'}
    return {'enrolled': True, 'already': result.get('status') == 'already_enrolled'}


def drop_course(user_id: str, org_id: str, student_user_id: str, course_id: str) -> Dict[str, Any]:
    if not _can_register(user_id, org_id, student_user_id):
        return {'error': 'Not authorized for this student'}
    if _changes_locked(org_id):
        return {'error': 'Schedule changes are now handled by the school — please contact them directly.'}
    from services.course_enrollment_service import CourseEnrollmentService
    result = CourseEnrollmentService(_admin()).unenroll_user(student_user_id, course_id)
    if not result.get('success'):
        return {'error': result.get('error') or 'Could not drop the course'}
    return {'ok': True}


def student_schedule(user_id: str, org_id: str, student_user_id: str) -> Dict[str, Any]:
    """The student's current schedule: active class enrollments (with meetings)
    plus live waitlist entries, at-home Optio courses, and whether self-service
    changes are still open."""
    if not _can_register(user_id, org_id, student_user_id):
        return {'error': 'Not authorized for this student'}

    enrolled_ids = {
        r['class_id'] for r in (
            _admin().table('class_enrollments').select('class_id, status')
            .eq('student_id', student_user_id).eq('status', 'active').execute()
        ).data or []
    }
    all_classes = catalog.list_classes(org_id)
    classes = [c for c in all_classes if c['id'] in enrolled_ids]

    waitlist_rows = (
        _admin().table('sis_waitlist_entries').select('*')
        .eq('organization_id', org_id).eq('student_user_id', student_user_id)
        .in_('status', ['waiting', 'offered']).execute()
    ).data or []
    by_id = {c['id']: c for c in all_classes}
    waitlist = [{
        'entry_id': w['id'], 'class_id': w['class_id'],
        'class_name': (by_id.get(w['class_id']) or {}).get('name') or 'Class',
        'position': w.get('position'), 'status': w.get('status'),
        'meetings': (by_id.get(w['class_id']) or {}).get('meetings') or [],
    } for w in waitlist_rows]

    # At-home learning: the student's Optio course enrollments (untimed).
    # Shown even if the org later disables the course catalog.
    course_ids = _student_course_enrollments(student_user_id)
    courses = []
    if course_ids:
        rows = (
            _admin().table('courses')
            .select('id, title, estimated_hours, cover_image_url, description, age_range')
            .in_('id', course_ids).execute()
        ).data or []
        tuition_cents = catalog.optio_course_tuition_cents(org_id)
        courses = [{'id': r['id'], 'title': r['title'], 'estimated_hours': r.get('estimated_hours'),
                    'cover_image_url': r.get('cover_image_url'), 'description': r.get('description'),
                    'age_range': r.get('age_range'), 'tuition_cents': tuition_cents} for r in rows]

    household = _student_household(org_id, student_user_id)
    return {
        'classes': classes,
        'waitlist': waitlist,
        'courses': courses,
        'optio_courses_enabled': _optio_courses_enabled(org_id),
        'first_day_of_school': _first_day_of_school(org_id),
        'changes_locked': _changes_locked(org_id),
        'registration_hold': bool((household or {}).get('registration_hold')),
        'time_blocks': _sis_settings(org_id).get('time_blocks') or [],
    }


def add_class(user_id: str, org_id: str, student_user_id: str, class_id: str) -> Dict[str, Any]:
    """Self-service add: enroll immediately if there's a seat, otherwise join the
    waitlist (when the class allows one). Locked from the first day of school."""
    if not _can_register(user_id, org_id, student_user_id):
        return {'error': 'Not authorized for this student'}
    if _changes_locked(org_id):
        return {'error': 'Schedule changes are now handled by the school — please contact them directly.'}
    gate = _family_gate(org_id, student_user_id)
    if gate:
        return gate

    klass = next((c for c in catalog.list_classes(org_id) if c['id'] == class_id), None)
    if not klass or klass.get('registration_status') != 'open':
        return {'error': 'This class is not open for registration'}

    existing = (
        _admin().table('class_enrollments').select('id, status')
        .eq('class_id', class_id).eq('student_id', student_user_id).execute()
    ).data or []
    if existing and existing[0].get('status') == 'active':
        return {'enrolled': True, 'already': True}

    enrolled_count = (
        _admin().table('class_enrollments').select('id', count='exact')
        .eq('class_id', class_id).eq('status', 'active').execute()
    ).count or 0
    capacity = klass.get('capacity')
    if capacity is not None and enrolled_count >= capacity:
        if not klass.get('waitlist_enabled', True):
            return {'error': 'This class is full'}
        from services import sis_waitlist_service
        entry = sis_waitlist_service.add_to_waitlist(org_id, class_id, student_user_id)
        return {'waitlisted': True, 'position': (entry or {}).get('position')}

    _admin().table('class_enrollments').upsert({
        'class_id': class_id,
        'student_id': student_user_id,
        'status': 'active',
        'enrolled_by': user_id,
    }, on_conflict='class_id,student_id').execute()
    from services.class_group_sync_service import sync_class_group
    sync_class_group(class_id, actor_id=user_id)
    return {'enrolled': True}


def drop_class(user_id: str, org_id: str, student_user_id: str, class_id: str) -> Dict[str, Any]:
    """Self-service drop: withdraw an active enrollment and/or leave the waitlist.
    Locked from the first day of school."""
    if not _can_register(user_id, org_id, student_user_id):
        return {'error': 'Not authorized for this student'}
    if _changes_locked(org_id):
        return {'error': 'Schedule changes are now handled by the school — please contact them directly.'}

    dropped = False
    enr = (
        _admin().table('class_enrollments').select('id, status')
        .eq('class_id', class_id).eq('student_id', student_user_id).execute()
    ).data or []
    if enr and enr[0].get('status') == 'active':
        _admin().table('class_enrollments').update({'status': 'withdrawn'}).eq('id', enr[0]['id']).execute()
        from services.class_group_sync_service import sync_class_group
        sync_class_group(class_id, actor_id=user_id)
        dropped = True

    wl = (
        _admin().table('sis_waitlist_entries').select('id')
        .eq('organization_id', org_id).eq('class_id', class_id)
        .eq('student_user_id', student_user_id)
        .in_('status', ['waiting', 'offered']).execute()
    ).data or []
    for w in wl:
        _admin().table('sis_waitlist_entries').delete().eq('id', w['id']).execute()
        dropped = True

    return {'ok': True, 'dropped': dropped}


# ── Org resources (family-readable document library) ─────────────────────────
def org_resources(user_id: str, org_id: str) -> Optional[List[Dict[str, Any]]]:
    """The org's resource library (guidebooks, contracts, links) for a family."""
    if not _has_org_access(user_id, org_id):
        return None
    return (
        _admin().table('org_resources')
        .select('id, title, description, url, category, sort_order')
        .eq('organization_id', org_id)
        .order('sort_order').order('title').execute()
    ).data or []


# ── Family directory (opt-in) ─────────────────────────────────────────────────
def _guardian_households(user_id: str, org_id: str) -> List[Dict[str, Any]]:
    """Households in this org where the user is a guardian."""
    memberships = (
        _admin().table('household_members').select('household_id, relationship')
        .eq('user_id', user_id).execute()
    ).data or []
    hh_ids = [m['household_id'] for m in memberships
              if m.get('relationship') in GUARDIAN_RELATIONSHIPS and m.get('household_id')]
    if not hh_ids:
        return []
    return (
        _admin().table('households')
        .select('id, name, phone, directory_opt_in')
        .in_('id', hh_ids).eq('organization_id', org_id).execute()
    ).data or []


def directory_opt_in_status(user_id: str, org_id: str) -> Dict[str, Any]:
    households = _guardian_households(user_id, org_id)
    if not households:
        return {'error': 'No family found for your account'}
    return {'opted_in': any(h.get('directory_opt_in') for h in households)}


def set_directory_opt_in(user_id: str, org_id: str, opted_in: bool) -> Dict[str, Any]:
    households = _guardian_households(user_id, org_id)
    if not households:
        return {'error': 'No family found for your account'}
    _admin().table('households').update({'directory_opt_in': bool(opted_in)}) \
        .in_('id', [h['id'] for h in households]).execute()
    return {'opted_in': bool(opted_in)}


def family_directory(user_id: str, org_id: str) -> Optional[List[Dict[str, Any]]]:
    """Opted-in families only: family name, phone, guardians (name + email),
    and student FIRST names. Staff always see everyone elsewhere; this is the
    family-to-family view, so opt-in is the hard filter."""
    if not _has_org_access(user_id, org_id):
        return None
    households = (
        _admin().table('households')
        .select('id, name, phone')
        .eq('organization_id', org_id).eq('directory_opt_in', True)
        .order('name').execute()
    ).data or []
    if not households:
        return []
    hh_ids = [h['id'] for h in households]
    members = (
        _admin().table('household_members').select('household_id, user_id, relationship')
        .in_('household_id', hh_ids).execute()
    ).data or []
    user_ids = list({m['user_id'] for m in members})
    users_map = {
        u['id']: u for u in (
            _admin().table('users')
            .select('id, display_name, first_name, last_name, email')
            .in_('id', user_ids).execute()
        ).data or []
    } if user_ids else {}

    by_household: Dict[str, Dict[str, List]] = {h['id']: {'guardians': [], 'students': []} for h in households}
    for m in members:
        slot = by_household.get(m['household_id'])
        u = users_map.get(m['user_id'])
        if not slot or not u:
            continue
        if m.get('relationship') == 'student':
            slot['students'].append(u.get('first_name') or (u.get('display_name') or '').split(' ')[0] or 'Student')
        elif m.get('relationship') in GUARDIAN_RELATIONSHIPS:
            slot['guardians'].append({'name': _student_name(u), 'email': u.get('email')})
    return [{
        'household_id': h['id'],
        'family_name': h['name'],
        'phone': h.get('phone'),
        'guardians': by_household[h['id']]['guardians'],
        'students': sorted(by_household[h['id']]['students']),
    } for h in households]


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
