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
from utils.logger import get_logger

logger = get_logger(__name__)

DEFAULT_TZ = 'America/Denver'

PROFILE_FIELDS = ('position', 'staff_type', 'pay_type', 'payroll_id',
                  'hourly_rate_cents', 'emergency_contact_name',
                  'emergency_contact_phone', 'work_schedule', 'start_date',
                  'end_date', 'is_active', 'uses_time_clock')
# The subset a teacher may edit on their own profile.
SELF_PROFILE_FIELDS = ('emergency_contact_name', 'emergency_contact_phone')

STAFF_TYPES = ('employee', 'contractor')
PAY_TYPES = ('hourly', 'salaried', 'stipend', 'unpaid')
ASSIGNMENT_TYPES = ('duty', 'event', 'meeting', 'substitute', 'other')


def _admin():
    return get_supabase_admin_client()


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
    return (u.get('display_name')
            or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
            or u.get('username') or u.get('email') or 'Unknown')


# ── Staff profiles ────────────────────────────────────────────────────────────

def get_staff_profile(org_id: str, user_id: str) -> Dict[str, Any]:
    rows = (
        _admin().table('sis_staff_profiles').select('*')
        .eq('organization_id', org_id).eq('user_id', user_id).limit(1).execute()
    ).data
    return rows[0] if rows else {'user_id': user_id, 'organization_id': org_id,
                                 'is_active': True, 'uses_time_clock': False}


def upsert_staff_profile(org_id: str, user_id: str, fields: Dict[str, Any],
                         allowed: tuple = PROFILE_FIELDS) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    for k in allowed:
        if k not in fields:
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
        return {'profile': get_staff_profile(org_id, user_id)}
    payload.update({'user_id': user_id, 'organization_id': org_id,
                    'updated_at': datetime.now(timezone.utc).isoformat()})
    row = (_admin().table('sis_staff_profiles')
           .upsert(payload, on_conflict='user_id').execute()).data
    return {'profile': row[0] if row else payload}


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
    sis_notifications.notify(
        target, 'New assignment',
        f'You have a new {a_type}: {title}',
        link='/', organization_id=org_id)
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
        .select('id, name, description, location, capacity, status, image_url')
        .eq('organization_id', org_id).in_('id', class_ids)
        .neq('status', 'archived').execute()
    ).data or []


def _meetings_for_classes(org_id: str, class_ids: List[str]) -> List[Dict[str, Any]]:
    if not class_ids:
        return []
    return (
        _admin().table('class_meetings').select('*')
        .eq('organization_id', org_id).in_('class_id', class_ids).execute()
    ).data or []


def _enrolled_counts(class_ids: List[str]) -> Dict[str, int]:
    if not class_ids:
        return {}
    rows = (
        _admin().table('class_enrollments').select('class_id')
        .in_('class_id', class_ids).eq('status', 'active').execute()
    ).data or []
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
                    'enrolled_count': counts.get(c['id'], 0)})
    out.sort(key=lambda c: (c.get('name') or '').lower())
    return out


def teacher_schedule(user_id: str, org_id: str) -> Dict[str, Any]:
    """Weekly view: recurring class meetings + duties, plus upcoming one-offs."""
    ids = sis_service.advisor_class_ids(user_id, org_id)
    classes = {c['id']: c for c in _classes_by_ids(org_id, ids)}
    meetings = [
        {**m, 'class_name': (classes.get(m['class_id']) or {}).get('name')}
        for m in _meetings_for_classes(org_id, list(classes.keys()))
    ]
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


def teacher_dashboard(user_id: str, org_id: str) -> Dict[str, Any]:
    """Everything the teacher home screen needs in one call."""
    profile = get_staff_profile(org_id, user_id)
    open_entry = current_open_entry(org_id, user_id)

    onboarding = my_onboarding_summary(org_id, user_id)

    # Required staff resources not yet acknowledged (or re-required after update).
    resources = (
        _admin().table('org_resources')
        .select('id, title, url, version_date, updated_at')
        .eq('organization_id', org_id).eq('requires_ack', True)
        .in_('audience', ['staff', 'all']).execute()
    ).data or []
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

    return {
        'today': _today_items(user_id, org_id),
        'classes': teacher_classes(user_id, org_id),
        'profile': {k: profile.get(k) for k in
                    ('position', 'uses_time_clock', 'pay_type', 'is_active')},
        'open_time_entry': open_entry,
        'onboarding': onboarding,
        'pending_acks': pending_acks,
        'recent_forms': forms,
    }


def my_onboarding_summary(org_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    rows = (
        _admin().table('sis_onboarding_assignments').select('id, status, items, template_name')
        .eq('organization_id', org_id).eq('user_id', user_id)
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


def class_roster_detail(org_id: str, class_id: str, accessor_id: str,
                        accessor_role: str) -> Dict[str, Any]:
    """Full teacher roster for one class: student, preferred name, age, photo,
    guardians + contacts, allergy/medical flags, attendance summary. Every call
    is logged to student_access_logs (it exposes health information)."""
    admin = _admin()
    enrollments = (
        admin.table('class_enrollments').select('student_id, created_at')
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
            admin.table('users').select('id, first_name, last_name, display_name, email')
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

    today = _org_now(org_id).date()
    students = []
    for e in enrollments:
        u = users.get(e['student_id']) or {}
        hh_id = hh_by_student.get(e['student_id'])
        hh = households.get(hh_id) or {}
        allergies = (u.get('allergies') or '').strip()
        medications = (u.get('medications') or '').strip()
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
            'allergies': allergies or None,
            'medications': medications or None,
            'has_alert': bool(allergies or medications),
            'attendance': att.get(e['student_id']),
            'enrolled_at': e.get('created_at'),
        })
    students.sort(key=lambda s: (s.get('last_name') or s['name']).lower())

    # Access log: one row per student viewed (health data is included).
    try:
        admin.table('student_access_logs').insert([{
            'student_id': s['student_id'], 'accessor_id': accessor_id,
            'accessor_role': accessor_role,
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
