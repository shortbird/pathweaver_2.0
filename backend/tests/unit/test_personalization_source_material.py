"""Learner task generation grounded in the document the quest came from.

iCreate, 2026-08-17: staff and families doing a training quest should be able to
generate their own extra tasks, "using the uploaded content as context".

The learner-side generator builds its prompt from the quest's title and
big_idea. For training that is a line and a paragraph, which is nowhere near
enough to write a task about a specific policy buried in a 30-page handbook — it
would produce plausible tasks about onboarding in general. So the text the quest
was drafted from is kept on the quest (`quests.source_material`, set by
POST /api/sis/training/create) and handed to the model as authoritative.

Absent source material the prompt must be byte-for-byte what it was, since every
other quest on the platform goes through this same builder.
"""

from services.personalization_service import PersonalizationService


QUEST = {
    'title': 'Staff onboarding',
    'big_idea': 'Everything you need for your first week.',
}

HANDBOOK = 'Section 4: attendance is taken by 9:05. Section 5: fire drill is the first Tuesday.'


def _prompt(quest, **kwargs):
    return PersonalizationService()._build_personalization_prompt(
        quest, 'real_world_project', ['teaching'], [], **kwargs
    )


def test_the_handbook_reaches_the_model():
    prompt = _prompt({**QUEST, 'source_material': HANDBOOK})
    assert 'attendance is taken by 9:05' in prompt
    assert 'fire drill is the first Tuesday' in prompt


def test_the_handbook_is_marked_authoritative():
    """Otherwise the model writes about onboarding in general, which is exactly
    the tasks a school does not need."""
    prompt = _prompt({**QUEST, 'source_material': HANDBOOK})
    assert 'SOURCE MATERIAL (authoritative' in prompt
    assert 'must be about THIS' in prompt


def test_the_model_is_told_not_to_invent_details():
    prompt = _prompt({**QUEST, 'source_material': HANDBOOK})
    assert 'Do not invent policies, names or details' in prompt


def test_a_quest_without_source_material_is_unchanged():
    """Every other quest on the platform uses this same prompt builder."""
    prompt = _prompt(QUEST)
    assert 'SOURCE MATERIAL' not in prompt
    assert prompt == _prompt({**QUEST, 'source_material': None})
    assert prompt == _prompt({**QUEST, 'source_material': '   '})


def test_a_huge_document_is_capped():
    """A whole handbook must not blow the context window. A marker character is
    used so the count cannot collide with the rest of the prompt's prose."""
    prompt = _prompt({**QUEST, 'source_material': 'ø' * 50000})
    assert prompt.count('ø') == 20000


def test_the_quest_description_still_survives_alongside_it():
    prompt = _prompt({**QUEST, 'source_material': HANDBOOK})
    assert 'Everything you need for your first week.' in prompt
    assert 'Staff onboarding' in prompt
