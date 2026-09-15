"""Re-send a user their login information from the admin panel.

"Login information" is deliberately not a password. Optio never puts one in an
inbox (utils/invite_tokens.py has the reasoning), so what goes out is:

- the email address the account signs in with,
- a fresh single-use set-your-password link (14 days, and it confirms an
  unconfirmed address on use, so an invited user who never finished setup gets
  all the way in from one click),
- the sign-in steps, flavoured by role: students and parents hear about the
  mobile app, staff at an SIS org hear about the School Admin console.

Accounts with no real address -- dependents, username-only org students,
placeholder staff -- cannot receive this, and the caller gets told why rather
than a silent no-op.
"""

from typing import Any, Dict, List, Optional
from urllib.parse import quote

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

# Roles that use the mobile app day to day; staff live in the web app.
_MOBILE_ROLES = ('student', 'parent')
_STAFF_ROLES = ('advisor', 'org_admin', 'campus_coordinator')

# Every synthetic-address convention in the codebase. None of these inboxes
# exist, so an email there is a bounce at best.
_PLACEHOLDER_SUFFIXES = (
    '.placeholder.optioeducation.com',
    '@optio-internal-placeholder.local',
    '@pending.optio.local',
)

_USER_FIELDS = ('id, email, first_name, last_name, display_name, role, org_role, '
                'org_roles, organization_id, is_dependent, username')


class LoginInfoError(ValueError):
    """The account cannot receive login information; the message says why."""


# admin client justified: reached only from @require_admin (superadmin) routes;
#   reads any user's row across orgs to send them their own login details
from utils.admin_client import admin_client as _admin  # noqa: E402


def _is_placeholder(email: Optional[str]) -> bool:
    e = (email or '').strip().lower()
    return any(e.endswith(suffix) for suffix in _PLACEHOLDER_SUFFIXES)


def _first_name(user: Dict[str, Any]) -> str:
    return ((user.get('first_name') or '').strip()
            or (user.get('display_name') or '').strip().split(' ')[0]
            or 'there')


def _describe_unsendable(user: Dict[str, Any]) -> Optional[str]:
    """Why this account cannot get the email, or None when it can."""
    email = (user.get('email') or '').strip()
    if not email:
        if user.get('is_dependent'):
            return ('This is a dependent account with no email address. '
                    'Its parent signs in on its behalf.')
        if user.get('username'):
            return (f'This account signs in with the username "{user["username"]}" '
                    'and has no email address to send to.')
        return 'This account has no email address, so there is nowhere to send login information.'
    if _is_placeholder(email):
        return 'This is a placeholder account. Its email address is not a real inbox.'
    return None


def _org_name(org_id: Optional[str]) -> str:
    if not org_id:
        return ''
    rows = (_admin().table('organizations').select('name')
            .eq('id', org_id).limit(1).execute()).data
    return (rows[0].get('name') if rows else None) or ''


def _sis_org(org_id: Optional[str]) -> bool:
    if not org_id:
        return False
    try:
        from modules.enabled import module_enabled
        return module_enabled(org_id, 'sis')
    except Exception as e:  # noqa: BLE001
        logger.warning(f'login_info: could not read sis flag for org {org_id}: {e}')
        return False


def send_login_info(target_user_id: str) -> Dict[str, Any]:
    """Email `target_user_id` their login information.

    Returns {'email': ..., 'expiry_days': ...} on success. Raises
    LoginInfoError when the account has nothing to send to, and RuntimeError
    when the token or the send itself fails.
    """
    from utils.invite_tokens import INVITE_EXPIRY_DAYS, mint_invite_token
    from utils.roles import get_effective_roles
    from services.email_service import email_service

    admin = _admin()
    rows = (admin.table('users').select(_USER_FIELDS)
            .eq('id', target_user_id).limit(1).execute()).data
    if not rows:
        raise LoginInfoError('User not found')
    user = rows[0]

    reason = _describe_unsendable(user)
    if reason:
        raise LoginInfoError(reason)

    email = user['email'].strip()
    roles = get_effective_roles(user)
    org_id = user.get('organization_id')
    org_name = _org_name(org_id)
    show_mobile = any(r in _MOBILE_ROLES for r in roles)
    show_sis = any(r in _STAFF_ROLES for r in roles) and _sis_org(org_id)

    token = mint_invite_token(user['id'], admin=admin)
    if not token:
        raise RuntimeError('Could not create a set-password link')

    invite_link = f'{Config.FRONTEND_URL}/reset-password?token={token}&email={quote(email)}'
    login_url = f'{Config.FRONTEND_URL}/login'

    sent = email_service.send_login_info_email(
        user_email=email,
        user_name=_first_name(user),
        invite_link=invite_link,
        login_url=login_url,
        org_name=org_name,
        show_mobile=show_mobile,
        show_sis=show_sis,
        expiry_days=INVITE_EXPIRY_DAYS,
    )
    if not sent:
        raise RuntimeError('The email could not be sent')

    return {'email': email, 'expiry_days': INVITE_EXPIRY_DAYS}


def send_login_info_bulk(user_ids: List[str]) -> Dict[str, Any]:
    """One send per id; a failure on one never stops the rest.

    Returns {'sent': n, 'failed': [{'user_id', 'error'}, ...]}.
    """
    sent = 0
    failed: List[Dict[str, str]] = []
    for uid in user_ids:
        try:
            send_login_info(uid)
            sent += 1
        except (LoginInfoError, RuntimeError) as e:
            failed.append({'user_id': uid, 'error': str(e)})
        except Exception as e:  # noqa: BLE001
            logger.error(f'login_info: unexpected failure for {uid[:8]}: {e}')
            failed.append({'user_id': uid, 'error': 'Unexpected error'})
    return {'sent': sent, 'failed': failed}
