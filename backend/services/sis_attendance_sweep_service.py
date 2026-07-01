"""
SIS attendance sweep — the scheduled job behind start-of-class reminders + gap alerts.

Runs every ~10 min (Render cron -> secured endpoint /api/sis/internal/attendance-sweep).
For each sis_enabled org, in the org's local timezone:
  - reminds a class's advisors to take attendance when a meeting is starting and its
    roster hasn't been recorded yet,
  - alerts org admins + the guardian when a student was present for an earlier class
    but is marked absent for a later one.

Notifications reuse the existing pipeline (sis_notifications -> in-app + push). Gap
alerts are deduped per (student, day, type) via sis_attendance_alerts so a student is
alerted at most once per day even though the sweep runs many times. (The old daily
parent check-in feature was removed; this sweep is attendance-only.)
"""

from datetime import date, datetime
from typing import Dict, List, Any, Optional, Set
from zoneinfo import ZoneInfo

from database import get_supabase_admin_client
from services import sis_attendance_sweep as rules
from services import sis_notifications
from utils.logger import get_logger

logger = get_logger(__name__)

DEFAULT_TZ = 'America/New_York'
DEFAULT_SCHOOL_START_HOUR = 6
DEFAULT_SCHOOL_END_HOUR = 18

# Start-of-class teacher reminders fire once per meeting start: only in the sweep
# window that contains the start time. Sized to the cron cadence (~10 min), so each
# meeting start lands in roughly one sweep — no extra dedupe table needed.
CLASS_REMINDER_WINDOW_MINUTES = 10


def _admin():
    return get_supabase_admin_client()


def _org_row(org_id: str) -> Dict[str, Any]:
    rows = (
        _admin().table('organizations').select('id, timezone, feature_flags')
        .eq('id', org_id).limit(1).execute()
    ).data
    return rows[0] if rows else {}


def org_settings(org_id: str) -> Dict[str, Any]:
    row = _org_row(org_id)
    flags = row.get('feature_flags') or {}
    s = flags.get('sis_settings') or {}
    return {
        'timezone': row.get('timezone') or DEFAULT_TZ,
        'school_start_hour': int(s.get('school_start_hour', DEFAULT_SCHOOL_START_HOUR)),
        'school_end_hour': int(s.get('school_end_hour', DEFAULT_SCHOOL_END_HOUR)),
    }


def _zone(org_id: str) -> ZoneInfo:
    tz = (_org_row(org_id).get('timezone')) or DEFAULT_TZ
    try:
        return ZoneInfo(tz)
    except Exception:
        return ZoneInfo(DEFAULT_TZ)


def org_now(org_id: str) -> datetime:
    return datetime.now(_zone(org_id))


def org_today(org_id: str) -> date:
    return org_now(org_id).date()


def _sis_enabled_org_ids() -> List[str]:
    rows = (
        _admin().table('organizations').select('id, feature_flags').execute()
    ).data or []
    return [r['id'] for r in rows if (r.get('feature_flags') or {}).get('sis_enabled')]


def _org_admins(org_id: str) -> List[str]:
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


def guardians_for_student(student_id: str) -> Set[str]:
    """Resolve a student's guardian user_ids across the family models."""
    ids: Set[str] = set()
    # 1) household guardians (members of the same household who aren't the student)
    try:
        memberships = (
            _admin().table('household_members').select('household_id')
            .eq('user_id', student_id).execute()
        ).data or []
        hh_ids = [m['household_id'] for m in memberships]
        if hh_ids:
            members = (
                _admin().table('household_members')
                .select('user_id, relationship').in_('household_id', hh_ids).execute()
            ).data or []
            for m in members:
                if m['user_id'] != student_id and m.get('relationship') in ('guardian', 'other'):
                    ids.add(m['user_id'])
    except Exception as e:
        logger.warning(f"household guardian lookup failed: {e}")
    # 2) dependent management
    try:
        u = (
            _admin().table('users').select('managed_by_parent_id')
            .eq('id', student_id).limit(1).execute()
        ).data
        if u and u[0].get('managed_by_parent_id'):
            ids.add(u[0]['managed_by_parent_id'])
    except Exception:
        pass
    # 3) active parent-student links
    try:
        links = (
            _admin().table('parent_student_links').select('parent_user_id, status')
            .eq('student_user_id', student_id).eq('status', 'active').execute()
        ).data or []
        for l in links:
            ids.add(l['parent_user_id'])
    except Exception:
        pass
    return ids


def _already_alerted(org_id: str, on_date: str) -> set:
    rows = (
        _admin().table('sis_attendance_alerts').select('student_user_id, alert_type')
        .eq('organization_id', org_id).eq('date', on_date).execute()
    ).data or []
    return {(r['student_user_id'], r['alert_type']) for r in rows}


def _record_alert(org_id: str, student_id: str, on_date: str, alert_type: str,
                  context: Optional[Dict[str, Any]] = None) -> bool:
    """Insert a dedupe row; return False if it already existed (unique violation)."""
    try:
        _admin().table('sis_attendance_alerts').insert({
            'organization_id': org_id, 'student_user_id': student_id,
            'date': on_date, 'alert_type': alert_type, 'context': context,
        }).execute()
        return True
    except Exception:
        return False


