"""
SIS schedule submissions — a parent submits the finished Schedule Builder week
for the school to approve and bill (iCreate feedback 2026-07-21).

Submitting LOCKS self-service changes (adds/drops/learning-day) for that
student until the school acts: approving keeps the schedule locked (staff make
any further changes), sending it back unlocks it for the family with a note.
Approval is status-only — billing happens outside Optio.

One live row per (org, student); resubmits after a send-back reuse the row and
clear the previous review. Staff are notified in-app and by email on submit;
the submitting guardian is notified in-app on approve/send-back (best-effort —
notification failures never break the submission itself).

Admin (service_role) client — the table is RLS-locked to backend-only;
authorization happens in the callers (guardian relationship in
sis_parent_service, staff role on the /api/sis routes).
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

TABLE = 'sis_schedule_submissions'
STATUSES = ('submitted', 'approved', 'sent_back')
LOCKED_STATUSES = ('submitted', 'approved')
REVIEW_ACTIONS = {'approve': 'approved', 'send_back': 'sent_back'}
MAX_NOTE_LEN = 2000


def _admin():
    return get_supabase_admin_client()


def _display_name(u: Dict[str, Any]) -> str:
    name = (u.get('display_name') or
            f"{u.get('first_name') or ''} {u.get('last_name') or ''}").strip()
    return name or (u.get('username') or u.get('email') or 'Unnamed')


def current(org_id: str, student_user_id: str) -> Optional[Dict[str, Any]]:
    """The student's submission row (any status), or None."""
    rows = (
        _admin().table(TABLE).select('*')
        .eq('organization_id', org_id).eq('student_user_id', student_user_id)
        .limit(1).execute()
    ).data or []
    return rows[0] if rows else None


def is_locked(org_id: str, student_user_id: str) -> bool:
    """Self-service schedule changes are locked while submitted or approved."""
    cur = current(org_id, student_user_id)
    return bool(cur and cur.get('status') in LOCKED_STATUSES)


def submit(org_id: str, student_user_id: str, guardian_user_id: str) -> Dict[str, Any]:
    """Submit (or resubmit after a send-back). Idempotent while locked."""
    cur = current(org_id, student_user_id)
    if cur and cur.get('status') in LOCKED_STATUSES:
        return {'already': True, 'submission': cur}
    now = datetime.now(timezone.utc).isoformat()
    row = (
        _admin().table(TABLE).upsert({
            'organization_id': org_id,
            'student_user_id': student_user_id,
            'status': 'submitted',
            'submitted_by': guardian_user_id,
            'submitted_at': now,
            'reviewed_by': None,
            'reviewed_at': None,
            'review_note': None,
            'updated_at': now,
        }, on_conflict='organization_id,student_user_id').execute()
    ).data[0]
    _notify_staff(org_id, student_user_id)
    return {'submission': row}


def _student_name(student_user_id: str) -> str:
    rows = (
        _admin().table('users')
        .select('id, display_name, first_name, last_name, username, email')
        .eq('id', student_user_id).limit(1).execute()
    ).data or []
    return _display_name(rows[0]) if rows else 'A student'


def _notify_staff(org_id: str, student_user_id: str) -> None:
    """Tell org staff a schedule is waiting: in-app + email, best-effort."""
    try:
        from services import sis_service
        from services.sis_notifications import notify
        name = _student_name(student_user_id)
        staff = sis_service.list_org_staff(org_id) or []
        for s in staff:
            notify(s.get('id'), 'Schedule submitted for approval',
                   f"{name}'s class schedule was submitted for review.",
                   link='/registration', organization_id=org_id)
        emails = [s.get('email') for s in staff if s.get('email')]
        if emails:
            from services.email_service import EmailService
            svc = EmailService()
            for em in emails:
                svc.send_email(
                    to_email=em,
                    subject=f'Schedule approval needed: {name}',
                    html_body=(
                        f"<p>{name}'s class schedule was submitted for approval.</p>"
                        '<p>Review it on the Registration page of your school console '
                        'to approve it or send it back to the family.</p>'
                    ),
                )
    except Exception as e:  # noqa: BLE001 — notifications must never break a submit
        logger.warning(f'schedule submission: staff notification skipped for org {org_id}: {e}')


def list_submissions(org_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
    """All submissions for the org (newest first), hydrated with student and
    guardian names for the staff review queue."""
    q = (_admin().table(TABLE).select('*')
         .eq('organization_id', org_id).order('submitted_at', desc=True))
    if status:
        q = q.eq('status', status)
    rows = q.execute().data or []
    if not rows:
        return []
    user_ids = list({r['student_user_id'] for r in rows}
                    | {r['submitted_by'] for r in rows if r.get('submitted_by')})
    users_map = {
        u['id']: u for u in (
            _admin().table('users')
            .select('id, display_name, first_name, last_name, username, email')
            .in_('id', user_ids).execute()
        ).data or []
    }
    for r in rows:
        r['student_name'] = _display_name(users_map.get(r['student_user_id'], {}))
        r['guardian_name'] = (_display_name(users_map.get(r['submitted_by'], {}))
                              if r.get('submitted_by') else None)
    return rows


def review(org_id: str, submission_id: str, action: str, *, reviewed_by: str,
           note: Optional[str] = None) -> Dict[str, Any]:
    """Approve (schedule stays locked, staff-managed from here) or send back
    (unlocks self-service for the family) a submitted schedule."""
    if action not in REVIEW_ACTIONS:
        return {'error': "action must be 'approve' or 'send_back'"}
    rows = (
        _admin().table(TABLE).select('*')
        .eq('id', submission_id).eq('organization_id', org_id).limit(1).execute()
    ).data or []
    if not rows:
        return {'error': 'Submission not found'}
    sub = rows[0]
    if sub.get('status') != 'submitted':
        return {'error': 'This submission was already reviewed'}
    now = datetime.now(timezone.utc).isoformat()
    updated = (
        _admin().table(TABLE).update({
            'status': REVIEW_ACTIONS[action],
            'reviewed_by': reviewed_by,
            'reviewed_at': now,
            'review_note': (note or '').strip()[:MAX_NOTE_LEN] or None,
            'updated_at': now,
        }).eq('id', submission_id).execute()
    ).data
    row = updated[0] if updated else {**sub, 'status': REVIEW_ACTIONS[action]}
    _notify_guardian(row)
    return {'submission': row}


def _notify_guardian(sub: Dict[str, Any]) -> None:
    """Tell the submitting guardian the outcome (in-app, best-effort)."""
    try:
        from services.sis_notifications import notify
        guardian = sub.get('submitted_by')
        if not guardian:
            return
        if sub.get('status') == 'approved':
            notify(guardian, 'Schedule approved',
                   "Your student's class schedule was approved by the school.",
                   link='/schedule-builder', organization_id=sub.get('organization_id'))
        else:
            note = sub.get('review_note')
            notify(guardian, 'Schedule needs changes',
                   "The school sent your student's schedule back"
                   + (f': {note}' if note else
                      ' — open the Schedule Builder to make changes and resubmit.'),
                   link='/schedule-builder', organization_id=sub.get('organization_id'))
    except Exception as e:  # noqa: BLE001 — notifications must never break a review
        logger.warning(f'schedule submission: guardian notification skipped: {e}')
