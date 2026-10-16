"""
Staff put an invoice on a payment plan from the console (2026-10-16).

POST /api/sis/invoices/<id>/payment-plan existed with no screen calling it, and
a family who turned on autopay always got monthly x10, whatever the school had
in mind. Now:

  - the office picks Monthly, Semester (payments 5 months apart) or Pay in
    full, previews the exact schedule, and saves it;
  - the plan spreads what is still OWED, not the original total;
  - an invoice on autopay is refused (the family agreed to those charges), and
    a plan without a card is replaced;
  - a family who turns on autopay for a school-set plan gets the school's
    schedule with their card on it, not a second monthly plan beside it.

Stripe and the DB are mocked; nothing here talks to either.
"""

from contextlib import contextmanager
from datetime import date, timedelta
from unittest.mock import Mock, patch

import pytest

from services import sis_billing_service as billing

ORG = 'org-1'
INV_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
INVOICE = {'id': INV_ID, 'organization_id': ORG, 'household_id': 'hh-1', 'status': 'sent',
           'total_cents': 300000, 'amount_paid_cents': 50000, 'invoice_number': 'INV-1'}


# ── The schedule ─────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestPlanSchedule:
    def test_semester_payments_are_five_months_apart(self):
        out = billing.plan_schedule(250000, 'semester', 2, '2026-08-15')
        assert out['schedule'] == [{'due_date': '2026-08-15', 'amount_cents': 125000},
                                   {'due_date': '2027-01-15', 'amount_cents': 125000}]

    def test_monthly_spreads_the_remainder_onto_the_first_payments(self):
        out = billing.plan_schedule(1000, 'monthly', 3, '2026-11-30')
        assert [s['amount_cents'] for s in out['schedule']] == [334, 333, 333]
        # Clamped to the last day of a short month.
        assert [s['due_date'] for s in out['schedule']] == ['2026-11-30', '2026-12-30', '2027-01-30']

    def test_pay_in_full_is_one_payment_whatever_the_count(self):
        out = billing.plan_schedule(250000, 'full', 7, '2026-09-01')
        assert out['schedule'] == [{'due_date': '2026-09-01', 'amount_cents': 250000}]

    def test_no_date_means_today(self):
        out = billing.plan_schedule(1000, 'full', None, None)
        assert out['schedule'][0]['due_date'] == date.today().isoformat()

    @pytest.mark.parametrize('cadence, count, balance, start, needle', [
        ('weekly', 2, 1000, None, 'monthly, semester'),
        ('monthly', 1, 1000, None, 'between 2 and 24'),
        ('monthly', 25, 1000, None, 'between 2 and 24'),
        ('semester', 5, 1000, None, 'between 2 and 4'),
        ('monthly', '3', 1000, None, 'how many'),
        ('monthly', True, 1000, None, 'how many'),
        ('monthly', 3, 0, None, 'no balance'),
        ('monthly', 3, 1000, '2026-13-01', 'valid first payment date'),
    ])
    def test_refusals(self, cadence, count, balance, start, needle):
        out = billing.plan_schedule(balance, cadence, count, start)
        assert needle in out['error']


# ── Saving it ────────────────────────────────────────────────────────────────

class _Db:
    """Records inserts; returns what was inserted with ids."""

    def __init__(self):
        self.inserts = []

    def table(self, name):
        db = self
        t = Mock()

        def insert(rows):
            db.inserts.append((name, rows))
            q = Mock()
            if isinstance(rows, list):
                q.execute.return_value = Mock(data=[{**r, 'id': f'i{n}'} for n, r in enumerate(rows)])
            else:
                q.execute.return_value = Mock(data=[{**rows, 'id': 'plan-new'}])
            return q
        t.insert.side_effect = insert
        return t


@contextmanager
def _world(invoice=None, active=()):
    db = _Db()
    invoices = Mock()
    invoices.for_org.return_value = None if invoice is False else dict(invoice or INVOICE)
    plans = Mock()
    plans.active_for_invoice.return_value = list(active)
    with patch.object(billing, '_admin', return_value=db), \
         patch.object(billing, 'SisInvoiceRepository', return_value=invoices), \
         patch.object(billing, 'SisPaymentPlanRepository', return_value=plans), \
         patch.object(billing, '_cancel_plans_for_invoice') as cancel, \
         patch.object(billing, '_audit') as audit:
        yield db, cancel, audit


