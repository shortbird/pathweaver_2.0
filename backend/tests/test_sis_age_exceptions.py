"""
Unit tests for age-exception requests — a family asks the school to allow a
student into a class outside its posted age band (ticket 24e3c118).

Parent side (sis_parent_service.request_age_exception): guardian-scoped, gated
like every other self-service action, snapshots the age math the builder uses.
Staff side (sis_exception_service.resolve): approve enrolls immediately
(capacity-unrestricted, like direct enrollment); decline just records.
"""

from unittest.mock import MagicMock, patch

import pytest

from services import sis_exception_service as exceptions
from services import sis_parent_service as parent

_MINE = [{'student_id': 'stu1', 'org_id': 'org1', 'household_id': 'h1',
          'name': 'Stu One', 'date_of_birth': '2018-03-10'}]
_ROBOTICS = {'id': 'class1', 'name': 'Robotics', 'registration_status': 'open',
             'min_age': 9, 'max_age': 12}
_GATE = {'error': 'on hold', 'registration_hold': True}


def _chain(*datasets):
    """A supabase query-builder stand-in: every chained method returns the same
    mock; successive .execute() calls pop the given datasets."""
    m = MagicMock()
    for meth in ('select', 'insert', 'update', 'upsert', 'delete',
                 'eq', 'in_', 'limit', 'order'):
        getattr(m, meth).return_value = m
    m.execute.side_effect = [MagicMock(data=d) for d in datasets]
    return m


def _client(tables):
    client = MagicMock()
    client.table.side_effect = lambda name: tables[name]
    return client


@pytest.mark.unit
class TestRequestAgeException:
    def test_requires_guardian_relationship(self):
        with patch('services.sis_parent_service.registerable_students', return_value=[]):
            result = parent.request_age_exception('g1', 'org1', 'stu1', 'class1')
        assert result == {'error': 'Not authorized for this student'}

    def test_locked_after_first_day(self):
        with patch('services.sis_parent_service.registerable_students', return_value=_MINE), \
             patch('services.sis_parent_service._changes_locked', return_value=True):
            result = parent.request_age_exception('g1', 'org1', 'stu1', 'class1')
        assert 'handled by the school' in result['error']

    def test_family_gate_applies(self):
        with patch('services.sis_parent_service.registerable_students', return_value=_MINE), \
             patch('services.sis_parent_service._changes_locked', return_value=False), \
             patch('services.sis_parent_service._family_gate', return_value=_GATE):
            result = parent.request_age_exception('g1', 'org1', 'stu1', 'class1')
        assert result == _GATE

    def test_class_must_be_open(self):
        closed = {**_ROBOTICS, 'registration_status': 'closed'}
        with patch('services.sis_parent_service.registerable_students', return_value=_MINE), \
             patch('services.sis_parent_service._changes_locked', return_value=False), \
             patch('services.sis_parent_service._family_gate', return_value=None), \
             patch('services.sis_parent_service.catalog.list_classes', return_value=[closed]):
            result = parent.request_age_exception('g1', 'org1', 'stu1', 'class1')
        assert result == {'error': 'This class is not open for registration'}

    def test_snapshots_age_as_of_first_day(self):
        # DOB 2018-03-10, first day 2026-08-15 -> the student is 8 that day.
        with patch('services.sis_parent_service.registerable_students', return_value=_MINE), \
             patch('services.sis_parent_service._changes_locked', return_value=False), \
             patch('services.sis_parent_service._family_gate', return_value=None), \
             patch('services.sis_parent_service.catalog.list_classes', return_value=[_ROBOTICS]), \
             patch('services.sis_parent_service._first_day_of_school', return_value='2026-08-15'), \
             patch('services.sis_exception_service.create_request',
                   return_value={'request': {'id': 'r1'}}) as create:
            result = parent.request_age_exception('g1', 'org1', 'stu1', 'class1',
                                                  message='She has done two robotics camps')
        assert result == {'request': {'id': 'r1'}}
        create.assert_called_once_with(
            'org1', 'g1', 'stu1', 'class1',
            message='She has done two robotics camps',
            student_age=8, class_min_age=9, class_max_age=12)


