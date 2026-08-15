"""
SIS reporting — enrollment, revenue, and attendance summaries for the admin console.

The aggregation math is pure (testable without a DB); thin wrappers fetch the rows.
Revenue is record-only (billed vs. collected vs. outstanding) — Optio reports money,
it doesn't move it. See SIS_IMPLEMENTATION_PLAN.md (M7).
"""

from typing import Dict, List, Any, Optional

from database import get_supabase_admin_client
from services import sis_attendance_service as attendance
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)


def _admin():
    return get_supabase_admin_client()


# ── Pure aggregators (unit-tested) ───────────────────────────────────────────
def aggregate_revenue(invoices: List[Dict[str, Any]]) -> Dict[str, Any]:
    billed = sum(i.get('total_cents', 0) for i in invoices)
    collected = sum(i.get('amount_paid_cents', 0) for i in invoices)
    by_status: Dict[str, int] = {}
    for i in invoices:
        by_status[i.get('status', 'unknown')] = by_status.get(i.get('status', 'unknown'), 0) + 1
    return {
        'invoice_count': len(invoices),
        'billed_cents': billed,
        'collected_cents': collected,
        'outstanding_cents': max(0, billed - collected),
        'by_status': by_status,
    }


def aggregate_enrollment(school_enrollments: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_status: Dict[str, int] = {}
    for e in school_enrollments:
        by_status[e.get('status', 'unknown')] = by_status.get(e.get('status', 'unknown'), 0) + 1
    return {'total': len(school_enrollments), 'by_status': by_status}


# ── DB wrappers ──────────────────────────────────────────────────────────────
# Every read here spans a whole organization, so each one is paged with
# fetch_all_rows: PostgREST silently caps a single response at 1000 rows, and a
# truncated read makes these reports quietly wrong (the enrollment report's
# class_enrollments read was the first to cross the cap — OPTIO-BACKEND-4K,
# 1000 of 1248 rows). Attendance grows per student per day, so it gets there
# fastest of all.

def enrollment_report(org_id: str) -> Dict[str, Any]:
    enrollments = fetch_all_rows(lambda: (
        _admin().table('school_enrollments').select('status')
        .eq('organization_id', org_id)
    ))
    active_classes = (
        _admin().table('org_classes').select('id', count='exact')
        .eq('organization_id', org_id).neq('status', 'archived').execute()
    ).count or 0
    report = aggregate_enrollment(enrollments)
    report['active_classes'] = active_classes
    return report


def revenue_report(org_id: str) -> Dict[str, Any]:
    invoices = fetch_all_rows(lambda: (
        _admin().table('sis_invoices')
        .select('status, total_cents, amount_paid_cents')
        .eq('organization_id', org_id)
    ))
    return aggregate_revenue(invoices)


def attendance_report(org_id: str) -> Dict[str, Any]:
    records = fetch_all_rows(lambda: (
        _admin().table('sis_attendance').select('status, class_id')
        .eq('organization_id', org_id)
    ))
    overall = attendance.summarize(records)
    # per-class breakdown
    by_class: Dict[str, List[Dict[str, Any]]] = {}
    for r in records:
        by_class.setdefault(r['class_id'], []).append(r)
    per_class = [{'class_id': cid, **attendance.summarize(rs)} for cid, rs in by_class.items()]
    return {'overall': overall, 'per_class': per_class}


# ── Class report ─────────────────────────────────────────────────────────────
# One row per class, with the office picking the columns (iCreate, 2026-08-14:
# "a report for classes where I can select information like teacher, time, supply
# fee, tuition, extra materials, description, if curriculum has been attached,
# room, etc."). The field list is defined here and sent to the UI with the report,
# so the picker and the CSV can never drift apart.

DOW_SHORT = {0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat'}


def _hhmm(t: Optional[str]) -> str:
    """'09:30:00' / '09:30' -> '09:30'."""
    if not t:
        return ''
    parts = str(t).split(':')
    if len(parts) < 2:
        return ''
    return f'{parts[0]}:{parts[1]}'


def _t12(t: Optional[str]) -> str:
    hm = _hhmm(t)
    if not hm:
        return ''
    try:
        h, m = (int(x) for x in hm.split(':'))
    except ValueError:
        return ''
    ampm = 'pm' if h >= 12 else 'am'
    h12 = 12 if h % 12 == 0 else h % 12
    return f'{h12}:{m:02d}{ampm}'


def _days(meetings: List[Dict[str, Any]]) -> str:
    seen = sorted({m.get('day_of_week') for m in meetings if m.get('day_of_week') is not None})
    return ' '.join(DOW_SHORT.get(d, '') for d in seen).strip()


def _time_range(meetings: List[Dict[str, Any]]) -> str:
    """The earliest meeting's time. class_meetings comes back unordered from a
    paged read, so sort before picking — otherwise the same class reports a
    different time run to run."""
    timed = [m for m in meetings if m.get('start_time') and m.get('end_time')]
    if not timed:
        return ''
    first = min(timed, key=lambda m: ((m.get('day_of_week') if m.get('day_of_week') is not None else 9),
                                      _hhmm(m['start_time'])))
    return f"{_t12(first['start_time'])}-{_t12(first['end_time'])}"


def _ages(cls: Dict[str, Any]) -> str:
    lo, hi = cls.get('min_age'), cls.get('max_age')
    if lo is not None and hi is not None:
        return f'{lo}-{hi}'
    if lo is not None:
        return f'{lo}+'
    if hi is not None:
        return f'up to {hi}'
    return ''


def _dollars(value: Any) -> str:
    if value is None:
        return ''
    try:
        return f'${float(value):.2f}'
    except (TypeError, ValueError):
        return ''


def _cents(value: Any) -> str:
    if value is None:
        return ''
    try:
        return f'${int(value) / 100:.2f}'
    except (TypeError, ValueError):
        return ''


def _person(p: Optional[Dict[str, Any]]) -> str:
    return (p or {}).get('name') or ''


# key, label, hint (shown under the checkbox), default (pre-checked)
CLASS_REPORT_FIELDS: List[Dict[str, Any]] = [
    {'key': 'name', 'label': 'Class', 'hint': 'Class name', 'default': True},
    {'key': 'teacher', 'label': 'Teacher', 'hint': 'Primary instructor', 'default': True},
    {'key': 'assistants', 'label': 'Assistant teachers', 'hint': 'Assigned assistants', 'default': False},
    {'key': 'days', 'label': 'Days', 'hint': 'Meeting days (e.g. Mon Wed)', 'default': True},
    {'key': 'time', 'label': 'Time', 'hint': 'Meeting time (e.g. 9:00am-10:00am)', 'default': True},
    {'key': 'room', 'label': 'Room', 'hint': 'Classroom / location', 'default': True},
    {'key': 'ages', 'label': 'Ages', 'hint': 'Age range', 'default': True},
    {'key': 'tuition', 'label': 'Tuition', 'hint': 'Class price', 'default': True},
    {'key': 'billing', 'label': 'Billing', 'hint': 'How tuition is charged', 'default': False},
    {'key': 'supply_fee', 'label': 'Supply fee', 'hint': 'One-off materials fee families pay', 'default': True},
    {'key': 'materials_allowance', 'label': 'Materials allowance',
     'hint': 'Tuition-funded budget per student', 'default': False},
    {'key': 'extra_materials', 'label': 'Extra materials',
     'hint': 'Documents and links shared on the class', 'default': False},
    {'key': 'curriculum_attached', 'label': 'Curriculum attached?',
     'hint': 'Yes / No', 'default': True},
    {'key': 'curriculum', 'label': 'Curriculum', 'hint': 'Titles of attached curriculum', 'default': False},
    {'key': 'description', 'label': 'Description', 'hint': 'Class description text', 'default': False},
    {'key': 'enrolled', 'label': 'Enrolled', 'hint': 'Active students', 'default': True},
    {'key': 'capacity', 'label': 'Capacity', 'hint': 'Seat limit', 'default': True},
    {'key': 'spots_left', 'label': 'Spots left', 'hint': 'Seats still open', 'default': False},
    {'key': 'waitlist', 'label': 'Waitlist', 'hint': 'Waiting plus offered', 'default': False},
    {'key': 'registration', 'label': 'Registration', 'hint': 'Open, Closed, or Archived', 'default': False},
    {'key': 'internal_notes', 'label': 'Internal notes', 'hint': 'Staff-only notes on the class', 'default': False},
]

CLASS_REPORT_KEYS = [f['key'] for f in CLASS_REPORT_FIELDS]
CLASS_REPORT_DEFAULTS = [f['key'] for f in CLASS_REPORT_FIELDS if f['default']]


def build_class_rows(classes: List[Dict[str, Any]],
                     curriculum_by_class: Dict[str, List[str]],
                     materials_by_class: Dict[str, List[str]]) -> List[Dict[str, Any]]:
    """One dict per class, keyed by CLASS_REPORT_KEYS. Pure — the route picks
    which keys to show; every key is always computed so switching columns never
    needs another round trip."""
    rows = []
    for c in classes:
        meetings = c.get('meetings') or []
        curriculum = curriculum_by_class.get(c['id']) or []
        materials = materials_by_class.get(c['id']) or []
        billing = ' '.join(p for p in [c.get('billing_type') or '', c.get('billing_cadence') or ''] if p)
        rows.append({
            'name': c.get('name') or '',
            'teacher': _person(c.get('primary_instructor')),
            'assistants': ', '.join(_person(a) for a in (c.get('assistant_instructors') or []) if _person(a)),
            'days': _days(meetings),
            'time': _time_range(meetings),
            'room': c.get('location') or '',
            'ages': _ages(c),
            'tuition': _cents(c.get('price_cents')),
            'billing': billing,
            'supply_fee': _dollars(c.get('supply_fee')),
            'materials_allowance': _dollars(c.get('supply_budget_per_student')),
            'extra_materials': '; '.join(materials),
            'curriculum_attached': 'Yes' if curriculum else 'No',
            'curriculum': '; '.join(curriculum),
            'description': c.get('description') or '',
            'enrolled': c.get('enrolled_count') or 0,
            'capacity': c.get('capacity') if c.get('capacity') is not None else '',
            'spots_left': c.get('spots_left') if c.get('spots_left') is not None else '',
            'waitlist': c.get('waitlist_count') or 0,
            'registration': ('Archived' if c.get('status') == 'archived'
                             else 'Open' if c.get('registration_status') == 'open' else 'Closed'),
            'internal_notes': c.get('internal_notes') or '',
        })
    rows.sort(key=lambda r: (r['name'] or '').lower())
    return rows


def _curriculum_by_class(class_ids: List[str]) -> Dict[str, List[str]]:
    """class_id -> titles of the curriculum attached to it."""
    if not class_ids:
        return {}
    links = fetch_all_rows(lambda: (
        _admin().table('sis_curriculum_classes').select('curriculum_id, class_id')
        .in_('class_id', class_ids)
    ))
    curriculum_ids = list({link['curriculum_id'] for link in links if link.get('curriculum_id')})
    if not curriculum_ids:
        return {}
    titles = {}
    for entry in fetch_all_rows(lambda: (
        _admin().table('sis_curriculum').select('id, title').in_('id', curriculum_ids)
    )):
        titles[entry['id']] = entry.get('title') or ''
    out: Dict[str, List[str]] = {}
    for link in links:
        title = titles.get(link.get('curriculum_id'))
        if title:
            out.setdefault(link['class_id'], []).append(title)
    for cid in out:
        out[cid].sort(key=str.lower)
    return out


def _materials_by_class(class_ids: List[str]) -> Dict[str, List[str]]:
    """class_id -> titles of the documents and links shared on the class."""
    if not class_ids:
        return {}
    rows = fetch_all_rows(lambda: (
        _admin().table('class_materials').select('class_id, title').in_('class_id', class_ids)
    ))
    out: Dict[str, List[str]] = {}
    for r in rows:
        title = (r.get('title') or '').strip()
        if title:
            out.setdefault(r['class_id'], []).append(title)
    for cid in out:
        out[cid].sort(key=str.lower)
    return out


def class_report(org_id: str, include_archived: bool = False) -> Dict[str, Any]:
    """Every class in the org with every reportable field filled in."""
    from services import sis_catalog_service
    classes = sis_catalog_service.list_classes(org_id, include_archived=include_archived,
                                               audience='staff')
    class_ids = [c['id'] for c in classes]
    return {
        'fields': CLASS_REPORT_FIELDS,
        'rows': build_class_rows(classes, _curriculum_by_class(class_ids),
                                 _materials_by_class(class_ids)),
    }
