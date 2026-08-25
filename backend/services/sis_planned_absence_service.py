"""
SIS planned-absence service — parent-reported absences (iCreate).

Guardians report a student will be out for a whole day (class_id is None) or from a
specific scheduled class (class_id set), on today or a future date. This is distinct
from teacher-recorded sis_attendance (the actual roster). Staff see these on the
attendance roster; the org admin team is notified when one is reported.

Raw, org-scoped DB ops with NO authorization — guardian authz lives in
sis_parent_service (mirrors how catalog/registration services are wrapped). Admin
client throughout (SIS tables are RLS-locked to backend-only).
"""

from datetime import datetime, timedelta, timezone, date as _date
from typing import Dict, List, Any, Optional

# A report can cover an inclusive date range; cap it so a typo'd year doesn't
# insert thousands of rows (and thousands of admin notifications).
MAX_SPAN_DAYS = 31

from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.validation.sanitizers import pgrst_uuid
from utils import person_name

logger = get_logger(__name__)


def _admin():
    return get_supabase_admin_client()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _today() -> _date:
    return datetime.now(timezone.utc).date()


def _student_name(u: Dict[str, Any]) -> str:
    """Delegates to utils.person_name.full_name — one rule for the whole SIS.
    Ten copies of this function with two different fallback orders is half of
    why names differed screen to screen (iCreate, 2026-08-25)."""
    return person_name.full_name(u, 'Unnamed')


def _org_admin_ids(org_id: str) -> List[str]:
    """The front-office team absence reports go to: org_admins AND campus
    coordinators.

    Coordinators run attendance day to day — matching only 'org_admin' here
    meant a school whose front desk is a coordinator (iCreate's Kate) never
    heard about a guardian-reported absence. Scoped deliberately: this helper
    is used only by this module's absence notifications, so widening it widens
    nothing else (sis_attendance_service and routes/sis/goals.py keep their own
    helpers).

    Paged: this reads every user in the org, which grows past the PostgREST cap
    as families join — and a truncated read is an admin who silently stops
    being notified.
    """
    from utils.db_fetch import fetch_all_rows
    from utils.sis_roles import CAMPUS_COORDINATOR

    rows = fetch_all_rows(lambda: (
        _admin().table('users').select('id, org_role, org_roles')
        .eq('organization_id', org_id)))
    wanted = {'org_admin', CAMPUS_COORDINATOR}
    admins = []
    for u in rows:
        roles = set()
        if u.get('org_role'):
            roles.add(u['org_role'])
        if isinstance(u.get('org_roles'), list):
            roles.update(u['org_roles'])
        if roles & wanted:
            admins.append(u['id'])
    return admins


# ── Staff read: planned absences for a class on a date ───────────────────────
def for_class_date(org_id: str, class_id: str, on_date: str) -> Dict[str, Dict[str, Any]]:
    """Active planned absences that apply to this class on this date, keyed by student.

    A whole-day report (class_id NULL) and a report for exactly this class both apply.
    """
    rows = (
        _admin().table('student_planned_absences').select('*')
        .eq('organization_id', org_id).eq('absence_date', on_date).eq('status', 'active')
        .or_(f'class_id.eq.{pgrst_uuid(class_id, "class_id")},class_id.is.null')
        .execute()
    ).data or []
    out: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        sid = r['student_user_id']
        # A whole-day report takes precedence over a class-specific one for display.
        if sid not in out or r.get('class_id') is None:
            out[sid] = {
                'scope': 'day' if r.get('class_id') is None else 'class',
                'reason': r.get('reason'),
                'id': r['id'],
            }
    return out


# ── Staff read: every upcoming absence, org-wide ─────────────────────────────
def list_upcoming(org_id: str) -> List[Dict[str, Any]]:
    """Active guardian-reported absences from today forward, soonest first,
    with student and class names hydrated.

    The 'Absence reported' notification links to /attendance, but the roster
    there only shows an absence after the right class AND the right date are
    picked — for a future-dated report that page answered nothing (iCreate,
    2026-08-24: "where does that show up on Optio?"). This is the list that
    page shows up front.
    """
    from utils.db_fetch import fetch_all_rows
    rows = fetch_all_rows(lambda: (
        _admin().table('student_planned_absences').select('*')
        .eq('organization_id', org_id).eq('status', 'active')
        .gte('absence_date', _today().isoformat())
        .order('absence_date')
    ))
    student_ids = list({r['student_user_id'] for r in rows})
    class_ids = list({r['class_id'] for r in rows if r.get('class_id')})
    students = {}
    if student_ids:
        students = {
            u['id']: _student_name(u) for u in (
                _admin().table('users')
                .select('id, preferred_name, first_name, last_name, display_name, username, email')
                .in_('id', student_ids).execute()
            ).data or []
        }
    classes = {}
    if class_ids:
        classes = {
            c['id']: c.get('name') for c in (
                _admin().table('org_classes').select('id, name')
                .in_('id', class_ids).execute()
            ).data or []
        }
    return [{
        'id': r['id'],
        'student_user_id': r['student_user_id'],
        'student_name': students.get(r['student_user_id'], 'Unnamed'),
        'absence_date': r['absence_date'],
        'class_id': r.get('class_id'),
        'class_name': classes.get(r['class_id']) if r.get('class_id') else None,
        'reason': r.get('reason'),
    } for r in rows]


