"""Evidence edited while a credit request waits must reach the AI review.

The review reads the round's snapshot, taken when the student asked for credit,
while the human reviewer is shown the live blocks. London Grover added the
interview that answered her questions half an hour after submitting, and the AI
judged the questions alone (2026-10-07).
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from services.credit_ai_review import trigger

USER_ID = 'u' * 8
TASK_ID = 't' * 8
COMPLETION_ID = 'c' * 8
ROUND_ID = 'r' * 8

QUESTIONS = {'id': 'b1', 'block_type': 'text', 'order_index': 0,
             'content': {'text': 'Questions: is math invented or discovered?'}}
INTERVIEW = {'id': 'b2', 'block_type': 'text', 'order_index': 1,
             'content': {'text': 'I interviewed my dad and it went like this.'}}


class _Query:
    def __init__(self, table, db):
        self.table, self.db, self.op, self.payload = table, db, 'select', None

    def select(self, *_a, **_k):
        return self

    def update(self, payload):
        self.op, self.payload = 'update', payload
        return self

    def eq(self, *_a):
        return self

    in_ = order = limit = lambda self, *_a, **_k: self

    def execute(self):
        if self.op == 'update':
            self.db['updates'].append((self.table, self.payload))
            return SimpleNamespace(data=[])
        return SimpleNamespace(data=self.db[self.table])


class _Admin:
    def __init__(self, db):
        self.db = db

    def table(self, name):
        return _Query(name, self.db)


def _db(*, snapshot, live, reviewer_action=None, completions=True):
    return {
        'quest_task_completions': [{'id': COMPLETION_ID, 'diploma_status': 'pending_review'}]
        if completions else [],
        'diploma_review_rounds': [{'id': ROUND_ID, 'evidence_snapshot': snapshot,
                                   'reviewer_action': reviewer_action}],
        'user_task_evidence_documents': [{'id': 'doc'}],
        'evidence_document_blocks': live,
        'updates': [],
    }


def _run(db):
    with patch.object(trigger, 'enabled', return_value=True), \
            patch.object(trigger.store, 'queue_review') as queue:
        changed = trigger.evidence_changed(user_id=USER_ID, task_id=TASK_ID,
                                           admin=_Admin(db))
    return changed, queue


def test_added_block_refreshes_snapshot_and_requeues_review():
    db = _db(snapshot=[QUESTIONS], live=[QUESTIONS, INTERVIEW])
    changed, queue = _run(db)

    assert changed is True
    assert db['updates'] == [('diploma_review_rounds',
                              {'evidence_snapshot': [QUESTIONS, INTERVIEW]})]
    queue.assert_called_once()
    assert queue.call_args.kwargs['force'] is True
    assert queue.call_args.kwargs['round_id'] == ROUND_ID


def test_autosave_with_no_change_does_nothing():
    # Block rows are rewritten on every save, so ids differ; content does not.
    rewritten = [{**QUESTIONS, 'id': 'new-id'}]
    db = _db(snapshot=[QUESTIONS], live=rewritten)
    changed, queue = _run(db)

    assert changed is False
    assert db['updates'] == []
    queue.assert_not_called()


def test_round_a_reviewer_already_acted_on_stays_as_submitted():
    db = _db(snapshot=[QUESTIONS], live=[QUESTIONS, INTERVIEW],
             reviewer_action='grow_this')
    changed, queue = _run(db)

    assert changed is False
    assert db['updates'] == []
    queue.assert_not_called()


def test_task_not_waiting_on_credit_is_ignored():
    db = _db(snapshot=[QUESTIONS], live=[QUESTIONS, INTERVIEW], completions=False)
    changed, queue = _run(db)

    assert changed is False
    queue.assert_not_called()


def test_a_failure_never_fails_the_save():
    class Broken:
        def table(self, _name):
            raise RuntimeError('database down')

    assert trigger.evidence_changed(user_id=USER_ID, task_id=TASK_ID,
                                    admin=Broken()) is False
