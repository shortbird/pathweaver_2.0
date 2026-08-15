"""AI tutor retention sweep: off by default, conservative when on."""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from services.data_retention_service import retention_cutoff, run_tutor_retention_sweep
from tests.unit.test_account_deletion_executor import FakeSupabase

NOW = datetime(2026, 8, 15, 12, 0, tzinfo=timezone.utc)


def _client(rows):
    return FakeSupabase(tables={'tutor_conversations': rows})


def _conv(conv_id, days_old):
    stamp = None if days_old is None else (NOW - timedelta(days=days_old)).isoformat()
    return {'id': conv_id, 'user_id': 'u1', 'last_message_at': stamp}


def test_disabled_by_default_deletes_nothing_but_reports_what_it_would():
    client = _client([_conv('old', 500), _conv('recent', 10)])

    with patch('app_config.Config.TUTOR_RETENTION_ENABLED', False), \
         patch('app_config.Config.TUTOR_RETENTION_MONTHS', 12):
        report = run_tutor_retention_sweep(admin=client, now=NOW)

    assert report['enabled'] is False
    assert report['purged'] == 0
    assert report['eligible'] == 1, 'the number to look at before enabling'
    assert len(client.tables['tutor_conversations']) == 2, 'nothing deleted while disabled'


def test_enabled_purges_only_conversations_past_the_window():
    client = _client([_conv('old', 500), _conv('recent', 10)])

    with patch('app_config.Config.TUTOR_RETENTION_ENABLED', True), \
         patch('app_config.Config.TUTOR_RETENTION_MONTHS', 12), \
         patch('app_config.Config.TUTOR_RETENTION_BATCH', 200):
        report = run_tutor_retention_sweep(admin=client, now=NOW)

    assert report['purged'] == 1
    assert [c['id'] for c in client.tables['tutor_conversations']] == ['recent']


def test_conversations_with_no_timestamp_are_left_alone_and_reported():
    """Undated rows can't be aged; guessing would delete student-facing history."""
    client = _client([_conv('undated', None), _conv('old', 500)])

    with patch('app_config.Config.TUTOR_RETENTION_ENABLED', True), \
         patch('app_config.Config.TUTOR_RETENTION_MONTHS', 12), \
         patch('app_config.Config.TUTOR_RETENTION_BATCH', 200):
        report = run_tutor_retention_sweep(admin=client, now=NOW)

    assert report['skipped_no_timestamp'] == 1
    assert [c['id'] for c in client.tables['tutor_conversations']] == ['undated']


def test_cutoff_follows_the_configured_window():
    with patch('app_config.Config.TUTOR_RETENTION_MONTHS', 6):
        assert retention_cutoff(NOW) == NOW - timedelta(days=180)
