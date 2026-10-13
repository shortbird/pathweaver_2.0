"""
SIS Attendance service — class-level attendance recording + summaries.

Teachers record per-class, per-date status for each enrolled student; parents/admins
read it. The summary math (counts + attendance rate) is a pure function, unit-tested.
Admin-client DB ops elsewhere (SIS tables RLS-locked to backend-only).
"""

from typing import Dict, Iterable, List, Any, Optional, Set

from utils.logger import get_logger
from utils import person_name

logger = get_logger(__name__)

ATTENDANCE_STATUSES = ('present', 'absent', 'late', 'excused')

# ── Attendance settings (organizations.feature_flags.sis_settings.attendance) ─
# Ticket 0680d03c (Apogee Cache Valley): "schoolwide daily attendance for
# teachers" with Present / Absent (a reason box, no "Sick") / Picked Up, the
# pickup time recorded automatically, school days Mon-Thu. Built generic: any
# program with the attendance module can turn these on, and the defaults are
# exactly how every school worked before the setting existed (no daily roll,
# no check-out, all four statuses, Mon-Fri). No migration for the settings:
# they ride the sis_settings blob and PATCH /api/sis/settings.
SETTINGS_KEY = 'attendance'
#: Present and Absent cannot be turned off: a roll without them is not a roll,
#: and the class roll defaults every student to present.
REQUIRED_STATUSES = ('present', 'absent')
DEFAULT_SCHOOL_DAYS = (1, 2, 3, 4, 5)  # ISO weekdays, Monday = 1
DAILY_ROLL_LABEL = 'Daily roll'
NOTE_MAX = 500


def default_attendance_settings() -> Dict[str, Any]:
    return {'daily_roll': False, 'checkout': False,
            'statuses': list(ATTENDANCE_STATUSES),
            'school_days': list(DEFAULT_SCHOOL_DAYS)}


def _clean_statuses(raw: Any) -> Optional[List[str]]:
    if not isinstance(raw, list) or not all(isinstance(s, str) for s in raw):
        return None
    if any(s not in ATTENDANCE_STATUSES for s in raw):
        return None
    if any(s not in raw for s in REQUIRED_STATUSES):
        return None
    return [s for s in ATTENDANCE_STATUSES if s in raw]  # canonical order


def _clean_days(raw: Any) -> Optional[List[int]]:
    if not isinstance(raw, list) or not raw:
        return None
    if not all(isinstance(d, int) and not isinstance(d, bool) and 1 <= d <= 7 for d in raw):
        return None
    return sorted(set(raw))


def parse_attendance_settings(raw: Any) -> Dict[str, Any]:
    """A stored value as settings. Every missing or unreadable key reads as its
    default, so a half-written blob never changes what an untouched school sees."""
    out = default_attendance_settings()
    if not isinstance(raw, dict):
        return out
    for key in ('daily_roll', 'checkout'):
        if isinstance(raw.get(key), bool):
            out[key] = raw[key]
    statuses = _clean_statuses(raw.get('statuses'))
    if statuses:
        out['statuses'] = statuses
    days = _clean_days(raw.get('school_days'))
    if days:
        out['school_days'] = days
    return out


def clean_attendance_settings(raw: Any):
    """A submitted value for the settings PATCH: (cleaned, None) to store, or
    (None, problem) to refuse it whole. None clears the setting (defaults)."""
    if raw is None:
        return None, None
    if not isinstance(raw, dict):
        return None, 'Attendance settings must be an object'
    cleaned: Dict[str, Any] = {}
    for key in ('daily_roll', 'checkout'):
        if key in raw:
            if not isinstance(raw[key], bool):
                return None, f'{key} must be true or false'
            cleaned[key] = raw[key]
    if 'statuses' in raw:
        statuses = _clean_statuses(raw['statuses'])
        if not statuses:
            return None, ('Statuses must be chosen from present, absent, late and '
                          'excused, and must include present and absent')
        cleaned['statuses'] = statuses
    if 'school_days' in raw:
        days = _clean_days(raw['school_days'])
        if not days:
            return None, 'Pick at least one school day'
        cleaned['school_days'] = days
    return cleaned, None


