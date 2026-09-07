"""
Classifying AI/model failures, and turning them into a safe HTTP response.

Google answers several very different situations with the same HTTP 429, and
only the wording separates them:

  - "you are going too fast"            -> transient, worth a retry/fallback
  - "your prepay balance is empty"      -> permanent, account-wide

Reading the second as the first cost a production morning on 2026-09-07: every
request burned its full retry budget and every fallback model before failing,
and the student was told the AI was "experiencing high demand" while the actual
fix was to top up billing (Sentry OPTIO-BACKEND-86/87/88).

The vocabulary lives here rather than in services/base_ai_service.py so that
route modules can classify a failure the service layer already caught and
flattened into a string, without importing the service layer to do it.
"""

from typing import Any, Dict, Tuple

from utils.logger import get_logger

logger = get_logger(__name__)

# Substrings that mark a transient/overload error worth falling back on.
TRANSIENT_ERROR_MARKERS = (
    '503', '500', '429', 'overloaded', 'high demand', 'unavailable',
    'resource exhausted', 'resourceexhausted', 'rate limit', 'deadline',
    'try again later', 'internal error', 'temporarily',
)

# A 429 that means "the account is out of money", not "slow down". These are
# account-wide, so every retry and every fallback model fails the same way.
# Checked BEFORE TRANSIENT_ERROR_MARKERS, which matches on a bare '429'.
CREDITS_EXHAUSTED_MARKERS = (
    'prepayment credit', 'credits are depleted', 'billing account',
    'insufficient credit', 'exceeded your current quota',
    'billing is not active', 'enable billing',
)

# Bad or missing credentials. An operator has to act; a retry never helps.
CREDENTIAL_ERROR_MARKERS = (
    'api key', 'api_key', 'leaked', 'permission denied', 'unauthenticated',
    '403',
)


def is_credits_exhausted_error(error: Any) -> bool:
    """Whether an error (exception or message) means the account is out of credit."""
    msg = str(error).lower()
    return any(marker in msg for marker in CREDITS_EXHAUSTED_MARKERS)


def is_transient_ai_error(error: Any) -> bool:
    """Whether an error (exception or message) looks transient and worth a retry."""
    if is_credits_exhausted_error(error):
        return False
    msg = str(error).lower()
    return any(marker in msg for marker in TRANSIENT_ERROR_MARKERS)


def is_credential_ai_error(error: Any) -> bool:
    """Whether an error points at the API key/permissions rather than capacity."""
    msg = str(error).lower()
    return any(marker in msg for marker in CREDENTIAL_ERROR_MARKERS)


def ai_failure_response(error: Any, fallback: str) -> Tuple[Dict[str, Any], int]:
    """Map an AI failure to a ``(payload, status)`` that is safe to return.

    Service methods catch their own exceptions and hand routes back
    ``{'success': False, 'error': str(e)}``. Routes then did
    ``jsonify(result), 500``, which put the raw upstream text in front of the
    user and called every upstream failure a 500 -- so Google's
    "Your prepayment credits are depleted, go to AI Studio to manage your
    project and billing" was rendered in a student's browser (Sentry
    OPTIO-WEB-W).

    Vendor and billing detail stays in the logs. The status reflects what
    actually happened, and the log level distinguishes "someone must act" from
    "the model was busy" so transient blips stop paging as defects.
    """
    if is_credits_exhausted_error(error):
        logger.error(f"AI credits exhausted -- top up Gemini billing: {error}")
        return {
            'success': False,
            'error': 'AI features are temporarily unavailable. Please try again later.'
        }, 503
    if is_transient_ai_error(error):
        logger.warning(f"Transient AI failure: {error}")
        return {
            'success': False,
            'error': 'The AI is busy right now. Please wait a moment and try again.'
        }, 429
    if is_credential_ai_error(error):
        logger.error(f"AI credential/config failure: {error}")
        return {
            'success': False,
            'error': 'AI features are unavailable. Please contact support.'
        }, 500
    logger.error(f"AI failure: {error}")
    return {'success': False, 'error': fallback}, 500
