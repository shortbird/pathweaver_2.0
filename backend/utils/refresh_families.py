"""Refresh-token families: rotation with reuse detection.

`session_manager` signs and verifies tokens and, by design, knows nothing about
the database. This module is the state behind refresh-token rotation, kept out
of there for the same reason `token_authority` is: so the crypto stays unit
testable without a database, and so `session_manager` never imports `database`
(which imports back into `utils`).

**The problem.** A refresh token used to survive its own use. `/api/auth/refresh`
minted a new pair and the presented token stayed valid for the rest of its
30 days, because there is no denylist and the tokens are stateless. A copy taken
off a device -- or read out of the login/refresh JSON by an XSS payload -- worked
alongside the victim's for a month, and nothing could observe that the same
credential was in two pairs of hands.

**The mechanism.** Every refresh token carries a family id (`fam`) and a one-time
id (`jti`). A family row records the single jti that may be presented next:

  * present the current jti  -> rotate it, issue the next pair
  * present any OTHER jti of the family -> that token was already spent, so it is
    being replayed. Revoke the whole family. Both parties are logged out, because
    from here the attacker's session and the victim's are indistinguishable and
    logging out the wrong one is the failure we can recover from.

**The grace window** exists because two browser tabs refreshing in the same
instant present the same jti twice, which is byte-for-byte what a replay looks
like. `previous_jti` is accepted for `REPLAY_GRACE_SECONDS` after a rotation
without revoking anything. Long enough to cover a concurrent tab, far short of
the window a stolen token needs.

**Failure is open, deliberately.** If the lookup or the write fails, the refresh
proceeds unrotated. Reuse detection is a defence in depth on top of
`users.last_logout_at`; a Supabase blip must not sign out the platform. The
failure is logged and reported, so a broken deployment is loud rather than
silently permissive.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
import uuid

from utils.logger import get_logger

logger = get_logger(__name__)

TABLE = 'refresh_token_families'

# How long after a rotation the superseded jti is still accepted. Covers two
# tabs (or a request the client retried) racing the same refresh; anything
# outside it is treated as replay.
REPLAY_GRACE_SECONDS = 30

# Rotation outcomes.
OK = 'ok'                    # current jti presented; rotated
GRACE = 'grace'              # superseded jti, inside the race window; rotated
LEGACY = 'legacy'            # token predates rotation; new family started
ADOPTED = 'adopted'          # token names a family we have no row for; started
REUSE = 'reuse'              # replay of a spent token; family revoked
REVOKED = 'revoked'          # family already revoked (logout, or an earlier reuse)
EXPIRED = 'expired'          # family outlived its refresh token
UNAVAILABLE = 'unavailable'  # database unreachable; caller proceeds unrotated

# Outcomes the caller must refuse the refresh on.
DENY = frozenset({REUSE, REVOKED, EXPIRED})


def _admin():
    # admin client justified: refresh_token_families is a service-role-only
    # credential table (RLS deny-by-default), read and written from the
    # pre-session token-refresh path.
    from database import get_supabase_admin_client
    return get_supabase_admin_client()


def _uuid_or_none(value) -> Optional[str]:
    """Claims arrive from a signed token but are still attacker-shaped input:
    the column is `uuid`, and a non-UUID string makes PostgREST 400 rather than
    return no rows. Normalize here so a malformed claim reads as 'no family'."""
    if not value:
        return None
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, AttributeError, TypeError):
        return None


def _parse_ts(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except (ValueError, TypeError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def new_jti() -> str:
    return str(uuid.uuid4())


def new_family_id() -> str:
    return str(uuid.uuid4())


def start_family(user_id: str, ttl: timedelta,
                 family_id: Optional[str] = None,
                 jti: Optional[str] = None,
                 superseded_jti: Optional[str] = None) -> Tuple[str, str]:
    """Record a new family and return (family_id, jti).

    `family_id` is supplied when adopting a token that names a family we have no
    row for -- keeping the id preserves the chain's identity, so the NEXT replay
    of a sibling token is still caught.

    `superseded_jti` is the token being spent to create the row. It goes straight
    into `previous_jti` so the grace window covers a chain's FIRST refresh too:
    without it, two tabs racing the very first refresh after login would each
    present the same never-yet-recorded jti, and the loser would be indicted for
    a replay of a token that had only ever been used once.

    Returns the ids either way: a failed insert must not stop someone logging
    in, it only means this chain is unprotected until its next refresh.
    """
    family_id = family_id or new_family_id()
    jti = jti or new_jti()
    now = datetime.now(timezone.utc)
    try:
        _admin().table(TABLE).insert({
            'id': family_id,
            'user_id': user_id,
            'current_jti': jti,
            'previous_jti': superseded_jti,
            'rotated_at': now.isoformat() if superseded_jti else None,
            'issued_at': now.isoformat(),
            'last_used_at': now.isoformat(),
            'expires_at': (now + ttl).isoformat(),
            'revoked': False,
        }).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[RefreshFamilies] Could not start family for "
                       f"{str(user_id)[:8]}...: {e}")
    return family_id, jti


def rotate(user_id: str, family_id: Optional[str], jti: Optional[str],
           ttl: timedelta) -> Tuple[str, Optional[str], Optional[str]]:
    """Advance a refresh-token family. Returns (outcome, family_id, next_jti).

    On a DENY outcome the caller must refuse the refresh; `next_jti` is None.
    On every other outcome the caller mints the next refresh token with the
    returned ids.
    """
    family_id = _uuid_or_none(family_id)
    jti = _uuid_or_none(jti)

    # ── Grandfathering, time-boxed ──────────────────────────────────────────
    # Every refresh token minted before this shipped carries no `fam`/`jti`, and
    # rejecting those would log out the entire signed-in user base the moment it
    # deployed. A claimless token is instead accepted ONCE and upgraded into a
    # family, so each live session converts on its first refresh and is protected
    # from then on.
    #
    # This branch is a migration, not a policy: legacy tokens cannot outlive
    # REFRESH_TOKEN_EXPIRY_DAYS (30) from the deploy, so after 2026-09-30 no
    # honest client can still present one and this branch should be deleted --
    # at which point a missing `fam` becomes what it ought to be, a forgery.
    if not family_id or not jti:
        fam, next_jti = start_family(user_id, ttl)
        return LEGACY, fam, next_jti

    try:
        rows = (_admin().table(TABLE)
                .select('id, user_id, current_jti, previous_jti, rotated_at, '
                        'expires_at, revoked')
                .eq('id', family_id).limit(1).execute()).data or []
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[RefreshFamilies] Lookup failed for family "
                       f"{family_id[:8]}...: {e}")
        return UNAVAILABLE, family_id, new_jti()

    if not rows:
        # The ordinary case for a chain's FIRST refresh: rows are created here
        # rather than at login, so the login path stays pure crypto and a hot
        # endpoint gains no write. Also covers a family the reaper removed.
        # Adopt the id so the chain keeps its identity and is protected from here.
        fam, next_jti = start_family(user_id, ttl, family_id=family_id,
                                     superseded_jti=jti)
        return ADOPTED, fam, next_jti

    row = rows[0]

    # A token signed for one user naming another user's family would be a key
    # compromise, not a replay; refuse it and say so loudly.
    if row.get('user_id') and str(row['user_id']) != str(user_id):
        logger.error(f"[RefreshFamilies] Family {family_id[:8]}... belongs to a "
                     f"different user than the presented token")
        _revoke(family_id, 'user_mismatch')
        return REUSE, family_id, None

    if row.get('revoked'):
        return REVOKED, family_id, None

    expires_at = _parse_ts(row.get('expires_at'))
    if expires_at and datetime.now(timezone.utc) > expires_at:
        return EXPIRED, family_id, None

    current = str(row.get('current_jti') or '')
    previous = str(row.get('previous_jti') or '')
    rotated_at = _parse_ts(row.get('rotated_at'))

    if jti == current:
        return _advance(user_id, family_id, jti, ttl)

    if previous and jti == previous and _within_grace(rotated_at):
        # Two tabs, one cookie, same millisecond. Not an attack: hand back the
        # family's live jti so the loser of the race keeps a working session,
        # without rotating again (which would spend the winner's token).
        logger.info(f"[RefreshFamilies] Concurrent refresh on family "
                    f"{family_id[:8]}...; served from the grace window")
        return GRACE, family_id, current

    # A jti of this family that is neither current nor a just-superseded one.
    # It was signed by us, so it was issued -- and it has already been spent.
    _revoke(family_id, 'reuse_detected')
    _report_reuse(user_id, family_id)
    return REUSE, family_id, None


def _within_grace(rotated_at: Optional[datetime]) -> bool:
    if rotated_at is None:
        return False
    age = (datetime.now(timezone.utc) - rotated_at).total_seconds()
    return 0 <= age <= REPLAY_GRACE_SECONDS


def _advance(user_id: str, family_id: str, presented_jti: str,
             ttl: timedelta) -> Tuple[str, str, str]:
    """Compare-and-swap the family onto a fresh jti.

    The `.eq('current_jti', presented)` is the whole point: two requests reading
    the same row and both writing would each believe they rotated, which is the
    one way an honest client could get itself locked out. Whichever write lands
    second matches nothing and falls into the grace check instead.
    """
    next_jti = new_jti()
    now = datetime.now(timezone.utc)
    try:
        result = (_admin().table(TABLE).update({
            'current_jti': next_jti,
            'previous_jti': presented_jti,
            'rotated_at': now.isoformat(),
            'last_used_at': now.isoformat(),
            'expires_at': (now + ttl).isoformat(),
        }).eq('id', family_id)
          .eq('current_jti', presented_jti)
          .eq('revoked', False).execute())
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[RefreshFamilies] Rotation write failed for family "
                       f"{family_id[:8]}...: {e}")
        return UNAVAILABLE, family_id, next_jti

    if result.data:
        return OK, family_id, next_jti

    # Nothing matched: another request rotated this family between our read and
    # our write, or it was revoked in the same window. Re-read to tell which.
    return _reclassify_after_lost_race(user_id, family_id, presented_jti)


def _reclassify_after_lost_race(user_id: str, family_id: str,
                                presented_jti: str) -> Tuple[str, str, Optional[str]]:
    try:
        rows = (_admin().table(TABLE)
                .select('current_jti, previous_jti, rotated_at, revoked')
                .eq('id', family_id).limit(1).execute()).data or []
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[RefreshFamilies] Re-read failed for family "
                       f"{family_id[:8]}...: {e}")
        return UNAVAILABLE, family_id, new_jti()

    if not rows:
        return UNAVAILABLE, family_id, new_jti()
    row = rows[0]
    if row.get('revoked'):
        return REVOKED, family_id, None
    if str(row.get('previous_jti') or '') == presented_jti and _within_grace(
            _parse_ts(row.get('rotated_at'))):
        return GRACE, family_id, str(row.get('current_jti'))
    _revoke(family_id, 'reuse_detected')
    _report_reuse(user_id, family_id)
    return REUSE, family_id, None


def _revoke(family_id: str, reason: str) -> None:
    try:
        _admin().table(TABLE).update({
            'revoked': True,
            'revoked_at': datetime.now(timezone.utc).isoformat(),
            'revoked_reason': reason,
        }).eq('id', family_id).execute()
    except Exception as e:  # noqa: BLE001
        logger.error(f"[RefreshFamilies] Could not revoke family "
                     f"{str(family_id)[:8]}...: {e}")


def _report_reuse(user_id: str, family_id: str) -> None:
    """A replayed refresh token is a security event, not an error.

    Nothing else in the stack would surface it: the caller turns it into an
    ordinary 401, which is the most common status this API returns. Report it
    explicitly so a real token theft is visible.
    """
    logger.warning(
        f"[RefreshFamilies] REFRESH TOKEN REUSE DETECTED | user "
        f"{str(user_id)[:8]}... | family {str(family_id)[:8]}... | "
        f"family revoked, all sessions on this chain ended"
    )
    try:
        import sentry_sdk
        with sentry_sdk.new_scope() as scope:
            scope.set_level('warning')
            scope.set_tag('security_event', 'refresh_token_reuse')
            scope.set_tag('user_id_prefix', str(user_id)[:8])
            scope.set_extra('family_id', str(family_id))
            sentry_sdk.capture_message(
                'Refresh token reuse detected; token family revoked',
                level='warning',
            )
    except Exception:  # noqa: BLE001
        pass


def revoke_user_families(user_id: str, reason: str) -> int:
    """Revoke every live family for a user. Returns the number revoked.

    Called wherever `users.last_logout_at` is stamped -- logout, password change,
    password reset. That stamp is still the platform's revocation mechanism and
    this does not replace it; it closes the same door on the rotation side so the
    two cannot disagree about whether a session is over.
    """
    if not user_id:
        return 0
    try:
        result = (_admin().table(TABLE).update({
            'revoked': True,
            'revoked_at': datetime.now(timezone.utc).isoformat(),
            'revoked_reason': reason,
        }).eq('user_id', user_id).eq('revoked', False).execute())
        return len(result.data or [])
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[RefreshFamilies] Could not revoke families for "
                       f"{str(user_id)[:8]}...: {e}")
        return 0


# ── Reaper ──────────────────────────────────────────────────────────────────
# One row per login, forever, is a table that eventually needs a DBA. Rows are
# deletable once every token that could name them has expired. Run opportunistically
# from the refresh path, at most once an hour per worker, so this needs no new
# cron entry and no scheduler to go quiet unnoticed; the SQL function is bounded
# (see the migration) so a backlog drains over several calls instead of taking one
# long lock.
_CLEANUP_INTERVAL = timedelta(hours=1)
_last_cleanup: Optional[datetime] = None


def maybe_cleanup() -> None:
    global _last_cleanup
    now = datetime.now(timezone.utc)
    if _last_cleanup is not None and now - _last_cleanup < _CLEANUP_INTERVAL:
        return
    _last_cleanup = now  # set before the call: a failure must not retry-loop
    try:
        result = _admin().rpc('cleanup_expired_refresh_token_families',
                              {'p_limit': 5000}).execute()
        deleted = result.data if isinstance(result.data, int) else 0
        if deleted:
            logger.info(f"[RefreshFamilies] Reaped {deleted} expired families")
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[RefreshFamilies] Cleanup failed: {e}")
