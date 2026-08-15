"""
Unit tests for the tuition payment routes: whole-family checkout, the saved-card
auto-charge plan setup/confirm, and the auto-charge cron entrypoint.

The billing service is mocked (its Stripe calls are not exercised here); these
cover route wiring, validation, and the cron auth gate.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from services import sis_billing_service as billing


@pytest.mark.unit
class TestFamilyCheckout:
    def test_requires_household_id(self, client, auth_headers, mock_verify_token):
        resp = client.post('/api/sis/parent/billing/family-checkout', headers=auth_headers, json={})
        assert resp.status_code == 400

    def test_success(self, client, auth_headers, mock_verify_token):
        with patch('services.sis_billing_service.create_family_checkout',
                   return_value={'checkout_url': 'https://pay'}):
            resp = client.post('/api/sis/parent/billing/family-checkout', headers=auth_headers,
                               json={'household_id': 'hh1', 'return_url': 'https://app/x'})
        assert resp.status_code == 200
        assert json.loads(resp.data)['checkout_url'] == 'https://pay'

    def test_family_not_found(self, client, auth_headers, mock_verify_token):
        with patch('services.sis_billing_service.create_family_checkout',
                   return_value={'error': 'Family not found'}):
            resp = client.post('/api/sis/parent/billing/family-checkout', headers=auth_headers,
                               json={'household_id': 'hhX'})
        assert resp.status_code == 404


@pytest.mark.unit
class TestFamilyConfirm:
    def test_requires_household_id(self, client, auth_headers, mock_verify_token):
        resp = client.post('/api/sis/parent/billing/family-confirm', headers=auth_headers, json={})
        assert resp.status_code == 400

    def test_success(self, client, auth_headers, mock_verify_token):
        with patch('services.sis_billing_service.confirm_family_payment',
                   return_value={'paid': True, 'recorded': 2}):
            resp = client.post('/api/sis/parent/billing/family-confirm', headers=auth_headers,
                               json={'household_id': 'hh1'})
        assert resp.status_code == 200
        assert json.loads(resp.data)['recorded'] == 2


@pytest.mark.unit
class TestAutopaySetup:
    def test_success_passes_count(self, client, auth_headers, mock_verify_token):
        with patch('services.sis_billing_service.create_autopay_setup_checkout',
                   return_value={'checkout_url': 'https://setup'}) as m:
            resp = client.post('/api/sis/parent/billing/invoices/inv1/autopay-setup',
                               headers=auth_headers,
                               json={'return_url': 'https://app/x', 'installment_count': 10})
        assert resp.status_code == 200
        assert m.call_args.kwargs['installment_count'] == 10

    def test_bad_count_defaults_to_ten(self, client, auth_headers, mock_verify_token):
        with patch('services.sis_billing_service.create_autopay_setup_checkout',
                   return_value={'checkout_url': 'https://setup'}) as m:
            resp = client.post('/api/sis/parent/billing/invoices/inv1/autopay-setup',
                               headers=auth_headers,
                               json={'return_url': 'https://app/x', 'installment_count': 'abc'})
        assert resp.status_code == 200
        assert m.call_args.kwargs['installment_count'] == 10

    def test_invoice_not_found(self, client, auth_headers, mock_verify_token):
        with patch('services.sis_billing_service.create_autopay_setup_checkout',
                   return_value={'error': 'Invoice not found'}):
            resp = client.post('/api/sis/parent/billing/invoices/inv9/autopay-setup',
                               headers=auth_headers, json={'return_url': 'https://app/x'})
        assert resp.status_code == 404


@pytest.mark.unit
class TestAutopaySetupStripeParams:
    """The setup-mode Checkout call itself, which the route-level tests mock out.

    Stripe rejected every autopay setup in production on 2026-08-15 with
    "Missing required param: currency" — setup mode has no line items to infer a
    currency from, so the parameter has to be passed explicitly.
    """

    INVOICE = {'id': 'inv1', 'organization_id': 'org1', 'household_id': 'hh1',
               'total_cents': 120000, 'amount_paid_cents': 0, 'status': 'open',
               'stripe_session_ids': []}

    def _run(self, existing_customer=None):
        session = MagicMock(id='cs_test_1', url='https://checkout.stripe.com/c/pay/cs_test_1')
        with patch.object(billing, '_guardian_invoice', return_value=dict(self.INVOICE)), \
             patch.object(billing, '_org_stripe_secret', return_value='sk_test_x'), \
             patch.object(billing, '_users_map',
                          return_value={'g1': {'id': 'g1', 'email': 'grace@example.com'}}), \
             patch.object(billing, '_existing_stripe_customer', return_value=existing_customer), \
             patch.object(billing, '_admin', return_value=MagicMock()), \
             patch('stripe.Customer.create', return_value=MagicMock(id='cus_new')) as cust, \
             patch('stripe.checkout.Session.create', return_value=session) as create:
            result = billing.create_autopay_setup_checkout('g1', 'inv1', 'https://app/billing')
        return result, create, cust

    def test_setup_session_sends_a_currency(self):
        result, create, _ = self._run()
        assert create.call_args.kwargs['currency'] == 'usd'
        assert create.call_args.kwargs['mode'] == 'setup'
        assert result['checkout_url'] == 'https://checkout.stripe.com/c/pay/cs_test_1'

    def test_reuses_an_existing_customer_instead_of_orphaning_one(self):
        # Each failed attempt used to leave a new Customer on the school's
        # account, and a family that hits an error retries.
        _, create, cust = self._run(existing_customer='cus_known')
        assert cust.called is False
        assert create.call_args.kwargs['customer'] == 'cus_known'

    def test_creates_a_customer_on_first_setup(self):
        _, create, cust = self._run(existing_customer=None)
        assert cust.called is True
        assert create.call_args.kwargs['customer'] == 'cus_new'


@pytest.mark.unit
class TestAutopayConfirm:
    def test_success(self, client, auth_headers, mock_verify_token):
        with patch('services.sis_billing_service.confirm_autopay_setup',
                   return_value={'ready': True, 'plan': {'id': 'pp1'},
                                 'first_charge': {'status': 'charged'}}):
            resp = client.post('/api/sis/parent/billing/invoices/inv1/autopay-confirm',
                               headers=auth_headers, json={'installment_count': 10})
        assert resp.status_code == 200
        assert json.loads(resp.data)['ready'] is True


@pytest.mark.unit
class TestAutopayCron:
    def test_unauthorized_without_secret(self, client):
        resp = client.post('/api/sis/internal/tuition-autopay',
                           headers={'Content-Type': 'application/json'}, json={})
        assert resp.status_code == 401

    def test_runs_with_cron_secret(self, client):
        with patch('app_config.Config.CRON_SECRET', 'sekret'), \
             patch('routes.sis.billing.billing.charge_due_installments',
                   return_value={'charged': 3, 'failed': 0, 'plans': 2}):
            resp = client.post('/api/sis/internal/tuition-autopay',
                               headers={'X-Cron-Secret': 'sekret', 'Content-Type': 'application/json'},
                               json={})
        assert resp.status_code == 200
        assert json.loads(resp.data)['charged'] == 3
