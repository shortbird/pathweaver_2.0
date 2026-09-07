"""Regression guards for AI generation resilience (Sentry OPTIO-BACKEND-M/N/P/K).

The plain ``BaseAIService.generate()`` path used to:
  - only ever hit the PRIMARY model (no fallback), and
  - surface a raw ``"Generation failed after 3 attempts: 503 ... high demand"``
    as a generic 500 to the user.

These tests pin the new behavior:
  - transient (overload/503) errors on the primary model fall back to a
    configured fallback model within the same retry attempt;
  - when every model/attempt is transiently overloaded, generate() raises the
    dedicated ``AIServiceOverloadedError`` (a subclass of AIGenerationError);
  - a persistent NON-transient error still raises plain ``AIGenerationError``;
  - backoff is jittered and never exceeds ``MAX_RETRY_DELAY``.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from services.base_ai_service import (
    BaseAIService,
    AICreditsExhaustedError,
    AIGenerationError,
    AIServiceOverloadedError,
    is_credits_exhausted_error,
    is_transient_ai_error,
)


def _bare_service(fallbacks):
    """Build a BaseAIService instance WITHOUT initializing a real Gemini model."""
    svc = object.__new__(BaseAIService)
    svc._model_override = None
    svc._model_name = 'primary-model'
    # Avoid token-usage logging touching anything fancy.
    svc._safety_service = None
    return svc


def _fake_response(text='generated text'):
    # No usage_metadata attr -> generate() skips token extraction.
    return SimpleNamespace(text=text)


def _model_raising(exc):
    m = MagicMock()
    m.generate_content.side_effect = exc
    return m


def _model_returning(resp):
    m = MagicMock()
    m.generate_content.return_value = resp
    return m


# --------------------------------------------------------------------------
# _is_transient_ai_error
# --------------------------------------------------------------------------

@pytest.mark.parametrize('msg', [
    '503 This model is currently experiencing high demand.',
    'The model is overloaded, please try again later',
    '429 Resource exhausted',
    'UNAVAILABLE: backend temporarily down',
])
def test_transient_errors_detected(msg):
    assert BaseAIService._is_transient_ai_error(Exception(msg)) is True


@pytest.mark.parametrize('msg', [
    'invalid api_key',
    'authentication failed',
    'prompt was blocked by safety filters',
])
def test_non_transient_errors_not_flagged(msg):
    assert BaseAIService._is_transient_ai_error(Exception(msg)) is False


# --------------------------------------------------------------------------
# _retry_sleep_seconds — jitter bounds
# --------------------------------------------------------------------------

def test_retry_sleep_is_jittered_and_capped():
    svc = _bare_service([])
    # Large attempt would blow past the cap without the min(); jitter keeps it
    # in (0, ceiling], and ceiling is capped at MAX_RETRY_DELAY.
    for attempt in range(0, 6):
        delay = svc._retry_sleep_seconds(retry_delay=1.0, attempt=attempt)
        assert 0.0 <= delay <= svc.MAX_RETRY_DELAY


# --------------------------------------------------------------------------
# generate() — model fallback on transient errors
# --------------------------------------------------------------------------

def test_generate_falls_back_to_secondary_model_on_transient_error():
    svc = _bare_service(['fallback-model'])

    primary = _model_raising(Exception('503 high demand'))
    fallback = _model_returning(_fake_response('ok from fallback'))

    def get_model(name):
        return primary if name == 'primary-model' else fallback

    with patch.object(BaseAIService, '_get_model_by_name', side_effect=get_model), \
         patch('services.base_ai_service.Config') as cfg, \
         patch('services.base_ai_service.time.sleep'):
        cfg.GEMINI_FALLBACK_MODELS = ['fallback-model']
        result = svc.generate('prompt', log_tokens=False)

    assert result == 'ok from fallback'
    # Fell back without ever needing a second retry attempt.
    primary.generate_content.assert_called_once()
    fallback.generate_content.assert_called_once()


def test_generate_raises_overloaded_when_all_models_transiently_fail():
    svc = _bare_service(['fallback-model'])

    overloaded = _model_raising(Exception('503 This model is currently experiencing high demand.'))

    with patch.object(BaseAIService, '_get_model_by_name', return_value=overloaded), \
         patch('services.base_ai_service.Config') as cfg, \
         patch('services.base_ai_service.time.sleep'):
        cfg.GEMINI_FALLBACK_MODELS = ['fallback-model']
        with pytest.raises(AIServiceOverloadedError):
            svc.generate('prompt', max_retries=2, log_tokens=False)


def test_generate_raises_plain_error_on_persistent_non_transient_failure():
    svc = _bare_service([])

    # A non-transient error short-circuits retries inside generate()'s except
    # block (api_key/authentication/quota/rate_limit) -> plain AIGenerationError,
    # never AIServiceOverloadedError.
    broken = _model_raising(Exception('invalid api_key supplied'))

    with patch.object(BaseAIService, '_get_model_by_name', return_value=broken), \
         patch('services.base_ai_service.Config') as cfg, \
         patch('services.base_ai_service.time.sleep'):
        cfg.GEMINI_FALLBACK_MODELS = []
        with pytest.raises(AIGenerationError) as exc_info:
            svc.generate('prompt', max_retries=3, log_tokens=False)

    assert not isinstance(exc_info.value, AIServiceOverloadedError)


def test_overloaded_error_is_subclass_of_generation_error():
    # Existing `except AIGenerationError` handlers must still catch the new type.
    assert issubclass(AIServiceOverloadedError, AIGenerationError)


# --------------------------------------------------------------------------
# Credit exhaustion vs. capacity (Sentry OPTIO-BACKEND-86/87/88, 2026-09-07)
# --------------------------------------------------------------------------
#
# Google answers "you are going too fast" and "your prepay balance is empty"
# with the same 429. The second is account-wide and permanent, so treating it
# as transient burned every retry and every fallback model on each request and
# told the student the AI was "experiencing high demand".

GEMINI_CREDITS_DEPLETED = (
    '429 Your prepayment credits are depleted. Please go to AI Studio at '
    'https://ai.studio/projects to manage your project and billing. Learn more '
    'at https://ai.google.dev/gemini-api/docs/billing#prepay.'
)


@pytest.mark.parametrize('msg', [
    GEMINI_CREDITS_DEPLETED,
    '429 You exceeded your current quota, please check your plan and billing details',
    'Billing account for project is not found; please enable billing',
])
def test_credit_exhaustion_is_not_transient(msg):
    assert is_credits_exhausted_error(msg) is True
    # The bare '429' must not win over the billing wording.
    assert is_transient_ai_error(msg) is False
    assert BaseAIService._is_transient_ai_error(Exception(msg)) is False


@pytest.mark.parametrize('msg', [
    '503 This model is currently experiencing high demand.',
    '429 Resource exhausted',
])
def test_capacity_errors_are_still_transient(msg):
    assert is_credits_exhausted_error(msg) is False
    assert is_transient_ai_error(msg) is True


def test_generate_fails_fast_when_credits_are_exhausted():
    """No retry and no fallback model: the balance is empty for all of them."""
    svc = _bare_service(['fallback-model'])
    broke = _model_raising(Exception(GEMINI_CREDITS_DEPLETED))

    with patch.object(BaseAIService, '_get_model_by_name', return_value=broke), \
         patch('services.base_ai_service.Config') as cfg, \
         patch('services.base_ai_service.time.sleep') as sleep:
        cfg.GEMINI_FALLBACK_MODELS = ['fallback-model']
        with pytest.raises(AICreditsExhaustedError):
            svc.generate('prompt', max_retries=3, log_tokens=False)

    # One call, one model, no backoff.
    broke.generate_content.assert_called_once()
    sleep.assert_not_called()


def test_credits_exhausted_message_carries_no_vendor_detail():
    """The student never sees AI Studio, billing, or a top-up instruction."""
    svc = _bare_service([])
    broke = _model_raising(Exception(GEMINI_CREDITS_DEPLETED))

    with patch.object(BaseAIService, '_get_model_by_name', return_value=broke), \
         patch('services.base_ai_service.Config') as cfg, \
         patch('services.base_ai_service.time.sleep'):
        cfg.GEMINI_FALLBACK_MODELS = []
        with pytest.raises(AICreditsExhaustedError) as exc:
            svc.generate('prompt', max_retries=1, log_tokens=False)

    shown = str(exc.value).lower()
    for leak in ('billing', 'ai studio', 'prepayment', 'credits', 'http'):
        assert leak not in shown, f"user-facing message leaked {leak!r}"


def test_credits_exhausted_is_catchable_as_generation_error():
    """Existing `except AIGenerationError` handlers must still catch it, and it
    must NOT masquerade as a capacity problem."""
    assert issubclass(AICreditsExhaustedError, AIGenerationError)
    assert not issubclass(AICreditsExhaustedError, AIServiceOverloadedError)
