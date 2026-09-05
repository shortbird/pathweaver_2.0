"""
A student switches classes; the bill follows — but only one way.

iCreate, 2026-09-04 (98445c62): "If a student switches classes, if their current
invoice has not been paid, could that auto update the invoice with whatever new
fees apply? If the invoice has been paid and they switch classes, can we have it
auto send them a new payment for extra fees incurred or a message that they now
have a credit?"

...then, the same day (ad37b8c2): "nix the part about issuing credits. We have a
no refund no credit policy on class supply fees due to the fact that we likely
have already purchased supplies for any given class. But an auto payment if more
is due would still be good."

So the rule these tests hold is: money moves toward the school, never away from
it, once any of it has been paid.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_billing_service as billing


ORG = 'org-1'
STUDENT = 'ada'

POTTERY = {'id': 'c-pottery', 'name': 'Pottery', 'price_cents': 20000, 'supply_fee': 15}
CHOIR = {'id': 'c-choir', 'name': 'Choir', 'price_cents': 10000, 'supply_fee': 0}


def _run(enrolled, invoice, lines, classes=(POTTERY, CHOIR)):
    """reprice_for_class_change with its four reads stubbed. Returns
    (result, update_invoice mock, create_charge mock)."""
    tables = {
        'class_enrollments': [{'class_id': c} for c in enrolled],
        'sis_invoices': [invoice] if invoice else [],
        'sis_invoice_line_items': lines,
        'org_classes': [c for c in classes],
    }

    def _table(name):
        chain = Mock()
        for m in ('select', 'eq', 'in_', 'order', 'limit'):
            getattr(chain, m).return_value = chain
        chain.execute.return_value = Mock(data=tables.get(name, []))
        return chain

    admin = Mock()
    admin.table.side_effect = _table
    with patch.object(billing, '_admin', return_value=admin), \
         patch.object(billing, '_audit'), \
         patch.object(billing, 'update_invoice',
                      return_value={'invoice': {'id': 'inv-1'}}) as upd, \
         patch.object(billing, 'create_charge',
                      return_value={'invoice': {'id': 'inv-new'}}) as charge:
        out = billing.reprice_for_class_change(ORG, STUDENT, 'molly')
    return out, upd, charge


UNPAID = {'id': 'inv-1', 'household_id': 'h1', 'status': 'sent', 'amount_paid_cents': 0}
PART_PAID = {**UNPAID, 'status': 'partial', 'amount_paid_cents': 5000}


def _line(class_id, amount, description='Pottery'):
    return {'id': f'li-{class_id}', 'class_id': class_id, 'description': description,
            'amount_cents': amount, 'quantity': 1, 'kind': 'tuition'}


@pytest.mark.unit
class TestNothingPaidYet:
    def test_a_class_they_joined_is_added_to_the_bill(self):
        _out, upd, _c = _run(['c-pottery', 'c-choir'], UNPAID, [_line('c-pottery', 21500)])
        lines = upd.call_args.kwargs['line_items']
        assert {li['class_id'] for li in lines} == {'c-pottery', 'c-choir'}

    def test_the_new_line_carries_tuition_plus_the_supply_fee(self):
        """The supply fee is the part the no-refund policy is about, so it has
        to be on the bill in the first place."""
        _out, upd, _c = _run(['c-pottery'], UNPAID, [])
        line = upd.call_args.kwargs['line_items'][0]
        assert line['amount_cents'] == 20000 + 1500

    def test_a_class_they_left_comes_off(self):
        """Nobody has parted with anything, so there is no refund to argue about."""
        _out, upd, _c = _run(['c-choir'], UNPAID,
                             [_line('c-pottery', 21500), _line('c-choir', 10000, 'Choir')])
        assert {li['class_id'] for li in upd.call_args.kwargs['line_items']} == {'c-choir'}

    def test_lines_that_are_not_a_class_survive_a_reprice(self):
        """A registration fee or a card fee is not part of a class change, and
        must not be swept off the invoice by one."""
        fee = {'id': 'li-fee', 'class_id': None, 'description': 'Registration',
               'amount_cents': 5000, 'quantity': 1, 'kind': 'registration'}
        _out, upd, _c = _run(['c-pottery', 'c-choir'], UNPAID,
                             [fee, _line('c-pottery', 21500)])
        descriptions = [li['description'] for li in upd.call_args.kwargs['line_items']]
        assert 'Registration' in descriptions
        assert 'Choir' in descriptions

    def test_nothing_happens_when_the_bill_already_matches(self):
        out, upd, charge = _run(['c-pottery'], UNPAID, [_line('c-pottery', 21500)])
        assert out['changed'] is False
        assert not upd.called and not charge.called


@pytest.mark.unit
class TestOnceMoneyHasLanded:
    def test_an_added_class_is_billed_as_its_own_charge(self):
        out, upd, charge = _run(['c-pottery', 'c-choir'], PART_PAID, [_line('c-pottery', 21500)])
        assert out['billed_separately'] is True
        assert charge.call_args.args[1]['amount_cents'] == 10000
        # The paid invoice itself is never rewritten — that would stop matching
        # the money already received.
        assert not upd.called

    def test_a_dropped_class_produces_no_credit_and_no_refund(self):
        """Their policy, stated twice: supplies are already bought."""
        out, upd, charge = _run(['c-choir'], PART_PAID,
                                [_line('c-pottery', 21500), _line('c-choir', 10000, 'Choir')])
        assert out['changed'] is False
        assert not upd.called and not charge.called

    def test_a_swap_bills_only_the_difference_that_is_owed(self):
        """Pottery out, Choir in: Choir is billed, Pottery is not refunded."""
        out, _upd, charge = _run(['c-choir'], PART_PAID, [_line('c-pottery', 21500)])
        assert out['changed'] is True
        assert charge.call_args.args[1]['amount_cents'] == 10000

    def test_the_charge_names_the_class_so_the_family_knows_what_it_is(self):
        _out, _upd, charge = _run(['c-pottery', 'c-choir'], PART_PAID, [_line('c-pottery', 21500)])
        assert 'Choir' in charge.call_args.args[1]['description']


@pytest.mark.unit
class TestWhenItDoesNothing:
    def test_a_student_with_no_open_invoice_is_left_alone(self):
        out, upd, charge = _run(['c-pottery'], None, [])
        assert out == {'changed': False, 'reason': 'no open invoice'}
        assert not upd.called and not charge.called
