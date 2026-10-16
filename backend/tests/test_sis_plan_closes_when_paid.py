"""
A paid or voided invoice closes its payment plan (2026-10-16).

Only the autopay sweep used to close a plan, and only a plan with a card. A
plan with no card -- the kind the office now sets from the console -- stayed
'active' on an invoice the family had paid by check or by Checkout, and its
'scheduled' installments were later marked late and given late fees by
apply_late_fees. The invoice turns paid in one place, _recompute_invoice_status,
so the plan closes there: 'completed', its unpaid installments 'waived' (the
schema's CHECK allows scheduled, due, paid, late, waived). void_invoice already
closed the plan; that is pinned here too.

The database is an in-memory fake that applies updates; nothing here talks to
Supabase or Stripe.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_billing_service as billing

ORG = 'org-1'
INV = 'inv-1'


class _Q:
    def __init__(self, db, table):
        self.db, self.table, self.filters, self.op, self.payload = db, table, [], 'select', None

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.filters.append(lambda r, c=col, v=val: r.get(c) == v)
        return self

    def in_(self, col, vals):
        self.filters.append(lambda r, c=col, vs=tuple(vals): r.get(c) in vs)
        return self

    def limit(self, _n):
        return self

    def order(self, *_a, **_k):
        return self

    def update(self, payload):
        self.op, self.payload = 'update', payload
        return self

    def insert(self, payload):
        self.op, self.payload = 'insert', payload
        return self

    def execute(self):
        rows = [r for r in self.db.tables.setdefault(self.table, [])
                if all(f(r) for f in self.filters)]
        if self.op == 'update':
            for r in rows:
                r.update(self.payload)
        if self.op == 'insert':
            self.db.tables[self.table].append(dict(self.payload, id='new'))
            rows = [self.db.tables[self.table][-1]]
        return Mock(data=[dict(r) for r in rows])


class _Db:
    def __init__(self, **tables):
        self.tables = {k: [dict(r) for r in v] for k, v in tables.items()}

    def table(self, name):
        return _Q(self, name)


def _world(paid_cents, plan_auto=False, invoice_status='sent'):
    return _Db(
        sis_invoices=[{'id': INV, 'organization_id': ORG, 'status': invoice_status,
                       'total_cents': 250000, 'amount_paid_cents': 0}],
        sis_payment_records=[{'invoice_id': INV, 'amount_cents': paid_cents}] if paid_cents else [],
        sis_payment_plans=[{'id': 'p1', 'invoice_id': INV, 'status': 'active',
                            'cadence': 'semester', 'auto_charge': plan_auto}],
        sis_installments=[
            {'id': 'i1', 'payment_plan_id': 'p1', 'amount_cents': 125000, 'status': 'paid'},
            {'id': 'i2', 'payment_plan_id': 'p1', 'amount_cents': 125000, 'status': 'scheduled'},
        ])


def _recompute(db):
    with patch.object(billing, '_admin', return_value=db), patch.object(billing, '_audit') as audit:
        out = billing._recompute_invoice_status(INV)
    return out, audit


@pytest.mark.unit
class TestPaidClosesThePlan:
    @pytest.mark.parametrize('auto', [False, True])
    def test_a_paid_invoice_completes_its_plan_and_waives_what_was_not_paid(self, auto):
        db = _world(paid_cents=250000, plan_auto=auto)
        out, audit = _recompute(db)
        assert out['status'] == 'paid'
        plan = db.tables['sis_payment_plans'][0]
        assert plan['status'] == 'completed' and plan['auto_charge'] is False
        assert {i['id']: i['status'] for i in db.tables['sis_installments']} == {
            'i1': 'paid', 'i2': 'waived'}
        assert audit.call_args.args[3] == 'autopay_completed'

    def test_a_part_paid_invoice_keeps_its_plan(self):
        db = _world(paid_cents=125000)
        out, audit = _recompute(db)
        assert out['status'] == 'partial'
        assert db.tables['sis_payment_plans'][0]['status'] == 'active'
        assert db.tables['sis_installments'][1]['status'] == 'scheduled'
        audit.assert_not_called()

    def test_the_office_recording_the_last_check_closes_the_plan(self):
        # record_payment is the office's path; it recomputes, so it closes too.
        db = _world(paid_cents=125000)
        with patch.object(billing, '_admin', return_value=db), \
             patch.object(billing, '_audit'), \
             patch.object(billing, '_attach_card_details'), \
             patch.object(billing, 'enqueue_qbo'), \
             patch.object(billing, '_maybe_autocomplete_registration', return_value=None):
            out = billing.record_payment(ORG, INV, 125000, method='check', external_ref='1041',
                                         installment_id=None, recorded_by='staff-1')
        assert out['invoice']['status'] == 'paid'
        assert db.tables['sis_payment_plans'][0]['status'] == 'completed'
        assert db.tables['sis_installments'][1]['status'] == 'waived'


@pytest.mark.unit
class TestVoidClosesThePlan:
    def test_voiding_cancels_the_plan_and_waives_its_installments(self):
        db = _world(paid_cents=0)
        db.tables['sis_installments'][0]['status'] = 'scheduled'
        with patch.object(billing, '_admin', return_value=db), patch.object(billing, '_audit'):
            out = billing.void_invoice(ORG, INV, 'staff-1')
        assert 'error' not in out
        assert db.tables['sis_invoices'][0]['status'] == 'void'
        assert db.tables['sis_payment_plans'][0]['status'] == 'cancelled'
        assert {i['status'] for i in db.tables['sis_installments']} == {'waived'}
