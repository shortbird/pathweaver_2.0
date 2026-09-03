"""
SIS staff portal service — the teacher-facing side of the SIS plus the admin
staff-operations layer (iCreate teacher portal, 2026-07).

Covers: staff employment profiles (sis_staff_profiles), non-class duties
(sis_staff_assignments), the teacher dashboard/schedule, teacher class rosters
with health/safety alerts (access-logged), the staff directory, and the hourly
time clock + timesheets + payroll CSV rows. Payroll here is an EXPORT — the
platform never calculates or issues pay.

Uses the admin client like the rest of the SIS (tables are RLS-locked to the
backend); route-level role checks + sis_service.class_scope do authorization.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from database import get_supabase_admin_client
from services import sis_service
from services import sis_notifications
# One definition of "a phone number", shared with the SMS verification flow, so
# a number typed on the staff profile is stored in the shape verification reads.
from services.phone_verification_service import normalize_phone
from utils import blank_values
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger
from utils.storage_urls import sign_in_place
from utils import person_name

logger = get_logger(__name__)

DEFAULT_TZ = 'America/Denver'

PROFILE_FIELDS = ('position', 'staff_type', 'pay_type', 'payroll_id',
                  'hourly_rate_cents', 'emergency_contact_name',
                  'emergency_contact_phone', 'work_schedule', 'start_date',
                  'end_date', 'is_active', 'uses_time_clock', 'phone_number')
# The subset a teacher may edit on their own profile.
SELF_PROFILE_FIELDS = ('emergency_contact_name', 'emergency_contact_phone',
                       'phone_number')

# What someone is paid. A campus coordinator runs the campus but is not trusted
# with the school's money (iCreate, 2026-08-01), and these three fields are the
# only money on an otherwise operational record — the same profile carries the
# emergency contact and work schedule, which coordinators do need. So the fields
# are redacted, not the endpoint withheld.
PAY_FIELDS = ('pay_type', 'payroll_id', 'hourly_rate_cents')

# The rest of somebody's employment terms. Not money, so these were visible to
# and editable by campus coordinators, which iCreate did not expect: "Idk if
# campus coordinators can see the staff like I do, but I don't think we want
# them to see all the employment info" (2026-08-25). Hire and end dates and
# whether somebody is an employee, a contractor or family are HR's business, not
# the front office's. Everything a coordinator actually needs to run the campus
# -- position, work schedule, emergency contact -- stays visible.
EMPLOYMENT_FIELDS = ('staff_type', 'start_date', 'end_date')

# Everything the front office does not see on a staff record.
RESTRICTED_FIELDS = PAY_FIELDS + EMPLOYMENT_FIELDS


def redact_pay(profile, redact=True, fields=RESTRICTED_FIELDS):
    """Strip the restricted fields from a staff profile (or list of them).

    Returns the input unchanged when `redact` is False, so callers can pass the
    caller's tier straight through: `redact_pay(profile, is_campus_coordinator(roles))`.
    """
    if not redact or not profile:
        return profile
    if isinstance(profile, list):
        return [redact_pay(p, True, fields) for p in profile]
    return {k: v for k, v in profile.items() if k not in fields}

STAFF_TYPES = ('employee', 'contractor', 'family')
PAY_TYPES = ('hourly', 'salaried', 'stipend', 'unpaid')
ASSIGNMENT_TYPES = ('duty', 'event', 'meeting', 'substitute', 'other')


def _admin():
    return get_supabase_admin_client()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _org_tz(org_id: str) -> ZoneInfo:
    row = (
        _admin().table('organizations').select('timezone')
        .eq('id', org_id).limit(1).execute()
    ).data
    tz = (row[0].get('timezone') if row else None) or DEFAULT_TZ
    try:
        return ZoneInfo(tz)
    except Exception:
        return ZoneInfo(DEFAULT_TZ)


def _org_now(org_id: str) -> datetime:
    return datetime.now(timezone.utc).astimezone(_org_tz(org_id))


def _full_name(u: Dict[str, Any]) -> str:
    """Delegates to utils.person_name.full_name — one rule for the whole SIS.
    Ten copies of this function with two different fallback orders is half of
    why names differed screen to screen (iCreate, 2026-08-25)."""
    return person_name.full_name(u, 'Unknown')


# ── Staff profiles ────────────────────────────────────────────────────────────

def get_staff_profile(org_id: str, user_id: str) -> Dict[str, Any]:
    rows = (
        _admin().table('sis_staff_profiles').select('*')
        .eq('organization_id', org_id).eq('user_id', user_id).limit(1).execute()
    ).data
    return rows[0] if rows else {'user_id': user_id, 'organization_id': org_id,
                                 'is_active': True, 'uses_time_clock': False}


def get_staff_profile_with_contact(org_id: str, user_id: str) -> Dict[str, Any]:
    """The profile plus the staff member's own phone, which lives on `users`.

    Separate from get_staff_profile on purpose: that one is on the clock-in path
    and runs for every punch, and the phone is only wanted by the profile screen.
    """
    profile = get_staff_profile(org_id, user_id)
    profile['phone_number'] = _user_phone(user_id)
    return profile


def _user_phone(user_id: str) -> Optional[str]:
    """The staff member's own number, which lives on `users`, not the staff
    profile — so Employment showed an emergency contact and no way to reach the
    teacher (iCreate, 2026-08-14)."""
    try:
        rows = (_admin().table('users').select('phone_number')
                .eq('id', user_id).limit(1).execute()).data or []
    except Exception:  # noqa: BLE001 — a missing number must not break the profile
        return None
    return rows[0].get('phone_number') if rows else None


def upsert_staff_profile(org_id: str, user_id: str, fields: Dict[str, Any],
                         allowed: tuple = PROFILE_FIELDS) -> Dict[str, Any]:
    # phone_number is the one editable field that lives on `users`, not on the
    # staff profile row. Handled here so Employment can save it in the same form
    # as everything else.
    #
    # Stored in E.164, the same shape the SMS verification writes on success
    # (phone_verification_service.verify_code). This path used to keep whatever
    # was typed, so one column held both "+15551234567" and "(555) 123-4567"
    # depending on which screen last wrote it -- and the verification screen
    # prefills from this column, so a raw string went straight back into a flow
    # that expects a real number. An unparseable number is refused rather than
    # stored: a number nobody can text is not worth recording, and the caller
    # gets told which field to fix.
    if 'phone_number' in fields and 'phone_number' in allowed:
        raw = fields['phone_number']
        raw = raw.strip() if isinstance(raw, str) else raw
        if not raw:
            phone = None
        else:
            phone = normalize_phone(raw)
            if not phone:
                return {'error': 'That phone number does not look right. '
                                 'Use a 10-digit US number, or +country code.'}
        try:
            _admin().table('users').update({'phone_number': phone}).eq('id', user_id).execute()
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Could not save phone number for staff {user_id[:8]}: {e}")

    payload: Dict[str, Any] = {}
    for k in allowed:
        if k not in fields or k == 'phone_number':  # already written to `users`
            continue
        v = fields[k]
        if isinstance(v, str):
            v = v.strip() or None
        payload[k] = v
    if payload.get('staff_type') not in (None,) + STAFF_TYPES:
        return {'error': 'Invalid staff_type'}
    if payload.get('pay_type') not in (None,) + PAY_TYPES:
        return {'error': 'Invalid pay_type'}
    rate = payload.get('hourly_rate_cents')
    if rate is not None and (not isinstance(rate, int) or rate < 0):
        return {'error': 'hourly_rate_cents must be a non-negative integer'}
    if not payload:
        return {'profile': get_staff_profile_with_contact(org_id, user_id)}
    payload.update({'user_id': user_id, 'organization_id': org_id,
                    'updated_at': datetime.now(timezone.utc).isoformat()})
    row = (_admin().table('sis_staff_profiles')
           .upsert(payload, on_conflict='user_id').execute()).data
    saved = row[0] if row else payload
    # Comes from `users`, so it isn't in the upsert's returning row.
    saved['phone_number'] = _user_phone(user_id)
    return {'profile': saved}


# ── Duties / non-class assignments ───────────────────────────────────────────

def list_assignments(org_id: str, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    q = _admin().table('sis_staff_assignments').select('*').eq('organization_id', org_id)
    if user_id:
        q = q.eq('user_id', user_id)
    return q.order('created_at').execute().data or []


def create_assignment(org_id: str, fields: Dict[str, Any], created_by: str) -> Dict[str, Any]:
    title = (fields.get('title') or '').strip()
    if not title:
        return {'error': 'Title is required'}
    target = fields.get('user_id')
    if not target:
        return {'error': 'user_id is required'}
    a_type = fields.get('assignment_type') or 'duty'
    if a_type not in ASSIGNMENT_TYPES:
        return {'error': 'Invalid assignment_type'}
    dow = fields.get('day_of_week')
    if dow is not None and not (isinstance(dow, int) and 0 <= dow <= 6):
        return {'error': 'day_of_week must be 0-6'}
    row = (_admin().table('sis_staff_assignments').insert({
        'organization_id': org_id, 'user_id': target, 'title': title,
        'assignment_type': a_type, 'day_of_week': dow,
        'specific_date': fields.get('specific_date') or None,
        'start_time': fields.get('start_time') or None,
        'end_time': fields.get('end_time') or None,
        'location': (fields.get('location') or '').strip() or None,
        'notes': (fields.get('notes') or '').strip() or None,
        'created_by': created_by,
    }).execute()).data
    # '/' is not a destination: it dropped the reader on whichever dashboard
    # they happened to render and told them nothing (iCreate, 2026-08-26: "when
    # I click on a notification, it doesn't open anythign"). Assignments live on
    # the staff member's own task list.
    sis_notifications.notify(
        target, 'New assignment',
        f'You have a new {a_type}: {title}',
        link='/my-tasks', organization_id=org_id)
    return {'assignment': row[0] if row else None}


def delete_assignment(org_id: str, assignment_id: str) -> bool:
    rows = (_admin().table('sis_staff_assignments').select('id, organization_id')
            .eq('id', assignment_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return False
    _admin().table('sis_staff_assignments').delete().eq('id', assignment_id).execute()
    return True


# ── Teacher classes & schedule ───────────────────────────────────────────────

def _classes_by_ids(org_id: str, class_ids: List[str]) -> List[Dict[str, Any]]:
    if not class_ids:
        return []
    return (
        _admin().table('org_classes')
        .select('id, name, description, location, capacity, status, image_url, '
                'min_age, max_age, primary_instructor_id, assistant_instructor_ids')
        .eq('organization_id', org_id).in_('id', class_ids)
        .neq('status', 'archived').execute()
    ).data or []


def _meetings_for_classes(org_id: str, class_ids: List[str]) -> List[Dict[str, Any]]:
    if not class_ids:
        return []
    return fetch_all_rows(lambda: (
        _admin().table('class_meetings').select('*')
        .eq('organization_id', org_id).in_('class_id', class_ids)
    ))


def _enrolled_counts(class_ids: List[str]) -> Dict[str, int]:
    """Active enrollment count per class. Paged — tallying a silently-truncated
    read is what made the SIS class list under-report enrollment."""
    if not class_ids:
        return {}
    rows = fetch_all_rows(lambda: (
        _admin().table('class_enrollments').select('id, class_id')
        .in_('class_id', class_ids).eq('status', 'active')
    ))
    counts: Dict[str, int] = {}
    for r in rows:
        counts[r['class_id']] = counts.get(r['class_id'], 0) + 1
    return counts


def teacher_classes(user_id: str, org_id: str) -> List[Dict[str, Any]]:
    """The advisor's classes with meeting times and enrollment counts."""
    ids = sis_service.advisor_class_ids(user_id, org_id)
    classes = _classes_by_ids(org_id, ids)
    meetings = _meetings_for_classes(org_id, [c['id'] for c in classes])
    counts = _enrolled_counts([c['id'] for c in classes])
    by_class: Dict[str, List] = {}
    for m in meetings:
        by_class.setdefault(m['class_id'], []).append(m)
    out = []
    for c in classes:
        out.append({**c,
                    'meetings': sorted(by_class.get(c['id'], []),
                                       key=lambda m: (m.get('day_of_week') is None,
                                                      m.get('day_of_week') or 0,
                                                      m.get('start_time') or '')),
                    # Assistants see the class in their portal, but shouldn't
                    # mistake it for one they lead.
                    'my_role': ('assistant'
                                if c.get('primary_instructor_id') != user_id
                                and user_id in (c.get('assistant_instructor_ids') or [])
                                else 'teacher'),
                    'enrolled_count': counts.get(c['id'], 0)})
    out.sort(key=lambda c: (c.get('name') or '').lower())
    return out


