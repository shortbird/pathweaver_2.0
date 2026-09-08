"""Reopening a quest is not a Canvas privilege.

A Hearthwood parent, showing her 9th-grader how to submit a biology lab, ended
the whole subject by mistake: /end fired four seconds after the task workspace
opened, with seven of nine tasks still to do. Every screen then treated High
School Biology as finished and dropped the remaining tasks off the student's
dashboard and the parent's feed.

There was already an endpoint that undoes exactly that -- POST /reopen, added
for the Canvas LTI resubmit flow -- and it refused with a 400 on any quest whose
`lms_platform` was not 'canvas'. The stated reason was that reopening an
ordinary Optio quest had "UX implications we haven't designed yet". Meanwhile
POST /start already performs the identical write (is_active=true,
completed_at=null) for an existing enrollment, so the gate was not protecting an
invariant; it was protecting an unwritten design doc, and it cost a family the
only in-app route back from a one-tap mistake.

These tests pin the gate open.
"""

from unittest.mock import MagicMock, patch

import pytest


USER = 'test-user-123'
QUEST = 'quest-1'


def _table(data=None):
    t = MagicMock()
    for m in ('select', 'eq', 'insert', 'update', 'order', 'limit', 'single', 'is_'):
        getattr(t, m).return_value = t
    t.execute.return_value = MagicMock(data=data)
    return t


@pytest.fixture
def tables():
    return {
        # An ordinary Optio quest -- no LMS anywhere near it.
        'quests': _table({'lms_platform': None}),
        # The enrollment as /end left it: ended, nothing else changed.
        'user_quests': _table([
            {'id': 'uq-1', 'is_active': False, 'completed_at': '2026-09-05T21:33:50Z'},
        ]),
    }


@pytest.fixture
def admin(tables):
    client = MagicMock()
    client.table.side_effect = lambda name: tables[name]
    with patch('routes.quest.completion.get_supabase_admin_client',
               return_value=client):
        yield client


def _reopen(client):
    return client.post(
        f'/api/quests/{QUEST}/reopen',
        json={},
        headers={'Authorization': 'Bearer t'},
    )


@pytest.mark.unit
class TestReopeningAnEndedQuest:
    def test_a_non_canvas_quest_can_be_reopened(
            self, client, mock_verify_token, admin, tables):
        """The regression. This used to be a 400 with
        'Reopen is only supported for Canvas LTI quests in v1'."""
        response = _reopen(client)

        assert response.status_code == 200
        assert response.get_json()['success'] is True

    def test_reopening_clears_the_end(self, client, mock_verify_token, admin, tables):
        """Both columns, or the quest stays hidden from the dashboard: the
        active-quest reads filter on is_active, the detail page on completed_at."""
        _reopen(client)

        written = tables['user_quests'].update.call_args[0][0]
        assert written['is_active'] is True
        assert written['completed_at'] is None

    def test_it_only_touches_the_callers_own_enrollment(
            self, client, mock_verify_token, admin, tables):
        """The route runs on the admin client, so the user filter is the only
        thing standing between a student and somebody else's enrollment."""
        _reopen(client)

        filters = [c.args for c in tables['user_quests'].eq.call_args_list]
        assert ('user_id', USER) in filters
        assert ('quest_id', QUEST) in filters

    def test_an_already_open_quest_is_a_no_op(
            self, client, mock_verify_token, admin, tables):
        """Double-tap, or a second device. Reopening twice must not re-write
        anything, or a genuinely finished quest would lose its completion date."""
        tables['user_quests'].execute.return_value = MagicMock(data=[
            {'id': 'uq-1', 'is_active': True, 'completed_at': None},
        ])

        response = _reopen(client)

        assert response.status_code == 200
        assert response.get_json()['already_active'] is True
        tables['user_quests'].update.assert_not_called()

    def test_someone_who_never_enrolled_gets_a_404(
            self, client, mock_verify_token, admin, tables):
        tables['user_quests'].execute.return_value = MagicMock(data=[])

        response = _reopen(client)

        assert response.status_code == 404
