"""A card payment's receipt says which card: "Card (Visa ending 4242)".

iCreate, ticket 03226ede (2026-09-24): "On receipts, can you add method of
payment (card/check) and last four digits of card number if paid by card so
that people can turn those in for reimbursements to various entities?"

Every path that records a Stripe payment now stamps the card's brand and last
four onto the payment record, and both receipts (the office's, built from the
ledger, and the family's) carry them. Recording the payment comes first: the
card details are a best-effort second write, because a receipt missing its
last four is a small thing and a payment that failed to record is not.
"""
from unittest.mock import MagicMock, Mock, patch

import pytest

from services import sis_billing_service as billing

ORG = 'org-1'
INVOICE_ID = 'inv-1'
VISA = {'brand': 'visa', 'last4': '4242'}


def _chain_table(data=None):
    t = Mock()
    for m in ('select', 'eq', 'limit', 'update', 'insert', 'in_', 'order', 'is_', 'range'):
        getattr(t, m).return_value = t
    t.execute.return_value = Mock(data=data if data is not None else [])
    return t


@pytest.mark.unit
class TestReadingTheCardOffAPaymentIntent:
    def _retrieve(self, returns=None, raises=None):
        stripe = MagicMock()
        if raises:
            stripe.PaymentIntent.retrieve.side_effect = raises
        else:
            stripe.PaymentIntent.retrieve.return_value = returns
        with patch.dict('sys.modules', {'stripe': stripe}):
            return billing.card_details_from_intent('sk_test', 'pi_1'), stripe

    def test_the_charged_card_comes_back_as_brand_and_last_four(self):
        intent = {'latest_charge': {'payment_method_details': {'card': {'brand': 'visa', 'last4': '4242'}}}}
        card, stripe = self._retrieve(intent)
        assert card == VISA
        assert stripe.PaymentIntent.retrieve.call_args.kwargs['expand'] == ['latest_charge']

    def test_a_charge_that_was_not_expanded_is_no_card(self):
        card, _ = self._retrieve({'latest_charge': 'ch_1'})
        assert card == {}

    def test_a_stripe_failure_is_no_card_not_an_exception(self):
        card, _ = self._retrieve(raises=RuntimeError('stripe down'))
        assert card == {}

    @pytest.mark.parametrize('ref', [None, '', 'cs_session', 'Z-123'])
    def test_anything_but_a_payment_intent_is_not_looked_up(self, ref):
        stripe = MagicMock()
        with patch.dict('sys.modules', {'stripe': stripe}):
            assert billing.card_details_from_intent('sk_test', ref) == {}
        stripe.PaymentIntent.retrieve.assert_not_called()

    def test_no_secret_is_not_looked_up(self):
        assert billing.card_details_from_intent(None, 'pi_1') == {}


@pytest.mark.unit
class TestRecordPaymentStampsTheCard:
    def _record(self, card, update_raises=None):
        invoices = _chain_table([{'id': INVOICE_ID}])
        payments = _chain_table([{'id': 'pay-1', 'method': 'card'}])
        client = Mock()
        client.table.side_effect = lambda name: {'sis_invoices': invoices}.get(name, payments)
        repo = Mock()
        if update_raises:
            repo.return_value.update.side_effect = update_raises
        with patch.object(billing, '_admin', return_value=client), \
             patch.object(billing, 'SisPaymentRecordRepository', repo), \
             patch.object(billing, '_recompute_invoice_status', return_value={'id': INVOICE_ID}), \
             patch.object(billing, 'enqueue_qbo'), \
             patch.object(billing, '_audit'), \
             patch.object(billing, '_maybe_autocomplete_registration', return_value=None):
            result = billing.record_payment(ORG, INVOICE_ID, 5000, 'card', 'pi_1', None, None, card=card)
        return result, repo.return_value

    def test_a_card_is_written_onto_the_payment(self):
        result, payments = self._record(VISA)
        payments.update.assert_called_once_with('pay-1', {'card_brand': 'visa', 'card_last4': '4242'})
        assert result['payment']['card_last4'] == '4242'
        assert result['payment']['card_brand'] == 'visa'

    @pytest.mark.parametrize('card', [None, {}, {'brand': None, 'last4': ''}])
    def test_no_card_writes_nothing_extra(self, card):
        # A check, a scholarship, or a Stripe read that came back empty.
        result, payments = self._record(card)
        payments.update.assert_not_called()
        assert 'card_last4' not in result['payment']

    def test_a_failed_card_write_still_records_the_payment(self):
        result, _ = self._record(VISA, update_raises=RuntimeError('column missing'))
        assert result['payment']['id'] == 'pay-1'
        assert 'card_last4' not in result['payment']


