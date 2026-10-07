"""Save for later: the quest page's non-destructive exit.

Ticket e17134c6-4d17-432d-a075-4e6e89174282 (iCreate org admin, 2026-10-06):
"You have 'End Quest' but that's not super clear what that means. And I
didn't dare select that because I was worried I might end the quest on
accident and I didn't know what would happen."

The single "End quest" button became two: "Save for later" (POST
/api/quests/<id>/archive, which keeps every task and all XP and moves the
quest to Saved for Later) and "Mark done" (POST /end). What this file pins on
the backend side of that:

  - a parent in family scope saves the CHILD's quest for later, not their own
    (student_id, the same guardian check /end uses). Before, the parent's
    only non-destructive exit was End; without this the button would have
    404'd and left them "Remove quest", which reverses the XP.
  - a caller who is not that child's guardian is refused
  - without student_id the caller's own row is archived, as before
  - Resume (/unarchive) follows the same scope
  - starting a saved quest again from its page clears the archive, so it
    comes back to the active list instead of staying hidden there
"""

from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

import routes.quest_lifecycle as routes
from middleware.error_handler import AuthorizationError


PARENT = '11111111-1111-4111-8111-111111111111'
CHILD = '22222222-2222-4222-8222-222222222222'
STRANGER = '33333333-3333-4333-8333-333333333333'
QUEST = '44444444-4444-4444-8444-444444444444'


class _Recorder:
    """A PostgREST chain that records the update payload and every filter."""

    def __init__(self, rows=None):
        self.rows = rows if rows is not None else [{'id': 'uq-1'}]
        self.updates, self.filters = [], []

    def table(self, _name):
        return self

    def update(self, payload):
        self.updates.append(payload)
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    @property
    def not_(self):
        return self

    def __getattr__(self, _name):
        return lambda *a, **k: self

    def execute(self):
        result = MagicMock()
        result.data = self.rows
        return result


def _call(handler, caller, json=None, guardian_of=(CHILD,)):
    """Run the route below @require_auth, so @student_scope still runs, with
    the guardian check answered from `guardian_of`."""
    app = Flask(__name__)
    client = _Recorder()

    def relationship(_caller, student):
        return {'via': 'parent', 'first_name': 'Kid', 'is_dependent': False} \
            if student in guardian_of else None

    with app.test_request_context('/', method='POST', json=json or {}):
        with patch.object(routes, 'get_supabase_admin_client', return_value=client), \
             patch('utils.guardian_scope.guardian_relationship', side_effect=relationship), \
             patch('utils.guardian_scope._log_delegated_read'):
            resp = handler.__wrapped__(caller, QUEST)
    body, status = resp if isinstance(resp, tuple) else (resp, 200)
    return body.get_json(), status, client


def test_a_parent_saves_the_childs_quest_for_later_not_their_own():
    body, status, client = _call(routes.archive_enrollment, PARENT,
                                 json={'student_id': CHILD})

    assert status == 200 and body['success'] is True
    assert ('user_id', CHILD) in client.filters
    assert ('user_id', PARENT) not in client.filters
    # Non-destructive: off the active list, nothing marked complete.
    assert client.updates[0]['is_active'] is False
    assert client.updates[0]['archived_at']
    assert 'completed_at' not in client.updates[0]


def test_a_stranger_cannot_save_someone_elses_quest():
    with pytest.raises(AuthorizationError):
        _call(routes.archive_enrollment, STRANGER, json={'student_id': CHILD}, guardian_of=())


def test_without_student_id_the_caller_saves_their_own_quest():
    _body, status, client = _call(routes.archive_enrollment, CHILD)

    assert status == 200
    assert ('user_id', CHILD) in client.filters


def test_resume_follows_the_same_scope():
    _body, status, client = _call(routes.unarchive_enrollment, PARENT,
                                  json={'student_id': CHILD})

    assert status == 200
    assert ('user_id', CHILD) in client.filters
    assert client.updates[0]['is_active'] is True
    assert client.updates[0]['archived_at'] is None


def test_starting_a_saved_quest_again_clears_the_archive():
    """The confirm promises the quest can be picked up again. Started again
    from its page (enroll -> enroll_user), the row went active with archived_at
    still set, so the dashboard's active list skipped it and Saved for Later
    kept listing it."""
    from repositories.quest_repository import QuestRepository

    client = _Recorder(rows=[{'id': 'uq-1', 'is_active': False, 'archived_at': '2026-10-07T00:00:00Z'}])
    with patch('database.get_supabase_admin_client', return_value=client):
        QuestRepository.enroll_user(MagicMock(), CHILD, QUEST)

    assert client.updates, 'expected the saved enrollment to be reactivated'
    assert client.updates[0]['is_active'] is True
    assert client.updates[0]['archived_at'] is None
