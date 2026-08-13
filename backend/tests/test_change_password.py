"""
Route tests for POST /api/auth/change-password — changing your own password
while signed in, from Account Settings.

Pins the three things that make this safe: the current password is required, a
masquerading admin can't use it, and the change invalidates every OTHER session
while re-issuing this one (otherwise people get logged out of the browser they
are sitting at, and stop changing their passwords).
"""

from unittest.mock import Mock, patch

import pytest


GOOD_PASSWORD = 'Str0ng!NewPassword'


@pytest.fixture(autouse=True)
def _no_hibp_lookups():
    """Keep these tests off the network.

    change-password now checks the password against HaveIBeenPwned, which is a
    live HTTP call. Unpatched it makes this suite depend on an external service
    (and on GOOD_PASSWORD never appearing in a future corpus). The check itself
    is covered in test_breached_password.py.
    """
    with patch('routes.auth.password.validate_password_not_breached',
               return_value=(True, None)):
        yield


def _admin_mock(email='student@example.com'):
    admin = Mock()
    admin.auth.admin.get_user_by_id.return_value = Mock(
        user=Mock(id='user-1', email=email)
    )
    table = Mock()
    admin.table.return_value = table
    for chained in ('select', 'eq', 'update', 'insert'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'id': 'user-1'}])
    return admin


def _post(client, auth_headers, body, *, anon=None, actual_user_id='user-1'):
    admin = _admin_mock()
    anon = anon or Mock()

    with patch('routes.auth.password.get_supabase_admin_client', return_value=admin), \
         patch('routes.auth.password.get_supabase_client', return_value=anon), \
         patch('utils.session_manager.session_manager.get_effective_user_id',
               return_value='user-1'), \
         patch('utils.session_manager.session_manager.get_actual_admin_id',
               return_value=actual_user_id):
        resp = client.post('/api/auth/change-password', json=body, headers=auth_headers)
    return resp, admin, anon


@pytest.mark.unit
class TestChangePassword:
    def test_changes_password_and_invalidates_other_sessions(
            self, client, auth_headers, mock_verify_token):
        resp, admin, anon = _post(client, auth_headers, {
            'current_password': 'OldPassw0rd!x',
            'new_password': GOOD_PASSWORD,
        })

        assert resp.status_code == 200
        # Current password was actually verified against auth, not assumed.
        anon.auth.sign_in_with_password.assert_called_once()
        admin.auth.admin.update_user_by_id.assert_called_once_with(
            'user-1', {'password': GOOD_PASSWORD})
        # Every token issued before now is dead...
        assert any(
            'last_logout_at' in (call.args[0] if call.args else {})
            for call in admin.table.return_value.update.call_args_list
        )
        # ...but this session gets a fresh pair so it survives.
        body = resp.get_json()
        assert body['app_access_token'] and body['app_refresh_token']

    def test_wrong_current_password_is_rejected(self, client, auth_headers, mock_verify_token):
        anon = Mock()
        anon.auth.sign_in_with_password.side_effect = Exception('Invalid login credentials')

        resp, admin, _ = _post(client, auth_headers, {
            'current_password': 'wrong-password',
            'new_password': GOOD_PASSWORD,
        }, anon=anon)

        assert resp.status_code == 400
        assert 'current password' in resp.get_json()['error'].lower()
        admin.auth.admin.update_user_by_id.assert_not_called()

    def test_masquerading_admin_cannot_change_the_target_password(
            self, client, auth_headers, mock_verify_token):
        # get_effective_user_id is the target; get_actual_admin_id is the admin.
        resp, admin, _ = _post(client, auth_headers, {
            'current_password': 'OldPassw0rd!x',
            'new_password': GOOD_PASSWORD,
        }, actual_user_id='admin-9')

        assert resp.status_code == 403
        admin.auth.admin.update_user_by_id.assert_not_called()

    def test_weak_new_password_is_rejected(self, client, auth_headers, mock_verify_token):
        resp, admin, _ = _post(client, auth_headers, {
            'current_password': 'OldPassw0rd!x',
            'new_password': 'short',
        })

        assert resp.status_code == 400
        admin.auth.admin.update_user_by_id.assert_not_called()

    def test_reusing_the_current_password_is_rejected(self, client, auth_headers, mock_verify_token):
        resp, admin, _ = _post(client, auth_headers, {
            'current_password': GOOD_PASSWORD,
            'new_password': GOOD_PASSWORD,
        })

        assert resp.status_code == 400
        admin.auth.admin.update_user_by_id.assert_not_called()
