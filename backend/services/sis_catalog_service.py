"""
SIS Catalog Service - composed reads for the unified Class (org_classes).

Hydrates enrollment counts / capacity / schedule so the SIS console can render the
Classes manager in a few queries. Write paths use SisClassRepository directly from
the routes. Admin (service_role) client: the SIS tables are RLS-locked to
backend-only, same justification as sis_service.py.
"""

from typing import Dict, List, Any, Optional

from database import get_supabase_admin_client
from repositories.sis_class_repository import SisClassRepository
from utils.logger import get_logger
from utils.storage_urls import sign_in_place, sign_stored_url
from utils import person_name

logger = get_logger(__name__)

# Class catalog photos. Private: they are photographs of children, so the column
# holds the canonical pointer and every read signs it. See utils/storage_urls.py.
CLASS_IMAGE_BUCKET = 'class-images'

BILLING_TYPES = ('flat', 'per_class', 'recurring')
BILLING_CADENCES = ('monthly', 'semester', 'full')
REGISTRATION_STATUSES = ('open', 'closed')

# org_classes columns for the office's eyes only. The parent Schedule Builder
# and the public embed both read classes through this service with
# audience='family' — anything listed here is stripped from those payloads.
# Columns on a class that only staff may see. Applied by _for_audience to every
# non-staff payload, and by class_service.get_student_classes to the student's
# own class list — one definition, so a new internal column is hidden in both
# places or neither.
#
# supply_budget_per_student is the school's materials budget. It is edited in
# the SIS class editor and read by no family- or student-facing surface, so it
# has no business on a payload sent to one.
STAFF_ONLY_FIELDS = ('internal_notes', 'supply_budget_per_student')


def _admin():
    # admin client justified: the SIS console acts for the whole school — this
    #   reads/writes rows belonging to every family in the org, which no single
    #   caller can see under RLS; the route's role+org gate is the authorization
    return get_supabase_admin_client()


def _classes_repo() -> SisClassRepository:
    return SisClassRepository(client=_admin())


def spots_left(capacity: Optional[int], enrolled: int, held: int = 0) -> Optional[int]:
    """Remaining CLAIMABLE seats, or None when capacity is unlimited (null).

    `held` is the number of seats promised to families with a live waitlist
    offer — those are spoken for, so they are not "left" for anyone else
    (iCreate, 2026-08-22: offered seats kept being snagged by direct enrolls
    because every surface counted them as open)."""
    if capacity is None:
        return None
    return max(0, capacity - enrolled - max(0, held))


def is_full(capacity: Optional[int], enrolled: int, held: int = 0) -> bool:
    """Full when the finite capacity is consumed by enrollments plus seats held
    by live offers."""
    if capacity is None:
        return False
    return (enrolled + max(0, held)) >= capacity


def _full_name(u: Dict[str, Any]) -> str:
    """Delegates to utils.person_name.full_name — one rule for the whole SIS.
    Ten copies of this function with two different fallback orders is half of
    why names differed screen to screen (iCreate, 2026-08-25)."""
    return person_name.full_name(u, 'Unknown')


