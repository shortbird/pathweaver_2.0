"""Create an Optio account from an email address, from /admin/users.

A superadmin types an email, picks a role and (optionally) an org. This makes
the auth user and the profile row with the role already in place, then emails
a link to /auth/welcome, where the person finishes setup one of three ways:

- Continue with Google or Apple. Both OAuth callbacks find an existing profile
  by email and sign into it (routes/auth/google_oauth.py, apple_oauth.py, case
  C), so the account they land in is this one, role and all.
- Choose a password. The link carries a single-use invite token that
  /api/auth/reset-password consumes, the same as every other invite.

There is no restricted or pending state to clear afterwards: access in Optio
comes from the role, and the role is set here, before the email goes out. So
the first sign-in, by whichever door, is the full account.

The auth user is created with its email already confirmed. Supabase only links
an OAuth identity onto an existing user whose email is verified; with an
unconfirmed address the Google path would depend on GoTrue's handling of
unverified identities, which we do not control. Confirming here is no wider
than the invite itself: whoever reads that inbox can already take the account
with the link.
"""

from typing import Any, Dict, Optional
from urllib.parse import quote
import re
import secrets
import time

from app_config import Config
from utils.logger import get_logger
from utils.log_scrubber import mask_email

logger = get_logger(__name__)

# Roles a platform account (no org) can hold. superadmin is deliberately absent:
# minting another superadmin is not something a typo in a form should be able to do.
PLATFORM_ROLES = ('student', 'parent', 'advisor', 'observer')
# Org roles. campus_coordinator and org_admin only exist inside an org.
ORG_ROLES = ('student', 'parent', 'advisor', 'observer', 'org_admin', 'campus_coordinator')

_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
_MAX_NAME_LEN = 100


class AccountInviteError(ValueError):
    """The account cannot be created; the message says why, for the admin."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


# admin client justified: reached only from the @require_admin (superadmin)
#   create-account route; creates an auth user and a profile row for someone
#   who has no session yet, in any org
from utils.admin_client import admin_client as _admin  # noqa: E402


def _profile_fields(user_id: str, email: str, role: str, org_id: Optional[str],
                    first: str, last: str) -> Dict[str, Any]:
    """The users row. Org members are role='org_managed' with the real role in
    org_role/org_roles; platform users carry the real role directly."""
    profile: Dict[str, Any] = {
        'id': user_id,
        'email': email,
        'first_name': first or None,
        'last_name': last or None,
        'display_name': f'{first} {last}'.strip() or email.split('@')[0],
    }
    if org_id:
        profile.update({
            'role': 'org_managed',
            'org_role': role,
            'org_roles': [role],
            'organization_id': org_id,
        })
    else:
        profile['role'] = role
    return profile


def create_account_invite(email: str, role: str, organization_id: Optional[str] = None,
                          first_name: str = '', last_name: str = '') -> Dict[str, Any]:
    """Create the account and email the setup link.

    Returns {'user_id', 'email', 'email_sent'}. email_sent False means the
    account exists but the mail did not leave, and the admin should use Send
    Login Info. Raises AccountInviteError for anything the admin can fix.
    """
    email = (email or '').strip().lower()
    role = (role or '').strip()
    org_id = (organization_id or '').strip() or None
    first = (first_name or '').strip()[:_MAX_NAME_LEN]
    last = (last_name or '').strip()[:_MAX_NAME_LEN]

    if not _EMAIL_RE.match(email):
        raise AccountInviteError('Enter a valid email address')
    allowed = ORG_ROLES if org_id else PLATFORM_ROLES
    if role not in allowed:
        if not org_id and role in ORG_ROLES:
            raise AccountInviteError(f'{role} is an org role. Pick an organization first.')
        raise AccountInviteError(f'"{role}" is not a role this form can give')

    from repositories.organization_repository import OrganizationRepository
    from repositories.user_repository import UserRepository

    admin = _admin()
    users = UserRepository(client=admin)

    # Lookup is exact, and email is lower-cased above. A stored mixed-case twin
    # still cannot slip through: auth.create_user below refuses the address.
    if users.find_by_email(email):
        raise AccountInviteError(
            'An account with this email already exists. Find it in the list and '
            'use Send Login Info instead.', status=409)

    org_name = ''
    if org_id:
        org = OrganizationRepository(client=admin).find_by_id(org_id)
        if not org:
            raise AccountInviteError('That organization does not exist', status=404)
        org_name = org.get('name') or ''

    try:
        auth = admin.auth.admin.create_user({
            'email': email,
            # Placeholder. Nobody knows it; they set their own or use Google/Apple.
            'password': secrets.token_urlsafe(24),
            'email_confirm': True,
            'user_metadata': {'first_name': first, 'last_name': last},
        })
    except Exception as e:  # noqa: BLE001
        logger.error(f'account_invite: auth create failed for {mask_email(email)}: {e}')
        raise AccountInviteError('Could not create the account. Is the email already in use?') from e
    if not auth or not auth.user:
        raise AccountInviteError('Could not create the account')
    user_id = auth.user.id

    profile = _profile_fields(user_id, email, role, org_id, first, last)
    # The auth user can take a beat to be visible to the users FK; retry briefly
    # (same race sis_service.create_org_teacher handles).
    for attempt in range(3):
        try:
            users.create(profile)
            break
        except Exception as e:  # noqa: BLE001
            # The repository wraps the PostgREST error; the FK code is on the cause.
            msg = f'{e} {e.__cause__}'.lower()
            if ('foreign key' in msg or '23503' in msg) and attempt < 2:
                time.sleep(0.5 * (attempt + 1))
                continue
            logger.error(f'account_invite: profile insert failed for {user_id[:8]}: {e}')
            try:
                admin.auth.admin.delete_user(user_id)
            except Exception as _exc:  # noqa: BLE001
                logger.debug('rollback of the new auth user failed: %s', _exc, exc_info=True)
            raise AccountInviteError('Could not create the account') from e

    if role == 'student':
        # Diploma + pillar rows, so the portfolio and XP views have something to show.
        from routes.auth.google_oauth import ensure_user_diploma_and_skills
        ensure_user_diploma_and_skills(admin, user_id, first, last)

    email_sent = send_account_invite(user_id, email, first, org_name, admin=admin)
    logger.info(f'account_invite: created {user_id[:8]} as {role}'
                f'{" in org " + org_id[:8] if org_id else ""}; email_sent={email_sent}')
    return {'user_id': user_id, 'email': email, 'email_sent': email_sent}


def send_account_invite(user_id: str, email: str, first_name: str, org_name: str = '',
                        admin=None) -> bool:
    """Mint the setup token and send the welcome email. False on any failure."""
    from utils.invite_tokens import INVITE_EXPIRY_DAYS, mint_invite_token
    from services.email_service import email_service

    token = mint_invite_token(user_id, admin=admin)
    if not token:
        return False
    link = f'{Config.FRONTEND_URL}/auth/welcome?token={token}&email={quote(email)}'
    try:
        return bool(email_service.send_account_invite_email(
            user_email=email,
            user_name=first_name or 'there',
            invite_link=link,
            org_name=org_name,
            expiry_days=INVITE_EXPIRY_DAYS,
        ))
    except Exception as e:  # noqa: BLE001
        logger.warning(f'account_invite: email failed for {mask_email(email)}: {e}')
        return False
