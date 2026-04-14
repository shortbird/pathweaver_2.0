"""Unit tests for notification preferences endpoints and suppression."""

import json
from unittest.mock import MagicMock, patch


def _mock_admin():
    supabase = MagicMock()
    table = MagicMock()
    supabase.table.return_value = table
    # select().eq().execute()
    table.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{'notification_type': 'message_received', 'enabled': False}]
    )
    # upsert().execute()
    table.upsert.return_value.execute.return_value = MagicMock(data=[])
    return supabase


def test_get_preferences_returns_map(client, mock_verify_token):
    supabase = _mock_admin()
    with patch('routes.notifications.get_supabase_admin_client', return_value=supabase):
        resp = client.get(
            '/api/notifications/preferences',
            headers={'Authorization': 'Bearer t'},
        )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['preferences'] == {'message_received': False}


def test_update_preferences_upserts(client, mock_verify_token):
    supabase = _mock_admin()
    with patch('routes.notifications.get_supabase_admin_client', return_value=supabase):
        resp = client.put(
            '/api/notifications/preferences',
            headers={'Authorization': 'Bearer t', 'Content-Type': 'application/json'},
            data=json.dumps({'preferences': {'message_received': False, 'observer_comment': True}}),
        )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['updated'] == 2
    upsert_args = supabase.table.return_value.upsert.call_args
    rows = upsert_args[0][0]
    assert len(rows) == 2
    assert all('user_id' in r and 'notification_type' in r and 'enabled' in r for r in rows)
    assert upsert_args[1]['on_conflict'] == 'user_id,notification_type'


def test_update_preferences_rejects_non_dict(client, mock_verify_token):
    resp = client.put(
        '/api/notifications/preferences',
        headers={'Authorization': 'Bearer t', 'Content-Type': 'application/json'},
        data=json.dumps({'preferences': 'nope'}),
    )
    assert resp.status_code == 400


def test_disabled_preference_suppresses_notification():
    from services.notification_service import NotificationService

    with patch('supabase.create_client') as mock_create_client:
        supabase = MagicMock()
        mock_create_client.return_value = supabase
        # Preference lookup returns enabled=False
        supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{'enabled': False}]
        )

        svc = NotificationService()
        # Verify insert is never called when suppressed
        result = svc.create_notification(
            user_id='u-1',
            notification_type='message_received',
            title='Hi',
            message='Test',
        )

    assert result == {}
    # The insert path on the table should NOT be hit
    assert not supabase.table.return_value.insert.called
