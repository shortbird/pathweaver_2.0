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


# ---------------------------------------------------------------------------
# Read access for the student's own school (Sentry ticket ade315ec)
# ---------------------------------------------------------------------------

def _raw(view):
    """The view body without require_auth / require_relationship_to."""
    import inspect
    return inspect.unwrap(view)


def _route_app():
    from flask import Flask
    # Build the real app first, before the blueprint is registered on a
    # scratch app (see tests/test_class_messaging.py TestClassMessagingEndpoint):
    # registering it here first breaks later app-fixture tests in the same run.
    import app as _real_app  # noqa: F401
    from routes.xp_goals import bp
    app = Flask(__name__)
    app.register_blueprint(bp)
    return app


class TestCanReadGoal:
    """Sentry ticket ade315ec (reporter: Sentry alert, OPTIO web): "API 403:
    GET /api/xp-goals/student/:id from /admin/organizations/:id/student/:id".
    The portfolio rule admits only org admins and staff tied to the student, so
    a campus coordinator (or an unassigned advisor) of the same school got 403."""

    def _check(self, *, portfolio, roles, same_org):
        with patch.object(goals, 'can_view_goal', return_value=portfolio), \
             patch('database.get_supabase_admin_client', return_value=object()), \
             patch('utils.auth.org_scope.caller_roles_and_org',
                   return_value=(set(roles), 'org-1', False)), \
             patch('utils.auth.org_scope.caller_can_access_user',
                   return_value=same_org):
            return goals.can_read_goal('caller', 's1')

    def test_same_org_coordinator_reads(self):
        assert self._check(portfolio=False, roles={'campus_coordinator'}, same_org=True) is True

    def test_same_org_unassigned_advisor_reads(self):
        assert self._check(portfolio=False, roles={'advisor'}, same_org=True) is True

    def test_staff_of_another_org_is_refused(self):
        assert self._check(portfolio=False, roles={'org_admin'}, same_org=False) is False

    def test_a_classmate_is_refused(self):
        """Same org but a student: _org_staff wants a staff role, so a peer
        does not read another student's private target."""
        assert self._check(portfolio=False, roles={'student'}, same_org=True) is False

    def test_portfolio_rule_still_admits_on_its_own(self):
        assert self._check(portfolio=True, roles=set(), same_org=False) is True


class TestGoalReadRoutes:
    """Sentry ticket ade315ec: the per-org flag answers before any finer access
    check, and same-org staff read the goal. Setting is unchanged."""

    def _get(self, view, path, *, enabled, portfolio, org_staff, summary=None, history=None):
        from utils.auth import relationships as rel
        app = _route_app()
        staff = patch.dict(rel.RELATIONSHIPS, {'org_staff': lambda c, t: org_staff})
        with app.test_request_context(path), staff, \
             patch.object(goals, 'enabled_for_student', return_value=enabled), \
             patch.object(goals, 'can_view_goal', return_value=portfolio), \
             patch.object(goals, 'summary', return_value=summary or {'enabled': True}), \
             patch.object(goals, 'goal_history', return_value=history or []):
            resp, status = _raw(view)('coord-1', student_id='s1')
            return status, resp.get_json()

    def test_flag_off_org_answers_disabled_to_a_coordinator(self):
        """Old code ran can_view_goal first and 403'd here."""
        from routes.xp_goals import get_student_goal
        status, body = self._get(get_student_goal, '/api/xp-goals/student/s1',
                                 enabled=False, portfolio=False, org_staff=True)
        assert status == 200
        assert body == {'success': True, 'goal': {'enabled': False}}

    def test_flag_on_org_coordinator_reads_the_goal(self):
        from routes.xp_goals import get_student_goal
        status, body = self._get(get_student_goal, '/api/xp-goals/student/s1',
                                 enabled=True, portfolio=False, org_staff=True,
                                 summary={'enabled': True, 'target_xp': 300})
        assert status == 200
        assert body['goal']['target_xp'] == 300

    def test_flag_on_caller_with_no_read_right_is_refused(self):
        from routes.xp_goals import get_student_goal
        status, _ = self._get(get_student_goal, '/api/xp-goals/student/s1',
                              enabled=True, portfolio=False, org_staff=False)
        assert status == 403

    def test_history_flag_off_answers_disabled_to_a_coordinator(self):
        from routes.xp_goals import get_student_goal_history
        status, body = self._get(get_student_goal_history, '/api/xp-goals/student/s1/history',
                                 enabled=False, portfolio=False, org_staff=True)
        assert status == 200
        assert body == {'success': True, 'enabled': False, 'history': []}

    def test_history_flag_on_coordinator_reads(self):
        from routes.xp_goals import get_student_goal_history
        status, body = self._get(get_student_goal_history, '/api/xp-goals/student/s1/history',
                                 enabled=True, portfolio=False, org_staff=True,
                                 history=[{'target_xp': 200}])
        assert status == 200
        assert body['history'] == [{'target_xp': 200}]

    def test_history_flag_on_outsider_is_refused(self):
        from routes.xp_goals import get_student_goal_history
        status, _ = self._get(get_student_goal_history, '/api/xp-goals/student/s1/history',
                              enabled=True, portfolio=False, org_staff=False)
        assert status == 403

    def test_staff_of_another_org_stopped_at_the_gate(self):
        """Through the real decorators: no relationship, no read, flag on or off."""
        from routes.xp_goals import get_student_goal
        from utils.auth import relationships as rel
        from utils.auth.decorators import AuthorizationError
        app = _route_app()
        with app.test_request_context('/api/xp-goals/student/s1'), \
             patch('utils.auth.decorators.session_manager.get_effective_user_id',
                   return_value='other-org-admin'), \
             patch.object(rel, 'authorizing_user_id', return_value='other-org-admin'), \
             patch.object(rel, 'relationship_between', return_value=None), \
             patch.object(goals, 'enabled_for_student', return_value=False) as flag:
            with pytest.raises(AuthorizationError):
                get_student_goal(student_id='s1')
            flag.assert_not_called()

    def test_coordinator_still_cannot_set_a_goal(self):
        """Reading widened; setting did not. A campus coordinator who is not
        the student's advisor or teacher is not an org admin, so setter_role
        stays None and PUT 403s."""
        coordinator = {'id': 'coord-1', 'organization_id': 'org-1',
                       'role': 'org_managed', 'org_role': 'campus_coordinator'}
        with patch.object(goals, '_user_row', return_value=coordinator), \
             patch.object(goals, '_student_row', return_value={'id': 's1', 'organization_id': 'org-1'}), \
             patch('utils.platform_staff.is_optio_platform_user', return_value=False), \
             patch('utils.portfolio_access.is_parent_of', return_value=False), \
             patch('utils.portfolio_access.is_advisor_of', return_value=False), \
             patch('utils.portfolio_access.teaches_student', return_value=False):
            assert goals.setter_role('coord-1', 's1') is None

        from routes.xp_goals import set_student_goal
        app = _route_app()
        with app.test_request_context('/api/xp-goals/student/s1', method='PUT',
                                      json={'target_xp': 300}), \
             patch.object(goals, 'setter_role', return_value=None), \
             patch.object(goals, 'set_goal') as write:
            resp, status = _raw(set_student_goal)('coord-1', student_id='s1')
        assert status == 403
        write.assert_not_called()
