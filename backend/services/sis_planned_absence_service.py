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

from datetime import datetime, timezone, date as _date
from typing import Dict, List, Any, Optional

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


def _admin():
    return get_supabase_admin_client()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _today() -> _date:
    return datetime.now(timezone.utc).date()


def _student_name(u: Dict[str, Any]) -> str:
    return (u.get('display_name')
            or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
            or u.get('username') or u.get('email') or 'Unnamed')


def _org_admin_ids(org_id: str) -> List[str]:
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


# ── Staff read: planned absences for a class on a date ───────────────────────
def for_class_date(org_id: str, class_id: str, on_date: str) -> Dict[str, Dict[str, Any]]:
    """Active planned absences that apply to this class on this date, keyed by student.

    A whole-day report (class_id NULL) and a report for exactly this class both apply.
    """
    rows = (
        _admin().table('student_planned_absences').select('*')
        .eq('organization_id', org_id).eq('absence_date', on_date).eq('status', 'active')
        .or_(f'class_id.eq.{class_id},class_id.is.null')
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


def create(org_id: str, student_user_id: str, reported_by: str, absence_date: str,
           class_id: Optional[str] = None, reason: Optional[str] = None) -> Dict[str, Any]:
    """Report a planned absence. Date must be today or later; class (if given) must
    belong to the org. Returns {'absence': row} or {'error': msg}."""
    try:
        parsed = _date.fromisoformat(absence_date)
    except (TypeError, ValueError):
        return {'error': 'absence_date must be YYYY-MM-DD'}
    if parsed < _today():
        return {'error': 'absence_date cannot be in the past'}

    if class_id:
        cls = (
            _admin().table('org_classes').select('id, organization_id')
            .eq('id', class_id).limit(1).execute()
        ).data
        if not cls or cls[0].get('organization_id') != org_id:
            return {'error': 'Class not found'}

    payload = {
        'organization_id': org_id,
        'student_user_id': student_user_id,
        'class_id': class_id,
        'absence_date': absence_date,
        'reason': (reason or '').strip() or None,
        'reported_by': reported_by,
        'status': 'active',
        'updated_at': _now(),
    }
    try:
        resp = _admin().table('student_planned_absences').insert(payload).execute()
    except Exception as e:
        # Unique partial index → a matching active report already exists.
        logger.info(f"planned absence insert rejected (likely duplicate): {e}")
        return {'error': 'This absence has already been reported'}
    row = resp.data[0] if resp.data else None
    if row:
        _notify_admins_of_report(org_id, student_user_id, absence_date, class_id)
    return {'absence': row}


def cancel(absence_id: str, org_id: str) -> bool:
    resp = (
        _admin().table('student_planned_absences')
        .update({'status': 'cancelled', 'updated_at': _now()})
        .eq('id', absence_id).eq('organization_id', org_id).execute()
    )
    return bool(resp.data)


def _notify_admins_of_report(org_id: str, student_user_id: str, absence_date: str,
                             class_id: Optional[str]) -> None:
    """Tell the org admin team a guardian reported a planned absence. Best-effort."""
    from services import sis_notifications

    admin_ids = _org_admin_ids(org_id)
    if not admin_ids:
        return
    users = (
        _admin().table('users')
        .select('id, display_name, first_name, last_name, username, email')
        .eq('id', student_user_id).limit(1).execute()
    ).data or []
    name = _student_name(users[0]) if users else 'A student'
    scope = 'all classes'
    if class_id:
        cls = (
            _admin().table('org_classes').select('name').eq('id', class_id).limit(1).execute()
        ).data
        scope = (cls[0].get('name') if cls else None) or 'a class'
    for admin_id in admin_ids:
        sis_notifications.notify(
            admin_id,
            'Absence reported',
            f"A guardian reported {name} will be out of {scope} on {absence_date}.",
            link='/attendance',
            organization_id=org_id,
            metadata={'student_id': student_user_id, 'date': absence_date, 'class_id': class_id},
        )
