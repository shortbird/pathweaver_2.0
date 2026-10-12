"""A stale pooled socket must not fail an evidence save.

Sentry 906d892b / c994037c: "Error saving evidence document: Server
disconnected" -> 500. The read of user_task_evidence_documents in
save_evidence_document died with httpx.RemoteProtocolError ("Server
disconnected without sending a response") and the handler had no retry, so the
student's save failed on the most ordinary transient error this app has. The
reads are now wrapped in with_connection_retry; the completion insert is not,
because an insert is not safe to repeat blindly.
"""

from unittest.mock import MagicMock, patch

import httpx
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
    return {
        'user_quest_tasks': _table([
            {'quest_id': QUEST, 'title': 'Write', 'xp_value': 50,
             'pillar': 'creativity', 'user_id': USER},
        ]),
        'user_quests': _table([{'id': 'uq-1'}]),
        'user_task_evidence_documents': _table([{'id': 'doc-1'}]),
        'evidence_document_blocks': _table([{'id': 'b-1', 'order_index': 0}]),
        'quest_task_completions': _table([{'id': 'done-1'}]),
    }


@pytest.fixture
def admin(tables):
    client = MagicMock()
    client.table.side_effect = lambda name: tables[name]
    with patch('routes.evidence_documents.get_supabase_admin_client',
               return_value=client), \
         patch('utils.retry_handler.time.sleep'):
        yield client


def _save(client, status='draft'):
    return client.post(
        f'/api/evidence/documents/{TASK}',
        json={'blocks': [{'type': 'text', 'content': {'text': 'my work'}}],
              'status': status},
        headers={'Authorization': 'Bearer t'},
    )


def _disconnect_once(table, data):
    """First execute() on this table drops the socket; every later one works
    (the same mock also serves the table's update call)."""
    calls = {'n': 0}

    def execute():
        calls['n'] += 1
        if calls['n'] == 1:
            raise httpx.RemoteProtocolError(
                'Server disconnected without sending a response.')
        return MagicMock(data=data)
    table.execute.side_effect = execute


@pytest.mark.unit
class TestEvidenceSaveSurvivesAStaleSocket:
    def test_document_read_disconnect_once_still_saves(
            self, client, mock_verify_token, admin, tables):
        """The Sentry case itself: the user_task_evidence_documents read."""
        _disconnect_once(tables['user_task_evidence_documents'], [{'id': 'doc-1'}])
        with patch('routes.evidence_documents.update_document_blocks') as upd:
            resp = _save(client)
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True
        assert resp.get_json()['document_id'] == 'doc-1'
        upd.assert_called_once()

    @pytest.mark.parametrize('table_name,data', [
        ('user_quest_tasks', [{'quest_id': QUEST, 'title': 'Write', 'xp_value': 50,
                               'pillar': 'creativity', 'user_id': USER}]),
        ('user_quests', [{'id': 'uq-1'}]),
        ('evidence_document_blocks', [{'id': 'b-1', 'order_index': 0}]),
    ])
    def test_other_reads_are_retried_too(
            self, client, mock_verify_token, admin, tables, table_name, data):
        _disconnect_once(tables[table_name], data)
        with patch('routes.evidence_documents.update_document_blocks'):
            resp = _save(client)
        assert resp.status_code == 200

    def test_completion_lookup_is_retried(
            self, client, mock_verify_token, admin, tables):
        _disconnect_once(tables['quest_task_completions'], [{'id': 'done-1'}])
        with patch('routes.evidence_documents.update_document_blocks'), \
             patch('routes.evidence_documents.xp_service') as xp:
            resp = _save(client, status='completed')
        assert resp.status_code == 200
        xp.award_xp.assert_not_called()

    def test_a_non_transient_error_is_not_retried(
            self, client, mock_verify_token, admin, tables):
        """A real failure is still a 500, after exactly one attempt."""
        tables['user_task_evidence_documents'].execute.side_effect = ValueError('bad column')
        with patch('routes.evidence_documents.update_document_blocks'):
            resp = _save(client)
        assert resp.status_code == 500
        assert tables['user_task_evidence_documents'].execute.call_count == 1