# ── Reads for a single student ────────────────────────────────────────────────
def list_for_student(org_id: str, student_user_id: str,
                     upcoming_only: bool = True) -> List[Dict[str, Any]]:
    """A student's active planned absences (class name hydrated), soonest first."""
    q = (
        _admin().table('student_planned_absences').select('*')
        .eq('organization_id', org_id).eq('student_user_id', student_user_id)
        .eq('status', 'active')
    )
    if upcoming_only:
        q = q.gte('absence_date', _today().isoformat())
    rows = q.order('absence_date').execute().data or []
    class_ids = [r['class_id'] for r in rows if r.get('class_id')]
    names = {}
    if class_ids:
        names = {
            c['id']: c.get('name') for c in (
                _admin().table('org_classes').select('id, name')
                .in_('id', class_ids).execute()
            ).data or []
        }
    for r in rows:
        r['class_name'] = names.get(r['class_id']) if r.get('class_id') else None
    return rows


def student_scheduled_classes(org_id: str, student_user_id: str) -> List[Dict[str, Any]]:
    """Active enrolled classes for a student (+ meeting days) so the UI can pick one."""
    enr = (
        _admin().table('class_enrollments').select('class_id')
        .eq('student_id', student_user_id).eq('status', 'active').execute()
    ).data or []
    class_ids = [e['class_id'] for e in enr]
    if not class_ids:
        return []
    classes = (
        _admin().table('org_classes').select('id, name, organization_id')
        .in_('id', class_ids).eq('organization_id', org_id).execute()
    ).data or []
    meetings_by_class: Dict[str, List[Dict[str, Any]]] = {}
    for m in (_admin().table('class_meetings').select('class_id, day_of_week, start_time, end_time')
              .in_('class_id', [c['id'] for c in classes]).execute()).data or []:
        meetings_by_class.setdefault(m['class_id'], []).append(m)
    return [{
        'class_id': c['id'],
        'name': c.get('name'),
        'meetings': meetings_by_class.get(c['id'], []),
    } for c in classes]


# ── Writes ────────────────────────────────────────────────────────────────────
def get(absence_id: str) -> Optional[Dict[str, Any]]:
    rows = (
        _admin().table('student_planned_absences').select('*')
        .eq('id', absence_id).limit(1).execute()
    ).data
    return rows[0] if rows else None


def get_many(absence_ids: List[str]) -> List[Dict[str, Any]]:
    if not absence_ids:
        return []
    return (
        _admin().table('student_planned_absences').select('*')
        .in_('id', absence_ids).execute()
    ).data or []


def _parse_span(absence_date: str, end_date: Optional[str]):
    """Validate a single date or inclusive range. Returns (start, end, error)."""
    try:
        start = _date.fromisoformat(absence_date)
    except (TypeError, ValueError):
        return None, None, 'absence_date must be YYYY-MM-DD'
    if end_date:
        try:
            end = _date.fromisoformat(end_date)
        except (TypeError, ValueError):
            return None, None, 'end_date must be YYYY-MM-DD'
    else:
        end = start
    if start < _today():
        return None, None, 'absence_date cannot be in the past'
    if end < start:
        return None, None, 'end_date cannot be before absence_date'
    if (end - start).days + 1 > MAX_SPAN_DAYS:
        return None, None, f'Absences can cover at most {MAX_SPAN_DAYS} days at a time'
    return start, end, None


def create(org_id: str, student_user_id: str, reported_by: str, absence_date: str,
           class_id: Optional[str] = None, reason: Optional[str] = None,
           end_date: Optional[str] = None) -> Dict[str, Any]:
    """Report a planned absence for one date or an inclusive date range
    (end_date). Dates must be today or later; class (if given) must belong to
    the org. One row is written per day — the roster reads stay per-date — but
    the admin team gets ONE notification covering the span, not one per day.
    A day already reported is skipped, not fatal. Returns {'absence': first
    row, 'absences': rows, 'skipped_dates': [...]} or {'error': msg}."""
    start, end, err = _parse_span(absence_date, end_date)
    if err:
        return {'error': err}

    if class_id:
        cls = (
            _admin().table('org_classes').select('id, organization_id')
            .eq('id', class_id).limit(1).execute()
        ).data
        if not cls or cls[0].get('organization_id') != org_id:
            return {'error': 'Class not found'}

    created: List[Dict[str, Any]] = []
    skipped: List[str] = []
    day = start
    while day <= end:
        payload = {
            'organization_id': org_id,
            'student_user_id': student_user_id,
            'class_id': class_id,
            'absence_date': day.isoformat(),
            'reason': (reason or '').strip() or None,
            'reported_by': reported_by,
            'status': 'active',
            'updated_at': _now(),
        }
        try:
            resp = _admin().table('student_planned_absences').insert(payload).execute()
            if resp.data:
                created.append(resp.data[0])
        except Exception as e:
            # Unique partial index → a matching active report already exists.
            logger.info(f"planned absence insert rejected (likely duplicate): {e}")
            skipped.append(day.isoformat())
        day += timedelta(days=1)
    if not created:
        return {'error': 'This absence has already been reported'}
    _notify_admins_of_report(org_id, student_user_id, start.isoformat(), class_id,
                             end_date=end.isoformat() if end != start else None)
    return {'absence': created[0], 'absences': created, 'skipped_dates': skipped}


