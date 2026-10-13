"""The credit bank (services/credit_bank_service.py): what banks, what is used,
and that every automatic row banks once."""
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from services import credit_bank_service as bank


class FakeRepo:
    def __init__(self):
        self.rows = []
        self.enrollments = []
        self.completions = []
        self.approved = {}
        self.xp = {}
        self.registrations = []
        self.payments = []
        self.households = {}
        self.schedules = []
        self.transfers = []

    def entries(self, ids):
        return [r for r in self.rows if r['student_user_id'] in ids]

    def has_reference(self, sid, ref):
        return any(r['student_user_id'] == sid and r['reference'] == ref for r in self.rows)

    def insert(self, row):
        row = {**row, 'id': f'e{len(self.rows)}', 'created_at': f'2026-10-{len(self.rows) + 10:02d}T00:00:00+00:00'}
        self.rows.append(row)
        return row

    def academy_enrollments(self, ids):
        return [e for e in self.enrollments if e['user_id'] in ids]

    def finalized_completions(self, ids):
        return [c for c in self.completions if c['user_id'] in ids]

    def approved_subjects(self, ids):
        return {k: v for k, v in self.approved.items() if k in ids}

    def prior_learning_transfers(self, ids):
        return [t for t in self.transfers if t['user_id'] in ids]

    def task_xp(self, ids):
        return {k: v for k, v in self.xp.items() if k in ids}

    def subscribed_registrations(self, org_id):
        return self.registrations

    def autopay_payments(self, org_id, note):
        return self.payments

    def invoice_households(self, ids):
        return {k: v for k, v in self.households.items() if k in ids}

    def tuition_schedules(self, ids):
        return [s for s in self.schedules if s['household_id'] in ids]


@pytest.fixture
def repo(monkeypatch):
    r = FakeRepo()
    monkeypatch.setattr(bank, '_repo', lambda: r)
    return r


def test_monthly_credit_is_tuition_over_credit_price():
    assert bank.monthly_credits() == Decimal('0.5')


def test_school_year_turns_over_in_july():
    assert bank.school_year(datetime(2026, 6, 30, tzinfo=timezone.utc)) == '2025-26'
    assert bank.school_year(datetime(2026, 7, 1, tzinfo=timezone.utc)) == '2026-27'


def test_opened_year_banks_once(repo):
    assert bank.bank_opened_year('s1') is True
    assert bank.bank_opened_year('s1') is False
    assert [float(r['credits']) for r in repo.rows] == [6.0]


def test_balance_uses_only_approvals_since_enrollment(repo):
    bank.bank_opened_year('s1')
    repo.enrollments = [{'user_id': 's1', 'enrolled_at': '2026-10-02T00:00:00+00:00', 'status': 'active'}]
    repo.completions = [
        # Hearthwood history: before the Academy enrollment, never draws.
        {'id': 'c0', 'user_id': 's1', 'finalized_at': '2026-09-01T00:00:00+00:00', 'user_quest_task_id': 't0'},
        {'id': 'c1', 'user_id': 's1', 'finalized_at': '2026-10-05T00:00:00+00:00', 'user_quest_task_id': 't1'},
        {'id': 'c2', 'user_id': 's1', 'finalized_at': '2026-10-06T00:00:00+00:00', 'user_quest_task_id': 't2'},
    ]
    repo.approved = {'c0': {'math': 2000}, 'c1': {'math': 1000, 'science': 500}}
    repo.xp = {'t2': 500}  # no approved round: the task's own XP

    out = bank.balances(['s1'])['s1']

    assert out['banked'] == 6.0
    assert out['used'] == 1.0
    assert out['balance'] == 5.0


def test_awarded_prior_learning_draws_on_the_same_balance(repo):
    bank.add_entry('s1', '1', 'prior_learning', '', 'eliza')
    repo.enrollments = [{'user_id': 's1', 'enrolled_at': '2026-10-02T00:00:00+00:00', 'status': 'active'}]
    repo.transfers = [
        # Prior learning awarded after enrollment: draws.
        {'user_id': 's1', 'total_xp': 1000, 'accredited': False,
         'prior_learning_record_ids': ['pl1'], 'created_at': '2026-10-05T00:00:00+00:00'},
        # Accredited transfer credit is free: never draws.
        {'user_id': 's1', 'total_xp': 4000, 'accredited': True,
         'prior_learning_record_ids': ['pl2'], 'created_at': '2026-10-05T00:00:00+00:00'},
        # A plain transcript transfer, not prior learning review: never draws.
        {'user_id': 's1', 'total_xp': 4000, 'accredited': False,
         'prior_learning_record_ids': None, 'created_at': '2026-10-05T00:00:00+00:00'},
        # Before enrollment: never draws.
        {'user_id': 's1', 'total_xp': 2000, 'accredited': False,
         'prior_learning_record_ids': ['pl3'], 'created_at': '2026-09-01T00:00:00+00:00'},
    ]
    out = bank.balances(['s1'])['s1']
    assert (out['banked'], out['used'], out['balance']) == (1.0, 0.5, 0.5)