@pytest.mark.unit
class TestEveryStripePathPassesTheCard:
    def test_a_checkout_payment_passes_the_card_it_was_paid_with(self):
        session = {'id': 'cs_1', 'payment_status': 'paid', 'payment_intent': 'pi_9',
                   'amount_total': 5000, 'metadata': {'base_cents': 5000, 'fee_cents': 0}}
        invoice = {'id': INVOICE_ID, 'organization_id': ORG, 'stripe_session_ids': ['cs_1']}
        client = Mock()
        client.table.return_value = _chain_table([])
        stripe = MagicMock()
        stripe.checkout.Session.retrieve.return_value = session
        with patch.dict('sys.modules', {'stripe': stripe}), \
             patch.object(billing, '_admin', return_value=client), \
             patch.object(billing, '_org_stripe_secret', return_value='sk_test'), \
             patch.object(billing, 'card_details_from_intent', return_value=VISA) as read, \
             patch.object(billing, 'record_payment', return_value={}) as record, \
             patch.object(billing, '_audit'):
            billing.settle_invoice_from_stripe(invoice)
        read.assert_called_once_with('sk_test', 'pi_9')
        assert record.call_args.kwargs['card'] == VISA

    def test_a_whole_family_payment_reads_the_card_once_and_stamps_every_invoice(self):
        session = {'id': 'cs_f', 'payment_status': 'paid', 'payment_intent': 'pi_f',
                   'metadata': {'kind': 'family', 'household_id': 'hh1',
                                'fee_cents': 0, 'base_total_cents': 8000}}
        invoices = [
            {'id': 'a', 'total_cents': 3000, 'amount_paid_cents': 0, 'stripe_session_ids': ['cs_f']},
            {'id': 'b', 'total_cents': 5000, 'amount_paid_cents': 0, 'stripe_session_ids': ['cs_f']},
        ]
        client = Mock()
        client.table.return_value = _chain_table([])
        with patch.object(billing, '_guardian_household_rows',
                          return_value=[{'id': 'hh1', 'organization_id': ORG}]), \
             patch.object(billing, '_org_stripe_secret', return_value='sk_test'), \
             patch.object(billing, '_household_open_invoices', return_value=invoices), \
             patch.object(billing, 'first_session', return_value=session), \
             patch.object(billing, '_admin', return_value=client), \
             patch.object(billing, 'card_details_from_intent', return_value=VISA) as read, \
             patch.object(billing, 'record_payment', return_value={}) as record, \
             patch.object(billing, '_audit'):
            result = billing.confirm_family_payment('g1', 'hh1')
        assert result['recorded'] == 2
        read.assert_called_once_with('sk_test', 'pi_f')
        assert [c.kwargs['card'] for c in record.call_args_list] == [VISA, VISA]

    SAVED = {'id': 'pm1', 'stripe_customer_id': 'cus_1', 'stripe_payment_method_id': 'pm_card_1',
             'guardian_user_id': 'g1', 'card_brand': 'mastercard', 'card_last4': '4444'}

    def test_an_autopay_installment_passes_the_saved_card(self):
        client = Mock()
        client.table.return_value = _chain_table([])
        with patch.object(billing, '_admin', return_value=client), \
             patch.object(billing, 'record_payment', return_value={}) as record, \
             patch('stripe.PaymentIntent.create', return_value={'id': 'pi_a', 'status': 'succeeded'}):
            billing._charge_installment(
                ORG, {'id': 'pp1', 'invoice_id': INVOICE_ID},
                {'id': 'ins1', 'amount_cents': 7300, 'due_date': '2026-09-15', 'charge_attempts': 0},
                self.SAVED, 'sk_test', recorded_by='g1', invoice=None)
        assert record.call_args.kwargs['card'] == {'brand': 'mastercard', 'last4': '4444'}

    def test_a_monthly_tuition_charge_passes_the_saved_card(self):
        invoice = {'id': INVOICE_ID, 'total_cents': 5000, 'amount_paid_cents': 0}
        with patch.object(billing, '_org_stripe_secret', return_value='sk_test'), \
             patch.object(billing, '_stripe_description', return_value='x'), \
             patch.object(billing, 'record_payment', return_value={}) as record, \
             patch('stripe.PaymentIntent.create', return_value={'id': 'pi_m', 'status': 'succeeded'}):
            result = billing.charge_invoice_off_session(ORG, invoice, self.SAVED)
        assert result['status'] == 'charged'
        assert record.call_args.kwargs['card'] == {'brand': 'mastercard', 'last4': '4444'}