def attendance_settings(org: Any) -> Dict[str, Any]:
    """The org's attendance settings. `org` is an org id or an organizations
    row with its feature_flags."""
    if isinstance(org, dict):
        flags = org.get('feature_flags') or {}
    elif org:
        from modules.enabled import org_flags
        flags = org_flags(org) or {}
    else:
        flags = {}
    sis = flags.get('sis_settings') if isinstance(flags, dict) else None
    return parse_attendance_settings((sis or {}).get(SETTINGS_KEY) if isinstance(sis, dict) else None)


# admin client justified: the SIS console acts for the whole school — this
#   reads/writes rows belonging to every family in the org, which no single
#   caller can see under RLS; the route's role+org gate is the authorization
from utils.admin_client import admin_client as _admin
from services import sis_age


from utils.timestamps import now_iso as _now  # noqa: E402


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
def optional_class_ids(class_ids: Iterable[Optional[str]]) -> Set[str]:
    """Which of these classes take no roll (org_classes.attendance_optional).

    Ticket 29dff954 (iCreate): "Can we have some classes not require
    attendance? Like this would be useful for our At Home days and independent
    study." Every place that chases a missing roll or counts a rate asks this
    one function, so a class is optional everywhere or nowhere. Bounded by the
    ids given, read 100 at a time.
    """
    from repositories.sis_class_repository import SisClassRepository
    return SisClassRepository(client=_admin()).attendance_optional_ids(class_ids)


