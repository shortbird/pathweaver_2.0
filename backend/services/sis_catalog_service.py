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

logger = get_logger(__name__)

BILLING_TYPES = ('flat', 'per_class', 'recurring')
BILLING_CADENCES = ('monthly', 'semester', 'full')
REGISTRATION_STATUSES = ('open', 'closed')


def _admin():
    return get_supabase_admin_client()


def _classes_repo() -> SisClassRepository:
    return SisClassRepository(client=_admin())


def spots_left(capacity: Optional[int], enrolled: int) -> Optional[int]:
    """Remaining seats, or None when capacity is unlimited (null)."""
    if capacity is None:
        return None
    return max(0, capacity - enrolled)


def is_full(capacity: Optional[int], enrolled: int) -> bool:
    """A class is full only when it has a finite capacity that is met or exceeded."""
    if capacity is None:
        return False
    return enrolled >= capacity


def _full_name(u: Dict[str, Any]) -> str:
    name = f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
    return name or u.get('display_name') or u.get('username') or u.get('email') or 'Unknown'


def _instructors_by_id(instructor_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """{user_id: {id, name, avatar_url}} for the given instructor ids."""
    ids = [i for i in set(instructor_ids) if i]
    if not ids:
        return {}
    rows = (
        _admin().table('users')
        .select('id, first_name, last_name, display_name, username, email, avatar_url')
        .in_('id', ids).execute()
    ).data or []
    return {u['id']: {'id': u['id'], 'name': _full_name(u), 'avatar_url': u.get('avatar_url')}
            for u in rows}


def list_classes(org_id: str, include_archived: bool = False) -> List[Dict[str, Any]]:
    repo = _classes_repo()
    classes = repo.list_for_org(org_id, include_archived=include_archived)
    if not classes:
        return []
    class_ids = [c['id'] for c in classes]
    enrollment_counts = repo.enrollment_counts_for_classes(class_ids)
    waitlist_counts = repo.waitlist_counts_for_classes(class_ids)
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
        out.append({
            **c,
            'enrolled_count': enrolled,
            'waitlist_count': waitlist_counts.get(c['id'], 0),
            'spots_left': spots_left(cap, enrolled),
            'is_full': is_full(cap, enrolled),
            'meetings': meetings_by_class.get(c['id'], []),
            'primary_instructor': instructors.get(c.get('primary_instructor_id')),
            'assistant_instructors': [instructors[a] for a in (c.get('assistant_instructor_ids') or []) if a in instructors],
        })
    return out


def get_class_detail(org_id: str, class_id: str) -> Optional[Dict[str, Any]]:
    repo = _classes_repo()
    cls = repo.find_by_id(class_id)
    if not cls or cls.get('organization_id') != org_id:
        return None
    enrolled = repo.active_enrollment_count(class_id)
    cap = cls.get('capacity')
    cls['enrolled_count'] = enrolled
    cls['spots_left'] = spots_left(cap, enrolled)
    cls['is_full'] = is_full(cap, enrolled)
    cls['meetings'] = repo.list_meetings(class_id)
    cls['prerequisites'] = repo.list_prerequisites(class_id)
    all_ids = [cls.get('primary_instructor_id')] + list(cls.get('assistant_instructor_ids') or [])
    people = _instructors_by_id(all_ids)
    cls['primary_instructor'] = people.get(cls.get('primary_instructor_id'))
    cls['assistant_instructors'] = [people[a] for a in (cls.get('assistant_instructor_ids') or []) if a in people]
    return cls


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