def _class_advisor_ids(class_ids: List[str]) -> Dict[str, set]:
    """Active advisors per class (class_advisors.is_active) — keyed by class_id."""
    out: Dict[str, set] = {}
    if not class_ids:
        return out
    rows = (
        _admin().table('class_advisors').select('class_id, advisor_id, is_active')
        .in_('class_id', class_ids).execute()
    ).data or []
    for r in rows:
        if r.get('is_active', True) and r.get('advisor_id'):
            out.setdefault(r['class_id'], set()).add(r['advisor_id'])
    return out


def run_sweep() -> Dict[str, Any]:
    """Process every sis_enabled org. Returns per-org counts."""
    summary = {'orgs': 0, 'gap_alerts': 0, 'class_reminders': 0}
    for org_id in _sis_enabled_org_ids():
        summary['orgs'] += 1
        try:
            counts = _sweep_org(org_id)
            summary['gap_alerts'] += counts['gap_alerts']
            summary['class_reminders'] += counts['class_reminders']
        except Exception as e:
            logger.warning(f"SIS sweep failed for org {org_id}: {e}")
    return summary


def _sweep_org(org_id: str) -> Dict[str, int]:
    counts = {'gap_alerts': 0, 'class_reminders': 0}
    settings = org_settings(org_id)
    now = org_now(org_id)
    today = now.date()
    now_minutes = now.hour * 60 + now.minute

    # only run during the org's school-hours window
    if not (settings['school_start_hour'] * 60 <= now_minutes <= settings['school_end_hour'] * 60):
        return counts

    # enrolled students
    enr = (
        _admin().table('school_enrollments').select('student_user_id')
        .eq('organization_id', org_id).eq('status', 'enrolled').execute()
    ).data or []
    student_ids = [e['student_user_id'] for e in enr]

    # class -> meetings, class -> name, student -> classes (active enrollments)
    classes = (
        _admin().table('org_classes').select('id, name, primary_instructor_id')
        .eq('organization_id', org_id).execute()
    ).data or []
    class_ids = [c['id'] for c in classes]
    class_name = {c['id']: c['name'] for c in classes}
    meetings_by_class: Dict[str, List[Dict[str, Any]]] = {}
    if class_ids:
        for m in (_admin().table('class_meetings').select('*')
                  .in_('class_id', class_ids).execute()).data or []:
            meetings_by_class.setdefault(m['class_id'], []).append(m)
    student_classes: Dict[str, List[str]] = {}
    if class_ids:
        for e in (_admin().table('class_enrollments').select('student_id, class_id, status')
                  .in_('class_id', class_ids).eq('status', 'active').execute()).data or []:
            student_classes.setdefault(e['student_id'], []).append(e['class_id'])

    # per-class attendance recorded today
    attendance = {}  # (student, class) -> status
    for a in (_admin().table('sis_attendance').select('student_user_id, class_id, status')
              .eq('organization_id', org_id).eq('date', today.isoformat()).execute()).data or []:
        attendance[(a['student_user_id'], a['class_id'])] = a['status']

    already = _already_alerted(org_id, today.isoformat())
    org_admin_ids = _org_admins(org_id)

    # 1) attendance-gap alert — present for an earlier class, absent for a later one.
    for sid in student_ids:
        cids = student_classes.get(sid, [])
        if (sid, 'gap_alert') in already:
            continue
        class_attendance = [{
            'class_id': cid,
            'class_name': class_name.get(cid),
            'start_minutes': rules.first_start_minutes_today(meetings_by_class.get(cid, []), today),
            'status': attendance.get((sid, cid)),
        } for cid in cids]
        gap = rules.detect_attendance_gap(class_attendance, now_minutes)
        if gap and _record_alert(org_id, sid, today.isoformat(), 'gap_alert',
                                 context={'missed_class_id': gap['class_id']}):
            msg = f"A student was present earlier but is marked absent for {gap.get('class_name') or 'a later class'}."
            for admin_id in org_admin_ids:
                sis_notifications.notify(admin_id, 'Attendance gap', msg, organization_id=org_id)
            for guardian in guardians_for_student(sid):
                sis_notifications.notify(
                    guardian, 'Missed class',
                    f"Your child is marked absent for {gap.get('class_name') or 'a later class'} today.",
                    organization_id=org_id,
                )
            counts['gap_alerts'] += 1

    # 2) start-of-class reminder for teachers — a class meeting is starting now and
    #    its roster hasn't been taken yet, so ping the class's advisors. Fires in the
    #    single sweep window containing the meeting start.
    taken_classes = {cid for (_sid, cid) in attendance.keys()}
    advisors_by_class = _class_advisor_ids(class_ids)
    primary_by_class = {c['id']: c.get('primary_instructor_id') for c in classes}
    for c in classes:
        cid = c['id']
        if cid in taken_classes:
            continue
        meetings_today = [m for m in meetings_by_class.get(cid, []) if rules.meeting_is_today(m, today)]
        starting_now = any(
            (start is not None and start <= now_minutes < start + CLASS_REMINDER_WINDOW_MINUTES)
            for start in (rules._to_minutes(m.get('start_time')) for m in meetings_today)
        )
        if not starting_now:
            continue
        advisor_ids = set(advisors_by_class.get(cid, set()))
        if primary_by_class.get(cid):
            advisor_ids.add(primary_by_class[cid])
        if not advisor_ids:
            continue
        for advisor_id in advisor_ids:
            sis_notifications.notify(
                advisor_id, 'Take attendance',
                f"{class_name.get(cid) or 'Your class'} is starting — mark today's absences.",
                link='/attendance', organization_id=org_id,
                metadata={'class_id': cid, 'date': today.isoformat()},
            )
        counts['class_reminders'] += 1

    return counts
