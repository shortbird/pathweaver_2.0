"""
Unit tests for M7: real /api/health DB ping.

Verifies the `ping_database()` helper that backs `/api/health` returns
(False, error) when Supabase is unreachable so the route can return 503 —
load balancers pull the instance out of rotation rather than treating it
as a permanent error. Tests target `health.py` directly to avoid booting
the full Flask app (which has a heavy import chain).

The ping is a bounded, self-contained PostgREST GET rather than a supabase-py
call: supabase-py's default 120s timeout let a single hung request blow past
Render's 5s health-check budget, turning a 503 into a probe timeout. These
tests pin both the bound and the retry behaviour.
"""

import httpx
import pytest
from unittest.mock import MagicMock, patch

import health
from health import ping_database


@pytest.fixture(autouse=True)
def _supabase_config():
    """ping_database() reads Supabase creds off Config before doing anything."""
    with patch('app_config.Config.SUPABASE_URL', 'https://project.supabase.co'), \
            patch('app_config.Config.SUPABASE_SERVICE_ROLE_KEY', 'service-role-key'):
        yield


def _client_returning(*responses):
    """Build an httpx.Client stub whose .get() yields the given responses or raises."""
    fake_client = MagicMock()
    fake_client.__enter__.return_value = fake_client
    fake_client.__exit__.return_value = False
    fake_client.get.side_effect = list(responses)
    return fake_client


def test_ping_database_returns_true_when_query_succeeds():
    fake_client = _client_returning(MagicMock(status_code=200))

    with patch('httpx.Client', return_value=fake_client) as client_factory:
        ok, err = ping_database()

    assert ok is True
    assert err is None

    # The ping must be bounded — an unbounded call is the bug this replaced.
    assert client_factory.call_args.kwargs['timeout'] == health.PING_TIMEOUT_SECONDS

    # Confirm the actual ping happened against users.id with limit 1
    call = fake_client.get.call_args
    assert call.args[0].endswith('/rest/v1/users')
    assert call.kwargs['params'] == {'select': 'id', 'limit': '1'}


def test_ping_database_retries_once_then_succeeds():
    """A stale-socket blip (the observed SSL EOF) must not fail the health check."""
    fake_client = _client_returning(
        httpx.ReadError('[SSL: UNEXPECTED_EOF_WHILE_READING]'),
        MagicMock(status_code=200),
    )

    with patch('httpx.Client', return_value=fake_client):
        ok, err = ping_database()

    assert ok is True
    assert err is None
    assert fake_client.get.call_count == 2


def test_ping_database_returns_false_when_query_raises():
    fake_client = _client_returning(
        httpx.ConnectError('connection refused'),
        httpx.ConnectError('connection refused'),
    )

    with patch('httpx.Client', return_value=fake_client):
        ok, err = ping_database()

    assert ok is False
    assert 'connection refused' in err


def test_ping_database_returns_false_on_postgrest_error_status():
    fake_client = _client_returning(
        MagicMock(status_code=503),
        MagicMock(status_code=503),
    )

    with patch('httpx.Client', return_value=fake_client):
        ok, err = ping_database()

    assert ok is False
    assert '503' in err


def test_ping_database_returns_false_when_config_missing():
    """Missing env (bad deploy, unset secret) must report unhealthy, not raise."""
    with patch('app_config.Config.SUPABASE_URL', None):
        ok, err = ping_database()

    assert ok is False
    assert 'Missing Supabase configuration' in err


def test_ping_database_does_not_retry_past_the_deadline():
    """A slow first attempt must not buy a second one — Render allows 5s total."""
    fake_client = _client_returning(httpx.ReadTimeout('too slow'))

    times = iter([0.0, health.PING_DEADLINE_SECONDS])
    with patch('httpx.Client', return_value=fake_client), \
            patch('time.monotonic', side_effect=lambda: next(times)):
        ok, err = ping_database()

    assert ok is False
    assert fake_client.get.call_count == 1
