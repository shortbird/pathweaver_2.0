"""
Regression tests for the deleted task that came back.

Removing the final task from a quest left the enrollment with zero approved
tasks. GET /api/quests/<id> read that as "this enrollment was never seeded"
and copied the quest's template tasks back in, so the task the student had
just deleted reappeared on the next page load.

Two halves of the fix are covered here:

  1. drop_task records the student's intent -- when it removes the last task
     it sets personalization_completed on the enrollment, so the empty list is
     unambiguously deliberate, and reports quest_now_empty so the client can
     open the quest-completion flow.
  2. get_quest_detail no longer writes: a task-less enrollment stays task-less.

The one-time repair of enrollments that genuinely never got seeded lives in
migration 20260815000000_backfill_taskless_enrollments.sql.
"""
from unittest.mock import MagicMock, patch

from routes.tasks.crud import _mark_enrollment_emptied_if_last_task


def make_admin(remaining_count):
    """Admin client mock: user_quest_tasks count returns remaining_count,
    and user_quests updates are recorded."""
    admin = MagicMock()
    updates = []

    def table(name):
        chain = MagicMock()
        if name == 'user_quest_tasks':
            chain.select.return_value = chain
            chain.eq.return_value = chain
            chain.limit.return_value = chain
            chain.execute.return_value = MagicMock(count=remaining_count, data=[])
        elif name == 'user_quests':
            def capture_update(payload):
                updates.append(payload)
                return chain
            chain.update.side_effect = capture_update
            chain.eq.return_value = chain
            chain.execute.return_value = MagicMock(data=[])
        return chain

    admin.table.side_effect = table
    return admin, updates


class TestMarkEnrollmentEmptied:
    def test_last_task_removed_marks_personalization_completed(self):
        admin, updates = make_admin(remaining_count=0)

        with patch('routes.tasks.crud.get_supabase_admin_client', return_value=admin):
            emptied = _mark_enrollment_emptied_if_last_task('uq-1', 'user-1')

        assert emptied is True
        assert updates == [{'personalization_completed': True}]

    def test_tasks_still_remaining_leaves_enrollment_untouched(self):
        admin, updates = make_admin(remaining_count=3)

        with patch('routes.tasks.crud.get_supabase_admin_client', return_value=admin):
            emptied = _mark_enrollment_emptied_if_last_task('uq-1', 'user-1')

        assert emptied is False
        assert updates == []

    def test_missing_user_quest_id_is_a_no_op(self):
        # Older task rows predate user_quest_id being populated; the delete
        # already succeeded, so there is nothing to fail here.
        with patch('routes.tasks.crud.get_supabase_admin_client') as client:
            assert _mark_enrollment_emptied_if_last_task(None, 'user-1') is False
            client.assert_not_called()

    def test_bookkeeping_failure_does_not_raise(self):
        # The task was already deleted by the time this runs -- a DB problem
        # here must not surface as a 500 on a successful delete.
        admin = MagicMock()
        admin.table.side_effect = Exception("db down")

        with patch('routes.tasks.crud.get_supabase_admin_client', return_value=admin):
            assert _mark_enrollment_emptied_if_last_task('uq-1', 'user-1') is False


class TestQuestDetailDoesNotReseed:
    def test_detail_route_never_copies_template_tasks(self):
        """The read path must contain no write. Guarding by source keeps the
        self-heal from being reintroduced as an innocuous-looking two-liner."""
        import ast
        import inspect
        import routes.quest.detail as detail

        # Compare against the parsed tree, not raw text: the module explains
        # in a comment why the copy was removed, and that prose must not be
        # what keeps this test green.
        tree = ast.parse(inspect.getsource(detail))
        called = {
            node.func.id if isinstance(node.func, ast.Name) else node.func.attr
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, (ast.Name, ast.Attribute))
        }
        imported = {
            alias.name
            for node in ast.walk(tree)
            if isinstance(node, ast.ImportFrom)
            for alias in node.names
        }

        assert 'copy_template_tasks_to_enrollment' not in called | imported, (
            "quest detail must not seed tasks: a read that materializes "
            "template tasks silently undoes a student deleting their last task"
        )