def teacher_schedule(user_id: str, org_id: str) -> Dict[str, Any]:
    """Weekly view: recurring class meetings + duties, plus upcoming one-offs."""
    ids = sis_service.advisor_class_ids(user_id, org_id)
    classes = {c['id']: c for c in _classes_by_ids(org_id, ids)}
    meetings = []
    for m in _meetings_for_classes(org_id, list(classes.keys())):
        cls = classes.get(m['class_id']) or {}
        meetings.append({
            **m,
            'class_name': cls.get('name'),
            # Most orgs set the room on the class, not each meeting.
            'location': m.get('location') or cls.get('location'),
            'min_age': cls.get('min_age'),
            'max_age': cls.get('max_age'),
        })
    duties = list_assignments(org_id, user_id)
    return {'meetings': meetings, 'assignments': duties}


def _today_items(user_id: str, org_id: str) -> List[Dict[str, Any]]:
    """Today's classes + duties for the dashboard, sorted by start time."""
    now = _org_now(org_id)
    dow = (now.weekday() + 1) % 7  # class_meetings convention: 0=Sun..6=Sat
    today = now.date().isoformat()
    ids = sis_service.advisor_class_ids(user_id, org_id)
    classes = {c['id']: c for c in _classes_by_ids(org_id, ids)}
    items = []
    for m in _meetings_for_classes(org_id, list(classes.keys())):
        if m.get('specific_date') == today or (
                m.get('specific_date') is None and m.get('day_of_week') == dow):
            cls = classes.get(m['class_id']) or {}
            items.append({'kind': 'class', 'class_id': m['class_id'],
                          'title': cls.get('name'),
                          'start_time': m.get('start_time'), 'end_time': m.get('end_time'),
                          'location': m.get('location') or cls.get('location')})
    for a in list_assignments(org_id, user_id):
        if a.get('specific_date') == today or (
                a.get('specific_date') is None and a.get('day_of_week') == dow):
            items.append({'kind': a.get('assignment_type') or 'duty',
                          'title': a.get('title'),
                          'start_time': a.get('start_time'), 'end_time': a.get('end_time'),
                          'location': a.get('location')})
    items.sort(key=lambda i: (i.get('start_time') is None, i.get('start_time') or ''))
    return items


