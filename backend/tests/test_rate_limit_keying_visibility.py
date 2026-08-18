"""
A rate-limit denial must say whether it was keyed by user or by IP.

iCreate family orientation, 2026-08-18: evidence uploads started failing across
the building. The Sentry issue said only "Rate limit exceeded on
evidence_documents.init_task_signed_upload" — no identifier, no keying mode — so
the actual cause (one shared bucket keyed to a Cloudflare edge IP rather than
per user) had to be reconstructed from Render logs.

The endpoint is declared `per_user=True`. It fell back to IP because the
limiter runs BEFORE require_auth and the request carried no token yet — the
mobile client reads the token synchronously, so a resume-from-background or a
mid-flight refresh can fire without one.

These tests pin the diagnosability, not the limit: whichever way a future
denial goes, the event has to say which.
"""

from unittest.mock import MagicMock, patch

import pytest

from app import app
import middleware.rate_limiter as rl


def _capture_sentry():
    """Capture the tags/context a denial would report."""
    captured = {'tags': {}, 'contexts': {}, 'messages': []}
    scope = MagicMock()
    scope.set_tag.side_effect = lambda k, v: captured['tags'].__setitem__(k, v)
    scope.set_context.side_effect = lambda k, v: captured['contexts'].__setitem__(k, v)
    sdk = MagicMock()
    sdk.push_scope.return_value.__enter__ = lambda *_: scope
    sdk.push_scope.return_value.__exit__ = lambda *a: False
    sdk.capture_message.side_effect = lambda m, **k: captured['messages'].append(m)
    return captured, sdk


@pytest.mark.parametrize('identifier,expected', [
    ('user:abc-123:evidence_documents.init_task_signed_upload', 'user'),
    ('172.68.3.193:evidence_documents.init_task_signed_upload', 'ip'),
])
def test_denial_reports_how_the_bucket_was_keyed(identifier, expected):
    captured, sdk = _capture_sentry()
    with patch.dict('sys.modules', {'sentry_sdk': sdk}):
        rl._report_rate_limit_exceeded(
            identifier, 'evidence_documents.init_task_signed_upload', 60, 3600)

    assert captured['tags'].get('rate_limit_keyed_by') == expected
    ctx = captured['contexts'].get('rate_limit') or {}
    assert ctx.get('keyed_by') == expected
    # The identifier itself is what names the actual bucket.
    assert ctx.get('identifier') == identifier


def test_denial_still_reports_endpoint_and_limit():
    captured, sdk = _capture_sentry()
    with patch.dict('sys.modules', {'sentry_sdk': sdk}):
        rl._report_rate_limit_exceeded('1.2.3.4:some.endpoint', 'some.endpoint', 60, 3600)

    assert captured['tags'].get('rate_limit_endpoint') == 'some.endpoint'
    ctx = captured['contexts']['rate_limit']
    assert ctx['limit'] == 60 and ctx['window_seconds'] == 3600
    assert captured['messages'], 'a denial must still produce a Sentry message'


def test_anonymous_request_resolves_to_no_user():
    """The IP fallback itself is correct behaviour — an anonymous request has no
    user to key by. What matters is that it is now visible."""
    with app.test_request_context('/api/x'):
        assert rl._resolve_rate_limit_user_id() is None


def test_resolution_failure_does_not_raise():
    """Telemetry must never break the request it is describing."""
    broken = MagicMock()
    broken.get_effective_user_id.side_effect = RuntimeError('boom')
    with app.test_request_context('/api/x'):
        with patch.dict('sys.modules', {'utils.session_manager': MagicMock(session_manager=broken)}):
            assert rl._resolve_rate_limit_user_id() is None


def test_reporting_survives_sentry_being_unavailable():
    broken = MagicMock()
    broken.push_scope.side_effect = RuntimeError('sentry down')
    with patch.dict('sys.modules', {'sentry_sdk': broken}):
        rl._report_rate_limit_exceeded('1.2.3.4:e', 'e', 60, 3600)  # must not raise
