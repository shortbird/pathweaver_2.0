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
from services import sis_recurring_tuition_service as recurring
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


# ── Autopay from the emailed link ────────────────────────────────────────────
#
# Optio Academy bills monthly and wants the parent to set the recurring charge up
# themselves. Autopay setup previously required a signed-in guardian, which put a
# login wall in front of the one action the email is asking for.
#
# Mounted under /autopay/<token> rather than /<token>/autopay so it cannot
# collide with the pay routes: '<token>/autopay' would also match the pay rule's
# <token> if a token ever contained a slash, and the two links carry different
# authority. The tokens are signed in separate namespaces, so a pay link pasted
# here fails the signature check rather than quietly setting up a payment plan.


@bp.route('/autopay/<token>', methods=['GET'])
def start_autopay(token):
    """Open a setup-mode Checkout so the family can save a card for monthly
    payments. The installment count is signed into the token."""
    invoice_id, count = sis_pay_links.autopay_from_token(token)
    if not invoice_id:
        return redirect(_result_url(autopay='invalid_link'))

    result = billing.autopay_setup_for_pay_link(
        invoice_id, count,
        return_url=f'{(Config.BACKEND_URL or "").rstrip("/")}/api/sis/pay/autopay/{token}/return',
    )
    if result.get('error'):
        logger.info(f'[SIS pay] autopay link refused for {invoice_id[:8]}: {result["error"]}')
        reason = result.get('reason')
        if reason == 'already':
            return redirect(_result_url(autopay='already'))
        if reason == 'settled':
            return redirect(_result_url(autopay='already_paid'))
        if reason == 'no_guardian':
            return redirect(_result_url(autopay='no_guardian'))
        return redirect(_result_url(autopay='unavailable'))
    return redirect(result['checkout_url'])


@bp.route('/autopay/<token>/return', methods=['GET'])
def return_from_autopay_setup(token):
    """Stripe sends the parent back here after they save a card. Build the plan
    and charge installment #1, then hand them to their billing page.

    Stripe appends ?autopay=return on success and ?autopay=canceled if they
    backed out, the same convention the signed-in flow uses.
    """
    invoice_id, count = sis_pay_links.autopay_from_token(token)
    if not invoice_id:
        return redirect(_result_url(autopay='invalid_link'))
    if request.args.get('autopay') == 'canceled':
        return redirect(_result_url(autopay='canceled'))
    try:
        result = billing.confirm_autopay_for_pay_link(invoice_id, installment_count=count)
    except Exception as e:  # noqa: BLE001 — a parent must never see a stack trace here
        logger.error(f'[SIS pay] autopay confirm failed for {invoice_id[:8]}: {e}')
        return redirect(_result_url(autopay='pending'))
    if result.get('error'):
        return redirect(_result_url(autopay='unavailable'))
    if not result.get('ready'):
        # The card save has not landed at Stripe yet. Nothing is lost: the parent
        # can reopen the link, and the plan is only created once.
        return redirect(_result_url(autopay='pending'))
    if result.get('already'):
        return redirect(_result_url(autopay='already'))
    return redirect(_result_url(autopay='active'))


# ── Card on file for monthly tuition ─────────────────────────────────────────
#
# The family's entry point into open-ended monthly tuition: a link in an email
# that saves a card and starts the schedule the school set up. No login, for the
# same reason as everything else in this module.


@bp.route('/setup/<token>', methods=['GET'])
def start_card_setup(token):
    """Open a setup-mode Checkout to put a card on file for the household."""
    household_id = sis_pay_links.household_from_setup_token(token)
    if not household_id:
        return redirect(_result_url(autopay='invalid_link'))
    org_id = recurring.household_org_id(household_id)
    if not org_id:
        return redirect(_result_url(autopay='unavailable'))
    result = billing.start_card_setup_for_household(
        org_id, household_id,
        return_url=f'{(Config.BACKEND_URL or "").rstrip("/")}/api/sis/pay/setup/{token}/return',
    )
    if result.get('error'):
        logger.info(f'[SIS pay] card setup refused for household {household_id[:8]}: '
                    f'{result["error"]}')
        reason = result.get('reason')
        if reason == 'no_guardian':
            return redirect(_result_url(autopay='no_guardian'))
        return redirect(_result_url(autopay='unavailable'))
    return redirect(result['checkout_url'])


@bp.route('/setup/<token>/return', methods=['GET'])
def return_from_card_setup(token):
    """Save the card, start every active schedule for the family, and take the
    first month's charge."""
    household_id = sis_pay_links.household_from_setup_token(token)
    if not household_id:
        return redirect(_result_url(autopay='invalid_link'))
    if request.args.get('setup') == 'canceled':
        return redirect(_result_url(autopay='canceled'))
    session_id = request.args.get('session_id')
    if not session_id:
        return redirect(_result_url(autopay='pending'))
    org_id = recurring.household_org_id(household_id)
    if not org_id:
        return redirect(_result_url(autopay='unavailable'))
    try:
        saved = billing.save_card_from_setup_session(org_id, household_id, session_id)
        if not saved.get('ready'):
            return redirect(_result_url(autopay='pending'))
        result = recurring.activate_household(org_id, household_id)
    except Exception as e:  # noqa: BLE001 — a parent must never see a stack trace
        logger.error(f'[SIS pay] card setup confirm failed for {household_id[:8]}: {e}')
        return redirect(_result_url(autopay='pending'))
    if result.get('error'):
        # The card IS saved; there was just nothing scheduled to start.
        return redirect(_result_url(autopay='card_saved'))
    if not result.get('charged'):
        return redirect(_result_url(autopay='card_saved_unpaid'))
    return redirect(_result_url(autopay='active'))
