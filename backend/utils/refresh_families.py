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
without revoking anything. Long enough to cover a concurrent tab -- or a client
that never received the rotation's response and retried -- far short of the
window a stolen token needs.

**Failure is open, deliberately.** If the lookup or the write fails, the refresh
proceeds unrotated. Reuse detection is a defence in depth on top of
`users.last_logout_at`; a Supabase blip must not sign out the platform. The
failure is logged and reported, so a broken deployment is loud rather than
silently permissive.

**What a reuse event has to answer.** Revoking a family signs a real person out
of everything, so the report has to be good enough to tell WHY without a
database session. Sentry OPTIO-BACKEND-6N was 27 revocations across 22 users in
10 days under a single fingerprint that said only "reuse detected", which is
consistent with both a token thief and a client that lost a response. Every
reuse now carries:

  * `reuse_shape` -- which token was presented, and it is also the Sentry
    fingerprint, so the honest shape cannot bury the alarming one:
      `stale_previous`  the immediately-preceding jti, just outside the grace
                        window. A client that never saw the rotation's response.
      `unknown_jti`     a jti from further back, or from outside the chain. The
                        shape a replayed stolen token makes.
      `user_mismatch`   a token signed for a different user than owns the
                        family. Key compromise, not replay.
  * `same_client` -- whether the replay came from the same client as the
    rotation it replays, via `last_client_fp` (see the 20260827140000
    migration). The single most decisive field: `stale_previous` + same client
    is a race, `unknown_jti` + different client is theft.
  * how stale the presented token was, how old the family is, and how long since
    it was last used, plus 8-character jti prefixes for correlating the chain
    across events without putting live credentials in an error tracker.

**A lost rotation is not a replay.** When the jti a rotation minted has never
been presented by anyone, the chain has only ever had one party in it: the
client rotated and never received the response. That reads as
`stale_previous` at whatever distance the client next retries -- minutes or
hours, far outside any stopwatch -- so it is recognised by its shape instead
(`_rotation_was_lost`, and LOST_ROTATION_SECONDS for why). Those are served,
not revoked, and not reported: they are the honest half of what OPTIO-BACKEND-7E
was counting.

`GRACE` and `RECOVERED` hits are logged with their age. Nothing is wrong when
one happens, but the distribution of those ages is the only evidence for
whether REPLAY_GRACE_SECONDS is set anywhere near right -- and a rising rate of
recoveries would mean rotation responses are going missing somewhere upstream,
which is worth knowing on its own.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple
import hashlib
import uuid

from utils.logger import get_logger

logger = get_logger(__name__)

TABLE = 'refresh_token_families'

# How long after a rotation the superseded jti is still accepted. Covers two
# tabs (or a request the client retried) racing the same refresh; anything
# outside it is treated as replay.
#
# 30s until 2026-08-27. Sentry OPTIO-BACKEND-6N recorded 27 family revocations
# across 22 distinct users in 10 days -- each one an honest person silently
# signed out of everything -- and three of them landed 33, 35 and 47 seconds
# after the rotation they were racing. That is the shape of a client that never
# saw the rotation's response (dropped connection, backgrounded phone) and
# retried the only token it has, not of a thief: a stolen token is replayed from
# a device that was never in the chain, at an arbitrary distance from the last
# rotation, and this window does not help it.
#
# What the window actually costs: an attacker holding the immediately-preceding
# refresh token has 2 minutes rather than 30 seconds from the victim's rotation
# to use it, and gets the current pair rather than a rotation of their own. Any
# older token, and any token from a revoked family, is still refused outright.
REPLAY_GRACE_SECONDS = 120

