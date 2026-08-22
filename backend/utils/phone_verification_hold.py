"""
The phone-verification hold: is this adult locked out until they verify a
phone number?

Lives in utils, not services, for the same reason as signature_hold: the
asker is middleware, running before any route on every API request, deciding
whether the caller may proceed at all (middleware may not import services;
see tests/unit/test_import_layers).

The rule (iCreate's ask, 2026-08-21): in an org whose feature flags carry
sis_settings.require_adult_phone_verification, every ADULT org account --
org_admin, campus_coordinator, advisor, parent -- must have verified a phone
number by SMS code before they can use the platform. Until then they get one
screen (the verification flow) and nothing else. Students and observers are
not held: the requirement is about being reachable when a school needs to
reach the adults responsible for kids, and a student's learning is not
leverage over anyone's paperwork -- same stance as signature_hold.

Verified means users.phone_verified_at is set, which only the verification
service writes, and only after the user typed back a code texted to that
number.

Caching, copied from signature_hold because the failure modes are identical:

  not held -> cached for _CLEAR_TTL seconds, so ordinary traffic never queries
  held     -> never cached, so verifying frees the person on their very next
              request, in every worker, with no invalidation to get wrong

The org's flag is cached the same 60s regardless of value: flipping the flag
is an admin action whose one-minute propagation is fine, and an org-wide
cache miss storm on every request is not.

Fail open everywhere. This gate exists to make one org's adults verify one
phone number; no bug in it may take the platform down for anybody.
"""

import time
from typing import Any, Dict, Optional, Tuple

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

# How long a clear result is trusted.
_CLEAR_TTL = 60.0

# The org roles that make someone an adult the school must be able to reach.
_ADULT_ORG_ROLES = frozenset({'org_admin', 'campus_coordinator', 'advisor',
                              'parent'})

# user_id -> monotonic deadline until which they are known to be clear.
_clear_until: Dict[str, float] = {}

# org_id -> (flag, monotonic deadline). Both values cached, unlike the user
# cache: an org row read is per-org, not per-user, and staleness here only
# delays an admin's flag flip by a minute.
_org_flag: Dict[str, Tuple[bool, float]] = {}


def _admin():
    # admin client justified: access-control utility -- reads the rows that
    # decide the caller's own access, before any role context exists.
    return get_supabase_admin_client()


def clear_cache(user_id: Optional[str] = None) -> None:
    """Forget the cached clear result for one user, or everyone (plus the org
    flags). Verifying does not need it -- a held user is never cached -- but
    tests and flag flips do."""
    if user_id is None:
        _clear_until.clear()
        _org_flag.clear()
    else:
        _clear_until.pop(user_id, None)


def org_requires_verification(org_id: Optional[str]) -> bool:
    """Does this org require its adults to verify a phone number?"""
    if not org_id:
        return False
    cached = _org_flag.get(org_id)
    if cached is not None and cached[1] > time.monotonic():
        return cached[0]
    try:
        rows = (_admin().table('organizations')
                .select('feature_flags')
                .eq('id', org_id).limit(1).execute()).data or []
    except Exception as e:
        logger.warning(f'Phone gate: org flag lookup failed for {org_id}: {e}')
        return False
    flags = (rows[0].get('feature_flags') if rows else None) or {}
    sis = flags.get('sis_settings') or {}
    required = bool(sis.get('require_adult_phone_verification'))
    _org_flag[org_id] = (required, time.monotonic() + _CLEAR_TTL)
    return required


def requires_verification(user: Dict[str, Any]) -> bool:
    """Is this user (a row with organization_id, role, org_role, org_roles,
    phone_verified_at) currently held for phone verification?

    Used directly by /api/auth/me so the web app can route to the screen, and
    by is_blocked below. Verified users and non-adults are never held.
    """
    if not user:
        return False
    if user.get('phone_verified_at'):
        return False
    org_id = user.get('organization_id')
    if not org_id:
        # Platform users (superadmin included) are out of scope by definition.
        return False
    roles = set(user.get('org_roles') or [])
    if user.get('org_role'):
        roles.add(user['org_role'])
    if not roles & _ADULT_ORG_ROLES:
        return False
    return org_requires_verification(org_id)


def is_blocked(user_id: str) -> bool:
    """Fast path for the middleware: is this request from a held adult?

    One indexed users read on a miss, nothing at all on a cached clear.
    """
    if not user_id:
        return False
    deadline = _clear_until.get(user_id)
    if deadline is not None and deadline > time.monotonic():
        return False

    try:
        rows = (_admin().table('users')
                .select('organization_id, role, org_role, org_roles, '
                        'phone_verified_at')
                .eq('id', user_id).limit(1).execute()).data or []
    except Exception as e:
        # Fail OPEN: a database hiccup must not lock a school out.
        logger.warning(f'Phone gate: user lookup failed for {user_id}: {e}')
        return False
    if not rows or not requires_verification(rows[0]):
        _clear_until[user_id] = time.monotonic() + _CLEAR_TTL
        return False
    return True
