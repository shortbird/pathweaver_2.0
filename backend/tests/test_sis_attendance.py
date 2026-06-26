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
         patch('services.sis_service.resolve_org_id', return_value=org):
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