def test_balance_may_go_negative(repo):
    repo.enrollments = [{'user_id': 's1', 'enrolled_at': '2026-10-02T00:00:00+00:00', 'status': 'active'}]
    repo.completions = [{'id': 'c1', 'user_id': 's1', 'finalized_at': '2026-10-05T00:00:00+00:00',
                         'user_quest_task_id': 't1'}]
    repo.approved = {'c1': {'math': 3000}}
    assert bank.balances(['s1'])['s1']['balance'] == -1.5


@pytest.mark.parametrize('credits, message', [
    ('0.3', 'steps of 0.5'),
    ('0', 'steps of 0.5'),
    ('abc', 'number'),
    ('-1', 'correction'),
])
def test_manual_entries_are_checked(repo, credits, message):
    with pytest.raises(bank.CreditBankError) as e:
        bank.add_entry('s1', credits, 'accelerated', '', 'staff')
    assert message in str(e.value)


def test_a_correction_needs_a_reason(repo):
    with pytest.raises(bank.CreditBankError):
        bank.add_entry('s1', '-1', 'adjustment', '', 'staff')
    bank.add_entry('s1', '-1', 'adjustment', 'entered twice', 'staff')
    assert repo.rows[-1]['credits'] == '-1'


def test_a_person_cannot_enter_an_included_or_monthly_row(repo):
    with pytest.raises(bank.CreditBankError):
        bank.add_entry('s1', '6', 'included', '', 'staff')


def test_a_purchase_only_caller_cannot_enter_a_correction(repo):
    with pytest.raises(bank.CreditBankError):
        bank.add_entry('s1', '-1', 'adjustment', 'oops', 'eliza', allowed_kinds=bank.PURCHASE_KINDS)
    bank.add_entry('s1', '0.5', 'prior_learning', '', 'eliza', allowed_kinds=bank.PURCHASE_KINDS)
    assert repo.rows[-1]['kind'] == 'prior_learning'


def test_accelerated_purchase_keeps_the_order_number(repo):
    out = bank.add_entry('s1', '1.5', 'accelerated', 'spring push', 'eliza', source='opened',
                         order_reference='OE-1042')
    assert repo.rows[-1]['note'] == 'Order OE-1042: spring push'
    assert repo.rows[-1]['source'] == 'opened'
    assert out['banked'] == 1.5


def test_sweep_banks_each_paid_subscription_month_once_per_student(repo, monkeypatch):
    import stripe
    repo.registrations = [{'id': 'r1', 'stripe_subscription_id': 'sub_1', 'kids': [
        {'user_id': 'k1'}, {'user_id': 'k2'}, {'user_id': 'k3', 'waitlisted': True}, {'name': 'no account'}]}]
    paid = [{'id': 'in_1', 'amount_paid': 5000, 'created': 1791800000, 'status_transitions': {}},
            {'id': 'in_0', 'amount_paid': 0, 'created': 1791800000, 'status_transitions': {}}]
    listing = MagicMock()
    listing.auto_paging_iter.return_value = paid
    monkeypatch.setattr(bank, '_stripe_key', lambda org: 'sk_test')
    monkeypatch.setattr(stripe.Invoice, 'list', lambda **kw: listing)

    first = bank._sweep_subscriptions('org')
    second = bank._sweep_subscriptions('org')

    assert first == {'invoices': 1, 'banked': 2}
    assert second['banked'] == 0
    assert sorted(r['student_user_id'] for r in repo.rows) == ['k1', 'k2']
    assert all(r['credits'] == '0.5' and r['kind'] == 'monthly' for r in repo.rows)


def test_sweep_banks_autopay_for_standard_and_full_time_tuition(repo):
    repo.payments = [{'id': f'p{i}', 'invoice_id': f'i{i}', 'recorded_at': '2026-10-01T14:00:00+00:00'}
                     for i in (1, 2, 3)]
    repo.households = {'i1': 'h1', 'i2': 'h2', 'i3': 'h3'}
    repo.schedules = [
        {'household_id': 'h1', 'student_user_id': 's1', 'monthly_cents': 5000, 'status': 'active'},
        # Full-Time banks the same pace.
        {'household_id': 'h2', 'student_user_id': 's2', 'monthly_cents': 50000, 'status': 'active'},
        # Any other amount: nobody has decided what it buys.
        {'household_id': 'h3', 'student_user_id': 's3', 'monthly_cents': 100000, 'status': 'active'},
    ]
    assert bank._sweep_autopay('org') == {'payments': 3, 'banked': 2}
    assert bank._sweep_autopay('org')['banked'] == 0
    assert sorted(r['student_user_id'] for r in repo.rows) == ['s1', 's2']
    assert all(r['credits'] == '0.5' for r in repo.rows)
