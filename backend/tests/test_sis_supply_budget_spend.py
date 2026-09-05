"""
What is LEFT of a class's supply budget, and what it went on.

iCreate, 2026-09-01 (805cb3a3): "with the supply & reimbursement requests, it'd
be super awesome if we could connect those to the classes. Then show the teacher
how much they have left in the supply budget (and a transaction history would be
good too.)"

The budget was a ceiling with nothing counted against it. Supply requests and
reimbursements both spend it — one before buying, one after — and both already
carry a class_id, so the spend is derived rather than typed a second time.

Two numbers on purpose: `committed` is everything asked for (what a teacher must
plan against, since a pending request is money they intend to spend) and `spent`
is only what the office has resolved.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_supply_budget_service as budget


ORG = 'org-1'
CLASS = {'id': 'c1', 'supply_fee': 10, 'supply_budget_per_student': 5}


def _run(requests, enrollments=None, raises=False):
    """budget_for_class with the enrollment and spend reads stubbed."""
    enrollments = enrollments if enrollments is not None else [
        {'id': 'e1', 'class_id': 'c1', 'status': 'active'},
        {'id': 'e2', 'class_id': 'c1', 'status': 'active'},
    ]
    calls = {'n': 0}

    def _fetch(fn):
        calls['n'] += 1
        if calls['n'] == 1:
            return enrollments
        if raises:
            raise RuntimeError('postgrest is down')
        return requests

    with patch.object(budget, '_org_settings', return_value={}), \
         patch.object(budget, 'fetch_all_rows', side_effect=_fetch), \
         patch.object(budget, '_admin', return_value=Mock()):
        return budget.budget_for_class(ORG, CLASS)


def _req(amount, status='resolved', **over):
    row = {'id': 'r1', 'class_id': 'c1', 'form_type': 'supply_request',
           'form_type_label': 'Supply request', 'title': 'Clay',
           'status': status, 'payload': {'amount': amount},
           'created_at': '2026-09-01T10:00:00Z', 'submitted_by': 'ana'}
    row.update(over)
    return row


@pytest.mark.unit
class TestRemaining:
    def test_the_ceiling_is_unchanged(self):
        """(fee 10 + allowance 5) x 2 students."""
        assert _run([])['total'] == 30.0

    def test_an_untouched_budget_has_all_of_itself_left(self):
        b = _run([])
        assert b['remaining'] == 30.0
        assert b['spent'] == 0.0 and b['committed'] == 0.0

    def test_a_resolved_request_is_both_spent_and_committed(self):
        b = _run([_req(12)])
        assert b['spent'] == 12.0
        assert b['committed'] == 12.0
        assert b['remaining'] == 18.0

    def test_a_pending_request_is_committed_but_not_yet_spent(self):
        """A teacher planning the next purchase needs Tuesday's request already
        gone from what they have left."""
        b = _run([_req(12, status='submitted')])
        assert b['spent'] == 0.0
        assert b['committed'] == 12.0
        assert b['remaining'] == 18.0

    def test_reimbursements_count_against_the_same_ceiling(self):
        b = _run([_req(10), _req(5, id='r2', form_type='reimbursement')])
        assert b['committed'] == 15.0

    def test_a_request_with_no_amount_moves_neither_number(self):
        """Guessing a figure would make both numbers wrong invisibly."""
        b = _run([_req(None)])
        assert b['committed'] == 0.0
        assert b['remaining'] == 30.0

    def test_an_over_committed_class_says_so_rather_than_showing_zero(self):
        b = _run([_req(50)])
        assert b['remaining'] == -20.0


@pytest.mark.unit
class TestTransactionHistory:
    def test_every_request_is_listed_even_the_ones_with_no_amount(self):
        b = _run([_req(10), _req(None, id='r2', title='Ask about paper')])
        assert {t['title'] for t in b['transactions']} == {'Clay', 'Ask about paper'}

    def test_newest_first(self):
        b = _run([
            _req(10, id='old', title='Old', created_at='2026-08-01T10:00:00Z'),
            _req(10, id='new', title='New', created_at='2026-09-01T10:00:00Z'),
        ])
        assert [t['title'] for t in b['transactions']] == ['New', 'Old']

    def test_each_line_says_which_kind_it_was(self):
        b = _run([_req(5, form_type='reimbursement')])
        assert b['transactions'][0]['kind'] == 'reimbursement'


@pytest.mark.unit
class TestFailureModes:
    def test_a_failed_spend_read_still_returns_the_ceiling(self):
        """A budget with no history is still a budget."""
        b = _run([], raises=True)
        assert b['total'] == 30.0
        assert b['remaining'] == 30.0
        assert b['transactions'] == []
