"""A cut-off AI answer is a salvageable draft, not a bad document.

Sentry OPTIO-BACKEND-65..6E, ticket e086b0c9. A teacher uploaded the iCreate
staff handbook and asked for a short teacher-training quest. The model read it
correctly and started answering:

    {"title": "Teaching the iCreate Way",
     "description": "Explore the heart of iCreate learning ...",
     "tasks": [ {"title": "Write three curious questions for your learners",
                 "description":

...then hit the output ceiling, 350 characters in. Three things went wrong
after that, and these tests pin all three:

  - ``_repair_truncated_json`` could not repair it. It left the dangling
    ``"description":`` in place and emitted every ``]`` before every ``}``,
    producing ``..."description":]}}``.
  - the failure logged eleven separate ``logger.error`` lines, and since
    Sentry opens an issue per distinct message, one bad draft became ten
    issues.
  - the teacher was told "The AI could not find enough to build a quest from
    that" - about a document the AI had understood fine.
"""

from __future__ import annotations

import json
import logging
from unittest.mock import patch

import pytest

from services.base_ai_service import BaseAIService, AIParsingError, AIJsonResult
from services.quest_ai_service import QuestAIService


def _answer(data):
    return AIJsonResult(data=data, model_name='test')


# Verbatim from the Sentry event body (OPTIO-BACKEND-6E).
TRUNCATED_DRAFT = '''{
  "title": "Teaching the iCreate Way",
  "description": "Explore the heart of iCreate learning and practice key teaching tools. You will test out asking great questions, plan a quick hands-on project, and practice connecting with students.",
  "tasks":
 [
    {
      "title": "Write three curious questions for your learners",
      "description":'''


def _parser():
    """A BaseAIService with no Gemini client - only the pure parsing methods."""
    return BaseAIService.__new__(BaseAIService)


def _drafter():
    """A QuestAIService with no Gemini client and no Supabase lookups.

    The subject vocabulary is real, not stubbed: the draft prompt lists the
    diploma subjects a task can earn credit toward, and the normalizer validates
    what comes back against the same list.
    """
    from utils.school_subjects import SCHOOL_SUBJECTS, SCHOOL_SUBJECT_DISPLAY_NAMES

    svc = QuestAIService.__new__(QuestAIService)
    svc.valid_pillars = ['stem', 'wellness', 'communication', 'civics', 'art']
    svc.school_subjects = SCHOOL_SUBJECTS
    svc.school_subject_display_names = SCHOOL_SUBJECT_DISPLAY_NAMES
    return svc


# --------------------------------------------------------------------------
# The payload that actually failed
# --------------------------------------------------------------------------

def test_the_sentry_payload_matches_what_sentry_reported():
    """Guard the fixture itself: 350 chars, 2 open braces, 0 close braces."""
    assert len(TRUNCATED_DRAFT) == 350
    assert TRUNCATED_DRAFT.count('{') == 2
    assert TRUNCATED_DRAFT.count('}') == 0


def test_truncated_draft_is_salvaged_into_a_usable_quest():
    result = _parser().extract_json(TRUNCATED_DRAFT)

    assert result is not None, 'the draft was thrown away instead of repaired'
    assert result['title'] == 'Teaching the iCreate Way'
    assert result['description'].startswith('Explore the heart of iCreate')
    # The one task the model finished naming survives; the half-written
    # description it was cut off inside does not come through as a fragment.
    assert [t['title'] for t in result['tasks']] == [
        'Write three curious questions for your learners']
    assert 'description' not in result['tasks'][0]


def test_repair_closes_in_nesting_order():
    """``{ ... "tasks": [ {`` closes ``}``, ``]``, ``}`` - not ``]``, ``}``, ``}``."""
    repaired = _parser()._repair_truncated_json(TRUNCATED_DRAFT)

    assert repaired is not None
    assert not repaired.endswith(']}}'), 'regressed to the pre-fix close order'
    assert repaired.endswith('}]}')
    json.loads(repaired)  # must parse


# --------------------------------------------------------------------------
# Repair behaviour in general
# --------------------------------------------------------------------------

