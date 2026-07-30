"""
Analytics aggregates must be computed by Postgres, not by tallying rows in Python.

`user_activity_events` holds ~106k rows. Both of these methods used to read it and
count in Python, which PostgREST silently capped at 1000 rows — so category counts
and quest rankings were computed from a fraction of the data (about a third of a
30-day window, far less over longer ones) with no error to show for it.

They now call the aggregate functions added in
supabase/migrations/20260730_analytics_event_aggregates.sql, which return one row
per group. These tests pin that contract: the RPC is what gets called, the row
shape it returns is what gets consumed, and no raw table read sneaks back in.
"""

from contextlib import contextmanager
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from services.analytics_service import AnalyticsService


@contextmanager
def _service(rpc_rows):
    """An AnalyticsService whose rpc() returns `rpc_rows`, and whose table()
    raises — so a regression back to a raw table read fails loudly.

    `AnalyticsService.supabase` is a read-only lazy property that resolves the
    admin client on each access, so the seam to patch is the factory itself.
    """
    supabase = MagicMock()
    supabase.rpc.return_value.execute.return_value = MagicMock(data=rpc_rows)
    supabase.table.side_effect = AssertionError(
        'analytics must aggregate in Postgres via rpc(), not read rows and tally them'
    )
    with patch('database.get_supabase_admin_client', return_value=supabase):
        yield AnalyticsService(), supabase


@pytest.mark.unit
class TestEventCountsByCategory:
    def test_calls_the_aggregate_and_maps_rows_to_counts(self):
        rows = [
            {'event_category': 'quest', 'event_count': 4973},
            {'event_category': 'navigation', 'event_count': 3043},
        ]
        start = datetime(2026, 6, 30)
        end = datetime(2026, 7, 31)
        with _service(rows) as (svc, supabase):
            counts = svc.get_event_counts_by_category(start, end)

        assert counts == {'quest': 4973, 'navigation': 3043}
        name, params = supabase.rpc.call_args[0]
        assert name == 'analytics_event_counts_by_category'
        assert params['p_start'] == start.isoformat()
        assert params['p_end'] == end.isoformat()
        assert params['p_user_id'] is None

    def test_counts_are_not_capped_at_the_postgrest_row_limit(self):
        """The old code could never report more than 1000 events in total."""
        with _service([{'event_category': 'quest', 'event_count': 106_276}]) as (svc, _):
            counts = svc.get_event_counts_by_category(datetime(2026, 1, 1),
                                                      datetime(2026, 12, 31))

        assert counts['quest'] == 106_276

    def test_user_filter_is_passed_through(self):
        with _service([]) as (svc, supabase):
            svc.get_event_counts_by_category(datetime(2026, 1, 1), datetime(2026, 2, 1),
                                             user_id='u-1')
            assert supabase.rpc.call_args[0][1]['p_user_id'] == 'u-1'

    def test_no_events_is_an_empty_mapping(self):
        with _service([]) as (svc, _):
            assert svc.get_event_counts_by_category(datetime(2026, 1, 1),
                                                    datetime(2026, 2, 1)) == {}


@pytest.mark.unit
class TestPopularQuests:
    ROWS = [
        {'quest_id': 'q-low', 'views': 10, 'starts': 0, 'completions': 0},
        {'quest_id': 'q-top', 'views': 60, 'starts': 10, 'completions': 4},
        {'quest_id': 'q-mid', 'views': 50, 'starts': 5, 'completions': 0},
    ]

    @contextmanager
    def _run(self, rows, limit=10):
        with _service(rows) as (svc, supabase):
            # Quest detail lookup goes through table(); allow just that one.
            quests = MagicMock()
            quests.select.return_value.in_.return_value.execute.return_value = MagicMock(data=[])
            supabase.table.side_effect = None
            supabase.table.return_value = quests
            yield svc.get_popular_quests(days=30, limit=limit), supabase

    def test_calls_the_aggregate_with_the_window_start(self):
        with self._run(self.ROWS) as (_, supabase):
            name, params = supabase.rpc.call_args[0]
            assert name == 'analytics_quest_event_counts'
            # ~30 days back, allowing for clock movement during the test.
            since = datetime.fromisoformat(params['p_since'])
            assert timedelta(days=29) < (datetime.utcnow() - since) < timedelta(days=31)

    def test_scoring_and_ordering_are_preserved(self):
        """views + starts*2 + completions*5, highest first — unchanged by the
        move to a database aggregate."""
        with self._run(self.ROWS) as (result, _):
            assert [q['quest_id'] for q in result] == ['q-top', 'q-mid', 'q-low']
            assert result[0]['popularity_score'] == 60 + 10 * 2 + 4 * 5
            assert result[0]['completion_rate'] == pytest.approx(40.0)

    def test_zero_starts_does_not_divide_by_zero(self):
        with self._run([{'quest_id': 'q', 'views': 5, 'starts': 0,
                         'completions': 0}]) as (result, _):
            assert result[0]['completion_rate'] == 0

    def test_limit_is_applied(self):
        with self._run(self.ROWS, limit=2) as (result, _):
            assert len(result) == 2

    def test_null_counts_from_the_aggregate_are_treated_as_zero(self):
        with self._run([{'quest_id': 'q', 'views': None, 'starts': None,
                         'completions': None}]) as (result, _):
            assert result[0]['views'] == 0
            assert result[0]['popularity_score'] == 0
