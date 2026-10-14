"""A failed evidence save must not wipe the blocks saved before it.

Ticket a9d3cedb (Nicole Bunting, parent of Brock): "anytime he tries to submit
something on an assignment, it shows as being there, but when you leave and
then click back in, the submission is gone."

update_document_blocks used to send a DELETE of every block of the document
and then a separate INSERT of the new list. When the insert failed, the
delete had already committed: the student got a 500 and lost every block he
had saved before. Brock's "Scavenger Hunt" document sat at 0 blocks while his
four files were still in storage.

The swap is now one call to the Postgres function
replace_evidence_document_blocks (migration 20261014120000), whose DELETE and
INSERT share one transaction. A unit test cannot run Postgres, so these tests
pin the contract the route relies on: exactly one rpc, never a separate
delete, a payload the function can read, and a 500 (not a silent success) when
the rpc fails. The SQL file is checked for the shape that makes it atomic.
"""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


USER = 'test-user-123'
TASK = 'task-1'
QUEST = 'quest-1'
RPC = 'replace_evidence_document_blocks'
MIGRATION = (Path(__file__).resolve().parents[3] / 'supabase' / 'migrations'
             / '20261014120000_replace_evidence_document_blocks.sql')


def _table(data=None):
    t = MagicMock()
    for m in ('select', 'eq', 'insert', 'update', 'delete', 'order', 'limit', 'single', 'in_'):
        getattr(t, m).return_value = t
    t.execute.return_value = MagicMock(data=data)
    return t


@pytest.fixture
def tables():
    return {
        'user_quest_tasks': _table([
            {'quest_id': QUEST, 'title': 'Scavenger Hunt', 'xp_value': 50,
             'pillar': 'creativity', 'user_id': USER},
        ]),
        'user_quests': _table([{'id': 'uq-1'}]),
        'user_task_evidence_documents': _table([{'id': 'doc-1'}]),
        # Two blocks already saved: these are what the old code destroyed.
        'evidence_document_blocks': _table([
            {'id': 'b-1', 'uploaded_by_user_id': None, 'uploaded_by_role': 'student'},
            {'id': 'b-2', 'uploaded_by_user_id': None, 'uploaded_by_role': 'student'},
        ]),
        'quest_task_completions': _table([{'id': 'done-1'}]),
    }


@pytest.fixture
def admin(tables):
    client = MagicMock()
    client.table.side_effect = lambda name: tables[name]
    with patch('routes.evidence_documents.get_supabase_admin_client',
               return_value=client), \
         patch('routes.evidence_documents._sync_paired_learning_event'), \
         patch('services.credit_ai_review.trigger.evidence_changed'), \
         patch('utils.retry_handler.time.sleep'):
        yield client


def _save(client, blocks):
    return client.post(
        f'/api/evidence/documents/{TASK}',
        json={'blocks': blocks, 'status': 'draft'},
        headers={'Authorization': 'Bearer t'},
    )


NEW_BLOCKS = [
    {'id': 'b-1', 'type': 'text', 'content': {'text': 'my notes'}},
    {'id': 'b-2', 'type': 'image', 'content': {'items': [{'url': 'https://x.supabase.co/a.png'}]}},
    {'id': 'temp-3', 'type': 'document', 'content': {'items': [{'url': 'https://x.supabase.co/b.pdf'}]}},
]


@pytest.mark.unit
class TestEvidenceBlocksAreReplacedAtomically:
    def test_a_failed_replace_returns_an_error_and_sends_no_separate_delete(
            self, client, mock_verify_token, admin, tables):
        """Ticket a9d3cedb: the insert half failing must not have deleted anything."""
        admin.rpc.return_value.execute.side_effect = Exception(
            'new row violates check constraint')

        resp = _save(client, NEW_BLOCKS)

        assert resp.status_code == 500
        assert resp.get_json()['success'] is False
        admin.rpc.assert_called_once()
        assert admin.rpc.call_args.args[0] == RPC
        tables['evidence_document_blocks'].delete.assert_not_called()
        tables['evidence_document_blocks'].insert.assert_not_called()

    def test_a_successful_save_goes_through_one_rpc_only(
            self, client, mock_verify_token, admin, tables):
        admin.rpc.return_value.execute.return_value = MagicMock(data=[])

        resp = _save(client, NEW_BLOCKS)

        assert resp.status_code == 200
        assert resp.get_json()['success'] is True
        admin.rpc.assert_called_once()
        tables['evidence_document_blocks'].delete.assert_not_called()
        tables['evidence_document_blocks'].insert.assert_not_called()

    def test_the_rpc_payload_carries_every_block_in_order(self, tables):
        """The function assigns document_id and order_index; the route sends the rest."""
        from routes import evidence_documents as ed
        client = MagicMock()
        client.table.side_effect = lambda name: tables[name]
        with patch.object(ed, '_sync_paired_learning_event'), \
             patch.object(ed, '_canonical_block_content', side_effect=lambda c: c):
            ed.update_document_blocks(client, 'doc-1', NEW_BLOCKS)

        client.rpc.assert_called_once()
        name, params = client.rpc.call_args.args
        assert name == RPC
        assert params['p_document_id'] == 'doc-1'
        sent = params['p_blocks']
        assert [b['block_type'] for b in sent] == ['text', 'image', 'document']
        assert sent[0]['content'] == {'text': 'my notes'}
        for b in sent:
            assert 'document_id' not in b
            assert 'order_index' not in b
            assert b['uploaded_by_role'] == 'student'
            assert b['is_private'] is False

    def test_an_empty_list_clears_the_document_through_the_same_rpc(self, tables):
        from routes import evidence_documents as ed
        client = MagicMock()
        client.table.side_effect = lambda name: tables[name]
        with patch.object(ed, '_sync_paired_learning_event'):
            ed.update_document_blocks(client, 'doc-1', [])

        client.rpc.assert_called_once_with(RPC, {'p_document_id': 'doc-1', 'p_blocks': []})
        tables['evidence_document_blocks'].delete.assert_not_called()

    def test_the_migration_deletes_and_inserts_inside_one_function(self):
        """Atomicity lives in SQL: both statements in one plpgsql body."""
        sql = MIGRATION.read_text()
        body = sql[sql.index('AS $function$'):sql.rindex('$function$;')]
        assert 'LANGUAGE plpgsql' in sql
        assert 'SECURITY INVOKER' in sql
        assert "SET search_path TO ''" in sql
        assert 'DELETE FROM public.evidence_document_blocks' in body
        assert 'INSERT INTO public.evidence_document_blocks' in body
        assert 'GRANT EXECUTE ON FUNCTION public.replace_evidence_document_blocks(uuid, jsonb) TO service_role' in sql
