"""Revocable transcript share links.

A transcript is the one artifact a family genuinely needs to hand to an
outsider -- a college, a receiving school, a scholarship committee -- who will
never have an Optio account. That legitimate need is why the transcript
endpoint was unauthenticated, and why closing it outright would have broken
something families depend on.

So the answer is not "no sharing", it is "sharing that someone owns". A share
link here is issued by the person accountable for the student (their parent,
or their org approver where no parent exists), carries an expiry, and can be
revoked at any moment. Revocation takes effect on the next request -- there is
no cached copy that outlives the decision.

Tokens are random, not derived from the user id, so possessing one tells you
nothing about any other student and guessing one is not feasible.
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

# Long enough to survive an admissions cycle, short enough that a forgotten
# link doesn't outlive the student's time at school.
DEFAULT_TTL_DAYS = 180


def _admin():
    # admin client justified: share tokens are consumed by unauthenticated
    # callers (the receiving school), so the token itself is the auth surface;
    # issuance is gated by can_manage_privacy at the route layer.
    return get_supabase_admin_client()


from utils.timestamps import utcnow as _now  # noqa: E402


def verify_transcript_token(token: Optional[str], user_id: str) -> bool:
    """True iff `token` is a live, unexpired, unrevoked grant for `user_id`."""
    if not token or not user_id:
        return False

    try:
        rows = _admin().table('transcript_share_tokens').select(
            'id, user_id, expires_at, revoked_at, view_count'
        ).eq('token', token).limit(1).execute().data or []
    except Exception as e:
        # A missing table must not fail open.
        logger.error(f"Transcript token lookup failed: {e}")
        return False

    if not rows:
        return False

    grant = rows[0]
    if grant.get('user_id') != user_id:
        return False
    if grant.get('revoked_at'):
        return False

    expires_at = grant.get('expires_at')
    if expires_at:
        try:
            exp = datetime.fromisoformat(str(expires_at).replace('Z', '+00:00'))
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < _now():
                return False
        except Exception:
            logger.warning("Unparseable expires_at on transcript grant %s; denying",
                           str(grant.get('id'))[:8])
            return False

    # Best-effort access record. Never block the read on bookkeeping.
    try:
        _admin().table('transcript_share_tokens').update({
            'view_count': (grant.get('view_count') or 0) + 1,
            'last_viewed_at': _now().isoformat(),
        }).eq('id', grant['id']).execute()
    except Exception:
        logger.debug("intentional swallow", exc_info=True)

    return True


def issue_transcript_token(
    student_id: str,
    issued_by: str,
    label: Optional[str] = None,
    ttl_days: int = DEFAULT_TTL_DAYS,
) -> Dict[str, Any]:
    """Mint a share link. Caller must already be authorized to manage this
    student's visibility -- this function does not re-check."""
    token = secrets.token_urlsafe(32)
    expires_at = _now() + timedelta(days=ttl_days)

    payload = {
        'token': token,
        'user_id': student_id,
        'issued_by': issued_by,
        'label': (label or '').strip()[:120] or None,
        'expires_at': expires_at.isoformat(),
    }
    _admin().table('transcript_share_tokens').insert(payload).execute()

    logger.info(f"Transcript share issued: student={student_id[:8]}, by={issued_by[:8]}")
    return {'token': token, 'expires_at': expires_at.isoformat(), 'label': payload['label']}


def revoke_transcript_token(grant_id: str, student_id: str, revoked_by: str) -> bool:
    """Revoke one grant. Scoped by student_id so a caller authorized for one
    student cannot revoke another student's grant by guessing an id."""
    result = _admin().table('transcript_share_tokens').update({
        'revoked_at': _now().isoformat(),
        'revoked_by': revoked_by,
    }).eq('id', grant_id).eq('user_id', student_id).is_('revoked_at', 'null').execute()

    revoked = bool(result.data)
    if revoked:
        logger.info(f"Transcript share revoked: student={student_id[:8]}, by={revoked_by[:8]}")
    return revoked


def list_transcript_grants(student_id: str) -> List[Dict[str, Any]]:
    """Every grant for this student, so a parent can see exactly who holds a
    link. The token itself is not returned -- seeing the list should not hand
    the viewer a working link to re-share."""
    rows = _admin().table('transcript_share_tokens').select(
        'id, label, issued_by, created_at, expires_at, revoked_at, view_count, last_viewed_at'
    ).eq('user_id', student_id).order('created_at', desc=True).execute().data or []

    now = _now()
    for row in rows:
        active = not row.get('revoked_at')
        if active and row.get('expires_at'):
            try:
                exp = datetime.fromisoformat(str(row['expires_at']).replace('Z', '+00:00'))
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                active = exp >= now
            except Exception:
                active = False
        row['is_active'] = active
    return rows
