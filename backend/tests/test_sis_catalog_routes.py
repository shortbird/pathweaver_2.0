"""
Unit tests for SIS catalog routes (/api/sis/classes).

Covers staff-role gating, org scoping, input validation (billing fields,
capacity/age ranges, meeting times), and happy-path create/list. DB access is
mocked: the admin client serves the require_role lookup; repositories/services are
patched so no network is touched.
"""

from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest


def _admin_client_for_role(role):
    """Fake admin Supabase client whose users lookup returns the given role."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(
        data=[{'role': role, 'org_role': None, 'org_roles': None}]
    )
    return client


@contextmanager
def staff(role='org_admin', org='org-1'):
    """Patch auth (require_role) + org scoping so a staff user reaches the handler."""
    with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role(role)), \
         patch('services.sis_service.resolve_org_id', return_value=org), \
         patch('services.sis_service.class_scope', return_value=None):
        yield


@pytest.mark.unit
class TestClassRoutes:

    def test_list_requires_auth(self, client):
        assert client.get('/api/sis/classes').status_code == 401

    def test_list_forbidden_for_student(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('student')):
            resp = client.get('/api/sis/classes', headers=auth_headers)
        assert resp.status_code == 403


    def test_create_requires_name(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.post('/api/sis/classes', headers=auth_headers, json={'name': ''})
        assert resp.status_code == 400

    def test_create_rejects_bad_billing_type(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.post('/api/sis/classes', headers=auth_headers,
                               json={'name': 'Art', 'billing_type': 'crypto'})
        assert resp.status_code == 400

    def test_create_rejects_negative_capacity(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.post('/api/sis/classes', headers=auth_headers,
                               json={'name': 'Art', 'capacity': -3})
        assert resp.status_code == 400

    def test_create_rejects_inverted_age_band(self, client, auth_headers, mock_verify_token):
        with staff():
            resp = client.post('/api/sis/classes', headers=auth_headers,
                               json={'name': 'Art', 'min_age': 12, 'max_age': 8})
        assert resp.status_code == 400

    def test_create_success(self, client, auth_headers, mock_verify_token):
        mock_repo = Mock()
        mock_repo.create_for_org.return_value = {'id': 'c1', 'name': 'Art'}
        with staff(), patch('routes.sis.catalog.SisClassRepository', return_value=mock_repo), \
             patch('routes.sis.catalog.get_supabase_admin_client', return_value=Mock()):
            resp = client.post('/api/sis/classes', headers=auth_headers,
                               json={'name': 'Art', 'capacity': 10, 'price_cents': 5000})
        assert resp.status_code == 201
        assert mock_repo.create_for_org.call_args.kwargs['created_by'] == 'test-user-123'

    def test_get_not_found(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.catalog.catalog.get_class_detail', return_value=None):
            resp = client.get('/api/sis/classes/c1?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 404


@pytest.mark.unit
class TestMeetingRoutes:

    def _ok_class_repo(self):
        repo = Mock()
        repo.find_by_id.return_value = {'id': 'c1', 'organization_id': 'org-1'}
        repo.add_meeting.return_value = {'id': 'm1'}
        return repo

    def test_add_meeting_requires_times(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.catalog.SisClassRepository', return_value=self._ok_class_repo()), \
             patch('routes.sis.catalog.get_supabase_admin_client', return_value=Mock()):
            resp = client.post('/api/sis/classes/c1/meetings', headers=auth_headers,
                               json={'day_of_week': 1})
        assert resp.status_code == 400

    def test_add_meeting_rejects_end_before_start(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.catalog.SisClassRepository', return_value=self._ok_class_repo()), \
             patch('routes.sis.catalog.get_supabase_admin_client', return_value=Mock()):
            resp = client.post('/api/sis/classes/c1/meetings', headers=auth_headers,
                               json={'day_of_week': 1, 'start_time': '10:00', 'end_time': '09:00'})
        assert resp.status_code == 400

    def test_add_meeting_requires_day_or_date(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.catalog.SisClassRepository', return_value=self._ok_class_repo()), \
             patch('routes.sis.catalog.get_supabase_admin_client', return_value=Mock()):
            resp = client.post('/api/sis/classes/c1/meetings', headers=auth_headers,
                               json={'start_time': '09:00', 'end_time': '10:00'})
        assert resp.status_code == 400

    def test_add_meeting_success(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.catalog.SisClassRepository', return_value=self._ok_class_repo()), \
             patch('routes.sis.catalog.get_supabase_admin_client', return_value=Mock()):
            resp = client.post('/api/sis/classes/c1/meetings', headers=auth_headers,
                               json={'day_of_week': 2, 'start_time': '09:00', 'end_time': '10:30'})
        assert resp.status_code == 201

    def test_add_meeting_class_not_found(self, client, auth_headers, mock_verify_token):
        repo = Mock()
        repo.find_by_id.return_value = None
        with staff(), patch('routes.sis.catalog.SisClassRepository', return_value=repo), \
             patch('routes.sis.catalog.get_supabase_admin_client', return_value=Mock()):
            resp = client.post('/api/sis/classes/c1/meetings', headers=auth_headers,
                               json={'day_of_week': 2, 'start_time': '09:00', 'end_time': '10:30'})
        assert resp.status_code == 404


@pytest.mark.unit
class TestTeacherConflictRoutes:

    def test_requires_auth(self, client):
        assert client.get('/api/sis/teacher-conflicts').status_code == 401

    def test_forbidden_for_student(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('student')):
            resp = client.get('/api/sis/teacher-conflicts', headers=auth_headers)
        assert resp.status_code == 403

    def test_lists_conflicts_for_staff(self, client, auth_headers, mock_verify_token):
        row = {'teacher_id': 't1', 'teacher_name': 'Hollie Smith',
               'class_a_id': 'a', 'class_a': 'Digital Art Studio',
               'class_b_id': 'b', 'class_b': 'Story Detectives',
               'day_of_week': 4, 'start_time': '14:00', 'end_time': '15:00'}
        with staff(), patch('services.sis_registration_service.list_teacher_conflicts',
                            return_value=[row]):
            resp = client.get('/api/sis/teacher-conflicts?organization_id=org-1',
                              headers=auth_headers)
        assert resp.status_code == 200
        assert resp.get_json()['conflicts'] == [row]


def _admin_client_for_org_role(org_role):
    """Fake admin client for an org_managed user whose real role is in org_role."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(
        data=[{'role': 'org_managed', 'org_role': org_role, 'org_roles': [org_role]}]
    )
    return client


