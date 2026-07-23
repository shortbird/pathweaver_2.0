"""Tests for AI task generation challenge levels + the per-task complexity dial.

Covers:
- request validators (challenge_level on generate-tasks, the new adjust request)
- cache key inclusion (a Challenge request must never be served a Standard batch)
- level-aware XP distribution anchors (Easier 75 / Standard 100 / Challenge 150)
- prompt composition (challenge guidance, per-level XP lines, age_band interplay,
  and a regression guard that Standard-with-no-age-band matches today's prompt)
- diploma subject rescaling for adjusted tasks
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from routes.personalization_validators import (
    validate_generate_tasks_request,
    validate_adjust_task_request,
    VALID_CHALLENGE_LEVELS,
)
from services.personalization_service import (
    PersonalizationService,
    TaskCacheService,
    CHALLENGE_LEVELS,
    DEFAULT_CHALLENGE_LEVEL,
)


QUEST = {
    'title': 'Learn Chess Strategy',
    'big_idea': 'Understand openings, tactics, and endgames.',
}


@pytest.fixture
def service():
    return PersonalizationService()


@pytest.fixture
def cache():
    return TaskCacheService()


# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------

class TestValidators:
    def test_valid_challenge_levels_constant(self):
        assert VALID_CHALLENGE_LEVELS == ['easier', 'standard', 'challenge']

    @pytest.mark.parametrize('level', ['easier', 'standard', 'challenge'])
    def test_generate_accepts_valid_levels(self, level):
        ok, err = validate_generate_tasks_request({'session_id': 's1', 'challenge_level': level})
        assert ok, err

    def test_generate_accepts_omitted_level(self):
        ok, _ = validate_generate_tasks_request({'session_id': 's1'})
        assert ok

    def test_generate_rejects_bad_level(self):
        ok, err = validate_generate_tasks_request({'session_id': 's1', 'challenge_level': 'nightmare'})
        assert not ok
        assert 'challenge_level' in err

    def test_adjust_requires_task_with_title(self):
        ok, err = validate_adjust_task_request({'direction': 'harder'})
        assert not ok
        ok, err = validate_adjust_task_request({'task': {'title': '  '}, 'direction': 'harder'})
        assert not ok

    @pytest.mark.parametrize('direction', ['easier', 'harder'])
    def test_adjust_accepts_valid_directions(self, direction):
        ok, err = validate_adjust_task_request({'task': {'title': 'T'}, 'direction': direction})
        assert ok, err

    def test_adjust_rejects_bad_direction(self):
        ok, err = validate_adjust_task_request({'task': {'title': 'T'}, 'direction': 'sideways'})
        assert not ok
        assert 'direction' in err


# ---------------------------------------------------------------------------
# Cache key
# ---------------------------------------------------------------------------

class TestCacheKey:
    def test_levels_produce_distinct_keys(self, cache):
        keys = {
            cache.build_cache_key(['chess'], [], challenge_level=level)
            for level in VALID_CHALLENGE_LEVELS
        }
        assert len(keys) == 3

    def test_easier_and_challenge_differ_from_standard(self, cache):
        base = cache.build_cache_key(['chess'], [])
        assert cache.build_cache_key(['chess'], [], challenge_level='easier') != base
        assert cache.build_cache_key(['chess'], [], challenge_level='challenge') != base
        assert (cache.build_cache_key(['chess'], [], challenge_level='easier')
                != cache.build_cache_key(['chess'], [], challenge_level='challenge'))

    def test_standard_and_none_share_legacy_key(self, cache):
        """Pre-existing cache entries (keyed without a level) stay valid for Standard."""
        assert cache.build_cache_key(['chess'], []) == \
            cache.build_cache_key(['chess'], [], challenge_level='standard')

    def test_same_level_is_stable(self, cache):
        assert cache.build_cache_key(['chess'], ['Math'], challenge_level='challenge') == \
            cache.build_cache_key(['chess'], ['Math'], challenge_level='challenge')


# ---------------------------------------------------------------------------
# XP distribution anchors
# ---------------------------------------------------------------------------

class TestXpDistribution:
    def _tasks(self, values):
        return [{'title': f't{i}', 'xp_value': v} for i, v in enumerate(values)]

    @pytest.mark.parametrize('level,anchor', [
        ('easier', 75), ('standard', 100), ('challenge', 150), (None, 100),
    ])
    def test_half_of_tasks_anchor_at_level_value(self, service, level, anchor):
        tasks = service._enforce_xp_distribution(
            self._tasks([50, 50, 50, 50, 50, 50]), challenge_level=level
        )
        assert sum(1 for t in tasks if t['xp_value'] == anchor) >= len(tasks) // 2

    def test_already_anchored_batch_untouched(self, service):
        tasks = service._enforce_xp_distribution(
            self._tasks([150, 150, 150, 200, 100, 175]), challenge_level='challenge'
        )
        assert [t['xp_value'] for t in tasks] == [150, 150, 150, 200, 100, 175]

    def test_level_config_shape(self):
        for level, cfg in CHALLENGE_LEVELS.items():
            assert cfg['min_xp'] < cfg['anchor'] <= cfg['max_xp'], level
        assert DEFAULT_CHALLENGE_LEVEL == 'standard'
        assert CHALLENGE_LEVELS['challenge']['max_xp'] == 200


# ---------------------------------------------------------------------------
# Prompt composition
# ---------------------------------------------------------------------------

class TestPromptComposition:
    def _prompt(self, service, **kwargs):
        return service._build_personalization_prompt(
            QUEST, 'real_world_project', ['chess'], [], **kwargs
        )

    def test_standard_no_age_band_matches_legacy_prompt(self, service):
        """Regression guard: default generation produces today's prompt lines."""
        prompt = self._prompt(service)
        assert 'At least 50% of tasks should be worth exactly 100 XP' in prompt
        assert 'range from 50-150 XP' in prompt
        assert 'CHALLENGE LEVEL' not in prompt
        assert 'equivalent to high school unit projects' in prompt

    def test_challenge_level_changes_xp_band_and_adds_guidance(self, service):
        prompt = self._prompt(service, challenge_level='challenge')
        assert 'At least 50% of tasks should be worth exactly 150 XP' in prompt
        assert 'range from 100-200 XP' in prompt
        assert 'CHALLENGE LEVEL: CHALLENGE' in prompt
        assert 'finds typical tasks too easy' in prompt

    def test_easier_level_changes_xp_band_and_adds_guidance(self, service):
        prompt = self._prompt(service, challenge_level='easier')
        assert 'At least 50% of tasks should be worth exactly 75 XP' in prompt
        assert 'range from 50-100 XP' in prompt
        assert 'CHALLENGE LEVEL: EASIER' in prompt

    def test_challenge_composes_with_age_band(self, service):
        """Both blocks present; challenge is phrased relative to the age band."""
        prompt = self._prompt(service, challenge_level='challenge', age_band='8-13')
        assert 'AGE-APPROPRIATE REQUIREMENT' in prompt
        assert 'CHALLENGE LEVEL: CHALLENGE' in prompt
        assert '8-13 age band' in prompt
        # The age band's difficulty line still wins over the high-school default.
        assert 'NOT high-school-level projects' in prompt


