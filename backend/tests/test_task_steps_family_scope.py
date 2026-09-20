"""
A parent breaks a child's task into steps from the family scope.

Sara Cartwright, 2026-09-19. Working through Ella's quest as herself (the
family scope, 2026-09-14), she clicked Break It Down and got a 500. The five
task-step routes scoped every read by the caller alone, so the parent's click
looked for a task she does not own; and the service read it with `.single()`,
which raises on zero rows before the "not found" branch can run (Sentry
OPTIO-BACKEND 7741782500 and OPTIO-WEB 7741782549).

What this file pins:
  - `student_id` on the request points the read at the child, guardian-checked
  - a caller who is not that child's guardian gets a 403, not the steps
  - a task that is not there is a 404, never a 500
  - without `student_id` nothing changes: the caller's own task, as before
"""

import inspect
from unittest.mock import Mock, patch

from flask import Flask

import routes.task_steps as routes
from services.task_steps_service import TaskStepsNotFound
from utils.guardian_scope import GuardianAccessError


PARENT = '11111111-1111-4111-8111-111111111111'
CHILD = '22222222-2222-4222-8222-222222222222'
STRANGER = '33333333-3333-4333-8333-333333333333'
TASK = '44444444-4444-4444-8444-444444444444'
STEP = '55555555-5555-4555-8555-555555555555'


def _call(handler, *args, query=None, json=None, service=None, guardian_of=(CHILD,)):
    """Drive one route with the auth and AI-access decorators unwrapped and
    the guardian check answered from `guardian_of`."""
    fn = inspect.unwrap(handler)
    app = Flask(__name__)
    service = service or Mock()

    def relationship(caller, student):
        return {'via': 'parent'} if student in guardian_of else None

    kwargs = {'query_string': query or {}}
    if json is not None:
        kwargs['json'] = json
    with app.test_request_context('/', **kwargs):
        with patch.object(routes, 'require_ai_access', return_value=None), \
             patch.object(routes, 'task_steps_service', service), \
             patch('utils.guardian_scope.guardian_relationship', side_effect=relationship), \
             patch('utils.guardian_scope._log_delegated_read'):
            resp = fn(PARENT, *args)
    body, status = (resp if isinstance(resp, tuple) else (resp, 200))
    return body.get_json(), status, service


def test_generate_for_a_child_reads_the_childs_task():
    service = Mock()
    service.generate_steps.return_value = {'success': True, 'steps': [], 'granularity': 'quick'}

    body, status, service = _call(routes.generate_steps, TASK,
                                  json={'granularity': 'quick', 'student_id': CHILD},
                                  service=service)

    assert status == 200
    assert body['success'] is True
    assert service.generate_steps.call_args.kwargs['user_id'] == CHILD


def test_get_steps_for_a_child_reads_the_childs_steps():
    service = Mock()
    service.get_steps.return_value = [{'id': STEP}]

    body, status, service = _call(routes.get_steps, TASK,
                                  query={'student_id': CHILD}, service=service)

    assert status == 200
    assert body['steps'] == [{'id': STEP}]
    assert service.get_steps.call_args.kwargs['user_id'] == CHILD


def test_toggle_and_drill_down_and_delete_are_scoped_the_same_way():
    service = Mock()
    service.toggle_step.return_value = {'success': True, 'step_id': STEP, 'is_completed': True}
    service.drill_down_step.return_value = {'success': True, 'steps': [], 'parent_step_id': STEP}
    service.delete_all_steps.return_value = {'success': True, 'task_id': TASK}

    _call(routes.toggle_step, TASK, STEP, query={'student_id': CHILD}, service=service)
    _call(routes.drill_down_step, TASK, STEP, json={'student_id': CHILD}, service=service)
    _call(routes.delete_all_steps, TASK, query={'student_id': CHILD}, service=service)

    assert service.toggle_step.call_args.kwargs['user_id'] == CHILD
    assert service.drill_down_step.call_args.kwargs['user_id'] == CHILD
    assert service.delete_all_steps.call_args.kwargs['user_id'] == CHILD


def test_without_student_id_the_caller_reads_their_own_task():
    service = Mock()
    service.get_steps.return_value = []

    _body, status, service = _call(routes.get_steps, TASK, service=service)

    assert status == 200
    assert service.get_steps.call_args.kwargs['user_id'] == PARENT


def test_a_stranger_gets_403_and_the_service_is_never_asked():
    service = Mock()

    body, status, service = _call(routes.generate_steps, TASK,
                                  json={'student_id': STRANGER}, service=service,
                                  guardian_of=(CHILD,))

    assert status == 403
    assert body['success'] is False
    assert not service.generate_steps.called


def test_a_missing_task_is_404_not_500():
    service = Mock()
    service.generate_steps.side_effect = TaskStepsNotFound('Task not found or not owned by user')

    body, status, _service = _call(routes.generate_steps, TASK,
                                   json={'student_id': CHILD}, service=service)

    assert status == 404
    assert body == {'success': False, 'error': 'Task not found or not owned by user'}


def test_a_missing_step_on_toggle_is_404_too():
    service = Mock()
    service.toggle_step.side_effect = TaskStepsNotFound('Step not found or not owned by user')

    _body, status, _service = _call(routes.toggle_step, TASK, STEP, service=service)

    assert status == 404


def test_the_guardian_check_is_the_shared_one():
    """The route must not grow its own idea of who a guardian is."""
    service = Mock()
    service.get_steps.return_value = []
    with patch.object(routes, 'resolve_student_scope_from_request',
                      side_effect=GuardianAccessError('nope')):
        body, status, _ = _call(routes.get_steps, TASK, query={'student_id': CHILD}, service=service)
    assert status == 403
    assert body['error'] == 'nope'
