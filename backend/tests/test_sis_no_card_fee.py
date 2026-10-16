"""
Optio adds no card processing fee to any payment (Tanner, 2026-10-16).

iCreate families were charged the card fee twice: Optio put its own "Card
processing fee" line (2.9% + $0.30) on the Stripe Checkout, and Stripe added
the school's own surcharge on top. The decision: "optio should simply just not
add a card processing fee - let that be handled by stripe settings."

These fail if a fee line, or a fee amount, comes back on any of the four ways
a family pays: one invoice, the emailed pay link, the whole family at once, and
the monthly autopay charge. History stays readable: a Checkout opened before
the change still records the fee the family was charged on it.

Stripe and the DB are mocked; nothing here talks to either.
"""

from contextlib import contextmanager
from unittest.mock import MagicMock, Mock, patch

import pytest

from services import sis_billing_service as billing

ORG = 'org-1'
HOUSEHOLD = 'hh-1'
GUARDIAN = 'g-1'
INVOICE = {'id': 'inv-1', 'organization_id': ORG, 'household_id': HOUSEHOLD,
           'invoice_number': 'INV-1', 'status': 'sent', 'total_cents': 30350,
           'amount_paid_cents': 0, 'processing_fee_cents': 0, 'stripe_session_ids': []}


def _chain(data):
    table = Mock()
    for chained in ('select', 'eq', 'limit', 'update', 'in_', 'order'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=data)
    admin = Mock()
    admin.table.return_value = table
    return admin


@contextmanager
def _checkout_world(invoice=None):
    session = MagicMock()
    session.id, session.url = 'cs_1', 'https://checkout.stripe.com/c/pay/cs_1'
    inv = dict(invoice or INVOICE)
    with patch.object(billing, '_guardian_invoice', return_value=inv), \
         patch.object(billing, '_guardian_household_rows',
                      return_value=[{'id': HOUSEHOLD, 'organization_id': ORG}]), \
         patch.object(billing, '_household_open_invoices', return_value=[inv]), \
         patch.object(billing, '_org_stripe_secret', return_value='sk_test'), \
         patch.object(billing, '_org_branding', return_value={ORG: {'name': 'iCreate'}}), \
         patch.object(billing, '_users_map',
                      return_value={GUARDIAN: {'email': 'p@example.com'}}), \
         patch.object(billing, '_admin', return_value=_chain([inv])), \
         patch.object(billing, 'start_checkout', return_value=session) as start:
        yield start


def _assert_balance_only(start, balance):
    kwargs = start.call_args.kwargs
    names = [li['price_data']['product_data']['name'] for li in kwargs['line_items']]
    assert not any('fee' in n.lower() for n in names), names
    assert sum(li['price_data']['unit_amount'] * li['quantity']
               for li in kwargs['line_items']) == balance
    assert 'fee_cents' not in kwargs['metadata']


@pytest.mark.unit
class TestNoFeeOnACheckout:
    def test_paying_one_invoice(self):
        with _checkout_world() as start:
            out = billing.create_invoice_checkout(GUARDIAN, 'inv-1', 'https://app.example.com/b')
        assert 'checkout_url' in out
        _assert_balance_only(start, 30350)

    def test_the_emailed_pay_link(self):
        with _checkout_world() as start:
            out = billing.checkout_for_pay_link('inv-1', 'https://api.example.com/pay/x')
        assert 'checkout_url' in out
        _assert_balance_only(start, 30350)

    def test_paying_the_whole_family(self):
        with _checkout_world() as start:
            out = billing.create_family_checkout(GUARDIAN, HOUSEHOLD, 'https://app.example.com/b')
        assert 'checkout_url' in out
        _assert_balance_only(start, 30350)

    def test_a_partly_paid_invoice_is_charged_what_is_left(self):
        with _checkout_world({**INVOICE, 'amount_paid_cents': 10000}) as start:
            billing.create_invoice_checkout(GUARDIAN, 'inv-1', 'https://app.example.com/b')
        _assert_balance_only(start, 20350)


