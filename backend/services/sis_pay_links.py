"""
Signed "pay this invoice" links, for the invoice a family receives by email.

iCreate, 2026-08-06: "the sent invoice should include a link to pay via stripe."

A link in an email cannot require a login. The parent opening it is on their
phone, six weeks after the invoice arrived, and any redirect through a sign-in
page is where they give up and the school chases the payment by hand instead.
So the token IS the authorization: holding the link lets you pay that one
invoice, and nothing else.

What that deliberately allows: anyone the parent forwards the link to can pay
their bill. That is the same property a paper remittance slip has, and it is
the right trade — the downside of a stranger paying your tuition is not a
downside.

What it must never allow is reading anything. The link's only powers are "start
a checkout for this invoice" and "record the payment that checkout produced".
It exposes the amount due (Stripe shows it) and nothing else: no roster, no
family record, no other invoice.

Stateless — an HMAC over the invoice id, keyed on FLASK_SECRET_KEY, so there is
no table to grow and nothing to clean up. Rotating that key invalidates every
outstanding link, which is the correct behaviour for a compromise and is worth
knowing before rotating it casually.
"""

import hmac
from hashlib import sha256
from typing import Optional

from app_config import Config
from utils.logger import get_logger
from utils.validation import validate_uuid

logger = get_logger(__name__)

# Half a SHA-256 is 128 bits of tag. Forging one is not a thing that happens;
# the shorter token keeps the printed URL on one line of a PDF.
_SIG_CHARS = 32


def _sign(invoice_id: str) -> str:
    # Config.SECRET_KEY — FLASK_SECRET_KEY is the env var it reads, not the
    # attribute. Config refuses to start without it, so this is belt and braces.
    secret = (Config.SECRET_KEY or '').encode()
    if not secret:
        raise RuntimeError('FLASK_SECRET_KEY is required to sign payment links')
    return hmac.new(secret, f'sis-invoice-pay:{invoice_id}'.encode(), sha256).hexdigest()[:_SIG_CHARS]


def make_token(invoice_id: str) -> str:
    return f'{invoice_id}.{_sign(invoice_id)}'


def invoice_id_from_token(token: str) -> Optional[str]:
    """The invoice this token pays for, or None if it isn't a valid token.

    Compared with compare_digest so a wrong signature takes the same time as a
    right one — a timing oracle here would let someone forge a link one
    character at a time.
    """
    if not token or '.' not in token:
        return None
    invoice_id, _, sig = token.rpartition('.')
    ok, _ = validate_uuid(invoice_id)
    if not ok:
        return None
    try:
        expected = _sign(invoice_id)
    except RuntimeError:
        logger.error('payment link verification attempted with no secret key configured')
        return None
    return invoice_id if hmac.compare_digest(sig, expected) else None


def pay_url(invoice_id: str) -> str:
    """The absolute URL that goes in the email and the PDF.

    Anchored on the API origin, not the app's, because it is a redirect into
    Stripe rather than a page — nothing renders here.
    """
    base = (Config.BACKEND_URL or Config.FRONTEND_URL or '').rstrip('/')
    return f'{base}/api/sis/pay/{make_token(invoice_id)}'
