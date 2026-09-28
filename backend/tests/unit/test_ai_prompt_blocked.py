"""A prompt the model provider refuses is not a transient empty answer.

Ticket dac8264c (Sentry optio-backend 7756666921, "Gemini response has no
candidates", on POST /api/evidence/documents/<id>/upload-finalize): a
student's photo went to the upload classifier, Gemini answered with zero
candidates and a prompt_feedback.block_reason, and the base service treated
that like a thinking-only empty. It retried the same blocked image on every
fallback model, logged each at error level (one Sentry issue per photo), and
the gate then let the upload through as if it had been judged clear.

Decision (Tanner): a photo the provider blocks is LET THROUGH, but recorded
as unscreened, blocked by the provider, so someone can review it later. Not
a hold.

What must stay true:

  * no candidates + a block_reason -> AIPromptBlockedError at once: no
    fallback model, a warning log, no error log
  * no candidates and no block_reason -> still an empty answer that moves to
    the next model, still logged at error level
  * the error is an AIGenerationError, so every existing handler catches it
  * judge() maps it to VERDICT_PROVIDER_BLOCKED, which still counts as failed
    for the text screen (posts pending, like an outage)
  * check_image() allows the upload as KIND_UNSCREENED and writes the record;
    a failed record write never refuses the upload
  * clear / flagged / error verdicts are unchanged
"""

import io
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock, patch

import pytest
from PIL import Image

from services import csam_match_service as cm
from services import peer_text_screen_service as ts
from services import upload_safety_service as gate
from services.base_ai_service import (
    AIGenerationError,
    AIJsonResult,
    AIPromptBlockedError,
    BaseAIService,
)
from services.peer_text_screen_service import ScreenResult


# ---------------------------------------------------------------------------
# Response doubles
# ---------------------------------------------------------------------------

class _Enum:
    """Stands in for the SDK's BlockReason enum member."""

    def __init__(self, name, value):
        self.name = name
        self.value = value

    def __bool__(self):
        return bool(self.value)


_PROHIBITED = _Enum('PROHIBITED_CONTENT', 4)


def _blocked(reason=_PROHIBITED):
    """What Gemini returns when it refuses the prompt: no candidates at all."""
    return SimpleNamespace(
        candidates=[],
        prompt_feedback=SimpleNamespace(block_reason=reason),
        usage_metadata=SimpleNamespace(prompt_token_count=1100, candidates_token_count=0),
        text='',
    )


def _unexplained_empty():
    return SimpleNamespace(
        candidates=[],
        prompt_feedback=SimpleNamespace(block_reason=_Enum('BLOCK_REASON_UNSPECIFIED', 0)),
        usage_metadata=None,
        text='',
    )


def _text_response(text='{"verdict": "clear", "reasons": [], "kinds": []}'):
    response = MagicMock()
    response.text = text
    response.usage_metadata = MagicMock(prompt_token_count=10, candidates_token_count=5)
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
    svc._model_override = 'primary-model'
    return svc


def _png():
    out = io.BytesIO()
    Image.new('RGB', (16, 16), (10, 200, 30)).save(out, format='PNG')
    return out.getvalue()


# ---------------------------------------------------------------------------
# The base service
# ---------------------------------------------------------------------------

@patch('services.ai_gen.generate_with_timeout')
def test_a_blocked_prompt_is_not_retried_on_fallback_models(mock_gen, service):
    """Ticket dac8264c: "Gemini response has no candidates" on upload-finalize.
    A no-candidate response with a block_reason stops at the first model,
    logs a warning (not an error, so no Sentry issue) and raises a typed,
    non-transient error carrying the reason."""
    mock_gen.side_effect = [_blocked(), _text_response('never reached')]

    with patch.object(service, '_get_model_by_name', return_value=MagicMock()), \
         patch.object(service, '_track_usage_async'), \
         patch('services.base_ai_service.logger') as log:
        with pytest.raises(AIPromptBlockedError) as err:
            service.generate_with_fallback('p', fallback_models=['backup-a', 'backup-b'])

    assert mock_gen.call_count == 1
    assert err.value.block_reason == 'PROHIBITED_CONTENT'
    assert isinstance(err.value, AIGenerationError)
    log.error.assert_not_called()
    assert any('block_reason=PROHIBITED_CONTENT' in str(c) for c in log.warning.call_args_list)


