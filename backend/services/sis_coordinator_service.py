"""
The campus coordinator's dashboard — the operational morning view from the
iCreate requirements (2026-08-09): today's campus schedule, the student
accountability board, the coordinator's own schedule, their assigned tasks,
and role-aware quick links.

Assembled almost entirely from systems that already existed; the only new
machinery is the accountability workflow in sis_attendance_service. Org-wide
by design — there is no campus entity yet (see the gap analysis), so "the
campus" currently means "the organization".
"""

from typing import Any, Dict, List, Optional

from services import sis_service
from services import sis_attendance_service as attendance
from services import sis_class_session_service as sessions
from services.sis_staff_service import (
    _org_now, list_assignments, pinned_links_for, staff_resources_for,
)
from utils.logger import get_logger

logger = get_logger(__name__)


# admin client justified: the SIS console acts for the whole school — this
#   reads/writes rows belonging to every family in the org, which no single
#   caller can see under RLS; the route's role+org gate is the authorization
from utils.admin_client import admin_client as _admin


def _display_name(u: Dict[str, Any]) -> str:
    return (u.get('display_name')
            or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
            or u.get('username') or u.get('email') or 'Unnamed')


# ── Pure helpers (unit-tested) ───────────────────────────────────────────────

def filter_quick_links(links: Any, held_roles: List[str]) -> List[Dict[str, Any]]:
    """Quick links the caller should see. A link with no roles list is for
    everyone; otherwise the caller must hold one of them. Malformed entries
    (settings are hand-edited jsonb) are dropped rather than rendered broken."""
    held = set(held_roles or [])
    out = []
    for link in (links or []):
        if not isinstance(link, dict) or not link.get('label') or not link.get('url'):
            continue
        roles = link.get('roles') or []
        if roles and not (held & set(roles)) and 'superadmin' not in held:
            continue
        out.append({'label': link['label'], 'url': link['url'],
                    'roles': roles or None})
    return out


def board_from(records: List[Dict[str, Any]], reported_out: int,
               open_alerts: List[Dict[str, Any]]) -> Dict[str, Any]:
    """The day's attendance board: recorded counts + guardian reports + open
    accountability alerts."""
    recorded = {'present': 0, 'absent': 0, 'late': 0, 'excused': 0}
    for r in records or []:
        st = r.get('status')
        if st in recorded:
            recorded[st] += 1
    return {
        'recorded': recorded,
        'total_recorded': sum(recorded.values()),
        'reported_out': reported_out,
        'open_alert_count': len(open_alerts or []),
    }


# ── DB-backed assembly ───────────────────────────────────────────────────────

def today_schedule(org_id: str, today: str, dow: Optional[int] = None,
                   class_scope=None) -> List[Dict[str, Any]]:
    """Every class meeting happening on `today` (YYYY-MM-DD), org-wide, with
    teacher names and enrollment counts — the answer to "what is happening on
    campus right now". The one assembler: the admin and coordinator dashboards
    both read it (M12, docs/sis/CONSOLIDATION_PLAN.md).

    `dow` is the day of week to match recurring meetings on; derived from
    `today` when not given (callers that already know the org's local weekday
    pass it, because the org's clock and the server's can disagree at
    midnight). `class_scope`, when given, is the set of class ids to keep —
    a teacher's classes, from sis_service.class_scope().
    """
    from services.sis_staff_service import _enrolled_counts

    if dow is None:
        from datetime import date as _date
        dow = _date.fromisoformat(today).weekday()
        dow = (dow + 1) % 7  # class_meetings.day_of_week is Sunday-based
    classes = (_admin().table('org_classes')
               .select('id, name, location, primary_instructor_id')
               .eq('organization_id', org_id).execute()).data or []
    if class_scope is not None:
        allowed = set(class_scope)
        classes = [c for c in classes if c['id'] in allowed]
    by_id = {c['id']: c for c in classes}
    if not by_id:
        return []
    meetings = (_admin().table('class_meetings').select('*')
                .in_('class_id', list(by_id.keys())).execute()).data or []
    todays = [m for m in meetings
              if m.get('specific_date') == today
              or (m.get('specific_date') is None and m.get('day_of_week') == dow)]
    if not todays:
        return []

    class_ids = list({m['class_id'] for m in todays})
    counts = _enrolled_counts(class_ids)
    teacher_ids = list({by_id[cid].get('primary_instructor_id')
                        for cid in class_ids if by_id[cid].get('primary_instructor_id')})
    teachers = {}
    if teacher_ids:
        teachers = {u['id']: _display_name(u) for u in (
            _admin().table('users')
            .select('id, display_name, first_name, last_name, username, email, preferred_name')
            .in_('id', teacher_ids).execute()
        ).data or []}

    out = []
    for m in todays:
        cls = by_id.get(m['class_id']) or {}
        out.append({
            'class_id': m['class_id'],
            'class_name': cls.get('name'),
            'start_time': m.get('start_time'),
            'end_time': m.get('end_time'),
            'location': m.get('location') or cls.get('location'),
            'teacher_name': teachers.get(cls.get('primary_instructor_id')),
            'enrolled_count': counts.get(m['class_id'], 0),
        })
    out.sort(key=lambda i: (i.get('start_time') or '99:99', i.get('class_name') or ''))
    return out


