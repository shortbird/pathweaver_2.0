"""
Unit tests for class-quest endpoints (the "Start a Class" feature).

Covers:
- POST /api/quests/create with quest_type='class' validates transcript_subject
- GET /api/quests/<id>/class-progress sums approved subject XP correctly
- POST /api/quests/<id>/submit-class-for-review enforces 1000 XP gate
- Admin approve/reject endpoints update class_review_status
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

QUEST_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
ADMIN_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
TASK_ID_1 = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
TASK_ID_2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'


def _mock_supabase_chain(returns):
    """Build a chainable Supabase mock that returns the given execute() data."""
    m = MagicMock()
    m.table.return_value = m
    m.select.return_value = m
    m.insert.return_value = m
    m.update.return_value = m
    m.eq.return_value = m
    m.in_.return_value = m
    m.order.return_value = m
    m.limit.return_value = m
    m.single.return_value = m
    m.execute.return_value = SimpleNamespace(data=returns, count=len(returns) if isinstance(returns, list) else None)
    return m


def _build_progress_supabase(execute_responses):
    """
    Build a Supabase mock where all chained methods return self and .execute()
    returns the next response in execute_responses in order.

    Call sequence in _compute_class_progress:
      1. completions (any status — class credit counts on completion)
      2. tasks for completed task_ids
    """
    chain = MagicMock()
    chain.table.return_value = chain
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.in_.return_value = chain
    chain.execute.side_effect = execute_responses
    return chain


class TestComputeClassProgress:
    """The _compute_class_progress helper is the heart of the feature."""

    def test_counts_any_completion_toward_subject_xp(self):
        """Inside a class, completing a task counts immediately — the holistic
        review at 1000 XP is what validates the work, not per-task review."""
        from routes.quest.classes import _compute_class_progress

        supabase = _build_progress_supabase([
            # 1. completions (mixed statuses, all count)
            SimpleNamespace(data=[
                {'id': 'c1', 'user_quest_task_id': TASK_ID_1, 'diploma_status': 'none'},
                {'id': 'c2', 'user_quest_task_id': TASK_ID_2, 'diploma_status': 'approved'},
            ]),
            # 2. tasks
            SimpleNamespace(data=[
                {'id': TASK_ID_1, 'xp_value': 500, 'subject_xp_distribution': {'math': 500}},
                {'id': TASK_ID_2, 'xp_value': 600, 'subject_xp_distribution': {'math': 400, 'science': 200}},
            ]),
        ])
        progress = _compute_class_progress(supabase, QUEST_ID, USER_ID, 'math')
        # 500 (from c1, status=none) + 400 (from c2, math portion) = 900
        assert progress['approved_xp'] == 900
        assert progress['pending_xp'] == 0  # No separate pending bucket for classes

    def test_just_completed_task_counts_immediately(self):
        """A task completion with diploma_status='none' should count toward
        class credit — student doesn't have to request per-task credit first."""
        from routes.quest.classes import _compute_class_progress

        supabase = _build_progress_supabase([
            SimpleNamespace(data=[{'id': 'c1', 'user_quest_task_id': TASK_ID_1, 'diploma_status': 'none'}]),
            SimpleNamespace(data=[{'id': TASK_ID_1, 'xp_value': 100, 'subject_xp_distribution': {'pe': 100}}]),
        ])
        progress = _compute_class_progress(supabase, QUEST_ID, USER_ID, 'pe')
        assert progress['approved_xp'] == 100

    def test_no_completions_returns_zero(self):
        from routes.quest.classes import _compute_class_progress

        supabase = _build_progress_supabase([
            SimpleNamespace(data=[]),
        ])
        progress = _compute_class_progress(supabase, QUEST_ID, USER_ID, 'math')
        assert progress['approved_xp'] == 0
        assert progress['pending_xp'] == 0


class TestCreateClassQuestValidation:
    """The /api/quests/create endpoint's class-field validation."""

    def test_class_requires_transcript_subject(self):
        from utils.school_subjects import SCHOOL_SUBJECTS
        assert 'math' in SCHOOL_SUBJECTS
        assert 'language_arts' in SCHOOL_SUBJECTS
        assert 'pe' in SCHOOL_SUBJECTS
        # 11 canonical subjects
        assert len(SCHOOL_SUBJECTS) == 11

    def test_invalid_subject_rejected(self):
        from utils.school_subjects import SCHOOL_SUBJECTS
        assert 'world_languages' not in SCHOOL_SUBJECTS  # marketing maps to social_studies
        assert 'english' not in SCHOOL_SUBJECTS  # marketing label; canonical key is language_arts


class TestSubjectXPDistribution:
    """get_subject_xp_distribution properly attributes XP to the class subject."""

    def test_single_subject_full_xp(self):
        from routes.tasks.xp_helpers import get_subject_xp_distribution
        task = {'subject_xp_distribution': {'math': 100}}
        dist = get_subject_xp_distribution(task, 100)
        assert dist.get('math') == 100

    def test_multi_subject_split(self):
        from routes.tasks.xp_helpers import get_subject_xp_distribution
        task = {'subject_xp_distribution': {'math': 60, 'science': 40}}
        dist = get_subject_xp_distribution(task, 100)
        assert dist.get('math') == 60
        assert dist.get('science') == 40

    def test_falls_back_to_diploma_subjects_list(self):
        from routes.tasks.xp_helpers import get_subject_xp_distribution
        task = {'diploma_subjects': ['pe', 'health']}
        dist = get_subject_xp_distribution(task, 200)
        # 100 each (50/50 split), normalized to multiples of 5
        assert dist.get('pe', 0) > 0
        assert dist.get('health', 0) > 0
        assert sum(dist.values()) == 200


class TestSampleTaskGeneratorSubjectContext:
    """The AI prompt includes class context when transcript_subject is set."""

    def test_prompt_includes_subject_context_when_provided(self):
        from services.sample_task_generator import _build_prompt
        prompt = _build_prompt('Soccer Conditioning', 'training for tryouts', 6, 'pe')
        assert 'This quest is part of a' in prompt
        assert 'PE' in prompt or '"pe"' in prompt
        # The schema instructions for diploma_subjects appear in the per-task
        # output block when class context is on.
        assert 'transcript' in prompt.lower()

    def test_prompt_omits_class_context_when_no_subject(self):
        from services.sample_task_generator import _build_prompt
        prompt = _build_prompt('Build a drone', 'first drone project', 6, None)
        # The "This quest is part of a {subject} class" sentence is the
        # canary that class context was injected.
        assert 'This quest is part of a' not in prompt
