"""A Supabase gateway blip is a 503 with Retry-After, not a 500 and a Sentry issue.

Tickets 6d408708, 0185c113, e9832f8d, 1b98e9a7: during a Supabase blip
PostgREST raised APIError({'code': 502, 'message': 'JSON could not be
generated', 'details': '502 Bad Gateway'}). handle_generic_error answered 500,
logged it at error level and captured it in Sentry, so one upstream outage
filed a new ticket for every route it touched.
"""

from unittest.mock import patch

import pytest
from flask import Flask

from middleware.error_handler import ErrorHandler


def _client(exc):
    app = Flask(__name__)
    ErrorHandler().init_app(app)

    @app.route('/boom')
    def boom():
        raise exc

    return app.test_client()


def _gateway_error():
    from postgrest.exceptions import APIError
    return APIError({'code': 502, 'message': 'JSON could not be generated',
                     'details': '502 Bad Gateway', 'hint': None})


@pytest.mark.unit
class TestTransientUpstreamFailure:
    def test_a_postgrest_502_is_a_503_with_retry_after(self):
        with patch('sentry_sdk.capture_exception') as sentry, \
             patch('middleware.error_handler.logger') as log:
            r = _client(_gateway_error()).get('/boom')
        assert r.status_code == 503
        assert int(r.headers['Retry-After']) > 0
        body = r.get_json()
        assert body['error']['code'] == 'EXTERNAL_SERVICE_ERROR'
        # No exception text in a 5xx body.
        assert 'JSON could not be generated' not in r.get_data(as_text=True)
        sentry.assert_not_called()
        log.error.assert_not_called()
        assert log.warning.called

    def test_a_plain_exception_is_still_a_500_and_reaches_sentry(self):
        with patch('sentry_sdk.capture_exception') as sentry:
            r = _client(ValueError('bad state')).get('/boom')
        assert r.status_code == 500
        assert 'Retry-After' not in r.headers
        sentry.assert_called_once()

    def test_a_missing_file_is_still_a_500(self):
        """FileNotFoundError is an OSError, which is_retryable_error treats as
        transient. It is our defect, so it keeps the 500."""
        with patch('sentry_sdk.capture_exception') as sentry:
            r = _client(FileNotFoundError('templates/x.html')).get('/boom')
        assert r.status_code == 500
        sentry.assert_called_once()