@pytest.mark.unit
class TestBothReceiptsCarryTheCard:
    def test_the_office_ledger_lists_each_payment_with_its_card_or_none(self):
        invoice = {'id': INVOICE_ID, 'status': 'paid', 'household_id': 'hh1', 'total_cents': 8000,
                   'amount_paid_cents': 8000, 'due_date': '2026-09-01'}
        pays = [
            {'id': 'p1', 'invoice_id': INVOICE_ID, 'amount_cents': 5000, 'method': 'card',
             'card_brand': 'visa', 'card_last4': '4242', 'recorded_at': '2026-09-02'},
            {'id': 'p2', 'invoice_id': INVOICE_ID, 'amount_cents': 3000, 'method': 'check',
             'recorded_at': '2026-09-01'},
        ]
        client = Mock()
        client.table.side_effect = lambda name: _chain_table([{'id': 'hh1', 'name': 'Barker'}]
                                                             if name == 'households' else [])
        # billing_ledger pages line items first, then payments.
        with patch.object(billing, 'list_invoices', return_value=[invoice]), \
             patch.object(billing, 'fetch_all_rows', side_effect=[[], pays]), \
             patch.object(billing, '_admin', return_value=client), \
             patch.object(billing, '_users_map', return_value={}):
            rows = billing.billing_ledger(ORG)

        listed = {p['id']: p for p in rows[0]['payments']}
        assert (listed['p1']['card_brand'], listed['p1']['card_last4']) == ('visa', '4242')
        assert (listed['p2']['card_brand'], listed['p2']['card_last4']) == (None, None)

    def _receipt(self, pay):
        client = Mock()
        client.table.side_effect = lambda name: _chain_table(
            {'sis_payment_records': [pay],
             'sis_invoices': [{'id': INVOICE_ID, 'organization_id': ORG, 'household_id': 'hh1',
                               'student_user_id': 's1'}]}.get(name, []))
        with patch.object(billing, '_admin', return_value=client), \
             patch.object(billing, '_guardian_household_rows', return_value=[{'id': 'hh1', 'name': 'Barker'}]), \
             patch.object(billing, '_org_branding', return_value={}), \
             patch.object(billing, '_hydrate_invoices'), \
             patch.object(billing, '_users_map', return_value={}), \
             patch.object(billing, '_household_funding_source', return_value=None):
            return billing.payment_receipt('g1', 'pay-1')['receipt']['payment']

    def test_the_family_receipt_carries_the_card(self):
        payment = self._receipt({'id': 'pay-1', 'invoice_id': INVOICE_ID, 'amount_cents': 5000,
                                 'method': 'card', 'card_brand': 'visa', 'card_last4': '4242'})
        assert (payment['method'], payment['card_brand'], payment['card_last4']) == ('card', 'visa', '4242')

    def test_a_check_receipt_carries_no_card(self):
        payment = self._receipt({'id': 'pay-1', 'invoice_id': INVOICE_ID, 'amount_cents': 5000,
                                 'method': 'check'})
        assert payment['method'] == 'check'
        assert payment['card_brand'] is None and payment['card_last4'] is None
