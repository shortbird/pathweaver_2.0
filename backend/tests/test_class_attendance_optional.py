"""
Classes that take no roll.

Ticket 29dff954 (iCreate, org admin): "Can we have some classes not require
attendance? Like this would be useful for our At Home days and independent
study."

org_classes.attendance_optional is the flag. A class with it on is left out of
everything that chases a missing roll or counts a rate:

  - the coordinator's "Teachers to check" (overdue_rolls)
  - Today's schedule "No roll yet" (today_schedule + annotate_schedule)
  - unaccounted-student alerts (record, open_alerts)
  - the daily attendance report
  - a student's "not taken" count (student_day)
  - the attendance rate (student_history, attendance_report)
  - the roll-call report and its CSV (history)

Every site has a test with an optional class AND a normal class, so a fix that
skipped every class would fail too. A roll already taken stays stored.
"""

import json
from contextlib import contextmanager
from datetime import datetime
from unittest.mock import MagicMock, Mock, patch

import pytest

from repositories.sis_class_repository import SIS_CLASS_FIELDS
from routes.sis import catalog as catalog_routes
from services import sis_attendance_service as att
from services import sis_catalog_service as catalog
from services import sis_class_session_service as sessions
from services import sis_coordinator_service as coordinator
from services import sis_reports_service as reports


class _TableRouter:
    """Every filter is a no-op; each table returns the rows it was seeded
    with. optional_class_ids reads the flag off the rows itself, so the
    no-op filters cannot make a class optional by accident."""

    def __init__(self, rows_by_table):
        self._rows = rows_by_table

    def table(self, name):
        q = Mock()
        for chained in ('select', 'eq', 'in_', 'limit', 'order', 'neq', 'range'):
            getattr(q, chained).return_value = q
        q.execute.return_value = Mock(data=list(self._rows.get(name, [])))
        return q


CLASSES = [
    {'id': 'home', 'name': 'At Home Day', 'attendance_optional': True},
    {'id': 'art', 'name': 'Art', 'attendance_optional': False},
]


# ── The field ────────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestTheField:
    def test_is_a_writable_sis_field(self):
        """Not on the whitelist means the PATCH silently drops it."""
        assert 'attendance_optional' in SIS_CLASS_FIELDS

    def test_is_staff_only(self):
        assert 'attendance_optional' in catalog.STAFF_ONLY_FIELDS
        assert 'attendance_optional' not in catalog._for_audience(
            {'id': 'c', 'attendance_optional': True}, 'family')

    def test_the_staff_class_read_carries_it(self):
        """The class editor reads the catalog as staff; the column, default
        false, must survive that read."""
        out = catalog._for_audience({'id': 'c', 'attendance_optional': False}, 'staff')
        assert out['attendance_optional'] is False

    def test_validation(self):
        assert catalog_routes._validate_class_fields({'attendance_optional': True}) is None
        assert catalog_routes._validate_class_fields({'attendance_optional': False}) is None
        assert catalog_routes._validate_class_fields({'attendance_optional': 'yes'}) \
            == 'attendance_optional must be true or false'


def _role_client(role):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'role': role, 'org_role': None, 'org_roles': None}])
    return client


@contextmanager
def _patch_route(role='org_admin'):
    existing = {'id': 'home', 'organization_id': 'org-1', 'name': 'At Home Day'}
    repo = MagicMock()
    repo.find_by_id.return_value = existing
    repo.update_sis_fields.return_value = {**existing, 'attendance_optional': True}
    with patch('database.get_supabase_admin_client', return_value=_role_client(role)), \
         patch('services.sis_service.resolve_org_id', return_value='org-1'), \
         patch('routes.sis.catalog.get_supabase_admin_client', return_value=MagicMock()), \
         patch('routes.sis.catalog.SisClassRepository', return_value=repo), \
         patch('services.class_group_sync_service.rename_class_groups'):
        yield repo


@pytest.mark.unit
class TestThePatch:
    def test_the_office_saves_it(self, client, auth_headers, mock_verify_token):
        with _patch_route() as repo:
            resp = client.patch('/api/sis/classes/home', headers=auth_headers,
                                json={'attendance_optional': True})
        assert resp.status_code == 200
        assert repo.update_sis_fields.call_args[0][1] == {'attendance_optional': True}
        assert json.loads(resp.data)['class']['attendance_optional'] is True

    def test_a_non_boolean_is_refused(self, client, auth_headers, mock_verify_token):
        with _patch_route() as repo:
            resp = client.patch('/api/sis/classes/home', headers=auth_headers,
                                json={'attendance_optional': 'yes'})
        assert resp.status_code == 400
        repo.update_sis_fields.assert_not_called()

    def test_a_teacher_may_not_set_it(self, client, auth_headers, mock_verify_token):
        with _patch_route(role='advisor') as repo:
            resp = client.patch('/api/sis/classes/home', headers=auth_headers,
                                json={'attendance_optional': True})
        assert resp.status_code == 403
        repo.update_sis_fields.assert_not_called()


