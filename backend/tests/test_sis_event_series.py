"""
Repeating calendar events: one row per occurrence, linked by a series id.

Apogee NoCo's SPARK Friday Excursions run on two chosen Fridays a month. Each
excursion has its own location and its own sign-up list, so each occurrence is
its own event row; the series id is only what links them for "delete this and
the following".
"""

from datetime import date
from unittest.mock import Mock, patch

import pytest

from routes.sis.events import _clean
from services import sis_events_service as events


D = date.fromisoformat


@pytest.mark.unit
class TestOccurrenceDates:
    def test_weekly_until_a_date(self):
        out = events.occurrence_dates(D('2026-10-02'), {'every': 'weekly', 'until': '2026-10-23'})
        assert out == [D('2026-10-02'), D('2026-10-09'), D('2026-10-16'), D('2026-10-23')]

    def test_every_two_weeks_for_a_count(self):
        out = events.occurrence_dates(D('2026-10-02'), {'every': '2weeks', 'count': 3})
        assert out == [D('2026-10-02'), D('2026-10-16'), D('2026-10-30')]

    def test_monthly_keeps_the_weekday_of_the_month(self):
        # 2026-10-16 is the 3rd Friday of October.
        out = events.occurrence_dates(D('2026-10-16'), {'every': 'monthly', 'count': 3})
        assert out == [D('2026-10-16'), D('2026-11-20'), D('2026-12-18')]
        assert all(d.weekday() == 4 for d in out)

    def test_a_fifth_weekday_becomes_the_last_one(self):
        # 2026-10-30 is the 5th Friday; November 2026 has only four.
        out = events.occurrence_dates(D('2026-10-30'), {'every': 'monthly', 'count': 2})
        assert out == [D('2026-10-30'), D('2026-11-27')]

    def test_chosen_dates_are_sorted_and_include_the_first(self):
        out = events.occurrence_dates(D('2026-10-02'), {
            'every': 'dates', 'dates': ['2026-11-06', '2026-10-16', '2026-10-16']})
        assert out == [D('2026-10-02'), D('2026-10-16'), D('2026-11-06')]

    def test_a_repeat_must_end(self):
        with pytest.raises(events.RepeatError):
            events.occurrence_dates(D('2026-10-02'), {'every': 'weekly'})

    def test_the_cap_is_enforced(self):
        with pytest.raises(events.RepeatError):
            events.occurrence_dates(D('2026-10-02'), {'every': 'weekly', 'count': 61})
        with pytest.raises(events.RepeatError):
            events.occurrence_dates(D('2026-01-02'), {'every': 'weekly', 'until': '2028-01-01'})
        assert len(events.occurrence_dates(D('2026-10-02'), {'every': 'weekly', 'count': 60})) == 60

    def test_an_end_before_the_start_is_refused(self):
        with pytest.raises(events.RepeatError):
            events.occurrence_dates(D('2026-10-02'), {'every': 'weekly', 'until': '2026-09-01'})

    def test_an_unknown_repeat_is_refused(self):
        with pytest.raises(events.RepeatError):
            events.occurrence_dates(D('2026-10-02'), {'every': 'daily', 'count': 2})


@pytest.mark.unit
class TestCreateSeries:
    def _create(self, fields, repeat):
        inserted = []
        admin = Mock()
        chain = Mock()

        def _insert(rows):
            inserted.append(rows)
            return Mock(execute=Mock(return_value=Mock(data=rows)))
        chain.insert.side_effect = _insert
        admin.table.return_value = chain
        with patch.object(events, '_admin', return_value=admin):
            out = events.create_series('org-1', 'admin-1', fields, repeat)
        return out, inserted

    def test_each_occurrence_is_its_own_row_with_one_series_id(self):
        out, inserted = self._create({
            'title': 'SPARK', 'start_at': '2026-10-02T09:00:00Z',
            'end_at': '2026-10-02T14:30:00Z', 'rsvp_enabled': True,
            'rsvp_closes_at': '2026-09-30T23:59:00Z', 'rsvp_capacity': 12,
        }, {'every': 'dates', 'dates': ['2026-10-16']})
        assert len(inserted) == 1 and len(out) == 2  # one insert call
        first, second = out
        assert first['series_id'] and first['series_id'] == second['series_id']
        # The wall clock the office typed is kept; only the day moves.
        assert second['start_at'] == '2026-10-16T09:00:00Z'
        assert second['end_at'] == '2026-10-16T14:30:00Z'
        # Replies close the same number of days ahead of each occurrence.
        assert second['rsvp_closes_at'] == '2026-10-14T23:59:00Z'
        assert second['rsvp_capacity'] == 12
        # Every occurrence is pinned to the org and the author, not only the
        # first: a series row without them is an event nobody owns.
        assert all(r['organization_id'] == 'org-1' and r['created_by'] == 'admin-1'
                   for r in inserted[0])

    def test_the_caller_cannot_override_the_org_or_author_on_a_series(self):
        out, inserted = self._create({
            'title': 'SPARK', 'start_at': '2026-10-02T09:00:00Z',
            'organization_id': 'other-org', 'created_by': 'someone',
        }, {'every': 'weekly', 'count': 3})
        assert len(inserted[0]) == 3
        assert {r['organization_id'] for r in inserted[0]} == {'org-1'}
        assert {r['created_by'] for r in inserted[0]} == {'admin-1'}

    def test_a_repeat_that_yields_one_date_is_a_plain_event(self):
        with patch.object(events, 'create_event', return_value={'id': 'e1'}) as one:
            out, inserted = self._create({'title': 'x', 'start_at': '2026-10-02T09:00:00Z'},
                                         {'every': 'weekly', 'count': 1})
        assert out == [{'id': 'e1'}] and inserted == []
        assert 'series_id' not in one.call_args.args[2]


@pytest.mark.unit
class TestCleanRsvpOptions:
    def test_mode_and_spots(self):
        f = _clean({'rsvp_mode': 'children', 'rsvp_capacity': '12'})
        assert f == {'rsvp_mode': 'children', 'rsvp_capacity': 12}

    def test_an_unknown_mode_is_count(self):
        assert _clean({'rsvp_mode': 'bogus'})['rsvp_mode'] == 'count'

    def test_blank_or_zero_spots_is_no_limit(self):
        assert _clean({'rsvp_capacity': ''})['rsvp_capacity'] is None
        assert _clean({'rsvp_capacity': 0})['rsvp_capacity'] is None
        assert _clean({'rsvp_capacity': -3})['rsvp_capacity'] is None

    def test_a_client_cannot_set_the_series_id(self):
        assert 'series_id' not in _clean({'series_id': 'x', 'title': 't'})


@pytest.mark.unit
def test_delete_following_deletes_this_and_later_in_the_series():
    admin = Mock()
    chain = Mock()
    for m in ('delete', 'eq', 'gte'):
        getattr(chain, m).return_value = chain
    chain.execute.return_value = Mock(data=[{'id': 'a'}, {'id': 'b'}])
    admin.table.return_value = chain
    ev = {'id': 'a', 'series_id': 's1', 'start_at': '2026-10-16T09:00:00Z'}
    with patch.object(events, '_admin', return_value=admin), \
         patch.object(events, 'get_event', return_value=ev):
        assert events.delete_following('org-1', 'a') == 2
    chain.eq.assert_any_call('series_id', 's1')
    chain.eq.assert_any_call('organization_id', 'org-1')
    chain.gte.assert_called_with('start_at', '2026-10-16T09:00:00Z')
