"""
Bank-first monthly tuition (Optio Academy, 2026-10-05).

A school with branding_config.processing_fee.autopay_bank_free offers a US bank
account (ACH) with no fee, or a card with the processing fee added to every
charge. A card saved before the switch keeps its old terms (card_fee_exempt)
until the family saves a new method. A bank payment takes days to clear, so it
is recorded when it clears, not when it starts.

Stripe and the DB are mocked; nothing here talks to either.
"""

from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest

from services import sis_billing_service as billing
from services import sis_recurring_tuition_service as recurring

ORG = 'org-1'
INVOICE = {'id': 'inv-1', 'invoice_number': 'INV-1', 'total_cents': 50000,
           'amount_paid_cents': 0, 'processing_fee_cents': 0}
CARD = {'id': 'pm1', 'stripe_customer_id': 'cus_1', 'stripe_payment_method_id': 'pm_card',
        'guardian_user_id': 'g1', 'card_brand': 'visa', 'card_last4': '4242',
        'method_type': 'card', 'card_fee_exempt': False}
BANK = {**CARD, 'stripe_payment_method_id': 'pm_bank', 'card_brand': 'STRIPE TEST BANK',
        'card_last4': '6789', 'method_type': 'us_bank_account'}
OLD_CARD = {**CARD, 'card_fee_exempt': True}


# ── Who pays the card fee ────────────────────────────────────────────────────

@pytest.mark.unit
class TestChargesCardFee:
    @pytest.mark.parametrize('saved, school_on, expected', [
        (CARD, True, True),          # new card at a bank-first school
        (BANK, True, False),         # bank is free
        (OLD_CARD, True, False),     # saved before the switch: old terms
        (CARD, False, False),        # school never turned it on
    ])
    def test_rule(self, saved, school_on, expected):
        with patch.object(billing, 'autopay_bank_free', return_value=school_on):
            assert billing.charges_card_fee(ORG, saved) is expected

    def test_fee_terms_read_like_a_price(self):
        with patch.object(billing, '_processing_fee_config',
                          return_value={'percent': 2.9, 'flat_cents': 30}):
            assert billing.card_fee_terms(ORG) == '2.9% + $0.30'


# ── The charge ───────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestChargeInvoiceOffSession:
    @contextmanager
    def _charge(self, intent, school_on=True):
        with patch.object(billing, '_org_stripe_secret', return_value='sk_test'), \
             patch.object(billing, 'autopay_bank_free', return_value=school_on), \
             patch.object(billing, 'compute_processing_fee', return_value=1480), \
             patch.object(billing, '_apply_processing_fee',
                          side_effect=lambda o, i, fee: {**INVOICE, 'total_cents': 50000 + fee,
                                                         'processing_fee_cents': fee}) as apply_fee, \
             patch.object(billing, '_stripe_description', return_value='x'), \
             patch.object(billing, 'record_payment', return_value={}) as record, \
             patch('stripe.PaymentIntent.create', return_value=intent) as create:
            yield create, record, apply_fee

    def test_a_new_card_pays_the_fee(self):
        with self._charge({'id': 'pi_1', 'status': 'succeeded'}) as (create, record, apply_fee):
            out = billing.charge_invoice_off_session(ORG, dict(INVOICE), CARD)
        apply_fee.assert_called_once_with(ORG, 'inv-1', 1480)
        assert create.call_args.kwargs['amount'] == 51480
        assert create.call_args.kwargs['payment_method_types'] == ['card']
        assert out == {'status': 'charged', 'payment_intent': 'pi_1', 'amount_cents': 51480}
        assert record.call_args.kwargs['method'] == 'card'

    def test_a_card_saved_before_the_switch_pays_no_fee(self):
        with self._charge({'id': 'pi_1', 'status': 'succeeded'}) as (create, _, apply_fee):
            billing.charge_invoice_off_session(ORG, dict(INVOICE), OLD_CARD)
        apply_fee.assert_not_called()
        assert create.call_args.kwargs['amount'] == 50000

    def test_a_school_without_the_rule_charges_no_fee(self):
        with self._charge({'id': 'pi_1', 'status': 'succeeded'}, school_on=False) as (create, _, fee):
            billing.charge_invoice_off_session(ORG, dict(INVOICE), CARD)
        fee.assert_not_called()
        assert create.call_args.kwargs['amount'] == 50000

    def test_a_declined_card_takes_the_fee_back_off(self):
        with self._charge({'id': 'pi_1', 'status': 'requires_payment_method'}) as (_, record, fee):
            out = billing.charge_invoice_off_session(ORG, dict(INVOICE), CARD)
        assert out['status'] == 'failed'
        assert [c.args[2] for c in fee.call_args_list] == [1480, 0]
        record.assert_not_called()

    def test_a_bank_payment_is_free_and_recorded_only_when_it_clears(self):
        with self._charge({'id': 'pi_b', 'status': 'processing'}) as (create, record, fee):
            out = billing.charge_invoice_off_session(ORG, dict(INVOICE), BANK)
        fee.assert_not_called()
        assert create.call_args.kwargs['amount'] == 50000
        assert create.call_args.kwargs['payment_method_types'] == ['us_bank_account']
        assert out == {'status': 'processing', 'payment_intent': 'pi_b', 'amount_cents': 50000}
        record.assert_not_called()


