"""Unit tests for account deletion routes (App Store + GDPR requirement)."""

import json
from unittest.mock import MagicMock, patch


def _mock_db(user_row=None):
    """Build a supabase mock with .table().select()/update()/insert()/delete() chain."""
    supabase = MagicMock()

    def table(_name):
        t = MagicMock()
        # select().eq().execute() returning user_row
        select_chain = MagicMock()
        select_chain.eq.return_value.execute.return_value = MagicMock(data=[user_row] if user_row else [])
        t.select.return_value = select_chain
        # update().eq().execute()
        update_chain = MagicMock()
        update_chain.eq.return_value.execute.return_value = MagicMock(data=[{}])
        t.update.return_value = update_chain
        # insert().execute()
        t.insert.return_value.execute.return_value = MagicMock(data=[{'id': 'log-1'}])
        # delete().eq().execute()
        delete_chain = MagicMock()
        delete_chain.eq.return_value.execute.return_value = MagicMock(data=[])
        t.delete.return_value = delete_chain
        return t

    supabase.table.side_effect = table
    return supabase


def test_request_account_deletion_schedules_30_day(client, mock_verify_token):
    user_row = {
        'id': 'test-user-123',
        'email': 'u@example.com',
        'first_name': 'Test',
        'last_name': 'User',
        'total_xp': 100,
        'created_at': '2024-01-01T00:00:00Z',
        'deletion_status': 'none',
    }
    supabase = _mock_db(user_row=user_row)
    with patch('routes.account_deletion.get_supabase_admin_client', return_value=supabase):
        resp = client.post(
            '/api/users/delete-account',
            headers={'Authorization': 'Bearer t', 'Content-Type': 'application/json'},
            data=json.dumps({'reason': 'testing'}),
        )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['status'] == 'pending'
    assert 'deletion_scheduled_for' in body
    assert body['grace_period_days'] == 30


def test_request_account_deletion_already_pending(client, mock_verify_token):
    user_row = {
        'id': 'test-user-123',
        'email': 'u@example.com',
        'deletion_status': 'pending',
        'deletion_scheduled_for': '2030-01-01T00:00:00Z',
    }
    supabase = _mock_db(user_row=user_row)
    with patch('routes.account_deletion.get_supabase_admin_client', return_value=supabase):
        resp = client.post(
            '/api/users/delete-account',
            headers={'Authorization': 'Bearer t', 'Content-Type': 'application/json'},
            data=json.dumps({}),
        )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['status'] == 'pending'


def test_request_account_deletion_requires_auth(client):
    resp = client.post(
        '/api/users/delete-account',
        headers={'Content-Type': 'application/json'},
        data=json.dumps({}),
    )
    assert resp.status_code in (401, 403)


def test_deletion_status_returns_none_for_active_user(client, mock_verify_token):
    user_row = {'deletion_status': 'none', 'deletion_requested_at': None, 'deletion_scheduled_for': None}
    supabase = _mock_db(user_row=user_row)
    with patch('routes.account_deletion.get_user_client', return_value=supabase):
        resp = client.get(
            '/api/users/deletion-status',
            headers={'Authorization': 'Bearer t'},
        )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['deletion_status'] == 'none'
