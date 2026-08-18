"""
The training progress report has to count every task, not the first thousand.

Sentry OPTIO-BACKEND-5T, 2026-08-18, during iCreate's family orientation: the
report read user_quest_tasks in one request. One orientation quest on 152
accounts is 2,398 task rows, PostgREST caps a response at 1,000, and it does
not say when it did — so the page showed the front office a task total that was
quietly short, and got shorter as more families arrived.

These tests pin the paging rather than the row count: the fix is only correct if
a read that fills a page goes back for the next one.
"""

from unittest.mock import Mock, patch

import routes.sis.staff_training as training


PAGE = 1000


class _PagedTable:
    """A table that answers in pages, the way PostgREST does — and records how
    many requests it was asked for, since going back for page two is the whole
    behaviour under test."""

    def __init__(self, rows_by_table, calls):
        self.rows_by_table = rows_by_table
        self.calls = calls

    def __call__(self, name):
        return _PagedQuery(name, self.rows_by_table.get(name, []), self.calls)


class _PagedQuery:
    def __init__(self, name, rows, calls):
        self.name, self._rows, self._calls = name, rows, calls
        self._start, self._end = 0, None

    def select(self, *_a, **_k):
        return self

    def in_(self, _col, _vals):
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, start, end):
        self._start, self._end = start, end
        return self

    def execute(self):
        self._calls.append((self.name, self._start))
        if self._end is None:
            return Mock(data=list(self._rows[:PAGE]))
        return Mock(data=list(self._rows[self._start:self._end + 1]))


def _run(rows_by_table):
    calls = []
    client = Mock()
    client.table.side_effect = _PagedTable(rows_by_table, calls)
    with patch.object(training, '_admin', return_value=client):
        result = training._progress_for(['u1'], ['q1'])
    return result, calls


def test_counts_every_task_past_the_first_page():
    """2,398 task rows must produce a total of 2,398, not 1,000."""
    total_tasks = 2398
    rows = {
        'user_quests': [{'id': 'uq1', 'user_id': 'u1', 'quest_id': 'q1',
                         'completed_at': None, 'started_at': 'now'}],
        'user_quest_tasks': [{'id': f't{i}', 'user_quest_id': 'uq1', 'xp_value': 10}
                             for i in range(total_tasks)],
        'quest_task_completions': [],
    }
    result, calls = _run(rows)

    assert result[('u1', 'q1')]['total'] == total_tasks
    # Three pages for 2,398 rows. One request would be the bug.
    task_reads = [c for c in calls if c[0] == 'user_quest_tasks']
    assert len(task_reads) >= 3


def test_completions_past_the_first_page_still_count_as_done():
    """A finished task must not read as unfinished because its completion row
    landed past the cap — that is the same truncation, one table over."""
    total_tasks = 1500
    rows = {
        'user_quests': [{'id': 'uq1', 'user_id': 'u1', 'quest_id': 'q1',
                         'completed_at': None, 'started_at': 'now'}],
        'user_quest_tasks': [{'id': f't{i}', 'user_quest_id': 'uq1', 'xp_value': 10}
                             for i in range(total_tasks)],
        'quest_task_completions': [{'id': f'c{i}', 'task_id': f't{i}'}
                                   for i in range(total_tasks)],
    }
    result, _ = _run(rows)

    assert result[('u1', 'q1')]['done'] == total_tasks
    assert result[('u1', 'q1')]['earned_xp'] == total_tasks * 10


def test_other_peoples_enrollments_are_left_out():
    """Scoping by quest and filtering by person must not widen the report to
    somebody who was not asked about."""
    rows = {
        'user_quests': [
            {'id': 'uq1', 'user_id': 'u1', 'quest_id': 'q1',
             'completed_at': None, 'started_at': 'now'},
            {'id': 'uq2', 'user_id': 'someone-else', 'quest_id': 'q1',
             'completed_at': None, 'started_at': 'now'},
        ],
        'user_quest_tasks': [{'id': 't1', 'user_quest_id': 'uq1', 'xp_value': 10}],
        'quest_task_completions': [],
    }
    result, _ = _run(rows)

    assert ('u1', 'q1') in result
    assert ('someone-else', 'q1') not in result
