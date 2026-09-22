"""Database-backed authority checks for long-lived tokens.

`session_manager` is deliberately pure crypto — it signs and verifies claims and
never touches the database. But two of the things it signs are *delegations of
authority* rather than statements of identity:

  * a masquerade token says "this superadmin may act as that user"

Both were previously granted once and then renewed forever from the claims in
the expiring token, so the authority survived the thing that granted it: a
demoted superadmin, or a parent whose custody link had been removed, kept full
impersonation of the target account indefinitely (there is no revocation list —
the tokens are stateless).

This module holds the re-checks the refresh path runs, plus the per-user token
version that gives us revocation at all. It lives outside session_manager so
those checks stay unit-testable without a signing key, and so session_manager
keeps no import of `database` (which imports back into `utils`).
"""

from datetime import datetime, timezone
from typing import Optional

from utils.logger import get_logger
from utils.sis_roles import CAMPUS_COORDINATOR

logger = get_logger(__name__)


# admin client justified: auth utility — reads user identity/permissions to
# make the access-control decision itself.
from utils.admin_client import admin_client as _admin


def session_revoked_since(user_id: str, issued_at: Optional[datetime]) -> bool:
    """True if `user_id` invalidated their sessions after `issued_at`.

    Reuses the existing `users.last_logout_at` revocation stamp — the one
    written on logout, password change, and password reset — rather than
    introducing a second mechanism that could disagree with it.

    The refresh endpoint already applies this to ordinary sessions
    (routes/auth/login/tokens.py). It could not apply it to impersonation
    sessions: refresh_session() returned `datetime.now()` as the issue time for
    those, so `issued_at < last_logout_at` was never true and the check silently
    passed every time. Hence this helper, called with the token's REAL issue
    time from the impersonation refresh path.

    Fails OPEN on lookup failure: a database blip must not sign out the
    platform. Revocation is a deliberate act; an outage is not one.
    """
    if not user_id or issued_at is None:
        return False
    try:
        rows = (_admin().table('users').select('last_logout_at')
                .eq('id', user_id).limit(1).execute()).data
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[TokenAuthority] last_logout_at lookup failed for {user_id[:8]}...: {e}")
        return False
    if not rows:
        return False
    stamp = rows[0].get('last_logout_at')
    if not stamp:
        return False
    try:
        last_logout = datetime.fromisoformat(str(stamp).replace('Z', '+00:00'))
    except (ValueError, TypeError):
        return False
    if last_logout.tzinfo is None:
        last_logout = last_logout.replace(tzinfo=timezone.utc)
    return issued_at < last_logout


_MASQUERADE_ROW = 'id, role, org_role, org_roles, organization_id'

# The seats nobody may open. A masquerade hands the caller the target's whole
# session, so opening an admin is how you become one.
_NEVER_A_TARGET = {'org_admin', 'superadmin'}

# What a campus coordinator may NOT open, on top of that.
#
# `parent` is on this list on purpose, and it is the one exclusion that is not
# about rank. A coordinator is an org admin minus the money (utils/sis_roles.py,
# FINANCE_ROLES), and a family's own surface is where a school's money lives:
# GET /api/sis/parent/billing answers with that family's balance, invoices,
# payments and card-on-file to whoever holds the session, and inside a
# masquerade there is no coordinator left for the per-field redaction to act
# on. Opening a parent's seat would therefore hand back the single thing the
# role exists to withhold. Coordinators run registration and paperwork for
# families through the console, where the tiers still apply.
#
# `campus_coordinator` is on it for the ordinary reason: a peer's seat is not a
# smaller seat, which is also why an org admin may not open another org admin.
_COORDINATOR_MAY_NOT_OPEN = _NEVER_A_TARGET | {'campus_coordinator', 'parent'}


def masquerade_target_allowed(caller_roles, target_roles) -> bool:
    """The role half of the masquerade rule: may these caller roles open a seat
    held by these target roles?

    Split out of caller_may_masquerade so the "Viewing as" person list can ask
    the same question of a row it has already scoped to one organization
    (routes/role_view.py), instead of spelling the tiers out a second time.
    The org half stays with the caller — see below.
    """
    caller_roles = set(caller_roles or ())
    target_roles = set(target_roles or ())
    if 'superadmin' in caller_roles:
        return True
    if 'org_admin' in caller_roles:
        return not (target_roles & _NEVER_A_TARGET)
    if CAMPUS_COORDINATOR in caller_roles:
        return not (target_roles & _COORDINATOR_MAY_NOT_OPEN)
    return False


def caller_may_masquerade(admin_row, target_row) -> bool:
    """The one rule for who may act as whom.

    A superadmin may act as anyone. An org admin may act as a member of their
    OWN organization who holds no admin-tier role (no org_admin, no
    superadmin) — the "view this teacher's / this family's actual setup" the
    front office keeps asking for. A campus coordinator may act as the same
    school's teachers, students and observers: the front office runs the
    console day to day and hit the same "why can't this teacher see her class"
    question the admins did, but families stay out of reach because a family's
    seat carries the school's billing. Every other pairing is refused. Used
    both when the session is granted (routes/admin/masquerade.py) and every
    time it is renewed (session_manager), so a demotion ends the session at the
    next refresh.
    """
    from utils.roles import _real_effective_roles
    if not admin_row or not target_row:
        return False
    admin_roles = set(_real_effective_roles(admin_row))
    if 'superadmin' in admin_roles:
        return True
    if not (admin_roles & {'org_admin', CAMPUS_COORDINATOR}):
        return False
    if not admin_row.get('organization_id') or \
            admin_row.get('organization_id') != target_row.get('organization_id'):
        return False
    return masquerade_target_allowed(admin_roles, _real_effective_roles(target_row))


def is_masquerade_still_authorized(admin_id: str, target_id: str = None) -> bool:
    """True iff `admin_id` may still act as `target_id` (see caller_may_masquerade).

    Fails CLOSED: unlike the token-version check above, this decides whether
    someone may act as another user, and the safe answer when we cannot
    confirm the grant is to stop renewing it. Without a target id only a
    superadmin qualifies (the pre-2026-08-28 rule).
    """
    if not admin_id:
        return False
    try:
        rows = (_admin().table('users').select(_MASQUERADE_ROW)
                .eq('id', admin_id).limit(1).execute()).data
        admin_row = rows[0] if rows else None
        if not admin_row:
            return False
        if not target_id:
            return admin_row.get('role') == 'superadmin'
        trows = (_admin().table('users').select(_MASQUERADE_ROW)
                 .eq('id', target_id).limit(1).execute()).data
        return caller_may_masquerade(admin_row, trows[0] if trows else None)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[TokenAuthority] Masquerade re-check failed for {admin_id[:8]}...: {e}")
        return False