def cancel(absence_id: str, org_id: str) -> bool:
    # `status = active` makes the cancel idempotent for notifications: only the
    # transition out of 'active' matches, so a repeated DELETE updates nothing
    # and the admin team is not told about the same cancellation twice.
    resp = (
        _admin().table('student_planned_absences')
        .update({'status': 'cancelled', 'updated_at': _now()})
        .eq('id', absence_id).eq('organization_id', org_id)
        .eq('status', 'active').execute()
    )
    row = resp.data[0] if resp.data else None
    if row:
        # An admin who read "out on Friday" and never hears otherwise plans
        # around an absence that is no longer happening.
        _notify_admins_of_cancellation(
            org_id, row.get('student_user_id'), row.get('absence_date'),
            row.get('class_id'))
    return bool(resp.data)


def cancel_many(absence_ids: List[str], org_id: str) -> int:
    """Cancel several of one student's reports at once — the UI shows a
    reported date range as one row, and cancelling it must be one office
    notification (covering the span), not one per day. Same active-only filter
    as cancel(), so repeats are quiet. Returns how many rows were cancelled."""
    if not absence_ids:
        return 0
    resp = (
        _admin().table('student_planned_absences')
        .update({'status': 'cancelled', 'updated_at': _now()})
        .in_('id', absence_ids).eq('organization_id', org_id)
        .eq('status', 'active').execute()
    )
    rows = resp.data or []
    if rows:
        dates = sorted(r['absence_date'] for r in rows)
        _notify_admins_of_cancellation(
            org_id, rows[0].get('student_user_id'), dates[0],
            rows[0].get('class_id'),
            end_date=dates[-1] if dates[-1] != dates[0] else None)
    return len(rows)


def _notify_admins_of_report(org_id: str, student_user_id: str, absence_date: str,
                             class_id: Optional[str],
                             end_date: Optional[str] = None) -> None:
    """Tell the org admin team a guardian reported a planned absence. Best-effort."""
    _notify_admin_team(
        org_id, student_user_id, absence_date, class_id,
        title='Absence reported',
        template='A guardian reported {name} will be out of {scope} {when}.',
        end_date=end_date,
    )


def _notify_admins_of_cancellation(org_id: str, student_user_id: str,
                                   absence_date: str,
                                   class_id: Optional[str],
                                   end_date: Optional[str] = None) -> None:
    """Tell the same admin team the report was cancelled. Best-effort."""
    _notify_admin_team(
        org_id, student_user_id, absence_date, class_id,
        title='Absence report cancelled',
        template="A guardian cancelled {name}'s absence report for {scope} "
                 '{when} — they are expected after all.',
        extra_metadata={'cancelled': True},
        end_date=end_date,
    )


def _notify_admin_team(org_id: str, student_user_id: str, absence_date: str,
                       class_id: Optional[str], title: str, template: str,
                       extra_metadata: Optional[Dict[str, Any]] = None,
                       end_date: Optional[str] = None) -> None:
    """Notify every org_admin/campus_coordinator about an absence event."""
    from services import sis_notifications

    admin_ids = _org_admin_ids(org_id)
    if not admin_ids:
        return
    users = (
        _admin().table('users')
        .select('id, display_name, first_name, last_name, username, email, preferred_name')
        .eq('id', student_user_id).limit(1).execute()
    ).data or []
    name = _student_name(users[0]) if users else 'A student'
    scope = 'all classes'
    if class_id:
        cls = (
            _admin().table('org_classes').select('name').eq('id', class_id).limit(1).execute()
        ).data
        scope = (cls[0].get('name') if cls else None) or 'a class'
    when = f'from {absence_date} to {end_date}' if end_date else f'on {absence_date}'
    metadata = {'student_id': student_user_id, 'date': absence_date,
                'class_id': class_id, **({'end_date': end_date} if end_date else {}),
                **(extra_metadata or {})}
    message = template.format(name=name, scope=scope, when=when)
    for admin_id in admin_ids:
        sis_notifications.notify(
            admin_id, title, message,
            link='/attendance',
            organization_id=org_id,
            metadata=metadata,
        )
