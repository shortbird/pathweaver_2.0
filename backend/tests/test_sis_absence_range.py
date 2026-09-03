"""
Planned absences over a date range.

A guardian reporting a two-week trip files one report with a first and last
day. Storage stays one row per day (the roster reads are per-date), so the
properties worth guarding are the seams: the office gets ONE notification
covering the span (not fourteen), a day already reported is skipped rather
than sinking the whole range, a typo'd year is rejected by the span cap before
it becomes thousands of rows, and cancelling the range is again one
notification.
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


def _client(tables):
    client = Mock()
    client.table.side_effect = lambda name: tables[name]
    return client


STUDENT = {'id': 'stu-1', 'preferred_name': None, 'first_name': 'Sam',
           'last_name': 'Hearth', 'display_name': None, 'username': None,
           'email': None}

TODAY = date(2026, 8, 24)


def _create(start, end, insert_results=None, class_id=None):
    """Run svc.create with a mocked DB. insert_results: one entry per day —
    a dict (the inserted row) or an Exception (duplicate rejection)."""
    absences_table = _table([])
    if insert_results is not None:
        absences_table.execute.side_effect = [
            r if isinstance(r, Exception) else Mock(data=[r])
            for r in insert_results
        ]
    tables = {
        'student_planned_absences': absences_table,
        'users': _table([STUDENT]),
        'org_classes': _table([{'id': 'cls-1', 'organization_id': 'org-1', 'name': 'Choir'}]),
    }
    with patch.object(svc, '_admin', return_value=_client(tables)), \
         patch.object(svc, '_today', return_value=TODAY), \
         patch.object(svc, '_org_admin_ids', return_value=['adm-1']), \
         patch('services.sis_notifications.notify') as notify:
        result = svc.create('org-1', 'stu-1', reported_by='g1',
                            absence_date=start, class_id=class_id,
                            reason='trip', end_date=end)
    return result, notify, absences_table


@pytest.mark.unit
class TestCreateSpan:
    def test_one_row_per_day_one_notification_for_the_span(self):
        rows = [{'id': f'abs-{i}', 'absence_date': f'2026-08-2{5 + i}'} for i in range(3)]
        result, notify, table = self._three_days(rows)
        assert [a['id'] for a in result['absences']] == ['abs-0', 'abs-1', 'abs-2']
        assert result['skipped_dates'] == []
        assert table.insert.call_count == 3
        # The dates actually inserted walk the range day by day.
        inserted = [c.args[0]['absence_date'] for c in table.insert.call_args_list]
        assert inserted == ['2026-08-25', '2026-08-26', '2026-08-27']
        # ONE notification, covering the span.
        notify.assert_called_once()
        message = notify.call_args[0][2]
        assert 'from 2026-08-25 to 2026-08-27' in message
        assert notify.call_args.kwargs['metadata']['end_date'] == '2026-08-27'

    def _three_days(self, insert_results):
        return _create('2026-08-25', '2026-08-27', insert_results)

    def test_a_single_day_keeps_the_original_message(self):
        result, notify, _ = _create('2026-08-25', None,
                                    [{'id': 'abs-1', 'absence_date': '2026-08-25'}])
        assert result['absence']['id'] == 'abs-1'
        assert notify.call_args[0][2] == ('A guardian reported Sam Hearth will be '
                                          'out of all classes on 2026-08-25.')
        assert 'end_date' not in notify.call_args.kwargs['metadata']

    def test_a_duplicate_day_is_skipped_not_fatal(self):
        result, notify, _ = self._three_days([
            {'id': 'abs-0', 'absence_date': '2026-08-25'},
            Exception('duplicate key value violates unique constraint'),
            {'id': 'abs-2', 'absence_date': '2026-08-27'},
        ])
        assert [a['id'] for a in result['absences']] == ['abs-0', 'abs-2']
        assert result['skipped_dates'] == ['2026-08-26']
        notify.assert_called_once()

    def test_every_day_a_duplicate_is_the_duplicate_error(self):
        result, notify, _ = self._three_days([Exception('dup')] * 3)
        assert result['error'] == 'This absence has already been reported'
        notify.assert_not_called()

    def test_end_before_start_is_rejected(self):
        result, notify, table = _create('2026-08-27', '2026-08-25')
        assert result['error'] == 'end_date cannot be before absence_date'
        table.insert.assert_not_called()
        notify.assert_not_called()

    def test_the_span_cap_stops_a_typoed_year(self):
        result, _, table = _create('2026-08-25', '2027-08-25')
        assert 'at most' in result['error']
        table.insert.assert_not_called()


@pytest.mark.unit
class TestCancelMany:
    ROWS = [
        {'id': f'abs-{i}', 'organization_id': 'org-1', 'student_user_id': 'stu-1',
         'absence_date': f'2026-08-2{5 + i}', 'class_id': None, 'status': 'cancelled'}
        for i in range(3)
    ]

    def _cancel(self, update_returns, ids=('abs-0', 'abs-1', 'abs-2')):
        tables = {
            'student_planned_absences': _table(update_returns),
            'users': _table([STUDENT]),
            'org_classes': _table([{'name': 'Choir'}]),
        }
        with patch.object(svc, '_admin', return_value=_client(tables)), \
             patch.object(svc, '_org_admin_ids', return_value=['adm-1']), \
             patch('services.sis_notifications.notify') as notify:
            n = svc.cancel_many(list(ids), 'org-1')
        return n, notify, tables

    def test_cancelling_a_range_is_one_notification_covering_the_span(self):
        n, notify, _ = self._cancel(self.ROWS)
        assert n == 3
        notify.assert_called_once()
        assert 'from 2026-08-25 to 2026-08-27' in notify.call_args[0][2]

    def test_a_single_row_keeps_the_single_day_message(self):
        n, notify, _ = self._cancel([self.ROWS[0]], ids=('abs-0',))
        assert n == 1
        assert 'on 2026-08-25' in notify.call_args[0][2]

    def test_only_active_rows_flip(self):
        _, _, tables = self._cancel(self.ROWS)
        filters = [c.args for c in
                   tables['student_planned_absences'].eq.call_args_list]
        assert ('status', 'active') in filters

    def test_nothing_cancelled_means_nothing_announced(self):
        n, notify, _ = self._cancel([])
        assert n == 0
        notify.assert_not_called()

    def test_empty_ids_never_touch_the_db(self):
        with patch.object(svc, '_admin') as admin:
            assert svc.cancel_many([], 'org-1') == 0
        admin.assert_not_called()
