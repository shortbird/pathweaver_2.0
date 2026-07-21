"""
Route tests for POST /api/sis/households/<id>/members — the staff-side way to
connect a student who "already had an Optio account".

The endpoint now (a) accepts an account email as an alternative to user_id so
platform accounts (not in the org picker) are reachable, and (b) ATTACHES the
student to the org BEFORE adding the household row, refusing entirely when the
account isn't attachable — a refused attach must never leave a half-connected
member (in the household but invisible to the roster).
"""

from unittest.mock import Mock, patch

import pytest


def _admin_for(role='org_admin', users_rows=None):
    """Admin client stub: require_role's user lookup + the email lookup both go
    through table('users'); the role row is returned first, then email rows."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'in_'):
        getattr(table, chained).return_value = table
    responses = [Mock(data=[{'role': role, 'org_role': None, 'org_roles': None}])]
    if users_rows is not None:
        responses.append(Mock(data=users_rows))
    table.execute.side_effect = responses + [Mock(data=[])] * 5
    return client


def _repo():
    repo = Mock()
    repo.find_by_id.return_value = {'id': 'h1', 'organization_id': 'org-1'}
    repo.members_for_households.return_value = [
        {'user_id': 'g1', 'relationship': 'guardian'},
    ]
    repo.add_member.return_value = {'household_id': 'h1', 'user_id': 'k1',
                                    'relationship': 'student'}
    return repo


def _post(client, auth_headers, body, role='org_admin', users_rows=None, attach_ok=True,
          duplicates=None):
    repo = _repo()
    admin = _admin_for(role, users_rows)
    # routes.sis binds get_supabase_admin_client at import time — patch BOTH the
    # module binding (route body) and the source (require_role's local import).
    with patch('database.get_supabase_admin_client', return_value=admin), \
         patch('routes.sis.get_supabase_admin_client', return_value=admin), \
         patch('routes.sis.HouseholdRepository', return_value=repo), \
         patch('services.sis_service.resolve_org_id', return_value='org-1'), \
         patch('services.sis_service.find_household_duplicates',
               return_value=duplicates or []), \
         patch('services.sis_service.attach_student_to_org',
               return_value=attach_ok) as attach:
        resp = client.post('/api/sis/households/h1/members',
                           json={'organization_id': 'org-1', **body},
                           headers=auth_headers)
    return resp, repo, attach


@pytest.mark.unit
class TestAddHouseholdMemberAttach:
    def test_student_by_user_id_attaches_then_adds(self, client, auth_headers, mock_verify_token):
        resp, repo, attach = _post(client, auth_headers,
                                   {'user_id': 'k1', 'relationship': 'student'})
        assert resp.status_code == 201
        attach.assert_called_once_with('org-1', 'k1', guardian_ids=['g1'])
        repo.add_member.assert_called_once()

    def test_student_by_email_resolves_account(self, client, auth_headers, mock_verify_token):
        resp, repo, attach = _post(client, auth_headers,
                                   {'email': 'kid@x.com', 'relationship': 'student'},
                                   users_rows=[{'id': 'k1'}])
        assert resp.status_code == 201
        attach.assert_called_once_with('org-1', 'k1', guardian_ids=['g1'])
        repo.add_member.assert_called_once()

    def test_unknown_email_404s(self, client, auth_headers, mock_verify_token):
        resp, repo, _ = _post(client, auth_headers,
                              {'email': 'nobody@x.com', 'relationship': 'student'},
                              users_rows=[])
        assert resp.status_code == 404
        repo.add_member.assert_not_called()

    def test_refused_attach_never_adds_the_member(self, client, auth_headers, mock_verify_token):
        resp, repo, _ = _post(client, auth_headers,
                              {'user_id': 'k1', 'relationship': 'student'},
                              attach_ok=False)
        assert resp.status_code == 409
        repo.add_member.assert_not_called()

    def test_guardian_by_email_rejected(self, client, auth_headers, mock_verify_token):
        resp, repo, attach = _post(client, auth_headers,
                                   {'email': 'mom@x.com', 'relationship': 'guardian'})
        assert resp.status_code == 400
        attach.assert_not_called()
        repo.add_member.assert_not_called()

    def test_guardian_by_user_id_skips_attach(self, client, auth_headers, mock_verify_token):
        resp, repo, attach = _post(client, auth_headers,
                                   {'user_id': 'g2', 'relationship': 'guardian'})
        assert resp.status_code == 201
        attach.assert_not_called()
        repo.add_member.assert_called_once()

    def test_duplicate_student_warns_before_adding(self, client, auth_headers, mock_verify_token):
        resp, repo, attach = _post(
            client, auth_headers, {'user_id': 'k1', 'relationship': 'student'},
            duplicates=[{'user_id': 'k2', 'name': 'Zachary Barlow', 'email': None}])
        assert resp.status_code == 409
        body = resp.get_json()
        assert body['needs_confirmation'] is True
        assert body['duplicates'][0]['name'] == 'Zachary Barlow'
        attach.assert_not_called()
        repo.add_member.assert_not_called()

    def test_confirm_duplicate_bypasses_the_guard(self, client, auth_headers, mock_verify_token):
        resp, repo, attach = _post(
            client, auth_headers,
            {'user_id': 'k1', 'relationship': 'student', 'confirm_duplicate': True},
            duplicates=[{'user_id': 'k2', 'name': 'Zachary Barlow', 'email': None}])
        assert resp.status_code == 201
        attach.assert_called_once_with('org-1', 'k1', guardian_ids=['g1'])
        repo.add_member.assert_called_once()

    def test_guardian_add_skips_duplicate_guard(self, client, auth_headers, mock_verify_token):
        # The guard is student-only; a guardian is never a "duplicate student".
        resp, repo, attach = _post(
            client, auth_headers, {'user_id': 'g2', 'relationship': 'guardian'},
            duplicates=[{'user_id': 'k2', 'name': 'Should Not Matter', 'email': None}])
        assert resp.status_code == 201
        repo.add_member.assert_called_once()
