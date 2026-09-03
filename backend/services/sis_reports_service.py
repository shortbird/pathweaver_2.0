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

def students_in_classes(org_id: str) -> int:
    """How many distinct students hold an active seat in one of the org's classes.

    iCreate, 2026-08-18: "it says we have 7 students and 1 enrolled. What does
    enrolled vs students mean? And also this is incorrect of course." Both
    numbers came from `school_enrollments`, which is the school-of-record
    (diploma) enrolment and which they barely use — 7 rows, of which 4 were
    withdrawn and 2 graduated. Meanwhile 188 children were sitting in their
    classes. Neither number was wrong; neither was the number anyone wanted.

    PostgREST cannot count DISTINCT, so the rows are paged and de-duplicated
    here. Paged, not fetched: this read is per student per class (1,147 rows for
    iCreate today) and is exactly the shape that silently truncated at 1000 and
    made class counts FALL as families enrolled.
    """
    class_ids = [c['id'] for c in fetch_all_rows(lambda: (
        _admin().table('org_classes').select('id')
        .eq('organization_id', org_id).neq('status', 'archived')
    ))]
    if not class_ids:
        return 0
    rows = fetch_all_rows(lambda: (
        _admin().table('class_enrollments').select('id, student_id')
        .in_('class_id', class_ids).eq('status', 'active')
    ))
    return len({r['student_id'] for r in rows if r.get('student_id')})


def enrollment_report(org_id: str) -> Dict[str, Any]:
    enrollments = fetch_all_rows(lambda: (
        _admin().table('school_enrollments').select('id, status')
        .eq('organization_id', org_id)
    ))
    active_classes = (
        _admin().table('org_classes').select('id', count='exact')
        .eq('organization_id', org_id).neq('status', 'archived').execute()
    ).count or 0
    report = aggregate_enrollment(enrollments)
    report['active_classes'] = active_classes
    # `total` stays what it always was (every school_enrollments row, whatever
    # its status) so nothing reading this response changes meaning underneath
    # it. The two new keys are what the card actually shows.
    report['students_in_classes'] = students_in_classes(org_id)
    report['school_records'] = report['total']
    return report


def revenue_report(org_id: str) -> Dict[str, Any]:
    invoices = fetch_all_rows(lambda: (
        _admin().table('sis_invoices')
        .select('status, total_cents, amount_paid_cents')
        .eq('organization_id', org_id)
    ))
    return aggregate_revenue(invoices)


#: How a payment was taken. Free text on the row, so the report reports what is
#: there rather than a list that would go stale the first time the office
#: invents one.
PAYMENT_METHOD_LABELS = {
    'card': 'Card',
    'cash': 'Cash',
    'check': 'Check',
    'ach': 'Bank transfer',
    'scholarship': 'Scholarship',
    'other': 'Other',
}


def _method_label(method: Optional[str]) -> str:
    if not method:
        return 'Not recorded'
    return PAYMENT_METHOD_LABELS.get(method, str(method).replace('_', ' ').capitalize())


def payments_report(org_id: str) -> Dict[str, Any]:
    """Every payment the office has recorded, and what it was taken by.

    iCreate, 2026-08-20: "Is there a way to do a report on method of payment?"
    The method is on every payment row already; nothing read it back out except
    one invoice at a time, so answering "how much came in by check this term"
    meant opening invoices one by one.

    Paged rather than capped: payments only accumulate, so a term's worth is
    exactly the read PostgREST would silently truncate.
    """
    payments = fetch_all_rows(lambda: (
        _admin().table('sis_payment_records')
        .select('id, invoice_id, amount_cents, method, external_ref, note, recorded_at, recorded_by')
        .eq('organization_id', org_id)
    ))
    if not payments:
        return {'rows': [], 'totals': [], 'total_cents': 0}

    invoice_ids = list({p['invoice_id'] for p in payments if p.get('invoice_id')})
    invoices = {}
    if invoice_ids:
        invoices = {i['id']: i for i in fetch_all_rows(lambda: (
            _admin().table('sis_invoices')
            .select('id, invoice_number, household_id, student_user_id, due_date')
            .in_('id', invoice_ids)))}

    hh_ids = list({i.get('household_id') for i in invoices.values() if i.get('household_id')})
    households = {}
    if hh_ids:
        households = {h['id']: h.get('name') for h in fetch_all_rows(lambda: (
            _admin().table('households').select('id, name').in_('id', hh_ids)))}

    people_ids = list({i.get('student_user_id') for i in invoices.values() if i.get('student_user_id')}
                      | {p.get('recorded_by') for p in payments if p.get('recorded_by')})
    people = {}
    if people_ids:
        people = {u['id']: u for u in fetch_all_rows(lambda: (
            _admin().table('users')
            .select('id, first_name, last_name, display_name, email').in_('id', people_ids)))}

    rows = []
    for p in payments:
        inv = invoices.get(p.get('invoice_id')) or {}
        student = people.get(inv.get('student_user_id'))
        taker = people.get(p.get('recorded_by'))
        rows.append({
            'recorded_at': str(p.get('recorded_at') or '')[:10],
            'family': households.get(inv.get('household_id')) or '',
            'student': _person_name(student) if student else '',
            'invoice': inv.get('invoice_number') or '',
            'method': _method_label(p.get('method')),
            'amount': _cents(p.get('amount_cents')),
            'amount_cents': p.get('amount_cents') or 0,
            'reference': p.get('external_ref') or '',
            'note': p.get('note') or '',
            'recorded_by': _person_name(taker) if taker else '',
        })
    rows.sort(key=lambda r: r['recorded_at'], reverse=True)

    # What the report is actually for: the split by method.
    by_method: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        bucket = by_method.setdefault(r['method'], {'method': r['method'], 'count': 0, 'cents': 0})
        bucket['count'] += 1
        bucket['cents'] += r['amount_cents']
    totals = sorted(by_method.values(), key=lambda t: t['cents'], reverse=True)
    for t in totals:
        t['amount'] = _cents(t['cents'])

    return {'rows': rows, 'totals': totals,
            'total_cents': sum(r['amount_cents'] for r in rows)}


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
DOW_LONG = {0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday',
            5: 'Friday', 6: 'Saturday'}


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

