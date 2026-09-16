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
class TestPaymentPlanPreference:
    def test_requires_household_id(self, client, auth_headers, mock_verify_token):
        resp = client.post('/api/sis/parent/billing/payment-plan-preference', headers=auth_headers, json={})
        assert resp.status_code == 400

    def test_invalid_preference_rejected(self, client, auth_headers, mock_verify_token):
        resp = client.post('/api/sis/parent/billing/payment-plan-preference', headers=auth_headers,
                           json={'household_id': 'hh1', 'payment_plan_preference': 'invalid_plan'})
        assert resp.status_code == 400

    def test_success(self, client, auth_headers, mock_verify_token):
        with patch('services.sis_billing_service.set_payment_plan_preference',
                   return_value={'household_id': 'hh1', 'payment_plan_preference': 'monthly'}):
            resp = client.post('/api/sis/parent/billing/payment-plan-preference', headers=auth_headers,
                               json={'household_id': 'hh1', 'payment_plan_preference': 'monthly'})
        assert resp.status_code == 200
        assert json.loads(resp.data)['payment_plan_preference'] == 'monthly'

    def test_forbidden_if_not_guardian(self, client, auth_headers, mock_verify_token):
        with patch('services.sis_billing_service.set_payment_plan_preference',
                   side_effect=PermissionError('Not authorized to update this household')):
            resp = client.post('/api/sis/parent/billing/payment-plan-preference', headers=auth_headers,
                               json={'household_id': 'hh2', 'payment_plan_preference': 'monthly'})
        assert resp.status_code == 403


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


class _FakeAdmin:
    """Answers the two reads _charge_installment makes and swallows its
    writes. `lines` is what sis_invoice_line_items returns; `recorded` is
    what sis_payment_records already holds for the intent id."""

    def __init__(self, lines=None, recorded=None):
        self.lines = lines or []
        self.recorded = recorded or []
        self.updates = []

    def table(self, name):
        fake = self

        class _Q:
            def __init__(self):
                self.name = name
                self.payload = None

            def __getattr__(self, _attr):
                return lambda *a, **k: self

            def update(self, payload):
                fake.updates.append((self.name, payload))
                return self

            def execute(self):
                data = {'sis_invoice_line_items': fake.lines,
                        'sis_payment_records': fake.recorded}.get(self.name, [])
                return MagicMock(data=data)
        return _Q()


@pytest.mark.unit
class TestChargeInstallmentStripeParams:
    """What the off-session PaymentIntent carries.

    On 2026-09-15 iCreate read two $73.00 autopay charges, four seconds apart,
    as a double payment. They were the September installment on the same
    family's two invoices, but the intent had no description, so Stripe's list
    showed two identical rows. And nothing stopped a real double charge: two
    overlapping sweeps would both create an intent for the same installment.
    """

    PLAN = {'id': 'pp1', 'invoice_id': 'inv1'}
    INSTALLMENT = {'id': 'ins2', 'amount_cents': 7300, 'due_date': '2026-09-15',
                   'charge_attempts': 0}
    SAVED = {'id': 'pm1', 'stripe_customer_id': 'cus_1',
             'stripe_payment_method_id': 'pm_card_1', 'guardian_user_id': 'g1'}
    INVOICE = {'id': 'inv1', 'invoice_number': 'INV-2026-D73AD6'}
    LINES = [{'description': 'Spanish Adventures', 'kind': 'tuition'},
             {'description': 'Maker: Remade', 'kind': 'tuition'},
             {'description': 'Card processing fee', 'kind': 'fee'}]

    def _run(self, invoice=INVOICE, lines=LINES, recorded=None, attempts=0):
        admin = _FakeAdmin(lines=lines, recorded=recorded)
        inst = dict(self.INSTALLMENT, charge_attempts=attempts)
        intent = {'id': 'pi_1', 'status': 'succeeded'}
        with patch.object(billing, '_admin', return_value=admin), \
             patch.object(billing, 'record_payment', return_value={}) as record, \
             patch('stripe.PaymentIntent.create', return_value=intent) as create:
            result = billing._charge_installment('org1', self.PLAN, inst, self.SAVED, 'sk_test_x',
                                                 recorded_by='g1', invoice=invoice)
        return result, create.call_args.kwargs, record

    def test_description_names_the_invoice_the_due_date_and_the_classes(self):
        _, kwargs, _ = self._run()
        assert kwargs['description'] == \
            'INV-2026-D73AD6 autopay 2026-09-15: Spanish Adventures; Maker: Remade'

    def test_processing_fee_line_is_not_a_class(self):
        _, kwargs, _ = self._run()
        assert 'processing fee' not in kwargs['description']

    def test_no_invoice_means_no_description_not_an_empty_one(self):
        _, kwargs, _ = self._run(invoice=None)
        assert kwargs['description'] is None

    def test_idempotency_key_is_the_installment_and_the_attempt(self):
        _, kwargs, _ = self._run()
        assert kwargs['idempotency_key'] == 'autopay-ins2-1'

    def test_a_retry_after_a_decline_is_a_new_key(self):
        # Keyed on the installment alone, a retry within 24 hours would replay
        # the decline instead of trying the card.
        _, kwargs, _ = self._run(attempts=1)
        assert kwargs['idempotency_key'] == 'autopay-ins2-2'

    def test_first_charge_records_the_payment(self):
        result, _, record = self._run()
        assert result == {'status': 'charged', 'payment_intent': 'pi_1'}
        assert record.call_args.kwargs['external_ref'] == 'pi_1'

    def test_a_replayed_intent_is_not_recorded_twice(self):
        # Stripe answered the second sweep with the intent the first one
        # already recorded. The card was charged once; the ledger must say so.
        result, _, record = self._run(recorded=[{'id': 'pay1'}])
        assert result['status'] == 'charged'
        assert result['replayed'] is True
        assert record.called is False


@pytest.mark.unit
class TestChargeInvoiceOffSessionStripeParams:
    """The recurring-tuition sibling carries the same description and key."""

    INVOICE = {'id': 'inv9', 'invoice_number': 'INV-2026-ABC123',
               'total_cents': 40000, 'amount_paid_cents': 0, 'processing_fee_cents': 0}
    SAVED = {'id': 'pm1', 'stripe_customer_id': 'cus_1',
             'stripe_payment_method_id': 'pm_card_1', 'guardian_user_id': 'g1'}

    def test_description_and_key(self):
        admin = _FakeAdmin(lines=[{'description': 'Lillian Rose — Tuition', 'kind': 'tuition'},
                                  {'description': 'Ember Rose — Tuition', 'kind': 'tuition'}])
        intent = {'id': 'pi_9', 'status': 'succeeded'}
        with patch.object(billing, '_admin', return_value=admin), \
             patch.object(billing, '_org_stripe_secret', return_value='sk_test_x'), \
             patch.object(billing, 'record_payment', return_value={}), \
             patch('stripe.PaymentIntent.create', return_value=intent) as create:
            result = billing.charge_invoice_off_session('org1', dict(self.INVOICE), self.SAVED)
        kwargs = create.call_args.kwargs
        assert result['status'] == 'charged'
        assert kwargs['description'] == \
            'INV-2026-ABC123 monthly tuition: Lillian Rose — Tuition; Ember Rose — Tuition'
        assert kwargs['idempotency_key'] == 'recurring-inv9'
