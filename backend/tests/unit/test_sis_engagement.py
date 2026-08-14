"""Unit tests for SIS engagement routes (/api/sis/engagement-alerts)."""

from unittest.mock import patch, MagicMock
import pytest


@pytest.fixture
def client():
    from app import app
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


def _mock_admin_user(role='advisor', org_role=None):
    mock = MagicMock()
    # Mocking users table select query
    mock_users_table = MagicMock()
    mock_users_table.select.return_value.eq.return_value.execute.return_value.data = [
        {'role': role, 'org_role': org_role, 'org_roles': [org_role] if org_role else []}
    ]
    mock.table.return_value = mock_users_table
    return mock


def test_list_engagement_alerts_regular_advisor_uses_advisor_classes(client):
    """A regular advisor gets alerts for the classes they teach."""
    mock_alerts = [
        {'id': 'a1', 'student_user_id': 's1', 'class_id': 'c1', 'alert_type': 'inactive_two_weeks'}
    ]
    mock_admin = _mock_admin_user(role='org_managed', org_role='advisor')

    with patch('services.sis_service.resolve_org_id', return_value='org-1'), \
         patch('services.sis_service.caller_is_admin', return_value=False), \
         patch('services.sis_service.class_scope', return_value=['c1', 'c2']), \
         patch('services.sis_service.advisor_class_ids', return_value=['c1', 'c2']) as mock_advisor_ids, \
         patch('services.sis_engagement_service.list_open_alerts', return_value=mock_alerts) as mock_list, \
         patch('utils.session_manager.session_manager.get_effective_user_id', return_value='teacher-1'), \
         patch('database.get_supabase_admin_client', return_value=mock_admin):

        res = client.get('/api/sis/engagement-alerts?organization_id=org-1')
        assert res.status_code == 200
        data = res.get_json()
        assert data['success'] is True
        assert len(data['alerts']) == 1

        mock_advisor_ids.assert_called_once_with('teacher-1', 'org-1')
        mock_list.assert_called_once_with('org-1', class_ids=['c1', 'c2'])


def test_list_engagement_alerts_admin_on_teacher_view_scopes_to_own_classes(client):
    """An admin on the teacher view gets alerts for their own classes, NOT all org classes."""
    mock_alerts = [
        {'id': 'a1', 'student_user_id': 's1', 'class_id': 'c1', 'alert_type': 'inactive_two_weeks'}
    ]
    mock_admin = _mock_admin_user(role='org_managed', org_role='org_admin')

    with patch('services.sis_service.resolve_org_id', return_value='org-1'), \
         patch('services.sis_service.caller_is_admin', return_value=True), \
         patch('services.sis_service.advisor_class_ids', return_value=['c1']) as mock_advisor_ids, \
         patch('services.sis_engagement_service.list_open_alerts', return_value=mock_alerts) as mock_list, \
         patch('utils.session_manager.session_manager.get_effective_user_id', return_value='admin-1'), \
         patch('database.get_supabase_admin_client', return_value=mock_admin):

        res = client.get('/api/sis/engagement-alerts?organization_id=org-1&mine=true')
        assert res.status_code == 200
        data = res.get_json()
        assert data['success'] is True

        mock_advisor_ids.assert_called_once_with('admin-1', 'org-1')
        mock_list.assert_called_once_with('org-1', class_ids=['c1'])


def test_list_engagement_alerts_admin_with_scope_all_gets_unrestricted(client):
    """An admin passing scope=all gets unrestricted org-wide alerts."""
    mock_alerts = [
        {'id': 'a1', 'student_user_id': 's1', 'class_id': 'c1'},
        {'id': 'a2', 'student_user_id': 's2', 'class_id': 'c2_algebra_1'},
    ]
    mock_admin = _mock_admin_user(role='org_managed', org_role='org_admin')

    with patch('services.sis_service.resolve_org_id', return_value='org-1'), \
         patch('services.sis_service.caller_is_admin', return_value=True), \
         patch('services.sis_engagement_service.list_open_alerts', return_value=mock_alerts) as mock_list, \
         patch('utils.session_manager.session_manager.get_effective_user_id', return_value='admin-1'), \
         patch('database.get_supabase_admin_client', return_value=mock_admin):

        res = client.get('/api/sis/engagement-alerts?organization_id=org-1&scope=all')
        assert res.status_code == 200
        data = res.get_json()
        assert data['success'] is True
        assert len(data['alerts']) == 2

        mock_list.assert_called_once_with('org-1', class_ids=None)


def test_list_engagement_alerts_non_admin_cannot_use_scope_all(client):
    """A non-admin advisor requesting scope=all is still restricted to their classes."""
    mock_alerts = [
        {'id': 'a1', 'student_user_id': 's1', 'class_id': 'c1'}
    ]
    mock_admin = _mock_admin_user(role='org_managed', org_role='advisor')

    with patch('services.sis_service.resolve_org_id', return_value='org-1'), \
         patch('services.sis_service.caller_is_admin', return_value=False), \
         patch('services.sis_service.advisor_class_ids', return_value=['c1']) as mock_advisor_ids, \
         patch('services.sis_engagement_service.list_open_alerts', return_value=mock_alerts) as mock_list, \
         patch('utils.session_manager.session_manager.get_effective_user_id', return_value='teacher-1'), \
         patch('database.get_supabase_admin_client', return_value=mock_admin):

        res = client.get('/api/sis/engagement-alerts?organization_id=org-1&scope=all')
        assert res.status_code == 200
        data = res.get_json()
        assert data['success'] is True

        mock_advisor_ids.assert_called_once_with('teacher-1', 'org-1')
        mock_list.assert_called_once_with('org-1', class_ids=['c1'])


def test_list_engagement_alerts_class_id_filter_security(client):
    """Requesting a class_id filters to that class if allowed, or returns empty if not allowed."""
    mock_admin = _mock_admin_user(role='org_managed', org_role='advisor')

    with patch('services.sis_service.resolve_org_id', return_value='org-1'), \
         patch('services.sis_service.caller_is_admin', return_value=False), \
         patch('services.sis_service.class_scope', return_value=['c1']), \
         patch('utils.session_manager.session_manager.get_effective_user_id', return_value='teacher-1'), \
         patch('database.get_supabase_admin_client', return_value=mock_admin):

        # c2 is not in teacher-1's class_scope
        res = client.get('/api/sis/engagement-alerts?organization_id=org-1&class_id=c2')
        assert res.status_code == 200
        data = res.get_json()
        assert data['success'] is True
        assert data['alerts'] == []