@patch('services.ai_gen.generate_with_timeout')
def test_an_unexplained_empty_still_falls_back_and_logs_an_error(mock_gen, service):
    """No block_reason: the old path. The next model is tried, and the empty
    is still an error-level log because nothing explains it."""
    mock_gen.side_effect = [_unexplained_empty(), _text_response('recovered')]

    with patch.object(service, '_get_model_by_name', return_value=MagicMock()), \
         patch.object(service, '_track_usage_async'), \
         patch('services.base_ai_service.logger') as log:
        result = service.generate_with_fallback('p', fallback_models=['backup-a'])

    assert result.text == 'recovered'
    assert mock_gen.call_count == 2
    log.error.assert_any_call('Gemini response has no candidates')


@patch('services.ai_gen.generate_with_timeout')
def test_the_multimodal_json_call_does_not_retry_or_drop_the_image(mock_gen, service):
    """generate_json_multimodal must not spend its retries on a refusal, and
    must never answer it by judging the text without the picture."""
    mock_gen.side_effect = [_blocked('SAFETY'), _text_response()]
    image = {'mime_type': 'image/jpeg', 'data': b'x'}

    with patch.object(service, '_get_model_by_name', return_value=MagicMock()), \
         patch.object(service, '_track_usage_async'), \
         patch('services.base_ai_service.time.sleep'):
        with pytest.raises(AIPromptBlockedError) as err:
            service.generate_json_multimodal(['prompt', image], max_retries=2)

    assert err.value.block_reason == 'SAFETY'
    assert mock_gen.call_count == 1


@pytest.mark.parametrize('response,expected', [
    (_blocked(_Enum('IMAGE_SAFETY', 6)), 'IMAGE_SAFETY'),
    (_blocked('OTHER'), 'OTHER'),
    (_unexplained_empty(), None),
    (SimpleNamespace(candidates=[]), None),                         # no prompt_feedback
    (SimpleNamespace(candidates=[], prompt_feedback=None), None),
    (SimpleNamespace(candidates=['c'], prompt_feedback=SimpleNamespace(block_reason='SAFETY')), None),
    (MagicMock(candidates=[]), None),                               # a loose test double
])
def test_the_block_reason_is_read_defensively(response, expected):
    assert BaseAIService._prompt_block_reason(response) == expected


# ---------------------------------------------------------------------------
# The screen service
# ---------------------------------------------------------------------------

def _screen_service(**kwargs):
    svc = ts.UploadScreenService.__new__(ts.UploadScreenService)
    svc.generate_json_multimodal = Mock(**kwargs)
    svc._safe_model_name = Mock(return_value='gemini-test')
    return svc


def test_judge_maps_a_refusal_to_the_provider_blocked_verdict():
    svc = _screen_service(side_effect=AIPromptBlockedError('refused', 'PROHIBITED_CONTENT'))
    out = svc.judge('Task evidence: a.jpg', [{'mime_type': 'image/jpeg', 'data': b'x'}],
                    prompt=svc.UPLOAD_PROMPT)
    assert out.verdict == ts.VERDICT_PROVIDER_BLOCKED
    assert out.provider_blocked and out.failed and not out.flagged
    assert out.block_reason == 'PROHIBITED_CONTENT'
    # A text the provider refuses posts pending, exactly like an outage.
    assert out.status == 'pending'


@pytest.mark.parametrize('answer,verdict', [
    ({'verdict': 'clear', 'reasons': [], 'kinds': []}, ts.VERDICT_CLEAR),
    ({'verdict': 'flagged', 'reasons': ['nudity'], 'kinds': ['sexual']}, ts.VERDICT_FLAGGED),
])
def test_judge_verdicts_are_unchanged(answer, verdict):
    svc = _screen_service(return_value=AIJsonResult(data=answer, model_name='gemini-test'))
    out = svc.judge('x')
    assert out.verdict == verdict and not out.provider_blocked and out.block_reason is None


def test_any_other_failure_is_still_the_error_verdict():
    svc = _screen_service(side_effect=AIGenerationError('503 overloaded'))
    out = svc.judge('x')
    assert out.verdict == ts.VERDICT_ERROR and out.failed and not out.provider_blocked


# ---------------------------------------------------------------------------
# The upload gate
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _no_earlier_hold():
    with patch.object(gate, '_earlier_hold', return_value=None):
        yield


