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
    AIGenerationError,
    AIServiceOverloadedError,
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