# What a class costs a family and what the school budgets against it. The class
# report is ADMIN_ROLES, which includes campus coordinators — the role whose
# whole definition is the money subtraction — and these three columns are the
# money, two of them on by default. Redacted per-field rather than by withholding
# the report, the same way an employment profile hides the pay rate and keeps the
# emergency contact (see sis_staff_service.PAY_FIELDS).
CLASS_REPORT_MONEY_KEYS = ('tuition', 'supply_fee', 'materials_allowance', 'billing')


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


def class_report(org_id: str, include_archived: bool = False,
                 sees_money: bool = True) -> Dict[str, Any]:
    """Every class in the org with every reportable field filled in.

    `sees_money=False` (a campus coordinator) drops the price columns from the
    field list AND from the rows — the picker must not offer a column the data
    will not contain, and the CSV builds straight off these rows.
    """
    from services import sis_catalog_service
    classes = sis_catalog_service.list_classes(org_id, include_archived=include_archived,
                                               audience='staff')
    class_ids = [c['id'] for c in classes]
    rows = build_class_rows(classes, _curriculum_by_class(class_ids),
                            _materials_by_class(class_ids))
    fields = CLASS_REPORT_FIELDS
    if not sees_money:
        fields = [f for f in CLASS_REPORT_FIELDS if f['key'] not in CLASS_REPORT_MONEY_KEYS]
        rows = [{k: v for k, v in r.items() if k not in CLASS_REPORT_MONEY_KEYS} for r in rows]
    return {'fields': fields, 'rows': rows}


# ── Roster report (many classes, one spreadsheet) ────────────────────────────
# iCreate asked for this four separate times (Perch ff701e99, 0334366b,
# 90b91553, 00877fea) — the most-requested thing in their backlog. Printing and
# exporting ONE class shipped on 2026-08-18; this is the other half of the ask:
#
#   "It'd be nice to be able to download multiple class rosters/waitlists into
#    one spreadsheet too."  — 00877fea
#   "select a class (or classes) and select which roster info ... into a
#    spreadsheet"           — 0334366b
#
# The field list ships WITH the data, the same way CLASS_REPORT_FIELDS does, so
# the picker and the CSV cannot drift apart.

