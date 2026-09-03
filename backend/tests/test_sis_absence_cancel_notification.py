"""
Absence reporting: the cancel is news too, and coordinators are on the list.

Two gaps in the guardian-reported absence flow:

- Cancelling a report notified nobody. An admin who read "Sam is out Friday"
  and never hears otherwise plans around an absence that is no longer
  happening — the cancel now goes to the same admin set the report did.
- `_org_admin_ids` matched only 'org_admin', so a school whose front desk is a
  campus coordinator (iCreate's Kate) never heard about absence reports at
  all. Coordinators run attendance day to day; they are exactly who these
  notifications exist for.
"""

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


def _client(tables):
    client = Mock()
    client.table.side_effect = lambda name: tables[name]
    return client


STUDENT = {'id': 'stu-1', 'preferred_name': None, 'first_name': 'Sam',
           'last_name': 'Hearth', 'display_name': None, 'username': None,
           'email': None}

CANCELLED_ROW = {'id': 'abs-1', 'organization_id': 'org-1',
                 'student_user_id': 'stu-1', 'absence_date': '2026-08-25',
                 'class_id': None, 'status': 'cancelled'}


@pytest.mark.unit
class TestOrgAdminIdsIncludesCoordinators:
    ROWS = [
        {'id': 'adm', 'org_role': 'org_admin', 'org_roles': None},
        {'id': 'cc1', 'org_role': 'campus_coordinator', 'org_roles': None},
        # Coordinator held via the org_roles array, not the single column.
        {'id': 'cc2', 'org_role': 'advisor',
         'org_roles': ['advisor', 'campus_coordinator']},
        {'id': 'tea', 'org_role': 'advisor', 'org_roles': ['advisor']},
        {'id': 'stu', 'org_role': 'student', 'org_roles': None},
    ]

    def test_coordinators_are_notified_alongside_admins(self):
        with patch('utils.db_fetch.fetch_all_rows', return_value=self.ROWS):
            assert svc._org_admin_ids('org-1') == ['adm', 'cc1', 'cc2']

    def test_the_read_is_paged_not_a_raw_execute(self):
        """Every family in the org is a users row; a truncated read is an admin
        who silently stops hearing about absences."""
        with patch('utils.db_fetch.fetch_all_rows', return_value=[]) as fetch:
            svc._org_admin_ids('org-1')
        fetch.assert_called_once()


@pytest.mark.unit
class TestCancelNotifiesTheAdminTeam:
    def _cancel(self, update_returns, admin_ids=('adm-1', 'cc-1')):
        tables = {
            'student_planned_absences': _table(update_returns),
            'users': _table([STUDENT]),
            'org_classes': _table([{'name': 'Choir'}]),
        }
        client = _client(tables)
        with patch.object(svc, '_admin', return_value=client), \
             patch.object(svc, '_org_admin_ids',
                          return_value=list(admin_ids)), \
             patch('services.sis_notifications.notify') as notify:
            ok = svc.cancel('abs-1', 'org-1')
        return ok, notify, tables

    def test_cancelling_tells_the_same_set_the_report_did(self):
        ok, notify, _ = self._cancel([CANCELLED_ROW])
        assert ok is True
        assert notify.call_count == 2  # org_admin AND campus coordinator
        args, kwargs = notify.call_args
        assert args[1] == 'Absence report cancelled'
        assert 'Sam Hearth' in args[2] and 'cancelled' in args[2]
        assert '2026-08-25' in args[2]
        assert kwargs['link'] == '/attendance'
        assert kwargs['organization_id'] == 'org-1'
        assert kwargs['metadata']['cancelled'] is True
        assert kwargs['metadata']['student_id'] == 'stu-1'

    def test_a_whole_day_report_reads_all_classes(self):
        _, notify, _ = self._cancel([CANCELLED_ROW])
        assert 'all classes' in notify.call_args[0][2]

    def test_a_class_report_names_the_class(self):
        _, notify, _ = self._cancel([{**CANCELLED_ROW, 'class_id': 'cls-1'}])
        assert 'Choir' in notify.call_args[0][2]

    def test_cancel_only_flips_active_reports(self):
        """The status filter is what makes a repeated DELETE quiet: only the
        active→cancelled transition matches, so the second call updates nothing
        and nobody is told about the same cancellation twice."""
        _, _, tables = self._cancel([CANCELLED_ROW])
        filters = [c.args for c in
                   tables['student_planned_absences'].eq.call_args_list]
        assert ('status', 'active') in filters

    def test_nothing_updated_means_nothing_announced(self):
        ok, notify, _ = self._cancel([])
        assert ok is False
        notify.assert_not_called()

    def test_no_admins_means_no_notifications_and_no_crash(self):
        ok, notify, _ = self._cancel([CANCELLED_ROW], admin_ids=())
        assert ok is True
        notify.assert_not_called()


@pytest.mark.unit
class TestReportNotificationStillWorks:
    """The refactor into _notify_admin_team must not change the creation
    notification the admin team already relies on."""

    def test_the_report_message_is_unchanged(self):
        tables = {
            'users': _table([STUDENT]),
            'org_classes': _table([{'name': 'Choir'}]),
        }
        client = _client(tables)
        with patch.object(svc, '_admin', return_value=client), \
             patch.object(svc, '_org_admin_ids', return_value=['adm-1']), \
             patch('services.sis_notifications.notify') as notify:
            svc._notify_admins_of_report('org-1', 'stu-1', '2026-08-25', None)
        args, kwargs = notify.call_args
        assert args[0] == 'adm-1'
        assert args[1] == 'Absence reported'
        assert args[2] == ('A guardian reported Sam Hearth will be out of '
                           'all classes on 2026-08-25.')
        assert kwargs['link'] == '/attendance'
        assert 'cancelled' not in kwargs['metadata']