@pytest.mark.parametrize('cut,expected', [
    ('{"a": 1, "b":',            {'a': 1}),            # dangling key dropped
    ('{"a": 1,',                 {'a': 1}),            # trailing comma dropped
    ('{"a": "hello wor',         {}),                  # partial string dropped
    ('{"t": [{"x": 1}, {"y"',    {'t': [{'x': 1}, {}]}),
    ('{"t": [',                  {'t': []}),
    ('{"a": 1, "b": 12',         {'a': 1}),            # partial number dropped
    ('{"a": tru',                {}),                  # partial literal dropped
    ('{"a": {"b": {"c": [1, 2',  {'a': {'b': {'c': [1]}}}),
    ('[{"a": 1}, {"b"',          [{'a': 1}, {}]),      # array at the root
])
def test_repair_cuts_back_to_the_last_complete_element(cut, expected):
    repaired = _parser()._repair_truncated_json(cut)
    assert repaired is not None, f'gave up on {cut!r}'
    assert json.loads(repaired) == expected


@pytest.mark.parametrize('intact', [
    '{"a": 1}',
    '{"t": [{"x": 1}]}',
    '[1, 2, 3]',
])
def test_intact_json_is_not_repaired(intact):
    """Nothing truncated -> None, so a good parse is never second-guessed."""
    assert _parser()._repair_truncated_json(intact) is None


def test_non_json_is_still_unrepairable():
    assert _parser()._repair_truncated_json('sorry, I cannot help with that') is None


# --------------------------------------------------------------------------
# One failure is one Sentry issue
# --------------------------------------------------------------------------

def test_unparseable_response_logs_exactly_one_error(caplog):
    """Sentry groups by message: N error lines = N issues for one failure."""
    svc = _parser()
    unparseable = 'I am afraid I cannot do that.'

    with patch.object(BaseAIService, 'generate', return_value=unparseable):
        with caplog.at_level(logging.ERROR, logger='services.base_ai_service'):
            assert svc.generate_json('prompt') == {}

    errors = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert len(errors) == 1, (
        f'{len(errors)} error logs = {len(errors)} Sentry issues for one '
        f'failure: {[r.getMessage()[:60] for r in errors]}')

    # The diagnostics the old eleven lines carried still ride along.
    detail = errors[0].ai_json_parse_failure
    assert detail['response_chars'] == len(unparseable)
    assert detail['open_braces'] == 0 and detail['close_braces'] == 0
    assert detail['head'] == unparseable


def test_strict_still_raises_when_there_is_no_json_to_recover():
    svc = _parser()
    with patch.object(BaseAIService, 'generate', return_value='I cannot do that.'):
        with pytest.raises(AIParsingError):
            svc.generate_json('prompt', strict=True)


def test_strict_no_longer_raises_on_merely_truncated_json():
    """Recoverable truncation is recovered, not raised - that is the fix."""
    svc = _parser()
    with patch.object(BaseAIService, 'generate', return_value='{"a": [{"b"'):
        assert svc.generate_json('prompt', strict=True) == {'a': [{}]}


# --------------------------------------------------------------------------
# Valid JSON is parsed as delivered, before any "cleaning"
# --------------------------------------------------------------------------

# The head of the answer Sentry issue 7737031236 recorded (2026-09-17): valid
# JSON whose description quotes a video title in curly quotes, exactly as the
# handbook wrote it. _clean_json_text turns curly quotes into straight ones,
# which made this unparseable AFTER it had arrived parseable.
CURLY_QUOTED_DRAFT = ('{"title": "iCreate Foundations", "description": "13 short trainings.", '
                      '"tasks": [{"title": "Task 1 (Training 1): Why iCreate Exists", '
                      '"description": "Watch \u201cVideo 1: Why iCreate Exists\u201d in the '
                      'Training section, then write what you noticed.", "pillar": "wellness", '
                      '"school_subjects": ["electives"], "xp_value": 50, "is_required": true}]}')


def test_valid_json_with_curly_quotes_inside_a_string_survives():
    result = _parser().extract_json(CURLY_QUOTED_DRAFT)
    assert result is not None, 'valid JSON was broken by the cleaner'
    assert result['tasks'][0]['description'].startswith('Watch \u201cVideo 1')


