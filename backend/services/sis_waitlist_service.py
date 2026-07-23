"""
SIS Waitlist service — ordered queue with auto-offer.

When a full Class frees a seat, the lowest-position 'waiting' entry is offered the
seat (with an expiry). Accepting creates the real class_enrollments row. The
ordering/selection rules are pure (next_position, pick_next_to_offer) so they're
unit-testable without a DB; the rest composes admin-client reads/writes.
"""

from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

OFFER_TTL_HOURS = 48
WAITLIST_STATUSES = ('waiting', 'offered', 'accepted', 'expired', 'declined', 'promoted')


def _admin():
    return get_supabase_admin_client()


def _now():
    return datetime.now(timezone.utc)


# ── Pure ordering logic (unit-tested) ────────────────────────────────────────
def next_position(entries: List[Dict[str, Any]]) -> int:
    """Next queue position = 1 + the current max position (1-based)."""
    positions = [e.get('position', 0) for e in (entries or [])]
    return (max(positions) + 1) if positions else 1


def pick_next_to_offer(entries: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """The lowest-position entry still 'waiting' (or None)."""
    waiting = [e for e in (entries or []) if e.get('status') == 'waiting']
    if not waiting:
        return None
    return min(waiting, key=lambda e: e.get('position', 0))


# ── DB-backed operations ─────────────────────────────────────────────────────
def list_for_class(org_id: str, class_id: str) -> List[Dict[str, Any]]:
    rows = (
        _admin().table('sis_waitlist_entries')
        .select('*').eq('organization_id', org_id).eq('class_id', class_id)
        .order('position').execute()
    ).data or []
    if not rows:
        return []
    student_ids = list({r['student_user_id'] for r in rows})
    users = {
        u['id']: u for u in (
            _admin().table('users')
            .select('id, display_name, first_name, last_name, username, email')
            .in_('id', student_ids).execute()
        ).data or []
    }
    for r in rows:
        u = users.get(r['student_user_id'], {})
        r['student_name'] = (u.get('display_name')
                             or f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip()
                             or u.get('username') or u.get('email') or 'Unnamed')
    return rows


def add_to_waitlist(org_id: str, class_id: str, student_user_id: str) -> Dict[str, Any]:
    """Append a student to a class waitlist (idempotent on class+student)."""
    existing = (
        _admin().table('sis_waitlist_entries')
        .select('*').eq('class_id', class_id).execute()
    ).data or []
    for e in existing:
        if e['student_user_id'] == student_user_id and e['status'] in ('waiting', 'offered'):
            return e  # already queued
    pos = next_position(existing)
    payload = {
        'organization_id': org_id,
        'class_id': class_id,
        'student_user_id': student_user_id,
        'position': pos,
        'status': 'waiting',
    }
    resp = (
        _admin().table('sis_waitlist_entries')
        .upsert(payload, on_conflict='class_id,student_user_id').execute()
    )
    return resp.data[0] if resp.data else None


def offer_next(org_id: str, class_id: str) -> Optional[Dict[str, Any]]:
    """Offer the open seat to the next waiting student (sets offered + expiry)."""
    entries = list_for_class(org_id, class_id)
    nxt = pick_next_to_offer(entries)
    if not nxt:
        return None
    expires = (_now() + timedelta(hours=OFFER_TTL_HOURS)).isoformat()
    resp = (
        _admin().table('sis_waitlist_entries')
        .update({'status': 'offered', 'offered_at': _now().isoformat(),
                 'offer_expires_at': expires, 'updated_at': _now().isoformat()})
        .eq('id', nxt['id']).execute()
    )
    offered = resp.data[0] if resp.data else None
    if offered:
        from services import sis_notifications
        sis_notifications.notify(
            offered['student_user_id'],
            'A seat opened up',
            'A spot has opened in a class you were waitlisted for. Please confirm to claim it.',
            organization_id=org_id,
        )
    return offered


def respond_to_offer(org_id: str, entry_id: str, accept: bool,
                     enrolled_by: str) -> Dict[str, Any]:
    """Accept (→ enroll + promoted) or decline an offer."""
    entry = (
        _admin().table('sis_waitlist_entries')
        .select('*').eq('id', entry_id).eq('organization_id', org_id).limit(1).execute()
    ).data
    if not entry:
        return {'error': 'Waitlist entry not found'}
    entry = entry[0]
    if not accept:
        resp = (
            _admin().table('sis_waitlist_entries')
            .update({'status': 'declined', 'updated_at': _now().isoformat()})
            .eq('id', entry_id).execute()
        )
        return {'entry': resp.data[0] if resp.data else None}
    # accept → create the LMS enrollment, mark promoted
    _admin().table('class_enrollments').upsert({
        'class_id': entry['class_id'],
        'student_id': entry['student_user_id'],
        'status': 'active',
        'enrolled_by': enrolled_by,
    }, on_conflict='class_id,student_id').execute()
    from services.class_group_sync_service import sync_class_group
    sync_class_group(entry['class_id'], actor_id=enrolled_by)
    resp = (
        _admin().table('sis_waitlist_entries')
        .update({'status': 'promoted', 'updated_at': _now().isoformat()})
        .eq('id', entry_id).execute()
    )
    return {'entry': resp.data[0] if resp.data else None, 'enrolled': True}


def alert_admins_seat_opened(org_id: str, class_id: str) -> bool:
    """Email the org admins when a waitlisted class has an open seat, so they can
    manually offer it to the next student (iCreate wants to approve each admit,
    not auto-enroll). Best-effort; safe to call whenever a seat MIGHT have freed
    (a withdrawal, a capacity increase) — it self-gates on there actually being
    both waiting students and an available seat, so it never emails needlessly.
    """
    try:
        cls = (
            _admin().table('org_classes')
            .select('id, name, capacity, organization_id')
            .eq('id', class_id).limit(1).execute()
        ).data
        if not cls or cls[0].get('organization_id') != org_id:
            return False
        cls = cls[0]

        waiting = [e for e in list_for_class(org_id, class_id) if e.get('status') == 'waiting']
        if not waiting:
            return False

        capacity = cls.get('capacity')
        active = (
            _admin().table('class_enrollments')
            .select('id', count='exact')
            .eq('class_id', class_id).eq('status', 'active').execute()
        ).count or 0
        seats_open = None if capacity is None else max(0, capacity - active)
        # A None capacity means unlimited — a "seat" is always available, so any
        # waiting student can be admitted.
        if seats_open == 0:
            return False

        admin_emails = _org_admin_emails(org_id)
        if not admin_emails:
            return False

        from services.email_service import email_service
        seats_txt = 'A seat' if (seats_open in (None, 1)) else f'{seats_open} seats'
        n = len(waiting)
        who = f'{n} student{"" if n == 1 else "s"}'
        subject = f'Seat open in {cls["name"]} — {n} waiting'
        html = f"""
        <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">Waitlist alert</p>
          <h2 style="margin:0 0 12px;font-size:18px;">{seats_txt} opened in {cls["name"]}</h2>
          <p style="font-size:15px;line-height:1.5;">{who} {"is" if n == 1 else "are"} waiting for this class.
          Open the class in your SIS and use <strong>Offer next seat</strong> on the Waitlist tab to admit the next student.</p>
          <p style="margin-top:16px;"><a href="https://sis.optioeducation.com/classes"
             style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">Manage the waitlist</a></p>
        </div>
        """.strip()
        text = (f'{seats_txt} opened in {cls["name"]}. {who} waiting. '
                f'Open the class Waitlist tab in your SIS and use "Offer next seat" to admit the next student. '
                f'https://sis.optioeducation.com/classes')
        ok = True
        for addr in admin_emails:
            ok = email_service.send_email(to_email=addr, subject=subject, html_body=html, text_body=text) and ok
        logger.info(f"[Waitlist] seat-opened alert for class {class_id}: emailed {len(admin_emails)} admin(s)")
        return ok
    except Exception as e:
        logger.warning(f"[Waitlist] seat-opened alert skipped for {class_id}: {e}")
        return False


def _org_admin_emails(org_id: str) -> List[str]:
    """Emails of the org's admin team (org_role / org_roles contains org_admin)."""
    rows = (
        _admin().table('users').select('email, org_role, org_roles')
        .eq('organization_id', org_id).execute()
    ).data or []
    out = []
    for u in rows:
        roles = set()
        if u.get('org_role'):
            roles.add(u['org_role'])
        if isinstance(u.get('org_roles'), list):
            roles.update(u['org_roles'])
        if 'org_admin' in roles and u.get('email'):
            out.append(u['email'])
    return out


def remove(org_id: str, entry_id: str) -> None:
    (
        _admin().table('sis_waitlist_entries')
        .delete().eq('id', entry_id).eq('organization_id', org_id).execute()
    )
