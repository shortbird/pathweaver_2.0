"""
Evidence already on the task counts as evidence.

iCreate, 2026-09-04 (dc7ccacc): "Having evidence required before they can
submit." — filed from the submissions reviewer, looking at completions whose
only evidence was the sentence "Marked complete by parent".

It already WAS required. The completion endpoint demanded an `evidence_type` in
the request, and a parent finishing a task for their child had nothing to put
there — their photos go on separately, through /api/evidence/helper/*, which
leaves the task a draft. So the mobile app sent a placeholder string to get past
the check, and fifteen of iCreate's completions carry it and nothing else.

The rule this restores is the one that was always meant: a finished task has
something behind it. Where that something was attached does not matter.
"""

from unittest.mock import Mock, patch

import pytest

from routes.tasks import completion


USER = 'child-1'
TASK = 'task-1'


def _admin(doc_rows, block_rows, raises=None, filters=None):
    """Stub of the two reads _task_has_evidence makes.

    `filters` collects every (table, column, value) the caller pinned, so a test
    can assert WHOSE evidence was looked at.
    """
    admin = Mock()

    def _table(name):
        chain = Mock()
        for m in ('select', 'limit'):
            getattr(chain, m).return_value = chain

        def _eq(col, val):
            if filters is not None:
                filters.append((name, col, val))
            return chain

        chain.eq.side_effect = _eq
        if raises == name:
            chain.execute.side_effect = RuntimeError('postgrest is down')
        else:
            chain.execute.return_value = Mock(
                data=doc_rows if name == 'user_task_evidence_documents' else block_rows)
        return chain

    admin.table.side_effect = _table
    return admin


@pytest.mark.unit
class TestTaskHasEvidence:
    def test_a_task_with_an_attached_block_has_evidence(self):
        admin = _admin([{'id': 'doc-1'}], [{'id': 'blk-1'}])
        assert completion._task_has_evidence(admin, USER, TASK) is True

    def test_a_document_with_no_blocks_is_not_evidence(self):
        """An empty draft is where a learner starts, not something they finished."""
        admin = _admin([{'id': 'doc-1'}], [])
        assert completion._task_has_evidence(admin, USER, TASK) is False

    def test_no_document_at_all_is_not_evidence(self):
        admin = _admin([], [])
        assert completion._task_has_evidence(admin, USER, TASK) is False

    def test_it_never_asks_for_blocks_it_has_no_document_for(self):
        admin = _admin([], [])
        completion._task_has_evidence(admin, USER, TASK)
        assert [c.args[0] for c in admin.table.call_args_list] == [
            'user_task_evidence_documents']

    def test_a_failed_lookup_falls_back_to_demanding_evidence(self):
        """The stricter answer: a check we could not run must not wave a
        completion through with nothing behind it."""
        admin = _admin([{'id': 'doc-1'}], [], raises='evidence_document_blocks')
        assert completion._task_has_evidence(admin, USER, TASK) is False

    def test_it_looks_at_the_students_evidence_not_the_callers(self):
        """A parent completing for their child: the blocks belong to the child,
        so the read is scoped to the EFFECTIVE user."""
        filters = []
        admin = _admin([{'id': 'doc-1'}], [{'id': 'blk-1'}], filters=filters)
        completion._task_has_evidence(admin, USER, TASK)
        assert ('user_task_evidence_documents', 'user_id', USER) in filters
        assert ('user_task_evidence_documents', 'task_id', TASK) in filters
        # ...and the blocks are the ones hanging off that document, not any
        # document that happens to mention the task.
        assert ('evidence_document_blocks', 'document_id', 'doc-1') in filters
