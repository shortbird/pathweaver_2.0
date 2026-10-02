"""
Monthly payment plans beside monthly tuition — ticket bc9010f4.

Marika (iCreate org_admin), 2026-10-02, on /billing?tab=monthly: "It is saying
there is no student on a monthly rate, yet I know there are at least a couple
who are. Do we have to add them manually to the monthly tuition tab?"

iCreate's monthly families pay by an autopay payment plan (sis_payment_plans,
cadence 'monthly', installments on a term invoice), not by a monthly tuition
schedule (sis_recurring_tuition), and the Monthly tab listed only schedules.
Adding a plan family there by hand would have charged them twice. Covers:

  - the read-only plan listing: active monthly plans only, scoped to the org
    through the invoice, with the next installment's amount and date;
  - the GET route's new `payment_plans` key, beside the unchanged keys;
  - create() refusing (409, nothing written) a student a plan already bills.

The database is an in-memory fake; nothing here talks to Supabase or Stripe.
"""

import json
from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest

from services import sis_recurring_tuition_service as recurring


# ── A minimal PostgREST fake ─────────────────────────────────────────────────
# Enough of the builder for these reads: eq / neq / in_ (including a filter on
# the embedded invoice, 'sis_invoices.col'), order, range, limit, insert,
# update. The embed is resolved from the plan's invoice_id.

class _Query:
    def __init__(self, db, table):
        self.db, self.table, self.filters, self._limit = db, table, [], None
        self._range = None
        self.op, self.payload = 'select', None

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.filters.append((col, lambda v, x=val: v == x))
        return self

    def neq(self, col, val):
        self.filters.append((col, lambda v, x=val: v != x))
        return self

    def in_(self, col, vals):
        self.filters.append((col, lambda v, xs=tuple(vals): v in xs))
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def insert(self, payload):
        self.op, self.payload = 'insert', payload
        self.db.writes.append((self.table, 'insert', payload))
        return self

    def update(self, payload):
        self.op, self.payload = 'update', payload
        self.db.writes.append((self.table, 'update', payload))
        return self

    def _row_view(self, row):
        view = dict(row)
        if self.table == 'sis_payment_plans':
            inv = next((i for i in self.db.tables['sis_invoices']
                        if i['id'] == row['invoice_id']), None)
            view['sis_invoices'] = dict(inv) if inv else None
        return view

    def _value(self, view, col):
        if '.' in col:
            embed, field = col.split('.', 1)
            return (view.get(embed) or {}).get(field)
        return view.get(col)

    def execute(self):
        if self.op == 'insert':
            row = dict(self.payload, id='new-row')
            return Mock(data=[row])
        rows = [self._row_view(r) for r in self.db.tables.get(self.table, [])]
        rows = [r for r in rows if all(f(self._value(r, c)) for c, f in self.filters)]
        if self.table == 'sis_payment_plans':
            rows = [r for r in rows if r.get('sis_invoices')]  # !inner
        if self.op == 'update':
            return Mock(data=[dict(r, **self.payload) for r in rows])
        if self._range:
            rows = rows[self._range[0]:self._range[1] + 1]
        if self._limit is not None:
            rows = rows[:self._limit]
        return Mock(data=rows)


class FakeDB:
    def __init__(self, **tables):
        self.tables = {k: list(v) for k, v in tables.items()}
        self.writes = []

    def table(self, name):
        return _Query(self, name)


ORG = 'org-icreate'

USERS = [
    {'id': 's1', 'first_name': 'Robin', 'last_name': 'Rose'},
    {'id': 's2', 'first_name': 'Uma', 'last_name': 'Larson'},
    {'id': 's3', 'first_name': 'Jay', 'last_name': 'Larson'},
]
HOUSEHOLDS = [
    {'id': 'hh-rose', 'name': 'Rose Family', 'organization_id': ORG},
    {'id': 'hh-larson', 'name': 'Larson Family', 'organization_id': ORG},
]


def _invoice(iid, student, hh, org=ORG, total=300000):
    return {'id': iid, 'organization_id': org, 'household_id': hh,
            'student_user_id': student, 'total_cents': total}


def _plan(pid, invoice_id, status='active', cadence='monthly', auto=True, pm='pm-1', count=3):
    return {'id': pid, 'invoice_id': invoice_id, 'status': status, 'cadence': cadence,
            'auto_charge': auto, 'saved_payment_method_id': pm, 'installment_count': count}


def _inst(iid, plan_id, due, cents, status='scheduled'):
    return {'id': iid, 'payment_plan_id': plan_id, 'due_date': due,
            'amount_cents': cents, 'status': status}


