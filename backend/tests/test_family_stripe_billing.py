"""
The family Billing tab for Optio Academy (2026-10-12): a self-paying family
sees its Stripe subscription, receipts and card and can open Stripe's portal;
an OpenEd family sees "paid in full"; a family with neither has no tab.

Before this, the registration's Stripe subscription was invisible in the app
(its invoices live only on Stripe) and Academy parents had no Billing tab.
"""
from unittest.mock import patch

import pytest

from services import family_stripe_billing as fsb

ORG = 'org-academy'


class _Obj(dict):
    """Enough of a StripeObject: dict access plus attribute-free .get."""


def _sub(status='active', pm=None):
    return _Obj({
        'status': status, 'current_period_end': 1792800000,
        'items': {'data': [{'price': {'unit_amount': 5000}, 'quantity': 2}]},
        'default_payment_method': pm or {'type': 'card', 'card': {'brand': 'visa', 'last4': '4242'}},
        'customer': 'cus_1',
    })


@pytest.fixture
def subs():
    with patch.object(fsb, '_subscription_ids', return_value=[
            {'id': 'reg-1', 'stripe_subscription_id': 'sub_1', 'stripe_customer_id': 'cus_1'}]) as s, \
         patch.object(fsb, '_key', return_value='sk_test'):
        yield s


@pytest.mark.unit
class TestPlan:
    def test_plan_reads_amount_method_and_paid_receipts_only(self, subs):
        invoices = {'data': [
            {'id': 'in_1', 'number': 'A-1', 'status': 'paid', 'amount_paid': 10000,
             'status_transitions': {'paid_at': 1790000000}, 'created': 1790000000,
             'hosted_invoice_url': 'https://pay.stripe.com/r/1', 'invoice_pdf': 'https://pdf/1'},
            {'id': 'in_2', 'status': 'open', 'amount_paid': 0, 'created': 1791000000},
        ]}
        with patch('stripe.Subscription.retrieve', return_value=_sub()), \
             patch('stripe.Invoice.list', return_value=invoices) as inv:
            plan = fsb.plan_for(ORG, 'parent-1')
        assert plan['monthly_cents'] == 10000
        assert plan['payment_method'] == {'type': 'card', 'brand': 'visa', 'last4': '4242'}
        assert plan['next_charge_on']
        assert [r['id'] for r in plan['receipts']] == ['in_1']
        assert plan['receipts'][0]['receipt_url'] == 'https://pay.stripe.com/r/1'
        assert inv.call_args.kwargs['customer'] == 'cus_1'

    def test_bank_account_is_described(self, subs):
        pm = {'type': 'us_bank_account', 'us_bank_account': {'bank_name': 'Chase', 'last4': '6789'}}
        with patch('stripe.Subscription.retrieve', return_value=_sub(pm=pm)), \
             patch('stripe.Invoice.list', return_value={'data': []}):
            plan = fsb.plan_for(ORG, 'parent-1')
        assert plan['payment_method'] == {'type': 'bank', 'brand': 'Chase', 'last4': '6789'}

    def test_a_canceled_subscription_has_no_next_charge(self, subs):
        with patch('stripe.Subscription.retrieve', return_value=_sub(status='canceled')), \
             patch('stripe.Invoice.list', return_value={'data': []}):
            assert fsb.plan_for(ORG, 'parent-1')['next_charge_on'] is None

    def test_stripe_failure_says_so_instead_of_an_empty_list(self, subs):
        with patch('stripe.Subscription.retrieve', side_effect=RuntimeError('down')):
            assert 'error' in fsb.plan_for(ORG, 'parent-1')

    def test_no_subscription_is_none(self):
        with patch.object(fsb, '_subscription_ids', return_value=[]):
            assert fsb.plan_for(ORG, 'parent-1') is None


@pytest.mark.unit
class TestPortal:
    def test_creates_a_configuration_once_then_reuses_it(self, subs):
        with patch('stripe.billing_portal.Configuration.list', return_value={'data': []}), \
             patch('stripe.billing_portal.Configuration.create', return_value={'id': 'bpc_1'}) as create, \
             patch('stripe.billing_portal.Session.create', return_value={'url': 'https://billing.stripe.com/s'}) as sess:
            url = fsb.portal_url(ORG, 'parent-1', 'https://app.optioeducation.com/family/billing')
        assert url == 'https://billing.stripe.com/s'
        features = create.call_args.kwargs['features']
        assert features['payment_method_update']['enabled'] is True
        assert features['subscription_cancel']['enabled'] is False
        assert sess.call_args.kwargs['customer'] == 'cus_1'
        assert sess.call_args.kwargs['configuration'] == 'bpc_1'

        with patch('stripe.billing_portal.Configuration.list',
                   return_value={'data': [{'id': 'bpc_1', 'is_default': True}]}), \
             patch('stripe.billing_portal.Configuration.create') as create_again, \
             patch('stripe.billing_portal.Session.create', return_value={'url': 'u'}):
            fsb.portal_url(ORG, 'parent-1', 'https://x')
        create_again.assert_not_called()

    def test_no_subscription_no_portal(self):
        with patch.object(fsb, '_subscription_ids', return_value=[]), \
             patch.object(fsb, '_key', return_value='sk_test'):
            assert fsb.portal_url(ORG, 'parent-1', 'https://x') is None


@pytest.mark.unit
class TestBillingViews:
    def _views(self, funding, has_sub=False, invoices=()):
        from services import sis_billing_service as billing
        with patch.object(billing, '_guardian_household_rows',
                          return_value=[{'id': 'hh-1', 'organization_id': ORG}]), \
             patch.object(billing, '_household_funding_source', return_value=funding), \
             patch.object(billing, 'list_invoices', return_value=list(invoices)), \
             patch.object(fsb, 'has_subscription', return_value=has_sub):
            return billing.family_billing_views('parent-1')

    def test_opened_family_is_paid_in_full(self):
        assert self._views('opened') == {ORG: {'view': 'funder_paid', 'funder': 'OpenEd'}}

    def test_subscriber_self_pays(self):
        assert self._views(None, has_sub=True)[ORG]['view'] == 'self_pay'

    def test_invoiced_family_self_pays(self):
        assert self._views(None, invoices=[{'status': 'open'}])[ORG]['view'] == 'self_pay'

    def test_nothing_to_show_means_no_tab(self):
        assert self._views(None, invoices=[{'status': 'draft'}]) == {}


@pytest.mark.unit
def test_manage_payment_route_has_one_owner():
    """One route, one owner: the portal endpoint resolves to this handler."""
    from app import app
    endpoint, _ = app.url_map.bind('localhost').match(
        '/api/sis/parent/billing/manage-payment', method='POST')
    assert endpoint.endswith('billing_manage_payment')
