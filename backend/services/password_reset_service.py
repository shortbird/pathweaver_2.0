"""Mint a password-reset link and email it.

Used by a school admin's "Reset password" on an email account
(routes/admin/organization_users.py). The person's own "Forgot your
password?" (routes/auth/password.py) still mints its link inline, with the
same token rules; move it here when that route next changes. The admin
button used to refuse email accounts outright ("new_password is required")
because it only knew how to hand a username student a new password to read
aloud; for an email student the right move is the same link the student would
get by asking for it themselves (2026-10-06).

The stored token is its hash (utils/reset_tokens.py); the link carries the
plaintext.
"""

from app_config import Config
from utils.invite_tokens import mint_invite_token


def send_reset_link(admin_client, user_id: str, email: str, user_name: str,
                    expiry_hours: int) -> bool:
    """Store a fresh reset token for `user_id` and email the link to `email`.

    Returns whether the mail went out; False too when the token row could not
    be written. The token row is utils.invite_tokens' (hashed, single use),
    which counts in whole days, so an expiry under a day rounds up to one.
    """
    from services.email_service import email_service

    token = mint_invite_token(user_id, admin=admin_client,
                              expiry_days=max(1, -(-expiry_hours // 24)))
    if not token:
        return False
    return bool(email_service.send_password_reset_email(
        user_email=email,
        user_name=user_name or 'there',
        reset_link=f"{Config.FRONTEND_URL}/reset-password?token={token}",
        expiry_hours=expiry_hours,
    ))