# key, label, hint, default
ROSTER_REPORT_FIELDS: List[Dict[str, Any]] = [
    {'key': 'class_name', 'label': 'Class', 'hint': 'Which class this row is in', 'default': True},
    {'key': 'status', 'label': 'Status', 'hint': 'Enrolled, or waiting/offered', 'default': True},
    {'key': 'name', 'label': 'Student', 'hint': 'Full name', 'default': True},
    {'key': 'preferred_name', 'label': 'Goes by', 'hint': 'Preferred name, if any', 'default': False},
    {'key': 'first_name', 'label': 'First name', 'hint': 'On its own, for mail merges', 'default': False},
    {'key': 'last_name', 'label': 'Last name', 'hint': 'On its own, for sorting', 'default': False},
    {'key': 'age', 'label': 'Age', 'hint': 'Years, as of today', 'default': True},
    # Collected (and required) at iCreate registration, and already in the
    # People export — it was simply never offered here. iCreate, 2026-08-19:
    # "we also need a gender, because I'm not really sure if some of these are
    # boys or girls".
    {'key': 'gender', 'label': 'Gender', 'hint': 'As given at registration', 'default': False},
    {'key': 'date_of_birth', 'label': 'Birthdate', 'hint': 'YYYY-MM-DD', 'default': False},
    {'key': 'student_email', 'label': 'Student email', 'hint': "The student's own login", 'default': False},
    {'key': 'household_name', 'label': 'Family', 'hint': 'Household name', 'default': False},
    {'key': 'guardians', 'label': 'Guardians', 'hint': 'Parent/guardian names', 'default': True},
    {'key': 'guardian_emails', 'label': 'Guardian emails', 'hint': 'For contacting the family', 'default': True},
    {'key': 'household_phone', 'label': 'Family phone', 'hint': 'Household phone number', 'default': True},
    {'key': 'allergies', 'label': 'Allergies', 'hint': 'Health flag', 'default': False},
    {'key': 'medications', 'label': 'Medical', 'hint': 'Health flag', 'default': False},
    {'key': 'teacher', 'label': 'Teacher', 'hint': "The class's primary instructor", 'default': False},
    {'key': 'enrolled_at', 'label': 'Enrolled', 'hint': 'When they took the seat', 'default': False},
]

ROSTER_REPORT_KEYS = [f['key'] for f in ROSTER_REPORT_FIELDS]
ROSTER_REPORT_DEFAULTS = [f['key'] for f in ROSTER_REPORT_FIELDS if f['default']]

#: Fields carrying health information. Selecting one is what makes the export an
#: access worth logging, and it is logged per student, exactly as opening the
#: teacher roster screen is.
ROSTER_HEALTH_FIELDS = {'allergies', 'medications'}


def roster_report(org_id: str, class_ids: List[str], accessor_id: str,
                  accessor_role: str, include_waitlist: bool = False,
                  fields: Optional[List[str]] = None) -> Dict[str, Any]:
    """One row per student per class, across as many classes as were asked for.

    Batched deliberately: calling the single-class roster N times would be five
    queries per class, so a twenty-class export would be a hundred round trips.
    Every read here is `in_(class_ids)` and paged — a multi-class export is
    exactly where PostgREST's silent 1000-row cap bites, and a roster that
    quietly loses its tail is worse than one that fails.
    """
    from services import sis_catalog_service
    from utils.access_logger import _constrained_role
    from utils.blank_values import clean as _clean_blank

    keys = [k for k in ROSTER_REPORT_KEYS if k in (fields or [])] or ROSTER_REPORT_DEFAULTS
    # A sheet that mixes enrolled and waiting students without saying which is
    # which is worse than one that leaves the waiting students out (iCreate,
    # 2026-08-20: "I can select include waitlist but I have no way of telling
    # which kids are the waitlisted ones"). Status is a default column, but it
    # can be unticked — and that choice is remembered per browser, so it can be
    # unticked once and wrong forever after. With the waitlist in, it is not a
    # choice.
    if include_waitlist and 'status' not in keys:
        keys = [k for k in ROSTER_REPORT_KEYS if k == 'status' or k in keys]

    classes = [c for c in sis_catalog_service.list_classes(
        org_id, include_archived=True, audience='staff') if c['id'] in set(class_ids or [])]
    if not classes:
        return {'fields': ROSTER_REPORT_FIELDS, 'selected': keys, 'rows': []}
    cls_by_id = {c['id']: c for c in classes}
    ids = list(cls_by_id)

    enrollments = fetch_all_rows(lambda: (
        _admin().table('class_enrollments').select('id, class_id, student_id, enrolled_at')
        .in_('class_id', ids).eq('status', 'active')))

    waitlist = []
    if include_waitlist:
        # 'waiting' and 'offered' only: promoted entries are already enrolled
        # rows above, and expired ones are nobody the office is holding a seat
        # for. Listing either would double-count or pad the sheet.
        waitlist = [dict(r, student_id=r['student_user_id']) for r in fetch_all_rows(lambda: (
            _admin().table('sis_waitlist_entries')
            .select('id, class_id, student_user_id, status, position, created_at')
            .in_('class_id', ids).in_('status', ['waiting', 'offered'])))]

    student_ids = list({r['student_id'] for r in (enrollments + waitlist) if r.get('student_id')})
    if not student_ids:
        return {'fields': ROSTER_REPORT_FIELDS, 'selected': keys, 'rows': []}

    users = {u['id']: u for u in fetch_all_rows(lambda: (
        _admin().table('users')
        .select('id, first_name, last_name, display_name, preferred_name, email, '
                'date_of_birth, gender, allergies, medications')
        .in_('id', student_ids)))}

    households, guardians_by_hh, hh_by_student = _household_context(student_ids)

    today = _org_today(org_id)
    rows = []
    for source, status_label, when_key in (
            (enrollments, 'Enrolled', 'enrolled_at'),
            (waitlist, None, 'created_at')):
        for r in source:
            u = users.get(r['student_id']) or {}
            hh_id = hh_by_student.get(r['student_id'])
            hh = households.get(hh_id) or {}
            gs = guardians_by_hh.get(hh_id, [])
            cls = cls_by_id.get(r['class_id']) or {}
            rows.append({
                'class_name': cls.get('name') or '',
                'status': status_label or (r.get('status') or '').capitalize(),
                'name': _person_name(u),
                'preferred_name': u.get('preferred_name') or '',
                'first_name': u.get('first_name') or '',
                'last_name': u.get('last_name') or '',
                'age': _age_years(u.get('date_of_birth'), today),
                'date_of_birth': (u.get('date_of_birth') or '')[:10],
                'gender': u.get('gender') or '',
                'student_email': u.get('email') or '',
                'household_name': hh.get('name') or '',
                'guardians': '; '.join(g['name'] for g in gs if g.get('name')),
                'guardian_emails': '; '.join(g['email'] for g in gs if g.get('email')),
                'household_phone': hh.get('phone') or '',
                # Same blank-value cleaning the teacher roster uses: "None",
                # "N/A" and "-" are how families say there is nothing to report.
                'allergies': _clean_blank(u.get('allergies')) or '',
                'medications': _clean_blank(u.get('medications')) or '',
                'teacher': ((cls.get('primary_instructor') or {}).get('name')) or '',
                'enrolled_at': str(r.get(when_key) or '')[:10],
            })

    rows.sort(key=lambda r: (r['class_name'].lower(), r['status'] != 'Enrolled',
                             (r['last_name'] or r['name']).lower(), r['name'].lower()))

    if ROSTER_HEALTH_FIELDS & set(keys):
        _log_roster_access(rows and student_ids or [], accessor_id,
                           _constrained_role(accessor_role), len(ids))

    return {'fields': ROSTER_REPORT_FIELDS, 'selected': keys, 'rows': rows}


