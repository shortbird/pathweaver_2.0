"""
GET /api/tasks/authoring-rules with a task_id that is not a task.

Tickets a1757214 / badbc85f / 40fdda03 (Sentry, 2026-09-28): the web quest page
offered Edit on a moment, a virtual task with id "moment-<uuid>"
(routes/quest/detail.py). The editor asked for its rules, TaskRepository
compared that id against the uuid column, Postgres refused it with 22P02, and
the route answered 500. No task row can have an id that is not a uuid, so the
honest answer is 404, without asking the database at all.
"""

import uuid
from unittest.mock import Mock, patch

import pytest

import app  # noqa: F401 — import graph ordering
from routes.tasks import rules


def _call(task_id, owned=True):
    view = rules.authoring_rules
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    repo = Mock()
    repo.is_owned_by.return_value = owned
    from flask import Flask
    flask_app = Flask(__name__)
    with flask_app.test_request_context('/api/tasks/authoring-rules', query_string={'task_id': task_id}), \
         patch.object(rules, 'current_student_scope', return_value=None), \
         patch.object(rules, 'get_effective_role_for', return_value='student'), \
         patch.object(rules, 'is_xp_guide', return_value=False), \
         patch.object(rules, 'requires_success_criteria', return_value=True), \
         patch.object(rules, 'xp_locked_for_learner', return_value=False), \
         patch.object(rules, 'pillars_hidden_by_age', return_value=False), \
         patch.object(rules, 'user_org_has_feature', return_value=False), \
         patch.object(rules, 'criteria_locked', return_value=False), \
         patch.object(rules, 'TaskRepository', return_value=repo):
        resp = view('student-1')
    body, status = resp if isinstance(resp, tuple) else (resp, resp.status_code)
    return body.get_json(), status, repo


@pytest.mark.unit
def test_a_moment_id_is_not_found_and_never_reaches_the_database():
    body, status, repo = _call('moment-915a0ca3-a8e4-4e67-a376-4a9471452d28')
    assert status == 404
    assert body['success'] is False
    repo.is_owned_by.assert_not_called()


@pytest.mark.unit
def test_a_real_task_of_the_learner_still_answers_with_the_lock():
    task_id = str(uuid.uuid4())
    body, status, repo = _call(task_id)
    assert status == 200
    assert body['criteria_locked'] is False
    repo.is_owned_by.assert_called_once_with(task_id, 'student-1')


@pytest.mark.unit
def test_a_uuid_that_is_not_the_learners_task_is_not_found():
    body, status, _ = _call(str(uuid.uuid4()), owned=False)
    assert status == 404
