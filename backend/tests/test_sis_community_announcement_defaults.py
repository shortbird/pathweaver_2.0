"""Board announcements: how long they stay up, and who hears about them.

An announcement is a thing people come back and re-read — the calendar, the
dress code, where to park at pickup. sis_announcements has had an expires_at
column and a filter that honours it since the Community Hub shipped, and nothing
was ever putting a value in it. So the board accumulated forever: last
September's first-day instructions sat above this week's news, and the only way
to clean it up was for somebody to remember to.

The default is the end of the school year, which is the length of time a notice
is actually about.

The notify half asks once, not twice. The post's own audience already says who
it is for; a second audience vocabulary on the same form is how three composers
with three different audience models came to exist.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_community_service as svc

ORG = 'org-1'
AUTHOR = 'kate'


def _client(*, settings=None, timezone='America/Denver', created_id='board-1'):
    """A double answering the organizations read and the board insert.

    One mock PER TABLE NAME, cached: a fresh mock each call would lose the
    insert arguments the assertions read back.
    """
    tables = {}

    def _table(name):
        if name in tables:
            return tables[name]
        t = Mock()
        for chained in ('select', 'eq', 'limit', 'insert', 'update', 'order'):
            getattr(t, chained).return_value = t
        if name == 'organizations':
            t.execute.return_value = Mock(data=[{
                'feature_flags': {'sis_settings': settings or {}},
                'timezone': timezone,
            }])
        else:
            t.execute.return_value = Mock(data=[{'id': created_id}])
        tables[name] = t
        return t

    client = Mock()
    client.table.side_effect = _table
    return client


def _create(data, **client_kwargs):
    client = _client(**client_kwargs)
    with patch.object(svc, '_admin', return_value=client), \
            patch('services.sis_staff_service._admin', return_value=client), \
            patch('services.announcement_service.publish') as publish:
        result = svc.create_announcement(ORG, AUTHOR, data)
    inserted = client.table('sis_announcements').insert.call_args_list[0][0][0]
    return result, inserted, publish


@pytest.mark.unit
class TestHowLongItStaysUp:
    def test_it_expires_at_the_end_of_the_school_year(self):
        _, inserted, _ = _create({'title': 'Dress code'},
                                 settings={'last_day_of_school': '2027-06-04'})
        assert inserted['expires_at'].startswith('2027-06-04T23:59:59')

    def test_it_expires_at_the_end_of_the_day_not_the_start(self):
        """Midnight on the last day would take the notice down the night before
        the last day of school, which is one of the days it matters most."""
        _, inserted, _ = _create({'title': 'x'},
                                 settings={'last_day_of_school': '2027-06-04'})
        assert 'T23:59:59' in inserted['expires_at']

    def test_it_uses_the_school_s_own_timezone(self):
        _, inserted, _ = _create({'title': 'x'}, timezone='America/New_York',
                                 settings={'last_day_of_school': '2027-06-04'})
        assert inserted['expires_at'].endswith('-04:00') or inserted['expires_at'].endswith('-05:00')

    def test_an_explicit_expiry_wins(self):
        _, inserted, _ = _create({'title': 'x', 'expires_at': '2026-10-01'},
                                 settings={'last_day_of_school': '2027-06-04'})
        assert inserted['expires_at'] == '2026-10-01'

    def test_a_school_that_has_not_said_gets_no_expiry(self):
        """The old behaviour, and the right one: we do not know when their year
        ends, so we do not decide when their notice comes down."""
        _, inserted, _ = _create({'title': 'x'}, settings={})
        assert inserted['expires_at'] is None

    def test_an_unreadable_date_does_not_stop_the_post(self):
        _, inserted, _ = _create({'title': 'x'},
                                 settings={'last_day_of_school': 'sometime in June'})
        assert inserted['expires_at'] is None
        assert inserted['title'] == 'x'


@pytest.mark.unit
class TestNotifying:
    def test_a_board_only_post_notifies_nobody(self):
        _, _, publish = _create({'title': 'x'})
        publish.assert_not_called()

    def test_a_school_post_notifies_the_whole_school(self):
        _, _, publish = _create({'title': 'x', 'audience': 'school', 'notify': True})
        assert set(publish.call_args.args[4]) == {'parents', 'students', 'advisors'}

    def test_a_teachers_post_notifies_only_teachers(self):
        _, _, publish = _create({'title': 'x', 'audience': 'teachers', 'notify': True})
        assert publish.call_args.args[4] == ['advisors']

    def test_an_admin_only_post_notifies_nobody(self):
        """There is no admin role audience to send to. The composer says so
        rather than posting to the board and silently sending nothing."""
        _, _, publish = _create({'title': 'x', 'audience': 'admins', 'notify': True})
        publish.assert_not_called()

    def test_the_channels_are_passed_through(self):
        _, _, publish = _create({'title': 'x', 'audience': 'school', 'notify': True,
                                 'notify_app': True, 'notify_email': False})
        assert publish.call_args.kwargs['send_app'] is True
        assert publish.call_args.kwargs['send_email'] is False

    def test_email_only_is_possible(self):
        _, _, publish = _create({'title': 'x', 'audience': 'school', 'notify': True,
                                 'notify_app': False, 'notify_email': True})
        assert publish.call_args.kwargs['send_app'] is False
        assert publish.call_args.kwargs['send_email'] is True

    def test_the_send_is_tied_to_the_post(self):
        """Without source_announcement_id an edit or a delete on the board
        reaches one half of what a family sees as one notice."""
        _, _, publish = _create({'title': 'x', 'audience': 'school', 'notify': True})
        assert publish.call_args.kwargs['source_announcement_id'] == 'board-1'

    def test_the_old_explicit_audience_list_still_works(self):
        """Mobile and any other caller still send notify_audiences. Kept for one
        release so nothing breaks while they catch up."""
        _, _, publish = _create({'title': 'x', 'notify_audiences': ['parents']})
        assert publish.call_args.args[4] == ['parents']

    def test_a_delivery_failure_does_not_lose_the_post(self):
        client = _client(settings={})
        with patch.object(svc, '_admin', return_value=client), \
                patch('services.announcement_service.publish',
                      side_effect=RuntimeError('smtp down')):
            result = svc.create_announcement(
                ORG, AUTHOR, {'title': 'x', 'audience': 'school', 'notify': True})
        assert result['announcement'] == {'id': 'board-1'}
        assert 'notify_error' in result
