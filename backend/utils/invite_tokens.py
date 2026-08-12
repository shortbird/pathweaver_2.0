"""Account-setup invite links.

One link that does two jobs: it proves the person controls the email address and
it lets them choose their own password. We mint a `password_reset_tokens` row
and let `/api/auth/reset-password` consume it — that endpoint confirms an
unconfirmed email when the token is used, so a single click gets a brand-new
account all the way in.

Invites sit in inboxes for days, so they expire in weeks rather than the one
hour a genuine password reset gets.

**Never email a password.** A password in an inbox is an unexpiring copy of a
credential sitting in unencrypted storage, sent to an address nobody has
verified yet — a typo'd address hands a stranger a working login. The invite
link expires, is single-use, and can only be redeemed by whoever received it.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets

from utils.logger import get_logger

logger = get_logger(__name__)

# Invites sit in inboxes for days; password resets expire in an hour.
INVITE_EXPIRY_DAYS = 14


def mint_invite_token(user_id: str, admin=None,
                      expiry_days: int = INVITE_EXPIRY_DAYS) -> Optional[str]:
    """Create a set-your-password token for `user_id`, or None if the write fails.

    Callers mid-create pass the admin client they're already holding; everyone
    else lets this open its own.
    """
    if admin is None:
        from database import get_supabase_admin_client
        # admin client justified: password_reset_tokens is a service-role-only credential table; minting is reached only from admin-gated invite flows, and the row is pinned to the user_id being invited
        admin = get_supabase_admin_client()

    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)
    try:
        admin.table('password_reset_tokens').insert({
            'user_id': user_id,
            'token': token,
            'expires_at': (now + timedelta(days=expiry_days)).isoformat(),
            'used': False,
            'created_at': now.isoformat(),
        }).execute()
    except Exception as e:  # noqa: BLE001
        logger.error(f'mint_invite_token: insert failed for {user_id[:8]}: {e}')
        return None
    return token