def _household_context(student_ids: List[str]):
    """(households by id, guardians by household id, household id by student)."""
    admin = _admin()
    hm = fetch_all_rows(lambda: (
        admin.table('household_members').select('id, household_id, user_id')
        .in_('user_id', student_ids).eq('relationship', 'student')))
    hh_by_student = {m['user_id']: m['household_id'] for m in hm}
    hh_ids = list(set(hh_by_student.values()))
    if not hh_ids:
        return {}, {}, hh_by_student

    households = {h['id']: h for h in fetch_all_rows(lambda: (
        admin.table('households').select('id, name, phone').in_('id', hh_ids)))}
    g_rows = fetch_all_rows(lambda: (
        admin.table('household_members').select('id, household_id, user_id')
        .in_('household_id', hh_ids).eq('relationship', 'guardian')))
    g_ids = [g['user_id'] for g in g_rows]
    g_users = {u['id']: u for u in fetch_all_rows(lambda: (
        admin.table('users').select('id, first_name, last_name, display_name, email')
        .in_('id', g_ids)))} if g_ids else {}
    guardians_by_hh: Dict[str, List[Dict[str, Any]]] = {}
    for g in g_rows:
        gu = g_users.get(g['user_id']) or {}
        guardians_by_hh.setdefault(g['household_id'], []).append(
            {'name': _person_name(gu), 'email': gu.get('email')})
    return households, guardians_by_hh, hh_by_student


def _log_roster_access(student_ids, accessor_id, accessor_role, class_count):
    """One row per student, matching what opening the teacher roster writes.

    An admin pulling allergy data for twelve classes is the same access as a
    teacher opening twelve rosters, and is audited as such.
    """
    if not student_ids:
        return
    try:
        _admin().table('student_access_logs').insert([{
            'student_id': sid, 'accessor_id': accessor_id,
            'accessor_role': accessor_role,
            'data_accessed': 'class_roster_health',
            'purpose': f'Roster report export ({class_count} class(es))',
        } for sid in student_ids]).execute()
    except Exception as e:  # noqa: BLE001 — the audit must not break the report
        logger.warning(f'roster report access log failed: {e}')


def _person_name(u: Dict[str, Any]) -> str:
    name = ' '.join(x for x in [u.get('first_name'), u.get('last_name')] if x).strip()
    return name or (u.get('display_name') or '')


def _org_today(org_id: str):
    from services.sis_staff_service import _org_now
    return _org_now(org_id).date()


