"""Reporting several children absent has to fit inside one request.

Sentry OPTIO-MOBILE-4, 2026-09-02: a parent of four reported them all out on
the same day. The POST took ~18 seconds -- past the mobile client's 15s axios
timeout -- so she saw a failure, submitted again, and the second submission
wrote four MORE rows. Eight active reports for four children on one date; she
cancelled four of them by hand, and the office had been told twice.

The duplicate half is fixed in the database (migration
20260902200000: uq_planned_absence_active is NULLS NOT DISTINCT, so a
whole-day report -- class_id NULL, the only kind the mobile app sends -- is
finally covered by the guard that was supposed to cover it).

The slow half is here. Both costs scaled with the number of children for no
reason: the admin roster was re-read per child, and a fresh Supabase client was
built per admin per child.
"""

from datetime import date
from unittest.mock import Mock, patch

import pytest

from services import sis_planned_absence_service as svc


def _table(data=None):
    t = Mock()
    for m in ('select', 'eq', 'in_', 'single', 'limit', 'order', 'range',
              'insert', 'update', 'or_', 'gte'):
        getattr(t, m).return_value = t
    t.execute.return_value = Mock(data=data)
    return t


CHILDREN = ['stu-1', 'stu-2', 'stu-3', 'stu-4']
ADMINS = [f'adm-{i}' for i in range(8)]
TODAY = date(2026, 9, 2)


def _client(tables):
    client = Mock()
    client.table.side_effect = lambda name: tables[name]
    return client


def _report_four_children(app):
    """Four children, one date, an eight-person front office."""
    users_table = _table([{'id': 'stu-1', 'first_name': 'Sam', 'last_name': 'H',
                           'preferred_name': None, 'display_name': None,
                           'username': None, 'email': None}])
    org_rows = [{'id': a, 'org_role': 'org_admin', 'org_roles': ['org_admin']}
                for a in ADMINS]
    tables = {
        'student_planned_absences': _table([{'id': 'abs-1', 'absence_date': '2026-09-08'}]),
        'users': users_table,
        'org_classes': _table([]),
    }
    with app.test_request_context():
        with patch.object(svc, '_admin', return_value=_client(tables)), \
             patch.object(svc, '_today', return_value=TODAY), \
             patch('utils.db_fetch.fetch_all_rows', return_value=org_rows) as roster, \
             patch('services.sis_notifications.shared_service') as shared, \
             patch('services.sis_notifications.notify') as notify:
            from services import sis_parent_service
            with patch.object(sis_parent_service, '_can_register', return_value=True):
                result = sis_parent_service.create_absences(
                    'guardian-1', 'org-1', CHILDREN, '2026-09-08')
    return result, roster, notify, shared


@pytest.mark.unit
class TestTheCostScalesWithTheOfficeNotTheFamily:
    def test_the_admin_roster_is_read_once_per_request(self, app):
        """It was read once per child. At iCreate that is four paged reads of
        361 users to arrive at the same eight admins -- and the roster cannot
        change mid-request, so the repeats bought nothing."""
        _, roster, _, _ = _report_four_children(app)
        assert roster.call_count == 1

    def test_one_notification_client_serves_the_whole_fan_out(self, app):
        """NotificationService.__init__ builds a fresh Supabase client every
        time. Four children times eight admins was thirty-two of them inside a
        request the client waits fifteen seconds for."""
        _, _, notify, shared = _report_four_children(app)
        assert shared.call_count == 4  # one per child's notification, not per admin
        assert notify.call_count == len(CHILDREN) * len(ADMINS)
        for call in notify.call_args_list:
            assert call.kwargs['service'] is shared.return_value

    def test_every_child_is_still_reported(self, app):
        """The point of the endpoint, unchanged by any of the above."""
        result, _, _, _ = _report_four_children(app)
        assert len(result['absences']) == len(CHILDREN)
        assert result['errors'] == {}


@pytest.mark.unit
class TestTheMemoIsRequestScoped:
    def test_a_later_request_reads_the_roster_again(self, app):
        """A cache that outlived the request would keep notifying someone the
        office removed this morning."""
        _, first, _, _ = _report_four_children(app)
        _, second, _, _ = _report_four_children(app)
        assert first.call_count == 1
        assert second.call_count == 1

    def test_outside_a_request_nothing_is_cached(self):
        """Scripts and tests run with no request context; the helper must fall
        through to the database rather than raise."""
        assert svc._request_cache() is None
