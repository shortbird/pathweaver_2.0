"""The teacher's own instructions outrank the house style in the draft prompt.

Ticket b0818709 (iCreate, 2026-08-17), building the staff-training quest from
the handbook. Four of the seven complaints were one bug: the teacher's notes
were interpolated ABOVE the task specification, and the specific rules below
simply won.

    "I told it to make the first task to read part 1 & 2 of the handbook -
     it put in 'write notes from the teacher handbook'"

        ...because the spec listed the allowed opening verbs and Read was not
        among them, so the model picked the nearest one that was.

    "I told it to make the first task required, but it made ALL the tasks
     required."

        ...because the spec said is_required is "true for the core of the
        unit", and an instruction about ONE task was generalised to every task.

    "I had tasks already selected in one of my docs but it didn't pull from
     that doc at all, it just adjusted to what it wanted."

        ...because the title rule ("5-8 words, ONE idea") rewrote tasks the
        source had already named.

    "I told it to give all the tasks 5 XP, it gave them all 25."

        ...which is NOT the model disobeying: 25 is the platform floor, in
        clean_task's max(MIN_XP, xp) and in the form's min=25. The prompt now
        says so outright instead of leaving it to look like a failure.

These tests pin the prompt's SHAPE, not the model's output — the ordering is
the fix, and a later edit that moves the notes back above the spec would undo
it silently.
"""

from __future__ import annotations

import re
from unittest.mock import patch

import pytest

from services.quest_ai_service import QuestAIService


def _flat(text: str) -> str:
    """Prompt text with its line wrapping collapsed.

    The assertions here are about what the prompt SAYS. Where a sentence happens
    to break across lines is formatting, and pinning it would fail the next time
    somebody rewraps a paragraph.
    """
    return re.sub(r'\s+', ' ', text)


def _prompt_for(notes: str = "", context: str = "The iCreate handbook, part 1 and part 2.") -> str:
    """The prompt draft_quest_from_context would send, without sending it."""
    service = QuestAIService()
    with patch.object(service, 'generate_json', return_value={
        'title': 'T', 'description': 'D',
        'tasks': [{'title': 'Read part 1', 'description': 'x',
                   'pillar': 'art', 'xp_value': 25, 'is_required': True}],
    }) as gen:
        service.draft_quest_from_context(context, notes=notes, target_task_count=4)
    assert gen.call_count == 1
    return gen.call_args[0][0]


class TestNotesOutrankTheSpec:
    def test_notes_appear_after_the_task_specification(self):
        prompt = _prompt_for(notes="Make the first task read part 1 & 2 of the handbook.")
        spec_at = prompt.index('is_required')
        notes_at = prompt.index('Make the first task read part 1 & 2')
        assert notes_at > spec_at, (
            "the teacher's instructions must come after the house style, or the "
            "specific rules below them win"
        )

    def test_notes_are_marked_as_overriding(self):
        prompt = _prompt_for(notes="All tasks 5 XP.")
        assert 'OVERRIDE' in prompt

    def test_an_instruction_about_one_task_is_not_generalised(self):
        prompt = _flat(_prompt_for(notes="Make the first task required."))
        assert 'Do not generalise an instruction about one task to every task.' in prompt

    def test_no_notes_leaves_no_empty_override_block(self):
        prompt = _prompt_for(notes="")
        assert 'OVERRIDE' not in prompt
        assert "THE TEACHER'S OWN INSTRUCTIONS" not in prompt

    def test_whitespace_only_notes_count_as_none(self):
        assert 'OVERRIDE' not in _prompt_for(notes="   \n  ")


class TestTheVerbIsNotSwapped:
    def test_read_is_an_allowed_opening_verb(self):
        # The exact substitution that produced "write notes from the teacher
        # handbook" from "read part 1 & 2 of the handbook".
        prompt = _prompt_for()
        verbs = prompt[prompt.index('plain action verb'):prompt.index('5-8 words')]
        assert 'Read' in verbs

    def test_the_model_is_told_not_to_substitute_a_different_activity(self):
        prompt = _flat(_prompt_for())
        assert 'if the task is to read something, the task is to read it' in prompt

    def test_source_tasks_keep_their_own_wording(self):
        prompt = _flat(_prompt_for())
        assert "in the source's own words and order" in prompt


class TestTheXpFloorIsExplained:
    def test_the_prompt_states_the_floor_rather_than_silently_clamping(self):
        prompt = _flat(_prompt_for(notes="Give every task 5 XP."))
        assert '25 is a hard floor' in prompt

    def test_the_floor_matches_what_the_backend_actually_enforces(self):
        from services.sis_quest_authoring import MIN_XP, clean_task

        assert MIN_XP == 25
        # The claim in the prompt has to be true of the code that stores it.
        stored = clean_task({'title': 'Read part 1', 'xp_value': 5}, 0)
        assert stored['xp_value'] == MIN_XP


class TestTheSpecSurvives:
    """The override must not have cost the defaults that were working."""

    @pytest.mark.parametrize('fragment', [
        'title: 3-8 words',
        'pillar: one of [',
        'READING LEVEL: 5th-6th grade',
        'SOURCE MATERIAL',
    ])
    def test_house_style_still_present(self, fragment):
        assert fragment in _prompt_for(notes="Anything at all.")

    def test_requested_task_count_still_reaches_the_prompt(self):
        service = QuestAIService()
        with patch.object(service, 'generate_json', return_value={
            'title': 'T', 'description': 'D',
            'tasks': [{'title': 'a', 'description': 'b', 'pillar': 'art',
                       'xp_value': 25, 'is_required': True}],
        }) as gen:
            service.draft_quest_from_context('material', notes='', target_task_count=7)
        assert 'exactly 7 tasks' in gen.call_args[0][0]
