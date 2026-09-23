"""POST /end ends the enrollment it chose, not simply the newest row.

end_quest picks the ACTIVE enrollment when a person holds more than one row
for the same quest (a re-enrollment), and falls back to the newest. The write
at the end then ignored that choice and updated enrollment.data[0] -- the
newest row. When the newest row was an older, already-inactive copy, the
route "ended" that one and left the live enrollment active on the dashboard
(found 2026-09-23 while working the iCreate submissions tickets).
"""

from unittest.mock import MagicMock, patch

import pytest

QUEST = 'quest-1'


def _table(data=None):
    t = MagicMock()
    for m in ('select', 'eq', 'insert', 'update', 'order', 'limit', 'single', 'is_'):
        getattr(t, m).return_value = t
    t.execute.return_value = MagicMock(data=data)
    return t


def _end(client, enrollments):
    tables = {
        'quests': _table({'xp_threshold': None, 'lms_platform': None, 'title': 'Q'}),
        'user_quests': _table(enrollments),
        'quest_task_completions': _table([]),
        'users': _table({'organization_id': None}),
    }
    admin = MagicMock()
    admin.table.side_effect = lambda name: tables[name]
    with patch('routes.quest.completion.get_supabase_admin_client', return_value=admin), \
         patch('routes.quest.completion.WebhookService'), \
         patch('services.lti_grade_sync_service.enqueue_for_quest_completion'):
        resp = client.post(f'/api/quests/{QUEST}/end', json={'force': True},
                           headers={'Authorization': 'Bearer t'})
    return resp, tables['user_quests']


def _ended_id(user_quests):
    """The id the completion update was pinned to."""
    ids = [c.args[1] for c in user_quests.eq.call_args_list if c.args and c.args[0] == 'id']
    assert len(ids) == 1, ids
    return ids[0]


@pytest.mark.unit
def test_the_active_enrollment_is_ended_when_the_newest_row_is_an_old_copy(client, mock_verify_token):
    # Ordered created_at desc, as the route reads them: the newest row is an
    # inactive, never-finished copy; the live enrollment is the older one.
    resp, user_quests = _end(client, [
        {'id': 'uq-stale', 'is_active': False, 'completed_at': None},
        {'id': 'uq-live', 'is_active': True, 'completed_at': None},
    ])
    assert resp.status_code == 200
    assert _ended_id(user_quests) == 'uq-live'
    written = user_quests.update.call_args[0][0]
    assert written['is_active'] is False and written['completed_at']


@pytest.mark.unit
def test_with_no_active_row_the_newest_is_ended(client, mock_verify_token):
    resp, user_quests = _end(client, [
        {'id': 'uq-newest', 'is_active': False, 'completed_at': None},
        {'id': 'uq-older', 'is_active': False, 'completed_at': None},
    ])
    assert resp.status_code == 200
    assert _ended_id(user_quests) == 'uq-newest'