# The grace window above is a stopwatch, and a lost rotation is not a timing
# problem -- so widening it again was never going to help. Sentry
# OPTIO-BACKEND-7E: 23 revocations across 22 distinct users in six days, all
# shape=stale_previous, 18 of them from the SAME client as the rotation they
# replayed, at distances of 158s, 180s, 443s, 520s, 1339s, 4964s, 19933s. Well
# outside any window worth having.
#
# What every one of them has in common is the giveaway: seconds_since_last_use
# == seconds_since_rotation, exactly. `last_used_at` is written on each
# rotation, so the two being equal means the jti that rotation MINTED was never
# presented -- not once, by anybody. The client rotated, never received or
# never stored the response, and went on holding the only token it has. There
# is no second party in the chain at all.
#
# So a stale_previous is served rather than revoked when all three hold:
#
#   1. the presented jti is the immediately-preceding one (never `unknown_jti`,
#      which is the shape a replayed stolen token makes),
#   2. the jti that rotation produced has never been used, and
#   3. the request fingerprints as the same client that performed the rotation.
#
# A thief clears (1) only by holding the one specific superseded token, clears
# (2) only while the victim is idle, and clears (3) only from the victim's own
# user agent AND IP -- and even then receives the family's live jti, the same
# token the victim already holds, exactly as the 120s window has always handed
# out. Condition (3) is a stricter test than the existing grace window applies
# at all. The bound below keeps the exposure finite rather than lasting the
# refresh token's full 30 days.
LOST_ROTATION_SECONDS = 24 * 3600

# Rotation outcomes.
OK = 'ok'                    # current jti presented; rotated
GRACE = 'grace'              # superseded jti, inside the race window; rotated
RECOVERED = 'recovered'      # superseded jti, rotation's output never used, same client
LEGACY = 'legacy'            # token predates rotation; new family started
ADOPTED = 'adopted'          # token names a family we have no row for; started
REUSE = 'reuse'              # replay of a spent token; family revoked
REVOKED = 'revoked'          # family already revoked (logout, or an earlier reuse)
EXPIRED = 'expired'          # family outlived its refresh token
UNAVAILABLE = 'unavailable'  # database unreachable; caller proceeds unrotated

# Outcomes the caller must refuse the refresh on.
DENY = frozenset({REUSE, REVOKED, EXPIRED})

# Shapes a reuse can take. The Sentry fingerprint, so each gets its own issue
# and its own rate -- see the module docstring for what each one means.
SHAPE_STALE_PREVIOUS = 'stale_previous'
SHAPE_UNKNOWN_JTI = 'unknown_jti'
SHAPE_USER_MISMATCH = 'user_mismatch'


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


def _client_fp(family_id: str) -> Optional[str]:
    """A comparison key for "is this the same client as last time?".

    sha256(family_id || user agent || client ip), truncated. Salting with the
    family id is what keeps this a diagnostic rather than a tracker: the value
    is only ever equal to itself within one chain, so it can answer the reuse
    question and cannot be used to follow a device between users or sessions.

    None when there is no request to read (a test, a background path). A missing
    fingerprint degrades the report to same_client='unknown'; it never blocks a
    refresh.
    """
    try:
        from flask import has_request_context, request
        if not has_request_context():
            return None
        from utils.client_ip import get_real_ip
        # get_real_ip reads X-Forwarded-For from the RIGHT (TRUSTED_PROXY_HOPS),
        # so a client cannot pick its own fingerprint by forging the header.
        material = f"{family_id}|{request.headers.get('User-Agent', '')}|{get_real_ip()}"
        return hashlib.sha256(material.encode('utf-8')).hexdigest()[:16]
    except Exception:  # noqa: BLE001 — diagnostics must never break a refresh
        return None


def _age_seconds(ts: Optional[datetime]) -> Optional[float]:
    if ts is None:
        return None
    return round((datetime.now(timezone.utc) - ts).total_seconds(), 1)


