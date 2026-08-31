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


# ── Autopay links ────────────────────────────────────────────────────────────
#
# Optio Academy, 2026-08-31: tuition is billed monthly, and the parent sets the
# monthly charge up themselves from the emailed invoice. The one-time pay link
# above cannot do that — autopay setup used to require a signed-in guardian, and
# a login wall in an email is where the parent stops (the whole reason the pay
# link exists).
#
# A SEPARATE signature namespace, deliberately. The two links grant different
# powers: paying once moves money and ends, while autopay setup saves a card and
# schedules future charges against it. Signing both with one token would mean a
# forwarded "pay this bill" link silently carried the power to enrol that
# invoice in a payment plan, which is not what the sender agreed to.
#
# The installment count is signed INTO the token rather than passed as a query
# parameter, so the schedule the school offered is the schedule the parent gets.
# Without that, ?count=24 in the URL bar re-terms the plan.

_AUTOPAY_NS = 'sis-invoice-autopay'


def _sign_autopay(invoice_id: str, count: int) -> str:
    secret = (Config.SECRET_KEY or '').encode()
    if not secret:
        raise RuntimeError('FLASK_SECRET_KEY is required to sign payment links')
    payload = f'{_AUTOPAY_NS}:{invoice_id}:{count}'.encode()
    return hmac.new(secret, payload, sha256).hexdigest()[:_SIG_CHARS]


def make_autopay_token(invoice_id: str, count: int) -> str:
    return f'{invoice_id}.{int(count)}.{_sign_autopay(invoice_id, int(count))}'


def autopay_from_token(token: str):
    """(invoice_id, installment_count) for a valid autopay token, else (None, None).

    Returns a pair rather than raising because the caller is a redirect route
    facing a parent. Same constant-time comparison as the pay token.
    """
    if not token:
        return None, None
    parts = token.split('.')
    if len(parts) != 3:
        return None, None
    invoice_id, raw_count, sig = parts
    ok, _ = validate_uuid(invoice_id)
    if not ok:
        return None, None
    try:
        count = int(raw_count)
    except (TypeError, ValueError):
        return None, None
    try:
        expected = _sign_autopay(invoice_id, count)
    except RuntimeError:
        logger.error('autopay link verification attempted with no secret key configured')
        return None, None
    if not hmac.compare_digest(sig, expected):
        return None, None
    return invoice_id, count


def autopay_url(invoice_id: str, count: int) -> str:
    """The "set up monthly payments" URL for the invoice email and PDF."""
    base = (Config.BACKEND_URL or Config.FRONTEND_URL or '').rstrip('/')
    return f'{base}/api/sis/pay/autopay/{make_autopay_token(invoice_id, count)}'


# ── Household card-setup links ───────────────────────────────────────────────
#
# Open-ended monthly tuition (services/sis_recurring_tuition_service.py) needs a
# card on file for the HOUSEHOLD, not against one invoice — there is no invoice
# yet when the school sets the schedule up. A third namespace for a third power:
# holding this link lets you put a card on file for that family and start their
# monthly billing, and nothing else.

_SETUP_NS = 'sis-household-card-setup'


def _sign_setup(household_id: str) -> str:
    secret = (Config.SECRET_KEY or '').encode()
    if not secret:
        raise RuntimeError('FLASK_SECRET_KEY is required to sign payment links')
    return hmac.new(secret, f'{_SETUP_NS}:{household_id}'.encode(),
                    sha256).hexdigest()[:_SIG_CHARS]


def make_setup_token(household_id: str) -> str:
    return f'{household_id}.{_sign_setup(household_id)}'


def household_from_setup_token(token: str) -> Optional[str]:
    """The household this token sets a card up for, or None if it isn't valid."""
    if not token or '.' not in token:
        return None
    household_id, _, sig = token.rpartition('.')
    ok, _ = validate_uuid(household_id)
    if not ok:
        return None
    try:
        expected = _sign_setup(household_id)
    except RuntimeError:
        logger.error('card-setup link verification attempted with no secret key configured')
        return None
    return household_id if hmac.compare_digest(sig, expected) else None


def setup_url(household_id: str) -> str:
    """The "save a card for monthly tuition" URL for the family's email."""
    base = (Config.BACKEND_URL or Config.FRONTEND_URL or '').rstrip('/')
    return f'{base}/api/sis/pay/setup/{make_setup_token(household_id)}'
