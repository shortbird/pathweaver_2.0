"""Running one AI credit review: what must happen, and in what order.

The load-bearing test in this file is the first one. Consent is checked BEFORE a
single byte of the student's work is read out of storage, because a parent who
switched AI off did not agree to their child's photographs being pulled out of a
bucket so a staff tool could think about them, and "we fetched it but did not
send it" is not a distinction that means anything to them.

The rest is about the row always reaching a terminal state. A worker that dies
without writing one leaves a submission nobody reads and nothing saying why.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from services.base_ai_service import (
    AICreditsExhaustedError,
    AIJsonResult,
    AIParsingError,
    AIServiceOverloadedError,
)
from services.credit_ai_review import store
from services.credit_ai_review.evidence_loader import EvidencePart, LoadResult
from services.credit_ai_review.service import CreditAIReviewService, _diff_snapshots

REVIEW_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
ROUND_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
COMPLETION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
TASK_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

SNAPSHOT = [{'id': 'blk1', 'block_type': 'text',
             'content': {'text': 'I built and tested the bridge.'}}]

ANSWER = {
    'criteria': [{'index': 1, 'verdict': 'met', 'evidence_refs': [1], 'note': 'Says so.'}],
    'recommendation': 'approve',
    'confidence': 0.9,
    'summary': 'Met.',
    'xp': {'recommended': 150, 'proportionate': True, 'rationale': 'Fits.'},
    'feedback': {'celebrate': 'You tested it.', 'grow_this': 'Add numbers.'},
    'concerns': [],
}


class _Table:
    """A chainable supabase table stub returning canned rows."""

    def __init__(self, rows, writes):
        self._rows = rows
        self._writes = writes

    def __getattr__(self, name):
        if name == 'execute':
            return lambda: SimpleNamespace(data=self._rows, count=len(self._rows))
        if name in ('update', 'insert'):
            def _write(payload):
                self._writes.append((name, payload))
                return self
            return _write
        return lambda *a, **k: self


def _client(*, diploma_status='pending_review', review_row=None, rounds=None):
    """An admin client for one submission, recording every write."""
    writes = []
    review_row = review_row or {
        'id': REVIEW_ID, 'round_id': ROUND_ID, 'completion_id': COMPLETION_ID,
        'status': 'queued', 'attempts': 0,
    }
    rounds = rounds if rounds is not None else [{
        'id': ROUND_ID, 'round_number': 1, 'evidence_snapshot': SNAPSHOT,
        'subject_suggestion': {'science': 150},
    }]

    tables = {
        store.TABLE: [review_row],
        'quest_task_completions': [{
            'id': COMPLETION_ID, 'user_id': STUDENT_ID, 'quest_id': 'q1',
            'user_quest_task_id': TASK_ID, 'diploma_status': diploma_status,
            'revision_number': 1,
        }],
        'diploma_review_rounds': rounds,
        'user_quest_tasks': [{
            'id': TASK_ID, 'title': 'Load test', 'description': 'Test it.',
            'success_criteria': ['Tested with weight'], 'pillar': 'stem',
            'xp_value': 150, 'diploma_subjects': ['science'],
            'subject_xp_distribution': {'science': 150},
        }],
        'quests': [{'id': 'q1', 'title': 'Bridge', 'description': 'Build one.'}],
    }

    client = MagicMock()
    client.table.side_effect = lambda name: _Table(tables.get(name, []), writes)
    client._writes = writes
    client._tables = tables
    return client


def _readable_load():
    result = LoadResult(block_count=1, fingerprint='sha256:x')
    result.parts.append(EvidencePart(
        block_index=1, item_index=1, block_id='blk1', block_type='text',
        label='a written note', source='typed', kind='text',
        text='I built and tested the bridge.'))
    return result


def _empty_load():
    result = LoadResult(block_count=1, fingerprint='sha256:y')
    result.parts.append(EvidencePart(
        block_index=1, item_index=1, block_id='blk1', block_type='document',
        label='report.pdf', source='upload', kind='skipped',
        skip_reason='the PDF is password-protected'))
    result.flags.append('[E1] report.pdf: the PDF is password-protected')
    return result


def _statuses(client):
    return [p.get('status') for op, p in client._writes
            if op == 'update' and 'status' in p]


def _run(client, *, access=True, load=None, answer=ANSWER, ask_error=None,
         claim_token='tok'):
    service = CreditAIReviewService(admin=client)
    check = (True, None, None) if access else (
        False, {'error': 'ai_disabled', 'code': 'DEPENDENT_AI_DISABLED',
                'message': 'AI features are not enabled.'}, 403)

    result = AIJsonResult(data=answer, model_name='test-model',
                          input_tokens=100, output_tokens=50)

    with patch.object(store, 'claim', return_value=claim_token), \
         patch('utils.ai_access.check_ai_access', return_value=check) as consent, \
         patch('services.credit_ai_review.evidence_loader.load_evidence',
               return_value=load if load is not None else _readable_load()) as loaded, \
         patch.object(CreditAIReviewService, 'generate_json_multimodal',
                      side_effect=ask_error, return_value=result) as ask:
        if ask_error is None:
            ask.side_effect = None
            ask.return_value = result
        outcome = service.run(REVIEW_ID)
    return outcome, consent, loaded, ask


@pytest.mark.unit
class TestConsentComesFirst:
    """The check is on the STUDENT, and it happens before anything is read."""

    def test_nothing_is_read_or_sent_when_ai_is_off(self):
        client = _client()
        outcome, _, loaded, ask = _run(client, access=False)
        assert outcome['reason'] == 'ai_disabled_for_student'
        assert loaded.called is False
        assert ask.called is False

    def test_the_check_is_against_the_student_not_the_reviewer(self):
        outcome, consent, _, _ = _run(_client(), access=False)
        consent.assert_called_once_with(STUDENT_ID, strict=True)

    def test_a_denial_is_recorded_as_skipped_not_failed(self):
        """It is a setting, not a defect. 'Failed' sends someone bug-hunting."""
        client = _client()
        _run(client, access=False)
        assert 'skipped' in _statuses(client)
        skips = [p.get('skip_reason') for op, p in client._writes if 'skip_reason' in p]
        assert 'ai_disabled_for_student' in skips

    def test_the_check_is_strict_so_an_error_does_not_mean_yes(self):
        """utils/ai_access fails open by default. Not for a child's evidence."""
        _, consent, _, _ = _run(_client(), access=True)
        assert consent.call_args.kwargs.get('strict') is True