@pytest.mark.unit
class TestScheduleSettingsRoute:
    """Rooms + time blocks for the class editor's pickers.

    The reason this route exists: the Classes page read them from
    /api/admin/organizations/<id>, which is org_admin-gated. A campus
    coordinator is deliberately not an org_admin, so they got a 403 and a
    free-text classroom box where everyone else saw the room dropdown.
    """

    SETTINGS = {'rooms': [{'name': 'Art Studio', 'description': '12 students'}],
                'time_blocks': [{'start': '09:30', 'end': '10:30', 'label': ''}]}

    def test_requires_auth(self, client):
        assert client.get('/api/sis/schedule-settings').status_code == 401

    def test_forbidden_for_student(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('student')):
            resp = client.get('/api/sis/schedule-settings', headers=auth_headers)
        assert resp.status_code == 403

    def test_campus_coordinator_gets_the_rooms(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_org_role('campus_coordinator')), \
             patch('services.sis_service.resolve_org_id', return_value='org-1'), \
             patch('routes.sis.catalog.catalog.schedule_settings', return_value=self.SETTINGS):
            resp = client.get('/api/sis/schedule-settings?organization_id=org-1',
                              headers=auth_headers)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['rooms'] == self.SETTINGS['rooms']
        assert body['time_blocks'] == self.SETTINGS['time_blocks']

    def test_teacher_may_read_them_too(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_org_role('advisor')), \
             patch('services.sis_service.resolve_org_id', return_value='org-1'), \
             patch('routes.sis.catalog.catalog.schedule_settings', return_value=self.SETTINGS):
            resp = client.get('/api/sis/schedule-settings?organization_id=org-1',
                              headers=auth_headers)
        assert resp.status_code == 200


@pytest.mark.unit
class TestScheduleSettingsService:
    """Only the two schedule keys come back, and never as anything but a list."""

    def _org_row(self, flags):
        admin = Mock()
        table = Mock()
        admin.table.return_value = table
        for chained in ('select', 'eq', 'limit'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[{'feature_flags': flags}])
        return admin

    def _call(self, flags):
        from services import sis_catalog_service
        with patch.object(sis_catalog_service, '_admin', return_value=self._org_row(flags)):
            return sis_catalog_service.schedule_settings('org-1')

    def test_returns_rooms_and_blocks(self):
        out = self._call({'sis_settings': {
            'rooms': [{'name': 'Kitchen'}],
            'time_blocks': [{'start': '09:30', 'end': '10:30'}],
        }})
        assert out == {'rooms': [{'name': 'Kitchen'}],
                       'time_blocks': [{'start': '09:30', 'end': '10:30'}]}

    def test_withholds_the_rest_of_the_settings_blob(self):
        out = self._call({'sis_settings': {'rooms': [], 'optio_course_tuition_cents': 25000}})
        assert out == {'rooms': [], 'time_blocks': []}

    def test_empty_when_unset_or_nulled(self):
        # Settings cards write null, not [], when the last row is removed.
        assert self._call({'sis_settings': {'rooms': None}}) == {'rooms': [], 'time_blocks': []}
        assert self._call({}) == {'rooms': [], 'time_blocks': []}