def test_the_cleaner_is_still_there_for_input_that_needs_it():
    """Curly quotes used AS the delimiters are the case the cleaner exists for."""
    result = _parser().extract_json('{\u201ca\u201d: 1}')
    assert result == {'a': 1}


# --------------------------------------------------------------------------
# What the teacher is told
# --------------------------------------------------------------------------

def test_draft_asks_for_more_than_the_preset_token_budget():
    """2048 has to cover thinking AND the JSON; for a quest it does not."""
    svc = _drafter()
    with patch.object(QuestAIService, 'generate_json_multimodal',
                      return_value=_answer({'title': 't', 'description': 'd',
                                            'tasks': [{'title': 'Do a thing'}]})) as gen:
        svc.draft_quest_from_context('some source material', target_task_count=4)

    assert gen.call_args.kwargs['generation_config']['max_output_tokens'] > 2048


def test_a_verbatim_copy_gets_room_for_thirty_long_tasks():
    """Thirteen tasks came back as five (Molly, 8cdaef04): the answer ran out
    of room at 8192 and the truncation repair kept what was whole. Thirty
    tasks at 300 + 1000 characters is ~13,000 tokens before any thinking."""
    svc = _drafter()
    with patch.object(QuestAIService, 'generate_json_multimodal',
                      return_value=_answer({'title': 't', 'description': 'd',
                                            'tasks': [{'title': 'Do a thing'}]})) as gen:
        svc.draft_quest_from_context('a thirteen-task document', keep_wording=True)

    assert gen.call_args.kwargs['generation_config']['max_output_tokens'] >= 32768


def test_draft_is_generated_in_json_mode():
    """A response schema puts Gemini in JSON mode, where a copied quote mark
    inside a description cannot break the parse (7c8c12a2)."""
    svc = _drafter()
    with patch.object(QuestAIService, 'generate_json_multimodal',
                      return_value=_answer({'title': 't', 'description': 'd',
                                            'tasks': [{'title': 'Do a thing'}]})) as gen:
        svc.draft_quest_from_context('source')

    schema = gen.call_args.kwargs['response_schema']
    assert schema['type'] == 'OBJECT'
    assert set(schema['required']) == {'title', 'description', 'tasks'}
    task = schema['properties']['tasks']['items']
    assert {'title', 'pillar', 'xp_value', 'is_required'} <= set(task['properties'])


def test_a_busy_model_is_reported_as_busy_not_as_a_bad_document():
    from services.base_ai_service import AIServiceOverloadedError
    svc = _drafter()
    with patch.object(QuestAIService, 'generate_json_multimodal',
                      side_effect=AIServiceOverloadedError('503')):
        with pytest.raises(AIServiceOverloadedError):
            svc.draft_quest_from_context('source')


def test_cut_off_answer_does_not_blame_the_document():
    """The old message sent a teacher to re-upload a handbook that was fine."""
    svc = _drafter()
    with patch.object(QuestAIService, 'generate_json_multimodal',
                      side_effect=AIParsingError('Unbalanced braces: 2 open, 0 close')):
        result = svc.draft_quest_from_context('the iCreate handbook text')

    assert result['success'] is False
    assert 'cut off' in result['error']
    assert 'could not find enough' not in result['error']


def test_parse_error_detail_is_not_leaked_to_the_teacher():
    svc = _drafter()
    with patch.object(QuestAIService, 'generate_json_multimodal',
                      side_effect=AIParsingError(
                          'Failed to parse JSON: Preview: {"title": "x...')):
        result = svc.draft_quest_from_context('source')

    assert 'Preview' not in result['error']
    assert '{' not in result['error']


def test_empty_task_list_still_says_not_enough_to_build_from():
    """That sentence is correct here - readable JSON that carried no tasks."""
    svc = _drafter()
    with patch.object(QuestAIService, 'generate_json_multimodal',
                      return_value=_answer({'title': 't', 'description': 'd', 'tasks': []})):
        result = svc.draft_quest_from_context('a grocery list')

    assert result['success'] is False
    assert 'could not find enough' in result['error']