@pytest.mark.unit
class TestNothingToDo:
    def test_a_submission_no_longer_pending_is_skipped(self):
        client = _client(diploma_status='finalized')
        outcome, _, loaded, ask = _run(client)
        assert outcome['reason'] == 'completion_not_pending'
        assert loaded.called is False
        assert ask.called is False

    def test_a_submission_at_the_org_stage_is_still_reviewed(self):
        """A superadmin acts at both stages, so both are worth reading."""
        outcome, _, _, ask = _run(_client(diploma_status='pending_org_approval'))
        assert outcome['status'] == 'complete'
        assert ask.called is True

    def test_unreadable_evidence_costs_no_model_call(self):
        client = _client()
        outcome, _, _, ask = _run(client, load=_empty_load())
        assert outcome['reason'] == 'no_readable_evidence'
        assert ask.called is False

    def test_unreadable_evidence_still_records_why(self):
        """This is exactly when a reviewer wants the per-file reasons."""
        client = _client()
        _run(client, load=_empty_load())
        stored = [p.get('review') for op, p in client._writes if p.get('review')]
        assert stored and any('password-protected' in str(r) for r in stored)

    def test_a_lost_claim_does_nothing_at_all(self):
        client = _client()
        outcome, _, loaded, ask = _run(client, claim_token=None)
        assert outcome['status'] == 'not_claimed'
        assert loaded.called is False
        assert ask.called is False


