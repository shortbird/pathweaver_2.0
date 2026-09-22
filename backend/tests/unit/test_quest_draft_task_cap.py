"""A "keep my wording" draft says when the 30-task cap cut the list short.

iCreate, ticket d4cdfa81 (Molly): "I uploaded my quest doc and it added all the
quests, but not the descriptions. It would be helpful to add the XP too."

Behind it: a verbatim draft carries at most VERBATIM_MAX_TASKS tasks, and the
cap used to be applied in silence - the prompt says "at most 30" and the
normaliser slices to 30, so a 42-item document arrived as 30 tasks with
nothing on screen saying 12 were missing. The service now reports
`tasks_truncated` and `source_task_count`, and the route carries both.

What the code can know is limited, and these tests pin that honesty too: tasks
the model sent past the cap are counted exactly; tasks it never wrote are known
only through its own `source_task_count`; with neither, nothing is claimed.
"""

from __future__ import annotations

import re
from unittest.mock import patch

import pytest

from services.base_ai_service import AIJsonResult
from services.quest_ai_service import QuestAIService

CAP = QuestAIService.VERBATIM_MAX_TASKS


def _tasks(n):
    return [{'title': f'Quest {i}', 'description': '', 'pillar': 'art',
             'xp_value': 50, 'is_required': True} for i in range(n)]


def _run(keep_wording, tasks, source_task_count=None, task_count=4):
    service = QuestAIService()
    data = {'title': 'T', 'description': 'D', 'tasks': tasks}
    if source_task_count is not None:
        data['source_task_count'] = source_task_count
    with patch.object(service, 'generate_json_multimodal',
                      return_value=AIJsonResult(data=data, model_name='test')) as gen:
        result = service.draft_quest_from_context(
            'Quest 1\nQuest 2\nQuest 3', target_task_count=task_count,
            keep_wording=keep_wording)
    return gen.call_args[0][0][0], result


def _flat(text):
    return re.sub(r'\s+', ' ', text)


@pytest.mark.unit
class TestTheServiceReportsTheCap:
    def test_tasks_the_model_sent_past_the_cap_are_counted_exactly(self):
        """d4cdfa81: 42 items used to arrive as 30 with no word said."""
        _, result = _run(True, _tasks(42))
        assert len(result['quest']['tasks']) == CAP
        assert result['tasks_truncated'] is True
        assert result['source_task_count'] == 42

    def test_a_model_that_obeyed_the_cap_reports_the_count_it_read(self):
        # The prompt says "at most 30", so the usual shape is 30 tasks plus
        # the model's own total. That total is the only evidence of the rest.
        _, result = _run(True, _tasks(CAP), source_task_count=42)
        assert len(result['quest']['tasks']) == CAP
        assert result['tasks_truncated'] is True
        assert result['source_task_count'] == 42

    def test_a_list_under_the_cap_is_not_truncated(self):
        _, result = _run(True, _tasks(12), source_task_count=12)
        assert result['tasks_truncated'] is False
        assert result['source_task_count'] == 12

    def test_no_count_and_no_overflow_claims_nothing(self):
        # Exactly 30 back and no count: the source may have had more, but the
        # code cannot know, so it does not warn.
        _, result = _run(True, _tasks(CAP))
        assert result['tasks_truncated'] is False
        assert result['source_task_count'] == CAP

    def test_an_unreadable_count_falls_back_to_what_was_sent(self):
        _, result = _run(True, _tasks(35), source_task_count='lots')
        assert result['tasks_truncated'] is True
        assert result['source_task_count'] == 35

    def test_the_composed_mode_never_reports_a_cut(self):
        # There the teacher picked the count; trimming to it is the request.
        _, result = _run(False, _tasks(12), source_task_count=12, task_count=4)
        assert len(result['quest']['tasks']) == 4
        assert result['tasks_truncated'] is False
        assert result['source_task_count'] is None


@pytest.mark.unit
class TestThePromptAsksForTheCount:
    def test_verbatim_asks_for_the_total_the_source_lists(self):
        prompt = _flat(_run(True, _tasks(1))[0])
        assert 'source_task_count:' in prompt
        assert f'past the first {CAP}' in prompt

    def test_the_composed_prompt_does_not(self):
        prompt = _flat(_run(False, _tasks(1))[0])
        assert 'source_task_count' not in prompt

    def test_the_verbatim_description_rule_is_unchanged(self):
        # The owner kept this rule: a doc of quest names yields blank
        # descriptions, and the UI explains why instead.
        prompt = _flat(_run(True, _tasks(1))[0])
        assert 'If the source has none, leave it empty rather than writing one.' in prompt

    def test_the_schema_offers_the_count_without_requiring_it(self):
        schema = QuestAIService.DRAFT_RESPONSE_SCHEMA
        assert schema['properties']['source_task_count'] == {'type': 'INTEGER'}
        assert 'source_task_count' not in schema['required']


def _call_route(service_result, body):
    from routes.sis import quest_drafts as qd
    view = qd.generate
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    from flask import Flask
    app = Flask(__name__)
    with app.test_request_context('/api/sis/quest-drafts/generate', method='POST', json=body), \
         patch('services.quest_ai_service.QuestAIService') as svc:
        svc.return_value.draft_quest_from_context.return_value = service_result
        resp = view('teacher-1')
    return resp.get_json()


@pytest.mark.unit
class TestTheRouteCarriesTheReport:
    QUEST = {'title': 'T', 'description': 'D', 'tasks': []}

    def test_the_cap_fields_reach_the_wire(self):
        body = _call_route({'success': True, 'quest': self.QUEST,
                            'tasks_truncated': True, 'source_task_count': 42},
                           {'context': 'Quest 1', 'keep_wording': True})
        assert body['tasks_truncated'] is True
        assert body['source_task_count'] == 42
        # The source-text cut-off is a different key and stays independent.
        assert body['truncated'] is False

    def test_the_fields_default_when_the_service_omits_them(self):
        body = _call_route({'success': True, 'quest': self.QUEST},
                           {'context': 'Quest 1'})
        assert body['tasks_truncated'] is False
        assert body['source_task_count'] is None