@pytest.mark.unit
class TestCreatePaymentPlan:
    def test_the_plan_spreads_what_is_still_owed(self):
        with _world() as (db, cancel, audit):
            out = billing.create_payment_plan(ORG, INV_ID, 'semester', 2, '2026-08-15', 'staff-1')
        plan_rows = [r for t, r in db.inserts if t == 'sis_payment_plans']
        assert plan_rows == [{'invoice_id': INV_ID, 'cadence': 'semester', 'installment_count': 2}]
        inst = [r for t, r in db.inserts if t == 'sis_installments'][0]
        assert [i['amount_cents'] for i in inst] == [125000, 125000]   # 3,000 total less 500 paid
        assert [i['due_date'] for i in inst] == ['2026-08-15', '2027-01-15']
        assert len(out['plan']['installments']) == 2
        cancel.assert_not_called()
        assert audit.call_args.args[3] == 'payment_plan_set'

    def test_a_preview_writes_nothing(self):
        with _world() as (db, cancel, audit):
            out = billing.create_payment_plan(ORG, INV_ID, 'monthly', 10, '2026-09-01', dry_run=True)
        assert len(out['schedule']) == 10 and sum(s['amount_cents'] for s in out['schedule']) == 250000
        assert db.inserts == []
        audit.assert_not_called()

    def test_a_plan_without_a_card_is_replaced(self):
        with _world(active=[{'id': 'old', 'auto_charge': False}]) as (db, cancel, _):
            out = billing.create_payment_plan(ORG, INV_ID, 'monthly', 5, '2026-09-01', 'staff-1')
        assert 'plan' in out
        cancel.assert_called_once()
        assert cancel.call_args.args[:3] == (ORG, INV_ID, 'staff-1')

    def test_an_invoice_on_autopay_is_refused_and_untouched(self):
        with _world(active=[{'id': 'auto', 'auto_charge': True}]) as (db, cancel, _):
            out = billing.create_payment_plan(ORG, INV_ID, 'semester', 2, '2026-09-01')
        assert out['code'] == 409 and 'Stop autopay first' in out['error']
        assert db.inserts == []
        cancel.assert_not_called()

    @pytest.mark.parametrize('status', ['void', 'paid'])
    def test_a_settled_invoice_is_refused(self, status):
        with _world(invoice={**INVOICE, 'status': status}) as (db, _, _a):
            out = billing.create_payment_plan(ORG, INV_ID, 'monthly', 3, None)
        assert out['code'] == 400 and db.inserts == []

    def test_another_schools_invoice_is_not_found(self):
        with _world(invoice=False):
            assert billing.create_payment_plan(ORG, INV_ID, 'monthly', 3, None)['code'] == 404
        assert billing.create_payment_plan(ORG, 'not-a-uuid', 'monthly', 3, None)['code'] == 404


# ── The family turns on autopay ──────────────────────────────────────────────

SAVED = {'id': 'spm-1', 'guardian_user_id': 'g-1', 'stripe_customer_id': 'cus_1',
         'stripe_payment_method_id': 'pm_1'}


@contextmanager
def _confirm(active_plans, pending):
    setup = {'setup_intent': {'payment_method': 'pm_1'}, 'customer': 'cus_1',
             'metadata': {'guardian_user_id': 'g-1', 'installment_count': 10}}
    table = Mock()
    for chained in ('select', 'eq', 'limit', 'update'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[])
    admin = Mock()
    admin.table.return_value = table
    plans = Mock()
    plans.active_for_invoice.return_value = list(active_plans)
    installments = Mock()
    installments.for_plans.return_value = list(pending)
    with patch.object(billing, '_org_stripe_secret', return_value='sk_test'), \
         patch.object(billing, 'first_session', return_value=setup), \
         patch('stripe.PaymentMethod.retrieve', return_value={'card': {}}), \
         patch.object(billing, '_upsert_saved_pm', return_value=dict(SAVED)), \
         patch.object(billing, '_admin', return_value=admin), \
         patch.object(billing, 'SisPaymentPlanRepository', return_value=plans), \
         patch.object(billing, 'SisInstallmentRepository', return_value=installments), \
         patch.object(billing, '_create_autopay_plan',
                      return_value={'plan': {'id': 'monthly'}, 'first_charge': None}) as monthly, \
         patch.object(billing, '_charge_installment',
                      return_value={'status': 'charged'}) as charge, \
         patch.object(billing, '_audit'), \
         patch('services.sis_billing_alerts.notify_autopay_plan_created'):
        yield table, monthly, charge


