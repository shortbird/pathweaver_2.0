"""A teacher's material can be entered as written, not rewritten.

iCreate, 2026-09-05 (edb43711): "on Building a quest from something I have.
Can we check a box that makes it so it's just entered into the quest as we
have it written? Instead of AI changing what I uploaded? I like the idea of it
creating quests from the material, but it would be nice if it could also just
take it from my already planned tasks without changing it."

The house style is what did the rewriting: "exactly N tasks", "5-8 words, ONE
idea", "READING LEVEL: 5th-6th grade". With keep_wording those rules leave the
prompt, the count follows the source, and the normaliser's cap is lifted to
match. These tests pin the prompt's SHAPE for both modes, not the model's
output.
"""

from __future__ import annotations

import re
from unittest.mock import patch

from services.quest_ai_service import QuestAIService


def _flat(text: str) -> str:
    return re.sub(r'\s+', ' ', text)


TWELVE_TASKS = [{'title': f'Step {i}', 'description': f'Do step {i}', 'pillar': 'art',
                 'xp_value': 25, 'is_required': True} for i in range(12)]


def _run(keep_wording: bool, tasks=None, task_count: int = 4):
    service = QuestAIService()
    with patch.object(service, 'generate_json', return_value={
        'title': 'T', 'description': 'D', 'tasks': tasks or TWELVE_TASKS[:1],
    }) as gen:
        result = service.draft_quest_from_context(
            'Week 1: Read the handbook. Week 2: Visit the makerspace.',
            target_task_count=task_count, keep_wording=keep_wording)
    assert gen.call_count == 1
    return gen.call_args[0][0], result


class TestKeepWordingChangesThePrompt:
    def test_the_house_style_that_rewrote_material_is_gone(self):
        prompt = _flat(_run(True)[0])
        assert 'exactly 4 tasks' not in prompt
        assert '5-8 words, ONE idea' not in prompt
        assert 'READING LEVEL' not in prompt
        assert 'plain action verb' not in prompt

    def test_titles_and_descriptions_are_copied_not_composed(self):
        prompt = _flat(_run(True)[0])
        assert 'copied word for word' in prompt
        assert 'Do not rephrase, shorten, re-verb or improve it' in prompt
        assert 'Every title and description must be text that appears in the source' in prompt

    def test_the_count_follows_the_source_not_the_picker(self):
        prompt = _flat(_run(True, task_count=3)[0])
        assert 'ONE task per activity, step or assignment the source lists' in prompt
        assert f'at most {QuestAIService.VERBATIM_MAX_TASKS}' in prompt
        assert 'exactly 3 tasks' not in prompt

    def test_the_model_still_fills_in_what_the_source_cannot_say(self):
        prompt = _flat(_run(True)[0])
        for fragment in ('pillar: one of [', 'school_subjects:', 'xp_value:', 'is_required:'):
            assert fragment in prompt


class TestKeepWordingLiftsTheCap:
    def test_a_long_source_keeps_every_task(self):
        _, result = _run(True, tasks=TWELVE_TASKS)
        assert len(result['quest']['tasks']) == 12

    def test_the_default_mode_still_trims_to_the_requested_count(self):
        _, result = _run(False, tasks=TWELVE_TASKS, task_count=4)
        assert len(result['quest']['tasks']) == 4


class TestTheDefaultModeIsUntouched:
    def test_house_style_is_still_there_when_the_box_is_not_ticked(self):
        prompt = _flat(_run(False)[0])
        assert 'exactly 4 tasks' in prompt
        assert '5-8 words, ONE idea' in prompt
        assert 'READING LEVEL: 5th-6th grade' in prompt
        assert 'copied word for word' not in prompt
