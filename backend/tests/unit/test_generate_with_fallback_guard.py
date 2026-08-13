"""
generate_with_fallback() must survive a thinking-only response.

Every caller reads `response.text` directly. On a reasoning model that spends
its whole output budget on thought parts, the real accessor raises
ValueError("Empty text content") rather than returning falsy -- so the usual
`if not response.text` guard raises instead of handling it, and the route 500s.

That risk became live when the platform moved to gemini-3.7-flash (a reasoning
model) from gemini-3.5-flash-lite. These tests pin the guard.
"""

from unittest.mock import MagicMock, patch

import pytest

from services.base_ai_service import (
    BaseAIService,
    AIGenerationError,
    _SafeAIResponse,
)


class _ThinkingOnlyResponse:
    """Mimics a Gemini response with thought parts but no text."""

    def __init__(self):
        self.usage_metadata = MagicMock(prompt_token_count=100, candidates_token_count=0)
        part = MagicMock()
        part.thought = True
        part.text = ''
        candidate = MagicMock()
        candidate.content.parts = [part]
        self.candidates = [candidate]

    @property
    def text(self):
        raise ValueError('Empty text content')


def _text_response(text='{"ok": true}', in_tok=120, out_tok=45):
    response = MagicMock()
    response.text = text
    response.usage_metadata = MagicMock(
        prompt_token_count=in_tok, candidates_token_count=out_tok
    )
    part = MagicMock()
    part.thought = False
    part.text = text
    candidate = MagicMock()
    candidate.content.parts = [part]
    response.candidates = [candidate]
    return response


@pytest.fixture
def service():
    svc = BaseAIService()
    # Avoid touching the real model singleton / network.
    svc._model_override = 'primary-model'
    return svc


@patch('services.ai_gen.generate_with_timeout')
def test_thinking_only_response_falls_back_instead_of_raising(mock_gen, service):
    """A thought-only answer moves to the next model, like a 503 does."""
    mock_gen.side_effect = [_ThinkingOnlyResponse(), _text_response('recovered')]

    with patch.object(service, '_get_model_by_name', return_value=MagicMock()), \
         patch.object(service, '_track_usage_async'):
        result = service.generate_with_fallback('p', fallback_models=['backup-model'])

    assert result.text == 'recovered'
    assert mock_gen.call_count == 2


@patch('services.ai_gen.generate_with_timeout')
def test_callers_reading_dot_text_never_see_valueerror(mock_gen, service):
    """The returned object's `.text` is safe even though the raw one raises."""
    raw = _ThinkingOnlyResponse()
    with pytest.raises(ValueError):
        _ = raw.text  # the underlying accessor really does raise

    mock_gen.side_effect = [raw, _text_response('ok')]
    with patch.object(service, '_get_model_by_name', return_value=MagicMock()), \
         patch.object(service, '_track_usage_async'):
        result = service.generate_with_fallback('p', fallback_models=['backup-model'])

    # The exact pattern every call site uses.
    assert result.text
    assert not (not result.text)


@patch('services.ai_gen.generate_with_timeout')
def test_all_models_thinking_only_raises_generation_error_not_valueerror(mock_gen, service):
    """With no model producing text, callers get a typed error, not ValueError."""
    mock_gen.side_effect = [_ThinkingOnlyResponse(), _ThinkingOnlyResponse()]

    with patch.object(service, '_get_model_by_name', return_value=MagicMock()), \
         patch.object(service, '_track_usage_async'):
        with pytest.raises(AIGenerationError):
            service.generate_with_fallback('p', fallback_models=['backup-model'])


@patch('services.ai_gen.generate_with_timeout')
def test_usage_is_tracked_so_the_cost_chart_sees_these_calls(mock_gen, service):
    """generate_with_fallback traffic must reach ai_usage_logs."""
    mock_gen.return_value = _text_response(in_tok=1000, out_tok=500)

    with patch.object(service, '_get_model_by_name', return_value=MagicMock()), \
         patch.object(service, '_track_usage_async') as track:
        service.generate_with_fallback('p')

    track.assert_called_once()
    kwargs = track.call_args.kwargs
    assert kwargs['input_tokens'] == 1000
    assert kwargs['output_tokens'] == 500


@patch('services.ai_gen.generate_with_timeout')
def test_tracking_failure_never_breaks_a_successful_generation(mock_gen, service):
    """Cost bookkeeping is best-effort; the user's result still comes back."""
    mock_gen.return_value = _text_response('still fine')

    with patch.object(service, '_get_model_by_name', return_value=MagicMock()), \
         patch.object(service, '_track_usage_async', side_effect=RuntimeError('db down')):
        result = service.generate_with_fallback('p')

    assert result.text == 'still fine'


@patch('services.ai_gen.generate_with_timeout')
def test_non_text_attributes_still_reach_the_real_response(mock_gen, service):
    """The wrapper delegates, so usage_metadata/candidates stay reachable."""
    raw = _text_response()
    mock_gen.return_value = raw

    with patch.object(service, '_get_model_by_name', return_value=MagicMock()), \
         patch.object(service, '_track_usage_async'):
        result = service.generate_with_fallback('p')

    assert isinstance(result, _SafeAIResponse)
    assert result.usage_metadata is raw.usage_metadata
    assert result.candidates is raw.candidates
