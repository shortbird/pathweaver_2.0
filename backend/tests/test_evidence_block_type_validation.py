"""
Block type validation on POST /api/evidence/documents/<task_id>.

Tickets 9040e599, 672adb58, 64c75285: the mobile TaskEvidenceSheet saves voice
notes as 'audio' blocks. evidence_document_blocks' CHECK constraint did not
allow 'audio', so the insert failed and the student saw a 500. Migration
20261006120000 adds 'audio' to the constraint; the route now names the allowed
types itself and answers 400 for anything else, before any write.
"""

import inspect
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

import routes.evidence_documents as evidence_documents


def _save(blocks, client):
    app = Flask(__name__)
    with patch.object(evidence_documents, 'get_supabase_admin_client', return_value=client), \
         patch.object(evidence_documents, 'current_student_scope', return_value=None), \
         app.test_request_context(method='POST', json={'blocks': blocks, 'status': 'draft'}):
        resp = inspect.unwrap(evidence_documents.save_evidence_document)('student-1', 'task-1')
    payload = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return payload, status


def _client_with_no_task():
    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    return client


@pytest.mark.unit
class TestBlockTypeValidation:
    def test_unknown_block_type_is_a_400_before_any_query(self):
        """Tickets 9040e599 / 672adb58 / 64c75285: an unknown block type must
        return 400 with the allowed list, not reach the insert and 500."""
        client = _client_with_no_task()
        payload, status = _save([{'type': 'hologram', 'content': {}}], client)
        assert status == 400
        assert payload['success'] is False
        assert "'hologram'" in payload['error']
        assert 'audio' in payload['error']
        client.table.assert_not_called()

    def test_a_block_without_a_type_is_a_400(self):
        """Tickets 9040e599 / 672adb58 / 64c75285: a block with no type is
        refused with a 400 too."""
        payload, status = _save([{'content': {'text': 'hi'}}], _client_with_no_task())
        assert status == 400
        assert 'Unsupported evidence block type' in payload['error']

    def test_audio_passes_validation(self):
        """Tickets 9040e599 / 672adb58 / 64c75285: a mobile voice note
        ('audio') passes validation. The stub has no task row, so the route
        stops at its 404 one step later, which proves the block was accepted."""
        payload, status = _save(
            [{'type': 'audio', 'content': {'url': 'https://x/voice.m4a', 'filename': 'voice.m4a'}}],
            _client_with_no_task())
        assert status == 404, payload
        assert 'Task not found' in payload['error']

    def test_allowed_types_match_the_migration(self):
        """Tickets 9040e599 / 672adb58 / 64c75285: the route's set and the
        constraint in migration 20261006120000 list the same six types."""
        assert evidence_documents.ALLOWED_BLOCK_TYPES == {
            'text', 'image', 'video', 'link', 'document', 'audio'}
