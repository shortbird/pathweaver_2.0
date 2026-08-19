"""
"Let people add their own tasks", enforced on the server.

iCreate built an orientation quest with the box deliberately unchecked and
people added tasks to it anyway. The flag was written by the form, stored on the
quest, and read by nothing: the quest-detail payload did not even select the
column, so the page's own guard compared `undefined !== false` and never fired.

The UI guard is back, but it is not the thing under test here. A hidden button
stops nobody holding a URL, a stale tab, or the mobile app, so every endpoint
that can put a task on somebody's enrollment asks the quest first. These tests
pin the two directions that matter and the one that would be worse than the bug:
a quest that cannot be read must stay usable.
"""

from unittest.mock import Mock

import pytest

from routes.quest_personalization import _custom_tasks_blocked


def _quests(row):
    """A Supabase mock whose quests select returns one row (or None)."""
    supabase = Mock()
    table = Mock()
    table.select.return_value = table
    table.eq.return_value = table
    table.single.return_value = table
    table.execute.return_value = Mock(data=row)
    supabase.table.return_value = table
    return supabase


@pytest.mark.unit
class TestTheGate:
    def test_an_unticked_box_is_a_403(self, app):
        """`app` is here for jsonify's application context, nothing else."""
        blocked = _custom_tasks_blocked(_quests({'allow_custom_tasks': False}), 'q1')
        assert blocked is not None
        body, status = blocked
        assert status == 403
        assert 'own tasks' in body.get_json()['error']

    def test_a_ticked_box_lets_the_request_through(self):
        assert _custom_tasks_blocked(_quests({'allow_custom_tasks': True}), 'q1') is None

    def test_a_quest_predating_the_checkbox_is_allowed(self):
        """The column defaults to true; a null must not read as "blocked"."""
        assert _custom_tasks_blocked(_quests({'allow_custom_tasks': None}), 'q1') is None

    def test_a_missing_column_is_allowed(self):
        assert _custom_tasks_blocked(_quests({}), 'q1') is None

    def test_a_read_that_raises_does_not_take_the_wizard_down(self):
        """Failing closed here would block every quest on a transient error."""
        supabase = Mock()
        supabase.table.side_effect = RuntimeError('connection reset')
        assert _custom_tasks_blocked(supabase, 'q1') is None


@pytest.mark.unit
class TestEveryTaskCreatingRouteAsks:
    """The gate is only worth having if nothing routes around it.

    These are the endpoints that can end with a row in user_quest_tasks, or
    that spend an AI call on the way there. If somebody adds an eighth, this
    test is what tells them to gate it too.
    """

    GATED = [
        'start_personalization',
        'generate_tasks',
        'analyze_manual_task',
        'add_manual_tasks_batch',
        'add_path_tasks',
        'finalize_tasks',
        'accept_task_immediate',
    ]

    @pytest.mark.parametrize('name', GATED)
    def test_route_consults_the_gate(self, name):
        import inspect

        from routes import quest_personalization

        source = inspect.getsource(getattr(quest_personalization, name))
        assert '_custom_tasks_blocked' in source, (
            f"{name} can create a task without asking whether the quest allows it"
        )
