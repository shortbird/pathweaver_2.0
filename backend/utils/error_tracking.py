"""D6 — PostHog backend error tracking.

Thin wrapper around the PostHog Python SDK. Initialized lazily the first
time ``capture_exception`` is called. When ``POSTHOG_API_KEY`` is unset
(development, local runs) the module silently no-ops, so callers don't
need to check.

Design intent: report *unexpected* server-side exceptions only — i.e. the
500 path in ``middleware/error_handler.py``. User-caused 4xx errors are
noise and stay out.
"""

from __future__ import annotations

from typing import Any, Optional

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

_client: Any = None
_init_attempted = False


def _get_client():
    global _client, _init_attempted
    if _init_attempted:
        return _client
    _init_attempted = True
    api_key = Config.POSTHOG_API_KEY
    if not api_key:
        logger.info("error_tracking: POSTHOG_API_KEY not set — disabled")
        return None
    try:
        from posthog import Posthog

        _client = Posthog(
            project_api_key=api_key,
            host=Config.POSTHOG_HOST,
            # Keep backend overhead minimal; errors still flush on shutdown.
            disable_geoip=True,
        )
        logger.info(f"error_tracking: PostHog initialized (host={Config.POSTHOG_HOST})")
        return _client
    except Exception as exc:
        logger.warning(f"error_tracking: PostHog init failed ({exc}); disabling")
        _client = None
        return None


def capture_exception(
    exc: BaseException,
    *,
    user_id: Optional[str] = None,
    request_info: Optional[dict] = None,
) -> None:
    """Report ``exc`` to PostHog. No-op when unconfigured.

    ``user_id`` is used as the distinct_id when present so errors surface
    per-user in PostHog. ``request_info`` is attached as event properties
    (method/path/ip) for triage.
    """
    client = _get_client()
    if client is None:
        return
    try:
        properties: dict[str, Any] = {
            "error_type": type(exc).__name__,
            "error_message": str(exc),
        }
        if request_info:
            properties.update(
                {
                    f"request_{k}": v
                    for k, v in request_info.items()
                    if v is not None
                }
            )
        # PostHog Python SDK exposes capture_exception in 3.x.
        capture_fn = getattr(client, "capture_exception", None)
        if capture_fn is not None:
            capture_fn(
                exc,
                distinct_id=user_id or "backend-anonymous",
                properties=properties,
            )
        else:
            # Fallback for older SDKs: a normal event with the error details.
            client.capture(
                distinct_id=user_id or "backend-anonymous",
                event="$exception",
                properties=properties,
            )
    except Exception as tracking_exc:
        # Never let telemetry failures break a request.
        logger.warning(f"error_tracking: capture_exception failed ({tracking_exc})")


def shutdown() -> None:
    """Flush queued events at process shutdown."""
    global _client
    if _client is None:
        return
    try:
        _client.shutdown()
    except Exception as exc:
        logger.warning(f"error_tracking: shutdown failed ({exc})")
