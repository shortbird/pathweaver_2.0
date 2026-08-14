"""
The requests queue's default view, and the numbers on its filter chips.

The queue used to load every status at once, so resolved history was interleaved
with live work and the list could only grow. It defaults to open work now, which
needs two things the service did not have: a filter meaning "not resolved", and
per-status counts done by Postgres rather than by counting fetched rows —
list_all caps at 300 and PostgREST would silently cap an uncapped read at 1000,
so a tally taken in Python is quietly wrong exactly when an org gets busy.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_forms_service as forms


ORG = 'org-1'


class _QuerySpy:
    """Records the filters a query builder was asked for."""

    def __init__(self, rows=None, count=None):
        self.eq_calls = []
        self.neq_calls = []
        self.selected = None
        self._rows = rows or []
        self._count = count

    def select(self, cols, **kw):
        self.selected = (cols, kw)
        return self

    def eq(self, col, val):
        self.eq_calls.append((col, val))
        return self

    def neq(self, col, val):
        self.neq_calls.append((col, val))
        return self

    def order(self, *a, **kw):
        return self

    def limit(self, *a, **kw):
        return self

    def execute(self):
        return Mock(data=self._rows, count=self._count)


def _run_list(status, rows=None):
    spy = _QuerySpy(rows=rows or [])
    admin = Mock()
    admin.table.return_value = spy
    with patch.object(forms, '_admin', return_value=admin), \
         patch.object(forms, '_decorate', side_effect=lambda r: r):
        forms.list_all(ORG, status)
    return spy


@pytest.mark.unit
class TestTheDefaultView:

    def test_open_means_everything_not_resolved(self):
        spy = _run_list('open')
        assert ('status', 'resolved') in spy.neq_calls
        assert not [c for c in spy.eq_calls if c[0] == 'status']

    def test_a_named_status_still_filters_to_exactly_it(self):
        spy = _run_list('resolved')
        assert ('status', 'resolved') in spy.eq_calls
        assert spy.neq_calls == []

    def test_no_status_still_returns_everything(self):
        spy = _run_list(None)
        assert spy.neq_calls == []
        assert not [c for c in spy.eq_calls if c[0] == 'status']

    def test_a_junk_status_is_ignored_rather_than_filtering_to_nothing(self):
        spy = _run_list('not-a-status')
        assert spy.neq_calls == []
        assert not [c for c in spy.eq_calls if c[0] == 'status']

    def test_the_org_is_always_scoped(self):
        for status in ('open', 'resolved', None):
            assert ('organization_id', ORG) in _run_list(status).eq_calls


@pytest.mark.unit
class TestTheChipCounts:

    def _counts(self, per_status):
        spies = {}

        def _table(_name):
            # One spy per call; the status it filters on decides its count.
            spy = _QuerySpy()
            original_eq = spy.eq

            def eq(col, val):
                if col == 'status':
                    spy._count = per_status.get(val, 0)
                return original_eq(col, val)

            spy.eq = eq
            spies[len(spies)] = spy
            return spy

        admin = Mock()
        admin.table.side_effect = _table
        with patch.object(forms, '_admin', return_value=admin):
            return forms.status_counts(ORG), spies

    def test_every_status_is_counted(self):
        counts, _ = self._counts({'submitted': 3, 'resolved': 40})
        assert counts['submitted'] == 3
        assert counts['resolved'] == 40
        assert set(forms.STATUSES).issubset(counts)

    def test_open_is_everything_except_resolved(self):
        counts, _ = self._counts({'submitted': 3, 'under_review': 1,
                                  'in_progress': 2, 'waiting': 4, 'resolved': 40})
        assert counts['open'] == 10

    def test_postgres_does_the_counting(self):
        """Not len(rows): a fetched tally is silently capped and would report a
        queue shrinking as the school got busier."""
        _, spies = self._counts({'submitted': 1})
        assert all(spy.selected == ('id', {'count': 'exact'}) for spy in spies.values())

    def test_a_failed_count_is_zero_rather_than_a_broken_page(self):
        admin = Mock()
        admin.table.side_effect = RuntimeError('db down')
        with patch.object(forms, '_admin', return_value=admin):
            counts = forms.status_counts(ORG)
        assert counts['open'] == 0
        assert counts['resolved'] == 0
