"""The student's credit precheck: what it may show, and when it asks nothing.

Two things matter more than the rest. The student sees a projection of the
review, never the review: no confidence figure, no reviewer summary, no
concerns, no XP opinion (the reasons are in test_credit_ai_review_privacy.py).
And the consent check runs before a byte of evidence is read, exactly as it
does for the review itself.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from services.base_ai_service import AIJsonResult, AIServiceOverloadedError
from services.credit_ai_review import precheck
from services.credit_ai_review.evidence_loader import EvidencePart, LoadResult
from services.credit_ai_review.service import CreditAIReviewService

STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
TASK_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
COMPLETION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

BLOCKS = [{'id': 'blk1', 'block_type': 'text',
           'content': {'text': 'I built and tested the bridge.'}}]

ANSWER = {
    'criteria': [
        {'index': 1, 'verdict': 'met', 'evidence_refs': [1], 'note': 'Says so.'},
        {'index': 2, 'verdict': 'partial', 'evidence_refs': [1], 'note': 'No numbers.'},
    ],
    'recommendation': 'grow_this',
    'confidence': 0.8,
    'summary': 'The student skipped the measurements.',
    'xp': {'recommended': 100, 'proportionate': False, 'rationale': 'Smaller than claimed.'},
    'feedback': {'celebrate': 'You tested it.', 'grow_this': 'Add the weights you used.'},
    'concerns': ['Possible copied text.'],
}


class _Table:
    def __init__(self, rows):
        self._rows = rows

    def __getattr__(self, name):
        if name == 'execute':
            return lambda: SimpleNamespace(data=self._rows, count=len(self._rows))
        return lambda *a, **k: self


def _client(*, diploma_status='none', rounds=None, has_completion=True):
    tables = {
        'quest_task_completions': [{
            'id': COMPLETION_ID, 'quest_id': 'q1', 'diploma_status': diploma_status,
        }] if has_completion else [],
        'user_quest_tasks': [{
            'id': TASK_ID, 'title': 'Load test', 'description': 'Test it.',
            'success_criteria': ['Tested with weight', 'Recorded the results'],
            'pillar': 'stem', 'xp_value': 150, 'diploma_subjects': ['science'],
            'subject_xp_distribution': {'science': 150},
        }],
        'quests': [{'id': 'q1', 'title': 'Bridge', 'description': 'Build one.'}],
        'user_task_evidence_documents': [{'id': 'doc1'}],
        'evidence_document_blocks': BLOCKS,
        'diploma_review_rounds': rounds or [],
    }
    client = MagicMock()
    client.table.side_effect = lambda name: _Table(tables.get(name, []))
    return client


def _load(*, readable=True):
    result = LoadResult(block_count=2, fingerprint='sha256:x')
    if readable:
        result.parts.append(EvidencePart(
            block_index=1, item_index=1, block_id='blk1', block_type='text',
            label='a written note', source='typed', kind='text',
            text='I built and tested the bridge.'))
    result.parts.append(EvidencePart(
        block_index=2, item_index=1, block_id='blk2', block_type='link',
        label='Bridge notes', source='google_doc', kind='skipped',
        skip_reason="the Google file is not shared (set it to 'Anyone with the link can view')"))
    return result


def _run(client, *, access=True, load=None, answer=ANSWER, ask_error=None):
    check = (True, None, None) if access else (False, {'code': 'DEPENDENT_AI_DISABLED'}, 403)
    result = AIJsonResult(data=answer, model_name='test-model',
                          input_tokens=100, output_tokens=50)
    with patch('utils.ai_access.check_ai_access', return_value=check) as consent, \
         patch('services.credit_ai_review.evidence_loader.load_evidence',
               return_value=load if load is not None else _load()) as loaded, \
         patch.object(CreditAIReviewService, 'generate_json_multimodal') as ask:
        if ask_error is not None:
            ask.side_effect = ask_error
        else:
            ask.return_value = result
        try:
            outcome = precheck.run_precheck(
                student_id=STUDENT_ID, task_id=TASK_ID, admin=client)
        except precheck.PrecheckUnavailable as e:
            outcome = e
    return outcome, consent, loaded, ask


@pytest.mark.unit
class TestTheStudentSeesAProjection:
    def test_only_whitelisted_keys_leave(self):
        view, *_ = _run(_client())
        assert set(view) == {'likelihood', 'criteria', 'suggestion', 'unread', 'criteria_source'}

    def test_no_reviewer_working_notes_anywhere_in_the_answer(self):
        view, *_ = _run(_client())
        text = repr(view)
        for secret in ('0.8', 'The student skipped the measurements.',
                       'Possible copied text.', 'Smaller than claimed.', 'confidence', 'xp'):
            assert secret not in text, secret

    def test_criteria_carry_the_verdict_but_not_the_reviewer_note(self):
        view, *_ = _run(_client())
        assert view['criteria'] == [
            {'criterion': 'Tested with weight', 'verdict': 'met'},
            {'criterion': 'Recorded the results', 'verdict': 'partial'},
        ]

    def test_work_that_looks_short_gets_the_note_written_to_the_student(self):
        view, *_ = _run(_client())
        assert view['likelihood'] == 'needs_work'
        assert view['suggestion'] == 'Add the weights you used.'

    def test_an_approval_does_not_show_the_celebrate_note(self):
        """Before a human decides, "well done" would read as the decision."""
        answer = {**ANSWER, 'recommendation': 'approve', 'confidence': 0.9,
                  'criteria': [{**c, 'verdict': 'met'} for c in ANSWER['criteria']]}
        view, *_ = _run(_client(), answer=answer)
        assert view['likelihood'] == 'likely'
        assert view['suggestion'] is None
        assert 'You tested it.' not in repr(view)

    def test_unreadable_evidence_is_named_so_the_student_can_fix_it(self):
        view, *_ = _run(_client())
        assert view['unread'] == [{
            'label': 'Bridge notes',
            'reason': "the Google file is not shared (set it to 'Anyone with the link can view')",
        }]


@pytest.mark.unit
class TestWhenItAsksNothing:
    def test_ai_off_for_the_student_reads_no_evidence(self):
        outcome, consent, loaded, ask = _run(_client(), access=False)
        assert isinstance(outcome, precheck.PrecheckUnavailable)
        assert outcome.code == 'ai_disabled'
        consent.assert_called_once_with(STUDENT_ID, strict=True)
        loaded.assert_not_called()
        ask.assert_not_called()

    def test_nothing_readable_costs_no_model_call(self):
        outcome, _, _, ask = _run(_client(), load=_load(readable=False))
        assert outcome.code == 'no_readable_evidence'
        ask.assert_not_called()

    def test_a_model_failure_is_no_answer_not_an_error(self):
        outcome, *_ = _run(_client(), ask_error=AIServiceOverloadedError('busy'))
        assert outcome.code == 'ai_unavailable'

    def test_one_attempt_inside_the_worker_timeout(self):
        _, _, loaded, ask = _run(_client())
        assert ask.call_args.kwargs['max_retries'] == 0
        assert ask.call_args.kwargs['timeout'] == precheck.MODEL_TIMEOUT
        assert loaded.call_args.kwargs['file_api_enabled'] is False
        budget = loaded.call_args.kwargs['budget']
        assert budget.max_seconds == precheck.EVIDENCE_SECONDS
        assert precheck.EVIDENCE_SECONDS + precheck.MODEL_TIMEOUT < 120

    def test_a_pending_request_cannot_be_prechecked(self):
        with pytest.raises(ValueError):
            precheck.build_context(_client(diploma_status='pending_review'),
                                   student_id=STUDENT_ID, task_id=TASK_ID)

    def test_an_incomplete_task_has_nothing_to_check(self):
        with pytest.raises(LookupError):
            precheck.build_context(_client(has_completion=False),
                                   student_id=STUDENT_ID, task_id=TASK_ID)

    def test_disabled_feature_asks_nothing(self):
        with patch.object(precheck.Config, 'CREDIT_AI_REVIEW_ENABLED', False):
            outcome, consent, loaded, _ = _run(_client())
        assert outcome.code == 'disabled'
        loaded.assert_not_called()


@pytest.mark.unit
class TestAResubmission:
    def test_it_is_judged_as_the_next_round_against_the_last_feedback(self):
        rounds = [{'id': 'r1', 'round_number': 1, 'evidence_snapshot': [],
                   'reviewer_action': 'grow_this', 'reviewer_feedback': 'Add numbers.'}]
        context = precheck.build_context(
            _client(diploma_status='grow_this', rounds=rounds),
            student_id=STUDENT_ID, task_id=TASK_ID)
        resub = context['resubmission']
        assert resub['round_number'] == 2
        assert resub['prior'][0]['feedback'] == 'Add numbers.'
        assert resub['added'] == [1]

    def test_the_student_is_not_in_the_prompt_context(self):
        context = precheck.build_context(_client(), student_id=STUDENT_ID, task_id=TASK_ID)
        assert STUDENT_ID not in repr(context)


def _post(client, *, returns=None, raises=None):
    with patch('services.credit_ai_review.precheck.run_precheck',
               return_value=returns, side_effect=raises) as run, \
         patch('routes.tasks.credit.get_supabase_admin_client', return_value=MagicMock()), \
         patch('utils.session_manager.session_manager.get_effective_user_id',
               return_value=STUDENT_ID):
        resp = client.post(f'/api/tasks/{TASK_ID}/credit-precheck', json={})
    return resp, run


@pytest.mark.unit
class TestTheRoute:
    def test_an_answer_is_marked_available(self, client):
        resp, run = _post(client, returns={'likelihood': 'likely', 'criteria': []})
        assert resp.status_code == 200
        data = resp.get_json()['data']
        assert data['available'] is True and data['likelihood'] == 'likely'
        assert run.call_args.kwargs['student_id'] == STUDENT_ID

    def test_no_answer_is_a_200_the_ui_can_offer_submit_from(self, client):
        resp, _ = _post(client, raises=precheck.PrecheckUnavailable('busy'))
        assert resp.status_code == 200
        assert resp.get_json()['data'] == {'available': False, 'reason': 'busy'}

    def test_a_task_already_pending_is_a_400(self, client):
        resp, _ = _post(client, raises=ValueError('pending_review'))
        assert resp.status_code == 400

    def test_an_incomplete_task_is_a_404(self, client):
        resp, _ = _post(client, raises=LookupError('no completion'))
        assert resp.status_code == 404