def _school_start(org_id: str, today: date):
    """(started, first_day_iso): whether school is in session yet, per the org's
    first_day_of_school registration setting. No date configured = in session."""
    from services.sis_parent_service import _first_day_of_school
    first = _first_day_of_school(org_id)
    if not first:
        return True, None
    try:
        fd = date.fromisoformat(str(first)[:10])
    except ValueError:
        return True, None
    return today >= fd, fd.isoformat()


def _user_phone(user_id: str) -> Optional[str]:
    """The staff member's own phone number from their user record."""
    try:
        rows = (_admin().table('users').select('phone_number')
                .eq('id', user_id).limit(1).execute()).data or []
    except Exception as e:  # noqa: BLE001 — never break the dashboard over a prompt
        logger.warning(f'staff phone lookup failed for {user_id[:8]}: {e}')
        return None
    return (rows[0].get('phone_number') if rows else None) or None


def teacher_dashboard(user_id: str, org_id: str) -> Dict[str, Any]:
    """Everything the teacher home screen needs in one call."""
    profile = get_staff_profile(org_id, user_id)
    open_entry = current_open_entry(org_id, user_id)
    started, first_day = _school_start(org_id, _org_now(org_id).date())

    onboarding = my_onboarding_summary(org_id, user_id)

    # Required staff resources not yet acknowledged (or re-required after update).
    # Role-narrowed resources only nag the roles they target.
    resources = sis_service.filter_role_visible(user_id, (
        _admin().table('org_resources')
        .select('id, title, url, version_date, updated_at, visible_to_roles')
        .eq('organization_id', org_id).eq('requires_ack', True)
        .in_('audience', ['staff', 'all']).execute()
    ).data or [])
    acked = {}
    if resources:
        rows = (_admin().table('sis_resource_acks').select('resource_id, version_date')
                .eq('user_id', user_id)
                .in_('resource_id', [r['id'] for r in resources]).execute()).data or []
        acked = {r['resource_id']: r.get('version_date') for r in rows}
    pending_acks = [
        {'id': r['id'], 'title': r['title']}
        for r in resources
        if r['id'] not in acked or (
            (r.get('version_date') or '') > (acked.get(r['id']) or ''))
    ]

    forms = (
        _admin().table('sis_form_submissions')
        .select('id, form_type, title, status, created_at')
        .eq('organization_id', org_id).eq('submitted_by', user_id)
        .order('created_at', desc=True).limit(5).execute()
    ).data or []

    # Staff-facing resources (the mentor handbook and friends). These already
    # existed but only surfaced when an acknowledgment was outstanding, so a
    # teacher had no way to find the handbook again afterwards.
    staff_resources = [
        {'id': r['id'], 'title': r['title'], 'url': r.get('url'), 'category': r.get('category')}
        for r in sis_service.filter_role_visible(user_id, (
            _admin().table('org_resources')
            .select('id, title, url, category, audience, visible_to_roles')
            .eq('organization_id', org_id)
            .in_('audience', ['staff', 'all'])
            .order('title').limit(8).execute()
        ).data or [])
    ]
    # Uploaded docs live in the private `org-documents` bucket — one batched
    # signing call for the list; external links pass through.
    sign_in_place(staff_resources, ['url'])

    # Pinned links: the school's permanent teacher links (iCreate 2026-08-28),
    # rendered as their own section between Today and My classes. Same
    # audience/role visibility rules as the library.
    pinned_links = [
        {'id': r['id'], 'title': r['title'], 'url': r.get('url'),
         'description': r.get('description')}
        for r in sis_service.filter_role_visible(user_id, (
            _admin().table('org_resources')
            .select('id, title, url, description, audience, visible_to_roles')
            .eq('organization_id', org_id).eq('pinned', True)
            .in_('audience', ['staff', 'all'])
            .order('sort_order').order('title').execute()
        ).data or [])
    ]
    sign_in_place(pinned_links, ['url'])

    return {
        # Before the first day of school the daily schedule stays empty — weekly
        # meeting patterns exist in the catalog but classes haven't started yet.
        'today': _today_items(user_id, org_id) if started else [],
        'school_starts': None if started else first_day,
        'classes': teacher_classes(user_id, org_id),
        'profile': {k: profile.get(k) for k in
                    ('position', 'uses_time_clock', 'pay_type', 'is_active')},
        # The office needs a number it can call when a teacher is out. Nothing
        # ever asked staff for one, so most records were blank (iCreate,
        # 2026-09-02: "we need to force the teachers to enter their phone
        # numbers too"). The dashboard asks until it has one.
        'needs_phone': not (_user_phone(user_id) or '').strip(),
        'open_time_entry': open_entry,
        'onboarding': onboarding,
        'pending_acks': pending_acks,
        'recent_forms': forms,
        'staff_resources': staff_resources,
        'pinned_links': pinned_links,
    }


