"""Tests for sis_person_service.set_student_standing: withdraw a student, or
reinstate one.

Until 2026-10-15 this file also guarded POST
/api/admin/organizations/<org>/users/<id>/standing (routes/admin/
org_member_standing.py), "Withdraw from school" for schools without the SIS
console. Every org is an SIS org since that day; the web organization console
that called the route was removed, and the route with it. The write lives on:
the SIS roster and the family-group dashboard both use it.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_person_service as people

ORG = 'org-1'


USERS = {
    's1': {'id': 's1', 'first_name': 'Sam', 'last_name': 'Student', 'role': 'org_managed',
           'org_role': 'student', 'org_roles': None, 'organization_id': ORG},
    'p1': {'id': 'p1', 'first_name': 'Penny', 'last_name': 'Parent', 'role': 'org_managed',
           'org_role': 'parent', 'org_roles': None, 'organization_id': ORG},
}


@pytest.mark.unit
class TestSetStudentStanding:
    def test_withdrawing_archives_the_student_the_way_the_roster_does(self):
        archive = Mock(return_value={'archived': True, 'seats_released': 2})
        with patch('services.sis_person_service._user', side_effect=lambda org, uid: USERS.get(uid)), \
             patch('services.sis_person_service._archive', archive):
            result = people.set_student_standing(ORG, 's1', withdrawn=True)
        archive.assert_called_once_with(ORG, 's1', 'Sam Student', student=True)
        assert result == {'withdrawn': True, 'name': 'Sam Student', 'seats_released': 2}

    def test_reinstating_writes_enrolled_and_takes_no_seats(self):
        admin = Mock()
        with patch('services.sis_person_service._user', side_effect=lambda org, uid: USERS.get(uid)), \
             patch('services.sis_person_service._admin', return_value=admin), \
             patch('services.sis_person_service._archive') as archive:
            result = people.set_student_standing(ORG, 's1', withdrawn=False)
        archive.assert_not_called()
        payload = admin.table.return_value.upsert.call_args.args[0]
        assert payload['status'] == 'enrolled'
        assert payload['student_user_id'] == 's1'
        assert result == {'withdrawn': False, 'name': 'Sam Student'}

    def test_a_parent_cannot_be_withdrawn(self):
        with patch('services.sis_person_service._user', side_effect=lambda org, uid: USERS.get(uid)):
            result = people.set_student_standing(ORG, 'p1', withdrawn=True)
        assert 'Only a student' in result['error']

    def test_someone_outside_the_org_is_not_found(self):
        with patch('services.sis_person_service._user', return_value=None):
            assert 'not found' in people.set_student_standing(ORG, 'zz', withdrawn=True)['error']
