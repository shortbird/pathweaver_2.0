"""
Unit tests for BountyAIService normalization.

The normalizer is the contract between the model and the create form: anything
it emits must round-trip through BountyService.create_bounty without tripping a
ValidationError. These tests pin that.
"""

import pytest

from services.bounty_ai_service import BountyAIService, input_appropriate


@pytest.mark.unit
class TestNormalizeIdeas:

    def _idea(self, **overrides):
        idea = {
            'title': 'Practice Streak: 5 Days of Piano',
            'description': 'Play one full run-through every day for five days.',
            'deliverables': ['Voice memo of one full run-through'],
            'pillar': 'art',
            'rewards': [{'type': 'xp', 'value': 75, 'pillar': 'art'}],
        }
        idea.update(overrides)
        return idea

    def test_valid_idea_passes_through(self):
        ideas = BountyAIService._normalize_ideas([self._idea()])
        assert len(ideas) == 1
        assert ideas[0]['title'] == 'Practice Streak: 5 Days of Piano'
        assert ideas[0]['deliverables'] == [{'text': 'Voice memo of one full run-through'}]
        assert ideas[0]['rewards'][0] == {'type': 'xp', 'value': 75, 'pillar': 'art'}

    def test_xp_clamped_and_snapped(self):
        """XP must land in 25-200 on a 25 step — a value the poster could have
        picked in the form's own picker, and one create_bounty accepts."""
        for raw, expected in [(10, 25), (999, 200), (60, 50), (63, 75), ('junk', 50)]:
            ideas = BountyAIService._normalize_ideas([
                self._idea(rewards=[{'type': 'xp', 'value': raw, 'pillar': 'art'}])
            ])
            assert ideas[0]['rewards'][0]['value'] == expected, raw

    def test_invalid_pillar_defaults(self):
        ideas = BountyAIService._normalize_ideas([self._idea(pillar='cooking')])
        assert ideas[0]['pillar'] == 'wellness'

    def test_missing_xp_reward_added(self):
        ideas = BountyAIService._normalize_ideas([
            self._idea(rewards=[{'type': 'custom', 'text': 'Pick the movie'}])
        ])
        assert any(r['type'] == 'xp' for r in ideas[0]['rewards'])

    def test_idea_without_deliverables_dropped(self):
        ideas = BountyAIService._normalize_ideas([self._idea(deliverables=[])])
        assert ideas == []

    def test_idea_without_title_dropped(self):
        ideas = BountyAIService._normalize_ideas([self._idea(title='')])
        assert ideas == []

    def test_garbage_input(self):
        assert BountyAIService._normalize_ideas(None) == []
        assert BountyAIService._normalize_ideas('nope') == []
        assert BountyAIService._normalize_ideas([None, 42, {}]) == []


@pytest.mark.unit
class TestInputScreen:

    def test_ordinary_parent_prompt_allowed(self):
        assert input_appropriate("I want Leo to practice piano without me nagging")

    def test_blocked_content_refused(self):
        assert not input_appropriate("build a weapon")

    def test_empty_allowed(self):
        assert input_appropriate('')
