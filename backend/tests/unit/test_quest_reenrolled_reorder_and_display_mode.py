"""Reorder and display-mode work for a student who holds two enrollment rows.

A student who finished a quest and picked it up again holds two user_quests
rows for it. Both routes looked the enrollment up with maybe_single(), and
postgrest-py turns PostgREST's "more than one row" error into an opaque
APIError "Missing response" (code 204), so dragging a task on that quest
500'd. Found 2026-10-12 from Sentry (tickets 5832139d, bd345dbd, ff2f7c6e):
a parent reordering their child's re-started Math Academy quest.
"""

from unittest.mock import MagicMock, patch

import pytest
from postgrest.exceptions import APIError

QUEST = 'quest-1'
TASK_A = '11111111-1111-4111-8111-111111111111'
TASK_B = '22222222-2222-4222-8222-222222222222'


def _table(data=None):
    t = MagicMock()
    for m in ('select', 'eq', 'update', 'order', 'limit'):
        getattr(t, m).return_value = t
    t.execute.return_value = MagicMock(data=data)
    # The old code path: maybe_single() on two rows raises, exactly as
    # postgrest-py 1.1.1 does.
    t.maybe_single.return_value.execute.side_effect = APIError({
        'message': 'Missing response', 'code': '204',
        'hint': 'Please check traceback of the code', 'details': '',
    })
    return t


def _admin(user_quests, user_quest_tasks=None):
    tables = {'user_quests': user_quests, 'user_quest_tasks': user_quest_tasks or _table([])}
    admin = MagicMock()
    admin.table.side_effect = lambda name: tables[name]
    return admin


TWO_ROWS = [
    {'id': 'uq-restart', 'is_active': True},
    {'id': 'uq-finished', 'is_active': False},
]


@pytest.mark.unit
def test_reorder_succeeds_with_two_enrollment_rows(client, mock_verify_token):
    tasks = _table([])
    admin = _admin(_table(TWO_ROWS[:1]), tasks)
    with patch('routes.quest.completion.get_supabase_admin_client', return_value=admin):
        resp = client.put(f'/api/quests/{QUEST}/tasks/reorder',
                          json={'task_ids': [TASK_B, TASK_A]},
                          headers={'Authorization': 'Bearer t'})
    assert resp.status_code == 200, resp.get_json()
    written = [c.args[0] for c in tasks.update.call_args_list]
    assert written == [{'order_index': 0}, {'order_index': 1}]


@pytest.mark.unit
def test_reorder_still_404s_when_not_enrolled(client, mock_verify_token):
    tasks = _table([])
    admin = _admin(_table([]), tasks)
    with patch('routes.quest.completion.get_supabase_admin_client', return_value=admin):
        resp = client.put(f'/api/quests/{QUEST}/tasks/reorder',
                          json={'task_ids': [TASK_A]},
                          headers={'Authorization': 'Bearer t'})
    assert resp.status_code == 404
    tasks.update.assert_not_called()


def _display_mode(client, rows):
    user_quests = _table(rows)
    with patch('routes.quest.completion.get_supabase_admin_client', return_value=_admin(user_quests)):
        resp = client.put(f'/api/quests/{QUEST}/display-mode',
                          json={'display_mode': 'flexible'},
                          headers={'Authorization': 'Bearer t'})
    return resp, user_quests


def _updated_id(user_quests):
    ids = [c.args[1] for c in user_quests.eq.call_args_list if c.args and c.args[0] == 'id']
    assert len(ids) == 1, ids
    return ids[0]


@pytest.mark.unit
def test_display_mode_updates_the_active_row_of_two(client, mock_verify_token):
    # Newest first, as the route reads them; the newest is the finished copy.
    resp, user_quests = _display_mode(client, [
        {'id': 'uq-finished', 'is_active': False},
        {'id': 'uq-restart', 'is_active': True},
    ])
    assert resp.status_code == 200, resp.get_json()
    assert _updated_id(user_quests) == 'uq-restart'
    assert user_quests.update.call_args[0][0] == {'task_display_mode': 'flexible'}


@pytest.mark.unit
def test_display_mode_falls_back_to_newest_without_an_active_row(client, mock_verify_token):
    resp, user_quests = _display_mode(client, [
        {'id': 'uq-newest', 'is_active': False},
        {'id': 'uq-older', 'is_active': False},
    ])
    assert resp.status_code == 200
    assert _updated_id(user_quests) == 'uq-newest'


@pytest.mark.unit
def test_display_mode_404s_when_not_enrolled(client, mock_verify_token):
    resp, user_quests = _display_mode(client, [])
    assert resp.status_code == 404
    user_quests.update.assert_not_called()
