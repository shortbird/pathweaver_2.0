"""
SIS daily check-in/out service.

A guardian checks their child in at drop-off and out at pickup, or reports a
full-day absence. Staff see a daily board. Distinct from per-class teacher
attendance (sis_attendance) — this is campus arrival/departure.

Access: a check-in may be recorded by the student's guardian OR by org staff.
Admin (service_role) client throughout (SIS tables are RLS-locked to backend-only).
"""

from datetime import datetime, timezone
from typing import Dict, List, Any, Optional, Set

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

CHECKIN_STATUSES = ('checked_in', 'checked_out', 'absent')
STAFF_ORG_ROLES = ('org_admin', 'advisor')


def _admin():
    return get_supabase_admin_client()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _student_name(u: Dict[str, Any]) -> str:
    return (u.get('display_name')
            or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
            or u.get('username') or u.get('email') or 'Unnamed')


def student_org(student_id: str) -> Optional[str]:
    rows = (
        _admin().table('users').select('organization_id')
        .eq('id', student_id).limit(1).execute()
    ).data
    return rows[0].get('organization_id') if rows else None


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


def can_manage_checkin(user: Dict[str, Any], student_id: str) -> bool:
    """A check-in may be recorded by org staff (same org) or the student's guardian."""
    if not user:
        return False
    if user.get('role') == 'superadmin':
        return True
    org = student_org(student_id)
    # staff in the same org
    if org and user.get('organization_id') == org:
        roles = set()
        if user.get('org_role'):
            roles.add(user['org_role'])
        if isinstance(user.get('org_roles'), list):
            roles.update(user['org_roles'])
        if roles & set(STAFF_ORG_ROLES):
            return True
    # guardian of the student
    return user.get('id') in guardians_for_student(student_id)


def _today_for_org(org_id: str):
    """Today's date in the org's local timezone (class times are local)."""
    from services.sis_checkin_sweep_service import org_today
    return org_today(org_id)


def _upsert(org_id: str, student_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
    payload = {
        'organization_id': org_id,
        'student_user_id': student_id,
        'date': _today_for_org(org_id).isoformat(),
        'updated_at': _now(),
        **fields,
    }
    resp = (
        _admin().table('sis_checkins')
        .upsert(payload, on_conflict='organization_id,student_user_id,date').execute()
    )
    return resp.data[0] if resp.data else None


def check_in(org_id: str, student_id: str, by: str, note: Optional[str] = None) -> Dict[str, Any]:
    return _upsert(org_id, student_id, {
        'status': 'checked_in', 'checked_in_at': _now(), 'checked_in_by': by, 'note': note,
    })


def check_out(org_id: str, student_id: str, by: str) -> Dict[str, Any]:
    return _upsert(org_id, student_id, {
        'status': 'checked_out', 'checked_out_at': _now(),
    })


def report_absence(org_id: str, student_id: str, by: str, note: Optional[str] = None) -> Dict[str, Any]:
    return _upsert(org_id, student_id, {
        'status': 'absent', 'checked_in_by': by, 'note': note,
    })


def get_today(org_id: str, student_id: str) -> Optional[Dict[str, Any]]:
    rows = (
        _admin().table('sis_checkins').select('*')
        .eq('organization_id', org_id).eq('student_user_id', student_id)
        .eq('date', _today_for_org(org_id).isoformat()).limit(1).execute()
    ).data
    return rows[0] if rows else None


def get_day_board(org_id: str, on_date: Optional[str] = None) -> List[Dict[str, Any]]:
    """Enrolled students + their check-in status for a date (staff board)."""
    on_date = on_date or _today_for_org(org_id).isoformat()
    enr = (
        _admin().table('school_enrollments').select('student_user_id')
        .eq('organization_id', org_id).eq('status', 'enrolled').execute()
    ).data or []
    ids = [e['student_user_id'] for e in enr]
    if not ids:
        return []
    users = {
        u['id']: u for u in (
            _admin().table('users')
            .select('id, display_name, first_name, last_name, username, email')
            .in_('id', ids).execute()
        ).data or []
    }
    checkins = {
        c['student_user_id']: c for c in (
            _admin().table('sis_checkins').select('*')
            .eq('organization_id', org_id).eq('date', on_date)
            .in_('student_user_id', ids).execute()
        ).data or []
    }
    board = []
    for sid in ids:
        c = checkins.get(sid)
        board.append({
            'student_user_id': sid,
            'name': _student_name(users.get(sid, {})),
            'status': c.get('status') if c else None,
            'checked_in_at': c.get('checked_in_at') if c else None,
            'checked_out_at': c.get('checked_out_at') if c else None,
            'note': c.get('note') if c else None,
        })
    board.sort(key=lambda r: r['name'].lower())
    return board
