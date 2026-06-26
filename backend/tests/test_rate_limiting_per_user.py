"""
Regression tests for per-user rate limiting and 429 observability.

Context: a student reported "Upload failed: Too many requests" on the mobile
v1 web app. Root cause: the rate limiter keyed every request by client IP, so
students sharing a public IP (mobile carrier CGNAT, school/library NAT)
shared a single upload bucket and locked each other out. Separately, the 429
was returned as a plain JSON response (not an exception or logger.error), so
Sentry never saw the lockout.

These tests lock in:
1. per_user=True keys the limit by authenticated user, so two users from the
   SAME client IP get independent buckets (the NAT fix).
2. per_user falls back to IP for anonymous requests.
3. Default (per_user=False) behaviour is unchanged — still keyed by IP.
4. Every 429 is reported to the error tracker so lockouts are visible.
"""
import os
import sys
import types
from unittest.mock import patch

import pytest
from flask import Flask, jsonify, request

import middleware.rate_limiter as rl
from middleware.rate_limiter import rate_limit, rate_limiter


@pytest.fixture
def fake_sentry():
    """Provide a stub `sentry_sdk` module so the observability tests run even
    when the SDK isn't installed locally (it is a real dependency in CI/prod).
    Yields the stub so tests can assert on its mocks.
    """
    existing = sys.modules.get('sentry_sdk')
    stub = types.ModuleType('sentry_sdk')
    sys.modules['sentry_sdk'] = stub
    try:
        yield stub
    finally:
        if existing is not None:
            sys.modules['sentry_sdk'] = existing
        else:
            del sys.modules['sentry_sdk']


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config['TESTING'] = True

    # Per-user endpoint: 3 uploads/window, keyed by user when authenticated.
    @app.route('/api/evidence/blocks/<block_id>/upload-init', methods=['POST'])
    @rate_limit(calls=3, period=60, per_user=True)
    def upload_init(block_id):
        return jsonify({'message': 'ok'})

    # IP-keyed endpoint (default) for the control/regression comparison.
    @app.route('/api/ip-scoped', methods=['POST'])
    @rate_limit(calls=3, period=60)
    def ip_scoped():
        return jsonify({'message': 'ok'})

    return app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    rate_limiter.requests.clear()
    rate_limiter.blocked_ips.clear()
    old_env = os.environ.get('FLASK_ENV')
    os.environ['FLASK_ENV'] = 'development'
    yield
    rate_limiter.requests.clear()
    rate_limiter.blocked_ips.clear()
    if old_env is not None:
        os.environ['FLASK_ENV'] = old_env
    elif 'FLASK_ENV' in os.environ:
        del os.environ['FLASK_ENV']


@pytest.fixture(autouse=True)
def fake_user_resolver():
    """Resolve the rate-limit user id from a test header instead of a real JWT.

    This stands in for session_manager.get_effective_user_id() so we can
    simulate multiple authenticated users hitting the endpoint from one IP.
    """
    def _resolver():
        return request.headers.get('X-Test-User') or None

    with patch.object(rl, '_resolve_rate_limit_user_id', side_effect=_resolver):
        yield


def _post(client, user=None):
    headers = {'X-Test-User': user} if user else {}
    return client.post('/api/evidence/blocks/abc/upload-init', headers=headers)


class TestPerUserRateLimiting:
    def test_users_on_same_ip_have_independent_buckets(self, client):
        """The NAT fix: user A exhausting the limit must not affect user B,
        even though both requests originate from the same test client IP."""
        # User A uses up the full allowance.
        for _ in range(3):
            assert _post(client, user='user-A').status_code == 200
        # User A is now blocked...
        assert _post(client, user='user-A').status_code == 429
        # ...but user B (same IP) is unaffected.
        assert _post(client, user='user-B').status_code == 200
        assert _post(client, user='user-B').status_code == 200

    def test_same_user_is_limited(self, client):
        """A single user still gets limited (abuse protection preserved)."""
        for _ in range(3):
            assert _post(client, user='user-A').status_code == 200
        assert _post(client, user='user-A').status_code == 429

    def test_anonymous_falls_back_to_ip_keying(self, client):
        """With no resolvable user, per_user falls back to IP so the endpoint
        is still protected against unauthenticated abuse."""
        for _ in range(3):
            assert _post(client, user=None).status_code == 200
        assert _post(client, user=None).status_code == 429

    def test_default_endpoint_still_ip_keyed(self, client):
        """per_user defaults to False: a normal endpoint shares one IP bucket
        regardless of the (ignored) user header — unchanged legacy behaviour."""
        for _ in range(3):
            assert client.post('/api/ip-scoped',
                               headers={'X-Test-User': 'user-A'}).status_code == 200
        # Different user header, same IP — still limited because per_user is off.
        assert client.post('/api/ip-scoped',
                           headers={'X-Test-User': 'user-B'}).status_code == 429


class TestRateLimitObservability:
    def test_429_is_reported_to_error_tracker(self, client):
        """Every 429 must call the reporter so Sentry sees lockouts; a plain
        429 JSON response is otherwise invisible to error tracking."""
        with patch.object(rl, '_report_rate_limit_exceeded') as report:
            for _ in range(3):
                assert _post(client, user='user-A').status_code == 200
            assert report.call_count == 0  # no denials yet
            assert _post(client, user='user-A').status_code == 429
            assert report.call_count == 1
            # The reported identifier is user-scoped, not IP-scoped.
            reported_identifier = report.call_args.args[0]
            assert reported_identifier.startswith('user:user-A:')

    def test_report_captures_sentry_message(self, fake_sentry):
        """_report_rate_limit_exceeded forwards a grouped message to Sentry."""
        from unittest.mock import MagicMock

        fake_scope = MagicMock()

        class _Ctx:
            def __enter__(self_inner):
                return fake_scope

            def __exit__(self_inner, *a):
                return False

        fake_sentry.push_scope = MagicMock(return_value=_Ctx())
        fake_sentry.capture_message = MagicMock()

        rl._report_rate_limit_exceeded('user:u1:ep', 'ep', 60, 3600)

        fake_sentry.capture_message.assert_called_once()
        assert fake_sentry.capture_message.call_args.kwargs.get('level') == 'warning'
        # Denials on the same endpoint are grouped into one Sentry issue.
        assert fake_scope.fingerprint == ['rate-limit-exceeded', 'ep']

    def test_report_never_raises_when_sentry_unavailable(self, fake_sentry):
        """Telemetry failures must never break the request path."""
        from unittest.mock import MagicMock
        fake_sentry.push_scope = MagicMock(side_effect=RuntimeError('boom'))
        # Should swallow the error rather than propagate.
        rl._report_rate_limit_exceeded('user:u1:ep', 'ep', 60, 3600)