def _age_years(dob: Optional[str], today) -> str:
    if not dob:
        return ''
    try:
        from datetime import date
        b = date.fromisoformat(str(dob)[:10])
    except (TypeError, ValueError):
        return ''
    return str(today.year - b.year - ((today.month, today.day) < (b.month, b.day)))


# ── Student schedule report (master list: who comes when) ────────────────────
# iCreate (Molly), 2026-08-21: "I want to get a student report of a master list
# of all students showing which days/class blocks they come." One row per
# student, one column per school day, each cell naming the block(s) each of
# their classes fills. Blocks come from the org's configured time_blocks (the
# same list "Block N" means on the schedule import); a school without blocks —
# or a class meeting outside them — falls back to the raw times.

#: Monday-first, the way a school week reads (day_of_week: 0=Sun .. 6=Sat).
_SCHOOL_WEEK = [1, 2, 3, 4, 5, 6, 0]


def _minutes(t: Optional[str]) -> Optional[int]:
    hm = _hhmm(t)
    if not hm:
        return None
    try:
        h, m = (int(x) for x in hm.split(':'))
    except ValueError:
        return None
    return h * 60 + m


def _meeting_slot(meeting: Dict[str, Any], blocks: List[Dict[str, Any]],
                  with_times: bool = False) -> str:
    """Name WHEN a meeting happens, in the school's own vocabulary: the
    teaching block(s) it overlaps ('Block 2'; the block's label when it has
    one; 'Blocks 1-3' for a span), else the raw times.

    `with_times` appends the meeting's actual times to a block name —
    'Block 2 (10:30am-11:30am)'. The student-schedule master list wants that:
    a block name alone means nothing to anyone who hasn't memorized the
    school's block grid, so its cells always carry the time range. The
    day-rosters report keeps bare names — each class line there already
    prints its own times."""
    ms, me = _minutes(meeting.get('start_time')), _minutes(meeting.get('end_time'))
    if ms is None or me is None:
        return ''
    when = f"{_t12(meeting.get('start_time'))}-{_t12(meeting.get('end_time'))}"
    hits = []
    for n, b in enumerate(blocks or [], start=1):
        bs, be = _minutes(b.get('start')), _minutes(b.get('end'))
        if bs is None or be is None:
            continue
        if ms < be and me > bs:
            hits.append((n, b))
    if not hits:
        return when
    names = [(b.get('label') or '').strip() or f'Block {n}' for n, b in hits]
    numbers = [n for n, _ in hits]
    if len(names) == 1:
        label = names[0]
    elif (numbers == list(range(numbers[0], numbers[0] + len(numbers)))
            and all(not (b.get('label') or '').strip() for _, b in hits)):
        label = f'Blocks {numbers[0]}-{numbers[-1]}'
    else:
        label = ' + '.join(names)
    return f'{label} ({when})' if with_times else label


def student_schedule_report(org_id: str) -> Dict[str, Any]:
    """Master list: every student, their age, the days they come, and the
    block each of their classes fills on each day.

    Day columns are whichever days the org's active classes actually meet, so
    a Tue-Thu school gets a Tue-Thu sheet, Monday-first. Students with no
    scheduled class still get a row — a master list that dropped the kids who
    never come would hide exactly what it exists to show. Classes with no
    scheduled meeting land in a separate column rather than vanishing, so a
    row's days never under-report a student the office knows attends.
    """
    from services import sis_catalog_service, sis_service
    from services.sis_schedule_sync_service import teaching_blocks

    classes = sis_catalog_service.list_classes(org_id, audience='staff')
    blocks = teaching_blocks(
        sis_catalog_service.schedule_settings(org_id).get('time_blocks'))

    # class_id -> [(day, minutes-for-sorting, 'Block 2 (10:30am-11:30am): Pottery')], and apart
    # from those the classes with no scheduled meeting at all.
    slots_by_class: Dict[str, List] = {}
    unscheduled_by_class: Dict[str, str] = {}
    for c in classes:
        name = c.get('name') or ''
        entries = []
        for m in (c.get('meetings') or []):
            day = m.get('day_of_week')
            if day is None:
                continue
            slot = _meeting_slot(m, blocks, with_times=True)
            text = f'{slot}: {name}' if slot and name else (slot or name)
            entries.append((day, _minutes(m.get('start_time')) or 0, text))
        if entries:
            slots_by_class[c['id']] = entries
        else:
            unscheduled_by_class[c['id']] = name

    class_ids = list(slots_by_class) + list(unscheduled_by_class)
    enrollments = fetch_all_rows(lambda: (
        _admin().table('class_enrollments').select('class_id, student_id')
        .in_('class_id', class_ids).eq('status', 'active'))) if class_ids else []

    by_student: Dict[str, Dict[int, List]] = {}
    unscheduled_by_student: Dict[str, List[str]] = {}
    for e in enrollments:
        sid = e.get('student_id')
        if not sid:
            continue
        for day, at, text in slots_by_class.get(e['class_id'], ()):
            by_student.setdefault(sid, {}).setdefault(day, []).append((at, text))
        if e['class_id'] in unscheduled_by_class:
            unscheduled_by_student.setdefault(sid, []).append(
                unscheduled_by_class[e['class_id']])

    days_present = sorted(
        {d for entries in slots_by_class.values() for d, _, _ in entries},
        key=lambda d: _SCHOOL_WEEK.index(d) if d in _SCHOOL_WEEK else d)

    # iCreate (Molly), 2026-08-22: the office wants ages on this list too —
    # who comes when reads differently for a 5-year-old than a 15-year-old.
    # Counted against the school's own today, like the roster report, so a
    # birthday turns over on the school's date rather than UTC's.
    today = _org_today(org_id)

    rows = []
    for s in sis_service.get_roster(org_id):
        if not s.get('is_student'):
            continue
        sched = by_student.get(s['student_id'], {})
        rows.append({
            'student': s['name'],
            'age': _age_years(s.get('date_of_birth'), today),
            'family': s.get('household_name') or '',
            'days': ' '.join(DOW_SHORT[d] for d in days_present if sched.get(d)),
            'by_day': {str(d): '; '.join(t for _, t in sorted(sched.get(d, [])))
                       for d in days_present},
            'unscheduled': '; '.join(sorted(
                unscheduled_by_student.get(s['student_id'], []), key=str.lower)),
        })
    rows.sort(key=lambda r: (r['student'] or '').lower())
    return {
        'days': [{'key': str(d), 'label': DOW_SHORT.get(d, '')} for d in days_present],
        'has_unscheduled': any(r['unscheduled'] for r in rows),
        'rows': rows,
    }


