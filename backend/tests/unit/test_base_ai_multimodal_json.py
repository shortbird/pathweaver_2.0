"""Sending Gemini images and PDFs without giving up everything else.

Before this method existed, every multimodal call in the codebase reached past
generate_json() straight to generate_with_timeout -- because generate_json takes
a string. Doing that quietly gave up retries, model fallback, thinking-only
handling and cost tracking, on exactly the calls that cost the most.

Two of these tests are about asking for less rather than failing: a model that
rejects a response schema, and one that cannot open the attached files. Both
answer with a bare 400 that names nothing, and both are recoverable by dropping
what was refused and asking again.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from services.base_ai_service import (
    AICreditsExhaustedError,
    AIParsingError,
    AIServiceOverloadedError,
    BaseAIService,
)

SCHEMA = {'type': 'OBJECT', 'properties': {'ok': {'type': 'BOOLEAN'}}}
PARTS = ['Look at this:', {'mime_type': 'image/jpeg', 'data': b'BYTES'}]


def _response(text, model='primary-model'):
    return SimpleNamespace(text=text, model_name=model, usage_metadata=SimpleNamespace(
        prompt_token_count=120, candidates_token_count=30))


def _service():
    service = BaseAIService.__new__(BaseAIService)
    service._safety_service = None
    service._model_override = None
    return service


def _call(service, side_effect, **kwargs):
    with patch.object(BaseAIService, 'generate_with_fallback',
                      side_effect=side_effect) as gen, \
         patch.object(BaseAIService, 'model_name', 'primary-model'), \
         patch('time.sleep'):
        result = service.generate_json_multimodal(PARTS, max_retries=2, **kwargs)
    return result, gen


@pytest.mark.unit
class TestHappyPath:
    def test_it_parses_the_answer(self):
        result, _ = _call(_service(), [_response('{"ok": true}')])
        assert result.data == {'ok': True}

    def test_it_records_which_model_answered(self):
        """Not self.model_name -- that is wrong the moment a fallback ran."""
        result, _ = _call(_service(), [_response('{"ok": true}', model='fallback-model')])
        assert result.model_name == 'fallback-model'

    def test_it_records_what_the_call_cost(self):
        result, _ = _call(_service(), [_response('{"ok": true}')])
        assert result.input_tokens == 120
        assert result.output_tokens == 30

    def test_a_fenced_answer_is_still_parsed(self):
        result, _ = _call(_service(), [_response('```json\n{"ok": true}\n```')])
        assert result.data == {'ok': True}

    def test_the_schema_is_sent_with_a_json_mime_type(self):
        _, gen = _call(_service(), [_response('{"ok": true}')], response_schema=SCHEMA)
        config = gen.call_args.kwargs['generation_config']
        assert config['response_mime_type'] == 'application/json'
        assert config['response_schema'] is SCHEMA


@pytest.mark.unit
class TestAskingForLess:
    def test_a_rejected_schema_is_dropped_and_the_call_retried(self):
        """Schema support varies by model, and a fallback can refuse what the
        primary took. Detected, not assumed."""
        service = _service()
        result, gen = _call(
            service,
            [Exception('400 Invalid JSON payload: unknown name "response_schema"'),
             _response('{"ok": true}')],
            response_schema=SCHEMA,
            generation_config={'temperature': 0.2})
        assert result.data == {'ok': True}
        assert result.schema_used is False
        retried = gen.call_args.kwargs['generation_config']
        assert 'response_schema' not in retried
        assert retried['temperature'] == 0.2

    def test_dropping_the_schema_is_surfaced_not_swallowed(self):
        result, _ = _call(
            _service(),
            [Exception('400 unknown name "response_schema"'), _response('{"ok": true}')],
            response_schema=SCHEMA)
        assert any('response schema' in note for note in result.notes)

    def test_rejected_files_are_dropped_and_the_text_still_answers(self):
        """One bad file must not cost the reviewer the whole review."""
        result, gen = _call(
            _service(),
            [Exception('400 Request contains an invalid argument: file_data'),
             _response('{"ok": true}')])
        assert result.data == {'ok': True}
        assert gen.call_args.args[0] == ['Look at this:']
        assert any('could not open the attached files' in n for n in result.notes)

    def test_a_text_only_request_does_not_retry_itself_forever(self):
        """Nothing to drop means nothing to retry differently."""
        service = _service()
        with patch.object(BaseAIService, 'generate_with_fallback',
                          side_effect=Exception('400 invalid argument')), \
             patch.object(BaseAIService, 'model_name', 'primary-model'), \
             patch('time.sleep'):
            with pytest.raises(Exception):
                service.generate_json_multimodal(['just text'], max_retries=1)


@pytest.mark.unit
class TestFailures:
    def test_exhausted_credits_are_never_retried(self):
        """Account-wide: every retry and every fallback fails the same way."""
        service = _service()
        with patch.object(BaseAIService, 'generate_with_fallback',
                          side_effect=Exception('429 Your prepayment credits are depleted')), \
             patch.object(BaseAIService, 'model_name', 'primary-model'), \
             patch('time.sleep'):
            with pytest.raises(AICreditsExhaustedError):
                service.generate_json_multimodal(PARTS, max_retries=3)

    def test_a_transient_error_is_retried_then_reported_as_overload(self):
        service = _service()
        with patch.object(BaseAIService, 'generate_with_fallback',
                          side_effect=Exception('503 model is overloaded')) as gen, \
             patch.object(BaseAIService, 'model_name', 'primary-model'), \
             patch('time.sleep'):
            with pytest.raises(AIServiceOverloadedError):
                service.generate_json_multimodal(PARTS, max_retries=2)
        assert gen.call_count == 3

    def test_an_unparseable_answer_is_retried_then_raises(self):
        service = _service()
        with patch.object(BaseAIService, 'generate_with_fallback',
                          return_value=_response('I cannot help with that.')) as gen, \
             patch.object(BaseAIService, 'model_name', 'primary-model'), \
             patch('time.sleep'):
            with pytest.raises(AIParsingError):
                service.generate_json_multimodal(PARTS, max_retries=1)
        assert gen.call_count == 2

    def test_a_recovered_parse_failure_counts_its_attempts(self):
        result, _ = _call(_service(), [_response('nonsense'), _response('{"ok": true}')])
        assert result.attempts == 2

    def test_empty_parts_are_refused_rather_than_sent(self):
        with pytest.raises(Exception):
            _service().generate_json_multimodal([])
