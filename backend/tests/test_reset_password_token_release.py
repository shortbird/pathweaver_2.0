"""
Route tests for POST /api/auth/reset-password — the token lifecycle.

The token is claimed (used=True) BEFORE the password is written, so two
concurrent submits can't both spend it. These tests pin the other half of that
bargain: when the write doesn't land, the claim is given back.

Regression: an iCreate teacher burned four reset links in an hour. Her password
passed validate_password() but was in the HaveIBeenPwned corpus, so Supabase's
leaked-password protection refused it with a 422. The route had already marked
the token used, reported a generic 500, and every retry — same link or a fresh
email — answered "Invalid or already used reset token". Nothing anywhere told
her the password was the problem.
"""

from unittest.mock import Mock, patch

import pytest


GOOD_PASSWORD = 'Str0ng!NewPassword'
TOKEN = 'a' * 43


class _WeakPasswordError(Exception):
    """Shaped like gotrue's AuthWeakPasswordError."""

    def __init__(self):
        super().__init__(
            'Password is known to be weak and easy to guess, please choose a different one.')
        self.status = 422
        self.code = 'weak_password'
        self.message = str(self)


def _admin_mock(expires_at='2099-01-01T00:00:00+00:00'):
    """Admin client whose token claim succeeds and whose updates are recorded."""
    admin = Mock()
    admin.auth.admin.get_user_by_id.return_value = Mock(
        user=Mock(id='user-1', email='teacher@example.com', email_confirmed_at=None)
    )
    table = Mock()
    admin.table.return_value = table
    for chained in ('select', 'eq', 'update', 'insert', 'delete', 'limit', 'lt'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{
        'user_id': 'user-1',
        'expires_at': expires_at,
        'email': 'teacher@example.com',
    }])
    return admin


def _post(client, admin):
    with patch('routes.auth.password.get_supabase_admin_client', return_value=admin):
        return client.post('/api/auth/reset-password',
                           json={'token': TOKEN, 'new_password': GOOD_PASSWORD})


def _released(admin):
    """True when some update handed the token back."""
    return any(
        call.args and call.args[0].get('used') is False
        for call in admin.table.return_value.update.call_args_list
    )


@pytest.mark.unit
class TestResetPasswordTokenRelease:
    def test_breached_password_explains_itself_and_keeps_the_link(self, client):
        admin = _admin_mock()
        admin.auth.admin.update_user_by_id.side_effect = _WeakPasswordError()

        resp = _post(client, admin)

        assert resp.status_code == 400
        error = resp.get_json()['error']
        # She must learn it was the password, not the link.
        assert 'data breach' in error
        assert 'still valid' in error
        assert 'token' not in error.lower()
        assert _released(admin), 'a refused password must not burn the link'

    def test_unexpected_failure_also_releases_the_token(self, client):
        admin = _admin_mock()
        admin.auth.admin.update_user_by_id.side_effect = RuntimeError('gotrue exploded')

        resp = _post(client, admin)

        assert resp.status_code == 500
        assert _released(admin)

    def test_successful_reset_keeps_the_token_spent(self, client):
        admin = _admin_mock()
        admin.auth.admin.update_user_by_id.return_value = Mock(user=Mock(id='user-1'))

        resp = _post(client, admin)

        assert resp.status_code == 200
        assert not _released(admin), 'a spent token must stay spent'

    def test_already_used_token_is_still_rejected(self, client):
        admin = _admin_mock()
        # The atomic claim matches nothing: someone already spent this token.
        admin.table.return_value.execute.return_value = Mock(data=[])

        resp = _post(client, admin)

        assert resp.status_code == 400
        assert 'already used' in resp.get_json()['error']
        admin.auth.admin.update_user_by_id.assert_not_called()
