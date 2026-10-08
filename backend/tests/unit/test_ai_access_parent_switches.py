"""A parent's AI switches reach every student they cover, and every wizard door.

Closed 2026-10-07 after a parent asked how the task-personalization wizard
sends their child's information to Gemini. Four gaps:

  1. The wizard doors asked only the master switch, never the parent's
     "task generation" switch.
  2. refine-tasks asked nothing -- the same prompt, SIS goals and hobbies
     included, with no consent check.
  3. The parent's switches were read only for dependents. A teen with their own
     login linked to a parent could be switched off and nothing read it.
  4. PUT /api/dependents/<id>/ai-features matched parent links on
     status='active'; every link is 'approved', so a linked parent could never
     save a per-feature switch.

users.ai_features_enabled defaults to false for every row, so for a linked
student "off" means a parent SET it off (ai_features_enabled_by), never the
column default -- otherwise every linked student would lose AI.
"""

import inspect
import re
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from utils import ai_access

QUEST = 'c0000000-0000-4000-8000-00000000000c'
STUDENT = '30000000-0000-4000-8000-000000000003'
PARENT = '40000000-0000-4000-8000-000000000004'


def _row(**overrides):
    row = {'id': STUDENT, 'is_dependent': False, 'ai_features_enabled': False,
           'ai_features_enabled_by': None, 'organization_id': None,
           'ai_chatbot_enabled': True, 'ai_lesson_helper_enabled': True,
           'ai_task_generation_enabled': True}
    row.update(overrides)
    return row


def _client_returning(row):
    client = MagicMock()
    query = MagicMock()
    query.select.return_value = query
    query.eq.return_value = query
    query.limit.return_value = query
    query.execute.return_value = MagicMock(data=[row])
    client.table.return_value = query
    return client


def _check(row, feature=None):
    with patch.object(ai_access, 'get_supabase_admin_client', return_value=_client_returning(row)):
        return ai_access.check_ai_access(STUDENT, feature)


def _status(row):
    with patch.object(ai_access, 'get_supabase_admin_client', return_value=_client_returning(row)):
        return ai_access.get_ai_feature_status(STUDENT)


@pytest.mark.unit
class TestMasterSwitch:
    def test_a_linked_student_on_the_column_default_keeps_ai(self):
        has_access, _, _ = _check(_row())
        assert has_access is True
        assert _status(_row())['has_access'] is True

    def test_a_linked_student_a_parent_switched_off_is_refused(self):
        row = _row(ai_features_enabled_by=PARENT)
        has_access, error, status = _check(row)
        assert has_access is False
        assert status == 403
        assert error['code'] == 'DEPENDENT_AI_DISABLED'
        assert _status(row)['has_access'] is False

    def test_a_linked_student_a_parent_switched_on_keeps_ai(self):
        has_access, _, _ = _check(_row(ai_features_enabled=True, ai_features_enabled_by=PARENT))
        assert has_access is True

    def test_a_dependent_is_still_opt_in(self):
        has_access, _, status = _check(_row(is_dependent=True))
        assert has_access is False
        assert status == 403
        assert _status(_row(is_dependent=True))['has_access'] is False


@pytest.mark.unit
class TestFeatureSwitch:
    def test_task_generation_off_refuses_a_linked_student(self):
        row = _row(ai_task_generation_enabled=False)
        has_access, error, status = _check(row, 'task_generation')
        assert has_access is False
        assert status == 403
        assert error['feature'] == 'task_generation'

    def test_task_generation_off_does_not_touch_the_tutor(self):
        has_access, _, _ = _check(_row(ai_task_generation_enabled=False), 'chatbot')
        assert has_access is True

    def test_a_null_column_is_the_default_not_a_refusal(self):
        has_access, _, _ = _check(_row(ai_task_generation_enabled=None), 'task_generation')
        assert has_access is True


def _call(view_name, body):
    from routes import quest_personalization as qp
    from utils.guardian_scope import StudentScope
    view = inspect.unwrap(getattr(qp, view_name))
    scope = StudentScope(caller_id=PARENT, student_id=STUDENT, via='parent')
    refusal = ({'error': 'ai_feature_disabled'}, 403)
    with Flask(__name__).test_request_context(f'/api/quests/{QUEST}/x', method='POST', json=body), \
            patch.object(qp, 'current_student_scope', return_value=scope), \
            patch.object(qp, 'quest_not_workable', return_value=None), \
            patch.object(qp, '_custom_tasks_blocked', return_value=None), \
            patch.object(qp, 'get_supabase_admin_client', return_value=MagicMock()), \
            patch.object(qp, 'require_ai_access', return_value=refusal) as gate, \
            patch.object(qp, 'personalization_service') as service:
        response = view(STUDENT, QUEST)
    return response, gate, service


@pytest.mark.unit
@pytest.mark.parametrize('view_name', ['generate_tasks', 'refine_tasks'])
def test_the_wizard_asks_the_task_generation_switch_about_the_student(view_name):
    response, gate, service = _call(view_name, {'session_id': 's1', 'interests': ['bikes']})
    assert response == ({'error': 'ai_feature_disabled'}, 403)
    gate.assert_called_once_with(STUDENT, 'task_generation')
    service.generate_task_suggestions.assert_not_called()


@pytest.mark.unit
def test_every_ai_door_in_the_wizard_names_the_feature():
    """A bare require_ai_access(...) in this module skips the parent's
    task-generation switch; every call here must name it."""
    from routes import quest_personalization as qp
    calls = re.findall(r'require_ai_access\(([^)]*)\)', inspect.getsource(qp))
    assert len(calls) >= 4
    assert all(args.endswith("'task_generation'") for args in calls), calls


@pytest.mark.unit
def test_the_feature_endpoint_matches_approved_parent_links():
    from routes import dependents
    source = inspect.getsource(dependents.update_child_ai_features)
    assert ".eq('status', 'approved')" in source
    assert ".eq('status', 'active')" not in source