# ── Day rosters (where every child should be, hour by hour) ──────────────────
# iCreate (Molly), 2026-08-22: "I need to be able to print a report that shows
# every student coming on Mondays and every student coming on Tuesdays,
# Wednesdays and Thursdays. It needs to be able to have each day print
# separately ... so that any staff member could look at it for that particular
# hour and easily know where any given child should be directed to go to class.
# If it could also list what classroom the class is [in]".
#
# The student schedule report above answers "when does this child come?" — one
# row per student. This is the same data pivoted the other way, for the person
# standing in a corridor at 10:30 holding a child: day, then block, then class,
# then who should be in it and which room. Printing is per day because that is
# how it gets used — one sheet per day on a clipboard, not a seven-day booklet.

def day_rosters_report(org_id: str, day: Optional[int] = None) -> Dict[str, Any]:
    """Every teaching day, its blocks, and the roster of each class in them.

    `day` (0=Sun..6=Sat) narrows to one day; None returns them all, which is
    what the print-each-day-separately view wants in a single fetch.
    """
    from services import sis_catalog_service, sis_service
    from services.sis_schedule_sync_service import teaching_blocks

    classes = sis_catalog_service.list_classes(org_id, audience='staff')
    classes = [c for c in classes if c.get('status') != 'archived']
    blocks = teaching_blocks(
        sis_catalog_service.schedule_settings(org_id).get('time_blocks'))

    # (day, sort-minutes, slot label) -> the classes meeting in it.
    slots: Dict[tuple, List[Dict[str, Any]]] = {}
    for c in classes:
        for m in (c.get('meetings') or []):
            d = m.get('day_of_week')
            if d is None or (day is not None and d != day):
                continue
            key = (d, _minutes(m.get('start_time')) or 0, _meeting_slot(m, blocks))
            slots.setdefault(key, []).append({
                'class_id': c['id'],
                'name': c.get('name') or '',
                # The meeting's own room wins: a class can sit in a different
                # room on a different day, and this report is read in a corridor.
                'room': (m.get('location') or c.get('location') or ''),
                'teacher': _person(c.get('primary_instructor')),
                'time': f"{_t12(m.get('start_time'))}-{_t12(m.get('end_time'))}",
            })

    class_ids = list({e['class_id'] for entries in slots.values() for e in entries})
    enrollments = fetch_all_rows(lambda: (
        _admin().table('class_enrollments').select('class_id, student_id')
        .in_('class_id', class_ids).eq('status', 'active'))) if class_ids else []

    roster = {s['student_id']: s for s in sis_service.get_roster(org_id)}
    students_by_class: Dict[str, List[Dict[str, str]]] = {}
    for e in enrollments:
        s = roster.get(e.get('student_id'))
        if not s or not s.get('is_student'):
            continue
        students_by_class.setdefault(e['class_id'], []).append({
            'name': s['name'],
            'family': s.get('household_name') or '',
        })
    for entries in students_by_class.values():
        entries.sort(key=lambda r: (r['name'] or '').lower())

    days = []
    present = sorted({d for d, _, _ in slots},
                     key=lambda d: _SCHOOL_WEEK.index(d) if d in _SCHOOL_WEEK else d)
    for d in present:
        day_slots = []
        for (sd, at, label) in sorted((k for k in slots if k[0] == d), key=lambda k: (k[1], k[2])):
            entries = sorted(slots[(sd, at, label)], key=lambda c: (c['name'] or '').lower())
            for c in entries:
                c['students'] = students_by_class.get(c['class_id'], [])
                c['student_count'] = len(c['students'])
            day_slots.append({'slot': label, 'classes': entries})
        days.append({
            'key': str(d),
            'label': DOW_LONG.get(d, ''),
            'slots': day_slots,
            'student_count': len({st['name'] for sl in day_slots
                                  for c in sl['classes'] for st in c['students']}),
        })
    return {'days': days}


