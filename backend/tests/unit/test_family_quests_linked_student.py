"""Delete and uncomplete on /api/family/quests work for ANY child of the parent.

Until 2026-09-15 these two routes re-checked, after the guardian gate had
already passed, that `users.managed_by_parent_id == caller` -- so a parent
could add a task to a linked teenager's quest but not take it back, and a
co-guardian of a dependent could do neither. The owner's decision: a parent
may do everything the child can do. One gate
(verify_parent_has_access_to_child -> utils.portfolio_access.is_parent_of)
decides all four routes, and a parent's writes name the parent.
"""

import ast
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from routes import family_quests


PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
KID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
QUEST = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
TASK = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

SOURCE = Path(family_quests.__file__).read_text(encoding='utf-8')


def _innermost(view):
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    return view


class _Query:
    """A PostgREST chain that answers per table and records writes."""

    def __init__(self, table, answers, log):
        self._table, self._answers, self._log = table, answers, log
        self.filters = {}
        self._single = False

    def __getattr__(self, name):
        def chain(*args, **kwargs):
            if name in ('eq',) and len(args) == 2:
                self.filters[args[0]] = args[1]
            if name in ('single', 'maybe_single'):
                self._single = True
            if name in ('delete', 'update', 'insert'):
                self._log.append((name, self._table, args[0] if args else None))
            return self
        return chain

    def execute(self):
        result = MagicMock()
        answer = self._answers.get(self._table)
        rows = answer(self.filters) if callable(answer) else answer
        # .single() answers one row, the way PostgREST does
        if self._single and isinstance(rows, list):
            rows = rows[0] if rows else None
        result.data = rows
        return result


def _client(answers, log):
    client = MagicMock()
    client.table.side_effect = lambda name: _Query(name, answers, log)
    return client


@pytest.fixture
def app():
    return Flask(__name__)


def test_a_parent_of_a_linked_student_may_remove_a_task(app):
    log = []
    answers = {
        'user_quest_tasks': [{'id': TASK, 'title': 'Read', 'user_id': KID, 'quest_id': QUEST}],
        'quest_task_completions': [],
    }
    with app.test_request_context(f'/api/family/quests/{QUEST}/tasks/{TASK}?child_id={KID}', method='DELETE'), \
            patch.object(family_quests, 'verify_parent_role'), \
            patch.object(family_quests, 'verify_parent_has_access_to_child', return_value=True), \
            patch.object(family_quests, 'get_supabase_admin_client', return_value=_client(answers, log)):
        response = _innermost(family_quests.delete_task_for_dependent)(PARENT, QUEST, TASK)
    body, status = response
    assert status == 200, body.get_json()
    assert ('delete', 'user_quest_tasks', None) in log


def test_a_parent_of_a_linked_student_may_uncomplete_a_task(app):
    log = []
    answers = {
        'quest_task_completions': [{'id': 'c-1'}],
        'user_quest_tasks': [{'pillar': 'stem', 'xp_value': 100}],
        'user_skill_xp': [{'xp_amount': 100}],
        'users': [{'total_xp': 100}],
        'user_quests': [{'id': 'uq-1'}],
    }
    with app.test_request_context(f'/api/family/quests/{QUEST}/tasks/{TASK}/uncomplete',
                                  method='POST', json={'child_id': KID}), \
            patch.object(family_quests, 'verify_parent_role'), \
            patch.object(family_quests, 'verify_parent_has_access_to_child', return_value=True), \
            patch.object(family_quests, 'get_supabase_admin_client', return_value=_client(answers, log)):
        response = _innermost(family_quests.uncomplete_task_for_dependent)(PARENT, QUEST, TASK)
    body, status = response if isinstance(response, tuple) else (response, response.status_code)
    assert status == 200, body.get_json()
    assert any(op == 'delete' and table == 'quest_task_completions' for op, table, _ in log)


def test_a_non_guardian_is_still_refused(app):
    with app.test_request_context(f'/api/family/quests/{QUEST}/tasks/{TASK}?child_id={KID}', method='DELETE'), \
            patch.object(family_quests, 'verify_parent_role'), \
            patch.object(family_quests, 'verify_parent_has_access_to_child', return_value=False), \
            patch.object(family_quests, 'get_supabase_admin_client') as client:
        body, status = _innermost(family_quests.delete_task_for_dependent)(PARENT, QUEST, TASK)
    assert status == 403
    client.assert_not_called()


def test_the_managed_only_recheck_is_gone():
    """The second gate that refused linked students and co-guardians."""
    assert "managed_by_parent_id') != user_id" not in SOURCE
    assert 'only allowed for managed dependents' not in SOURCE


def test_a_parent_created_task_names_the_parent():
    """persist_accepted_task is called with created_by_user_id=user_id."""
    tree = ast.parse(SOURCE)
    calls = [n for n in ast.walk(tree) if isinstance(n, ast.Call)
             and getattr(n.func, 'id', None) == 'persist_accepted_task']
    assert calls, 'create_task_for_dependent no longer calls persist_accepted_task'
    for call in calls:
        kw = {k.arg: k.value for k in call.keywords}
        assert 'created_by_user_id' in kw
        assert getattr(kw['created_by_user_id'], 'id', None) == 'user_id'


def test_a_parent_enrollment_names_the_parent():
    tree = ast.parse(SOURCE)
    calls = [n for n in ast.walk(tree) if isinstance(n, ast.Call)
             and getattr(n.func, 'attr', None) == 'enroll_user']
    assert calls
    for call in calls:
        kw = {k.arg: k.value for k in call.keywords}
        assert getattr(kw.get('enrolled_by_user_id'), 'id', None) == 'user_id'
