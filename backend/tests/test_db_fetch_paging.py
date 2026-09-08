"""
Silent PostgREST truncation (iCreate feedback 2026-07-29).

Supabase caps a single Data API response at db-max-rows and gives the client no
signal that it did. The SIS class list tallied a whole org's `class_enrollments`
rows in one unpaginated read, so once iCreate crossed the cap the displayed
counts started falling as MORE families enrolled: "outdoor adventure ... was full
with 12/12 students in it. And now it's 0/12", and "Lego robotics says 13/15,
then I look at the roster and there are 14 on the roster".

These tests pin the paging behaviour of fetch_all_rows() and prove the class-list
counts survive a capped server.
"""

from typing import Any, Dict, List
from unittest.mock import MagicMock

import pytest

from repositories.sis_class_repository import SisClassRepository
from utils.db_fetch import fetch_all_rows


class FakeQuery:
    """Minimal supabase-py query stand-in that enforces a server row cap."""

    def __init__(self, rows: List[Dict[str, Any]], cap: int, calls: List[tuple]):
        self._rows = rows
        self._cap = cap
        self._calls = calls
        self._order_by = None
        self._range = None

    # Filters are no-ops here — the fixtures pre-filter their row sets.
    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def neq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def order(self, column, **_k):
        self._order_by = column
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def execute(self):
        assert self._order_by is not None, 'paged reads must order by a unique column'
        rows = sorted(self._rows, key=lambda r: r[self._order_by])
        start, end = self._range if self._range else (0, len(rows) - 1)
        # The server returns at most `cap` rows and says nothing about the rest.
        page = rows[start:end + 1][:self._cap]
        self._calls.append((start, end, len(page)))
        return MagicMock(data=page, count=None)


def _client(rows, cap):
    """A fake supabase client handing out a fresh FakeQuery per table() call."""
    calls: List[tuple] = []
    client = MagicMock()
    client.table.side_effect = lambda _name: FakeQuery(rows, cap, calls)
    return client, calls


def _enrollments(per_class: Dict[str, int]) -> List[Dict[str, Any]]:
    rows = []
    for class_id, n in per_class.items():
        for i in range(n):
            rows.append({'id': f'{class_id}-{i:05d}', 'class_id': class_id})
    return rows


@pytest.mark.unit
class TestFetchAllRows:
    def test_reads_every_row_past_the_server_cap(self):
        rows = [{'id': f'{i:05d}'} for i in range(2500)]
        client, calls = _client(rows, cap=1000)
        got = fetch_all_rows(lambda: client.table('t').select('id'))
        assert len(got) == 2500
        assert [r['id'] for r in got] == [r['id'] for r in rows]
        assert len(calls) == 3  # 1000 + 1000 + 500

    def test_stops_on_a_short_first_page(self):
        client, calls = _client([{'id': f'{i:05d}'} for i in range(7)], cap=1000)
        assert len(fetch_all_rows(lambda: client.table('t').select('id'))) == 7
        assert len(calls) == 1

    def test_no_rows_is_no_rows(self):
        client, _ = _client([], cap=1000)
        assert fetch_all_rows(lambda: client.table('t').select('id')) == []

    def test_page_size_at_the_server_cap_reads_everything(self):
        # The contract in db_fetch: page_size must match the server's row cap.
        rows = [{'id': f'{i:05d}'} for i in range(1200)]
        client, calls = _client(rows, cap=200)
        got = fetch_all_rows(lambda: client.table('t').select('id'), page_size=200)
        assert len(got) == 1200
        assert len(calls) == 7  # six full 200-row pages, then an empty one

    def test_exact_multiple_of_the_cap_is_not_truncated(self):
        rows = [{'id': f'{i:05d}'} for i in range(2000)]
        client, _ = _client(rows, cap=1000)
        assert len(fetch_all_rows(lambda: client.table('t').select('id'))) == 2000

    def test_pages_never_overlap_or_skip(self):
        rows = [{'id': f'{i:05d}'} for i in range(3000)]
        client, _ = _client(rows, cap=1000)
        ids = [r['id'] for r in fetch_all_rows(lambda: client.table('t').select('id'))]
        assert len(ids) == len(set(ids)) == 3000


