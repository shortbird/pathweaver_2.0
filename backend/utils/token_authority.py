"""Database-backed authority checks for long-lived tokens.

`session_manager` is deliberately pure crypto — it signs and verifies claims and
never touches the database. But two of the things it signs are *delegations of
authority* rather than statements of identity:

  * a masquerade token says "this superadmin may act as that user"
  * an acting-as token says "this parent may act as that dependent"

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

logger = get_logger(__name__)


def _admin():
    # admin client justified: auth utility — reads user identity/permissions to
    # make the access-control decision itself.
    from database import get_supabase_admin_client
    return get_supabase_admin_client()


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


def caller_may_masquerade(admin_row, target_row) -> bool:
    """The one rule for who may act as whom.

    A superadmin may act as anyone. An org admin may act as a member of their
    OWN organization who holds no admin-tier role (no org_admin, no
    superadmin) — the "view this teacher's / this family's actual setup" the
    front office keeps asking for. Every other pairing is refused. Used both
    when the session is granted (routes/admin/masquerade.py) and every time it
    is renewed (session_manager), so a demotion ends the session at the next
    refresh.
    """
    from utils.roles import _real_effective_roles
    if not admin_row or not target_row:
        return False
    admin_roles = set(_real_effective_roles(admin_row))
    if 'superadmin' in admin_roles:
        return True
    if 'org_admin' not in admin_roles:
        return False
    if not admin_row.get('organization_id') or \
            admin_row.get('organization_id') != target_row.get('organization_id'):
        return False
    target_roles = set(_real_effective_roles(target_row))
    return not (target_roles & {'org_admin', 'superadmin'})


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


def is_acting_as_still_authorized(parent_id: str, dependent_id: str) -> bool:
    """True iff `dependent_id` is still a dependent managed by `parent_id`.

    Mirrors DependentRepository.get_dependent()'s authorization check, which is
    what gates the original grant in routes/dependents.py. Fails CLOSED, for the
    same reason as the masquerade check.
    """
    if not parent_id or not dependent_id:
        return False
    try:
        rows = (_admin().table('users').select('id, is_dependent, managed_by_parent_id')
                .eq('id', dependent_id).limit(1).execute()).data
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[TokenAuthority] Acting-as re-check failed for {dependent_id[:8]}...: {e}")
        return False
    if not rows:
        return False
    row = rows[0]
    return bool(row.get('is_dependent')) and row.get('managed_by_parent_id') == parent_id
