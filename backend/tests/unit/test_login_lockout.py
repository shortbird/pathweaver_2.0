"""
Unit tests for H7 per-account login lockout + password reset throttle.

Covers:
  - compute_lockout_seconds exponential backoff curve (pure function)
  - record_failed_login increments lockout_count on threshold breach and uses
    the computed duration
  - reset_login_attempts preserves lockout_count (backoff survives success)
  - should_throttle_password_reset: first request OK, threshold trips soft-lock,
    sliding-window reset after expiry, fail-open on DB error
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from routes.auth.login.security import (
    compute_lockout_seconds,
    record_failed_login,
    reset_login_attempts,
    MAX_LOGIN_ATTEMPTS,
    BASE_LOCKOUT_SECONDS,
    MAX_LOCKOUT_SECONDS,
)
from routes.auth.password import (
    should_throttle_password_reset,
    RESET_MAX_REQUESTS,
    RESET_WINDOW_SECONDS,
)


# ── compute_lockout_seconds ───────────────────────────────────────────────────

def test_compute_lockout_seconds_first_lockout_equals_base():
    assert compute_lockout_seconds(1) == BASE_LOCKOUT_SECONDS


def test_compute_lockout_seconds_doubles_each_step():
    assert compute_lockout_seconds(2) == BASE_LOCKOUT_SECONDS * 2
    assert compute_lockout_seconds(3) == BASE_LOCKOUT_SECONDS * 4
    assert compute_lockout_seconds(4) == BASE_LOCKOUT_SECONDS * 8


def test_compute_lockout_seconds_caps_at_24h():
    # At BASE=3600, cap (86400) is hit at n=6 (3600*32=115200→capped to 86400).
    assert compute_lockout_seconds(10) == MAX_LOCKOUT_SECONDS
    assert compute_lockout_seconds(100) == MAX_LOCKOUT_SECONDS


def test_compute_lockout_seconds_zero_or_negative_returns_base():
    assert compute_lockout_seconds(0) == BASE_LOCKOUT_SECONDS
    assert compute_lockout_seconds(-1) == BASE_LOCKOUT_SECONDS


# ── record_failed_login ───────────────────────────────────────────────────────

def _mock_admin_client_with_record(record):
    """Supabase admin client mock where SELECT returns `record` (or [] if None)."""
    client = MagicMock()
    select_chain = MagicMock()
    select_chain.execute.return_value = MagicMock(data=[record] if record else [])
    select_chain.eq.return_value = select_chain

    update_chain = MagicMock()
    update_chain.eq.return_value = update_chain
    update_chain.execute.return_value = MagicMock(data=[{}])

    insert_chain = MagicMock()
    insert_chain.execute.return_value = MagicMock(data=[{}])

    table = MagicMock()
    table.select.return_value = select_chain
    table.update.return_value = update_chain
    table.insert.return_value = insert_chain

    client.table.return_value = table
    return client, table, update_chain, insert_chain


def test_record_failed_login_creates_new_record_when_none_exists():
    client, table, _, insert_chain = _mock_admin_client_with_record(None)
    with patch(
        'routes.auth.login.security.get_supabase_admin_client',
        return_value=client,
    ):
        locked, remaining, duration = record_failed_login('new@example.com')

    assert locked is False
    assert remaining == MAX_LOGIN_ATTEMPTS - 1
    assert duration == 0
    insert_args = table.insert.call_args[0][0]
    assert insert_args['email'] == 'new@example.com'
    assert insert_args['attempt_count'] == 1
    assert insert_args['lockout_count'] == 0


def test_record_failed_login_increments_without_locking_below_threshold():
    existing = {'attempt_count': 2, 'lockout_count': 0}
    client, table, update_chain, _ = _mock_admin_client_with_record(existing)
    with patch(
        'routes.auth.login.security.get_supabase_admin_client',
        return_value=client,
    ):
        locked, remaining, duration = record_failed_login('user@example.com')

    assert locked is False
    assert remaining == MAX_LOGIN_ATTEMPTS - 3  # 2+1=3
    assert duration == 0
    update_args = table.update.call_args[0][0]
    assert update_args['attempt_count'] == 3
    assert 'lockout_count' not in update_args  # only bumped on lockout


def test_record_failed_login_locks_at_threshold_with_first_lockout_duration():
    existing = {'attempt_count': MAX_LOGIN_ATTEMPTS - 1, 'lockout_count': 0}
    client, table, _, _ = _mock_admin_client_with_record(existing)
    with patch(
        'routes.auth.login.security.get_supabase_admin_client',
        return_value=client,
    ):
        locked, remaining, duration_minutes = record_failed_login('user@example.com')

    assert locked is True
    assert remaining == 0
    assert duration_minutes == BASE_LOCKOUT_SECONDS // 60
    update_args = table.update.call_args[0][0]
    assert update_args['lockout_count'] == 1
    assert update_args['attempt_count'] == MAX_LOGIN_ATTEMPTS


def test_record_failed_login_uses_exponential_duration_on_repeat_lockout():
    # Account previously locked out twice; next lockout should be 4× base.
    existing = {'attempt_count': MAX_LOGIN_ATTEMPTS - 1, 'lockout_count': 2}
    client, table, _, _ = _mock_admin_client_with_record(existing)
    with patch(
        'routes.auth.login.security.get_supabase_admin_client',
        return_value=client,
    ):
        locked, _, duration_minutes = record_failed_login('user@example.com')

    assert locked is True
    assert duration_minutes == (BASE_LOCKOUT_SECONDS * 4) // 60
    update_args = table.update.call_args[0][0]
    assert update_args['lockout_count'] == 3


# ── reset_login_attempts ──────────────────────────────────────────────────────

def test_reset_login_attempts_clears_attempts_but_preserves_lockout_count():
    client, table, update_chain, _ = _mock_admin_client_with_record(None)
    with patch(
        'routes.auth.login.security.get_supabase_admin_client',
        return_value=client,
    ):
        reset_login_attempts('user@example.com')

    update_args = table.update.call_args[0][0]
    assert update_args['attempt_count'] == 0
    assert update_args['locked_until'] is None
    # Critical H7 invariant: lockout_count must not be reset.
    assert 'lockout_count' not in update_args


# ── should_throttle_password_reset ────────────────────────────────────────────

def _reset_mock_client(record):
    """Mock client for password_reset_attempts table."""
    client = MagicMock()
    select_chain = MagicMock()
    select_chain.execute.return_value = MagicMock(data=[record] if record else [])
    select_chain.eq.return_value = select_chain

    update_chain = MagicMock()
    update_chain.eq.return_value = update_chain
    update_chain.execute.return_value = MagicMock(data=[{}])

    insert_chain = MagicMock()
    insert_chain.execute.return_value = MagicMock(data=[{}])

    table = MagicMock()
    table.select.return_value = select_chain
    table.update.return_value = update_chain
    table.insert.return_value = insert_chain

    client.table.return_value = table
    return client, table


def test_should_throttle_password_reset_allows_first_request():
    client, table = _reset_mock_client(None)
    with patch(
        'routes.auth.password.get_supabase_admin_client',
        return_value=client,
    ):
        assert should_throttle_password_reset('new@example.com') is False

    insert_args = table.insert.call_args[0][0]
    assert insert_args['attempt_count'] == 1
    assert insert_args['lockout_count'] == 0


def test_should_throttle_password_reset_blocks_when_currently_locked():
    now = datetime.now(timezone.utc)
    existing = {
        'attempt_count': RESET_MAX_REQUESTS + 5,
        'lockout_count': 1,
        'locked_until': (now + timedelta(minutes=30)).isoformat(),
        'last_attempt_at': now.isoformat(),
    }
    client, _ = _reset_mock_client(existing)
    with patch(
        'routes.auth.password.get_supabase_admin_client',
        return_value=client,
    ):
        assert should_throttle_password_reset('user@example.com') is True


def test_should_throttle_password_reset_resets_counter_after_window_expires():
    now = datetime.now(timezone.utc)
    # Last attempt was well past the window — counter should reset.
    existing = {
        'attempt_count': RESET_MAX_REQUESTS,
        'lockout_count': 0,
        'locked_until': None,
        'last_attempt_at': (now - timedelta(seconds=RESET_WINDOW_SECONDS * 2)).isoformat(),
    }
    client, table = _reset_mock_client(existing)
    with patch(
        'routes.auth.password.get_supabase_admin_client',
        return_value=client,
    ):
        assert should_throttle_password_reset('user@example.com') is False

    update_args = table.update.call_args[0][0]
    assert update_args['attempt_count'] == 1
    assert update_args['locked_until'] is None


def test_should_throttle_password_reset_soft_locks_past_threshold_in_window():
    now = datetime.now(timezone.utc)
    existing = {
        'attempt_count': RESET_MAX_REQUESTS,  # next call makes it MAX+1 → lock
        'lockout_count': 0,
        'locked_until': None,
        'last_attempt_at': now.isoformat(),
    }
    client, table = _reset_mock_client(existing)
    with patch(
        'routes.auth.password.get_supabase_admin_client',
        return_value=client,
    ):
        assert should_throttle_password_reset('user@example.com') is True

    update_args = table.update.call_args[0][0]
    assert update_args['lockout_count'] == 1
    assert update_args['locked_until'] is not None


def test_should_throttle_password_reset_escalates_lockout_count():
    now = datetime.now(timezone.utc)
    existing = {
        'attempt_count': RESET_MAX_REQUESTS,
        'lockout_count': 2,  # already been locked twice
        'locked_until': None,
        'last_attempt_at': now.isoformat(),
    }
    client, table = _reset_mock_client(existing)
    with patch(
        'routes.auth.password.get_supabase_admin_client',
        return_value=client,
    ):
        assert should_throttle_password_reset('user@example.com') is True

    update_args = table.update.call_args[0][0]
    assert update_args['lockout_count'] == 3  # escalated


def test_should_throttle_password_reset_fails_open_on_db_error():
    """If the DB is unreachable, don't lock real users out — allow the request."""
    client = MagicMock()
    client.table.side_effect = Exception('db down')
    with patch(
        'routes.auth.password.get_supabase_admin_client',
        return_value=client,
    ):
        assert should_throttle_password_reset('user@example.com') is False