# ── Teachers to check / Today's schedule ─────────────────────────────────────

def _row(class_id, optional):
    return {'class_id': class_id, 'class_name': class_id, 'start_time': '09:00',
            'enrolled_count': 5, 'attendance_optional': optional}


@pytest.mark.unit
class TestOverdueRolls:
    def test_an_optional_class_is_never_late(self):
        out = sessions.overdue_rolls([_row('home', True), _row('art', False)],
                                     set(), now_minutes=11 * 60, grace=10)
        assert [m['class_id'] for m in out] == ['art']

    def test_teachers_to_check_skips_it(self):
        with patch('services.sis_attendance_sweep_service.term_has_started', return_value=True), \
             patch.object(sessions, 'taken_class_ids', return_value=set()), \
             patch.object(sessions, 'flagged', return_value=[]):
            out = sessions.teachers_to_check('org-1', datetime(2026, 10, 12, 11, 0),
                                             [_row('home', True), _row('art', False)], {})
        assert [m['class_id'] for m in out['no_roll']] == ['art']


@pytest.mark.unit
class TestTodaysSchedule:
    def _schedule(self):
        rows = {
            'org_classes': [dict(c, location=None, primary_instructor_id=None) for c in CLASSES],
            # 2026-10-12 is a Monday -> 1.
            'class_meetings': [
                {'class_id': 'home', 'day_of_week': 1, 'specific_date': None, 'start_time': '09:00'},
                {'class_id': 'art', 'day_of_week': 1, 'specific_date': None, 'start_time': '10:00'},
            ],
        }
        with patch.object(coordinator, '_admin', return_value=_TableRouter(rows)), \
             patch('services.sis_staff_service._enrolled_counts', return_value={'home': 3, 'art': 3}):
            return coordinator.today_schedule('org-1', '2026-10-12')

    def test_each_row_says_whether_it_takes_roll(self):
        by_id = {m['class_id']: m for m in self._schedule()}
        assert by_id['home']['attendance_optional'] is True
        assert by_id['art']['attendance_optional'] is False

    def test_the_roll_line_knows_too(self):
        schedule = sessions.annotate_schedule(self._schedule(), {})
        by_id = {m['class_id']: m for m in schedule}
        assert by_id['home']['roll'] == {'attendance_optional': True}
        assert by_id['art']['roll'] is None

    def test_a_roll_already_taken_is_kept(self):
        schedule = sessions.annotate_schedule(
            [_row('home', True)], {'home': {'taken_by': 't1', 'taken_by_name': 'Ms. R'}})
        assert schedule[0]['roll']['taken_by'] == 't1'


# ── Alerts ───────────────────────────────────────────────────────────────────

class _RecordFake:
    """record()'s reads and the bulk upsert, plus org_classes for the flag."""

    def __init__(self, classes):
        self.classes = classes

    def table(self, name):
        q = Mock()
        for chained in ('select', 'eq', 'in_', 'limit'):
            getattr(q, chained).return_value = q
        if name == 'org_classes':
            q.execute.return_value = Mock(data=self.classes)
        else:
            q.execute.return_value = Mock(data=[])
        up = Mock()
        up.execute.return_value = Mock(data=[{'student_user_id': 's1'}])
        q.upsert.return_value = up
        return q


@pytest.mark.unit
class TestUnaccountedAlerts:
    def _record(self, class_id):
        with patch.object(att, '_admin', return_value=_RecordFake(CLASSES)), \
             patch('services.sis_planned_absence_service.for_class_date', return_value={}), \
             patch('services.sis_class_session_service.record_roll'), \
             patch.object(att, '_record_unaccounted', return_value=0) as rec, \
             patch.object(att, '_notify_admins_of_absences', return_value=0) as notify:
            att.record('org-1', class_id, '2026-10-12',
                       [{'student_user_id': 's1', 'status': 'absent'}], recorded_by='t1')
        return rec.call_args[0][3], notify.call_args[0][3]

    def test_an_absent_mark_in_an_optional_class_raises_nothing(self):
        assert self._record('home') == ([], [])

    def test_a_normal_class_still_raises_the_alert(self):
        assert self._record('art') == (['s1'], ['s1'])

    def test_open_alerts_leave_out_an_optional_class(self):
        rows = {
            'sis_attendance_alerts': [
                {'id': 'a1', 'student_user_id': 's1', 'class_id': 'home'},
                {'id': 'a2', 'student_user_id': 's2', 'class_id': 'art'},
            ],
            'users': [], 'org_classes': CLASSES,
        }
        with patch.object(att, '_admin', return_value=_TableRouter(rows)):
            out = att.open_alerts('org-1')
        assert [a['id'] for a in out] == ['a2']


