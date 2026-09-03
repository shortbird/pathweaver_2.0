"""A denied user_skill_xp read must not cost the caller their XP.

user_skill_xp is service-role-only -- no Data API grant, RLS on with no
policies -- so any caller holding a user client is denied it (Postgres 42501).
calculate_user_xp read that table first, and the exception aborted the whole V3
branch and handed off to the legacy path, which reads the SAME table, fails the
same way, and returns zeros. The completed-task tally in between, which reads
granted tables and produces the right number, was never reached: every
transcript answered 200 with "0 XP" and an empty pillar breakdown
(Sentry OPTIO-BACKEND-7T/7V, 2026-09-03).
"""
import pytest

from routes.users.helpers import calculate_user_xp


class _Denied(Exception):
    """Stands in for postgrest's 42501 permission-denied error."""


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table, tables):
        self._table = table
        self._tables = tables

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def execute(self):
        value = self._tables.get(self._table)
        if isinstance(value, Exception):
            raise value
        return _Result(value)


class _Client:
    """Minimal supabase stand-in: table name -> rows, or an Exception to raise."""

    def __init__(self, **tables):
        self._tables = tables
        self.touched = []

    def table(self, name):
        self.touched.append(name)
        return _Query(name, self._tables)


COMPLETIONS = [
    {'user_quest_tasks': {'pillar': 'stem', 'xp_value': 100}},
    {'user_quest_tasks': {'pillar': 'art', 'xp_value': 50}},
]


def test_denied_skill_table_falls_through_to_completed_tasks():
    client = _Client(user_skill_xp=_Denied('permission denied for table user_skill_xp'),
                     quest_task_completions=COMPLETIONS)

    total, breakdown = calculate_user_xp(client, 'user-1')

    # The whole point: the denial costs the shortcut, not the answer.
    assert total == 150
    assert breakdown['stem'] == 100
    assert breakdown['art'] == 50
    assert 'quest_task_completions' in client.touched


def test_readable_skill_table_is_still_the_source_of_truth():
    client = _Client(user_skill_xp=[{'pillar': 'stem', 'xp_amount': 700}])

    total, breakdown = calculate_user_xp(client, 'user-1')

    assert total == 700
    assert breakdown['stem'] == 700
    # It had its answer, so it must not go on to tally completions.
    assert 'quest_task_completions' not in client.touched


def test_empty_skill_table_still_tallies_completions():
    """Unchanged behaviour: an org student whose XP was never synced across."""
    client = _Client(user_skill_xp=[], quest_task_completions=COMPLETIONS)

    total, _ = calculate_user_xp(client, 'user-1')

    assert total == 150
