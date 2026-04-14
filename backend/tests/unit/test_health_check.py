"""
Unit tests for M7: real /api/health DB ping.

Verifies the `ping_database()` helper that backs `/api/health` returns
(False, error) when Supabase is unreachable so the route can return 503 —
load balancers pull the instance out of rotation rather than treating it
as a permanent error. Tests target `health.py` directly to avoid booting
the full Flask app (which has a heavy import chain).
"""

from unittest.mock import MagicMock, patch

from health import ping_database


def test_ping_database_returns_true_when_query_succeeds():
    fake_supabase = MagicMock()
    fake_supabase.table.return_value.select.return_value.limit.return_value\
        .execute.return_value = MagicMock(data=[{'id': 'any'}])

    with patch('database.get_supabase_admin_client', return_value=fake_supabase):
        ok, err = ping_database()

    assert ok is True
    assert err is None
    # Confirm the actual ping happened against users.id with limit 1
    fake_supabase.table.assert_called_with('users')
    fake_supabase.table.return_value.select.assert_called_with('id')
    fake_supabase.table.return_value.select.return_value.limit.assert_called_with(1)


def test_ping_database_returns_false_when_query_raises():
    fake_supabase = MagicMock()
    fake_supabase.table.side_effect = Exception('connection refused')

    with patch('database.get_supabase_admin_client', return_value=fake_supabase):
        ok, err = ping_database()

    assert ok is False
    assert 'connection refused' in err


def test_ping_database_returns_false_when_client_factory_raises():
    """The admin-client factory itself can fail (missing env, bad URL)."""
    with patch(
        'database.get_supabase_admin_client',
        side_effect=Exception('no env vars'),
    ):
        ok, err = ping_database()

    assert ok is False
    assert 'no env vars' in err