# ---------------------------------------------------------------------------
# Diploma subject rescaling (complexity dial)
# ---------------------------------------------------------------------------

class TestRescaleDiplomaSubjects:
    def test_single_subject_takes_full_new_xp(self):
        out = PersonalizationService._rescale_diploma_subjects({'Math': 100}, 150)
        assert out == {'Math': 150}

    def test_split_keeps_proportions_and_sums_to_new_xp(self):
        out = PersonalizationService._rescale_diploma_subjects({'Science': 75, 'Math': 25}, 200)
        assert sum(out.values()) == 200
        assert out['Science'] > out['Math']
        assert all(v % 25 == 0 for v in out.values())

    def test_empty_subjects_fall_back_to_electives(self):
        assert PersonalizationService._rescale_diploma_subjects({}, 125) == {'Electives': 125}
        assert PersonalizationService._rescale_diploma_subjects(None, 75) == {'Electives': 75}

    def test_list_format_normalized_then_rescaled(self):
        out = PersonalizationService._rescale_diploma_subjects(['Math', 'Science'], 100)
        assert sum(out.values()) == 100


# ---------------------------------------------------------------------------
# adjust_task_complexity direction enforcement
# ---------------------------------------------------------------------------

class TestAdjustTaskComplexity:
    def _run(self, service, ai_response, direction, original_xp=100):
        mock_ai = MagicMock()
        mock_ai.generate_with_fallback.return_value = MagicMock(text='{}')
        mock_ai._parse_quest_response.return_value = ai_response
        mock_ai._validate_pillar.side_effect = lambda p: p or 'stem'
        with patch.object(PersonalizationService, 'ai_service', new=mock_ai):
            return service.adjust_task_complexity(
                {'title': 'T', 'description': 'D', 'pillar': 'stem',
                 'xp_value': original_xp, 'diploma_subjects': {'Math': original_xp}},
                direction,
            )

    def test_harder_forces_xp_up_even_if_ai_holds_steady(self, service):
        result = self._run(service, {'title': 'T2', 'xp_value': 100}, 'harder')
        assert result['success']
        assert result['task']['xp_value'] == 125

    def test_easier_forces_xp_down_even_if_ai_holds_steady(self, service):
        result = self._run(service, {'title': 'T2', 'xp_value': 100}, 'easier')
        assert result['success']
        assert result['task']['xp_value'] == 75

    def test_xp_clamped_to_200_and_snapped_to_25(self, service):
        result = self._run(service, {'title': 'T2', 'xp_value': 999}, 'harder')
        assert result['task']['xp_value'] == 200
        result = self._run(service, {'title': 'T2', 'xp_value': 130}, 'harder')
        assert result['task']['xp_value'] == 125

    def test_diploma_subjects_rescaled_to_new_xp(self, service):
        result = self._run(service, {'title': 'T2', 'xp_value': 150}, 'harder')
        assert sum(result['task']['diploma_subjects'].values()) == result['task']['xp_value']

    def test_missing_fields_fall_back_to_original(self, service):
        result = self._run(service, {'xp_value': 150}, 'harder')
        assert result['task']['title'] == 'T'
        assert result['task']['description'] == 'D'
