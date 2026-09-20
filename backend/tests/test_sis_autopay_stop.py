"""
Stopping autopay, and a sweep that follows the invoice.

iCreate, 2026-09-20 ("Stop auto-pay"): the Rose family withdrew before the
add/drop deadline, the office refunded their first payments, and the September
installment went through anyway. Nothing on the invoice could stop the plan:
the sweep read sis_payment_plans.status = 'active' and only the last paid
installment ever wrote anything else. Not a void, not a refund, not an edit.

These tests hold the three answers: staff can stop a plan, a void stops its
plan, and the sweep never charges a void or settled invoice, or more than the
balance.
"""

from unittest.mock import MagicMock, patch

import pytest

from services import sis_billing_service as billing


class _Db:
    """A fake admin client keyed by table. `rows[table]` answers every read on
    that table; every update is recorded as (table, payload, filters)."""

    def __init__(self, rows):
        self.rows = rows
        self.updates = []

    def table(self, name):
        db = self

        class _Q:
            def __init__(self):
                self.filters = []
                self.payload = None

            def update(self, payload):
                self.payload = payload
                return self

            def __getattr__(self, attr):
                def _f(*a, **k):
                    self.filters.append((attr, a))
                    return self
                return _f

            def execute(self):
                if self.payload is not None:
                    db.updates.append((name, self.payload, list(self.filters)))
                    return MagicMock(data=[])
                return MagicMock(data=list(db.rows.get(name, [])))
        return _Q()

    def updated(self, table):
        return [u for u in self.updates if u[0] == table]


PLAN = {'id': 'pp1', 'invoice_id': 'inv1', 'status': 'active', 'auto_charge': True,
        'saved_payment_method_id': 'pm1'}
INSTALLMENTS = [
    {'id': 'i1', 'amount_cents': 7300, 'status': 'paid', 'due_date': '2026-08-15'},
    {'id': 'i2', 'amount_cents': 7300, 'status': 'paid', 'due_date': '2026-09-15'},
    {'id': 'i3', 'amount_cents': 7300, 'status': 'scheduled', 'due_date': '2026-10-15'},
    {'id': 'i4', 'amount_cents': 7300, 'status': 'scheduled', 'due_date': '2026-11-15'},
]


@pytest.mark.unit
class TestCancelAutopay:
    def _run(self, invoice=None):
        rows = {
            'sis_invoices': [invoice] if invoice else [],
            'sis_payment_plans': [PLAN],
            # The read filters on status, which the fake ignores; hand it the
            # unpaid ones as the database would.
            'sis_installments': [i for i in INSTALLMENTS if i['status'] != 'paid'],
        }
        db = _Db(rows)
        with patch.object(billing, '_admin', return_value=db), \
             patch.object(billing, '_audit') as audit, \
             patch.object(billing, 'get_invoice', return_value={'id': 'inv1'}):
            out = billing.cancel_autopay('org1', 'inv1', 'marika', reason='withdrew')
        return out, db, audit

    def test_missing_invoice(self):
        assert self._run(None)[0]['error'] == 'Invoice not found'

    def test_the_plan_is_cancelled_and_stops_charging(self):
        _out, db, _audit = self._run({'id': 'inv1'})
        (_t, payload, _f), = db.updated('sis_payment_plans')
        assert payload == {'status': 'cancelled', 'auto_charge': False}

    def test_unpaid_installments_are_waived_and_paid_ones_kept(self):
        _out, db, _audit = self._run({'id': 'inv1'})
        (_t, payload, filters), = db.updated('sis_installments')
        assert payload['status'] == 'waived'
        assert ('in_', ('id', ['i3', 'i4'])) in filters

    def test_what_was_stopped_is_reported_and_audited(self):
        out, _db, audit = self._run({'id': 'inv1'})
        assert out['stopped'] == {'cancelled': 1, 'waived': 2, 'waived_cents': 14600}
        assert audit.call_args.args[3] == 'autopay_cancelled'
        assert audit.call_args.args[4]['reason'] == 'withdrew'

    def test_nothing_to_stop_is_not_an_error(self):
        db = _Db({'sis_invoices': [{'id': 'inv1'}], 'sis_payment_plans': []})
        with patch.object(billing, '_admin', return_value=db), \
             patch.object(billing, 'get_invoice', return_value={'id': 'inv1'}):
            out = billing.cancel_autopay('org1', 'inv1', 'marika')
        assert out['stopped'] == {'cancelled': 0, 'waived': 0, 'waived_cents': 0}
        assert db.updates == []


