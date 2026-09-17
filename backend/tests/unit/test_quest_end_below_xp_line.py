"""Ending a quest below its XP finish line sets it aside; it does not refuse.

A school can put an XP finish line on a quest (quests.xp_threshold, set from
the Training page). POST /end used to refuse below it for every quest, which
left a person with a school-set training quest they could neither finish nor
remove from their own account (Tanner, 2026-09-17: three iCreate quests, "XP
goal not reached").

Two meanings of "end", by what the quest is:
  - an ordinary quest: SET ASIDE -- inactive, status set_down, no
    completed_at, so it leaves the dashboard, no report counts it finished,
    and "Pick Up Quest" brings it back. No completion webhook, no LTI sync.
  - an LTI quest (lms_platform set): still refused. There "end" is "submit
    for the grade", and the teacher set the line so nobody submits early.
Above the line, nothing changes: the quest completes as before.
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


def _tables(lms_platform=None, earned=(25,), threshold=500):
    # quest_task_completions rows carry the joined task xp the route sums.
    completions = [{'user_quest_task_id': f't{i}', 'user_quest_tasks': {'xp_value': xp}}
                   for i, xp in enumerate(earned)]
    return {
        'quests': _table({'xp_threshold': threshold, 'lms_platform': lms_platform, 'title': 'Core Training'}),
        'user_quests': _table([{'id': 'uq-1', 'is_active': True, 'completed_at': None}]),
        'quest_task_completions': _table(completions),
        'users': _table({'organization_id': None}),
    }


def _end(client, tables):
    admin = MagicMock()
    admin.table.side_effect = lambda name: tables[name]
    with patch('routes.quest.completion.get_supabase_admin_client', return_value=admin), \
         patch('routes.quest.completion.WebhookService') as webhook, \
         patch('services.lti_grade_sync_service.enqueue_for_quest_completion') as lti, \
         patch('repositories.quest_repository.QuestRepository.set_aside_enrollment',
               return_value=True) as set_aside:
        resp = client.post(f'/api/quests/{QUEST}/end', json={}, headers={'Authorization': 'Bearer t'})
    return resp, webhook, lti, set_aside


@pytest.mark.unit
class TestBelowTheLine:

    def test_an_ordinary_quest_is_set_aside_not_refused(self, client, mock_verify_token):
        tables = _tables(lms_platform=None, earned=(25,), threshold=500)
        resp, webhook, lti, set_aside = _end(client, tables)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True and body['set_aside'] is True and body['completed'] is False
        assert body['requirements'] == {'earned_xp': 25, 'required_xp': 500}
        assert 'pick it up again' in body['message']
        # The repository's set-down write, by enrollment id; the route itself
        # writes nothing, and never a completed_at.
        set_aside.assert_called_once_with('uq-1')
        tables['user_quests'].update.assert_not_called()
        # Nothing was completed, so nothing is announced or graded.
        webhook.return_value.emit_event.assert_not_called()
        lti.assert_not_called()

    def test_an_lti_quest_is_still_refused(self, client, mock_verify_token):
        tables = _tables(lms_platform='canvas', earned=(25,), threshold=500)
        resp, _, _, set_aside = _end(client, tables)
        assert resp.status_code == 400
        body = resp.get_json()
        assert body['reason'] == 'XP_THRESHOLD_NOT_MET'
        tables['user_quests'].update.assert_not_called()
        set_aside.assert_not_called()


@pytest.mark.unit
class TestAtOrAboveTheLine:

    def test_an_ordinary_quest_completes_as_before(self, client, mock_verify_token):
        tables = _tables(lms_platform=None, earned=(250, 250), threshold=500)
        resp, webhook, _, _ = _end(client, tables)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True and 'set_aside' not in body
        written = tables['user_quests'].update.call_args[0][0]
        assert written['is_active'] is False and written['completed_at']
        webhook.return_value.emit_event.assert_called_once()

    def test_no_line_at_all_completes_as_before(self, client, mock_verify_token):
        tables = _tables(lms_platform=None, earned=(), threshold=None)
        resp, _, _, _ = _end(client, tables)
        assert resp.status_code == 200
        written = tables['user_quests'].update.call_args[0][0]
        assert written['completed_at']
