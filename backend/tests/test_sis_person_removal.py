"""
Removing a person from a school.

iCreate, 2026-07-29: "I deleted the duplicate swenson family, but three members
of that family are still showing and Idk how to remove them." Deleting a
household only ever removed the household and its member links — by design, so a
mis-named family doesn't take its students with it — but nothing could then
remove the leftover accounts.
"""

import json
from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest

from services import sis_person_service as people


STUDENT = {'id': 's1', 'first_name': 'Ryder', 'last_name': 'Swenson', 'role': 'student',
           'org_role': None, 'org_roles': None, 'organization_id': 'org-1'}
GUARDIAN = {'id': 'p1', 'first_name': 'Erin', 'last_name': 'Swenson', 'role': 'org_managed',
            'org_role': 'parent', 'org_roles': None, 'organization_id': 'org-1'}
TEACHER = {'id': 't1', 'first_name': 'Kate', 'last_name': 'C', 'role': 'org_managed',
           'org_role': 'advisor', 'org_roles': None, 'organization_id': 'org-1'}

NO_HISTORY = {'class_enrollments': 0, 'attendance': 0, 'completed_work': 0,
              'registrations': 0, 'forms': 0}


@contextmanager
def person(user, history=None, dependents=0):
    """Patch the two DB-touching helpers so the decision logic is testable."""
    dep_rows = Mock(data=[{'id': f'd{i}'} for i in range(dependents)])
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'delete', 'update', 'upsert', 'in_'):
        getattr(table, chained).return_value = table
    table.execute.return_value = dep_rows
    with patch('services.sis_person_service._user', return_value=user), \
         patch('services.sis_person_service._history', return_value=history or dict(NO_HISTORY)), \
         patch('services.sis_person_service._admin', return_value=client):
        yield client, table


@pytest.mark.unit
class TestClassification:
    def test_student_is_a_student(self):
        assert people.is_student(STUDENT) is True
        assert people.is_staff(STUDENT) is False

    def test_org_managed_parent_reads_from_org_role(self):
        assert people.is_student(GUARDIAN) is False
        assert people.is_staff(GUARDIAN) is False

    def test_advisor_is_staff(self):
        assert people.is_staff(TEACHER) is True


@pytest.mark.unit
class TestPreview:
    def test_clean_duplicate_can_be_deleted(self):
        with person(STUDENT):
            preview = people.removal_preview('org-1', 's1')
        assert preview['can_delete'] is True
        assert preview['kind'] == 'student'

    def test_an_active_class_seat_does_not_block_deletion(self):
        """The seat is released on the way out — it isn't history to orphan."""
        with person(STUDENT, {**NO_HISTORY, 'class_enrollments': 2}):
            preview = people.removal_preview('org-1', 's1')
        assert preview['can_delete'] is True

    def test_attendance_blocks_deletion(self):
        with person(STUDENT, {**NO_HISTORY, 'attendance': 9}):
            preview = people.removal_preview('org-1', 's1')
        assert preview['can_delete'] is False
        assert preview['blocking'] == {'attendance': 9}

    def test_a_guardian_with_children_cannot_be_deleted(self):
        with person(GUARDIAN, dependents=2):
            preview = people.removal_preview('org-1', 'p1')
        assert preview['can_delete'] is False
        assert preview['blocking']['dependents'] == 2

    def test_unknown_person(self):
        with patch('services.sis_person_service._user', return_value=None):
            assert 'error' in people.removal_preview('org-1', 'nope')

    def test_superadmin_is_off_limits(self):
        with patch('services.sis_person_service._user',
                   return_value={**STUDENT, 'role': 'superadmin'}):
            assert 'error' in people.removal_preview('org-1', 's1')