def day_rosters_csv_rows(report: Dict[str, Any]) -> List[List[str]]:
    """Flatten to one row per student per class — the shape a spreadsheet sorts."""
    rows = []
    for d in report.get('days') or []:
        for sl in d.get('slots') or []:
            for c in sl.get('classes') or []:
                if not c['students']:
                    rows.append([d['label'], sl['slot'], c['time'], c['name'],
                                 c['room'], c['teacher'], '', ''])
                for st in c['students']:
                    rows.append([d['label'], sl['slot'], c['time'], c['name'],
                                 c['room'], c['teacher'], st['name'], st['family']])
    return rows


DAY_ROSTERS_CSV_HEADER = ['Day', 'Block', 'Time', 'Class', 'Room', 'Teacher',
                          'Student', 'Family']


# ── Block rosters (one sheet per block, classes side by side) ────────────────
# iCreate (Marika), 2026-08-24: "I am struggling to find reports that will work
# exactly how I want them to work ... I have put together two spreadsheets that
# I adapted from either the class rosters page or the day rosters plus looking
# back and forth at room assignments ... something like the attached would be
# great for Tuesdays and Thursdays Blocks 1-5."
#
# Her spreadsheets are the day roster pivoted a third way: ONE block, every
# class running in it laid out across the page, each column headed by the class
# and its room with the students and their ages beneath. She was hand-building
# them because two things the day roster does made her cross-reference by hand:
#
#   1. It has no ages. Half of what the front office does with a block sheet is
#      tell a 5-year-old from a 15-year-old at a glance.
#   2. A class spanning several blocks gets its OWN slot there ('Blocks 1-3'),
#      so Kinder Nature School (9:30-12:30) is absent from the Block 1 list even
#      though those children are in the building at 9:30. Here a class appears
#      under EVERY block it overlaps — the question this sheet answers is "who
#      is where right now", and right now they are in it.

