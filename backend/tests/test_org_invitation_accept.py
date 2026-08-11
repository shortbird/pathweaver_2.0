"""
Route tests for POST /api/admin/organizations/invitations/accept/<code> — the
public endpoint behind the standing account-creation links (/invitation/<code>).

Covers the guards added for link-based accepts:
- a shared student link is not an under-13 signup path (COPPA: under-13s are
  parent-created dependents), so student link accepts require a DOB and refuse
  under-13s;
- a stray click from a member of a DIFFERENT org must not silently move their
  account (their dependents' organization_id would not follow);
- an unknown code is a 404, not a 500 (.single() used to raise on zero rows).
"""

from datetime import datetime, timedelta
from unittest.mock import Mock, patch

import pytest


def _invite(role='student'):
    return {
        'id': 'inv-1',
        'organization_id': 'org-1',
        'email': 'link-invite-abcdef123456@pending.optio.local',
        'role': role,
        'status': 'pending',
        'expires_at': (datetime.utcnow() + timedelta(days=365)).isoformat() + '+00:00',
        'metadata': {},
        'organizations': {'name': 'Hearthwood Academy', 'slug': 'hearthwood'},
    }


def _admin(invite, user_rows_by_call=None):
    """Admin client stub. table(...).select/eq/maybe_single chains return the
    table mock; execute() yields the invite first, then each users result."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'in_', 'limit', 'maybe_single', 'update', 'insert', 'upsert'):
        getattr(table, chained).return_value = table
    responses = [Mock(data=invite)]
    for rows in (user_rows_by_call or []):
        responses.append(Mock(data=rows))
    table.execute.side_effect = responses + [Mock(data=[])] * 10
    return client


def _post(client, code, body, admin):
    with patch('routes.admin.user_invitations.get_supabase_admin_client',
               return_value=admin), \
         patch('utils.session_manager.session_manager.get_effective_user_id',
               return_value=None):
        return client.post(f'/api/admin/organizations/invitations/accept/{code}',
                           json=body)


@pytest.mark.unit
class TestAcceptInvitationGuards:
    def test_unknown_code_is_404_not_500(self, client):
        admin = _admin(None)
        resp = _post(client, 'not-a-real-code', {'email': 'a@b.com', 'password': 'x' * 8}, admin)
        assert resp.status_code == 404

    def test_student_link_requires_dob(self, client):
        # users lookups: not in org, no existing account
        admin = _admin(_invite('student'), user_rows_by_call=[[], []])
        resp = _post(client, 'code', {
            'email': 'teen@example.com', 'password': 'password123',
            'first_name': 'Teen', 'last_name': 'Student',
        }, admin)
        assert resp.status_code == 400
        assert 'Date of birth' in resp.get_json()['error']

    def test_student_link_refuses_under_13(self, client):
        admin = _admin(_invite('student'), user_rows_by_call=[[], []])
        young_dob = (datetime.utcnow() - timedelta(days=9 * 365)).strftime('%Y-%m-%d')
        resp = _post(client, 'code', {
            'email': 'kid@example.com', 'password': 'password123',
            'first_name': 'Young', 'last_name': 'Kid',
            'date_of_birth': young_dob,
        }, admin)
        assert resp.status_code == 400
        assert 'under 13' in resp.get_json()['error']

    def test_student_link_accepts_13_plus(self, client):
        admin = _admin(_invite('student'), user_rows_by_call=[[], []])
        teen_dob = (datetime.utcnow() - timedelta(days=15 * 365)).strftime('%Y-%m-%d')
        auth_user = Mock()
        auth_user.id = 'new-user-1'
        admin.auth.admin.create_user.return_value = Mock(user=auth_user)
        with patch('routes.auth.registration.ensure_user_diploma_and_skills'):
            resp = _post(client, 'code', {
                'email': 'teen@example.com', 'password': 'password123',
                'first_name': 'Teen', 'last_name': 'Student',
                'date_of_birth': teen_dob,
            }, admin)
        assert resp.status_code == 201
        assert resp.get_json()['new_user'] is True

    def test_parent_link_needs_no_dob(self, client):
        admin = _admin(_invite('parent'), user_rows_by_call=[[], []])
        auth_user = Mock()
        auth_user.id = 'new-user-2'
        admin.auth.admin.create_user.return_value = Mock(user=auth_user)
        with patch('routes.auth.registration.ensure_user_diploma_and_skills'):
            resp = _post(client, 'code', {
                'email': 'mom@example.com', 'password': 'password123',
                'first_name': 'Pat', 'last_name': 'Parent',
            }, admin)
        assert resp.status_code == 201

    def test_link_accept_refuses_cross_org_move(self, client):
        # users lookups: not in THIS org, but the email belongs to an account
        # that lives in a different org — the link must not steal it.
        admin = _admin(_invite('parent'), user_rows_by_call=[
            [],  # existing_in_org check (org-1)
            [{'id': 'u-9', 'organization_id': 'org-OTHER',
              'first_name': 'Existing', 'last_name': 'Elsewhere'}],
        ])
        admin.auth.sign_in_with_password.return_value = Mock(user=Mock())
        resp = _post(client, 'code', {
            'email': 'existing@example.com', 'password': 'password123',
        }, admin)
        assert resp.status_code == 409
        assert 'another school' in resp.get_json()['error']
