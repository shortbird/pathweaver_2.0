"""
SIS age-exception requests — a family asks the school to allow a student into a
class outside its posted age band.

The Schedule Builder hides out-of-band classes; the request link is the
deliberate, low-key escape hatch. Each request is a timestamped row staff
review on the Registration page. Approving one enrolls the student immediately
(staff-side enrollment is intentionally capacity-unrestricted, matching the
direct-enrollment endpoint); declining just records the decision.

Admin (service_role) client throughout — the table is RLS-locked to
backend-only; authorization happens in the callers (guardian relationship in
sis_parent_service, staff role on the /api/sis routes).
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

TABLE = 'sis_age_exception_requests'
REQUEST_STATUSES = ('pending', 'approved', 'declined')

# A parent note longer than this is truncated, not rejected.
MAX_MESSAGE_LEN = 2000


def _admin():
    return get_supabase_admin_client()


def _display_name(u: Dict[str, Any]) -> str:
    name = (u.get('display_name') or
            f"{u.get('first_name') or ''} {u.get('last_name') or ''}").strip()
    return name or (u.get('username') or u.get('email') or 'Unnamed')


def create_request(org_id: str, guardian_user_id: str, student_user_id: str,
                   class_id: str, *, message: Optional[str] = None,
                   student_age: Optional[int] = None,
                   class_min_age: Optional[int] = None,
                   class_max_age: Optional[int] = None) -> Dict[str, Any]:
    """Record a request; one pending request per student+class (re-asking while
    one is open returns {'already': True} instead of a duplicate row)."""
    existing = (
        _admin().table(TABLE).select('id')
        .eq('organization_id', org_id).eq('student_user_id', student_user_id)
        .eq('class_id', class_id).eq('status', 'pending').limit(1).execute()
    ).data or []
    if existing:
        return {'already': True, 'request_id': existing[0]['id']}

    row = (
        _admin().table(TABLE).insert({
            'organization_id': org_id,
            'guardian_user_id': guardian_user_id,
            'student_user_id': student_user_id,
            'class_id': class_id,
            'student_age': student_age,
            'class_min_age': class_min_age,
            'class_max_age': class_max_age,
            'message': (message or '').strip()[:MAX_MESSAGE_LEN] or None,
        }).execute()
    ).data[0]
    return {'request': row}


def pending_class_ids(org_id: str, student_user_id: str) -> List[str]:
    """Class ids this student already has an open request for (so the builder
    can show 'requested' instead of offering the link again)."""
    rows = (
        _admin().table(TABLE).select('class_id')
        .eq('organization_id', org_id).eq('student_user_id', student_user_id)
        .eq('status', 'pending').execute()
    ).data or []
    return [r['class_id'] for r in rows]


def list_requests(org_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
    """All requests for the org (newest first), hydrated with student, guardian
    and class names for the staff review list."""
    q = (_admin().table(TABLE).select('*')
         .eq('organization_id', org_id).order('created_at', desc=True))
    if status:
        q = q.eq('status', status)
    rows = q.execute().data or []
    if not rows:
        return []

    user_ids = list({r['student_user_id'] for r in rows}
                    | {r['guardian_user_id'] for r in rows})
    users_map = {
        u['id']: u for u in (
            _admin().table('users')
            .select('id, display_name, first_name, last_name, username, email')
            .in_('id', user_ids).execute()
        ).data or []
    }
    class_ids = list({r['class_id'] for r in rows})
    classes_map = {
        c['id']: c for c in (
            _admin().table('org_classes').select('id, name, min_age, max_age')
            .in_('id', class_ids).execute()
        ).data or []
    }
    for r in rows:
        r['student_name'] = _display_name(users_map.get(r['student_user_id'], {}))
        r['guardian_name'] = _display_name(users_map.get(r['guardian_user_id'], {}))
        klass = classes_map.get(r['class_id']) or {}
        r['class_name'] = klass.get('name') or 'Class'
    return rows


def resolve(org_id: str, request_id: str, action: str, *, resolved_by: str) -> Dict[str, Any]:
    """Approve (enrolls the student right away) or decline a pending request."""
    rows = (
        _admin().table(TABLE).select('*')
        .eq('id', request_id).eq('organization_id', org_id).limit(1).execute()
    ).data or []
    if not rows:
        return {'error': 'Request not found'}
    req = rows[0]
    if req.get('status') != 'pending':
        return {'error': 'This request was already resolved'}

    if action == 'approve':
        # Enroll immediately — same behavior as staff direct enrollment
        # (capacity-unrestricted; approving IS the override).
        _admin().table('class_enrollments').upsert({
            'class_id': req['class_id'],
            'student_id': req['student_user_id'],
            'status': 'active',
            'enrolled_by': resolved_by,
        }, on_conflict='class_id,student_id').execute()
        from services.class_group_sync_service import sync_class_group
        sync_class_group(req['class_id'], actor_id=resolved_by)
        # A now-enrolled student shouldn't linger on the class's waitlist.
        _admin().table('sis_waitlist_entries').delete() \
            .eq('organization_id', org_id).eq('class_id', req['class_id']) \
            .eq('student_user_id', req['student_user_id']) \
            .in_('status', ['waiting', 'offered']).execute()

    updated = (
        _admin().table(TABLE).update({
            'status': 'approved' if action == 'approve' else 'declined',
            'resolved_by': resolved_by,
            'resolved_at': datetime.now(timezone.utc).isoformat(),
        }).eq('id', request_id).execute()
    ).data
    return {'request': updated[0] if updated else {**req, 'status': action}}