@contextmanager
def _db(**tables):
    base = {'users': USERS, 'households': HOUSEHOLDS, 'sis_invoices': [],
            'sis_payment_plans': [], 'sis_installments': [], 'sis_recurring_tuition': []}
    base.update(tables)
    db = FakeDB(**base)
    with patch.object(recurring, '_admin', return_value=db):
        yield db


# ── The listing ──────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestListMonthlyPaymentPlans:
    """Ticket bc9010f4 (Marika, iCreate): families paying by a monthly plan
    must show on the Monthly tab, read-only."""

    def test_lists_an_active_monthly_plan_with_its_next_installment(self):
        with _db(sis_invoices=[_invoice('inv1', 's1', 'hh-rose')],
                 sis_payment_plans=[_plan('p1', 'inv1')],
                 sis_installments=[
                     _inst('i1', 'p1', '2026-09-01', 100000, 'paid'),
                     _inst('i2', 'p1', '2026-10-01', 100000),
                     _inst('i3', 'p1', '2026-11-01', 100000)]):
            rows = recurring.list_monthly_payment_plans(ORG)
        assert len(rows) == 1
        r = rows[0]
        assert r['student_name'] == 'Robin Rose'
        assert r['household_name'] == 'Rose Family'
        assert r['household_id'] == 'hh-rose'
        assert r['monthly_cents'] == 100000
        assert r['next_due_date'] == '2026-10-01'
        assert r['remaining_count'] == 2
        assert r['installment_count'] == 3
        assert r['auto_charge'] is True
        assert r['has_card'] is True

    def test_carries_no_card_details(self):
        with _db(sis_invoices=[_invoice('inv1', 's1', 'hh-rose')],
                 sis_payment_plans=[_plan('p1', 'inv1')]):
            row = recurring.list_monthly_payment_plans(ORG)[0]
        assert 'saved_payment_method_id' not in row
        assert not any(k.startswith('card') for k in row)

    def test_leaves_out_cancelled_and_non_monthly_plans(self):
        with _db(sis_invoices=[_invoice('inv1', 's1', 'hh-rose'),
                               _invoice('inv2', 's2', 'hh-larson'),
                               _invoice('inv3', 's3', 'hh-larson')],
                 sis_payment_plans=[_plan('p1', 'inv1', status='cancelled', auto=False),
                                    _plan('p2', 'inv2', cadence='quarterly'),
                                    _plan('p3', 'inv3', status='completed')]):
            assert recurring.list_monthly_payment_plans(ORG) == []

    def test_leaves_out_another_school_s_plans(self):
        with _db(sis_invoices=[_invoice('inv1', 's1', 'hh-rose', org='org-other')],
                 sis_payment_plans=[_plan('p1', 'inv1')]):
            assert recurring.list_monthly_payment_plans(ORG) == []

    def test_empty_when_the_school_has_no_plans(self):
        with _db():
            assert recurring.list_monthly_payment_plans(ORG) == []

    def test_says_autopay_is_off_when_it_is(self):
        with _db(sis_invoices=[_invoice('inv1', 's1', 'hh-rose')],
                 sis_payment_plans=[_plan('p1', 'inv1', auto=False, pm=None)]):
            row = recurring.list_monthly_payment_plans(ORG)[0]
        assert row['auto_charge'] is False
        assert row['has_card'] is False


# ── The guard on "+ Add student" ─────────────────────────────────────────────

