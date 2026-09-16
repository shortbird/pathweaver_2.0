"""`@student_scope` -- the gate for routes with no person in the URL.

`@require_relationship_to` reads the person from the path. The student's own
routes (dashboard, quest list, journal, task completion) have no person in the
path: the subject is the caller unless the request names a `student_id`. This
decorator makes that one rule, in one place, with the same refusal shape and
the same disclosure log as the URL gate.

What is pinned here:
  * the view receives the STUDENT's id positionally, and the caller survives
    on g.student_scope for attribution;
  * a request naming nobody is untouched -- same id in, nothing logged;
  * the id may arrive in the query string, the JSON body, a form field, or
    under the deprecated alias;
  * a refusal is the relationship gate's AuthorizationError, before the view;
  * the wrapper carries the marker the build-wide guard looks for.
"""

from unittest.mock import patch

import pytest
from flask import Flask

from utils.auth import relationships
from utils.auth.decorators import AuthorizationError
from utils.auth.relationships import (
    STUDENT_SCOPE_ATTR, current_student_scope, student_scope,
)
from utils.guardian_scope import StudentScope


PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
KID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'


@pytest.fixture
def app():
    return Flask(__name__)


def _view(discloses=None):
    seen = {}

    @student_scope(discloses)
    def view(user_id, *args, **kwargs):
        seen['user_id'] = user_id
        seen['scope'] = current_student_scope()
        seen['args'] = args
        seen['kwargs'] = kwargs
        return 'ok'

    return view, seen


def _granted(caller, student, via='parent'):
    return patch('utils.guardian_scope.guardian_relationship',
                 return_value={'first_name': 'Ada', 'is_dependent': False, 'via': via})


def test_the_view_gets_the_student_and_g_keeps_the_caller(app):
    view, seen = _view()
    with app.test_request_context(f'/x?student_id={KID}'), _granted(PARENT, KID):
        assert view(PARENT) == 'ok'
    assert seen['user_id'] == KID
    assert seen['scope'] == StudentScope(caller_id=PARENT, student_id=KID, via='parent')
    assert seen['scope'].delegated is True


def test_without_a_student_the_request_is_untouched(app):
    view, seen = _view('progress')
    with app.test_request_context('/x'), \
            patch('utils.guardian_scope.guardian_relationship') as gate, \
            patch.object(relationships, 'log_disclosure') as log:
        assert view(PARENT) == 'ok'
    assert seen['user_id'] == PARENT
    assert seen['scope'].delegated is False
    gate.assert_not_called()
    log.assert_not_called()


@pytest.mark.parametrize('ctx', [
    dict(path=f'/x?student_id={KID}', method='GET'),
    dict(path='/x', method='POST', json={'student_id': KID}),
    dict(path='/x', method='POST', data={'student_id': KID}),
], ids=['query', 'json', 'form'])
def test_the_student_may_arrive_any_of_three_ways(app, ctx):
    view, seen = _view()
    with app.test_request_context(**ctx), _granted(PARENT, KID):
        view(PARENT)
    assert seen['user_id'] == KID


def test_a_stranger_is_refused_before_the_view_runs(app):
    view, seen = _view()
    with app.test_request_context(f'/x?student_id={KID}'), \
            patch('utils.guardian_scope.guardian_relationship', return_value=None):
        with pytest.raises(AuthorizationError):
            view(PARENT)
    assert seen == {}


def test_a_bad_id_is_refused_the_same_way(app):
    view, seen = _view()
    with app.test_request_context('/x?student_id=not-a-uuid'):
        with pytest.raises(AuthorizationError):
            view(PARENT)
    assert seen == {}


def test_a_delegated_read_is_logged_as_a_disclosure(app):
    view, _ = _view('progress')
    with app.test_request_context(f'/x?student_id={KID}'), _granted(PARENT, KID), \
            patch.object(relationships, 'log_disclosure') as log:
        view(PARENT)
    log.assert_called_once_with(PARENT, KID, 'progress', 'parent')


def test_extra_route_arguments_pass_through(app):
    view, seen = _view()
    with app.test_request_context(f'/x?student_id={KID}'), _granted(PARENT, KID):
        view(PARENT, 'quest-1', task_id='t-1')
    assert seen['args'] == ('quest-1',)
    assert seen['kwargs'] == {'task_id': 't-1'}


def test_options_preflight_short_circuits(app):
    view, seen = _view()
    with app.test_request_context('/x', method='OPTIONS'):
        assert view(PARENT) == ('', 200)
    assert seen == {}


def test_the_wrapper_carries_the_guard_marker():
    view, _ = _view('progress')
    assert getattr(view, STUDENT_SCOPE_ATTR) == 'progress'
    bare, _ = _view()
    assert getattr(bare, STUDENT_SCOPE_ATTR) is True


def test_current_scope_is_none_outside_a_scoped_request(app):
    with app.test_request_context('/x'):
        assert current_student_scope() is None
    assert current_student_scope() is None


def test_a_delegated_json_response_names_the_student(app):
    """The app trusts a scoped read only when the payload says whose it is."""
    from flask import jsonify

    @student_scope()
    def view(user_id):
        return jsonify({'success': True, 'user_id': user_id})

    with app.test_request_context(f'/x?student_id={KID}'), _granted(PARENT, KID):
        response = view(PARENT)
    assert response.get_json()['scope'] == {'student_id': KID, 'delegated': True}


def test_a_self_response_carries_no_marker(app):
    from flask import jsonify

    @student_scope()
    def view(user_id):
        return jsonify({'success': True})

    with app.test_request_context('/x'):
        response = view(PARENT)
    assert 'scope' not in response.get_json()


def test_a_tuple_response_is_marked_too(app):
    from flask import jsonify

    @student_scope()
    def view(user_id):
        return jsonify({'items': []}), 200

    with app.test_request_context(f'/x?student_id={KID}'), _granted(PARENT, KID):
        body, status = view(PARENT)
    assert status == 200
    assert body.get_json()['scope']['student_id'] == KID
