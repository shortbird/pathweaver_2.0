"""
Unit tests for SIS attendance: pure summary math + route gating/validation.
"""

import json
from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest

from services import sis_attendance_service as att


class TestSummarize:
    def test_empty(self):
        s = att.summarize([])
        assert s['total'] == 0
        assert s['attendance_rate'] is None

    def test_counts_and_rate(self):
        records = [
            {'status': 'present'}, {'status': 'present'}, {'status': 'late'},
            {'status': 'absent'}, {'status': 'excused'},
        ]
        s = att.summarize(records)
        assert s['counts'] == {'present': 2, 'absent': 1, 'late': 1, 'excused': 1}
        assert s['total'] == 5
        # (2 present + 1 late) / (2+1+1 = 4) = 0.75; excused excluded from denom
        assert s['attendance_rate'] == 0.75

    def test_excused_only_has_no_rate(self):
        s = att.summarize([{'status': 'excused'}])
        assert s['attendance_rate'] is None


@pytest.mark.unit
class TestRecordBatching:
    """record() saves the whole roster in ONE bulk upsert and flags only
    students whose status newly became absent."""

    def _fake_admin(self, prior_rows, captured):
        q = Mock()
        for chained in ('select', 'eq'):
            getattr(q, chained).return_value = q
        q.execute.return_value = Mock(data=prior_rows)

        def upsert(payloads, on_conflict=None):
            captured['payloads'] = payloads
            captured['on_conflict'] = on_conflict
            up = Mock()
            up.execute.return_value = Mock(data=payloads)
            return up

        q.upsert.side_effect = upsert
        client = Mock()
        client.table.return_value = q
        return client

    def test_single_bulk_upsert_and_newly_absent_only(self):
        captured = {}
        prior = [{'student_user_id': 's1', 'status': 'present'},
                 {'student_user_id': 's3', 'status': 'absent'}]
        entries = [
            {'student_user_id': 's1', 'status': 'absent'},   # newly absent
            {'student_user_id': 's2', 'status': 'present'},
            {'student_user_id': 's2', 'status': 'present'},  # duplicate — dropped
            {'student_user_id': 's3', 'status': 'absent'},   # already absent — no flag
            {'student_user_id': 's4', 'status': 'bogus'},    # invalid — dropped
        ]
        fake = self._fake_admin(prior, captured)
        with patch.object(att, 'get_supabase_admin_client', return_value=fake), \
             patch('services.sis_planned_absence_service.for_class_date',
                   return_value={}), \
             patch.object(att, '_record_unaccounted', return_value=1), \
             patch.object(att, '_notify_admins_of_absences', return_value=2) as notify:
            result = att.record('org-1', 'c1', '2026-09-01', entries, recorded_by='t1')

        saved_ids = [p['student_user_id'] for p in captured['payloads']]
        assert saved_ids == ['s1', 's2', 's3']
        assert captured['on_conflict'] == 'class_id,student_user_id,date'
        assert all(p['recorded_by'] == 't1' for p in captured['payloads'])
        assert result['count'] == 3
        assert result['absences_flagged'] == 1
        notify.assert_called_once_with('org-1', 'c1', '2026-09-01', ['s1'])

    def test_no_valid_entries_saves_nothing(self):
        captured = {}
        fake = self._fake_admin([], captured)
        with patch.object(att, 'get_supabase_admin_client', return_value=fake), \
             patch.object(att, '_notify_admins_of_absences', return_value=0):
            result = att.record('org-1', 'c1', '2026-09-01',
                                [{'student_user_id': 's1', 'status': 'nope'}], recorded_by='t1')
        assert result['count'] == 0
        assert 'payloads' not in captured


def _admin_client_for_role(role):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'role': role, 'org_role': None, 'org_roles': None}])
    return client


@contextmanager
def staff(role='advisor', org='org-1'):
    with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role(role)), \
         patch('services.sis_service.resolve_org_id', return_value=org), \
         patch('services.sis_service.class_scope', return_value=None):
        yield