def _prefix(value) -> Optional[str]:
    """First 8 characters of a jti. Enough to follow one chain across events,
    useless as a credential -- a full jti in an error tracker would be one."""
    return str(value)[:8] if value else None


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
            'last_client_fp': _client_fp(family_id),
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
                        'expires_at, revoked, created_at, last_used_at, '
                        'last_client_fp')
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
        # A token signed for one user naming another user's family. Reported on
        # the same path as a replay -- it used to revoke in silence, which meant
        # the one shape here that implies a signing-key problem was the only one
        # Sentry never saw.
        _revoke(family_id, 'user_mismatch')
        _report_reuse(user_id, family_id, row, jti,
                      shape=SHAPE_USER_MISMATCH, owner_id=row.get('user_id'))
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
        #
        # The age is logged because the distribution of these is the only
        # evidence for whether REPLAY_GRACE_SECONDS is set anywhere near right.
        # A cluster of grace hits near the limit is the warning that the next
        # tightening -- or the next slow network -- starts signing people out.
        logger.info(
            f"[RefreshFamilies] Concurrent refresh on family {family_id[:8]}...; "
            f"served from the grace window | age={_age_seconds(rotated_at)}s "
            f"of {REPLAY_GRACE_SECONDS}s | same_client="
            f"{_same_client(row.get('last_client_fp'), family_id)}")
        return GRACE, family_id, current

    if previous and jti == previous and _rotation_was_lost(row, family_id):
        # The rotation this replays produced a jti nobody has ever presented,
        # and the request looks like the client that performed it. Nothing was
        # spent; the client simply never got the new token. See
        # LOST_ROTATION_SECONDS for why this is not the grace window with a
        # bigger number. Hand back the live jti, as the grace path does.
        logger.warning(
            f"[RefreshFamilies] Lost rotation recovered on family "
            f"{family_id[:8]}... | user {str(user_id)[:8]}... | "
            f"age={_age_seconds(rotated_at)}s of {LOST_ROTATION_SECONDS}s | "
            f"same_client=yes | presented_jti_prefix={_prefix(jti)} "
            f"current_jti_prefix={_prefix(current)} | the jti this rotation "
            f"minted was never used; serving it rather than revoking")
        return RECOVERED, family_id, current

    # A jti of this family that is neither current nor a just-superseded one.
    # It was signed by us, so it was issued -- and it has already been spent.
    _revoke(family_id, 'reuse_detected')
    _report_reuse(user_id, family_id, row, jti)
    return REUSE, family_id, None


def _rotation_was_lost(row: dict, family_id: str) -> bool:
    """Whether this family's last rotation went nowhere.

    True only when the jti that rotation minted has never been presented
    (`last_used_at` still equal to `rotated_at`, since `_advance` writes both),
    the rotation is recent enough to bound the exposure, and the caller
    fingerprints as the client that performed it. `same_client` must be a
    positive 'yes': 'unknown' (no fingerprint recorded, no request context) is
    not evidence and must not open the path.
    """
    rotated_at = _parse_ts(row.get('rotated_at'))
    if rotated_at is None:
        return False

    age = (datetime.now(timezone.utc) - rotated_at).total_seconds()
    if not 0 <= age <= LOST_ROTATION_SECONDS:
        return False

    last_used_at = _parse_ts(row.get('last_used_at'))
    if last_used_at is None:
        return False
    # Written in the same statement, so equality is exact; a second of slack
    # costs nothing and survives any future clock or serialization rounding.
    if abs((last_used_at - rotated_at).total_seconds()) > 1:
        return False

    return _same_client(row.get('last_client_fp'), family_id) == 'yes'


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
            # Whoever just rotated is the client this chain belongs to, as far
            # as the next reuse report is concerned.
            'last_client_fp': _client_fp(family_id),
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
                .select('current_jti, previous_jti, rotated_at, revoked, '
                        'created_at, last_used_at, last_client_fp')
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
    _report_reuse(user_id, family_id, row, presented_jti, lost_cas_race=True)
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


def _same_client(stored_fp: Optional[str], family_id: str) -> str:
    """'yes' / 'no' / 'unknown' -- whether this request looks like the client
    that last rotated this family.

    Deliberately a three-valued string rather than a bool: 'unknown' (nothing
    recorded, or no request context) must not read as 'no', which is the value
    that means theft.
    """
    if not stored_fp:
        return 'unknown'
    current = _client_fp(family_id)
    if not current:
        return 'unknown'
    return 'yes' if current == stored_fp else 'no'


