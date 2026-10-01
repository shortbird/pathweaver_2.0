"""One XP scale for the AIs that write tasks and the AI that reviews them.

Jake Bingham's class (2026-09-30) was eleven AI-suggested tasks claiming
1,025 XP that the credit reviewer sized at 375: the suggester used "50-200,
most 100-150" and the reviewer a time scale. These hold every task-writing
prompt to prompts/xp_scale.py, and every generator's XP to the task sizes.
"""

from pathlib import Path

import pytest

from config.constants import TASK_XP_SIZES
from prompts.xp_scale import TASK_XP_RULES, XP_SCALE
from utils.task_xp import snap_to_task_size

BACKEND = Path(__file__).resolve().parents[2]

# Every module whose prompt asks an AI for a task's xp_value.
TASK_WRITERS = (
    'services/sample_task_generator.py',
    'services/quest_ai_service.py',
    'services/quest_generation_ai_service.py',
    'services/personalization_service.py',
    'prompts/course_generation.py',
)


@pytest.mark.unit
class TestOneScale:
    @pytest.mark.parametrize('rel', TASK_WRITERS)
    def test_every_task_writer_uses_the_shared_rules(self, rel):
        assert 'TASK_XP_RULES' in (BACKEND / rel).read_text(encoding='utf-8'), (
            f'{rel} asks an AI for xp_value without the shared XP scale. Use '
            'prompts.xp_scale.TASK_XP_RULES, or the reviewer will trim what it promises.')

    def test_the_reviewer_measures_on_the_same_scale(self):
        from prompts.credit_review_xp import CREDIT_REVIEW_XP_GUIDE
        assert XP_SCALE in CREDIT_REVIEW_XP_GUIDE

    def test_the_hand_written_task_sizer_uses_it_too(self):
        source = (BACKEND / 'services/task_quality_service.py').read_text(encoding='utf-8')
        assert '{XP_SCALE}' in source

    def test_the_rules_name_only_real_sizes(self):
        for size in TASK_XP_SIZES:
            assert f'- {size}:' in XP_SCALE
        assert '125' not in TASK_XP_RULES and '175' not in TASK_XP_RULES

    def test_the_class_suggester_prompt_carries_the_scale(self):
        from services.sample_task_generator import _build_prompt
        prompt = _build_prompt('Entrepreneurship', 'Start a business', 10, transcript_subject='language_arts')
        assert TASK_XP_RULES in prompt
        assert 'most should be 100-150' not in prompt

    def test_the_course_task_prompt_carries_the_scale(self):
        from prompts.course_generation import get_tasks_prompt
        assert TASK_XP_RULES in get_tasks_prompt('C', 'P', 'L', 'S')

    def test_the_reviewer_keeps_the_xp_of_a_task_done_as_written(self):
        from services.credit_ai_review.prompt import _xp_section
        from services.credit_ai_review.calibration import Calibration
        section = _xp_section(100, Calibration())
        assert 'does everything the task and its Definition of Done ask' in section
        assert 'NEVER recommend more than 100' in section


@pytest.mark.unit
class TestSnap:
    @pytest.mark.parametrize('raw,expected', [
        (125, 100), (175, 150), (60, 50), (10, 25), (300, 200), ('x', 50), (None, 50), (75, 75),
    ])
    def test_snaps_onto_task_sizes(self, raw, expected):
        assert snap_to_task_size(raw) == expected

    def test_respects_a_ceiling(self):
        assert snap_to_task_size(200, hi=150) == 150

    def test_the_class_suggester_snaps(self):
        from services.sample_task_generator import _validate_task
        task = _validate_task({'title': 'Write copy', 'pillar': 'art', 'xp_value': 125})
        assert task['xp_value'] == 100
        task = _validate_task({'title': 'Write copy', 'pillar': 'art', 'xp_value': 25})
        assert task['xp_value'] == 25