# ── Daily report ─────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestDailyReport:
    def test_an_optional_class_has_nobody_missing(self):
        rows = {
            'sis_attendance': [
                {'student_user_id': 's1', 'class_id': 'home', 'status': 'absent'},
                {'student_user_id': 's2', 'class_id': 'art', 'status': 'absent'},
            ],
            'student_planned_absences': [
                {'student_user_id': 's3', 'class_id': 'home', 'reason': 'x'},
            ],
            'org_classes': CLASSES,
            'users': [{'id': 's1', 'first_name': 'Ada'}, {'id': 's2', 'first_name': 'Ben'},
                      {'id': 's3', 'first_name': 'Cy'}],
        }
        with patch.object(att, '_admin', return_value=_TableRouter(rows)):
            out = att.daily_report('org-1', '2026-10-12')
        assert [(r['student'], r['class']) for r in out] == [('Ben', 'Art')]


# ── A student's day ──────────────────────────────────────────────────────────

@pytest.mark.unit
class TestStudentDay:
    def test_no_roll_in_an_optional_class_is_not_a_gap(self):
        rows = {
            'users': [{'id': 's1', 'first_name': 'Ada'}],
            'class_enrollments': [{'class_id': 'home'}, {'class_id': 'art'}],
            'org_classes': CLASSES,
            'class_meetings': [
                {'class_id': 'home', 'day_of_week': 1, 'specific_date': None, 'start_time': '09:00'},
                {'class_id': 'art', 'day_of_week': 1, 'specific_date': None, 'start_time': '10:00'},
            ],
            'sis_attendance': [],
            'student_planned_absences': [],
        }
        with patch.object(att, '_admin', return_value=_TableRouter(rows)):
            day = att.student_day('org-1', 's1', '2026-10-12')
        by_id = {c['class_id']: c for c in day['classes']}
        assert by_id['home']['attendance_optional'] is True
        assert by_id['art']['attendance_optional'] is False
        # Art still counts as not taken; the at-home day does not.
        assert day['not_taken'] == 1


# ── The rate ─────────────────────────────────────────────────────────────────

RECORDS = [
    {'class_id': 'home', 'status': 'absent'},
    {'class_id': 'home', 'status': 'absent'},
    {'class_id': 'art', 'status': 'present'},
    {'class_id': 'art', 'status': 'absent'},
]


@pytest.mark.unit
class TestTheRate:
    def test_student_history_rate_leaves_out_an_optional_class(self):
        with patch('utils.db_fetch.fetch_all_rows', return_value=list(RECORDS)), \
             patch.object(att, '_admin', return_value=_TableRouter({'org_classes': CLASSES})):
            out = att.student_history('org-1', 's1')
        # The stored rolls stay listed.
        assert len(out['records']) == 4
        # Art alone: 1 present of 2.
        assert out['summary']['attendance_rate'] == 0.5
        assert out['summary']['counts']['absent'] == 1

    def test_the_attendance_report_too(self):
        with patch.object(reports, 'fetch_all_rows', return_value=list(RECORDS)), \
             patch.object(att, '_admin', return_value=_TableRouter({'org_classes': CLASSES})):
            out = reports.attendance_report('org-1')
        assert out['overall']['attendance_rate'] == 0.5
        assert [c['class_id'] for c in out['per_class']] == ['art']


# ── The roll-call report ─────────────────────────────────────────────────────

@pytest.mark.unit
class TestRollCallReport:
    def test_an_optional_class_has_nothing_to_review(self):
        repo = Mock()
        repo.in_range.return_value = [
            {'id': 's-home', 'class_id': 'home', 'date': '2026-10-12', 'sub_status': 'none'},
            {'id': 's-art', 'class_id': 'art', 'date': '2026-10-12', 'sub_status': 'none'},
        ]
        flags = {c['id']: c['attendance_optional'] for c in CLASSES}
        repo.classes_by_ids.side_effect = lambda ids: {
            i: {'id': i, 'name': i, 'attendance_optional': flags[i]} for i in ids}
        with patch.object(sessions, '_repo', return_value=repo), \
             patch.object(sessions, '_names', return_value={}), \
             patch('utils.class_membership.class_teacher_ids', return_value=set()):
            report = sessions.history('org-1', '2026-10-12', '2026-10-12')
        assert [r['class_id'] for r in report['rows']] == ['art']
        assert len(sessions.history_csv_rows(report)) == 1