# ── The monthly biller ───────────────────────────────────────────────────────

@pytest.mark.unit
class TestBillHouseholdBank:
    def test_a_started_bank_payment_counts_as_this_month_s_charge(self):
        rows = [{'id': 'r1', 'household_id': 'hh1', 'student_user_id': 's1',
                 'monthly_cents': 50000, 'day_of_month': 1}]
        with patch.object(recurring, '_hydrate',
                          return_value=[{**rows[0], 'student_name': 'Emory'}]), \
             patch.object(recurring.billing, 'create_tuition_invoice',
                          return_value={'invoice': dict(INVOICE)}), \
             patch.object(recurring.billing, 'household_saved_card', return_value=BANK), \
             patch.object(recurring.billing, 'charge_invoice_off_session',
                          return_value={'status': 'processing', 'amount_cents': 50000}), \
             patch.object(recurring, '_email_invoice') as emailed:
            from datetime import date
            out = recurring.bill_household(ORG, 'hh1', rows, date(2026, 11, 1))
        assert out['charged'] is True and out['pending'] is True
        emailed.assert_not_called()   # not a decline


# ── Settling bank payments ───────────────────────────────────────────────────

def _intent(pid, status, **extra):
    return {'id': pid, 'status': status, 'amount': 50000,
            'payment_method_types': ['us_bank_account'],
            'metadata': {'kind': 'recurring_tuition', 'invoice_id': 'inv-1'}, **extra}


@pytest.mark.unit
class TestSettleBankPayments:
    @contextmanager
    def _settle(self, intents, already=()):
        table = Mock()
        for chained in ('select', 'eq', 'limit'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=list(already))
        admin = Mock()
        admin.table.return_value = table
        listing = Mock()
        listing.auto_paging_iter.return_value = iter(intents)
        with patch.object(billing, '_org_stripe_secret', return_value='sk_test'), \
             patch.object(billing, '_admin', return_value=admin), \
             patch('stripe.PaymentIntent.list', return_value=listing), \
             patch.object(billing, 'record_payment', return_value={}) as record, \
             patch.object(billing, '_audit') as audit, \
             patch.object(billing, 'email_invoice_to_family') as emailed:
            yield record, audit, emailed

    def test_a_cleared_payment_is_recorded_as_a_bank_transfer(self):
        with self._settle([_intent('pi_1', 'succeeded')]) as (record, _, _e):
            out = billing.settle_bank_payments(ORG)
        assert out == {'cleared': 1, 'failed': 0}
        kw = record.call_args.kwargs
        assert kw['method'] == 'ach' and kw['external_ref'] == 'pi_1' and kw['amount_cents'] == 50000

    def test_a_payment_already_recorded_is_not_recorded_twice(self):
        with self._settle([_intent('pi_1', 'succeeded')], already=[{'id': 'rec'}]) as (record, _, _e):
            out = billing.settle_bank_payments(ORG)
        record.assert_not_called()
        assert out['cleared'] == 0

    def test_a_returned_payment_emails_the_invoice_once(self):
        failed = _intent('pi_1', 'requires_payment_method',
                         last_payment_error={'message': 'insufficient funds'})
        with self._settle([failed]) as (record, audit, emailed):
            out = billing.settle_bank_payments(ORG)
        assert out == {'cleared': 0, 'failed': 1}
        record.assert_not_called()
        emailed.assert_called_once_with(ORG, 'inv-1')
        assert audit.call_args.args[3] == 'bank_payment_failed'

    def test_a_returned_payment_already_flagged_is_left_alone(self):
        failed = _intent('pi_1', 'requires_payment_method')
        with self._settle([failed], already=[{'id': 'audit'}]) as (_, audit, emailed):
            billing.settle_bank_payments(ORG)
        emailed.assert_not_called()
        audit.assert_not_called()

    def test_still_processing_and_card_intents_are_skipped(self):
        card = {**_intent('pi_c', 'succeeded'), 'payment_method_types': ['card']}
        with self._settle([_intent('pi_p', 'processing'), card]) as (record, audit, _e):
            out = billing.settle_bank_payments(ORG)
        assert out == {'cleared': 0, 'failed': 0}
        record.assert_not_called()
        audit.assert_not_called()


