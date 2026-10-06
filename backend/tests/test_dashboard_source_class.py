"""
The home dashboard groups Current Quests by class (ticket a4c5d2e2), and it
can only do that if GET /api/users/dashboard sends `source_class` on every
active quest: {id, name, enrolled} for a quest a class set, null for the
student's own. The service-level attach is pinned in
test_learning_snapshot_quests.py; this pins the whole road from the route,
through get_dashboard_summary, to the JSON the web dashboard reads.
"""

from unittest.mock import Mock, patch

import pytest

from tests.test_class_quest_audience import _client
from tests.test_learning_snapshot_quests import AJ, Q_ELEM, Q_OWN, Q_SHARED, _school


def _service():
    from services.dashboard_service import DashboardService

    school = _client(_school(), [])
    users = Mock()
    for chained in ('select', 'eq', 'single'):
        getattr(users, chained).return_value = users
    users.execute.return_value = Mock(data={'id': AJ, 'first_name': 'AJ'})

    svc = DashboardService.__new__(DashboardService)
    svc.client = Mock()
    svc.client.table.side_effect = lambda name: users if name == 'users' else school.table(name)

    enrollments = [{'quest_id': q, 'quests': {'id': q, 'title': q}} for q in (Q_SHARED, Q_ELEM, Q_OWN)]
    # The real attach, on the enrollments the active-quest read would return.
    svc.get_active_quests = lambda user_id, exclude_quest_ids=None: \
        svc._attach_class_assignment(user_id, [dict(e) for e in enrollments])
    svc.get_enrolled_courses = lambda user_id: ([], set())
    svc.get_all_course_quest_ids = lambda: set()
    svc.get_assigned_class_quests = lambda user_id: []
    svc.get_completed_quests_count = lambda user_id: 0
    svc.get_completed_tasks_count = lambda user_id: 0
    svc.get_moments_count = lambda user_id: 0
    svc.get_recent_completed_quests = lambda user_id: []
    svc.get_archived_quests = lambda user_id: []
    return svc


@pytest.mark.unit
class TestDashboardSendsSourceClass:
    def test_the_route_response_carries_source_class_on_every_active_quest(
            self, client, auth_headers, mock_verify_token):
        svc = _service()
        with patch('routes.users.dashboard.DashboardService', return_value=svc), \
             patch('routes.users.helpers.calculate_user_xp', return_value=(0, {})), \
             patch('utils.session_manager.session_manager.get_effective_user_id', return_value=AJ):
            res = client.get('/api/users/dashboard', headers=auth_headers)

        assert res.status_code == 200, res.get_json()
        by = {q['quest_id']: q for q in res.get_json()['active_quests']}
        assert by[Q_SHARED]['source_class']['name'] == 'Biology'
        assert by[Q_SHARED]['source_class']['enrolled'] is True
        assert by[Q_ELEM]['source_class']['enrolled'] is False
        # The student's own quest says so explicitly, so the web groups it as
        # Personal rather than guessing from a missing key.
        assert 'source_class' in by[Q_OWN] and by[Q_OWN]['source_class'] is None