def without_optional(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """`records` minus the ones for a class that takes no roll. A roll a
    teacher took before the class was made optional stays stored; it just no
    longer counts toward a rate (29dff954)."""
    optional = optional_class_ids(r.get('class_id') for r in records or [])
    if not optional:
        return list(records or [])
    return [r for r in records if r.get('class_id') not in optional]


def _enrolled_students(org_id: str, class_id: str) -> List[Dict[str, Any]]:
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
    age = sis_age.ages_for(org_id)
    out = [{'student_user_id': u['id'], 'name': _student_name(u), 'age': age(u.get('date_of_birth'))}
           for u in users]
    out.sort(key=lambda s: s['name'].lower())
    return out


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

    students = _enrolled_students(org_id, class_id)
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
        # Who took this roll: the class session keeps the FIRST saver, which
        # recorded_by above cannot (every save overwrites it). Best-effort --
        # record_roll swallows its own failures so the roll always saves (P7).
        from services import sis_class_session_service as sessions
        sessions.record_roll(org_id, class_id, on_date, recorded_by)

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
        # A class that takes no roll raises no alarm (29dff954): an absent
        # mark on an at-home day is not a missing student.
        # The roll save must not fail on this read; when in doubt, alert.
        try:
            optional = unaccounted and class_id in optional_class_ids([class_id])
        except Exception as e:  # noqa: BLE001
            logger.error(f'Attendance-optional lookup failed during record(): {e}')
            optional = False
        if optional:
            unaccounted = []

    _record_unaccounted(org_id, class_id, on_date, unaccounted)
    admins_notified = _notify_admins_of_absences(org_id, class_id, on_date, unaccounted)

    # The other direction (05ccd3b9): a teacher who changes an absent mark to
    # late/present/excused may have just accounted for the student. Only a
    # student whose mark in THIS class moved off 'absent' can have changed the
    # day's answer, so nobody else costs a read. auto_resolve_if_accounted
    # still checks every other class that day before it closes anything.
    auto_resolved = 0
    for p in payloads:
        if p['status'] != 'absent' and prior.get(p['student_user_id']) == 'absent':
            try:
                if auto_resolve_if_accounted(org_id, p['student_user_id'], on_date,
                                             AUTO_NOTE_TEACHER):
                    auto_resolved += 1
            except Exception as e:  # noqa: BLE001 — the roll save must not fail here
                logger.warning(f'Alert auto-resolve failed during record(): {e}')

    return {'saved': saved, 'count': len(saved),
            'absences_flagged': len(unaccounted), 'admins_notified': admins_notified,
            'alerts_auto_resolved': auto_resolved}


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


# Notes written on an alert the system closed by itself. resolution is 'other'
# because the CHECK constraint has no 'auto' value (decided 2026-10-12: no
# migration for this), and resolved_by stays NULL — no person decided it.
AUTO_NOTE_TEACHER = 'Teacher changed the mark'
AUTO_NOTE_PARENT = 'Parent reported the absence'
AUTO_NOTE_REASON = 'Staff gave a reason on the daily roll'


def _close_daily_alert(org_id: str, student_user_id: str, on_date: str, note: str) -> bool:
    """Close the student's open 'unaccounted' alert for `on_date`, if any."""
    from repositories.attendance_alert_repository import AttendanceAlertRepository
    repo = AttendanceAlertRepository(client=_admin())
    alert = repo.open_unaccounted(org_id, student_user_id, on_date)
    if not alert:
        return False
    return repo.close_open(alert['id'], {
        'status': 'resolved',
        'resolution': 'other',
        'resolution_note': note,
        'resolved_by': None,
        'resolved_at': _now(),
    })


def auto_resolve_if_accounted(org_id: str, student_user_id: str, on_date: str,
                              note: str, client=None) -> bool:
    """Close the student's open 'unaccounted' alert for `on_date` when nothing
    on the record still says they are missing. Returns True if it closed one.

    Ticket 05ccd3b9 (iCreate, Kate): "some students are showing up as absent
    after a teacher marked them late/present or sometimes a late excuse from a
    parent. If those could automatically resolve when parents or teachers
    change it so I don't have to click on their name to find out, that would
    be great!"

    The alert is per student per DAY, not per class, so the test is the whole
    day: every class where the roll still says 'absent' must be covered —
    either the class takes no roll (29dff954) or a guardian reported the
    absence (a whole-day report covers every class; a class report covers only
    its class). One uncovered absent mark anywhere keeps the alert open.

    The close only matches status='open', so an alert a coordinator already
    resolved is never overwritten. Every read is bounded by one student on one
    date, well under the PostgREST row cap.
    """
    from repositories.attendance_alert_repository import AttendanceAlertRepository
    repo = AttendanceAlertRepository(client=client or _admin())
    alert = repo.open_unaccounted(org_id, student_user_id, on_date)
    if not alert:
        return False

    absent_classes = repo.absent_class_ids(org_id, student_user_id, on_date)
    if absent_classes:
        reported = repo.reported_class_ids(org_id, student_user_id, on_date)
        if None in reported:  # a whole-day report covers every class
            absent_classes = set()
        absent_classes -= reported
    if absent_classes:
        try:
            absent_classes -= optional_class_ids(absent_classes)
        except Exception as e:  # noqa: BLE001 — when in doubt, keep the alert open
            logger.warning(f'auto-resolve: optional-class lookup failed: {e}')
    if absent_classes:
        return False

    return repo.close_open(alert['id'], {
        'status': 'resolved',
        'resolution': 'other',
        'resolution_note': note,
        'resolved_by': None,
        'resolved_at': _now(),
    })


def open_alerts(org_id: str, on_date: Optional[str] = None) -> List[Dict[str, Any]]:
    """Open student-accountability alerts, hydrated with student + class names."""
    q = (_admin().table('sis_attendance_alerts').select('*')
         .eq('organization_id', org_id).eq('alert_type', 'unaccounted')
         .eq('status', 'open').order('created_at', desc=True))
    if on_date:
        q = q.eq('date', on_date)
    rows = q.execute().data or []
    # Alerts raised in a class before it stopped taking roll (29dff954).
    optional = optional_class_ids(r.get('class_id') for r in rows)
    rows = [r for r in rows if r.get('class_id') not in optional]
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
    elif corrected_to:
        # An alert the daily roll raised has no class (ticket 0680d03c): the
        # correction lands on the student's daily row for that date. Bounded
        # to the org, so an alert can only ever correct its own school's roll.
        _daily_repo().correct_status(org_id, alert['student_user_id'], alert['date'],
                                     {'status': corrected_to, 'note': None,
                                      'updated_at': _now()})

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

    # class_id None is the daily roll (ticket 0680d03c): there is no class to
    # name, and the place to act on it is the daily roll page.
    if class_id:
        cls = (
            _admin().table('org_classes').select('name').eq('id', class_id).limit(1).execute()
        ).data
        class_name = (cls[0].get('name') if cls else None) or 'a class'
        where, link = f'in {class_name}', '/classes?tab=attendance'
    else:
        where, link = 'on the daily roll', '/attendance'

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
            f"{who} marked absent {where} on {on_date} with no guardian report.",
            # The attendance page is the thing to act on; '/' just reloaded a
            # dashboard (iCreate, 2026-08-26).
            link=link,
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
    # A class that takes no roll has nobody missing from it (29dff954). A
    # guardian's whole-day report has no class and still shows.
    optional = optional_class_ids([r.get('class_id') for r in records]
                                  + [p.get('class_id') for p in planned])
    records = [r for r in records if r.get('class_id') not in optional]
    planned = [p for p in planned if not p.get('class_id') or p['class_id'] not in optional]

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
        # A daily-roll row has no class (ticket 0680d03c); the reason the
        # staff typed on it is the reason when no guardian gave one.
        if not cid and not reason:
            reason = r.get('note')
        rows.append({
            'student': users.get(sid, 'Unnamed'),
            'class': classes.get(cid, '—') if cid else DAILY_ROLL_LABEL,
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


def student_history(org_id: str, student_user_id: str,
                    class_id: Optional[str] = None) -> Dict[str, Any]:
    """Every attendance record for one student, newest first.

    Paged. A student with six classes meeting most days passes 1000 rows inside
    a school year, and PostgREST truncates at exactly that with nothing in the
    response to say it did -- so the attendance RATE would have quietly started
    describing only the most recent part of the year, at a school large enough
    or a year long enough for it to matter. There is no visible symptom; the
    number just becomes wrong.

    `class_id` narrows it to one class, which is what a per-class view asks for.
    """
    from utils.db_fetch import fetch_all_rows

    def _query():
        q = (_admin().table('sis_attendance').select('*')
             .eq('organization_id', org_id).eq('student_user_id', student_user_id))
        if class_id:
            q = q.eq('class_id', class_id)
        return q.order('date', desc=True)

    records = fetch_all_rows(_query)
    # The records stay listed; a class that takes no roll does not count
    # toward the rate (29dff954).
    return {'records': records, 'summary': summarize(without_optional(records))}


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
            .select('id, name, location, primary_instructor_id, attendance_optional')
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
    # The daily-roll mark (class_id NULL, ticket 0680d03c) is the day, not a
    # class: it answers on its own key rather than as an "Unknown class" row.
    daily_rec = recorded.pop(None, None)

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
            # The column is `note`. This read `notes` and so came back empty
            # for every class, whatever the teacher wrote (P7).
            'notes': rec.get('note'),
            'planned_absence': cover,
            'scheduled': meeting is not None,
            # No roll is taken in this class (29dff954): a None status here
            # is not a gap anybody has to close.
            'attendance_optional': bool(cls.get('attendance_optional')),
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
        'daily': ({'status': daily_rec.get('status'), 'note': daily_rec.get('note'),
                   'arrived_at': daily_rec.get('arrived_at'),
                   'departed_at': daily_rec.get('departed_at')}
                  if daily_rec else None),
        'counts': counts,
        'not_taken': sum(1 for e in entries
                         if e['status'] is None and not e['attendance_optional']),
    }


# ── Daily roll (class_id NULL) ───────────────────────────────────────────────
# Ticket 0680d03c (Apogee Cache Valley): one whole-school roll a day, for a
# school that does not run classes in Optio. Same table as the class roll: a
# row with class_id NULL is the student's daily mark for that date, unique per
# student per date (UNIQUE NULLS NOT DISTINCT, migration 20261013233000). Only
# reachable when sis_settings.attendance.daily_roll is on; record() and every
# class path above never write or read a NULL-class row.
#
# Present or late stamps arrived_at the first time; "Picked up" is departed_at
# on a present or late row (checkout_daily); absent or excused clears both.
_ARRIVED = ('present', 'late')


def _daily_repo():
    from repositories.sis_daily_roll_repository import SisDailyRollRepository
    return SisDailyRollRepository(client=_admin())


def daily_roster(org_id: str) -> List[Dict[str, Any]]:
    """The school's current students, the rule the People and Students pages
    follow (sis_service.current_students: org students, withdrawn and graduated
    left out). Not school_enrollments 'enrolled' alone: a school that never
    used registration (Apogee) has no enrollment rows at all."""
    from services import sis_service
    users = sis_service.current_students(org_id)
    age = sis_age.ages_for(org_id)
    out = [{'student_user_id': u['id'], 'name': _student_name(u),
            'age': age(u.get('date_of_birth'))} for u in users]
    out.sort(key=lambda s: s['name'].lower())
    return out


def _daily_rows(org_id: str, on_date: str) -> Dict[str, Dict[str, Any]]:
    """The day's daily-roll rows by student. Paged: one row per student in the
    school, which passes the PostgREST cap at a big enough school."""
    return _daily_repo().rows_for_day(org_id, on_date)


def _daily_entry(student: Dict[str, Any], rec: Optional[Dict[str, Any]],
                 planned: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    rec = rec or {}
    return {
        **student,
        'status': rec.get('status'),
        'note': rec.get('note'),
        'arrived_at': rec.get('arrived_at'),
        'departed_at': rec.get('departed_at'),
        'planned_absence': planned,
    }


def get_daily(org_id: str, on_date: str) -> List[Dict[str, Any]]:
    """Every current student with their daily mark for the date (status None =
    not marked yet), arrival and pickup times, and a guardian's whole-day
    report when there is one (the same annotation get_for_date gives a class)."""
    from services import sis_planned_absence_service as planned
    students = daily_roster(org_id)
    rows = _daily_rows(org_id, on_date)
    reported = planned.for_whole_day(org_id, on_date)
    return [_daily_entry(s, rows.get(s['student_user_id']), reported.get(s['student_user_id']))
            for s in students]


def _clean_note(raw: Any) -> Optional[str]:
    if not isinstance(raw, str):
        return None
    return raw.strip()[:NOTE_MAX] or None


def record_daily(org_id: str, on_date: str, entries: List[Dict[str, Any]],
                 recorded_by: str, statuses: Optional[Iterable[str]] = None) -> Dict[str, Any]:
    """Upsert daily-roll marks for a set of students on a date.

    Only the school's current students are written (anyone else is listed in
    `refused`), and only the org's statuses (`statuses`, default all four).
    The accountability rule is the class roll's: a student newly marked absent
    with no whole-day guardian report raises the 'unaccounted' alert and tells
    the office; moving off absent closes it when nothing else says missing.
    """
    allowed = set(statuses or ATTENDANCE_STATUSES)
    roster_ids = {s['student_user_id'] for s in daily_roster(org_id)}
    prior = _daily_rows(org_id, on_date)

    now = _now()
    payloads, refused, seen = [], [], set()
    for e in entries or []:
        status = e.get('status')
        sid = e.get('student_user_id')
        if status not in ATTENDANCE_STATUSES or status not in allowed or not sid or sid in seen:
            continue
        seen.add(sid)
        if sid not in roster_ids:
            refused.append(sid)
            continue
        before = prior.get(sid) or {}
        was_here = before.get('status') in _ARRIVED
        if status in _ARRIVED:
            arrived = (before.get('arrived_at') if was_here else None) or now
            departed = before.get('departed_at') if was_here else None
            departed_by = before.get('departed_by') if was_here else None
        else:
            arrived = departed = departed_by = None
        payloads.append({
            'organization_id': org_id,
            'class_id': None,
            'student_user_id': sid,
            'date': on_date,
            'status': status,
            'note': _clean_note(e.get('note')),
            'arrived_at': arrived,
            'departed_at': departed,
            'departed_by': departed_by,
            'recorded_by': recorded_by,
            'updated_at': now,
        })

    saved = []
    if payloads:
        saved = _daily_repo().upsert(payloads)

    newly_absent = [p['student_user_id'] for p in payloads
                    if p['status'] == 'absent'
                    and (prior.get(p['student_user_id']) or {}).get('status') != 'absent']
    # A reason typed by staff means the school knows where the child is, so it
    # accounts for the absence the way a guardian report does. Apogee (ticket
    # 0680d03c) asked for "a comment box on Absent ... to note the reason"
    # instead of a Sick status; alerting every admin about a child the coach
    # just explained would be noise.
    explained = {p['student_user_id'] for p in payloads
                 if p['status'] == 'absent' and p['note']}
    unaccounted = []
    if newly_absent:
        from services import sis_planned_absence_service as planned
        try:
            covered = planned.for_whole_day(org_id, on_date)
        except Exception as e:  # noqa: BLE001 — the save must not fail here;
            # and when in doubt, a false alert beats a missed student.
            logger.error(f'Planned-absence lookup failed during record_daily(): {e}')
            covered = {}
        unaccounted = [sid for sid in newly_absent if sid not in covered
                       and sid not in explained]
    _record_unaccounted(org_id, None, on_date, unaccounted)
    admins_notified = _notify_admins_of_absences(org_id, None, on_date, unaccounted)

    auto_resolved = 0
    for p in payloads:
        before = prior.get(p['student_user_id']) or {}
        if p['status'] == 'absent' and p['note'] and before.get('status') == 'absent' \
                and not before.get('note'):
            # The coach tapped Absent first and typed the reason after.
            try:
                if _close_daily_alert(org_id, p['student_user_id'], on_date, AUTO_NOTE_REASON):
                    auto_resolved += 1
            except Exception as e:  # noqa: BLE001 — the save must not fail here
                logger.warning(f'Alert close on reason failed during record_daily(): {e}')
        if p['status'] != 'absent' and before.get('status') == 'absent':
            try:
                if auto_resolve_if_accounted(org_id, p['student_user_id'], on_date,
                                             AUTO_NOTE_TEACHER):
                    auto_resolved += 1
            except Exception as e:  # noqa: BLE001 — the save must not fail here
                logger.warning(f'Alert auto-resolve failed during record_daily(): {e}')

    return {'saved': saved, 'count': len(saved), 'refused': refused,
            'absences_flagged': len(unaccounted), 'admins_notified': admins_notified,
            'alerts_auto_resolved': auto_resolved}


def _daily_row(org_id: str, on_date: str, student_user_id: str) -> Optional[Dict[str, Any]]:
    return _daily_repo().row(org_id, on_date, student_user_id)


def checkout_daily(org_id: str, on_date: str, student_user_id: str,
                   actor_id: str) -> Dict[str, Any]:
    """Record that a student was picked up: departed_at = now, departed_by =
    who tapped it. Only on a present or late row (a student who never arrived
    cannot be picked up). Tapping it twice keeps the first time."""
    rec = _daily_row(org_id, on_date, student_user_id)
    if not rec or rec.get('status') not in _ARRIVED:
        return {'error': 'Mark the student present before they are picked up', 'status': 400}
    if rec.get('departed_at'):
        return {'record': rec}
    fields = {'departed_at': _now(), 'departed_by': actor_id,
              'recorded_by': actor_id, 'updated_at': _now()}
    updated = _daily_repo().update_row(rec['id'], fields)
    return {'record': updated or {**rec, **fields}}


def undo_checkout_daily(org_id: str, on_date: str, student_user_id: str,
                        actor_id: str) -> Dict[str, Any]:
    """Take a pickup back (tapped on the wrong student): clears the time and
    who recorded it. The present mark and its arrival time stay."""
    rec = _daily_row(org_id, on_date, student_user_id)
    if not rec:
        return {'error': 'No daily roll mark for this student on this date', 'status': 404}
    fields = {'departed_at': None, 'departed_by': None,
              'recorded_by': actor_id, 'updated_at': _now()}
    updated = _daily_repo().update_row(rec['id'], fields)
    return {'record': updated or {**rec, **fields}}
