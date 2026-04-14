"""E2 — central timeout helper for Gemini generate_content calls.

All new code should call ``generate_with_timeout(model, prompt)`` rather than
``model.generate_content(prompt)`` directly. The raw method on a
``GenerativeModel`` has a very long default timeout that can tie up a
Gunicorn worker indefinitely when the API hangs.

Existing call sites are being migrated incrementally; see
``tests/unit/test_ai_timeout_present.py`` for the baseline tracker.
"""

from __future__ import annotations

from typing import Any

from app_config import Config


def generate_with_timeout(model: Any, prompt: Any, **kwargs: Any) -> Any:
    """Call ``model.generate_content`` with a forced request timeout.

    The timeout defaults to ``Config.AI_REQUEST_TIMEOUT`` (60s by default) and
    can be overridden per-call via the ``timeout`` kwarg.
    """
    timeout = kwargs.pop("timeout", None) or Config.AI_REQUEST_TIMEOUT

    # Lazy import — we don't want ``google.generativeai`` to be a hard
    # dependency of services that never actually call this helper.
    from google.generativeai.types import RequestOptions

    request_options = kwargs.pop("request_options", None) or RequestOptions(timeout=timeout)
    return model.generate_content(prompt, request_options=request_options, **kwargs)