def my_onboarding_summary(org_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """The person's own STAFF checklist for the teacher dashboard banner.

    Both filters are load-bearing. Without `audience`, somebody who is a parent
    as well as a teacher gets whichever assignment is newest — iCreate saw a
    teacher dashboard reading "Finish your ALD Ordering Form Checklist", which is
    a family checklist and lives in the family portal. Without `kind`, a document
    sent for signature (its own row, one item) outranks the real checklist. Every
    other read of this table filters both ways; this one did not.
    """
    rows = (
        _admin().table('sis_onboarding_assignments').select('id, status, items, template_name')
        .eq('organization_id', org_id).eq('user_id', user_id)
        .eq('audience', 'staff').eq('kind', 'checklist')
        .order('created_at', desc=True).limit(1).execute()
    ).data
    if not rows:
        return None
    a = rows[0]
    items = a.get('items') or []
    done = len([i for i in items if i.get('status') in ('complete', 'approved')])
    return {'id': a['id'], 'status': a['status'], 'template_name': a.get('template_name'),
            'total': len(items), 'done': done}


# ── Teacher class roster (health/safety alerts, access-logged) ───────────────

def _age(dob: Optional[str], today: date) -> Optional[int]:
    if not dob:
        return None
    try:
        d = date.fromisoformat(dob[:10])
    except ValueError:
        return None
    return today.year - d.year - ((today.month, today.day) < (d.month, d.day))


def _next_class_by_student(org_id: str, class_id: str, student_ids: List[str],
                           when: datetime) -> Dict[str, Dict[str, Any]]:
    """Where each student on this roster goes after this class, today.

    iCreate, 2026-08-25: "Could you make it so that each teacher is able to see
    where the students in their class are supposed to go to next? ... Then, each
    teacher can help us with the in between classes chaos."

    Keyed off THIS class's meeting today, not the wall clock: a teacher takes
    attendance at the start of the block and needs to know where to send the
    room at the end of it. Returns {} rather than raising — the roster (and the
    health alerts on it) must render even if the schedule read fails.
    """
    if not student_ids:
        return {}
    try:
        admin = _admin()
        today = when.date()
        dow = (today.weekday() + 1) % 7  # Python Mon=0; class_meetings uses Sun=0

        # This class's own meeting today tells us when the handover happens. A
        # class with no meeting on this weekday has no "next" to point at.
        mine = (admin.table('class_meetings')
                .select('start_time, end_time, day_of_week, specific_date')
                .eq('class_id', class_id).execute()).data or []
        today_iso = today.isoformat()
        mine_today = [m for m in mine
                      if (m.get('specific_date') or '')[:10] == today_iso
                      or (not m.get('specific_date') and m.get('day_of_week') == dow)]
        if not mine_today:
            return {}
        # Earliest end among this class's meetings today: what the students in
        # front of the teacher are leaving.
        leaves_at = min((m.get('end_time') or m.get('start_time') or '')
                        for m in mine_today)
        if not leaves_at:
            return {}

        # Every other class these students are in, and when it meets today.
        enr = fetch_all_rows(lambda: (
            admin.table('class_enrollments').select('student_id, class_id')
            .in_('student_id', student_ids).eq('status', 'active')
        ))
        other_ids = sorted({e['class_id'] for e in enr if e['class_id'] != class_id})
        if not other_ids:
            return {}
        meetings = fetch_all_rows(lambda: (
            admin.table('class_meetings')
            .select('class_id, day_of_week, specific_date, start_time, end_time, location')
            .in_('class_id', other_ids)
        ))
        classes = {c['id']: c for c in (
            admin.table('org_classes').select('id, name, location, organization_id')
            .in_('id', other_ids).execute()).data or []}

        # Earliest meeting today per class that starts at or after this one ends.
        soonest: Dict[str, Dict[str, Any]] = {}
        for m in meetings:
            cls = classes.get(m['class_id'])
            if not cls or cls.get('organization_id') != org_id:
                continue
            on_today = ((m.get('specific_date') or '')[:10] == today_iso
                        or (not m.get('specific_date') and m.get('day_of_week') == dow))
            start = m.get('start_time') or ''
            if not on_today or start < leaves_at:
                continue
            prev = soonest.get(m['class_id'])
            if prev is None or start < prev['start_time']:
                soonest[m['class_id']] = {
                    'class_id': m['class_id'],
                    'name': cls.get('name'),
                    'start_time': start,
                    # The meeting's own room wins: a class can move for one
                    # block, and the room is the whole point of this line.
                    'location': m.get('location') or cls.get('location'),
                }

        by_student: Dict[str, Dict[str, Any]] = {}
        for e in enr:
            nxt = soonest.get(e['class_id'])
            if not nxt:
                continue
            cur = by_student.get(e['student_id'])
            if cur is None or nxt['start_time'] < cur['start_time']:
                by_student[e['student_id']] = nxt
        return by_student
    except Exception as exc:  # noqa: BLE001 — a schedule read must not cost the roster
        logger.warning(f'next-class lookup failed for class {class_id}: {exc}')
        return {}


def class_roster_detail(org_id: str, class_id: str, accessor_id: str,
                        accessor_role: str) -> Dict[str, Any]:
    """Full teacher roster for one class: student, preferred name, age, photo,
    guardians + contacts, allergy/medical flags, attendance summary. Every call
    is logged to student_access_logs (it exposes health information)."""
    admin = _admin()
    enrollments = (
        admin.table('class_enrollments').select('student_id, enrolled_at')
        .eq('class_id', class_id).eq('status', 'active').execute()
    ).data or []
    ids = [e['student_id'] for e in enrollments]
    if not ids:
        return {'students': []}

    users = {u['id']: u for u in (
        admin.table('users')
        .select('id, first_name, last_name, display_name, preferred_name, email, '
                'username, date_of_birth, avatar_url, allergies, medications')
        .in_('id', ids).execute()
    ).data or []}

    # Guardians via households (org families), with the household phone.
    hm = (admin.table('household_members').select('household_id, user_id, relationship')
          .in_('user_id', ids).eq('relationship', 'student').execute()).data or []
    hh_by_student = {m['user_id']: m['household_id'] for m in hm}
    hh_ids = list(set(hh_by_student.values()))
    households, guardians_by_hh = {}, {}
    if hh_ids:
        households = {h['id']: h for h in (
            admin.table('households').select('id, name, phone')
            .in_('id', hh_ids).execute()).data or []}
        g_rows = (admin.table('household_members')
                  .select('household_id, user_id, relationship, is_primary_guardian')
                  .in_('household_id', hh_ids).eq('relationship', 'guardian')
                  .execute()).data or []
        g_ids = [g['user_id'] for g in g_rows]
        g_users = {u['id']: u for u in (
            admin.table('users').select('id, first_name, last_name, display_name, email, preferred_name')
            .in_('id', g_ids).execute()).data or []} if g_ids else {}
        for g in g_rows:
            gu = g_users.get(g['user_id']) or {}
            guardians_by_hh.setdefault(g['household_id'], []).append({
                'name': _full_name(gu), 'email': gu.get('email'),
                'is_primary': bool(g.get('is_primary_guardian')),
            })

    # Attendance summary per student for THIS class.
    att_rows = (admin.table('sis_attendance').select('student_user_id, status')
                .eq('class_id', class_id).in_('student_user_id', ids)
                .execute()).data or []
    att: Dict[str, Dict[str, int]] = {}
    for r in att_rows:
        s = att.setdefault(r['student_user_id'], {'present': 0, 'absent': 0,
                                                  'late': 0, 'excused': 0})
        if r.get('status') in s:
            s[r['status']] += 1

    now = _org_now(org_id)
    today = now.date()
    next_class = _next_class_by_student(org_id, class_id, ids, now)
    students = []
    for e in enrollments:
        u = users.get(e['student_id']) or {}
        hh_id = hh_by_student.get(e['student_id'])
        hh = households.get(hh_id) or {}
        # "None", "N/A", "-" are how families say *no* allergy. Treating them as
        # content flagged a red Alert on students with nothing to report, which
        # is worse than useless on a roster — it teaches teachers to ignore the
        # badge that matters (iCreate, 2026-07-30).
        allergies = blank_values.clean(u.get('allergies'))
        medications = blank_values.clean(u.get('medications'))
        students.append({
            'student_id': e['student_id'],
            'name': _full_name(u),
            'preferred_name': u.get('preferred_name'),
            'last_name': u.get('last_name'),
            'age': _age(u.get('date_of_birth'), today),
            'avatar_url': u.get('avatar_url'),
            'household_name': hh.get('name'),
            'household_phone': hh.get('phone'),
            'guardians': guardians_by_hh.get(hh_id, []),
            'allergies': allergies,
            'medications': medications,
            'has_alert': bool(allergies or medications),
            'attendance': att.get(e['student_id']),
            'enrolled_at': e.get('enrolled_at'),
            'next_class': next_class.get(e['student_id']),
        })
    students.sort(key=lambda s: (s.get('last_name') or s['name']).lower())
    # Student photos are private-bucket objects; one batch for the roster.
    sign_in_place(students, ['avatar_url'])

    # Access log: one row per student viewed (health data is included).
    # This insert is a single statement, so one bad accessor_role loses the
    # whole roster's audit trail, not one row -- and it did: every org-admin
    # view failed the valid_accessor_role CHECK and was swallowed by the
    # handler below. _constrained_role keeps the write survivable.
    from utils.access_logger import _constrained_role
    try:
        admin.table('student_access_logs').insert([{
            'student_id': s['student_id'], 'accessor_id': accessor_id,
            'accessor_role': _constrained_role(accessor_role),
            'data_accessed': 'class_roster_health',
            'purpose': f'Class roster view (class {class_id})',
        } for s in students]).execute()
    except Exception as e:  # noqa: BLE001 — logging must not break the roster
        logger.warning(f'class roster access log failed: {e}')

    return {'students': students}


# ── Staff directory (teacher-visible) ────────────────────────────────────────

def staff_directory(org_id: str) -> List[Dict[str, Any]]:
    """Public-to-staff directory: everything on the Staff page minus admin-only
    employment fields. Placeholder (unlinked) teachers are shown without email."""
    staff = sis_service.list_org_staff(org_id)
    profiles = {p['user_id']: p for p in (
        _admin().table('sis_staff_profiles')
        .select('user_id, position, work_schedule, is_active')
        .eq('organization_id', org_id).execute()
    ).data or []}
    out = []
    for s in staff:
        p = profiles.get(s['id']) or {}
        if p.get('is_active') is False:
            continue
        out.append({
            'id': s['id'], 'name': s['name'],
            'email': None if s.get('is_placeholder') else s.get('email'),
            'roles': s['roles'], 'role_labels': s['role_labels'],
            'bio': s.get('bio'), 'avatar_url': s.get('avatar_url'),
            'position': p.get('position'), 'work_schedule': p.get('work_schedule'),
            # staff_type deliberately absent: whether a colleague is an employee,
            # a contractor or family is an employment term, and this phonebook is
            # readable by every staff member including teachers.
        })
    return out


# ── Time clock ───────────────────────────────────────────────────────────────

def current_open_entry(org_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    rows = (
        _admin().table('sis_time_entries').select('*')
        .eq('organization_id', org_id).eq('user_id', user_id)
        .is_('clock_out', 'null').eq('status', 'open')
        .order('clock_in', desc=True).limit(1).execute()
    ).data
    return rows[0] if rows else None


def clock_in(org_id: str, user_id: str, job_label: Optional[str] = None,
             class_id: Optional[str] = None) -> Dict[str, Any]:
    profile = get_staff_profile(org_id, user_id)
    if not profile.get('uses_time_clock'):
        return {'error': 'The time clock is not enabled for your account'}
    if current_open_entry(org_id, user_id):
        return {'error': 'You are already clocked in — clock out first'}
    now = _org_now(org_id)
    row = (_admin().table('sis_time_entries').insert({
        'organization_id': org_id, 'user_id': user_id,
        'clock_in': now.astimezone(timezone.utc).isoformat(),
        'work_date': now.date().isoformat(),
        'job_label': (job_label or '').strip() or None,
        'class_id': class_id or None,
        'status': 'open',
    }).execute()).data
    return {'entry': row[0] if row else None}


def clock_out(org_id: str, user_id: str, notes: Optional[str] = None) -> Dict[str, Any]:
    entry = current_open_entry(org_id, user_id)
    if not entry:
        return {'error': 'You are not clocked in'}
    now = datetime.now(timezone.utc)
    fields = {'clock_out': now.isoformat(), 'status': 'submitted',
              'updated_at': now.isoformat()}
    if (notes or '').strip():
        fields['notes'] = notes.strip()
    row = (_admin().table('sis_time_entries').update(fields)
           .eq('id', entry['id']).execute()).data
    return {'entry': row[0] if row else None}


def _entry_hours(e: Dict[str, Any]) -> float:
    if not e.get('clock_in') or not e.get('clock_out'):
        return 0.0
    try:
        start = datetime.fromisoformat(e['clock_in'].replace('Z', '+00:00'))
        end = datetime.fromisoformat(e['clock_out'].replace('Z', '+00:00'))
    except ValueError:
        return 0.0
    return max(0.0, round((end - start).total_seconds() / 3600, 2))


def my_time_entries(org_id: str, user_id: str, start: str, end: str) -> Dict[str, Any]:
    rows = (
        _admin().table('sis_time_entries').select('*')
        .eq('organization_id', org_id).eq('user_id', user_id)
        .gte('work_date', start).lte('work_date', end)
        .order('work_date', desc=True).order('clock_in', desc=True).execute()
    ).data or []
    for r in rows:
        r['hours'] = _entry_hours(r)
    # Forgot-to-clock-out warning: an open entry from a previous local day.
    today = _org_now(org_id).date().isoformat()
    stale = [r for r in rows if r.get('status') == 'open' and r.get('work_date') < today]
    return {'entries': rows, 'total_hours': round(sum(r['hours'] for r in rows), 2),
            'forgot_clock_out': [r['id'] for r in stale]}


# ── Timesheets (admin) ───────────────────────────────────────────────────────

def timeclock_setup(org_id: str) -> Dict[str, Any]:
    """Why the Timesheets page is empty, when it is.

    The time clock is off by default on every staff profile
    (`sis_staff_profiles.uses_time_clock` defaults to false), so a school that
    has never turned it on for anybody sees "No time entries in this period."
    forever, with nothing on the page naming the switch. iCreate read that as
    the feature being broken: "Timesheets would be a nice feature if it
    worked!" (2026-08-25). Every part of the chain was working; none of it had
    been switched on.

    So the page reports its own preconditions: how many active staff could be
    on the clock, how many are, and who is on it without an hourly rate — that
    last one matters because payroll.csv leaves Amount blank rather than
    guessing a rate, and a blank column in a payroll export is the kind of
    thing you want to learn about before payday rather than after.
    """
    # order_by='user_id', not the default 'id': sis_staff_profiles is keyed on
    # (user_id, organization_id) and has no id column, and paging on a column
    # that does not exist is a 400, not a short read.
    rows = fetch_all_rows(lambda: (
        _admin().table('sis_staff_profiles')
        .select('user_id, uses_time_clock, hourly_rate_cents, is_active')
        .eq('organization_id', org_id).is_('archived_at', 'null')
    ), order_by='user_id')
    active = [r for r in rows if r.get('is_active')]
    on_clock = [r for r in active if r.get('uses_time_clock')]
    no_rate = [r for r in on_clock if not r.get('hourly_rate_cents')]
    names = {s['id']: s.get('name') for s in sis_service.list_org_staff(org_id)}
    return {
        'staff_total': len(active),
        'clock_enabled': len(on_clock),
        'missing_rate': [
            {'user_id': r['user_id'], 'name': names.get(r['user_id']) or 'Unknown'}
            for r in no_rate
        ],
    }


def timesheet_summary(org_id: str, start: str, end: str) -> List[Dict[str, Any]]:
    """Per-staff totals for a pay period, with entry detail."""
    rows = (
        _admin().table('sis_time_entries').select('*')
        .eq('organization_id', org_id)
        .gte('work_date', start).lte('work_date', end)
        .order('work_date').execute()
    ).data or []
    staff = {s['id']: s for s in sis_service.list_org_staff(org_id)}
    profiles = {p['user_id']: p for p in (
        _admin().table('sis_staff_profiles')
        .select('user_id, payroll_id, pay_type, hourly_rate_cents')
        .eq('organization_id', org_id).execute()
    ).data or []}
    by_user: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        r['hours'] = _entry_hours(r)
        u = by_user.setdefault(r['user_id'], {
            'user_id': r['user_id'],
            'name': (staff.get(r['user_id']) or {}).get('name') or 'Unknown',
            'payroll_id': (profiles.get(r['user_id']) or {}).get('payroll_id'),
            'pay_type': (profiles.get(r['user_id']) or {}).get('pay_type'),
            'hourly_rate_cents': (profiles.get(r['user_id']) or {}).get('hourly_rate_cents'),
            'entries': [], 'total_hours': 0.0, 'approved_hours': 0.0,
            'open_entries': 0,
        })
        u['entries'].append(r)
        u['total_hours'] = round(u['total_hours'] + r['hours'], 2)
        if r.get('status') == 'approved':
            u['approved_hours'] = round(u['approved_hours'] + r['hours'], 2)
        if r.get('status') == 'open':
            u['open_entries'] += 1
    out = list(by_user.values())
    out.sort(key=lambda u: u['name'].lower())
    return out


def update_time_entry(org_id: str, entry_id: str, fields: Dict[str, Any],
                      edited_by: str) -> Dict[str, Any]:
    """Admin edit of a time entry — requires a reason, records the editor."""
    rows = (_admin().table('sis_time_entries').select('*')
            .eq('id', entry_id).limit(1).execute()).data
    if not rows or rows[0].get('organization_id') != org_id:
        return {'error': 'Entry not found'}
    reason = (fields.get('edit_reason') or '').strip()
    payload: Dict[str, Any] = {}
    for k in ('clock_in', 'clock_out', 'work_date', 'job_label', 'notes', 'status'):
        if k in fields:
            payload[k] = fields[k]
    if payload.get('status') and payload['status'] not in ('open', 'submitted', 'approved', 'rejected'):
        return {'error': 'Invalid status'}
    if not payload:
        return {'error': 'Nothing to update'}
    if not reason and any(k in payload for k in ('clock_in', 'clock_out', 'work_date')):
        return {'error': 'An edit reason is required when changing times'}
    now = datetime.now(timezone.utc).isoformat()
    payload.update({'edited_by': edited_by, 'updated_at': now})
    if reason:
        payload['edit_reason'] = reason
    if payload.get('status') == 'approved':
        payload.update({'approved_by': edited_by, 'approved_at': now})
        sis_notifications.notify(
            rows[0]['user_id'], 'Timesheet approved',
            'A time entry was approved.', link='/time', organization_id=org_id)
    row = (_admin().table('sis_time_entries').update(payload)
           .eq('id', entry_id).execute()).data
    return {'entry': row[0] if row else None}


def approve_period(org_id: str, user_id: str, start: str, end: str,
                   approved_by: str) -> Dict[str, Any]:
    """Approve all submitted entries for one staff member in a period."""
    now = datetime.now(timezone.utc).isoformat()
    rows = (_admin().table('sis_time_entries')
            .update({'status': 'approved', 'approved_by': approved_by,
                     'approved_at': now, 'updated_at': now})
            .eq('organization_id', org_id).eq('user_id', user_id)
            .eq('status', 'submitted')
            .gte('work_date', start).lte('work_date', end).execute()).data or []
    if rows:
        sis_notifications.notify(
            user_id, 'Timesheet approved',
            f'{len(rows)} time entr{"y was" if len(rows) == 1 else "ies were"} approved.',
            link='/time', organization_id=org_id)
    return {'approved': len(rows)}


def payroll_rows(org_id: str, start: str, end: str) -> List[List[Any]]:
    """CSV rows for the payroll export (approved entries only). This is an
    export for an external payroll system — no pay is calculated beyond
    hours x stored hourly rate, and only when a rate exists."""
    summary = timesheet_summary(org_id, start, end)
    rows: List[List[Any]] = []
    for staff in summary:
        rate = staff.get('hourly_rate_cents')
        for e in staff['entries']:
            if e.get('status') != 'approved':
                continue
            amount = round(e['hours'] * rate / 100, 2) if rate else ''
            rows.append([
                staff['name'], staff.get('payroll_id') or '',
                f'{start} - {end}', e.get('work_date') or '',
                e.get('job_label') or '', e['hours'],
                (rate / 100) if rate else '', amount,
                e.get('notes') or '', e.get('status'),
            ])
    return rows


# ── Archiving and removing staff ─────────────────────────────────────────────

def _staff_history(org_id: str, staff_id: str) -> Dict[str, int]:
    """What a staff record is tied to. Anything non-zero means deleting the row
    would orphan real school records, so the caller must archive instead."""
    admin = _admin()

    def _count(table: str, column: str, **extra) -> int:
        try:
            q = admin.table(table).select('id').eq(column, staff_id)
            for k, v in extra.items():
                q = q.eq(k, v)
            return len(q.limit(50).execute().data or [])
        except Exception:  # noqa: BLE001 — a missing table must not block the check
            # warning, not debug: this probe fails OPEN. A silent failure here
            # reads as "no history" and lets a delete through that should have
            # been refused, so it needs to be visible when it happens.
            logger.warning('history probe failed for %s.%s', table, column, exc_info=True)
            return 0

    return {
        'classes': _count('org_classes', 'primary_instructor_id', organization_id=org_id),
        'time_entries': _count('sis_time_entries', 'user_id', organization_id=org_id),
        'forms': _count('sis_form_submissions', 'submitted_by', organization_id=org_id),
        'onboarding': _onboarding_with_work(org_id, staff_id),
        'attendance': _count('class_attendance', 'recorded_by'),
    }


def _onboarding_with_work(org_id: str, staff_id: str) -> int:
    """Onboarding checklists that record something that actually happened.

    A checklist that was assigned and never touched is not history — it is a
    blank form. Counting those blocked iCreate from deleting a test staff
    account over an onboarding template nobody had filled in, and archiving was
    the only way out. Deleting the user cascades the assignment away
    (sis_onboarding_assignments.user_id references users on delete cascade), so
    there is nothing to orphan.

    "Something happened" is the same definition unassign() already uses when it
    warns before removing a checklist: a completed item, or an uploaded
    document. A complete status counts too, for a checklist with no required
    items to tick.
    """
    try:
        rows = (_admin().table('sis_onboarding_assignments').select('status, items')
                .eq('organization_id', org_id).eq('user_id', staff_id)
                .limit(50).execute()).data or []
    except Exception:  # noqa: BLE001 — same fail-open rule as the other probes
        logger.warning('history probe failed for sis_onboarding_assignments.user_id',
                       exc_info=True)
        return 0

    def _touched(assignment: Dict[str, Any]) -> bool:
        if assignment.get('status') == 'complete':
            return True
        return any(i.get('status') in ('complete', 'approved') or i.get('document_url')
                   for i in (assignment.get('items') or []))

    return len([r for r in rows if _touched(r)])


def staff_removal_preview(org_id: str, staff_id: str) -> Dict[str, Any]:
    """What would happen if this staff member were removed — shown in the confirm
    dialog so nobody deletes a teacher and discovers the consequences after."""
    # include_archived: an already-archived person can still be deleted later,
    # once whatever was blocking it is gone.
    staff = next((s for s in sis_service.list_org_staff(org_id, include_archived=True)
                  if s['id'] == staff_id), None)
    if not staff:
        return {'error': 'Staff member not found'}
    history = _staff_history(org_id, staff_id)
    classes = (_admin().table('org_classes').select('id, name')
               .eq('organization_id', org_id).eq('primary_instructor_id', staff_id)
               .execute()).data or []
    assisting = (_admin().table('org_classes').select('id, name, assistant_instructor_ids')
                 .eq('organization_id', org_id)
                 .contains('assistant_instructor_ids', [staff_id])
                 .execute()).data or []
    # Anything except the class assignment is history we must not orphan;
    # classes alone can be unassigned cleanly ("Teacher TBD").
    blocking = {k: v for k, v in history.items() if k != 'classes' and v}
    return {
        'staff': {'id': staff_id, 'name': staff['name'],
                  'is_placeholder': staff.get('is_placeholder')},
        'classes': [{'id': c['id'], 'name': c.get('name')} for c in classes],
        # Classes where they are an assistant, not the teacher. Detached the same
        # way — an assistant now carries portal access, so a stale id would leave
        # a departed staff member listed on a class they no longer help with.
        'assisting': [{'id': c['id'], 'name': c.get('name'),
                       'assistant_instructor_ids': c.get('assistant_instructor_ids') or []}
                      for c in assisting],
        'history': history,
        'can_delete': not blocking,
        'blocking': blocking,
    }


def _detach_from_classes(preview: Dict[str, Any], staff_id: str) -> None:
    """Clear a departing staff member off every class that names them."""
    for c in preview.get('classes') or []:
        _admin().table('org_classes').update({'primary_instructor_id': None}).eq('id', c['id']).execute()
    for c in preview.get('assisting') or []:
        remaining = [a for a in (c.get('assistant_instructor_ids') or []) if a != staff_id]
        _admin().table('org_classes').update(
            {'assistant_instructor_ids': remaining}).eq('id', c['id']).execute()
    # The third teacher link: class_advisors rows keep the person a teacher of
    # the class (targeting, class scope) even after both columns above are
    # cleared. Departing staff must not keep receiving class sends.
    try:
        _admin().table('class_advisors').update({'is_active': False})\
            .eq('advisor_id', staff_id).eq('is_active', True).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not deactivate class_advisors for {staff_id}: {e}')


def archive_staff(org_id: str, staff_id: str, actor_id: str) -> Dict[str, Any]:
    """Hide a staff member from the SIS without touching their history.

    Their classes are unassigned (the class shows no teacher rather than a
    ghost), and their profile is marked inactive, which is what the staff list
    and directory already filter on. Nothing is deleted, so an archive can be
    undone by reactivating the profile.
    """
    preview = staff_removal_preview(org_id, staff_id)
    if preview.get('error'):
        return preview
    now = _now_iso()
    _detach_from_classes(preview, staff_id)
    # sis_staff_profiles is keyed by user_id — it has no `id` column at all
    # (20260722_sis_teacher_portal.sql). Selecting one raised 42703 and archiving
    # failed outright for everybody.
    existing = (_admin().table('sis_staff_profiles').select('user_id')
                .eq('organization_id', org_id).eq('user_id', staff_id).limit(1).execute()).data
    payload = {'is_active': False, 'archived_at': now, 'archived_by': actor_id}
    if existing:
        _admin().table('sis_staff_profiles').update(payload) \
            .eq('organization_id', org_id).eq('user_id', staff_id).execute()
    else:
        _admin().table('sis_staff_profiles').insert(
            {'organization_id': org_id, 'user_id': staff_id, **payload}).execute()
    return {'archived': True, 'classes_unassigned': len(preview['classes']),
            'name': preview['staff']['name']}


def delete_staff(org_id: str, staff_id: str,
                 actor_id: Optional[str] = None) -> Dict[str, Any]:
    """Permanently remove a staff record — only when it carries no history.

    This exists for the placeholder rows a school creates while hiring ("Art
    Teacher TBD") and then decides against. If the person has taken attendance,
    clocked in, filed a form, or been assigned onboarding, deletion would orphan
    those records, so the caller is told to archive instead. Class assignments
    alone don't block: they are cleared first.
    """
    preview = staff_removal_preview(org_id, staff_id)
    if preview.get('error'):
        return preview
    if not preview['can_delete']:
        return {'error': ('This person has school records attached '
                          f'({", ".join(sorted(preview["blocking"]))}). '
                          'Archive them instead — it hides them without losing history.'),
                'blocking': preview['blocking']}
    _detach_from_classes(preview, staff_id)
    _admin().table('sis_staff_profiles').delete() \
        .eq('organization_id', org_id).eq('user_id', staff_id).execute()
    try:
        _admin().table('users').delete().eq('id', staff_id).eq('organization_id', org_id).execute()
    except Exception as e:  # noqa: BLE001
        from utils.fk_errors import fk_blocker, fk_blocker_label
        blocker = fk_blocker(e)
        if blocker is None:
            raise
        # _staff_history probes the SIS tables a teacher touches; a teacher is
        # also a platform user who may have created a course or added someone to
        # a message group. Those columns are NOT NULL, so the delete cannot go
        # through — fall back to the archive the dialog already offered instead
        # of handing the admin a 500 (iCreate, 2026-08-19).
        logger.warning(f'[Staff] delete of {staff_id[:8]} blocked by {blocker}; archiving instead')
        archive_staff(org_id, staff_id, actor_id=actor_id or staff_id)
        return {'archived': True, 'classes_unassigned': len(preview['classes']),
                'name': preview['staff']['name'], 'delete_blocked_by': blocker,
                'message': (f"{preview['staff']['name']} could not be deleted outright because the "
                            f'school still has {fk_blocker_label(blocker)}. They have been archived '
                            'instead, which hides them without losing those records.')}
    return {'deleted': True, 'classes_unassigned': len(preview['classes']),
            'name': preview['staff']['name']}


def restore_staff(org_id: str, staff_id: str) -> Dict[str, Any]:
    """Undo an archive. Classes are not reassigned — that's a deliberate choice
    each time, not something to guess at."""
    rows = (_admin().table('sis_staff_profiles').select('user_id')
            .eq('organization_id', org_id).eq('user_id', staff_id).limit(1).execute()).data
    if not rows:
        return {'error': 'Staff member not found'}
    _admin().table('sis_staff_profiles').update(
        {'is_active': True, 'archived_at': None, 'archived_by': None}
    ).eq('organization_id', org_id).eq('user_id', staff_id).execute()
    return {'restored': True}
