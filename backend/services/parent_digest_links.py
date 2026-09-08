"""Signed unsubscribe links for the weekly parent digest.

An unsubscribe link in an email cannot require a login. A parent who wants out
of a school email and is asked to sign in first does not sign in — they mark the
message as spam, and the school's whole domain pays for it. Gmail and Apple Mail
also POST the RFC 8058 one-click header with no cookies at all, so a session is
not available even in principle.

So the token IS the authorization, exactly as services/sis_pay_links does for
"pay this invoice". Its only power is to turn OFF one notification type for the
user it names. It reads nothing, and it cannot turn anything on: the worst a
leaked or forwarded token can do is stop an email the recipient asked to stop.

Stateless HMAC over the user id, keyed on FLASK_SECRET_KEY. Rotating that key
invalidates every outstanding link, which is correct for a compromise and worth
knowing before rotating it casually.
"""

import hmac
from hashlib import sha256
from typing import Optional

from app_config import Config
from utils.logger import get_logger
from utils.validation import validate_uuid

logger = get_logger(__name__)

# Namespaced so this signature can never be replayed as a payment link, and
# vice versa. The two grant different powers over different objects.
_NS = 'parent-digest-unsubscribe'

# Half a SHA-256 is 128 bits of tag; forging one is not a thing that happens.
_SIG_CHARS = 32


def _sign(user_id: str) -> str:
    secret = (Config.SECRET_KEY or '').encode()
    if not secret:
        raise RuntimeError('FLASK_SECRET_KEY is required to sign unsubscribe links')
    return hmac.new(secret, f'{_NS}:{user_id}'.encode(), sha256).hexdigest()[:_SIG_CHARS]


def make_token(user_id: str) -> str:
    return f'{user_id}.{_sign(user_id)}'


def user_id_from_token(token: str) -> Optional[str]:
    """The user this token unsubscribes, or None if it is not a valid token.

    compare_digest so a wrong signature costs the same as a right one; a timing
    oracle would let someone forge a link one character at a time.
    """
    if not token or '.' not in token:
        return None
    user_id, _, sig = token.rpartition('.')
    ok, _ = validate_uuid(user_id)
    if not ok:
        return None
    try:
        expected = _sign(user_id)
    except RuntimeError:
        logger.error('digest unsubscribe attempted with no secret key configured')
        return None
    return user_id if hmac.compare_digest(sig, expected) else None


def unsubscribe_url(user_id: str) -> str:
    """The absolute URL for the footer link and the List-Unsubscribe header.

    Anchored on the API origin: nothing here is a page in the app, and the
    one-click header is POSTed by the mail client directly.
    """
    base = (Config.BACKEND_URL or Config.FRONTEND_URL or '').rstrip('/')
    return f'{base}/api/parent-digest/unsubscribe?token={make_token(user_id)}'
