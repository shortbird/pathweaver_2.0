"""Unit tests for Student XP Goals (services/xp_goal_service).

Covers the parts where being wrong is invisible in the UI: the week boundary
(which decides whether Sunday night's work counted), the derived progress sum
(which has no stored value to check it against), who may set a goal, and which
of several stored targets is the one in force.
"""

from datetime import date
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest

from services import xp_goal_service as goals


DENVER = ZoneInfo('America/Denver')


class TestWeekStart:
    """Weeks run Monday..Sunday. Every day of a week must resolve to the same Monday."""

    @pytest.mark.parametrize('day,expected', [
        (date(2026, 8, 10), date(2026, 8, 10)),  # Monday itself
        (date(2026, 8, 13), date(2026, 8, 10)),  # Thursday
        (date(2026, 8, 16), date(2026, 8, 10)),  # Sunday -- still the same week
        (date(2026, 8, 17), date(2026, 8, 17)),  # next Monday starts a new one
    ])
    def test_resolves_to_monday(self, day, expected):
        assert goals.week_start_for(DENVER, day) == expected


class TestWeekBounds:
    def test_window_is_seven_days_and_half_open(self):
        start, end = goals.week_bounds_utc(DENVER, date(2026, 8, 10))
        # Denver is UTC-6 in August, so local Monday 00:00 is 06:00 UTC.
        assert start == '2026-08-10T06:00:00+00:00'
        assert end == '2026-08-17T06:00:00+00:00'

    def test_boundary_belongs_to_exactly_one_week(self):
        """The end of one week must equal the start of the next, so a task
        completed at that instant is counted once, not twice or never."""
        _, end = goals.week_bounds_utc(DENVER, date(2026, 8, 10))
        next_start, _ = goals.week_bounds_utc(DENVER, date(2026, 8, 17))
        assert end == next_start

    def test_uses_the_orgs_timezone_not_utc(self):
        denver_start, _ = goals.week_bounds_utc(DENVER, date(2026, 8, 10))
        ny_start, _ = goals.week_bounds_utc(ZoneInfo('America/New_York'), date(2026, 8, 10))
        assert denver_start != ny_start


class TestCleanTarget:
    @pytest.mark.parametrize('raw,expected', [
        (500, 500),
        ('500', 500),
        (1, 1),
        (10000, 10000),
    ])
    def test_accepts_usable_numbers(self, raw, expected):
        assert goals.clean_target(raw) == expected

    @pytest.mark.parametrize('raw', [0, -100, 10001, None, '', 'lots', '5.5'])
    def test_rejects_rather_than_clamps(self, raw):
        """A rejected 50000 sends the setter back to fix it. A clamped one would
        silently show the student a goal nobody chose."""
        assert goals.clean_target(raw) is None


class TestCleanNote:
    def test_collapses_whitespace_and_truncates(self):
        assert goals.clean_note('  keep   going  ') == 'keep going'
        assert len(goals.clean_note('x' * 500)) == goals.MAX_NOTE_LEN

    def test_empty_becomes_none(self):
        assert goals.clean_note('   ') is None
        assert goals.clean_note(None) is None


class TestWeeklyXp:
    def _rows(self, rows):
        """Stub the completions query chain down to .execute().data."""
        class _Result:
            data = rows

        class _Q:
            def select(self, *a, **k): return self
            def eq(self, *a, **k): return self
            def gte(self, *a, **k): return self
            def lt(self, *a, **k): return self
            def execute(self): return _Result()

        class _Client:
            def table(self, name): return _Q()

        return _Client()

    def test_sums_xp_value_from_the_joined_task(self):
        client = self._rows([
            {'id': '1', 'user_quest_tasks': {'xp_value': 100}},
            {'id': '2', 'user_quest_tasks': {'xp_value': 250}},
        ])
        with patch.object(goals, '_admin', return_value=client):
            assert goals.weekly_xp('s1', DENVER, date(2026, 8, 10)) == (350, 2)

    def test_missing_task_row_contributes_zero_not_an_error(self):
        """A hard-deleted task should shrink the number, not break the card."""
        client = self._rows([
            {'id': '1', 'user_quest_tasks': None},
            {'id': '2', 'user_quest_tasks': {'xp_value': 100}},
        ])
        with patch.object(goals, '_admin', return_value=client):
            assert goals.weekly_xp('s1', DENVER, date(2026, 8, 10)) == (100, 2)

    def test_embedded_task_returned_as_a_list(self):
        """PostgREST returns the embedded row as a list on some relationships."""
        client = self._rows([{'id': '1', 'user_quest_tasks': [{'xp_value': 75}]}])
        with patch.object(goals, '_admin', return_value=client):
            assert goals.weekly_xp('s1', DENVER, date(2026, 8, 10)) == (75, 1)

    def test_no_completions_is_zero(self):
        with patch.object(goals, '_admin', return_value=self._rows([])):
            assert goals.weekly_xp('s1', DENVER, date(2026, 8, 10)) == (0, 0)