@pytest.mark.unit
class TestAttendanceRoutes:
    def test_get_forbidden_for_student(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('student')):
            resp = client.get('/api/sis/classes/c1/attendance?date=2026-09-01', headers=auth_headers)
        assert resp.status_code == 403

    def test_get_requires_date(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.attendance._class_in_org', return_value=True):
            resp = client.get('/api/sis/classes/c1/attendance?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 400

    def test_get_success(self, client, auth_headers, mock_verify_token):
        roster = [{'student_user_id': 's1', 'name': 'Bo', 'status': None}]
        with staff(), patch('routes.sis.attendance._class_in_org', return_value=True), \
             patch('routes.sis.attendance.attendance.get_for_date', return_value=roster):
            resp = client.get('/api/sis/classes/c1/attendance?date=2026-09-01&organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['roster'][0]['name'] == 'Bo'

    def test_record_requires_entries(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.attendance._class_in_org', return_value=True):
            resp = client.post('/api/sis/classes/c1/attendance', headers=auth_headers,
                               json={'date': '2026-09-01', 'organization_id': 'org-1'})
        assert resp.status_code == 400

    def test_record_success_stamps_recorder(self, client, auth_headers, mock_verify_token):
        captured = {}

        def fake_record(org_id, class_id, on_date, entries, recorded_by):
            captured['by'] = recorded_by
            return {'saved': entries, 'count': len(entries)}

        with staff(), patch('routes.sis.attendance._class_in_org', return_value=True), \
             patch('routes.sis.attendance.attendance.record', side_effect=fake_record):
            resp = client.post('/api/sis/classes/c1/attendance', headers=auth_headers,
                               json={'date': '2026-09-01', 'organization_id': 'org-1',
                                     'entries': [{'student_user_id': 's1', 'status': 'present'}]})
        assert resp.status_code == 200
        assert captured['by'] == 'test-user-123'
        assert json.loads(resp.data)['count'] == 1

    def test_class_not_found(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.attendance._class_in_org', return_value=False):
            resp = client.get('/api/sis/classes/cX/attendance?date=2026-09-01&organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 404


class _TableRouter:
    """A Supabase client whose every filter is a no-op: each table just returns
    the rows it was seeded with. Enough to test student_day's assembly, which is
    where the logic lives — the filters themselves are PostgREST's job."""

    def __init__(self, rows_by_table):
        self._rows = rows_by_table

    def table(self, name):
        q = Mock()
        for chained in ('select', 'eq', 'in_', 'limit', 'order'):
            getattr(q, chained).return_value = q
        q.execute.return_value = Mock(data=list(self._rows.get(name, [])))
        return q


@pytest.mark.unit
class TestStudentDay:
    """One student's whole day — the answer to "were they in their other
    classes?" from a not-accounted-for alert (iCreate, 2026-09-01)."""

    ROWS = {
        'users': [
            {'id': 's1', 'first_name': 'Jane', 'last_name': 'Bowman'},
            {'id': 't1', 'first_name': 'Ms.', 'last_name': 'Rivera'},
        ],
        'class_enrollments': [{'class_id': 'c1'}, {'class_id': 'c2'}, {'class_id': 'c3'}],
        'org_classes': [
            {'id': 'c1', 'name': 'Pottery', 'primary_instructor_id': 't1'},
            {'id': 'c2', 'name': 'Robotics'},
            # c3 meets on another weekday — it should not appear in the day.
            {'id': 'c3', 'name': 'Choir'},
        ],
        'class_meetings': [
            # 2026-09-01 is a Tuesday -> day_of_week 2 (0=Sun).
            {'class_id': 'c1', 'day_of_week': 2, 'specific_date': None,
             'start_time': '11:00', 'end_time': '12:00'},
            {'class_id': 'c2', 'day_of_week': 2, 'specific_date': None,
             'start_time': '09:00', 'end_time': '10:00'},
            {'class_id': 'c3', 'day_of_week': 4, 'specific_date': None,
             'start_time': '13:00', 'end_time': '14:00'},
        ],
        'sis_attendance': [
            {'class_id': 'c1', 'status': 'absent'},
            {'class_id': 'c2', 'status': 'present'},
        ],
        'student_planned_absences': [],
    }

    def _day(self, overrides=None, on_date='2026-09-01'):
        rows = dict(self.ROWS)
        rows.update(overrides or {})
        with patch.object(att, 'get_supabase_admin_client',
                          return_value=_TableRouter(rows)):
            return att.student_day('org-1', 's1', on_date)

    def test_only_todays_classes_in_start_time_order(self):
        day = self._day()
        assert [c['class_name'] for c in day['classes']] == ['Robotics', 'Pottery']
        assert day['student_name'] == 'Jane Bowman'
        assert day['date'] == '2026-09-01'

    def test_status_per_class_answers_were_they_elsewhere(self):
        day = self._day()
        by_class = {c['class_id']: c for c in day['classes']}
        assert by_class['c1']['status'] == 'absent'
        assert by_class['c2']['status'] == 'present'
        assert by_class['c1']['teacher_name'] == 'Ms. Rivera'
        assert day['counts'] == {'present': 1, 'absent': 1, 'late': 0, 'excused': 0}

    def test_roll_not_taken_is_none_not_absent(self):
        """A class nobody took roll in must not read as 'present' or 'absent' —
        collapsing the two is how a student looks accounted for when nobody
        actually looked."""
        day = self._day({'sis_attendance': [{'class_id': 'c2', 'status': 'present'}]})
        by_class = {c['class_id']: c for c in day['classes']}
        assert by_class['c1']['status'] is None
        assert day['not_taken'] == 1
        assert day['counts']['absent'] == 0

    def test_recorded_class_not_on_the_schedule_is_still_shown(self):
        """A stale schedule must never hide a status the roll actually holds."""
        day = self._day({'class_meetings': [
            {'class_id': 'c2', 'day_of_week': 2, 'specific_date': None,
             'start_time': '09:00', 'end_time': '10:00'},
        ]})
        by_class = {c['class_id']: c for c in day['classes']}
        assert by_class['c1']['status'] == 'absent'
        assert by_class['c1']['scheduled'] is False
        assert by_class['c2']['scheduled'] is True

    def test_specific_date_meeting_counts_even_off_its_weekday(self):
        day = self._day({'sis_attendance': [], 'class_meetings': [
            {'class_id': 'c3', 'day_of_week': 4, 'specific_date': '2026-09-01',
             'start_time': '13:00', 'end_time': '14:00'},
        ]})
        assert [c['class_name'] for c in day['classes']] == ['Choir']

    def test_whole_day_guardian_report_covers_every_class(self):
        day = self._day({'student_planned_absences': [
            {'class_id': None, 'reason': 'Dentist'},
        ]})
        assert all(c['planned_absence']['scope'] == 'day' for c in day['classes'])
        assert day['classes'][0]['planned_absence']['reason'] == 'Dentist'

    def test_bad_date_is_an_error_not_a_crash(self):
        assert att.student_day('org-1', 's1', 'not-a-date') == {'error': 'date must be YYYY-MM-DD'}


@pytest.mark.unit
class TestStudentDayRoute:
    def test_forbidden_for_a_teacher(self, client, auth_headers, mock_verify_token):
        """ADMIN_ROLES: the day view is the front office's, not a teacher's."""
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('advisor')):
            resp = client.get('/api/sis/students/s1/attendance/day?date=2026-09-01',
                              headers=auth_headers)
        assert resp.status_code == 403

    def test_requires_date(self, client, auth_headers, mock_verify_token):
        with staff(role='org_admin'):
            resp = client.get('/api/sis/students/s1/attendance/day?organization_id=org-1',
                              headers=auth_headers)
        assert resp.status_code == 400

    def test_success_for_a_coordinator(self, client, auth_headers, mock_verify_token):
        payload = {'student_name': 'Jane Bowman', 'classes': [], 'counts': {}, 'not_taken': 0}
        with staff(role='campus_coordinator'), \
             patch('routes.sis.attendance.attendance.student_day', return_value=payload):
            resp = client.get(
                '/api/sis/students/s1/attendance/day?date=2026-09-01&organization_id=org-1',
                headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['student_name'] == 'Jane Bowman'
