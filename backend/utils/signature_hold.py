"""
The paperwork hold: is this guardian locked out until they sign something?

Lives in utils, not services, because the thing that ASKS is middleware -- it
runs before any route, on every API request, to decide whether this caller may
proceed at all. That makes it the same kind of primitive as
utils/auth/decorators: an access-control check that reads the database to
decide its own caller's access, below the layer whose access it decides.
(middleware may not import services; see tests/unit/test_import_layers.)

The half that needs the onboarding service -- rendering the documents that lift
the hold -- lives in services/sis_access_gate.py, which is where routes call.

A school can mark a document it sends to a family as REQUIRED (see the
20260818 migration). Until every required item on that assignment is done, the
guardian gets one screen -- the documents waiting for their signature -- and
nothing else. This module is the single answer to "is this person held?", used
by the middleware that enforces it, by the route the web app polls, and by the
family portal.

Three properties worth stating, because each one is a decision:

**Guardians only.** The hold is scoped to `audience='family'` assignments, and
a user who holds any staff role is never locked out by it. A parent who also
teaches at the school would otherwise lose their classroom over their own
child's permission slip -- and their teaching is not the thing being gated.
This mirrors useICreateRegistrationGate, which exempts parent+teacher staff
from the registration gate for exactly the same reason.

**Their students are not held.** The person who must sign is the person who is
stopped. A child's learning is not leverage over a parent's paperwork, and the
office has reminders and the release below for the case where the parent simply
does not sign.

**No masquerade exemption.** An admin masquerading into a held parent sees the
hold, because that is what the parent sees, and the value of masquerading is
that its divergences from reality can be counted on one finger (CLAUDE.md, and
the one exemption that does exist is the registration gate's). An admin who
needs the account unheld releases the hold -- an action that is logged as
itself -- rather than stepping around it invisibly.

Caching. The check runs on API requests, so the common answer must be cheap.
The asymmetry is deliberate:

  not held -> cached for _CLEAR_TTL seconds, so ordinary traffic never queries
  held     -> never cached, so signing frees the person on their very next
              request, in every worker, with no invalidation to get wrong

Caching the "held" answer would be the version of this that strands a parent
who has just signed, which is the one failure mode that must not happen.
"""

import time
from typing import Any, Dict, List, Optional

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

# How long a clear result is trusted. Short enough that a newly-sent required
# document takes effect while the office is still looking at the screen.
_CLEAR_TTL = 60.0

# Roles that mean "this person works here". Any of them exempts the user from
# the global hold; see the module docstring.
_STAFF_ROLES = frozenset({'org_admin', 'campus_coordinator', 'advisor',
                          'superadmin', 'observer'})

# user_id -> monotonic deadline until which they are known to be clear.
_clear_until: Dict[str, float] = {}


def _admin():
    # admin client justified: access-control utility -- reads the assignments
    # that decide the caller's own access, before any role context exists.
    return get_supabase_admin_client()


def clear_cache(user_id: Optional[str] = None) -> None:
    """Forget the cached clear result for one user, or everyone.

    Called when a required document is sent or released. Signing does not need
    it -- a held user is never cached in the first place.
    """
    if user_id is None:
        _clear_until.clear()
    else:
        _clear_until.pop(user_id, None)


def _item_outstanding(item: Dict[str, Any]) -> bool:
    """An item that still holds the assignment open.

    Optional items don't hold anybody, and 'rejected' counts as outstanding:
    the office sent it back, so it is not done.
    """
    if not item.get('required', True):
        return False
    return item.get('status') not in ('complete', 'approved')


def _outstanding(assignment: Dict[str, Any]) -> bool:
    return any(_item_outstanding(i) for i in (assignment.get('items') or []))


def is_staff(user_id: str) -> bool:
    """Does this account work at the school? Staff are never globally held."""
    try:
        rows = (_admin().table('users')
                .select('role, org_role, org_roles')
                .eq('id', user_id).limit(1).execute()).data or []
    except Exception as e:
        # Fail OPEN on a lookup error. A database hiccup must not lock a school
        # out of its own platform; the office can still see who has not signed.
        logger.warning(f'Access gate: role lookup failed for {user_id}: {e}')
        return True
    if not rows:
        return True
    u = rows[0]
    held = set(u.get('org_roles') or [])
    for key in ('role', 'org_role'):
        if u.get(key):
            held.add(u[key])
    return bool(held & _STAFF_ROLES)


def blocking_assignments(user_id: str) -> List[Dict[str, Any]]:
    """The required family assignments this person has not finished.

    Empty means they are free to use the platform. Ordered oldest first, which
    is the order the office sent them and the order they should be worked
    through.
    """
    if not user_id:
        return []
    try:
        rows = (_admin().table('sis_onboarding_assignments')
                .select('*')
                .eq('user_id', user_id)
                .eq('blocks_access', True)
                .eq('audience', 'family')
                .order('created_at')
                .execute()).data or []
    except Exception as e:
        # Fail open, as above: an unreadable assignments table is our problem,
        # not something to charge to every family in the school.
        logger.warning(f'Access gate: assignment lookup failed for {user_id}: {e}')
        return []
    return [r for r in rows if _outstanding(r)]


def is_blocked(user_id: str) -> bool:
    """Fast path for the middleware: is this request from a held guardian?

    One indexed query on a miss, nothing at all on a cached clear.
    """
    if not user_id:
        return False
    deadline = _clear_until.get(user_id)
    if deadline is not None and deadline > time.monotonic():
        return False

    outstanding = blocking_assignments(user_id)
    if not outstanding or is_staff(user_id):
        _clear_until[user_id] = time.monotonic() + _CLEAR_TTL
        return False
    return True


def release(org_id: str, assignment_id: str) -> Dict[str, Any]:
    """Lift the hold on one assignment without signing it.

    The office needs this: a family that cannot sign (no device, a document
    sent in error, a signature collected on paper) must not be stuck on a
    screen with no way past it and no way to reach anyone about it. The
    paperwork stays assigned and stays outstanding -- only the hold comes off,
    so the send still shows as unsigned on the tracking page.
    """
    rows = (_admin().table('sis_onboarding_assignments')
            .select('id, user_id, organization_id, blocks_access')
            .eq('id', assignment_id).limit(1).execute()).data or []
    row = rows[0] if rows else None
    if not row or row.get('organization_id') != org_id:
        return {'error': 'Not found', 'status': 404}
    if not row.get('blocks_access'):
        return {'released': False}
    (_admin().table('sis_onboarding_assignments')
     .update({'blocks_access': False}).eq('id', assignment_id).execute())
    clear_cache(row['user_id'])
    return {'released': True, 'user_id': row['user_id']}