def _gate_with(result, repo):
    svc = Mock()
    svc.UPLOAD_PROMPT = 'UPLOAD {text}'
    svc.KIND_CONTACT_DETAILS = 'contact_details'
    svc.judge.return_value = result
    return (
        patch.object(cm, 'match', return_value=cm.MatchResult(False, 'off', skipped=True)),
        patch.object(gate, '_is_student', return_value=True),
        patch('services.peer_text_screen_service.UploadScreenService', return_value=svc),
        patch('repositories.peer_text_screen_repository.PeerTextScreenRepository',
              return_value=repo),
        patch.object(gate, '_hold'),
    )


def test_a_provider_blocked_upload_is_allowed_and_recorded_as_unscreened():
    """Ticket dac8264c: the blocked photo goes up, is not called clear, is
    not held, and leaves a record naming the provider's reason."""
    repo = Mock()
    repo.record_unscreened_upload.return_value = 'log-1'
    result = ScreenResult(ts.VERDICT_PROVIDER_BLOCKED, [], 'gemini-test',
                          block_reason='PROHIBITED_CONTENT')
    a, b, c, d, hold = _gate_with(result, repo)
    with a, b, c, d, hold as held:
        out = gate.check_image(_png(), 'image/png', user_id='kid', purpose='evidence',
                               filename='volcano.png')

    assert out.allowed and out.kind == gate.KIND_UNSCREENED
    assert out.unscreened_id == 'log-1'
    assert out.hold_id is None and out.message is None
    held.assert_not_called()
    kwargs = repo.record_unscreened_upload.call_args.kwargs
    assert kwargs['author_id'] == 'kid'
    assert kwargs['purpose'] == 'evidence'
    assert kwargs['filename'] == 'volcano.png'
    assert kwargs['block_reason'] == 'PROHIBITED_CONTENT'
    assert kwargs['model'] == 'gemini-test'
    assert len(kwargs['sha256']) == 64


def test_a_failed_record_write_still_lets_the_upload_through():
    repo = Mock()
    repo.record_unscreened_upload.side_effect = RuntimeError('db down')
    result = ScreenResult(ts.VERDICT_PROVIDER_BLOCKED, [], 'm', block_reason='SAFETY')
    a, b, c, d, hold = _gate_with(result, repo)
    with a, b, c, d, hold:
        out = gate.check_image(_png(), 'image/png', user_id='kid', purpose='avatar')
    assert out.allowed and out.kind == gate.KIND_UNSCREENED and out.unscreened_id is None


@pytest.mark.parametrize('result,allowed,kind', [
    (ScreenResult(ts.VERDICT_CLEAR), True, gate.KIND_CLEAR),
    (ScreenResult(ts.VERDICT_ERROR), True, gate.KIND_CLEAR),
    (ScreenResult(ts.VERDICT_FLAGGED, ['nudity'], 'm', ['sexual']), False, gate.KIND_HELD),
])
def test_other_verdicts_write_no_unscreened_record(result, allowed, kind):
    repo = Mock()
    a, b, c, d, hold = _gate_with(result, repo)
    with a, b, c, d, hold as held:
        held.return_value = 'hold-1'
        out = gate.check_image(_png(), 'image/png', user_id='kid', purpose='evidence')
    assert out.allowed is allowed and out.kind == kind
    repo.record_unscreened_upload.assert_not_called()


# ---------------------------------------------------------------------------
# The record
# ---------------------------------------------------------------------------

def test_the_record_is_a_queryable_ai_usage_logs_row():
    from repositories.peer_text_screen_repository import (
        UNSCREENED_PROVIDER_BLOCKED,
        PeerTextScreenRepository,
    )
    client = MagicMock()
    client.table.return_value.insert.return_value.execute.return_value.data = [{'id': 'log-9'}]
    repo = PeerTextScreenRepository(client=client)

    out = repo.record_unscreened_upload(author_id='kid', purpose='evidence',
                                        filename='volcano.png', sha256='ab' * 32,
                                        block_reason='PROHIBITED_CONTENT', model='gemini-test')

    assert out == 'log-9'
    client.table.assert_called_with('ai_usage_logs')
    row = client.table.return_value.insert.call_args.args[0]
    assert row['service_name'] == 'UploadScreenService'
    assert row['user_id'] == 'kid'
    assert row['success'] is False
    assert row['model_name'] == 'gemini-test'
    assert row['error_message'].startswith(UNSCREENED_PROVIDER_BLOCKED)
    assert 'block_reason=PROHIBITED_CONTENT' in row['error_message']
    assert 'purpose=evidence' in row['error_message']
    assert 'filename=volcano.png' in row['error_message']
