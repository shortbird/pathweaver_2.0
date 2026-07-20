"""
Unit tests for the SIS CLP (Customized Learning Plan) meeting view service.

Covers the two composed reads the CLP screen relies on:
  - clp_directory: active students grouped by family (withdrawn/graduated hidden,
    students without a household become single-child families).
  - get_clp_student: the catalog annotated with THIS student's enrolled/waitlist
    state + the derived schedule, and org isolation.
"""

from unittest.mock import MagicMock, patch

import pytest

from services import sis_clp_service as clp


def _chain(*datasets):
    """Supabase query-builder stand-in: chained methods return the same mock;
    successive .execute() calls pop the given datasets."""
    m = MagicMock()
    for meth in ('select', 'insert', 'update', 'upsert', 'delete',
                 'eq', 'in_', 'is_', 'limit', 'order'):
        getattr(m, meth).return_value = m
    m.execute.side_effect = [MagicMock(data=d) for d in datasets]
    return m


def _client(tables):
    client = MagicMock()
    client.table.side_effect = lambda name: tables[name]
    return client


_ROSTER = [
    {'student_id': 's1', 'name': 'Alice Ant', 'is_student': True, 'first_name': 'Alice',
     'last_name': 'Ant', 'household_id': 'h1', 'household_name': 'Ant Family',
     'grade_level': '3', 'enrollment_status': 'enrolled'},
    {'student_id': 's2', 'name': 'Bob Ant', 'is_student': True, 'first_name': 'Bob',
     'last_name': 'Ant', 'household_id': 'h1', 'household_name': 'Ant Family',
     'grade_level': '5', 'enrollment_status': 'applicant'},
    {'student_id': 's3', 'name': 'Cara Solo', 'is_student': True, 'first_name': 'Cara',
     'last_name': 'Solo', 'household_id': None, 'household_name': None,
     'grade_level': None, 'enrollment_status': 'enrolled'},
    {'student_id': 's4', 'name': 'Gone Kid', 'is_student': True, 'household_id': None,
     'household_name': None, 'enrollment_status': 'withdrawn'},
    {'student_id': 'p1', 'name': 'Pat Parent', 'is_student': False, 'household_id': 'h1',
     'household_name': 'Ant Family', 'enrollment_status': None},
]


@pytest.mark.unit
class TestDirectory:
    def test_groups_students_by_family_and_hides_inactive(self):
        with patch('services.sis_clp_service.sis_service.get_roster', return_value=_ROSTER):
            out = clp.clp_directory('org1')
        # Parent + withdrawn student excluded from the flat student list.
        ids = {s['student_id'] for s in out['students']}
        assert ids == {'s1', 's2', 's3'}
        # Families: the Ant Family (2 kids) and Cara's solo family.
        fam = {f['name']: f for f in out['families']}
        assert fam['Ant Family']['student_count'] == 2
        assert [s['student_id'] for s in fam['Ant Family']['students']] == ['s1', 's2']
        assert 'Cara Solo' in fam
        assert fam['Cara Solo']['household_id'] is None

    def test_families_sorted_alphabetically(self):
        with patch('services.sis_clp_service.sis_service.get_roster', return_value=_ROSTER):
            out = clp.clp_directory('org1')
        names = [f['name'] for f in out['families']]
        assert names == sorted(names, key=str.lower)


_CATALOG = [
    {'id': 'c1', 'name': 'Art', 'description': None, 'location': 'Room A', 'capacity': 10,
     'enrolled_count': 4, 'waitlist_count': 0, 'spots_left': 6, 'is_full': False,
     'registration_status': 'open', 'waitlist_enabled': True, 'price_cents': 5000,
     'min_age': None, 'max_age': None, 'primary_instructor': {'id': 't1', 'name': 'Mr T'},
     'meetings': [{'id': 'm1', 'day_of_week': 1, 'start_time': '09:00:00', 'end_time': '10:00:00', 'location': 'A'}]},
    {'id': 'c2', 'name': 'Band', 'capacity': 8, 'enrolled_count': 8, 'waitlist_count': 3,
     'spots_left': 0, 'is_full': True, 'registration_status': 'open', 'waitlist_enabled': True,
     'meetings': [{'id': 'm2', 'day_of_week': 3, 'start_time': '11:00:00', 'end_time': '12:00:00'}]},
    {'id': 'c3', 'name': 'Chess', 'capacity': None, 'enrolled_count': 2, 'waitlist_count': 0,
     'spots_left': None, 'is_full': False, 'registration_status': 'open', 'meetings': []},
]


@pytest.mark.unit
class TestClpStudent:
    def _run(self, enrolled, waitlist):
        tables = {
            'class_enrollments': _chain(enrolled),
            'sis_waitlist_entries': _chain(waitlist),
        }
        with patch('services.sis_clp_service.sis_service.student_in_org', return_value=True), \
             patch('services.sis_clp_service._student_profile',
                   return_value={'student_id': 's1', 'name': 'Alice Ant'}), \
             patch('services.sis_clp_service._family_and_siblings',
                   return_value=({'household_id': 'h1', 'name': 'Ant Family'},
                                 [{'student_id': 's2', 'name': 'Bob Ant'}])), \
             patch('services.sis_clp_service.catalog.list_classes', return_value=_CATALOG), \
             patch('services.sis_clp_service._admin', return_value=_client(tables)):
            return clp.get_clp_student('org1', 's1')

    def test_annotates_enrollment_and_waitlist_and_builds_schedule(self):
        out = self._run(
            enrolled=[{'class_id': 'c1'}],
            waitlist=[{'id': 'w9', 'class_id': 'c2', 'status': 'waiting', 'position': 2}],
        )
        by_id = {c['class_id']: c for c in out['classes']}
        assert by_id['c1']['is_enrolled'] is True
        assert by_id['c2']['on_waitlist'] is True
        assert by_id['c2']['waitlist_entry_id'] == 'w9'
        assert by_id['c2']['waitlist_position'] == 2
        assert by_id['c3']['is_enrolled'] is False and by_id['c3']['on_waitlist'] is False
        # Times trimmed to HH:MM for the frontend.
        assert by_id['c1']['meetings'][0]['start_time'] == '09:00'
        # Schedule = the enrolled classes only.
        assert [c['class_id'] for c in out['schedule']] == ['c1']
        assert out['siblings'][0]['student_id'] == 's2'

    def test_no_enrollments_means_empty_schedule(self):
        out = self._run(enrolled=[], waitlist=[])
        assert out['schedule'] == []
        assert all(not c['is_enrolled'] for c in out['classes'])

    def test_out_of_org_student_returns_none(self):
        with patch('services.sis_clp_service.sis_service.student_in_org', return_value=False):
            assert clp.get_clp_student('org1', 'stranger') is None
