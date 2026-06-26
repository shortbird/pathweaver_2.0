"""
Unit tests for SIS check-in routes — relationship/staff gating, the staff day
board, and the cron-secured sweep endpoint. Services are mocked.
"""

import json
from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest


def _admin_client_for_role(role, org='org-1'):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(
        data=[{'id': 'test-user-123', 'role': role, 'org_role': None, 'org_roles': None, 'organization_id': org}]
    )
    return client


@pytest.mark.unit
class TestGuardianCheckin:
    def test_check_in_unauthorized(self, client, auth_headers, mock_verify_token):
        with patch('routes.sis.checkin._load_user', return_value={'id': 'test-user-123', 'role': 'student'}), \
             patch('routes.sis.checkin.checkin.can_manage_checkin', return_value=False):
            resp = client.post('/api/sis/checkin/s1/check-in', headers=auth_headers, json={})
        assert resp.status_code == 403

    def test_check_in_success(self, client, auth_headers, mock_verify_token):
        with patch('routes.sis.checkin._load_user', return_value={'id': 'test-user-123', 'role': 'parent'}), \
             patch('routes.sis.checkin.checkin.can_manage_checkin', return_value=True), \
             patch('routes.sis.checkin.checkin.student_org', return_value='org-1'), \
             patch('routes.sis.checkin.checkin.check_in', return_value={'status': 'checked_in'}) as ci:
            resp = client.post('/api/sis/checkin/s1/check-in', headers=auth_headers, json={'note': 'dropoff'})
        assert resp.status_code == 200
        assert json.loads(resp.data)['checkin']['status'] == 'checked_in'
        assert ci.call_args.kwargs['by'] == 'test-user-123'

    def test_absence_success(self, client, auth_headers, mock_verify_token):
        with patch('routes.sis.checkin._load_user', return_value={'id': 'test-user-123', 'role': 'parent'}), \
             patch('routes.sis.checkin.checkin.can_manage_checkin', return_value=True), \
             patch('routes.sis.checkin.checkin.student_org', return_value='org-1'), \
             patch('routes.sis.checkin.checkin.report_absence', return_value={'status': 'absent'}):
            resp = client.post('/api/sis/checkin/s1/absence', headers=auth_headers, json={'note': 'sick'})
        assert resp.status_code == 200
        assert json.loads(resp.data)['checkin']['status'] == 'absent'


@pytest.mark.unit
class TestDayBoard:
    def test_forbidden_for_student(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('student')):
            resp = client.get('/api/sis/checkin/day', headers=auth_headers)
        assert resp.status_code == 403

    def test_success(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('org_admin')), \
             patch('services.sis_service.resolve_org_id', return_value='org-1'), \
             patch('routes.sis.checkin.checkin.get_day_board',
                   return_value=[{'student_user_id': 's1', 'name': 'Bo', 'status': 'checked_in'}]):
            resp = client.get('/api/sis/checkin/day?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['board'][0]['status'] == 'checked_in'


@pytest.mark.unit
class TestSweepEndpoint:
    def test_rejects_without_secret(self, client):
        # no auth, no cron secret -> 401
        with patch('routes.sis.checkin.Config') as cfg:
            cfg.CRON_SECRET = 'right-secret'
            resp = client.post('/api/sis/internal/attendance-sweep', json={})
        assert resp.status_code == 401

    def test_runs_with_cron_secret(self, client):
        with patch('routes.sis.checkin.Config') as cfg, \
             patch('routes.sis.checkin.sweep.run_sweep',
                   return_value={'orgs': 1, 'checkin_reminders': 2, 'gap_alerts': 0}):
            cfg.CRON_SECRET = 'right-secret'
            resp = client.post('/api/sis/internal/attendance-sweep',
                               headers={'X-Cron-Secret': 'right-secret', 'Content-Type': 'application/json'},
                               json={})
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert body['checkin_reminders'] == 2
