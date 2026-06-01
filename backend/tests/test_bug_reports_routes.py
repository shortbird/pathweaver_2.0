"""
Unit tests for the beta bug-report API routes (/api/bug-reports).

Covers: authenticated create (happy path + validation), unauthenticated reject,
and superadmin-only gating on the triage (GET/PATCH) endpoints.
"""

import json
from unittest.mock import Mock, patch

import pytest


def _admin_client_for_role(role):
    """Fake admin Supabase client whose users lookup returns the given role."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(
        data=[{'role': role, 'org_role': None, 'org_roles': None}]
    )
    return client


@pytest.mark.unit
class TestCreateBugReport:

    def test_create_requires_auth(self, client):
        """POST without a token is rejected."""
        resp = client.post('/api/bug-reports', json={'message': 'broken'})
        assert resp.status_code == 401

    def test_create_requires_message(self, client, auth_headers, mock_verify_token):
        """A report with no message is a 400."""
        with patch('routes.bug_reports._lookup_user_identity', return_value=(None, None)):
            resp = client.post('/api/bug-reports', headers=auth_headers, json={'steps': 'tap'})
        assert resp.status_code == 400

    def test_create_success(self, client, auth_headers, mock_verify_token):
        """Happy path: a JSON report is persisted and returns the new id."""
        created = {'id': 'report-123'}
        mock_repo = Mock()
        mock_repo.create.return_value = created

        with patch('routes.bug_reports.BugReportRepository', return_value=mock_repo), \
             patch('routes.bug_reports._lookup_user_identity', return_value=('t@e.com', 'student')):
            resp = client.post(
                '/api/bug-reports',
                headers=auth_headers,
                json={
                    'message': '  Complete button froze  ',
                    'current_route': '/(app)/(tabs)/quests',
                    'recent_api_calls': [{'method': 'POST', 'url': '/api/tasks/1/complete', 'status': 500}],
                    'app_version': '1.0.0',
                },
            )

        assert resp.status_code == 201
        data = json.loads(resp.data)
        assert data['success'] is True
        assert data['report_id'] == 'report-123'

        # Persisted record: message trimmed, identity + status stamped server-side.
        record = mock_repo.create.call_args[0][0]
        assert record['message'] == 'Complete button froze'
        assert record['status'] == 'new'
        assert record['user_email'] == 't@e.com'
        assert record['user_role'] == 'student'
        assert record['current_route'] == '/(app)/(tabs)/quests'

    def test_create_ignores_client_status(self, client, auth_headers, mock_verify_token):
        """Client cannot set status/triage fields (allow-list)."""
        mock_repo = Mock()
        mock_repo.create.return_value = {'id': 'r1'}
        with patch('routes.bug_reports.BugReportRepository', return_value=mock_repo), \
             patch('routes.bug_reports._lookup_user_identity', return_value=(None, None)):
            client.post(
                '/api/bug-reports',
                headers=auth_headers,
                json={'message': 'x', 'status': 'resolved', 'triage_notes': 'hacked'},
            )
        record = mock_repo.create.call_args[0][0]
        assert record['status'] == 'new'
        assert 'triage_notes' not in record


@pytest.mark.unit
class TestTriageEndpoints:

    def test_list_forbidden_for_non_superadmin(self, client, auth_headers, mock_verify_token):
        """A student cannot list reports."""
        with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('student')):
            resp = client.get('/api/bug-reports', headers=auth_headers)
        assert resp.status_code == 403

    def test_list_allowed_for_superadmin(self, client, auth_headers, mock_verify_token):
        """A superadmin gets the report list."""
        mock_repo = Mock()
        mock_repo.list_recent.return_value = [{'id': 'r1', 'message': 'bug'}]
        with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('superadmin')), \
             patch('routes.bug_reports.BugReportRepository', return_value=mock_repo):
            resp = client.get('/api/bug-reports', headers=auth_headers)
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert data['count'] == 1
        assert data['reports'][0]['id'] == 'r1'

    def test_patch_forbidden_for_non_superadmin(self, client, auth_headers, mock_verify_token):
        """A student cannot update triage status."""
        with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('student')):
            resp = client.patch('/api/bug-reports/r1', headers=auth_headers, json={'status': 'fixing'})
        assert resp.status_code == 403

    def test_patch_rejects_invalid_status(self, client, auth_headers, mock_verify_token):
        """Superadmin patch with a bad status is a 400."""
        with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('superadmin')):
            resp = client.patch('/api/bug-reports/r1', headers=auth_headers, json={'status': 'bogus'})
        assert resp.status_code == 400

    def test_patch_updates_status(self, client, auth_headers, mock_verify_token):
        """Superadmin can move a report to 'fixing'."""
        mock_repo = Mock()
        mock_repo.update_status.return_value = {'id': 'r1', 'status': 'fixing'}
        with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('superadmin')), \
             patch('routes.bug_reports.BugReportRepository', return_value=mock_repo):
            resp = client.patch('/api/bug-reports/r1', headers=auth_headers, json={'status': 'fixing'})
        assert resp.status_code == 200
        assert mock_repo.update_status.call_args.kwargs['status'] == 'fixing'