class TestSetterRole:
    """Who may set a goal, and in what capacity it gets recorded."""

    def test_the_student_sets_their_own(self):
        assert goals.setter_role('s1', 's1') == 'student'

    def test_parent(self):
        with patch.object(goals, '_user_row', return_value={'id': 'p1'}), \
             patch('utils.platform_staff.is_optio_platform_user', return_value=False), \
             patch('utils.portfolio_access.is_parent_of', return_value=True):
            assert goals.setter_role('p1', 's1') == 'parent'

    def test_class_teacher_counts_even_without_a_formal_assignment(self):
        with patch.object(goals, '_user_row', return_value={'id': 't1'}), \
             patch('utils.platform_staff.is_optio_platform_user', return_value=False), \
             patch('utils.portfolio_access.is_parent_of', return_value=False), \
             patch('utils.portfolio_access.is_advisor_of', return_value=False), \
             patch('utils.portfolio_access.teaches_student', return_value=True):
            assert goals.setter_role('t1', 's1') == 'advisor'

    def test_observer_may_not_set(self):
        """An observer is someone the family let watch, not someone who picks
        the student's targets. can_view_goal still says yes for them."""
        with patch.object(goals, '_user_row', return_value={'id': 'o1'}), \
             patch.object(goals, '_student_row', return_value={'id': 's1', 'organization_id': 'org'}), \
             patch('utils.platform_staff.is_optio_platform_user', return_value=False), \
             patch('utils.portfolio_access.is_parent_of', return_value=False), \
             patch('utils.portfolio_access.is_advisor_of', return_value=False), \
             patch('utils.portfolio_access.teaches_student', return_value=False), \
             patch('utils.portfolio_access.is_org_admin_over', return_value=False):
            assert goals.setter_role('o1', 's1') is None
            assert goals.can_set_goal('o1', 's1') is False

    def test_unrelated_user_may_not_set(self):
        with patch.object(goals, '_user_row', return_value={}):
            assert goals.setter_role('x1', 's1') is None


class TestFeatureGate:
    def test_off_by_default(self):
        with patch.object(goals, 'org_has_feature', return_value=False) as flag:
            assert goals.enabled_for_org('org-1') is False
            flag.assert_called_once_with('org-1', 'xp_goals')

    def test_platform_student_with_no_org_is_off(self):
        with patch.object(goals, '_student_row', return_value={'id': 's1', 'organization_id': None}), \
             patch.object(goals, 'org_has_feature', return_value=False):
            assert goals.enabled_for_student('s1') is False

    def test_the_students_org_decides_not_the_viewers(self):
        with patch.object(goals, '_student_row', return_value={'id': 's1', 'organization_id': 'their-org'}), \
             patch.object(goals, 'org_has_feature', return_value=True) as flag:
            assert goals.enabled_for_student('s1') is True
            flag.assert_called_once_with('their-org', 'xp_goals')


class TestSummary:
    def _summary(self, *, enabled=True, goal=None, earned=0, tasks=0):
        with patch.object(goals, '_student_row',
                          return_value={'id': 's1', 'organization_id': 'org'}), \
             patch.object(goals, 'enabled_for_org', return_value=enabled), \
             patch.object(goals, '_tz_for_org', return_value=DENVER), \
             patch.object(goals, 'weekly_xp', return_value=(earned, tasks)), \
             patch.object(goals, 'goal_in_force', return_value=goal), \
             patch.object(goals, 'can_set_goal', return_value=True):
            return goals.summary('s1', 'c1', week_start=date(2026, 8, 10))

    def test_disabled_org_reports_only_that(self):
        """Callers must not need to tell "off" from "not set yet"."""
        assert self._summary(enabled=False) == {'enabled': False}

    def test_progress_without_a_goal(self):
        result = self._summary(goal=None, earned=300, tasks=3)
        assert result['enabled'] is True
        assert result['xp_earned'] == 300
        assert result['target_xp'] is None
        assert result['percent'] is None
        assert result['remaining_xp'] is None
        assert result['met'] is False

    def test_partway_to_the_goal(self):
        result = self._summary(goal={'target_xp': 500, 'set_by': 's1'}, earned=200, tasks=2)
        assert result['percent'] == 40
        assert result['remaining_xp'] == 300
        assert result['met'] is False
        assert result['set_by_self'] is True

    def test_overshooting_caps_the_bar_but_not_the_xp(self):
        result = self._summary(goal={'target_xp': 500, 'set_by': 't1'}, earned=900)
        assert result['met'] is True
        assert result['percent'] == 100
        assert result['remaining_xp'] == 0
        assert result['xp_earned'] == 900
        assert result['set_by_self'] is False

    def test_week_range_is_monday_to_sunday(self):
        result = self._summary(goal=None)
        assert result['week_start'] == '2026-08-10'
        assert result['week_end'] == '2026-08-16'