def block_rosters_report(org_id: str, day: Optional[int] = None) -> Dict[str, Any]:
    """Every teaching day, its blocks, and each block's classes side by side.

    `day` (0=Sun..6=Sat) narrows to one day; None returns them all.

    Returns {'days': [{key, label, blocks: [{key, label, time, student_count,
    classes: [{class_id, name, room, teacher, time, students: [{name, age}]}]}]}]}
    """
    from services import sis_catalog_service, sis_service
    from services.sis_schedule_sync_service import teaching_blocks

    classes = sis_catalog_service.list_classes(org_id, audience='staff')
    classes = [c for c in classes if c.get('status') != 'archived']
    blocks = teaching_blocks(
        sis_catalog_service.schedule_settings(org_id).get('time_blocks'))
    numbered = []
    for n, b in enumerate(blocks, start=1):
        bs, be = _minutes(b.get('start')), _minutes(b.get('end'))
        if bs is None or be is None:
            continue
        numbered.append({
            'key': f'block-{n}',
            'label': (b.get('label') or '').strip() or f'Block {n}',
            'time': f"{_t12(b.get('start'))}-{_t12(b.get('end'))}",
            'start': bs,
            'end': be,
        })

    # (day, block key) -> the classes in it, plus the blocks each day actually
    # has. A meeting that overlaps no configured block still has to land
    # somewhere, so its own times become a block of one — dropping it would
    # hide children from the sheet that exists to find them.
    by_day_block: Dict[tuple, List[Dict[str, Any]]] = {}
    day_blocks: Dict[int, Dict[str, Dict[str, Any]]] = {}
    for c in classes:
        for m in (c.get('meetings') or []):
            d = m.get('day_of_week')
            if d is None or (day is not None and d != day):
                continue
            ms, me = _minutes(m.get('start_time')), _minutes(m.get('end_time'))
            if ms is None or me is None:
                continue
            hits = [b for b in numbered if ms < b['end'] and me > b['start']]
            if not hits:
                time = f"{_t12(m.get('start_time'))}-{_t12(m.get('end_time'))}"
                hits = [{'key': f'time-{ms}-{me}', 'label': time, 'time': time,
                         'start': ms, 'end': me}]
            entry = {
                'class_id': c['id'],
                'name': c.get('name') or '',
                # The meeting's own room wins over the class's, same as the day
                # roster: a class can sit elsewhere on a different day.
                'room': (m.get('location') or c.get('location') or ''),
                'teacher': _person(c.get('primary_instructor')),
                'time': f"{_t12(m.get('start_time'))}-{_t12(m.get('end_time'))}",
            }
            for b in hits:
                day_blocks.setdefault(d, {}).setdefault(b['key'], b)
                by_day_block.setdefault((d, b['key']), []).append(entry)

    class_ids = list({e['class_id'] for entries in by_day_block.values() for e in entries})
    enrollments = fetch_all_rows(lambda: (
        _admin().table('class_enrollments').select('class_id, student_id')
        .in_('class_id', class_ids).eq('status', 'active'))) if class_ids else []

    today = _org_today(org_id)
    roster = {s['student_id']: s for s in sis_service.get_roster(org_id)}
    students_by_class: Dict[str, List[Dict[str, str]]] = {}
    for e in enrollments:
        s = roster.get(e.get('student_id'))
        if not s or not s.get('is_student'):
            continue
        students_by_class.setdefault(e['class_id'], []).append({
            'name': s['name'],
            'age': _age_years(s.get('date_of_birth'), today),
        })
    for entries in students_by_class.values():
        entries.sort(key=lambda r: (r['name'] or '').lower())

    days = []
    present = sorted(day_blocks, key=lambda d: _SCHOOL_WEEK.index(d) if d in _SCHOOL_WEEK else d)
    for d in present:
        out_blocks = []
        for b in sorted(day_blocks[d].values(), key=lambda b: (b['start'], b['end'])):
            # A copy per block: the same class entry is shared by every block it
            # spans, so its roster cannot be attached in place.
            entries = [dict(c, students=students_by_class.get(c['class_id'], []),
                            student_count=len(students_by_class.get(c['class_id'], [])))
                       for c in sorted(by_day_block.get((d, b['key']), []),
                                       key=lambda c: (c['name'] or '').lower())]
            out_blocks.append({
                'key': b['key'],
                'label': b['label'],
                'time': b['time'],
                'classes': entries,
                'student_count': len({st['name'] for c in entries for st in c['students']}),
            })
        days.append({'key': str(d), 'label': DOW_LONG.get(d, ''), 'blocks': out_blocks})
    return {'days': days}


#: Classes per band in the grid CSV. Three fits a landscape page, which is what
#: the sheets Marika built by hand used.
BLOCK_GRID_COLUMNS = 3


def block_rosters_csv_rows(report: Dict[str, Any],
                           per_band: int = BLOCK_GRID_COLUMNS) -> List[List[str]]:
    """Flatten to the grid the office prints: classes across, students down.

    Per block, bands of `per_band` classes, each class occupying three columns
    (student, age, spacer) so the sheet can be widened or highlighted in Excel
    without the columns colliding:

        Tuesday - Block 1 (9:30am-10:30am)
        Art Expeditions 5-8,,,Beginning Guitar,,,Building America,,
        Art Studio,,,Music Conservatory,,,Foundation Room,,
        Student,Age,,Student,Age,,Student,Age,
        Adaline Bellon,7,,Eliza Barker,12,,Ellie Culliford,12,
    """
    def band_row(pairs) -> List[str]:
        out: List[str] = []
        for left, right in pairs:
            out.extend([left, right, ''])
        return out

    rows: List[List[str]] = []
    for d in report.get('days') or []:
        for b in d.get('blocks') or []:
            rows.append([f"{d['label']} - {b['label']} ({b['time']})"])
            classes = b.get('classes') or []
            if not classes:
                rows.append(['No classes scheduled.'])
                rows.append([])
                continue
            for i in range(0, len(classes), per_band):
                band = classes[i:i + per_band]
                rows.append(band_row([(c['name'], '') for c in band]))
                rows.append(band_row([(c['room'] or 'No room set', '') for c in band]))
                rows.append(band_row([('Student', 'Age') for _ in band]))
                for n in range(max(len(c['students']) for c in band)):
                    rows.append(band_row([
                        (c['students'][n]['name'], c['students'][n]['age'])
                        if n < len(c['students']) else ('', '')
                        for c in band]))
                rows.append([])
    return rows