@pytest.mark.unit
class TestNoFeeOnAnAutopayCharge:
    def test_a_card_on_file_is_charged_the_balance(self):
        card = {'stripe_customer_id': 'cus_1', 'stripe_payment_method_id': 'pm_1',
                'method_type': 'card', 'guardian_user_id': GUARDIAN}
        with patch.object(billing, '_org_stripe_secret', return_value='sk_test'), \
             patch.object(billing, 'autopay_bank_free', return_value=True), \
             patch.object(billing, '_apply_processing_fee') as apply_fee, \
             patch.object(billing, '_stripe_description', return_value='x'), \
             patch.object(billing, 'record_payment', return_value={}), \
             patch('stripe.PaymentIntent.create',
                   return_value={'id': 'pi_1', 'status': 'succeeded'}) as create:
            out = billing.charge_invoice_off_session(ORG, dict(INVOICE), card)
        apply_fee.assert_not_called()
        assert create.call_args.kwargs['amount'] == 30350
        assert out['amount_cents'] == 30350

    def test_bank_first_setup_says_nothing_about_a_fee(self):
        session = MagicMock()
        session.url = 'https://checkout.stripe.com/c/setup/cs_2'
        with patch.object(billing, '_org_stripe_secret', return_value='sk_test'), \
             patch.object(billing, '_pay_link_guardian',
                          return_value={'user_id': GUARDIAN, 'email': 'p@example.com'}), \
             patch.object(billing, '_existing_stripe_customer', return_value='cus_1'), \
             patch.object(billing, 'autopay_bank_free', return_value=True), \
             patch.object(billing, 'start_checkout', return_value=session) as start:
            billing.start_card_setup_for_household(ORG, HOUSEHOLD, 'https://app.example.com/s')
        kwargs = start.call_args.kwargs
        assert kwargs['payment_method_types'] == ['us_bank_account', 'card']
        assert 'fee' not in repr(kwargs).lower()


@pytest.mark.unit
class TestTheFeeMachineryIsGone:
    def test_nothing_left_computes_a_fee(self):
        for name in ('compute_processing_fee', '_fee_to_add', 'charges_card_fee',
                     'card_fee_terms', 'set_processing_fee', '_processing_fee_config'):
            assert not hasattr(billing, name), name

    def test_the_price_list_has_no_card_rate(self):
        from generated.pricing import PRICE_TEXT, PRICING
        assert 'cardProcessing' not in PRICING
        assert 'cardProcessingFee' not in PRICE_TEXT

    def test_staff_cannot_set_a_fee_through_the_api(self, app):
        adapter = app.url_map.bind('localhost')
        from werkzeug.exceptions import MethodNotAllowed, NotFound
        with pytest.raises((NotFound, MethodNotAllowed)):
            adapter.match('/api/sis/invoices/00000000-0000-4000-8000-000000000000/processing-fee',
                          method='PATCH')


@pytest.mark.unit
class TestOldCheckoutsStillRecordWhatWasCharged:
    """A Checkout opened before 2026-10-16 and paid after it charged the fee.
    The invoice has to show the fee, or the family reads a credit they do not
    have (the 2026-09-01 bug in test_sis_invoice_corrections.py)."""

    def _settle(self, metadata, amount_total):
        sess = {'id': 'cs_old', 'payment_status': 'paid', 'payment_intent': 'pi_old',
                'amount_total': amount_total, 'metadata': metadata}
        with patch.object(billing, '_org_stripe_secret', return_value='sk_test'), \
             patch.object(billing, 'first_session', return_value=sess), \
             patch.object(billing, '_admin', return_value=_chain([])), \
             patch.object(billing, '_apply_processing_fee') as apply_fee, \
             patch.object(billing, 'card_details_from_intent', return_value=None), \
             patch.object(billing, 'record_payment', return_value={}) as record, \
             patch.object(billing, '_audit'):
            billing.settle_invoice_from_stripe({**INVOICE, 'stripe_session_ids': ['cs_old']})
        return apply_fee, record

    def test_an_old_session_with_a_fee_records_it(self):
        apply_fee, record = self._settle({'base_cents': 30350, 'fee_cents': 910}, 31260)
        apply_fee.assert_called_once_with(ORG, 'inv-1', 910)
        assert record.call_args.kwargs['amount_cents'] == 31260

    def test_a_new_session_records_the_balance_and_no_fee(self):
        apply_fee, record = self._settle({'base_cents': 30350}, 30350)
        apply_fee.assert_not_called()
        assert record.call_args.kwargs['amount_cents'] == 30350
