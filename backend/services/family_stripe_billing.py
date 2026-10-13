"""
A family's Stripe subscription, shown on their Billing tab (2026-10-12).

Optio Academy's registration ends in a Stripe Checkout subscription on the
school's own Stripe account (routes/registration_payments.py). Optio keeps
only the ids on the registration row; the invoices and charges live on
Stripe, so the SIS billing page (sis_invoices) showed these families
nothing, and they had no way to see a receipt or change a card short of
emailing the school. This reads the subscription, its paid invoices (each
with Stripe's own receipt page), and the payment method on file, and opens
Stripe's customer portal for "manage payment method".

The portal needs a configuration on the school's Stripe account. The first
request creates one (payment method update + invoice history; no cancel,
because a family withdraws by writing to the school, per the Agreement), so
nobody has to click through the Stripe dashboard first.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from repositories.registration_repository import RegistrationRepository
from utils.logger import get_logger

logger = get_logger(__name__)

RECEIPT_LIMIT = 24


def _key(org_id: str) -> Optional[str]:
    from services.registration_funnel_support import _org_stripe_key
    return _org_stripe_key(org_id)


def _date(ts: Optional[int]) -> Optional[str]:
    return datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat() if ts else None


def _method(pm: Any) -> Optional[Dict[str, Any]]:
    """Brand and last four of a payment method, card or bank."""
    if not pm or isinstance(pm, str):
        return None
    if pm.get('type') == 'card' and pm.get('card'):
        return {'type': 'card', 'brand': pm['card'].get('brand'), 'last4': pm['card'].get('last4')}
    if pm.get('type') == 'us_bank_account' and pm.get('us_bank_account'):
        bank = pm['us_bank_account']
        return {'type': 'bank', 'brand': bank.get('bank_name'), 'last4': bank.get('last4')}
    return {'type': pm.get('type'), 'brand': None, 'last4': None}


def _subscription_ids(org_id: str, guardian_user_id: str) -> List[Dict[str, Any]]:
    # admin client justified: registrations is service-role only; the caller
    # is the guardian themselves (parent_user_id = their own id).
    return RegistrationRepository().subscriptions_for_parent(org_id, guardian_user_id)


def has_subscription(org_id: str, guardian_user_id: str) -> bool:
    return bool(_subscription_ids(org_id, guardian_user_id))


def plan_for(org_id: str, guardian_user_id: str) -> Optional[Dict[str, Any]]:
    """The guardian's subscription with this school: status, monthly amount,
    next charge, payment method, and paid invoices with receipt links. None
    when they have none; {'error': ...} when Stripe could not be read (the
    page says so instead of showing an empty receipt list)."""
    rows = _subscription_ids(org_id, guardian_user_id)
    if not rows:
        return None
    import stripe
    key = _key(org_id)
    if not key:
        return None
    row = rows[0]
    try:
        sub = stripe.Subscription.retrieve(
            row['stripe_subscription_id'], api_key=key,
            expand=['default_payment_method', 'customer.invoice_settings.default_payment_method'])
        monthly = sum(((item.get('price') or {}).get('unit_amount') or 0) * (item.get('quantity') or 1)
                      for item in (sub.get('items') or {}).get('data', []))
        method = _method(sub.get('default_payment_method')) or _method(
            ((sub.get('customer') or {}).get('invoice_settings') or {}).get('default_payment_method'))
        customer_id = row.get('stripe_customer_id') or (
            sub['customer'] if isinstance(sub.get('customer'), str) else sub['customer']['id'])
        invoices = stripe.Invoice.list(customer=customer_id, limit=RECEIPT_LIMIT, api_key=key)
        receipts = [{
            'id': inv['id'],
            'number': inv.get('number'),
            'date': _date(inv.get('status_transitions', {}).get('paid_at') or inv.get('created')),
            'amount_cents': inv.get('amount_paid') or 0,
            'receipt_url': inv.get('hosted_invoice_url'),
            'pdf_url': inv.get('invoice_pdf'),
        } for inv in invoices.get('data', []) if inv.get('status') == 'paid']
        period_end = sub.get('current_period_end') or (
            ((sub.get('items') or {}).get('data') or [{}])[0].get('current_period_end'))
        return {
            'status': sub.get('status'),
            'monthly_cents': monthly,
            'next_charge_on': _date(period_end) if sub.get('status') in ('active', 'trialing', 'past_due') else None,
            'payment_method': method,
            'receipts': receipts,
        }
    except Exception as e:  # noqa: BLE001
        logger.warning(f'family billing: Stripe read failed for org {org_id}: {e}')
        return {'error': 'Could not load your payments from Stripe right now.'}


def _portal_configuration(key: str) -> str:
    """The id of an active portal configuration, created on first use."""
    import stripe
    configs: List[Any] = list(stripe.billing_portal.Configuration.list(
        api_key=key, active=True, limit=10).get('data') or [])
    if configs:
        return next((c for c in configs if c.get('is_default')), configs[0])['id']
    created = stripe.billing_portal.Configuration.create(
        api_key=key,
        business_profile={'headline': 'Update your payment method or download receipts.'},
        features={
            'payment_method_update': {'enabled': True},
            'invoice_history': {'enabled': True},
            'customer_update': {'enabled': False},
            'subscription_cancel': {'enabled': False},
        },
    )
    return created['id']


def portal_url(org_id: str, guardian_user_id: str, return_url: str) -> Optional[str]:
    """A one-time Stripe customer portal link for this guardian's
    subscription customer, or None when they have no subscription here."""
    rows = _subscription_ids(org_id, guardian_user_id)
    key = _key(org_id)
    if not rows or not key or not rows[0].get('stripe_customer_id'):
        return None
    import stripe
    session = stripe.billing_portal.Session.create(
        api_key=key, customer=rows[0]['stripe_customer_id'], return_url=return_url,
        configuration=_portal_configuration(key))
    return session['url']
