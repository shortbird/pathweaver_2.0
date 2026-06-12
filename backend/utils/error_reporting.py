"""
Centralized error reporting helper.

Many `try/except` blocks swallow exceptions and return a fallback ([]/None/
False). Sentry's logging integration only turns `logger.error()`+ into issues,
so any handler that logs at warning/debug — or doesn't log at all — is invisible
(this is exactly how OPTIO-BACKEND-1 stayed dead for months). Use `report_error`
in those handlers to guarantee the failure reaches both the logs AND Sentry,
while still swallowing it so the caller's fallback path is preserved.

    try:
        ...
    except Exception as e:
        report_error(e, "Failed to build quest progress", quest_id=quest_id)
        return []
"""

from utils.logger import get_logger

_logger = get_logger(__name__)


def report_error(exc: Exception, message: str, **context) -> None:
    """Log at error level AND send to Sentry (with context tags), non-fatal.

    Args:
        exc: the caught exception
        message: human-readable description of what failed
        **context: extra key/values attached to the Sentry event as tags/extra
    """
    try:
        _logger.error(f"{message}: {exc}", exc_info=True)
    except Exception:
        pass
    try:
        import sentry_sdk
        with sentry_sdk.new_scope() as scope:
            scope.set_tag("handled", "true")
            for key, value in (context or {}).items():
                # Tags must be short scalars; everything else goes to extra.
                if isinstance(value, (str, int, float, bool)) and len(str(value)) <= 200:
                    scope.set_tag(key, str(value))
                else:
                    scope.set_extra(key, value)
            scope.set_extra("message", message)
            sentry_sdk.capture_exception(exc)
    except Exception:
        # Never let error reporting raise.
        pass
