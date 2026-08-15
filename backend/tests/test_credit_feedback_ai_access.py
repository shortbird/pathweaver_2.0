"""
A student's evidence does not go to Gemini when their parent (or their org) has
switched AI features off.

The "AI Suggest" button on the credit reviewer's Grow This form is clicked by
staff, so nothing about the request looks like the student — but the text it
ships to Gemini is the child's evidence write-up, and the consent that governs
it is the child's. The toggles are therefore checked against the STUDENT on the
completion, never the reviewer.

Denial is not a failure of the review: the reviewer writes the note by hand and
everything else about the flow is unchanged.
"""

from unittest.mock import MagicMock, patch

import pytest

from services.credit_feedback_ai_service import CreditFeedbackAIService

CONTEXT = {
    'student_id': 'student-uuid',
    'quest': {'title': 'Bridge Build'},
    'task': {'title': 'Load test', 'xp_value': 100},
    'evidence_blocks': [{'block_type': 'text', 'content': {'text': 'I tested the bridge'}}],
    'suggested_subjects': {},
    'prior_feedback': None,
}


def _run(access, context=CONTEXT):
    """suggest_grow_this_feedback with AI access forced on/off.

    Returns (result, gemini_mock) so a test can assert on both the reviewer's
    answer and whether anything actually left the platform.
    """
    service = CreditFeedbackAIService.__new__(CreditFeedbackAIService)
    service.supabase = MagicMock()
    service.model = MagicMock()

    response = MagicMock()
    response.text = '{"feedback": "Add a photo of the load test setup."}'
    check = (True, None, None) if access else (
        False, {'error': 'ai_disabled', 'code': 'DEPENDENT_AI_DISABLED'}, 403)

    with patch.object(CreditFeedbackAIService, '_load_context', return_value=context), \
         patch('utils.ai_access.check_ai_access', return_value=check) as checked, \
         patch('services.credit_feedback_ai_service.generate_with_timeout',
               return_value=response) as gemini:
        result = service.suggest_grow_this_feedback('completion-uuid')
    return result, gemini, checked


@pytest.mark.unit
class TestCreditFeedbackAIAccess:
    def test_evidence_is_not_sent_when_ai_is_disabled(self):
        result, gemini, _ = _run(access=False)
        assert gemini.called is False
        assert result['success'] is False
        assert 'turned off' in result['error']

    def test_the_check_is_against_the_student_not_the_reviewer(self):
        _, _, checked = _run(access=False)
        checked.assert_called_once_with('student-uuid')

    def test_feedback_is_drafted_when_ai_is_enabled(self):
        result, gemini, _ = _run(access=True)
        assert gemini.called is True
        assert result['success'] is True
        assert result['suggested_feedback']

    def test_missing_student_id_does_not_crash_the_draft(self):
        # Defensive: an older/partial context shouldn't 500 the reviewer's page.
        context = {k: v for k, v in CONTEXT.items() if k != 'student_id'}
        result, gemini, _ = _run(access=True, context=context)
        assert gemini.called is True
        assert result['success'] is True
