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
from services.class_quest_enrollment import enroll_in_class_quests as _enroll_in_class_quests

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
            .select('id, display_name, first_name, last_name, username, email, preferred_name')
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


def resolve_on_schedule_approval(org_id: str, student_user_id: str,
                                 resolved_by: str) -> Dict[str, int]:
    """Close out a student's pending age-exception requests when their schedule
    is approved.

    iCreate, 2026-07-31: "If someone's schedule is approved, then I think it
    should also remove the age exception requests." An approved schedule is the
    decision — so each pending request is recorded against what the approved
    schedule actually says: the student is in that class (staff let them in, in
    the meeting or otherwise) → approved; they are not → declined. Nothing is
    enrolled or dropped here, because approval already settled the roster; this
    only stops answered questions from sitting in the pending queue forever.

    Best-effort: never raises, so it can't fail an approval.
    """
    out = {'approved': 0, 'declined': 0}
    try:
        pending = (
            _admin().table(TABLE).select('id, class_id')
            .eq('organization_id', org_id).eq('student_user_id', student_user_id)
            .eq('status', 'pending').execute()
        ).data or []
        if not pending:
            return out
        enrolled = {
            r['class_id'] for r in (
                _admin().table('class_enrollments').select('class_id')
                .eq('student_id', student_user_id).eq('status', 'active').execute()
            ).data or []
        }
        now = datetime.now(timezone.utc).isoformat()
        for req in pending:
            granted = req['class_id'] in enrolled
            _admin().table(TABLE).update({
                'status': 'approved' if granted else 'declined',
                'resolved_by': resolved_by,
                'resolved_at': now,
            }).eq('id', req['id']).execute()
            out['approved' if granted else 'declined'] += 1
        logger.info(f'[Exceptions] schedule approval closed {out} for {student_user_id[:8]}')
    except Exception as e:  # noqa: BLE001
        logger.warning(f'[Exceptions] could not close requests on approval: {e}')
    return out


def _same_time_conflicts(student_user_id: str, class_id: str) -> List[Dict[str, Any]]:
    """The student's other active enrollments whose meetings collide with the
    target class's meetings. Returns [{class_id, class_name}]."""
    from services.sis_eligibility import meetings_overlap
    admin = _admin()
    target_meetings = (
        admin.table('class_meetings').select('day_of_week, specific_date, start_time, end_time')
        .eq('class_id', class_id).execute()
    ).data or []
    if not target_meetings:
        return []
    enrolled_ids = [
        e['class_id'] for e in (
            admin.table('class_enrollments').select('class_id')
            .eq('student_id', student_user_id).eq('status', 'active').execute()
        ).data or [] if e['class_id'] != class_id
    ]
    if not enrolled_ids:
        return []
    other_meetings = (
        admin.table('class_meetings')
        .select('class_id, day_of_week, specific_date, start_time, end_time')
        .in_('class_id', enrolled_ids).execute()
    ).data or []
    conflict_ids = list({
        m['class_id'] for m in other_meetings
        if any(meetings_overlap(t, m) for t in target_meetings)
    })
    if not conflict_ids:
        return []
    # An archived class no longer meets — a stale active enrollment in one must
    # not count as a conflict (phantom Expressions conflict, iCreate 2026-08-24).
    names = {
        c['id']: c.get('name') or 'Class' for c in (
            admin.table('org_classes').select('id, name, status').in_('id', conflict_ids).execute()
        ).data or [] if c.get('status') != 'archived'
    }
    return [{'class_id': cid, 'class_name': name} for cid, name in names.items()]


def resolve(org_id: str, request_id: str, action: str, *, resolved_by: str,
            drop_conflicting: bool = False) -> Dict[str, Any]:
    """Approve (enrolls the student right away) or decline a pending request.

    Approving a student who is already enrolled in a class meeting at the same
    time would silently double-book them, so the first approve attempt returns
    {'conflicts': [...]} and leaves the request pending; the caller re-approves
    with drop_conflicting=True to drop those enrollments and proceed."""
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
        conflicts = _same_time_conflicts(req['student_user_id'], req['class_id'])
        if conflicts and not drop_conflicting:
            return {'conflicts': conflicts}
        if conflicts:
            _admin().table('class_enrollments').update({'status': 'withdrawn'}) \
                .eq('student_id', req['student_user_id']) \
                .in_('class_id', [c['class_id'] for c in conflicts]) \
                .eq('status', 'active').execute()
            from services.class_group_sync_service import sync_class_group
            for c in conflicts:
                sync_class_group(c['class_id'], actor_id=resolved_by)
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
        _enroll_in_class_quests(_admin(), req['class_id'], req['student_user_id'])
        # A now-enrolled student shouldn't linger on this or sibling class waitlists.
        from services import sis_waitlist_service
        sis_waitlist_service.clear_entry_for_enrollment(
            org_id, req['class_id'], req['student_user_id']
        )

    updated = (
        _admin().table(TABLE).update({
            'status': 'approved' if action == 'approve' else 'declined',
            'resolved_by': resolved_by,
            'resolved_at': datetime.now(timezone.utc).isoformat(),
        }).eq('id', request_id).execute()
    ).data
    return {'request': updated[0] if updated else {**req, 'status': action}}
