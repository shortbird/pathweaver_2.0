"""
SIS attendance sweep — the scheduled job behind check-in reminders + gap alerts.

Runs every ~10 min (Render cron -> secured endpoint). For each sis_enabled org, in
the org's local timezone:
  - reminds guardians who haven't checked their child in by `grace` minutes after
    the day's first class,
  - alerts org admins + the guardian when a student was present for an earlier class
    but is marked absent for a later one.

Notifications reuse the existing pipeline (sis_notifications -> in-app + push).
Alerts are deduped per (student, day, type) via sis_attendance_alerts so a student
is reminded/alerted at most once per day even though the sweep runs many times.
"""

from datetime import date, datetime
from typing import Dict, List, Any, Optional, Callable
from zoneinfo import ZoneInfo

from database import get_supabase_admin_client
from services import sis_attendance_sweep as rules
from services import sis_checkin_service as checkin
from services import sis_notifications
from utils.logger import get_logger

logger = get_logger(__name__)

DEFAULT_TZ = 'America/New_York'
DEFAULT_GRACE_MINUTES = 15
DEFAULT_SCHOOL_START_HOUR = 6
DEFAULT_SCHOOL_END_HOUR = 18


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
        'grace_minutes': int(s.get('checkin_grace_minutes', DEFAULT_GRACE_MINUTES)),
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


def run_sweep() -> Dict[str, Any]:
    """Process every sis_enabled org. Returns per-org counts."""
    summary = {'orgs': 0, 'checkin_reminders': 0, 'gap_alerts': 0}
    for org_id in _sis_enabled_org_ids():
        summary['orgs'] += 1
        try:
            counts = _sweep_org(org_id)
            summary['checkin_reminders'] += counts['checkin_reminders']
            summary['gap_alerts'] += counts['gap_alerts']
        except Exception as e:
            logger.warning(f"SIS sweep failed for org {org_id}: {e}")
    return summary


def _sweep_org(org_id: str) -> Dict[str, int]:
    counts = {'checkin_reminders': 0, 'gap_alerts': 0}
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
    if not student_ids:
        return counts

    # student -> classes (active enrollments), class -> meetings, class -> name
    classes = (
        _admin().table('org_classes').select('id, name')
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

    # today's check-ins + per-class attendance
    checkins = {
        c['student_user_id']: c for c in (
            _admin().table('sis_checkins').select('student_user_id, status')
            .eq('organization_id', org_id).eq('date', today.isoformat()).execute()
        ).data or []
    }
    attendance = {}  # (student, class) -> status
    for a in (_admin().table('sis_attendance').select('student_user_id, class_id, status')
              .eq('organization_id', org_id).eq('date', today.isoformat()).execute()).data or []:
        attendance[(a['student_user_id'], a['class_id'])] = a['status']

    already = _already_alerted(org_id, today.isoformat())
    org_admin_ids = _org_admins(org_id)

    for sid in student_ids:
        cids = student_classes.get(sid, [])
        student_meetings = [m for cid in cids for m in meetings_by_class.get(cid, [])]
        first_start = rules.first_start_minutes_today(student_meetings, today)

        # 1) check-in reminder
        if (sid, 'checkin_reminder') not in already:
            due = rules.checkin_reminder_due(
                now_minutes=now_minutes, first_start_minutes=first_start,
                grace_minutes=settings['grace_minutes'],
                has_checkin_or_absence=sid in checkins,
            )
            if due and _record_alert(org_id, sid, today.isoformat(), 'checkin_reminder'):
                for guardian in checkin.guardians_for_student(sid):
                    sis_notifications.notify(
                        guardian, 'Check-in reminder',
                        'Your child has not been checked in yet today. Tap to check them in.',
                        organization_id=org_id,
                    )
                counts['checkin_reminders'] += 1

        # 2) attendance-gap alert
        if (sid, 'gap_alert') not in already:
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
                for guardian in checkin.guardians_for_student(sid):
                    sis_notifications.notify(
                        guardian, 'Missed class',
                        f"Your child is marked absent for {gap.get('class_name') or 'a later class'} today.",
                        organization_id=org_id,
                    )
                counts['gap_alerts'] += 1

    return counts
