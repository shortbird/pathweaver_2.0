"""Approving a credit must move pending XP out exactly once.

``finalize_subject_xp`` used to subtract the approved amount from
``pending_xp`` while also adding it to ``xp_amount``. Both production callers
(credit_dashboard/superadmin_actions.py and org_admin_actions.py) had already
withdrawn the requested amount with ``remove_pending_subject_xp`` immediately
before, so every approval decremented pending TWICE.

The learner-visible effect is pending credit vanishing from subjects that had
nothing to do with the approved task: the second withdrawal lands wherever
there happens to be a pending balance. On 2026-09-07 this had eaten 4,335 XP
of pending credit across 13 learners -- one of whom noticed his Social Studies
progress bar had gone backwards and reported it.

The two amounts are not interchangeable, either. When a reviewer overrides the
split, the REQUESTED amount comes out of pending and the APPROVED amount goes
into earned; folding both into one function is what allowed the confusion.
"""

from unittest.mock import MagicMock

import pytest

from routes.tasks.xp_helpers import (
    add_pending_subject_xp,
    finalize_subject_xp,
    pending_subjects_for_completion,
    remove_pending_subject_xp,
)


class FakeSubjectXpTable:
    """An in-memory stand-in for the user_subject_xp table."""

    def __init__(self, rows=None):
        # {(user_id, subject): {'id', 'xp_amount', 'pending_xp'}}
        self.rows = {}
        for i, (user_id, subject, xp, pending) in enumerate(rows or []):
            self.rows[(user_id, subject)] = {
                'id': f'row-{i}', 'user_id': user_id, 'school_subject': subject,
                'xp_amount': xp, 'pending_xp': pending,
            }
        self._next_id = len(self.rows)

    # -- query builder ----------------------------------------------------
    def table(self, name):
        assert name == 'user_subject_xp', name
        return _Query(self)

    def _insert(self, row):
        row = dict(row, id=f'row-{self._next_id}')
        self._next_id += 1
        self.rows[(row['user_id'], row['school_subject'])] = row

    def pending(self, user_id, subject):
        return (self.rows.get((user_id, subject)) or {}).get('pending_xp', 0)

    def earned(self, user_id, subject):
        return (self.rows.get((user_id, subject)) or {}).get('xp_amount', 0)


class _Query:
    def __init__(self, store):
        self.store = store
        self.filters = {}
        self._payload = None
        self._mode = None

    def select(self, *_a, **_k):
        self._mode = 'select'
        return self

    def insert(self, payload):
        self.store._insert(payload)
        self._mode = 'insert'
        return self

    def update(self, payload):
        self._mode = 'update'
        self._payload = payload
        return self

    def eq(self, field, value):
        self.filters[field] = value
        return self

    def in_(self, field, values):
        self.filters[field] = values
        return self

    def _matches(self):
        out = []
        for row in self.store.rows.values():
            ok = True
            for field, value in self.filters.items():
                actual = row.get('id') if field == 'id' else row.get(field)
                if isinstance(value, list):
                    if actual not in value:
                        ok = False
                elif actual != value:
                    ok = False
            if ok:
                out.append(row)
        return out

    def execute(self):
        matched = self._matches()
        if self._mode == 'update':
            for row in matched:
                row.update(self._payload)
        return MagicMock(data=[dict(r) for r in matched])


REQUESTED = {'social_studies': 200}


def _approve(store, user_id, requested, approved):
    """The exact sequence both approval routes run."""
    remove_pending_subject_xp(store, user_id, requested)
    return finalize_subject_xp(store, user_id, approved)


class TestPendingIsWithdrawnOnce:
    def test_approval_moves_the_credit_and_leaves_pending_at_zero(self):
        store = FakeSubjectXpTable([('u1', 'social_studies', 4000, 200)])
        _approve(store, 'u1', REQUESTED, REQUESTED)

        assert store.earned('u1', 'social_studies') == 4200
        assert store.pending('u1', 'social_studies') == 0

    def test_pending_for_other_unapproved_work_is_untouched(self):
        """The regression. 2300 pending, 200 approved -> 2100 must remain."""
        store = FakeSubjectXpTable([('u1', 'social_studies', 4000, 2300)])
        _approve(store, 'u1', REQUESTED, REQUESTED)

        assert store.earned('u1', 'social_studies') == 4200
        assert store.pending('u1', 'social_studies') == 2100

    def test_a_reviewer_override_still_clears_the_requested_amount(self):
        """Requested comes out of pending; approved goes into earned."""
        store = FakeSubjectXpTable([
            ('u1', 'social_studies', 1000, 200),
            ('u1', 'language_arts', 500, 0),
        ])
        _approve(store, 'u1', REQUESTED, {'language_arts': 150})

        assert store.pending('u1', 'social_studies') == 0
        assert store.earned('u1', 'social_studies') == 1000
        assert store.earned('u1', 'language_arts') == 650

    def test_request_then_approve_round_trips_to_zero_pending(self):
        store = FakeSubjectXpTable([('u1', 'fine_arts', 0, 0)])
        add_pending_subject_xp(store, 'u1', {'fine_arts': 175})
        assert store.pending('u1', 'fine_arts') == 175

        _approve(store, 'u1', {'fine_arts': 175}, {'fine_arts': 175})
        assert store.pending('u1', 'fine_arts') == 0
        assert store.earned('u1', 'fine_arts') == 175

    def test_finalizing_a_brand_new_subject_creates_the_row(self):
        store = FakeSubjectXpTable()
        finalize_subject_xp(store, 'u1', {'cte': 50})
        assert store.earned('u1', 'cte') == 50
        assert store.pending('u1', 'cte') == 0


class TestWithdrawalUsesTheRequestedSplit:
    """What went INTO pending is what has to come OUT, even if the task moved."""

    def _store(self, round_rows):
        supabase = MagicMock()
        chain = supabase.table.return_value.select.return_value.eq.return_value \
            .order.return_value.limit.return_value
        chain.execute.return_value = MagicMock(data=round_rows)
        return supabase

    def test_the_review_round_snapshot_wins_over_the_task_today(self):
        supabase = self._store([{'subject_suggestion': {'social_studies': 140,
                                                        'language_arts': 60}}])
        subjects = pending_subjects_for_completion(
            supabase, 'c-1',
            {'subject_xp_distribution': {'social_studies': 200}}, 200,
        )
        assert subjects == {'social_studies': 140, 'language_arts': 60}

    def test_falls_back_to_the_task_when_no_round_was_recorded(self):
        supabase = self._store([])
        subjects = pending_subjects_for_completion(
            supabase, 'c-1',
            {'subject_xp_distribution': {'social_studies': 200}}, 200,
        )
        assert subjects == {'social_studies': 200}

    def test_a_read_failure_falls_back_instead_of_raising(self):
        supabase = MagicMock()
        supabase.table.side_effect = RuntimeError('postgrest down')
        subjects = pending_subjects_for_completion(
            supabase, 'c-1', {'subject_xp_distribution': {'math': 100}}, 100,
        )
        assert subjects == {'math': 100}


@pytest.mark.parametrize('pending_before,approved,expected_after', [
    (0, 100, 0),      # nothing pending: clamp, don't go negative
    (100, 100, 0),
    (450, 100, 350),
])
def test_pending_never_goes_negative(pending_before, approved, expected_after):
    store = FakeSubjectXpTable([('u1', 'math', 0, pending_before)])
    _approve(store, 'u1', {'math': approved}, {'math': approved})
    assert store.pending('u1', 'math') == expected_after