@pytest.mark.unit
class TestRemove:
    def test_delete_is_refused_when_records_exist(self):
        with person(STUDENT, {**NO_HISTORY, 'completed_work': 4}):
            result = people.remove_person('org-1', 's1', actor_id='admin-1', mode='delete')
        assert 'error' in result
        assert result['blocking'] == {'completed_work': 4}

    def test_delete_removes_the_account(self):
        with person(STUDENT) as (client, table):
            with patch('services.sis_person_service._release_class_seats', return_value=0):
                result = people.remove_person('org-1', 's1', actor_id='admin-1', mode='delete')
        assert result['deleted'] is True
        assert any(call.args and call.args[0] == 'users' for call in client.table.call_args_list)

    def test_archiving_a_student_marks_them_withdrawn(self):
        with person(STUDENT) as (client, table):
            with patch('services.sis_person_service._release_class_seats', return_value=3):
                result = people.remove_person('org-1', 's1', actor_id='admin-1')
        assert result['archived'] is True
        assert result['seats_released'] == 3
        payload = table.upsert.call_args[0][0]
        assert payload['status'] == 'withdrawn'

    def test_archiving_a_guardian_detaches_them_with_a_valid_role(self):
        """org_managed with no organization_id violates a DB check constraint."""
        with person(GUARDIAN) as (client, table):
            with patch('services.sis_person_service._release_class_seats', return_value=0):
                result = people.remove_person('org-1', 'p1', actor_id='admin-1')
        assert result['detached'] is True
        payload = table.update.call_args[0][0]
        assert payload['organization_id'] is None
        assert payload['role'] == 'parent'

    def test_you_cannot_remove_yourself(self):
        with person(GUARDIAN):
            result = people.remove_person('org-1', 'p1', actor_id='p1')
        assert 'error' in result

    def test_staff_go_through_the_staff_path(self):
        with person(TEACHER), \
             patch('services.sis_staff_service.archive_staff',
                   return_value={'archived': True, 'name': 'Kate'}) as archive:
            result = people.remove_person('org-1', 't1', actor_id='admin-1')
        assert result['archived'] is True
        archive.assert_called_once()


def _admin_client_for_role(role):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'role': role, 'org_role': None, 'org_roles': None}])
    return client


@pytest.mark.unit
class TestRoutes:
    def test_removal_is_admin_only(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('student')):
            resp = client.delete('/api/sis/people/s1?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 403

    def test_preview_route(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('org_admin')), \
             patch('services.sis_service.resolve_org_id', return_value='org-1'), \
             patch('services.sis_person_service.removal_preview',
                   return_value={'kind': 'student', 'name': 'Ryder', 'can_delete': True,
                                 'history': NO_HISTORY, 'blocking': {}}):
            resp = client.get('/api/sis/people/s1/removal-preview?organization_id=org-1',
                              headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['can_delete'] is True

    def test_delete_route_passes_the_mode(self, client, auth_headers, mock_verify_token):
        captured = {}

        def fake_remove(org_id, target_id, actor_id, mode):
            captured.update(mode=mode, target=target_id, actor=actor_id)
            return {'deleted': True, 'name': 'Ryder'}

        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('org_admin')), \
             patch('services.sis_service.resolve_org_id', return_value='org-1'), \
             patch('services.sis_person_service.remove_person', side_effect=fake_remove):
            resp = client.delete('/api/sis/people/s1?organization_id=org-1&mode=delete',
                                 headers=auth_headers)
        assert resp.status_code == 200
        assert captured['mode'] == 'delete'
        assert captured['target'] == 's1'

    def test_blocked_delete_is_409(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_admin_client_for_role('org_admin')), \
             patch('services.sis_service.resolve_org_id', return_value='org-1'), \
             patch('services.sis_person_service.remove_person',
                   return_value={'error': 'Ryder has school records attached (attendance).',
                                 'blocking': {'attendance': 3}}):
            resp = client.delete('/api/sis/people/s1?organization_id=org-1&mode=delete',
                                 headers=auth_headers)
        assert resp.status_code == 409
        assert json.loads(resp.data)['blocking'] == {'attendance': 3}
