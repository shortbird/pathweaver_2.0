"""GET /api/tasks/<id>/credit-history answers whoever may read the work.

The route knew three readers -- the owner, an assigned advisor, a
superadmin -- and refused everyone else, including the student's parent,
who reached it from the child's own task page where the credit thread
beside it had already answered (2026-09-21, an iCreate parent). The rule
is now utils.portfolio_access.can_view_portfolio, the one the credit
thread, the XP goal and the portfolio itself use, with peers excluded.
"""

from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from routes.tasks import credit

STUDENT = '0a3e3522-c31c-475d-ba38-000000000001'
PARENT = 'fc9281f4-fbc6-465d-b791-000000000002'
STRANGER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
TASK = 'a3aff920-6e64-46bd-a64b-000000000003'


def _innermost(view):
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    return view


@pytest.fixture
def app():
    return Flask(__name__)


def _client(completion_rows):
    client = MagicMock()

    def table(name):
        q = MagicMock()
        for chain in ('select', 'eq', 'in_', 'order', 'single', 'limit'):
            getattr(q, chain).return_value = q
        result = MagicMock()
        result.data = completion_rows if name == 'quest_task_completions' else []
        q.execute.return_value = result
        return q

    client.table.side_effect = table
    return client


def _get(app, caller, may_view, completion_rows=None):
    if completion_rows is None:
        completion_rows = [{'id': 'c-1', 'user_id': STUDENT, 'diploma_status': 'pending_org_approval', 'revision_number': 2}]
    with app.test_request_context(f'/api/tasks/{TASK}/credit-history'), \
            patch.object(credit, 'get_supabase_admin_client', return_value=_client(completion_rows)), \
            patch('utils.portfolio_access.can_view_portfolio', return_value=may_view) as can_view, \
            patch('services.portfolio_service.PortfolioService'):
        response, status = _innermost(credit.get_credit_history)(caller, TASK)
    return response.get_json(), status, can_view


def test_a_parent_reads_their_childs_review_trail(app):
    body, status, can_view = _get(app, PARENT, may_view=True)
    assert status == 200, body
    assert body['data']['completion_id'] == 'c-1'
    assert body['data']['revision_number'] == 2
    can_view.assert_called_once_with(PARENT, STUDENT, allow_peers=False)


def test_anyone_the_portfolio_rule_refuses_is_refused_here(app):
    body, status, _ = _get(app, STRANGER, may_view=False)
    assert status == 403
    assert body['error']['code'] == 'FORBIDDEN'


def test_the_rule_is_asked_about_the_completions_owner_not_the_caller(app):
    # The student id comes from the completion row, never from the request.
    _, _, can_view = _get(app, STRANGER, may_view=False)
    assert can_view.call_args.args == (STRANGER, STUDENT)


def test_no_completion_is_a_404_before_any_access_question(app):
    body, status, can_view = _get(app, PARENT, may_view=True, completion_rows=[])
    assert status == 404
    can_view.assert_not_called()
