"""Finishing a quest must not make your own evidence unsaveable.

Sentry OPTIO-WEB-G: a student completed a quest at 04:36, reopened it that
afternoon, edited her evidence, and the save 403'd with "You must be enrolled
in the quest to save evidence" -- on work she had just finished.

The gate read `user_quests` with `.eq('is_active', True)`. That column is false
for three different states (finished, archived, set down) and in all three the
enrollment, the task and the evidence are still hers. The task-ownership check
directly above it had already established that.

Nothing downstream re-awards anything on a re-save: the XP branch is guarded by
an existing quest_task_completions row, so a finished task's evidence updates
text and only text. The upload endpoint in the same file never had the
restriction at all, so a file could be uploaded and then not saved into the
document that referenced it.
"""

from unittest.mock import MagicMock, patch

import pytest


USER = 'test-user-123'
TASK = 'task-1'
QUEST = 'quest-1'


def _table(data=None):
    t = MagicMock()
    for m in ('select', 'eq', 'insert', 'update', 'order', 'limit', 'single'):
        getattr(t, m).return_value = t
    t.execute.return_value = MagicMock(data=data)
    return t


@pytest.fixture
def tables():
    """One mock per table, so each one's filters can be inspected on its own."""
    return {
        'user_quest_tasks': _table([
            {'quest_id': QUEST, 'title': 'Write', 'xp_value': 50,
             'pillar': 'creativity', 'user_id': USER},
        ]),
        # A FINISHED enrollment: is_active false, completed_at set. The row the
        # old query filtered away.
        'user_quests': _table([{'id': 'uq-1'}]),
        'user_task_evidence_documents': _table([{'id': 'doc-1'}]),
        'evidence_document_blocks': _table([]),
        'quest_task_completions': _table([{'id': 'done-1'}]),
    }


@pytest.fixture
def admin(tables):
    client = MagicMock()
    client.table.side_effect = lambda name: tables[name]
    with patch('routes.evidence_documents.get_supabase_admin_client',
               return_value=client):
        yield client


def _save(client, status='draft'):
    return client.post(
        f'/api/evidence/documents/{TASK}',
        json={'blocks': [{'type': 'text', 'content': {'text': 'my work'}}],
              'status': status},
        headers={'Authorization': 'Bearer t'},
    )


@pytest.mark.unit
class TestSavingEvidenceOnAFinishedQuest:
    def test_the_enrollment_check_does_not_filter_on_is_active(
            self, client, mock_verify_token, admin, tables):
        """The regression itself. `is_active` is not a proxy for "this
        enrollment is yours"."""
        with patch('routes.evidence_documents.update_document_blocks'):
            _save(client)
        filters = [c.args for c in tables['user_quests'].eq.call_args_list]
        assert ('user_id', USER) in filters
        assert ('quest_id', QUEST) in filters
        assert not any(f[0] == 'is_active' for f in filters)

    def test_a_finished_enrollment_saves(self, client, mock_verify_token, admin):
        with patch('routes.evidence_documents.update_document_blocks'):
            resp = _save(client)
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

    def test_no_enrollment_at_all_is_still_refused(
            self, client, mock_verify_token, admin, tables):
        """The gate still does its actual job: evidence for a quest you never
        picked up."""
        tables['user_quests'].execute.return_value = MagicMock(data=[])
        resp = _save(client)
        assert resp.status_code == 403
        assert 'enrolled' in resp.get_json()['error']

    def test_someone_elses_task_is_still_refused(
            self, client, mock_verify_token, admin, tables):
        """Ownership, not enrollment, is what protects another student's work
        -- and it is checked before this."""
        tables['user_quest_tasks'].execute.return_value = MagicMock(
            data=[{'quest_id': QUEST, 'title': 'Write', 'xp_value': 50,
                   'pillar': 'creativity', 'user_id': 'someone-else'}])
        resp = _save(client)
        assert resp.status_code == 403
        assert 'permission' in resp.get_json()['error']

    def test_re_completing_a_finished_task_awards_no_second_xp(
            self, client, mock_verify_token, admin, tables):
        """Why relaxing the gate is safe: an existing completion row short-
        circuits the award, so re-saving finished work changes text only."""
        with patch('routes.evidence_documents.update_document_blocks'), \
             patch('routes.evidence_documents.xp_service') as xp:
            resp = _save(client, status='completed')
        assert resp.status_code == 200
        assert resp.get_json()['xp_awarded'] == 0
        xp.award_xp.assert_not_called()
