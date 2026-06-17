"""Unit tests for POE per-day task provisioning (_ensure_daily_tasks).

Network-free: uses a fake Supabase-style client that records inserts and
serves a controllable 'existing tasks' result, so we can assert the exact
payloads and idempotency without touching any database.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from routes.admin.poe import (  # noqa: E402
    _ensure_daily_tasks,
    POE_DAILY_TASKS,
    POE_DAILY_TASK_XP,
    POE_PILLAR,
    POE_TRANSCRIPT_SUBJECT,
)


class _FakeQuery:
    def __init__(self, table):
        self._table = table

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def execute(self):
        # Only select() chains reach here in this helper.
        class R:
            data = self._table.existing_rows
        return R()


class _FakeInsert:
    def __init__(self, table, rows):
        self._table = table
        self._rows = rows

    def execute(self):
        self._table.inserted.extend(
            self._rows if isinstance(self._rows, list) else [self._rows]
        )

        class R:
            data = self._rows
        return R()


class _FakeTable:
    def __init__(self):
        self.existing_rows = []
        self.inserted = []

    def select(self, *_a, **_k):
        return _FakeQuery(self)

    def insert(self, rows):
        return _FakeInsert(self, rows)


class _FakeClient:
    def __init__(self):
        self._t = _FakeTable()

    def table(self, name):
        assert name == 'user_quest_tasks'
        return self._t


def test_creates_five_tasks_with_correct_payload():
    client = _FakeClient()
    created = _ensure_daily_tasks(client, 'stud-1', 'quest-1', 'uq-1')

    assert created == 5
    rows = client._t.inserted
    assert len(rows) == 5

    # Total display XP fills the 1000 progress target exactly.
    assert sum(r['xp_value'] for r in rows) == 1000

    for idx, r in enumerate(rows):
        assert r['user_id'] == 'stud-1'
        assert r['quest_id'] == 'quest-1'
        assert r['user_quest_id'] == 'uq-1'
        assert r['pillar'] == POE_PILLAR == 'art'
        assert r['xp_value'] == POE_DAILY_TASK_XP == 200
        assert r['order_index'] == idx
        assert r['is_required'] is True
        assert r['approval_status'] == 'approved'
        assert r['title'] == POE_DAILY_TASKS[idx][0]
        # Display-only subject distribution -> drives the progress bar, not real XP.
        assert r['subject_xp_distribution'] == {POE_TRANSCRIPT_SUBJECT: 200}
        assert r['diploma_subjects'] == ['Fine Arts']


def test_idempotent_no_duplicates_when_all_present():
    client = _FakeClient()
    client._t.existing_rows = [{'title': t[0]} for t in POE_DAILY_TASKS]

    created = _ensure_daily_tasks(client, 'stud-1', 'quest-1', 'uq-1')

    assert created == 0
    assert client._t.inserted == []


def test_backfills_only_missing_days():
    client = _FakeClient()
    # Days 1-3 already exist; expect only days 4 and 5 inserted.
    client._t.existing_rows = [{'title': t[0]} for t in POE_DAILY_TASKS[:3]]

    created = _ensure_daily_tasks(client, 'stud-1', 'quest-1', 'uq-1')

    assert created == 2
    titles = [r['title'] for r in client._t.inserted]
    assert titles == [POE_DAILY_TASKS[3][0], POE_DAILY_TASKS[4][0]]
    # order_index stays aligned to the canonical day index (3, 4), not 0/1.
    assert [r['order_index'] for r in client._t.inserted] == [3, 4]
