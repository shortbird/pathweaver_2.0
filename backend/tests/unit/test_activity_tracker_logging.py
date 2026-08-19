"""Analytics telemetry must not manufacture incidents.

Sentry OPTIO-BACKEND-6M: `_log_event` runs on a background thread whose pooled
connection to Supabase is usually idle, so the first write after a lull fails
with httpx's "Server disconnected". The row was dropped (fine — the response had
already gone out) and logged at logger.error, which Sentry's logging integration
turns into a High-priority issue. A dropped analytics row is neither.

Two behaviours are pinned here: the stale socket is retried, and a transient
failure that survives the retry is a warning, not an error.
"""

from unittest.mock import Mock, patch

import pytest

from middleware.activity_tracker import ActivityTracker


DISCONNECT = Exception('Server disconnected without sending a response.')


def _run(insert_side_effect):
    """Call _log_event with a client whose insert behaves as given."""
    table = Mock()
    table.insert.return_value = table
    table.execute.side_effect = insert_side_effect
    client = Mock()
    client.table.return_value = table

    tracker = ActivityTracker()
    with patch('middleware.activity_tracker.get_supabase_admin_singleton', return_value=client), \
         patch('middleware.activity_tracker.Config.is_pytest_run', return_value=False), \
         patch('middleware.activity_tracker.logger') as log:
        tracker._log_event(
            user_id='11111111-1111-1111-1111-111111111111',
            session_id='22222222-2222-2222-2222-222222222222',
            event_type='evidence_uploaded', event_data={}, page_url='/api/x',
            referrer_url=None, user_agent='pytest', duration_ms=12)
    return table, log


@pytest.mark.unit
class TestTransientTransportFailures:
    def test_a_stale_socket_is_retried_and_succeeds(self):
        table, log = _run([DISCONNECT, Mock(data=[{'id': 'e1'}])])
        assert table.execute.call_count == 2
        log.error.assert_not_called()

    def test_a_transient_failure_that_survives_retry_is_a_warning_not_an_error(self):
        """logger.error becomes a Sentry issue; warnings stay breadcrumbs."""
        _, log = _run(DISCONNECT)
        log.error.assert_not_called()
        assert log.warning.called
        assert 'evidence_uploaded' in log.warning.call_args[0][0]

    def test_the_request_is_never_disturbed(self):
        """_log_event swallows everything — it runs after the response."""
        _, log = _run(DISCONNECT)  # no exception escapes
        assert log.warning.called


@pytest.mark.unit
class TestRealDefectsStillSurface:
    def test_a_schema_error_keeps_its_error_level(self):
        """A column that doesn't exist is our bug and must reach Sentry."""
        _, log = _run(Exception('column user_activity_events.nope does not exist'))
        assert log.error.called
        log.warning.assert_not_called()

    def test_a_schema_error_is_not_retried(self):
        table, _ = _run(Exception('column user_activity_events.nope does not exist'))
        assert table.execute.call_count == 1
