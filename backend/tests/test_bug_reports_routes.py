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


@pytest.fixture(autouse=True)
def _silence_admin_notification():
    """Submitting a report emails the admin inbox. That is a REAL send: with a
    BREVO_API_KEY in the environment these tests delivered a live "Complete
    button froze" report from t@e.com to tanner@optioeducation.com on every run
    (found 2026-08-06). The repository was mocked, so nothing reached the
    database and only the mail escaped — which is exactly why it went unnoticed.
    """
    with patch('routes.bug_reports._notify_admin_email') as notify:
        yield notify


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


@pytest.mark.unit
class TestTriageReadsThroughTheAdminClient:
    """`bug_reports` has RLS on and ZERO policies, which is deny-all.

    A user-scoped client therefore reads no rows from it no matter who holds
    the token, so the triage endpoints returned 200 with an empty list while
    356 reports sat in the table -- no error, no log line, nothing to notice.
    Superadmin is not an exception to a policy that does not exist.

    The tests above cannot see this, and that is why it survived: they patch
    BugReportRepository wholesale, so how it is constructed is invisible to
    them. These two look at the construction itself.
    """

    def test_list_constructs_the_repository_with_the_admin_client(
        self, client, auth_headers, mock_verify_token
    ):
        admin = _admin_client_for_role('superadmin')
        mock_repo = Mock()
        mock_repo.list_recent.return_value = []
        with patch('database.get_supabase_admin_client', return_value=admin), \
             patch('routes.bug_reports.get_supabase_admin_client', return_value=admin), \
             patch('routes.bug_reports.BugReportRepository', return_value=mock_repo) as repo_cls:
            resp = client.get('/api/bug-reports', headers=auth_headers)

        assert resp.status_code == 200
        kwargs = repo_cls.call_args.kwargs
        assert kwargs.get('client') is admin, (
            'triage must read through the admin client; a user client sees '
            'nothing because bug_reports is deny-all RLS')
        assert 'user_id' not in kwargs, (
            'passing user_id makes BaseRepository build a user-scoped client, '
            'which is the bug this test exists for')

    def test_no_call_site_hands_the_repository_a_user_id(self):
        """The regression is one keyword argument wide, so ban it by name.

        BugReportRepository(user_id=...) makes BaseRepository derive a
        user-scoped client from the request's Supabase token. Against a
        deny-all table that fails silently -- an empty list, a 200, and no
        way to tell it apart from "no reports yet".
        """
        import ast
        from pathlib import Path

        backend = Path(__file__).resolve().parents[1]
        offenders = []
        for path in sorted(backend.glob('**/*.py')):
            if '__pycache__' in path.parts or path.name == Path(__file__).name:
                continue
            try:
                tree = ast.parse(path.read_text(encoding='utf-8'))
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if (isinstance(node, ast.Call)
                        and isinstance(node.func, ast.Name)
                        and node.func.id == 'BugReportRepository'
                        and any(kw.arg == 'user_id' for kw in node.keywords)):
                    offenders.append(f'{path.relative_to(backend)}:{node.lineno}')

        assert not offenders, (
            'BugReportRepository built with a user client at: '
            + ', '.join(offenders)
            + '. bug_reports is deny-all RLS, so that reads zero rows and '
              'reports success. Pass client=get_supabase_admin_client() and '
              'keep the superadmin gate at the route.')
