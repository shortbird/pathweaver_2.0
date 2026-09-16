"""A parent may finish a task for ANY child of theirs, and the row says so.

Paige Hanna's report (2026-09-14): she could not mark her 12-year-old's task
done because he has his own login. The completion route admitted a parent
through DependentRepository.get_dependent, which filters on
users.is_dependent -- a managed, under-13, no-login profile -- so a child with
an email address was invisible to it and the parent got a 403 that read
"You do not have permission to manage this dependent profile".

Now the route sits behind @student_scope: the same guardian definition as
every other student-scoped route (managed_by_parent_id, an approved
parent_student_links row, or a shared household), and the completion records
the parent as completed_by_user_id so the teacher reading it knows who
pressed the button.

The route is driven only as far as the completion insert: create_completion
raises to stop the request there, because everything after it (XP, quest
completion, webhooks) is the student's own path and has its own tests.
"""

import ast
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from routes.tasks import completion as completion_route
from utils.auth.relationships import STUDENT_SCOPE_ATTR


PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
KID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
TASK = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
QUEST = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

ROUTE_SOURCE = Path(completion_route.__file__).read_text(encoding='utf-8')


class _Stop(ValueError):
    """Raised by the completion stub so the route returns right after it."""


def _innermost(view):
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    return view


@pytest.fixture
def app():
    return Flask(__name__)


def _drive(app, caller, form, *, granted):
    """Run the route as `caller` with `form`, and return what create_completion
    was handed (or the response, when the gate refused)."""
    from repositories.task_repository import TaskCompletionRepository, TaskRepository

    captured = {}

    def create_completion(_self, payload):
        captured['payload'] = payload
        raise _Stop('stop here')

    rel = ({'first_name': 'Romney', 'is_dependent': False, 'via': 'parent'}
           if granted else None)

    # @require_auth is the outermost decorator; the test enters below it, at
    # @student_scope, with the caller's id -- exactly what require_auth passes.
    scoped = completion_route.complete_task.__wrapped__
    assert getattr(scoped, STUDENT_SCOPE_ATTR, None)

    with app.test_request_context(f'/api/tasks/{TASK}/complete', method='POST', data=form), \
            patch('utils.guardian_scope.guardian_relationship', return_value=rel), \
            patch.object(completion_route, 'get_supabase_admin_client', return_value=MagicMock()), \
            patch.object(TaskRepository, 'get_task_with_relations',
                         return_value={'quest_id': QUEST, 'approval_status': 'approved',
                                       'xp_value': 100, 'pillar': 'stem'}), \
            patch.object(TaskCompletionRepository, 'check_existing_completion', return_value=False), \
            patch.object(TaskCompletionRepository, 'create_completion', create_completion), \
            patch('utils.treehouse.is_treehouse_member', return_value=False), \
            patch.object(completion_route, '_task_has_evidence', return_value=True):
        try:
            response = scoped(caller, TASK)
        except Exception as e:  # the relationship gate raises AuthorizationError
            return captured, e
    return captured, response


def test_a_parent_of_a_linked_student_completes_and_is_recorded(app):
    """Paige's case: the child has his own login (is_dependent False) and the
    tie is a parent_student_link. The completion lands on the CHILD and names
    the PARENT."""
    captured, _ = _drive(app, PARENT, {'student_id': KID}, granted=True)
    payload = captured['payload']
    assert payload['user_id'] == KID
    assert payload['completed_by_user_id'] == PARENT


def test_the_retired_field_name_is_ignored(app):
    """acting_as_dependent_id was read as an alias until 2026-09-15. A request
    that sends only that name is now the caller completing their own task:
    the alias is not silently honoured, and it is not a 403 either."""
    captured, _ = _drive(app, PARENT, {'acting_as_dependent_id': KID}, granted=False)
    assert captured['payload']['user_id'] == PARENT
    assert captured['payload']['completed_by_user_id'] is None


def test_a_student_completing_their_own_task_is_not_attributed_to_anyone(app):
    captured, _ = _drive(app, KID, {}, granted=False)
    payload = captured['payload']
    assert payload['user_id'] == KID
    assert payload['completed_by_user_id'] is None


def test_a_stranger_is_refused_before_any_write(app):
    from utils.auth.decorators import AuthorizationError
    captured, outcome = _drive(app, PARENT, {'student_id': KID}, granted=False)
    assert isinstance(outcome, AuthorizationError)
    assert captured == {}


def test_the_managed_only_gate_is_gone():
    """The 403 Paige hit came from DependentRepository.get_dependent's
    is_dependent filter. The route must not consult it again; the guardian
    decision has one owner now (utils/guardian_scope)."""
    tree = ast.parse(ROUTE_SOURCE)
    names = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)} | \
            {n.attr for n in ast.walk(tree) if isinstance(n, ast.Attribute)}
    assert 'DependentRepository' not in names
    assert 'get_dependent' not in names
    assert "request.form.get('acting_as_dependent_id')" not in ROUTE_SOURCE