@pytest.mark.unit
class TestVoidStopsThePlan:
    def test_voiding_an_invoice_cancels_its_active_plan(self):
        db = _Db({'sis_invoices': [{'id': 'inv1', 'status': 'sent', 'amount_paid_cents': 0}],
                  'sis_payment_plans': [PLAN], 'sis_installments': []})
        with patch.object(billing, '_admin', return_value=db), \
             patch.object(billing, '_audit') as audit:
            billing.void_invoice('org1', 'inv1', 'marika')
        assert any(p == {'status': 'cancelled', 'auto_charge': False}
                   for _t, p, _f in db.updated('sis_payment_plans'))
        assert [c.args[3] for c in audit.call_args_list] == ['invoice_voided', 'autopay_cancelled']


@pytest.mark.unit
class TestTheSweepFollowsTheInvoice:
    def _sweep(self, invoice, due):
        rows = {'sis_payment_plans': [PLAN], 'sis_invoices': [invoice],
                'sis_installments': due}
        db = _Db(rows)
        with patch.object(billing, '_admin', return_value=db), \
             patch.object(billing, '_audit'), \
             patch.object(billing, '_saved_payment_method', return_value={'id': 'pm1', 'guardian_user_id': 'g1'}), \
             patch.object(billing, '_org_stripe_secret', return_value='sk_test'), \
             patch.object(billing, '_charge_installment',
                          return_value={'status': 'charged'}) as charge:
            out = billing.charge_due_installments(today='2026-10-15')
        return out, db, charge

    def test_a_void_invoice_is_not_charged_and_its_plan_is_cancelled(self):
        out, db, charge = self._sweep(
            {'id': 'inv1', 'organization_id': 'org1', 'status': 'void',
             'total_cents': 73000, 'amount_paid_cents': 14600}, [INSTALLMENTS[2]])
        assert not charge.called
        assert out['charged'] == 0
        assert any(p['status'] == 'cancelled' for _t, p, _f in db.updated('sis_payment_plans'))

    def test_a_settled_invoice_completes_its_plan_instead_of_charging(self):
        # Edited down to what was already paid (the Rose case, done right):
        # nothing is owed, so the remaining schedule is waived, not collected.
        out, db, charge = self._sweep(
            {'id': 'inv1', 'organization_id': 'org1', 'status': 'paid',
             'total_cents': 14600, 'amount_paid_cents': 14600}, [INSTALLMENTS[2]])
        assert not charge.called
        assert any(p['status'] == 'completed' for _t, p, _f in db.updated('sis_payment_plans'))

    def test_the_last_charge_is_capped_at_the_balance(self):
        # $73 scheduled, $50 still owed: the card is charged $50.
        _out, _db, charge = self._sweep(
            {'id': 'inv1', 'organization_id': 'org1', 'status': 'partial',
             'total_cents': 19600, 'amount_paid_cents': 14600}, [INSTALLMENTS[2], INSTALLMENTS[3]])
        assert charge.call_count == 1
        assert charge.call_args.args[2]['amount_cents'] == 5000

    def test_an_open_invoice_is_charged_as_before(self):
        _out, _db, charge = self._sweep(
            {'id': 'inv1', 'organization_id': 'org1', 'status': 'partial',
             'total_cents': 73000, 'amount_paid_cents': 14600}, [INSTALLMENTS[2]])
        assert charge.call_count == 1
        assert charge.call_args.args[2]['amount_cents'] == 7300


@pytest.mark.unit
class TestAutopaySummary:
    def test_no_plan_is_none(self):
        assert billing.autopay_summary({'payment_plans': []}) is None

    def test_what_is_left_and_when(self):
        inv = {'payment_plans': [dict(PLAN, installment_count=10, installments=INSTALLMENTS)]}
        assert billing.autopay_summary(inv) == {
            'status': 'active', 'auto_charge': True, 'has_card': True,
            'installment_count': 10, 'remaining_count': 2, 'remaining_cents': 14600,
            'next_due_date': '2026-10-15'}

    def test_a_plan_without_a_card_says_so(self):
        # The Larson family, 2026-09-19: the deletion sweep took the saved card
        # with the parent's old account and the plan kept saying "active" with
        # nothing to charge. The office needs to see that.
        inv = {'payment_plans': [dict(PLAN, saved_payment_method_id=None, installments=INSTALLMENTS)]}
        assert billing.autopay_summary(inv)['has_card'] is False
