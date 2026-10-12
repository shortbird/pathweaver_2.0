"""/api/ai-access/status answers for the child a parent is working for.

Sentry 64448412 / e7429a56: web 403 "ai_disabled" on POST
/api/quests/:id/generate-tasks and /analyze-manual-task. A parent acting for a
dependent child whose AI is switched off saw the AI buttons, because the status
endpoint only ever answered about the caller (the parent). The child-scoped
call behind the button was then refused. The refusal is right; offering the
button was wrong. The endpoint now takes `?student_id=` through @student_scope,
so the guardian check is the same one every other family route uses.
"""

from unittest.mock import patch

import pytest

KID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
STRANGER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

OFF = {
    'has_access': False,
    'reason': 'AI features are not enabled for your account. Ask your parent to enable them in their dashboard.',
    'code': 'DEPENDENT_AI_DISABLED',
    'features': {'chatbot': False, 'lesson_helper': False, 'task_generation': False},
    'org_limits': {'chatbot': True, 'lesson_helper': True, 'task_generation': True},
}


def _get(client, qs=''):
    return client.get(f'/api/ai-access/status{qs}',
                      headers={'Authorization': 'Bearer t'})


@pytest.mark.unit
class TestStatusScopedToChild:
    def test_without_a_student_it_answers_for_the_caller(self, client, mock_verify_token):
        with patch('routes.ai_access.get_ai_feature_status', return_value={'has_access': True}) as st:
            resp = _get(client)
        assert resp.status_code == 200
        st.assert_called_once_with('test-user-123')

    def test_a_parent_asking_about_their_own_child_gets_the_childs_switches(
            self, client, mock_verify_token):
        with patch('utils.guardian_scope.guardian_relationship',
                   return_value={'first_name': 'Kid', 'is_dependent': True, 'via': 'dependent'}), \
             patch('routes.ai_access.get_ai_feature_status', return_value=dict(OFF)) as st:
            resp = _get(client, f'?student_id={KID}')
        assert resp.status_code == 200
        st.assert_called_once_with(KID)
        body = resp.get_json()
        assert body['has_access'] is False
        assert body['code'] == 'DEPENDENT_AI_DISABLED'

    def test_someone_elses_child_is_refused(self, client, mock_verify_token):
        with patch('utils.guardian_scope.guardian_relationship', return_value=None), \
             patch('routes.ai_access.get_ai_feature_status') as st:
            resp = _get(client, f'?student_id={STRANGER}')
        assert resp.status_code == 403
        st.assert_not_called()
