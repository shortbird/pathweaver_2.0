"""D6 — PostHog error tracking wrapper.

Verifies:
- No-op when POSTHOG_API_KEY is unset (dev default).
- Calls posthog.capture_exception when configured.
- Swallows telemetry failures (must never break a request).
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def _reset_module_state():
    import utils.error_tracking as et

    et._client = None
    et._init_attempted = False
    yield
    et._client = None
    et._init_attempted = False


def test_no_op_when_api_key_unset(monkeypatch):
    from app_config import Config
    import utils.error_tracking as et

    monkeypatch.setattr(Config, "POSTHOG_API_KEY", None, raising=False)

    # Should not raise even with a real exception.
    et.capture_exception(RuntimeError("boom"), user_id="u1", request_info={"path": "/x"})

    assert et._client is None  # stays unconfigured


def test_captures_when_configured(monkeypatch):
    from app_config import Config
    import utils.error_tracking as et

    monkeypatch.setattr(Config, "POSTHOG_API_KEY", "phc_fake", raising=False)
    monkeypatch.setattr(Config, "POSTHOG_HOST", "https://example.invalid", raising=False)

    fake_client = MagicMock()
    fake_client.capture_exception = MagicMock()

    with patch("utils.error_tracking.Posthog" if False else "posthog.Posthog", return_value=fake_client):
        et.capture_exception(
            ValueError("bad"),
            user_id="u1",
            request_info={"method": "POST", "path": "/api/x"},
        )

    fake_client.capture_exception.assert_called_once()
    args, kwargs = fake_client.capture_exception.call_args
    assert kwargs["distinct_id"] == "u1"
    assert kwargs["properties"]["error_type"] == "ValueError"
    assert kwargs["properties"]["error_message"] == "bad"
    assert kwargs["properties"]["request_method"] == "POST"
    assert kwargs["properties"]["request_path"] == "/api/x"


def test_capture_swallows_sdk_errors(monkeypatch):
    from app_config import Config
    import utils.error_tracking as et

    monkeypatch.setattr(Config, "POSTHOG_API_KEY", "phc_fake", raising=False)

    fake_client = MagicMock()
    fake_client.capture_exception = MagicMock(side_effect=RuntimeError("sdk down"))

    with patch("posthog.Posthog", return_value=fake_client):
        # Must not raise.
        et.capture_exception(RuntimeError("app-level"))


def test_falls_back_to_capture_event_if_no_capture_exception(monkeypatch):
    """Older PostHog SDKs don't expose capture_exception; we still record the event."""
    from app_config import Config
    import utils.error_tracking as et

    monkeypatch.setattr(Config, "POSTHOG_API_KEY", "phc_fake", raising=False)

    fake_client = MagicMock(spec=["capture"])  # no capture_exception attribute
    fake_client.capture = MagicMock()

    with patch("posthog.Posthog", return_value=fake_client):
        et.capture_exception(KeyError("k"), user_id=None)

    fake_client.capture.assert_called_once()
    _, kwargs = fake_client.capture.call_args
    assert kwargs["event"] == "$exception"
    assert kwargs["distinct_id"] == "backend-anonymous"
