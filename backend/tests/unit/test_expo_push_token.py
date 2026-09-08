"""Unit tests for Expo push token registration/deactivation routes."""

import json
from unittest.mock import MagicMock, patch


def _mock_supabase_chain():
    """Build a mock supabase client where .table(...).upsert(...).execute() works."""
    supabase = MagicMock()
    table = MagicMock()
    supabase.table.return_value = table
    table.upsert.return_value.execute.return_value = MagicMock(data=[{'id': 'row-1'}])
    table.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    return supabase


def test_register_expo_token_success(client, mock_verify_token):
    supabase = _mock_supabase_chain()
    with patch('database.get_supabase_admin_client', return_value=supabase):
        resp = client.post(
            '/api/push/expo-token',
            headers={'Authorization': 'Bearer t', 'Content-Type': 'application/json'},
            data=json.dumps({
                'token': 'ExponentPushToken[abc123]',
                'platform': 'ios',
                'device_name': 'iPhone 15',
            }),
        )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body['success'] is True
    supabase.table.assert_called_with('device_tokens')
    upsert_args = supabase.table.return_value.upsert.call_args
    payload = upsert_args[0][0]
    assert payload['user_id'] == 'test-user-123'
    assert payload['token'] == 'ExponentPushToken[abc123]'
    assert payload['platform'] == 'ios'
    assert payload['is_active'] is True
    assert upsert_args[1]['on_conflict'] == 'user_id,token'


def test_register_expo_token_steals_the_token_from_other_accounts(client, mock_verify_token):
    """One device, one account.

    Registration used to only upsert its own row, so every account ever signed
    in on a phone kept an active row for that phone's token — and expo_push_
    service fans out to every active token a user holds. A superadmin who signs
    into members' accounts to reproduce their bugs ended up receiving their
    message previews on his own phone. Logout is not a fix: it clears only the
    leaving user, and it does not run when the app is killed.
    """
    supabase = _mock_supabase_chain()
    with patch('database.get_supabase_admin_client', return_value=supabase):
        resp = client.post(
            '/api/push/expo-token',
            headers={'Authorization': 'Bearer t', 'Content-Type': 'application/json'},
            data=json.dumps({'token': 'ExponentPushToken[abc123]', 'platform': 'android'}),
        )
    assert resp.status_code == 201

    table = supabase.table.return_value
    table.update.assert_called_once_with({'is_active': False})
    # Scoped to this token, excluding this user: .eq(token).neq(user_id).eq(is_active)
    assert table.update.return_value.eq.call_args[0] == ('token', 'ExponentPushToken[abc123]')
    neq = table.update.return_value.eq.return_value.neq
    assert neq.call_args[0] == ('user_id', 'test-user-123')


def test_register_expo_token_missing_token(client, mock_verify_token):
    resp = client.post(
        '/api/push/expo-token',
        headers={'Authorization': 'Bearer t', 'Content-Type': 'application/json'},
        data=json.dumps({'platform': 'ios'}),
    )
    assert resp.status_code == 400
    assert 'token' in resp.get_json()['error'].lower()


def test_register_expo_token_requires_auth(client):
    resp = client.post(
        '/api/push/expo-token',
        headers={'Content-Type': 'application/json'},
        data=json.dumps({'token': 'ExponentPushToken[x]', 'platform': 'android'}),
    )
    assert resp.status_code in (401, 403)


def test_deactivate_expo_token_success(client, mock_verify_token):
    supabase = _mock_supabase_chain()
    with patch('database.get_supabase_admin_client', return_value=supabase):
        resp = client.delete(
            '/api/push/expo-token',
            headers={'Authorization': 'Bearer t', 'Content-Type': 'application/json'},
            data=json.dumps({'token': 'ExponentPushToken[abc123]'}),
        )
    assert resp.status_code == 200
    assert resp.get_json()['success'] is True


def test_deactivate_expo_token_missing_token(client, mock_verify_token):
    resp = client.delete(
        '/api/push/expo-token',
        headers={'Authorization': 'Bearer t', 'Content-Type': 'application/json'},
        data=json.dumps({}),
    )
    assert resp.status_code == 400
