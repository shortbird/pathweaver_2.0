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


@pytest.mark.unit
class TestTestClientTrafficIsNeverTracked:
    """Flask's test client wrote 138 fake registration_failed rows into prod
    analytics on 2026-08-15 (its default agent is Werkzeug/<version>). The
    pytest guard in _log_event misses non-pytest harnesses, so the UA is
    refused at classification time as well."""

    def _skips(self, user_agent):
        from flask import Flask
        app = Flask(__name__)
        headers = {'User-Agent': user_agent} if user_agent else {}
        with app.test_request_context('/api/auth/register', method='POST',
                                      headers=headers):
            return ActivityTracker()._should_skip_tracking()

    def test_werkzeug_agent_is_skipped(self):
        assert self._skips('Werkzeug/3.1.6') is True

    def test_real_browser_and_mobile_agents_still_track(self):
        assert self._skips('Mozilla/5.0 (Windows NT 10.0; Win64; x64)') is False
        assert self._skips('Optio/21 CFNetwork/3826.500.131 Darwin/24.5.0') is False

    def test_a_missing_agent_still_tracks(self):
        assert self._skips(None) is False


@pytest.mark.unit
class TestFailureEventsCarryTheReason:
    """The 2026-08-24 registration triage had to reconstruct causes from user
    agents and rate-limit configs because failure rows carried only
    {method, status_code}. Failure responses now contribute their error text."""

    def _event_data(self, body, status=400):
        import json as json_mod
        from flask import Flask
        app = Flask(__name__)
        response = app.response_class(
            response=json_mod.dumps(body) if body is not None else 'not json',
            status=status,
            mimetype='application/json' if body is not None else 'text/plain')
        with app.test_request_context('/api/auth/register', method='POST'):
            return ActivityTracker()._extract_event_data(
                __import__('flask').request, response)

    def test_legacy_string_error_is_recorded(self):
        data = self._event_data({'error': 'Too many requests. Please try again later.'},
                                status=429)
        assert data['error'] == 'Too many requests. Please try again later.'
        assert data['status_code'] == 429

    def test_v1_error_object_records_code_and_message(self):
        data = self._event_data(
            {'error': {'code': 'VALIDATION_ERROR', 'message': 'Password too short'}})
        assert data['error'] == 'VALIDATION_ERROR: Password too short'

    def test_message_field_is_the_fallback(self):
        data = self._event_data({'message': 'Email already registered'})
        assert data['error'] == 'Email already registered'

    def test_successful_responses_never_carry_an_error(self):
        data = self._event_data({'message': 'ok'}, status=201)
        assert 'error' not in data

    def test_non_json_bodies_are_tolerated(self):
        data = self._event_data(None)
        assert 'error' not in data
        assert data['status_code'] == 400

    def test_very_long_messages_are_truncated(self):
        data = self._event_data({'error': 'x' * 500})
        assert len(data['error']) == 200
