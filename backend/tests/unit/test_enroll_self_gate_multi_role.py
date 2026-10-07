"""Self-enrollment refuses only accounts with no learner role of their own.

Ticket 5900dcc0-4d67-42d2-964e-6f839919b70b (Sentry optio-web 7778836988),
2026-10-07. An Apogee Central Florida parent who also runs the school
(role='org_managed', org_roles=['parent', 'org_admin']) pressed Start Quest
on a catalog quest and got 403 ROLE_NOT_ALLOWED. The web gives an org admin
who is also a parent a surface of their own (worksThroughFamily is false),
so it sent the enroll unscoped; the backend asked only the PRIMARY role,
org_roles[0] = 'parent', and refused. The same two roles saved in the other
order passed. The gate now asks every role the account holds.
"""

import inspect
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from routes.quest import enrollment
from utils.guardian_scope import StudentScope

CALLER = '8ef8c884-0000-4000-8000-000000000001'
QUEST = '37f52b88-0000-4000-8000-000000000002'


def _org(*roles):
    return {'id': CALLER, 'role': 'org_managed', 'org_role': roles[0],
            'org_roles': list(roles), 'organization_id': 'org-1'}


class _Query:
    def __init__(self, rows):
        self._rows = rows

    def __getattr__(self, _name):
        return lambda *a, **k: self

    def execute(self):
        return MagicMock(data=self._rows)


def _enroll_as_self(caller_row):
    """POST /enroll with no student_id. The quest lookup returns nothing, so
    a caller who passes the role gate stops at 404 and one who fails it
    stops at 403 -- the status says which side of the gate they landed on."""
    admin = MagicMock()
    admin.table.side_effect = lambda name: _Query(caller_row)
    quest_repo = MagicMock()
    quest_repo.find_by_id.return_value = None
    scope = StudentScope(caller_id=CALLER, student_id=CALLER, via='self')

    view = inspect.unwrap(enrollment.enroll_in_quest)
    app = Flask(__name__)
    with app.test_request_context(f'/api/quests/{QUEST}/enroll', method='POST', json={}), \
            patch.object(enrollment, 'current_student_scope', return_value=scope), \
            patch.object(enrollment, 'get_supabase_admin_client', return_value=admin), \
            patch.object(enrollment, 'QuestRepository', return_value=quest_repo):
        response = view(CALLER, QUEST)
    body, status = response if isinstance(response, tuple) else (response, 200)
    return body.get_json(), status


@pytest.mark.unit
def test_parent_who_is_also_org_admin_passes_the_gate():
    """The ticket's account, roles in the order the database holds them."""
    payload, status = _enroll_as_self(_org('parent', 'org_admin'))
    assert status == 404, payload
    assert payload['error']['code'] == 'QUEST_NOT_FOUND'


@pytest.mark.unit
@pytest.mark.parametrize('roles', [
    ('parent', 'org_admin'),
    ('org_admin', 'parent'),
    ('parent', 'advisor'),
    ('observer', 'student'),
])
def test_role_order_does_not_decide(roles):
    assert enrollment.self_enrollment_refused(_org(*roles)) is False


@pytest.mark.unit
@pytest.mark.parametrize('row', [
    _org('parent'),
    _org('parent', 'observer'),
    {'id': CALLER, 'role': 'parent', 'org_role': None, 'org_roles': None,
     'organization_id': None},
    {'id': CALLER, 'role': 'observer', 'org_role': None, 'org_roles': None,
     'organization_id': None},
], ids=['org-parent', 'org-parent-observer', 'platform-parent', 'platform-observer'])
def test_parent_or_observer_only_is_still_refused(row):
    payload, status = _enroll_as_self(row)
    assert status == 403, payload
    assert payload['error']['code'] == 'ROLE_NOT_ALLOWED'


@pytest.mark.unit
def test_student_passes_the_gate():
    _, status = _enroll_as_self(_org('student'))
    assert status == 404
