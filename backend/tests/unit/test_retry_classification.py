"""httpx's transport failures have to count as retryable.

Sentry OPTIO-BACKEND-6M, 2026-08-17:

    RemoteProtocolError: Server disconnected
      routes/evidence_documents.py, in init_task_signed_upload

That is the ordinary stale-keepalive failure: a pooled socket the far end had
already closed. `is_retryable_error` missed it twice over. httpx hangs its
errors off its own HTTPError tree, so `RemoteProtocolError` is not a
`ConnectionError` or an `IOError` and the type check did not match; and its
message -- "Server disconnected without sending a response" -- contains none of
'connection', 'timeout' or 'broken pipe', so the substring check did not match
either. The result was that the single most routine transient failure this app
sees was classified permanent and re-raised on the first attempt, including
inside the `with_connection_retry` calls that exist to survive exactly this.
"""

import httpx
import pytest

from utils.retry_handler import RETRYABLE_EXCEPTIONS, is_retryable_error


@pytest.mark.unit
class TestHttpxTransportErrorsAreRetryable:
    def test_the_error_from_the_sentry_report(self):
        assert is_retryable_error(
            httpx.RemoteProtocolError('Server disconnected without sending a response.')
        )

    @pytest.mark.parametrize('error', [
        httpx.ConnectError('failed to connect'),
        httpx.ConnectTimeout('timed out'),
        httpx.ReadTimeout('timed out'),
        httpx.PoolTimeout('no free connection'),
        httpx.ReadError('read failed'),
        httpx.WriteError('write failed'),
    ])
    def test_the_rest_of_the_transient_family(self, error):
        assert is_retryable_error(error)

    def test_the_message_pattern_catches_a_wrapped_one(self):
        """Client libraries wrap httpx errors in their own exception types, and
        then only the message survives."""
        assert is_retryable_error(RuntimeError('Server disconnected without sending a response.'))


@pytest.mark.unit
class TestPermanentFailuresStayPermanent:
    def test_a_malformed_request_is_not_retried(self):
        """LocalProtocolError is our own bug. Retrying it burns the caller's
        latency budget three times to produce the same failure."""
        assert not is_retryable_error(httpx.LocalProtocolError('bad header'))
        assert not isinstance(httpx.LocalProtocolError('x'), RETRYABLE_EXCEPTIONS)

    def test_a_bad_url_is_not_retried(self):
        assert not is_retryable_error(httpx.UnsupportedProtocol('gopher://'))

    def test_an_ordinary_application_error_is_not_retried(self):
        assert not is_retryable_error(ValueError('student not found'))


@pytest.mark.unit
def test_h2_refusing_a_raced_stream_is_retried():
    """Tickets a05d9630 / 581b78db (Sentry, 2026-09-28): two threads racing the
    shared HTTP/2 connection raise h2's StreamIDTooLowError unwrapped. Nothing
    was sent, so a second attempt is safe, and it used to be refused one."""
    import h2.exceptions
    assert is_retryable_error(h2.exceptions.StreamIDTooLowError(9, 9))
