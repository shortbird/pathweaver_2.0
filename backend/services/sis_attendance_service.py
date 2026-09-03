"""
SIS Attendance service — class-level attendance recording + summaries.

Teachers record per-class, per-date status for each enrolled student; parents/admins
read it. The summary math (counts + attendance rate) is a pure function, unit-tested.
Admin-client DB ops elsewhere (SIS tables RLS-locked to backend-only).
"""

from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

from database import get_supabase_admin_client
from utils.logger import get_logger
from utils import person_name

logger = get_logger(__name__)

ATTENDANCE_STATUSES = ('present', 'absent', 'late', 'excused')


def _admin():
    # admin client justified: the SIS console acts for the whole school — this
    #   reads/writes rows belonging to every family in the org, which no single
    #   caller can see under RLS; the route's role+org gate is the authorization
    return get_supabase_admin_client()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _student_name(u: Dict[str, Any]) -> str:
    """Delegates to utils.person_name.full_name — one rule for the whole SIS.
    Ten copies of this function with two different fallback orders is half of
    why names differed screen to screen (iCreate, 2026-08-25)."""
    return person_name.full_name(u, 'Unnamed')


# ── Pure summary (unit-tested) ───────────────────────────────────────────────
def summarize(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Count records by status and compute an attendance rate.

    Rate = (present + late) / total recorded sessions. Excused is not counted
    against the rate's denominator (it neither helps nor hurts).
    """
    counts = {s: 0 for s in ATTENDANCE_STATUSES}
    for r in records or []:
        st = r.get('status')
        if st in counts:
            counts[st] += 1
    denom = counts['present'] + counts['late'] + counts['absent']
    rate = round((counts['present'] + counts['late']) / denom, 4) if denom else None
    return {'counts': counts, 'total': sum(counts.values()), 'attendance_rate': rate}


# ── DB-backed ────────────────────────────────────────────────────────────────
def _enrolled_students(class_id: str) -> List[Dict[str, Any]]:
    enr = (
        _admin().table('class_enrollments').select('student_id')
        .eq('class_id', class_id).eq('status', 'active').execute()
    ).data or []
    ids = [e['student_id'] for e in enr]
    if not ids:
        return []
    users = (
        _admin().table('users')
        .select('id, display_name, first_name, last_name, preferred_name, username, email, date_of_birth')
        .in_('id', ids).execute()
    ).data or []
    out = [{'student_user_id': u['id'], 'name': _student_name(u), 'age': _age(u.get('date_of_birth'))}
           for u in users]
    out.sort(key=lambda s: s['name'].lower())
    return out


def _age(dob):
    """Whole years from an ISO date string — None when unknown/unparseable."""
    from datetime import date
    if not dob:
        return None
    if not isinstance(dob, date):
        try:
            dob = date.fromisoformat(str(dob)[:10])
        except ValueError:
            return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def _org_admin_ids(org_id: str) -> List[str]:
    """User ids of the org's admin team (org_role or org_roles contains org_admin)."""
    rows = (
        _admin().table('users').select('id, org_role, org_roles')
        .eq('organization_id', org_id).execute()
    ).data or []
    admins = []
    for u in rows:
        roles = set()
        if u.get('org_role'):
            roles.add(u['org_role'])
        if isinstance(u.get('org_roles'), list):
            roles.update(u['org_roles'])
        if 'org_admin' in roles:
            admins.append(u['id'])
    return admins


def get_for_date(org_id: str, class_id: str, on_date: str) -> List[Dict[str, Any]]:
    """Roster for a class with each student's recorded status for the date (if any).

    Each student is also annotated with `planned_absence` when a guardian has
    reported them out (whole-day or for this specific class) so the teacher sees it.
    """
    from services import sis_planned_absence_service as planned

    students = _enrolled_students(class_id)
    existing = (
        _admin().table('sis_attendance').select('*')
        .eq('class_id', class_id).eq('date', on_date).execute()
    ).data or []
    by_student = {r['student_user_id']: r for r in existing}
    planned_by_student = planned.for_class_date(org_id, class_id, on_date)
    for s in students:
        rec = by_student.get(s['student_user_id'])
        s['status'] = rec.get('status') if rec else None
        s['note'] = rec.get('note') if rec else None
        s['planned_absence'] = planned_by_student.get(s['student_user_id'])
    return students


def record(org_id: str, class_id: str, on_date: str,
           entries: List[Dict[str, Any]], recorded_by: str) -> Dict[str, Any]:
    """Upsert attendance for a set of students on a date.

    When a student is newly marked 'absent' (their prior status for the date was
    not already 'absent'), the org admin team is notified — an actual absent mark,
    not a forgotten roster.
    """
    prior = {
        r['student_user_id']: r.get('status') for r in (
            _admin().table('sis_attendance').select('student_user_id, status')
            .eq('class_id', class_id).eq('date', on_date).execute()
        ).data or []
    }

    now = _now()
    payloads = []
    seen = set()
    for e in entries or []:
        status = e.get('status')
        student_user_id = e.get('student_user_id')
        if status not in ATTENDANCE_STATUSES or not student_user_id or student_user_id in seen:
            continue
        seen.add(student_user_id)
        payloads.append({
            'organization_id': org_id,
            'class_id': class_id,
            'student_user_id': student_user_id,
            'date': on_date,
            'status': status,
            'note': e.get('note'),
            'recorded_by': recorded_by,
            'updated_at': now,
        })

    saved = []
    if payloads:
        # One bulk upsert for the whole roster — a class save is a single round trip.
        resp = (
            _admin().table('sis_attendance')
            .upsert(payloads, on_conflict='class_id,student_user_id,date').execute()
        )
        saved = resp.data or []

    newly_absent = [p['student_user_id'] for p in payloads
                    if p['status'] == 'absent' and prior.get(p['student_user_id']) != 'absent']

    # The accountability rule (iCreate, 2026-08-09): an absence a guardian
    # already reported needs no alert; an absence nobody reported means the
    # school does not know where the student is — flag it until someone does.
    unaccounted = []
    if newly_absent:
        from services import sis_planned_absence_service as planned
        try:
            covered = planned.for_class_date(org_id, class_id, on_date)
        except Exception as e:  # noqa: BLE001 — the roll save must not fail here;
            # and when in doubt, a false alert beats a missed student.
            logger.error(f'Planned-absence lookup failed during record(): {e}')
            covered = {}
        unaccounted = [sid for sid in newly_absent if sid not in covered]

    _record_unaccounted(org_id, class_id, on_date, unaccounted)
    admins_notified = _notify_admins_of_absences(org_id, class_id, on_date, unaccounted)
    return {'saved': saved, 'count': len(saved),
            'absences_flagged': len(unaccounted), 'admins_notified': admins_notified}


# What a coordinator can decide happened to an unaccounted student. 'late' and
# 'mismarked' also correct the roll — see resolve_alert.
ALERT_RESOLUTIONS = ('elsewhere_on_campus', 'late', 'absent_no_notice',
                     'mismarked', 'other')


def _record_unaccounted(org_id: str, class_id: str, on_date: str,
                        student_ids: List[str]) -> int:
    """Open one 'unaccounted' alert per student per day. The unique constraint
    (student, date, alert_type) means a student absent from two classes raises
    one alert, and a re-save cannot duplicate it."""
    if not student_ids:
        return 0
    rows = [{
        'organization_id': org_id,
        'student_user_id': sid,
        'date': on_date,
        'alert_type': 'unaccounted',
        'class_id': class_id,
        'status': 'open',
    } for sid in student_ids]
    try:
        _admin().table('sis_attendance_alerts').upsert(
            rows, on_conflict='student_user_id,date,alert_type',
            ignore_duplicates=True).execute()
    except Exception as e:  # noqa: BLE001 — the roll save must not fail on the alert
        logger.error(f'Unaccounted-alert insert failed: {e}')
        return 0
    return len(rows)


def open_alerts(org_id: str, on_date: Optional[str] = None) -> List[Dict[str, Any]]:
    """Open student-accountability alerts, hydrated with student + class names."""
    q = (_admin().table('sis_attendance_alerts').select('*')
         .eq('organization_id', org_id).eq('alert_type', 'unaccounted')
         .eq('status', 'open').order('created_at', desc=True))
    if on_date:
        q = q.eq('date', on_date)
    rows = q.execute().data or []
    if not rows:
        return []
    students = {u['id']: _student_name(u) for u in (
        _admin().table('users')
        .select('id, display_name, first_name, last_name, preferred_name, username, email')
        .in_('id', list({r['student_user_id'] for r in rows})).execute()
    ).data or []}
    class_ids = list({r['class_id'] for r in rows if r.get('class_id')})
    classes = {}
    if class_ids:
        classes = {c['id']: c['name'] for c in (
            _admin().table('org_classes').select('id, name')
            .in_('id', class_ids).execute()
        ).data or []}
    for r in rows:
        r['student_name'] = students.get(r['student_user_id'], 'Unnamed')
        r['class_name'] = classes.get(r.get('class_id'))
    return rows


def resolve_alert(org_id: str, alert_id: str, resolution: str,
                  note: Optional[str], actor_id: str) -> Dict[str, Any]:
    """Close an accountability alert with what actually happened.

    Two outcomes contradict the roll and correct it: 'late' (the student
    arrived) and 'mismarked' (they were present all along). Leaving the roll
    wrong under a resolved alert would keep the daily report — the record a
    guardian or an accreditor sees — saying a present student was absent.
    """
    if resolution not in ALERT_RESOLUTIONS:
        return {'error': 'Unknown resolution'}
    rows = (_admin().table('sis_attendance_alerts').select('*')
            .eq('id', alert_id).limit(1).execute()).data or []
    if not rows or rows[0].get('organization_id') != org_id:
        return {'error': 'Alert not found'}
    alert = rows[0]

    fields = {
        'status': 'resolved',
        'resolution': resolution,
        'resolution_note': (note or '').strip() or None,
        'resolved_by': actor_id,
        'resolved_at': _now(),
    }
    updated = (_admin().table('sis_attendance_alerts').update(fields)
               .eq('id', alert_id).execute()).data

    corrected_to = {'late': 'late', 'mismarked': 'present'}.get(resolution)
    if corrected_to and alert.get('class_id'):
        _admin().table('sis_attendance').update({
            'status': corrected_to, 'updated_at': _now(),
        }).eq('class_id', alert['class_id']) \
          .eq('student_user_id', alert['student_user_id']) \
          .eq('date', alert['date']).execute()

    return {'alert': updated[0] if updated else dict(alert, **fields)}


def _notify_admins_of_absences(org_id: str, class_id: str, on_date: str,
                               student_ids: List[str]) -> int:
    """Notify the front office that students are absent with no guardian report
    — the accountability alert, not a general absence digest. Guardian-reported
    absences never reach here (record() filters them out). Best-effort."""
    if not student_ids:
        return 0
    from services import sis_notifications

    admin_ids = _org_admin_ids(org_id)
    if not admin_ids:
        return 0

    cls = (
        _admin().table('org_classes').select('name').eq('id', class_id).limit(1).execute()
    ).data
    class_name = (cls[0].get('name') if cls else None) or 'a class'

    users = (
        _admin().table('users')
        .select('id, display_name, first_name, last_name, preferred_name, username, email')
        .in_('id', student_ids).execute()
    ).data or []
    names = [_student_name(u) for u in users] or ['A student']
    who = names[0] if len(names) == 1 else f"{len(names)} students"

    for admin_id in admin_ids:
        sis_notifications.notify(
            admin_id,
            'Student not accounted for',
            f"{who} marked absent in {class_name} on {on_date} with no guardian report.",
            # The attendance page is the thing to act on; '/' just reloaded a
            # dashboard (iCreate, 2026-08-26).
            link='/attendance',
            organization_id=org_id,
            metadata={'class_id': class_id, 'date': on_date, 'student_ids': student_ids},
        )
    return len(admin_ids)


def daily_report(org_id: str, on_date: str) -> List[Dict[str, Any]]:
    """Every non-present student for a single day, across all classes, flagged
    excused vs. unexcused — so a campus coordinator can see at a glance who is
    missing and whether a guardian reported it. Excused = a teacher marked
    'excused', OR a guardian reported the student out (whole-day or that class).
    Planned absences with no attendance recorded yet show as 'reported out'."""
    admin = _admin()
    records = (
        admin.table('sis_attendance')
        .select('student_user_id, class_id, status, note')
        .eq('organization_id', org_id).eq('date', on_date).execute()
    ).data or []
    planned = (
        admin.table('student_planned_absences')
        .select('student_user_id, class_id, reason')
        .eq('organization_id', org_id).eq('absence_date', on_date).execute()
    ).data or []

    planned_all_day, planned_by_class = {}, {}
    for p in planned:
        if p.get('class_id'):
            planned_by_class[(p['student_user_id'], p['class_id'])] = p
        else:
            planned_all_day[p['student_user_id']] = p

    class_ids = {r['class_id'] for r in records if r.get('class_id')} \
        | {p['class_id'] for p in planned if p.get('class_id')}
    student_ids = {r['student_user_id'] for r in records} | {p['student_user_id'] for p in planned}
    classes = {}
    if class_ids:
        classes = {c['id']: c['name'] for c in (
            admin.table('org_classes').select('id, name').in_('id', list(class_ids)).execute()
        ).data or []}
    users = {}
    if student_ids:
        users = {u['id']: _student_name(u) for u in (
            admin.table('users')
            .select('id, display_name, first_name, last_name, preferred_name, username, email')
            .in_('id', list(student_ids)).execute()
        ).data or []}

    rows, covered = [], set()
    for r in records:
        sid, cid, status = r['student_user_id'], r.get('class_id'), r.get('status')
        covered.add((sid, cid))
        has_plan = (sid in planned_all_day) or ((sid, cid) in planned_by_class)
        if status == 'present' or (status not in ('absent', 'excused', 'late') and not has_plan):
            continue
        reason = (planned_by_class.get((sid, cid)) or planned_all_day.get(sid) or {}).get('reason')
        rows.append({
            'student': users.get(sid, 'Unnamed'),
            'class': classes.get(cid, '—'),
            'status': status or 'not recorded',
            'excused': 'Excused' if (status == 'excused' or has_plan) else 'Unexcused',
            'reason': reason or '',
        })
    for p in planned:  # reported out, no attendance recorded yet
        sid, cid = p['student_user_id'], p.get('class_id')
        if (sid, cid) in covered:
            continue
        rows.append({
            'student': users.get(sid, 'Unnamed'),
            'class': classes.get(cid, 'All day') if cid else 'All day',
            'status': 'reported out',
            'excused': 'Excused',
            'reason': p.get('reason') or '',
        })
    rows.sort(key=lambda r: (r['excused'], r['student'].lower(), r['class'].lower()))
    return rows


def student_history(org_id: str, student_user_id: str) -> Dict[str, Any]:
    records = (
        _admin().table('sis_attendance').select('*')
        .eq('organization_id', org_id).eq('student_user_id', student_user_id)
        .order('date', desc=True).execute()
    ).data or []
    return {'records': records, 'summary': summarize(records)}


def student_day(org_id: str, student_user_id: str, on_date: str) -> Dict[str, Any]:
    """One student's whole day: every class they are enrolled in that meets on
    `on_date`, with the status the roll recorded for each.

    The question a coordinator asks the moment an alert says a student is not
    accounted for is "were they in their other classes?" (iCreate, 2026-09-01).
    A student absent first period and present the next three was on campus and
    the alert is a mismark; absent all day is a phone call home. Answering it by
    opening each class's roster in turn is exactly the work this replaces.

    Classes with no roll taken come back as status None ("not taken") rather
    than being dropped — "no attendance recorded" is a different answer from
    "absent", and collapsing the two is how a student looks accounted for when
    nobody has actually looked.
    """
    from datetime import date as _date

    try:
        dow = (_date.fromisoformat(str(on_date)[:10]).weekday() + 1) % 7  # 0=Sun..6=Sat
    except (TypeError, ValueError):
        return {'error': 'date must be YYYY-MM-DD'}

    admin = _admin()
    student = (
        admin.table('users')
        .select('id, display_name, first_name, last_name, preferred_name, username, email')
        .eq('id', student_user_id).limit(1).execute()
    ).data
    student_name = _student_name(student[0]) if student else 'Unnamed'

    # Bounded by one student's enrollments — no paging needed.
    enr = (
        admin.table('class_enrollments').select('class_id')
        .eq('student_id', student_user_id).eq('status', 'active').execute()
    ).data or []
    class_ids = [e['class_id'] for e in enr]

    classes = {}
    if class_ids:
        classes = {c['id']: c for c in (
            admin.table('org_classes')
            .select('id, name, location, primary_instructor_id')
            .in_('id', class_ids).eq('organization_id', org_id).execute()
        ).data or []}

    meetings = []
    if classes:
        rows = (admin.table('class_meetings').select('*')
                .in_('class_id', list(classes.keys())).execute()).data or []
        meetings = [m for m in rows
                    if m.get('specific_date') == on_date
                    or (m.get('specific_date') is None and m.get('day_of_week') == dow)]

    # What the roll actually says for this student on this date, across every
    # class — including a class that does not appear in the day's meetings, so
    # a recorded status is never hidden by a stale schedule.
    recorded = {r['class_id']: r for r in (
        admin.table('sis_attendance').select('*')
        .eq('organization_id', org_id).eq('student_user_id', student_user_id)
        .eq('date', on_date).execute()
    ).data or []}

    planned = {}
    for p in (admin.table('student_planned_absences').select('*')
              .eq('organization_id', org_id).eq('student_user_id', student_user_id)
              .eq('absence_date', on_date).eq('status', 'active').execute()).data or []:
        # A whole-day report (class_id NULL) covers every class.
        planned[p.get('class_id')] = {'scope': 'day' if p.get('class_id') is None else 'class',
                                      'reason': p.get('reason')}

    teacher_ids = list({c.get('primary_instructor_id') for c in classes.values()
                        if c.get('primary_instructor_id')})
    teachers = {}
    if teacher_ids:
        teachers = {u['id']: _student_name(u) for u in (
            admin.table('users')
            .select('id, display_name, first_name, last_name, preferred_name, username, email')
            .in_('id', teacher_ids).execute()
        ).data or []}

    def _entry(class_id, meeting=None):
        cls = classes.get(class_id) or {}
        rec = recorded.get(class_id) or {}
        cover = planned.get(class_id) or planned.get(None)
        return {
            'class_id': class_id,
            'class_name': cls.get('name') or 'Unknown class',
            'start_time': (meeting or {}).get('start_time'),
            'end_time': (meeting or {}).get('end_time'),
            'location': (meeting or {}).get('location') or cls.get('location'),
            'teacher_name': teachers.get(cls.get('primary_instructor_id')),
            'status': rec.get('status'),  # None = roll not taken for this class
            'notes': rec.get('notes'),
            'planned_absence': cover,
            'scheduled': meeting is not None,
        }

    entries = [_entry(m['class_id'], m) for m in meetings]
    seen = {e['class_id'] for e in entries}
    entries += [_entry(cid) for cid in recorded if cid not in seen]
    entries.sort(key=lambda e: (e.get('start_time') or '99:99', e['class_name'].lower()))

    counts = {s: 0 for s in ATTENDANCE_STATUSES}
    for e in entries:
        if e['status'] in counts:
            counts[e['status']] += 1
    return {
        'student_user_id': student_user_id,
        'student_name': student_name,
        'date': on_date,
        'classes': entries,
        'counts': counts,
        'not_taken': sum(1 for e in entries if e['status'] is None),
    }