def _my_schedule(org_id: str, user_id: str, dow_staff: int,
                 today: str) -> Dict[str, Any]:
    """The coordinator's own duties: today's, plus upcoming one-offs. Note
    sis_staff_assignments uses Python weekday convention via list_assignments'
    stored day_of_week (0=Sun..6=Sat, same as class_meetings)."""
    duties = list_assignments(org_id, user_id)
    todays = [d for d in duties
              if d.get('specific_date') == today
              or (d.get('specific_date') is None and d.get('day_of_week') == dow_staff)]
    upcoming = sorted([d for d in duties
                       if d.get('specific_date') and d['specific_date'] > today],
                      key=lambda d: d['specific_date'])[:5]
    todays.sort(key=lambda d: d.get('start_time') or '99:99')
    return {'today': todays, 'upcoming': upcoming}


def _my_open_tasks(org_id: str, user_id: str) -> List[Dict[str, Any]]:
    """The coordinator's own open tasks, the same list My tasks shows."""
    from services import sis_tasks_service
    return sis_tasks_service.open_tasks_for(org_id, user_id)


def get_dashboard(org_id: str, user_id: str) -> Dict[str, Any]:
    now = _org_now(org_id)
    today = now.date().isoformat()
    dow = (now.weekday() + 1) % 7  # 0=Sun..6=Sat, the class_meetings convention

    records = (_admin().table('sis_attendance')
               .select('student_user_id, status')
               .eq('organization_id', org_id).eq('date', today).execute()).data or []
    planned = (_admin().table('student_planned_absences')
               .select('id', count='exact')
               .eq('organization_id', org_id).eq('absence_date', today)
               .eq('status', 'active').execute())
    alerts = attendance.open_alerts(org_id)

    org_row = (_admin().table('organizations').select('name, feature_flags')
               .eq('id', org_id).limit(1).execute()).data or []
    settings = ((org_row[0].get('feature_flags') or {}) if org_row else {}) \
        .get('sis_settings') or {}
    held_roles = sis_service.caller_org_roles(user_id)

    staff_resources = staff_resources_for(user_id, org_id)
    # The same pinned links the teacher dashboard leads with. A coordinator had
    # no Links section at all, so a link pinned and ticked "Coordinators" was
    # saved and then shown to nobody (iCreate, 2026-09-01).
    pinned_links = pinned_links_for(user_id, org_id)

    # Who took each class's roll, on its Today's schedule row, and the
    # "Teachers to check" section built from the same day (P7, iCreate
    # 2026-09-23).
    schedule = today_schedule(org_id, today, dow=dow)
    day_sessions = sessions.sessions_by_class(org_id, today)
    sessions.annotate_schedule(schedule, day_sessions)

    return {
        'organization': {'id': org_id,
                         'name': org_row[0].get('name') if org_row else None},
        'date': today,
        'today_schedule': schedule,
        'teachers_to_check': sessions.teachers_to_check(
            org_id, now, schedule, settings, day_sessions),
        'attendance': {
            **board_from(records, planned.count or 0, alerts),
            'open_alerts': alerts,
            'resolutions': list(attendance.ALERT_RESOLUTIONS),
        },
        'my_schedule': _my_schedule(org_id, user_id, dow, today),
        'my_tasks': _my_open_tasks(org_id, user_id),
        'quick_links': filter_quick_links(settings.get('quick_links'), held_roles),
        'staff_resources': staff_resources,
        'pinned_links': pinned_links,
    }