@pytest.mark.unit
class TestCreateRequest:
    def test_dedupes_open_requests(self):
        table = _chain([{'id': 'existing'}])
        with patch('services.sis_exception_service._admin',
                   return_value=_client({exceptions.TABLE: table})):
            result = exceptions.create_request('org1', 'g1', 'stu1', 'class1')
        assert result == {'already': True, 'request_id': 'existing'}
        table.insert.assert_not_called()

    def test_inserts_with_snapshots(self):
        table = _chain([], [{'id': 'r1', 'status': 'pending'}])
        with patch('services.sis_exception_service._admin',
                   return_value=_client({exceptions.TABLE: table})):
            result = exceptions.create_request(
                'org1', 'g1', 'stu1', 'class1', message='  please  ',
                student_age=8, class_min_age=9, class_max_age=12)
        assert result == {'request': {'id': 'r1', 'status': 'pending'}}
        inserted = table.insert.call_args[0][0]
        assert inserted['student_age'] == 8
        assert inserted['class_min_age'] == 9
        assert inserted['class_max_age'] == 12
        assert inserted['message'] == 'please'

    def test_blank_message_stored_as_null(self):
        table = _chain([], [{'id': 'r1'}])
        with patch('services.sis_exception_service._admin',
                   return_value=_client({exceptions.TABLE: table})):
            exceptions.create_request('org1', 'g1', 'stu1', 'class1', message='   ')
        assert table.insert.call_args[0][0]['message'] is None


_PENDING = {'id': 'r1', 'organization_id': 'org1', 'status': 'pending',
            'guardian_user_id': 'g1', 'student_user_id': 'stu1', 'class_id': 'class1'}


@pytest.mark.unit
class TestResolve:
    def test_approve_enrolls_and_clears_waitlist(self):
        requests = _chain([_PENDING], [{**_PENDING, 'status': 'approved'}])
        enrollments = _chain([])
        waitlist = _chain([])
        client = _client({exceptions.TABLE: requests,
                          'class_enrollments': enrollments,
                          'sis_waitlist_entries': waitlist})
        with patch('services.sis_exception_service._admin', return_value=client), \
             patch('services.class_group_sync_service.sync_class_group') as sync:
            result = exceptions.resolve('org1', 'r1', 'approve', resolved_by='staff1')
        assert result['request']['status'] == 'approved'
        enrollments.upsert.assert_called_once_with({
            'class_id': 'class1', 'student_id': 'stu1',
            'status': 'active', 'enrolled_by': 'staff1',
        }, on_conflict='class_id,student_id')
        waitlist.delete.assert_called_once()
        sync.assert_called_once_with('class1', actor_id='staff1')
        assert requests.update.call_args[0][0]['status'] == 'approved'

    def test_decline_records_without_enrolling(self):
        requests = _chain([_PENDING], [{**_PENDING, 'status': 'declined'}])
        enrollments = _chain([])
        client = _client({exceptions.TABLE: requests, 'class_enrollments': enrollments})
        with patch('services.sis_exception_service._admin', return_value=client):
            result = exceptions.resolve('org1', 'r1', 'decline', resolved_by='staff1')
        assert result['request']['status'] == 'declined'
        enrollments.upsert.assert_not_called()
        assert requests.update.call_args[0][0]['status'] == 'declined'

    def test_already_resolved(self):
        requests = _chain([{**_PENDING, 'status': 'approved'}])
        with patch('services.sis_exception_service._admin',
                   return_value=_client({exceptions.TABLE: requests})):
            result = exceptions.resolve('org1', 'r1', 'approve', resolved_by='staff1')
        assert result == {'error': 'This request was already resolved'}

    def test_wrong_org_is_not_found(self):
        requests = _chain([])
        with patch('services.sis_exception_service._admin',
                   return_value=_client({exceptions.TABLE: requests})):
            result = exceptions.resolve('org2', 'r1', 'approve', resolved_by='staff1')
        assert result == {'error': 'Request not found'}


@pytest.mark.unit
class TestListRequests:
    def test_hydrates_names(self):
        requests = _chain([{**_PENDING, 'created_at': '2026-07-14T10:00:00Z'}])
        users = _chain([
            {'id': 'stu1', 'first_name': 'Kid', 'last_name': 'One'},
            {'id': 'g1', 'display_name': 'Parent One'},
        ])
        classes = _chain([{'id': 'class1', 'name': 'Robotics', 'min_age': 9, 'max_age': 12}])
        client = _client({exceptions.TABLE: requests, 'users': users,
                          'org_classes': classes})
        with patch('services.sis_exception_service._admin', return_value=client):
            rows = exceptions.list_requests('org1')
        assert rows[0]['student_name'] == 'Kid One'
        assert rows[0]['guardian_name'] == 'Parent One'
        assert rows[0]['class_name'] == 'Robotics'