@pytest.mark.unit
class TestClassListCountsSurviveTheCap:
    """The reported bug, at the layer that produced the wrong numbers."""

    def test_counts_are_exact_when_the_org_runs_past_the_cap(self):
        # 1,080 active enrollments across 100 classes — past a 1000-row cap, so
        # the unpaginated read dropped 80 of them.
        per_class = {f'c{i:03d}': 12 if i < 40 else 10 for i in range(100)}
        client, _ = _client(_enrollments(per_class), cap=1000)
        repo = SisClassRepository(client=client)

        counts = repo.enrollment_counts_for_classes(list(per_class))

        assert sum(counts.values()) == 1080
        assert counts == per_class

    def test_a_full_class_whose_rows_land_past_the_cut_is_not_reported_empty(self):
        # "outdoor adventure ... was full with 12/12 ... And now it's 0/12."
        # Its rows sort last, so an unpaginated read dropped all of them.
        per_class = {f'c{i:03d}': 12 for i in range(100)}
        per_class['zzz-outdoor-adventure'] = 12
        client, _ = _client(_enrollments(per_class), cap=1000)
        repo = SisClassRepository(client=client)

        counts = repo.enrollment_counts_for_classes(list(per_class))

        assert counts['zzz-outdoor-adventure'] == 12

    def test_waitlist_counts_are_paged_too(self):
        per_class = {f'c{i:03d}': 15 for i in range(100)}  # 1,500 entries
        client, _ = _client(_enrollments(per_class), cap=1000)
        repo = SisClassRepository(client=client)

        counts = repo.waitlist_counts_for_classes(list(per_class))

        assert sum(counts.values()) == 1500
        assert counts['c099'] == 15

    def test_empty_class_list_short_circuits(self):
        client, calls = _client([], cap=1000)
        repo = SisClassRepository(client=client)
        assert repo.enrollment_counts_for_classes([]) == {}
        assert repo.waitlist_counts_for_classes([]) == {}
        assert calls == []


@pytest.mark.unit
class TestClassCatalogReadsArePaged:
    def test_the_catalog_keeps_every_class_and_stays_name_sorted(self):
        classes = [{'id': f'{i:05d}', 'name': f'Class {1500 - i:04d}', 'status': 'active'}
                   for i in range(1500)]
        client, _ = _client(classes, cap=1000)
        repo = SisClassRepository(client=client)

        rows = repo.list_for_org('org-1')

        assert len(rows) == 1500
        assert [r['name'] for r in rows] == sorted(r['name'] for r in classes)

    def test_meetings_are_paged(self):
        meetings = [{'id': f'{i:05d}', 'class_id': f'c{i % 100:03d}'} for i in range(1400)]
        client, _ = _client(meetings, cap=1000)
        repo = SisClassRepository(client=client)

        assert len(repo.meetings_for_classes([f'c{i:03d}' for i in range(100)])) == 1400


def _tasks(per_user_quest: Dict[str, int]) -> List[Dict[str, Any]]:
    """One user_quest_tasks row per task, ids sorted so a capped read cuts the
    tail — the same shape as _enrollments above."""
    rows = []
    for uq_id, n in per_user_quest.items():
        for i in range(n):
            rows.append({'id': f'{uq_id}-{i:05d}', 'user_quest_id': uq_id,
                         'user_id': 'u-1', 'quest_id': 'q-1', 'title': 'Task',
                         'xp_value': 50, 'approval_status': 'approved'})
    return rows


@pytest.mark.unit
class TestPortfolioReadsArePaged:
    """Sentry OPTIO-BACKEND-5S: the public portfolio truncated a real account.

    A portfolio is the record of everything a student has ever finished, so the
    row count grows with years of enrolment rather than with anything bounded.
    A capped read drops the oldest work off the diploma and out of the XP totals
    computed from the same list, with nothing to show it happened.
    """

    def test_every_approved_task_survives_the_cap(self):
        from services.portfolio_service import PortfolioService

        rows = [{'id': f'{i:05d}', 'approval_status': 'approved', 'xp_value': 50}
                for i in range(1650)]
        client, _ = _client(rows, cap=1000)

        got = PortfolioService(client=client).get_approved_tasks('u-1')

        assert len(got) == 1650

    def test_task_counts_per_user_quest_are_exact_past_the_cap(self):
        # The count is tallied in Python, so a truncated read reports zero for
        # whichever user_quest landed past the cut.
        from services.portfolio_service import PortfolioService

        per_uq = {f'uq{i:03d}': 12 for i in range(100)}  # 1,200 rows
        per_uq['zzz-last-quest'] = 12
        client, _ = _client(_tasks(per_uq), cap=1000)

        counts = PortfolioService(client=client).get_task_counts_by_user_quest(list(per_uq))

        assert counts == per_uq
        assert counts['zzz-last-quest'] == 12

    def test_no_user_quests_reads_nothing(self):
        from services.portfolio_service import PortfolioService

        client, calls = _client([], cap=1000)
        assert PortfolioService(client=client).get_task_counts_by_user_quest([]) == {}
        assert calls == []