@pytest.mark.unit
class TestFailures:
    def test_an_overloaded_model_is_retried_not_failed(self):
        client = _client()
        outcome, _, _, _ = _run(client, ask_error=AIServiceOverloadedError('503'))
        assert outcome['status'] == 'retry'
        assert 'queued' in _statuses(client)

    def test_an_unparseable_answer_is_retried(self):
        client = _client()
        outcome, _, _, _ = _run(client, ask_error=AIParsingError('no json'))
        assert outcome['status'] == 'retry'

    def test_exhausted_credits_are_not_retried(self):
        """Account-wide and permanent until somebody tops up billing."""
        client = _client()
        outcome, _, _, _ = _run(client, ask_error=AICreditsExhaustedError('depleted'))
        assert outcome['status'] == 'failed'
        assert 'failed' in _statuses(client)

    def test_an_unexpected_error_still_reaches_a_terminal_state(self):
        client = _client()
        outcome, _, _, _ = _run(client, ask_error=RuntimeError('something odd'))
        assert outcome['status'] == 'failed'
        assert 'failed' in _statuses(client)

    def test_a_retry_carries_the_error_text_forward(self):
        client = _client()
        _run(client, ask_error=AIServiceOverloadedError('model overloaded'))
        errors = [p.get('error') for op, p in client._writes if p.get('error')]
        assert any('overloaded' in str(e) for e in errors)


@pytest.mark.unit
class TestASuccessfulReview:
    def test_it_stores_the_verdict_and_the_model(self):
        client = _client()
        outcome, _, _, _ = _run(client)
        assert outcome['status'] == 'complete'
        stored = next(p for op, p in client._writes if p.get('status') == 'complete')
        assert stored['review']['recommendation'] == 'approve'
        assert stored['model'] == 'test-model'
        assert stored['prompt_version']

    def test_it_records_what_the_call_cost(self):
        client = _client()
        _run(client)
        stored = next(p for op, p in client._writes if p.get('status') == 'complete')
        assert stored['usage']['input_tokens'] == 100
        assert stored['usage']['read'] == 1

    def test_a_malformed_answer_is_not_stored_as_an_approval(self):
        client = _client()
        _run(client, answer={'recommendation': 'approve'})
        stored = next(p for op, p in client._writes if p.get('status') == 'complete')
        assert stored['review']['recommendation'] == 'needs_human'

    def test_uploaded_files_are_deleted_afterwards(self):
        client = _client()
        load = _readable_load()
        handle = MagicMock()
        load.file_handles.append(handle)
        with patch('services.credit_ai_review.evidence_loader.release') as release:
            _run(client, load=load)
        assert release.called


@pytest.mark.unit
class TestResubmissionDiff:
    """Diffed on what evidence IS, not on block ids.

    A resubmission deletes and reinserts the block rows (evidence_documents.py
    does that to dodge a uniqueness constraint), so every id changes even when
    the student changed nothing at all.
    """

    def _blocks(self, *texts):
        return [{'id': f'row-{i}', 'block_type': 'text', 'content': {'text': t}}
                for i, t in enumerate(texts, start=1)]

    def test_identical_evidence_under_new_row_ids_reads_as_unchanged(self):
        before = self._blocks('One.', 'Two.')
        after = [{**b, 'id': f'new-{i}'} for i, b in enumerate(before)]
        added, changed, removed = _diff_snapshots(before, after)
        assert (added, changed, removed) == ([], [], [])

    def test_a_new_block_is_added(self):
        added, changed, _ = _diff_snapshots(self._blocks('One.'),
                                            self._blocks('One.', 'Two.'))
        assert added == [2]
        assert changed == []

    def test_a_block_that_gained_something_is_changed_not_added(self):
        """That is where the previous feedback was probably answered."""
        before = [{'id': 'a', 'block_type': 'text', 'content': {'items': [{'text': 'One.'}]}}]
        after = [{'id': 'b', 'block_type': 'text',
                  'content': {'items': [{'text': 'One.'}, {'text': 'Plus numbers.'}]}}]
        added, changed, _ = _diff_snapshots(before, after)
        assert changed == [1]
        assert added == []

    def test_removed_evidence_is_reported(self):
        _, _, removed = _diff_snapshots(self._blocks('One.', 'Two.'), self._blocks('One.'))
        assert len(removed) == 1