@pytest.mark.unit
class TestCreateRefusesAPlanStudent:
    """Ticket bc9010f4 (Marika, iCreate): a student already on a monthly
    payment plan must not also get monthly tuition — that is two charges."""

    @contextmanager
    def _create_env(self, **tables):
        with _db(**tables) as db, \
             patch.object(recurring.sis_service, 'student_in_org', return_value=True), \
             patch.object(recurring, '_student_household_id', side_effect=lambda o, s: {
                 's1': 'hh-rose', 's2': 'hh-larson', 's3': 'hh-larson'}[s]), \
             patch.object(recurring.billing, 'household_saved_card', return_value=None), \
             patch.object(recurring, '_hydrate', side_effect=lambda rows: rows):
            yield db

    def test_refuses_a_student_on_their_own_plan_and_writes_nothing(self):
        with self._create_env(sis_invoices=[_invoice('inv1', 's1', 'hh-rose')],
                              sis_payment_plans=[_plan('p1', 'inv1')]) as db:
            result = recurring.create(ORG, 's1', 50000, actor_id='admin-1')
        assert result['conflict'] is True
        assert result['error'] == ('Robin Rose already pays by a monthly payment plan. '
                                   'Adding monthly tuition would charge them twice.')
        assert db.writes == []

    def test_refuses_a_child_of_a_family_wide_plan(self):
        # A plan on the family's invoice (no single student) bills every child.
        with self._create_env(sis_invoices=[_invoice('inv1', None, 'hh-larson')],
                              sis_payment_plans=[_plan('p1', 'inv1')]) as db:
            result = recurring.create(ORG, 's3', 50000, actor_id='admin-1')
        assert result.get('conflict') is True
        assert db.writes == []

    def test_a_sibling_s_own_plan_does_not_block_another_child(self):
        with self._create_env(sis_invoices=[_invoice('inv1', 's2', 'hh-larson')],
                              sis_payment_plans=[_plan('p1', 'inv1')]) as db:
            result = recurring.create(ORG, 's3', 50000, actor_id='admin-1')
        assert 'error' not in result
        assert [w[:2] for w in db.writes] == [('sis_recurring_tuition', 'insert')]

    def test_allows_a_student_whose_plan_was_cancelled(self):
        with self._create_env(sis_invoices=[_invoice('inv1', 's1', 'hh-rose')],
                              sis_payment_plans=[_plan('p1', 'inv1', status='cancelled')]) as db:
            result = recurring.create(ORG, 's1', 50000, actor_id='admin-1')
        assert 'error' not in result
        assert db.writes[0][0] == 'sis_recurring_tuition'
        assert db.writes[0][2]['student_user_id'] == 's1'

    def test_allows_a_student_with_no_plan(self):
        with self._create_env() as db:
            result = recurring.create(ORG, 's1', 50000, actor_id='admin-1')
        assert result['schedule']['student_user_id'] == 's1'
        assert len(db.writes) == 1


# ── Routes ───────────────────────────────────────────────────────────────────

def _admin_client_for_role(role):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'role': role, 'org_role': None, 'org_roles': None}])
    return client


@contextmanager
def staff(role='org_admin', org='org-1'):
    with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role(role)), \
         patch('services.sis_service.resolve_org_id', return_value=org):
        yield


@pytest.mark.unit
class TestRoutes:
    URL = '/api/sis/tuition/recurring?organization_id=org-1'

    def test_list_carries_payment_plans_beside_the_schedules(
            self, client, auth_headers, mock_verify_token):
        plan = {'plan_id': 'p1', 'student_name': 'Robin Rose', 'monthly_cents': 100000}
        with staff(), \
             patch('services.sis_recurring_tuition_service.list_for_org',
                   return_value={'schedules': [], 'active_monthly_cents': 0}), \
             patch('services.sis_recurring_tuition_service.list_monthly_payment_plans',
                   return_value=[plan]):
            resp = client.get(self.URL, headers=auth_headers)
        body = json.loads(resp.data)
        assert resp.status_code == 200
        assert body['schedules'] == [] and body['active_monthly_cents'] == 0
        assert body['payment_plans'] == [plan]

    def test_list_defaults_payment_plans_to_empty(self, client, auth_headers, mock_verify_token):
        with staff(), \
             patch('services.sis_recurring_tuition_service.list_for_org',
                   return_value={'schedules': [], 'active_monthly_cents': 0}), \
             patch('services.sis_recurring_tuition_service.list_monthly_payment_plans',
                   return_value=[]):
            resp = client.get(self.URL, headers=auth_headers)
        assert json.loads(resp.data)['payment_plans'] == []

    def test_list_is_still_forbidden_for_advisor(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('advisor')), \
             patch('services.sis_recurring_tuition_service.list_monthly_payment_plans') as lp:
            resp = client.get(self.URL, headers=auth_headers)
        assert resp.status_code == 403
        lp.assert_not_called()

    def test_create_on_a_plan_is_409_with_the_message(
            self, client, auth_headers, mock_verify_token):
        msg = ('Robin Rose already pays by a monthly payment plan. '
               'Adding monthly tuition would charge them twice.')
        with staff(), patch('services.sis_recurring_tuition_service.create',
                            return_value={'error': msg, 'conflict': True}):
            resp = client.post(self.URL, headers=auth_headers,
                               json={'student_id': 's1', 'monthly_cents': 50000})
        assert resp.status_code == 409
        assert json.loads(resp.data)['error'] == msg

    def test_other_create_errors_stay_400(self, client, auth_headers, mock_verify_token):
        with staff(), patch('services.sis_recurring_tuition_service.create',
                            return_value={'error': 'This student already has a monthly tuition schedule'}):
            resp = client.post(self.URL, headers=auth_headers,
                               json={'student_id': 's1', 'monthly_cents': 50000})
        assert resp.status_code == 400