def _reuse_shape(row: dict, presented_jti: str) -> str:
    """Which token was presented -- see the module docstring.

    The distinction the old single-fingerprint issue could not make: a replay of
    the immediately-preceding jti is what a client that lost the rotation's
    response looks like, and a jti from anywhere else in (or outside) the chain
    is what a stolen token looks like.
    """
    previous = str(row.get('previous_jti') or '')
    if previous and presented_jti == previous:
        return SHAPE_STALE_PREVIOUS
    return SHAPE_UNKNOWN_JTI


def _reuse_facts(row: dict, presented_jti: str, lost_cas_race: bool = False,
                 owner_id=None) -> Dict[str, Any]:
    """Everything about the revocation that is knowable at this moment.

    Gathered here rather than at the call sites so every reuse path reports the
    same fields, and so adding one is a single edit.
    """
    rotated_at = _parse_ts(row.get('rotated_at'))
    facts: Dict[str, Any] = {
        # How stale the presented token was. For stale_previous this is the
        # number REPLAY_GRACE_SECONDS is competing with -- 35s means the window
        # is too tight, 5 days means something kept a token far too long.
        'seconds_since_rotation': _age_seconds(rotated_at),
        'grace_window_seconds': REPLAY_GRACE_SECONDS,
        'seconds_since_last_use': _age_seconds(_parse_ts(row.get('last_used_at'))),
        'family_age_seconds': _age_seconds(_parse_ts(row.get('created_at'))),
        # Prefixes only: a full jti here would put a live credential in Sentry.
        'presented_jti_prefix': _prefix(presented_jti),
        'current_jti_prefix': _prefix(row.get('current_jti')),
        'previous_jti_prefix': _prefix(row.get('previous_jti')),
        # True when the reuse surfaced only after losing the compare-and-swap,
        # i.e. two requests were genuinely in flight together. Corroborates the
        # race reading of a stale_previous.
        'lost_cas_race': lost_cas_race,
    }
    if owner_id is not None:
        facts['family_owner_prefix'] = _prefix(owner_id)
    return facts


def _report_reuse(user_id: str, family_id: str, row: dict, presented_jti: str,
                  shape: Optional[str] = None, lost_cas_race: bool = False,
                  owner_id=None) -> None:
    """A replayed refresh token is a security event, not an error.

    Nothing else in the stack would surface it: the caller turns it into an
    ordinary 401, which is the most common status this API returns. Report it
    explicitly so a real token theft is visible -- and with enough detail to
    tell one from a client that simply lost a response, which is what Sentry
    OPTIO-BACKEND-6N could not do.

    Fingerprinted by shape, following the CSRF rejection split
    (middleware/csrf_protection.classify_csrf_failure): when the routine cause
    and the alarming one share an issue, the routine one wins on volume and
    hides the other.
    """
    shape = shape or _reuse_shape(row, presented_jti)
    facts = _reuse_facts(row, presented_jti, lost_cas_race=lost_cas_race,
                         owner_id=owner_id)
    same_client = _same_client(row.get('last_client_fp'), family_id)
    detail = ' '.join(f'{k}={v}' for k, v in facts.items())
    # One line, all of it: Sentry samples and Render logs do not, so a
    # reconstruction six weeks from now can start from the log alone.
    logger.warning(
        f"[RefreshFamilies] REFRESH TOKEN REUSE DETECTED | shape={shape} | "
        f"user {str(user_id)[:8]}... | family {str(family_id)[:8]}... | "
        f"same_client={same_client} | {detail} | "
        f"family revoked, all sessions on this chain ended"
    )
    try:
        import sentry_sdk
        with sentry_sdk.new_scope() as scope:
            scope.set_level('warning')
            scope.set_tag('security_event', 'refresh_token_reuse')
            scope.set_tag('reuse_shape', shape)
            # Searchable: `same_client:no` is the query that finds real theft,
            # and `reuse_shape:stale_previous same_client:yes` is the one that
            # says the grace window needs another look.
            scope.set_tag('same_client', same_client)
            scope.set_tag('user_id_prefix', str(user_id)[:8])
            scope.set_extra('family_id', str(family_id))
            for key, value in facts.items():
                scope.set_extra(key, value)
            scope.fingerprint = ['refresh-token-reuse', shape]
            sentry_sdk.capture_message(
                f'Refresh token reuse ({shape}); token family revoked',
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