# ── Saving what the family chose ─────────────────────────────────────────────

@pytest.mark.unit
class TestSaveFromSetupSession:
    SESSION = {'status': 'complete', 'customer': 'cus_1',
               'metadata': {'kind': 'recurring_card_setup', 'household_id': 'hh1',
                            'guardian_user_id': 'g1'},
               'setup_intent': {'payment_method': 'pm_x', 'status': 'succeeded'}}

    @contextmanager
    def _save(self, pm, session=None):
        with patch.object(billing, '_org_stripe_secret', return_value='sk_test'), \
             patch.object(billing, 'retrieve_session', return_value=session or self.SESSION), \
             patch('stripe.PaymentMethod.retrieve', **pm), \
             patch.object(billing, '_upsert_saved_pm', return_value=dict(CARD)) as upsert:
            yield upsert

    def test_a_bank_account_is_saved_as_one(self):
        pm = {'return_value': {'type': 'us_bank_account',
                               'us_bank_account': {'bank_name': 'CHASE', 'last4': '6789'}}}
        with self._save(pm) as upsert:
            out = billing.save_card_from_setup_session(ORG, 'hh1', 'cs_1')
        assert out['ready'] is True
        args = upsert.call_args
        assert args.kwargs['method_type'] == 'us_bank_account'
        assert args.args[5:7] == ('CHASE', '6789')

    def test_a_card_is_saved_as_a_card(self):
        pm = {'return_value': {'type': 'card', 'card': {'brand': 'amex', 'last4': '1008',
                                                         'exp_month': 3, 'exp_year': 2027}}}
        with self._save(pm) as upsert:
            billing.save_card_from_setup_session(ORG, 'hh1', 'cs_1')
        assert upsert.call_args.kwargs['method_type'] == 'card'

    def test_an_unreadable_method_is_not_saved_under_a_guess(self):
        with self._save({'side_effect': RuntimeError('stripe down')}) as upsert:
            out = billing.save_card_from_setup_session(ORG, 'hh1', 'cs_1')
        assert out == {'ready': False}
        upsert.assert_not_called()

    def test_a_bank_still_verifying_is_not_ready(self):
        pending = {**self.SESSION, 'setup_intent': {'payment_method': 'pm_x',
                                                    'status': 'requires_action'}}
        with self._save({'return_value': {}}, session=pending) as upsert:
            out = billing.save_card_from_setup_session(ORG, 'hh1', 'cs_1')
        assert out == {'ready': False}
        upsert.assert_not_called()


# ── What the family is told ──────────────────────────────────────────────────

@pytest.mark.unit
class TestSetupEmail:
    STUDENTS = [{'student_name': 'Emory', 'monthly_cents': 50000}]

    def test_a_bank_first_school_states_the_choice_and_the_fee(self):
        out = recurring.setup_email_bodies('Optio Academy', self.STUDENTS, 'https://x',
                                           card_fee_terms='2.9% + $0.30')
        for body in (out['text'], out['html']):
            assert 'bank account with no fee' in body
            assert '2.9% + $0.30 processing fee' in body

    def test_other_schools_get_the_old_email(self):
        out = recurring.setup_email_bodies('iCreate', self.STUDENTS, 'https://x')
        assert 'bank account' not in out['text'] and 'Save a card here' in out['text']
