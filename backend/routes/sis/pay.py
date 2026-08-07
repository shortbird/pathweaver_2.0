"""
Paying an invoice from the link in the emailed PDF.

iCreate, 2026-08-06: "the sent invoice should include a link to pay via stripe.
if parents pay that way, it should auto-record their payment on the /billing
page."

The only unauthenticated routes in the SIS. That is deliberate and is the whole
point: a parent opening an invoice on their phone weeks later cannot be sent
through a sign-in page, because that is where they stop and the school ends up
chasing the payment by hand. The signed token is the authorization — see
services/sis_pay_links.py for what it can and cannot do.

Two steps, both GETs so they survive being clicked from a mail client:

    /api/sis/pay/<token>          -> start a Checkout, 302 to Stripe
    /api/sis/pay/<token>/return   -> record the payment, 302 to a result page

Neither renders anything or returns any of the family's data. The failure
responses redirect to the family billing page with a reason, rather than showing
a JSON error to a parent.
"""

from urllib.parse import urlencode

from flask import Blueprint, redirect, request

from app_config import Config
from services import sis_billing_service as billing
from services import sis_pay_links
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('sis_pay', __name__, url_prefix='/api/sis/pay')


def _result_url(**params) -> str:
    """Where a parent lands afterwards: their billing page, which shows the
    invoice and its new balance."""
    base = (Config.FRONTEND_URL or '').rstrip('/')
    return f'{base}/family/billing?{urlencode(params)}' if params else f'{base}/family/billing'


@bp.route('/<token>', methods=['GET'])
def start_payment(token):
    """Open a Stripe Checkout for the invoice this token names."""
    invoice_id = sis_pay_links.invoice_id_from_token(token)
    if not invoice_id:
        # Don't say whether the invoice exists — an invalid signature and a
        # deleted invoice look the same from here on purpose.
        return redirect(_result_url(payment='invalid_link'))

    result = billing.checkout_for_pay_link(
        invoice_id,
        return_url=f'{(Config.BACKEND_URL or "").rstrip("/")}/api/sis/pay/{token}/return',
    )
    if result.get('error'):
        logger.info(f'[SIS pay] link checkout refused for {invoice_id[:8]}: {result["error"]}')
        if result.get('reason') == 'settled':
            return redirect(_result_url(payment='already_paid'))
        return redirect(_result_url(payment='unavailable'))
    return redirect(result['checkout_url'])


@bp.route('/<token>/return', methods=['GET'])
def return_from_stripe(token):
    """Stripe sends the parent back here. Record the payment, then hand them to
    their billing page.

    The recording also happens in the nightly sweep, because a parent who closes
    the tab never reaches this route — this is the fast path, not the only one.
    """
    invoice_id = sis_pay_links.invoice_id_from_token(token)
    if not invoice_id:
        return redirect(_result_url(payment='invalid_link'))
    try:
        result = billing.settle_invoice_by_id(invoice_id)
    except Exception as e:  # noqa: BLE001 — the sweep will catch what this drops
        logger.error(f'[SIS pay] settle failed for {invoice_id[:8]}: {e}')
        return redirect(_result_url(payment='pending'))
    if result.get('paid'):
        return redirect(_result_url(payment='paid'))
    # Cancelled at Stripe, or the payment hasn't settled yet.
    return redirect(_result_url(payment='pending'))