def _instructors_by_id(instructor_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """{user_id: {id, name, avatar_url}} for the given instructor ids."""
    ids = [i for i in set(instructor_ids) if i]
    if not ids:
        return {}
    rows = (
        _admin().table('users')
        .select('id, first_name, last_name, display_name, preferred_name, username, email, avatar_url')
        .in_('id', ids).execute()
    ).data or []
    people = {u['id']: {'id': u['id'], 'name': _full_name(u), 'avatar_url': u.get('avatar_url')}
              for u in rows}
    # Staff photos are private-bucket objects. Sign the whole instructor set in
    # one batch here, so a catalog listing costs one call, not one per class.
    sign_in_place(list(people.values()), ['avatar_url'])
    return people


def _for_audience(cls: Dict[str, Any], audience: str) -> Dict[str, Any]:
    """Drop staff-only columns from a class payload bound for a non-staff
    audience. Mutates and returns cls (every caller built it fresh)."""
    if audience != 'staff':
        for k in STAFF_ONLY_FIELDS:
            cls.pop(k, None)
    return cls


def _visible_assistants(cls: Dict[str, Any], people: Dict[str, Any],
                        audience: str) -> List[Dict[str, Any]]:
    """The assistant teachers this audience is allowed to see.

    Staff always see every assistant — the office needs to know who is assigned
    whatever the class says. Families see them only when the class opts in, per
    iCreate's ask on 2026-08-04 for "a toggle to show the assistant or not"
    (an aide, a parent volunteer, or a still-undecided hire shouldn't be
    published on the catalog).
    """
    if audience != 'staff' and not cls.get('show_assistants', True):
        return []
    return [people[a] for a in (cls.get('assistant_instructor_ids') or []) if a in people]


def list_classes(org_id: str, include_archived: bool = False,
                 audience: str = 'staff') -> List[Dict[str, Any]]:
    repo = _classes_repo()
    classes = repo.list_for_org(org_id, include_archived=include_archived)
    if not classes:
        return []
    if audience != 'staff':
        classes = [c for c in classes if c.get('is_visible_to_parents') is not False]
        if not classes:
            return []
    class_ids = [c['id'] for c in classes]
    enrollment_counts = repo.enrollment_counts_for_classes(class_ids)
    waitlist_breakdown = repo.waitlist_breakdown_for_classes(class_ids)
    meetings = repo.meetings_for_classes(class_ids)
    meetings_by_class: Dict[str, List[Dict[str, Any]]] = {}
    for m in meetings:
        meetings_by_class.setdefault(m['class_id'], []).append(m)
    all_instructor_ids = [c.get('primary_instructor_id') for c in classes]
    for c in classes:
        all_instructor_ids.extend(c.get('assistant_instructor_ids') or [])
    instructors = _instructors_by_id(all_instructor_ids)

    out = []
    for c in classes:
        enrolled = enrollment_counts.get(c['id'], 0)
        cap = c.get('capacity')
        wl = waitlist_breakdown.get(c['id']) or {'waiting': 0, 'offered': 0}
        held = wl['offered']
        out.append(_for_audience({
            **c,
            'enrolled_count': enrolled,
            'waitlist_count': wl['waiting'] + wl['offered'],
            # Split out because only a waiting entry can be offered a seat — a
            # class can show a waitlist and still have nobody to offer to.
            'waitlist_waiting': wl['waiting'],
            'waitlist_offered': wl['offered'],
            # Seats promised to families with an offer out. spots_left/is_full
            # already subtract them; surfaced so staff UIs can say "2 held".
            'seats_held': held,
            'spots_left': spots_left(cap, enrolled, held),
            'is_full': is_full(cap, enrolled, held),
            'meetings': meetings_by_class.get(c['id'], []),
            'primary_instructor': instructors.get(c.get('primary_instructor_id')),
            'assistant_instructors': _visible_assistants(c, instructors, audience),
        }, audience))
    # `class-images` is private (these are photographs of children): the stored
    # image_url is a pointer, not a fetchable link. One batched signing call for
    # the whole catalog rather than one per class.
    sign_in_place(out, ['image_url'], CLASS_IMAGE_BUCKET)
    return out


def get_class_detail(org_id: str, class_id: str,
                     audience: str = 'staff') -> Optional[Dict[str, Any]]:
    repo = _classes_repo()
    cls = repo.find_by_id(class_id)
    if not cls or cls.get('organization_id') != org_id:
        return None
    if audience != 'staff' and cls.get('is_visible_to_parents') is False:
        return None
    enrolled = repo.active_enrollment_count(class_id)
    cap = cls.get('capacity')
    from services import sis_waitlist_service
    held = sis_waitlist_service.live_offer_count(class_id)
    cls['enrolled_count'] = enrolled
    cls['seats_held'] = held
    cls['spots_left'] = spots_left(cap, enrolled, held)
    cls['is_full'] = is_full(cap, enrolled, held)
    cls['meetings'] = repo.list_meetings(class_id)
    cls['prerequisites'] = repo.list_prerequisites(class_id)
    all_ids = [cls.get('primary_instructor_id')] + list(cls.get('assistant_instructor_ids') or [])
    people = _instructors_by_id(all_ids)
    cls['primary_instructor'] = people.get(cls.get('primary_instructor_id'))
    cls['assistant_instructors'] = _visible_assistants(cls, people, audience)
    detail = _for_audience(cls, audience)
    if isinstance(detail, dict) and detail.get('image_url'):
        detail['image_url'] = sign_stored_url(detail['image_url'], CLASS_IMAGE_BUCKET)
    return detail


# ── Optio-course settings (org_course_settings) ──────────────────────────────
# The "iCreate versions of Optio courses" on the Classes page are global courses,
# so the per-org teacher lives in a per-org mapping rather than on the course
# itself. Course tuition is ONE org-wide price for all Optio courses
# (feature_flags.sis_settings.optio_course_tuition_cents, set in SIS Settings);
# live-class tuition is org_classes.price_cents.

def optio_course_tuition_cents(org_id: str) -> Optional[int]:
    """The org-wide price parents are charged for any Optio course (None = free/unset)."""
    row = (
        _admin().table('organizations').select('feature_flags')
        .eq('id', org_id).limit(1).execute()
    ).data or []
    flags = (row[0].get('feature_flags') or {}) if row else {}
    value = (flags.get('sis_settings') or {}).get('optio_course_tuition_cents')
    return value if isinstance(value, int) and value >= 0 else None


# ── Schedule settings (rooms + time blocks) ──────────────────────────────────
# Both live in organizations.feature_flags.sis_settings, edited in SIS Settings.
# They are served here, on their own, because the Classes page used to read them
# out of GET /api/admin/organizations/<id> -- an org_admin-gated platform
# endpoint. A campus coordinator is deliberately NOT an org_admin, so that call
# 403'd for them and the page fell back to its no-rooms/no-blocks form: a free
# text box for the classroom instead of the room picker, and raw time inputs
# instead of the school's blocks. It only ever looked right while a superadmin
# was masquerading, because require_org_admin authorizes the ACTUAL admin.

def schedule_settings(org_id: str) -> Dict[str, Any]:
    """The org's classrooms and school-day blocks; empty lists when unset.

    Just these two keys, not the whole sis_settings blob: the rest of it is
    money and policy, and this read is open to every staff role.
    """
    row = (
        _admin().table('organizations').select('feature_flags')
        .eq('id', org_id).limit(1).execute()
    ).data or []
    settings = ((row[0].get('feature_flags') or {}).get('sis_settings') or {}) if row else {}
    rooms = settings.get('rooms')
    blocks = settings.get('time_blocks')
    return {
        'rooms': rooms if isinstance(rooms, list) else [],
        'time_blocks': blocks if isinstance(blocks, list) else [],
    }


def list_course_settings(org_id: str) -> Dict[str, Any]:
    rows = (
        _admin().table('org_course_settings')
        .select('id, course_id, teacher_id')
        .eq('organization_id', org_id).execute()
    ).data or []
    teachers = _instructors_by_id([r['teacher_id'] for r in rows if r.get('teacher_id')])
    return {
        'course_settings': [{
            'course_id': r['course_id'],
            'teacher': teachers.get(r.get('teacher_id')),
        } for r in rows if teachers.get(r.get('teacher_id'))],
        'optio_course_tuition_cents': optio_course_tuition_cents(org_id),
    }


def update_course_settings(org_id: str, course_id: str, fields: Dict[str, Any],
                           assigned_by: str) -> Dict[str, Any]:
    """Set (or clear, when teacher_id is falsy) the org's teacher for a course.
    Returns {'error': ...} when the teacher isn't a member of this org."""
    admin = _admin()
    if 'teacher_id' not in fields:
        return {'error': 'Nothing to update'}
    teacher_id = fields['teacher_id'] or None
    if not teacher_id:
        admin.table('org_course_settings').delete() \
            .eq('organization_id', org_id).eq('course_id', course_id).execute()
        return {'teacher': None}
    teacher = (
        admin.table('users').select('id, organization_id')
        .eq('id', teacher_id).limit(1).execute()
    ).data
    if not teacher or teacher[0].get('organization_id') != org_id:
        return {'error': 'Teacher not found in this organization'}
    admin.table('org_course_settings').upsert({
        'organization_id': org_id,
        'course_id': course_id,
        'teacher_id': teacher_id,
        'assigned_by': assigned_by,
    }, on_conflict='organization_id,course_id').execute()
    return {'teacher': _instructors_by_id([teacher_id]).get(teacher_id)}
