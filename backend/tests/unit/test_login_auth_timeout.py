"""
A login whose Supabase Auth call times out answers 503, not 400.

Ticket d7bf46f0: supabase_auth wraps httpx's read timeout in
AuthRetryableError("The read operation timed out"). `is_retryable_error`
looked for 'timeout' and missed "timed out", so with_connection_retry did not
try again, and /login fell through to its catch-all 400 "Login failed. Please
check your email and password" -- for a password nobody had checked.
"""

import inspect
from unittest.mock import MagicMock, patch

import pytest
from flask import Blueprint, Flask
from supabase_auth.errors import AuthRetryableError

from utils.retry_handler import is_retryable_error


TIMEOUT_MESSAGE = 'The read operation timed out'


@pytest.mark.unit
class TestTimedOutIsRetryable:
    def test_auth_retryable_error_from_the_ticket(self):
        """Ticket d7bf46f0: the exact error supabase_auth raised is retryable."""
        assert is_retryable_error(AuthRetryableError(TIMEOUT_MESSAGE, 0))

    def test_the_wording_alone_is_retryable(self):
        """Ticket d7bf46f0: "timed out" matches even when a library wraps it
        in a plain Exception."""
        assert is_retryable_error(Exception(TIMEOUT_MESSAGE))

    def test_a_wrong_password_is_still_not_retryable(self):
        """Ticket d7bf46f0: the new match must not swallow real credential
        failures."""
        assert not is_retryable_error(Exception('Invalid login credentials'))


def _login_view():
    from routes.auth.login import core
    app = Flask(__name__)
    bp = Blueprint('auth', __name__)
    core.register_routes(bp)
    app.register_blueprint(bp)
    return app, core, inspect.unwrap(app.view_functions['auth.login'])


@pytest.mark.unit
class TestLoginAnswers503OnTimeout:
    def test_timed_out_sign_in_returns_503(self):
        """Ticket d7bf46f0: a timed-out sign-in is a 503 'try again', not a
        400 'check your password', and it does not count as a failed attempt."""
        app, core, login = _login_view()
        auth_client = MagicMock()
        auth_client.auth.sign_in_with_password.side_effect = AuthRetryableError(TIMEOUT_MESSAGE, 0)
        with patch.object(core, 'get_throwaway_auth_client', return_value=auth_client), \
             patch.object(core, 'constant_time_delay'), \
             patch.object(core, 'check_account_lockout', return_value=(False, 0, 0)), \
             patch.object(core, 'record_failed_login') as failed, \
             patch('utils.retry_handler.time.sleep'), \
             app.test_request_context(method='POST',
                                      json={'email': 'kid@example.com', 'password': 'pw'}):
            resp = login()
        body, status = resp[0].get_json(), resp[1]
        assert status == 503
        assert body['error']['code'] == 'SERVICE_UNAVAILABLE'
        assert body['error']['message'] == 'Sign-in is slow right now. Please try again.'
        # with_connection_retry tried more than once before giving up.
        assert auth_client.auth.sign_in_with_password.call_count == 3
        failed.assert_not_called()
