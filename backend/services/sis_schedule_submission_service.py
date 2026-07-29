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
    """Tell org ADMINS a schedule is waiting: in-app + email, best-effort.

    Admins only — schedule approval is an org_admin action (the Registration
    review queue), so advisors have nothing to act on. The first live
    submission (2026-07-22) emailed every teacher in the org too, because
    list_org_staff returns advisors as well."""
    try:
        from services import sis_service
        from services.sis_notifications import notify
        name = _student_name(student_user_id)
        staff = [s for s in (sis_service.list_org_staff(org_id) or [])
                 if 'org_admin' in (s.get('roles') or [])]
        for s in staff:
            notify(s.get('id'), 'Schedule submitted for approval',
                   f"{name}'s class schedule was submitted for review.",
                   link='/registration', organization_id=org_id)
        emails = [s.get('email') for s in staff if s.get('email')]
        if emails:
            from services.email_service import EmailService
            svc = EmailService()
            # One message to all admins (first To, rest CC), not one send per
            # admin — send_email copies SUPPORT_COPY_EMAIL on every send, so a
            # per-admin loop delivered N monitoring copies per submission.
            approve_url = 'https://sis.optioeducation.com/registration'
            svc.send_email(
                to_email=emails[0],
                cc=emails[1:],
                subject=f'Schedule approval needed: {name}',
                html_body=(
                    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;'
                    'max-width:560px;margin:0 auto;padding:24px;color:#111827;">'
                    '<p style="margin:0 0 4px;color:#6b7280;font-size:13px;">Schedule approval</p>'
                    f'<h2 style="margin:0 0 12px;font-size:18px;">{name}\'s schedule is ready for review</h2>'
                    f"<p style=\"font-size:15px;line-height:1.5;\">{name}'s class schedule was submitted "
                    'for approval. Review it to approve it or send it back to the family.</p>'
                    f'<p style="margin-top:16px;"><a href="{approve_url}" '
                    'style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;'
                    'padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">'
                    'Review the schedule</a></p>'
                    '</div>'
                ),
                text_body=(
                    f"{name}'s class schedule was submitted for approval. "
                    f'Review it to approve or send it back: {approve_url}'
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


def submission_schedule(org_id: str, submission_id: str) -> Dict[str, Any]:
    """The classes on a submitted schedule, so staff can see the week before they
    approve it. Returns the student's active class enrollments (each with meeting
    times, location, and instructor) plus any live waitlist entries. Read-only.
    """
    rows = (
        _admin().table(TABLE).select('*')
        .eq('id', submission_id).eq('organization_id', org_id).limit(1).execute()
    ).data or []
    if not rows:
        return {'error': 'Submission not found'}
    student_id = rows[0]['student_user_id']

    enrolled_ids = {
        r['class_id'] for r in (
            _admin().table('class_enrollments').select('class_id, status')
            .eq('student_id', student_id).eq('status', 'active').execute()
        ).data or []
    }
    waitlist_rows = (
        _admin().table('sis_waitlist_entries').select('*')
        .eq('organization_id', org_id).eq('student_user_id', student_id)
        .in_('status', ['waiting', 'offered']).execute()
    ).data or []

    from services import sis_catalog_service as catalog
    by_id = {c['id']: c for c in catalog.list_classes(org_id)}

    def _instructor(c: Dict[str, Any]) -> Optional[str]:
        pi = c.get('primary_instructor')
        return pi.get('name') if isinstance(pi, dict) else None

    def _slot(meetings: List[Dict[str, Any]]) -> tuple:
        # Earliest (day, start-time) the class meets, so the week reads
        # chronologically. Unscheduled classes sort last.
        slots = [(m.get('day_of_week'), m.get('start_time') or '')
                 for m in (meetings or []) if m.get('day_of_week') is not None]
        return min(slots) if slots else (9, '')

    classes = [{
        'id': c['id'],
        'name': c.get('name'),
        'meetings': c.get('meetings') or [],
        'location': c.get('location'),
        'primary_instructor': _instructor(c),
    } for c in (by_id[i] for i in enrolled_ids if i in by_id)]
    classes.sort(key=lambda c: (_slot(c['meetings']), (c['name'] or '').lower()))

    waitlist = [{
        'class_id': w['class_id'],
        'class_name': (by_id.get(w['class_id']) or {}).get('name') or 'Class',
        'meetings': (by_id.get(w['class_id']) or {}).get('meetings') or [],
        'position': w.get('position'),
        'status': w.get('status'),
    } for w in waitlist_rows]

    return {'classes': classes, 'waitlist': waitlist,
            'student_name': _student_name(student_id)}


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


def _household_guardian_ids(org_id: str, student_user_id: str) -> List[str]:
    """The student's guardians, for a staff approval with no submitting parent
    to notify (the CLP meeting case). Best-effort — never raises."""
    try:
        from services import sis_service
        hh = sis_service._household_by_user(org_id).get(student_user_id)
        if not hh:
            return []
        members = (
            _admin().table('household_members').select('user_id, relationship')
            .eq('household_id', hh['household_id']).execute()
        ).data or []
        return [m['user_id'] for m in members
                if m.get('relationship') != 'student' and m.get('user_id')]
    except Exception as e:  # noqa: BLE001 — notification lookup is never fatal
        logger.warning(f'schedule submission: guardian lookup failed: {e}')
        return []


def approve_for_student(org_id: str, student_user_id: str, *, reviewed_by: str,
                        note: Optional[str] = None) -> Dict[str, Any]:
    """Approve a student's schedule from the CLP meeting screen.

    Same end state as approving from the Registration review queue, but keyed by
    student rather than submission id, because in a CLP meeting the schedule is
    usually built live with the family in the room and was never submitted
    through the Schedule Builder. Approves the pending submission when there is
    one; otherwise records a staff approval (which locks self-service changes,
    exactly as a parent-submitted approval does). Already-approved is a no-op.
    """
    cur = current(org_id, student_user_id)
    if cur and cur.get('status') == 'approved':
        return {'already': True, 'submission': cur}
    if cur and cur.get('status') == 'submitted':
        return review(org_id, cur['id'], 'approve', reviewed_by=reviewed_by, note=note)

    now = datetime.now(timezone.utc).isoformat()
    row = (
        _admin().table(TABLE).upsert({
            'organization_id': org_id,
            'student_user_id': student_user_id,
            'status': 'approved',
            # No parent submission: the schedule was agreed in the meeting, so
            # the approving staff member stands in as the submitter of record.
            'submitted_by': (cur or {}).get('submitted_by'),
            'submitted_at': (cur or {}).get('submitted_at') or now,
            'reviewed_by': reviewed_by,
            'reviewed_at': now,
            'review_note': (note or '').strip()[:MAX_NOTE_LEN] or None,
            'updated_at': now,
        }, on_conflict='organization_id,student_user_id').execute()
    ).data[0]
    _notify_guardian(row, fallback_user_ids=_household_guardian_ids(org_id, student_user_id))
    return {'submission': row}


def reopen_for_student(org_id: str, student_user_id: str, *, reviewed_by: str,
                       note: Optional[str] = None) -> Dict[str, Any]:
    """Undo an approval — unlocks the family's Schedule Builder again.

    A CLP approval happens live, so a mis-click has to be reversible in the same
    place. Sends the schedule back to the family with an optional note, which is
    the existing 'unlocked' state.
    """
    cur = current(org_id, student_user_id)
    if not cur:
        return {'error': 'No schedule approval to reopen'}
    if cur.get('status') == 'sent_back':
        return {'already': True, 'submission': cur}
    now = datetime.now(timezone.utc).isoformat()
    updated = (
        _admin().table(TABLE).update({
            'status': 'sent_back',
            'reviewed_by': reviewed_by,
            'reviewed_at': now,
            'review_note': (note or '').strip()[:MAX_NOTE_LEN] or None,
            'updated_at': now,
        }).eq('id', cur['id']).execute()
    ).data
    row = updated[0] if updated else {**cur, 'status': 'sent_back'}
    _notify_guardian(row, fallback_user_ids=_household_guardian_ids(org_id, student_user_id))
    return {'submission': row}


def _notify_guardian(sub: Dict[str, Any], fallback_user_ids: Optional[List[str]] = None) -> None:
    """Tell the submitting guardian the outcome (in-app, best-effort).

    `fallback_user_ids` covers staff-initiated approvals, where there is no
    submitting guardian — every guardian on the household is told instead."""
    try:
        from services.sis_notifications import notify
        guardian = sub.get('submitted_by')
        recipients = [guardian] if guardian else list(fallback_user_ids or [])
        if not recipients:
            return
        for recipient in recipients:
            if sub.get('status') == 'approved':
                notify(recipient, 'Schedule approved',
                       "Your student's class schedule was approved by the school.",
                       link='/schedule-builder', organization_id=sub.get('organization_id'))
            else:
                note = sub.get('review_note')
                notify(recipient, 'Schedule needs changes',
                       "The school sent your student's schedule back"
                       + (f': {note}' if note else
                          ' — open the Schedule Builder to make changes and resubmit.'),
                       link='/schedule-builder', organization_id=sub.get('organization_id'))
    except Exception as e:  # noqa: BLE001 — notifications must never break a review
        logger.warning(f'schedule submission: guardian notification skipped: {e}')
