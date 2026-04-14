"""Unit tests for the Apple Sign in callback."""

import json
from unittest.mock import MagicMock, patch


class _SupabaseUser:
    def __init__(self, user_id, email, metadata=None):
        self.id = user_id
        self.email = email
        self.user_metadata = metadata or {}


def _mock_admin(user_row=None, apple_user_id_row=None, email_row=None):
    supabase = MagicMock()

    supabase.auth.get_user.return_value = MagicMock(
        user=_SupabaseUser('apple-user-uuid', 'u@example.com', {'given_name': 'Jane', 'family_name': 'Doe'}),
    )

    def table(name):
        t = MagicMock()
        # Default: all lookups empty
        t.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        t.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(data=None)
        t.insert.return_value.execute.return_value = MagicMock(data=[{'id': 'apple-user-uuid'}])
        t.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        t.upsert.return_value.execute.return_value = MagicMock(data=[])
        return t

    supabase.table.side_effect = table
    return supabase


def test_apple_callback_rejects_missing_access_token(client):
    resp = client.post(
        '/api/auth/apple/callback',
        headers={'Content-Type': 'application/json'},
        data=json.dumps({}),
    )
    assert resp.status_code == 400


def test_apple_callback_rejects_invalid_token(client):
    supabase = MagicMock()
    supabase.auth.get_user.return_value = MagicMock(user=None)
    with patch('routes.auth.apple_oauth.get_supabase_admin_client', return_value=supabase):
        resp = client.post(
            '/api/auth/apple/callback',
            headers={'Content-Type': 'application/json'},
            data=json.dumps({'access_token': 'bad'}),
        )
    assert resp.status_code == 401


def test_apple_callback_existing_user_issues_session(client):
    """Existing user row by supabase id → session tokens returned, no TOS gate."""
    existing_user = {
        'id': 'apple-user-uuid',
        'email': 'u@example.com',
        'first_name': 'Jane',
        'last_name': 'Doe',
        'role': 'student',
        'tos_accepted_at': '2024-01-01T00:00:00Z',
    }
    supabase = MagicMock()
    supabase.auth.get_user.return_value = MagicMock(
        user=_SupabaseUser('apple-user-uuid', 'u@example.com'),
    )

    def table(name):
        t = MagicMock()
        # existing_by_id returns the user
        t.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[existing_user])
        t.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        return t

    supabase.table.side_effect = table
    with patch('routes.auth.apple_oauth.get_supabase_admin_client', return_value=supabase):
        resp = client.post(
            '/api/auth/apple/callback',
            headers={'Content-Type': 'application/json'},
            data=json.dumps({'access_token': 'good', 'refresh_token': 'r'}),
        )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['user']['id'] == 'apple-user-uuid'
    assert 'app_access_token' in body
    assert 'app_refresh_token' in body
    assert body['is_new_user'] is False
    assert not body.get('requires_tos_acceptance')


def test_apple_callback_new_user_requires_tos(client):
    """New user (no existing row) gets a TOS acceptance token, no session yet."""
    supabase = MagicMock()
    supabase.auth.get_user.return_value = MagicMock(
        user=_SupabaseUser('new-apple-uuid', 'new@example.com'),
    )

    def table(name):
        t = MagicMock()
        # all lookups empty = new user
        t.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        t.insert.return_value.execute.return_value = MagicMock(data=[{
            'id': 'new-apple-uuid',
            'email': 'new@example.com',
            'first_name': 'User',
            'last_name': '',
            'role': 'student',
        }])
        # diploma/skill lookups never block the test
        t.upsert.return_value.execute.return_value = MagicMock(data=[])
        return t

    supabase.table.side_effect = table
    with patch('routes.auth.apple_oauth.get_supabase_admin_client', return_value=supabase):
        resp = client.post(
            '/api/auth/apple/callback',
            headers={'Content-Type': 'application/json'},
            data=json.dumps({
                'access_token': 'good',
                'full_name': {'first_name': 'Jane', 'last_name': 'Doe'},
            }),
        )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['requires_tos_acceptance'] is True
    assert body['is_new_user'] is True
    assert 'tos_acceptance_token' in body
    assert 'app_access_token' not in body  # No session until TOS accepted
