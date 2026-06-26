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
    return resp.data[0] if resp.data else None


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
    resp = (
        _admin().table('sis_waitlist_entries')
        .update({'status': 'promoted', 'updated_at': _now().isoformat()})
        .eq('id', entry_id).execute()
    )
    return {'entry': resp.data[0] if resp.data else None, 'enrolled': True}


def remove(org_id: str, entry_id: str) -> None:
    (
        _admin().table('sis_waitlist_entries')
        .delete().eq('id', entry_id).eq('organization_id', org_id).execute()
    )