@pytest.mark.unit
class TestAutopayOnASchoolPlan:
    SCHOOL_PLAN = {'id': 'plan-s', 'invoice_id': INV_ID, 'cadence': 'semester',
                   'installment_count': 2, 'auto_charge': False}

    def test_the_card_goes_on_the_school_schedule_not_a_new_monthly_plan(self):
        later = (date.today() + timedelta(days=30)).isoformat()
        pending = [{'id': 'in1', 'due_date': later, 'amount_cents': 125000, 'status': 'scheduled'}]
        with _confirm([self.SCHOOL_PLAN], pending) as (table, monthly, charge):
            out = billing._confirm_autopay(dict(INVOICE), 'g-1')
        monthly.assert_not_called()
        table.update.assert_any_call({'auto_charge': True, 'saved_payment_method_id': 'spm-1'})
        assert out['attached'] is True and out['plan']['cadence'] == 'semester'
        charge.assert_not_called()   # nothing is due yet: the first date charges it
        assert out['first_charge'] is None

    def test_an_installment_already_due_is_charged_now_capped_at_the_balance(self):
        pending = [{'id': 'in1', 'due_date': '2020-01-01', 'amount_cents': 999999, 'status': 'due'}]
        with _confirm([self.SCHOOL_PLAN], pending) as (_, monthly, charge):
            billing._confirm_autopay(dict(INVOICE), 'g-1')
        monthly.assert_not_called()
        assert charge.call_args.args[2]['amount_cents'] == 250000

    def test_no_school_plan_still_builds_the_monthly_one(self):
        with _confirm([], []) as (_, monthly, charge):
            billing._confirm_autopay(dict(INVOICE), 'g-1')
        monthly.assert_called_once()
        assert monthly.call_args.args[3] == 10


# ── What the console and the portal read ─────────────────────────────────────

@pytest.mark.unit
class TestActivePlanSummary:
    def test_reads_the_active_plan_in_date_order(self):
        inv = {'payment_plans': [
            {'id': 'old', 'status': 'cancelled', 'installments': []},
            {'id': 'p1', 'status': 'active', 'cadence': 'semester', 'installment_count': 2,
             'auto_charge': False, 'installments': [
                 {'id': 'b', 'due_date': '2027-01-15', 'amount_cents': 5, 'status': 'scheduled'},
                 {'id': 'a', 'due_date': '2026-08-15', 'amount_cents': 5, 'status': 'paid'}]}]}
        out = billing.active_plan_summary(inv)
        assert out['id'] == 'p1' and out['cadence'] == 'semester' and out['auto_charge'] is False
        assert [i['id'] for i in out['installments']] == ['a', 'b']

    def test_none_without_an_active_plan(self):
        assert billing.active_plan_summary({'payment_plans': [{'status': 'completed'}]}) is None
        assert billing.active_plan_summary({}) is None


@pytest.mark.unit
class TestRoute:
    @pytest.fixture
    def staff(self):
        from tests.test_sis_billing_routes import staff
        return staff

    def test_preview_is_200_and_passes_the_flag(self, client, auth_headers, mock_verify_token, staff):
        with staff(), patch('routes.sis.billing.billing.create_payment_plan',
                            return_value={'schedule': []}) as create:
            resp = client.post('/api/sis/invoices/inv1/payment-plan', headers=auth_headers,
                               json={'cadence': 'semester', 'installment_count': 2, 'preview': True})
        assert resp.status_code == 200
        assert create.call_args.kwargs['dry_run'] is True
        assert create.call_args.kwargs['installment_count'] == 2

    def test_the_service_code_is_the_status(self, client, auth_headers, mock_verify_token, staff):
        with staff(), patch('routes.sis.billing.billing.create_payment_plan',
                            return_value={'error': 'This invoice is on autopay.', 'code': 409}):
            resp = client.post('/api/sis/invoices/inv1/payment-plan', headers=auth_headers,
                               json={'cadence': 'monthly', 'installment_count': 3})
        assert resp.status_code == 409
