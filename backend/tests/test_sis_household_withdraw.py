"""
A whole family leaving the school, from the family record.

iCreate, 2026-09-08 (e40080a8): "Trying to unenroll family. But the instructions
don't explain how to do it" -- filed after opening Delete family and cancelling
it three times. Withdrawing was one person at a time from People > Everyone,
and not findable from the Families tab. Now the family record does it for every
student in the family, and leaves guardians, the record and history alone.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_person_service as people


ORG = 'org-1'
HOUSEHOLD = {'id': 'h1', 'organization_id': ORG, 'name': 'Swenson'}
MEMBERS = [
    {'household_id': 'h1', 'user_id': 's1', 'relationship': 'student'},
    {'household_id': 'h1', 'user_id': 's2', 'relationship': 'student'},
    {'household_id': 'h1', 'user_id': 'p1', 'relationship': 'guardian'},
]
USERS = {
    's1': {'id': 's1', 'first_name': 'Ryder', 'last_name': 'Swenson', 'role': 'student',
           'org_role': None, 'org_roles': None, 'organization_id': ORG},
    's2': {'id': 's2', 'first_name': 'Nora', 'last_name': 'Swenson', 'role': 'student',
           'org_role': None, 'org_roles': None, 'organization_id': ORG},
    'p1': {'id': 'p1', 'first_name': 'Erin', 'last_name': 'Swenson', 'role': 'org_managed',
           'org_role': 'parent', 'org_roles': None, 'organization_id': ORG},
}
NO_HISTORY = {'class_enrollments': 0, 'attendance': 0, 'completed_work': 0,
              'registrations': 0, 'forms': 0}


def _repo(household=HOUSEHOLD, members=MEMBERS):
    repo = Mock()
    repo.find_by_id.return_value = household
    repo.members_for_households.return_value = members
    return repo


@pytest.mark.unit
class TestWithdrawHousehold:
    def _run(self, repo, archive, history=None, withdrawn=False):
        with patch('repositories.household_repository.HouseholdRepository', return_value=repo), \
             patch('services.sis_person_service._admin', return_value=Mock()), \
             patch('services.sis_person_service._user', side_effect=lambda org, uid: USERS.get(uid)), \
             patch('services.sis_person_service._history',
                   return_value=history or {**NO_HISTORY, 'class_enrollments': 1}), \
             patch('services.sis_person_service._is_withdrawn', return_value=withdrawn), \
             patch('services.sis_person_service._archive', archive):
            return people.withdraw_household(ORG, 'h1')

    def test_every_student_is_archived_and_the_guardian_is_not(self):
        archive = Mock(return_value={'archived': True, 'seats_released': 2})
        result = self._run(_repo(), archive)
        assert [w['name'] for w in result['withdrawn']] == ['Ryder Swenson', 'Nora Swenson']
        assert result['withdrawn'][0]['seats_released'] == 2
        archived_ids = [c.args[1] for c in archive.call_args_list]
        assert archived_ids == ['s1', 's2']
        assert all(c.kwargs.get('student') is True for c in archive.call_args_list)
        assert result['household_name'] == 'Swenson'

    def test_a_family_already_withdrawn_is_reported_not_repeated(self):
        archive = Mock(return_value={'archived': True, 'seats_released': 0})
        result = self._run(_repo(), archive, history=dict(NO_HISTORY), withdrawn=True)
        assert result['withdrawn'] == []
        assert result['already'] == ['Ryder Swenson', 'Nora Swenson']
        archive.assert_not_called()

    def test_a_withdrawn_student_who_still_holds_a_seat_is_archived_again(self):
        """The mark was set but a seat was added afterwards: free it."""
        archive = Mock(return_value={'archived': True, 'seats_released': 1})
        result = self._run(_repo(), archive, history={**NO_HISTORY, 'class_enrollments': 1},
                           withdrawn=True)
        assert len(result['withdrawn']) == 2

    def test_another_schools_family_is_not_found(self):
        repo = _repo(household={**HOUSEHOLD, 'organization_id': 'org-2'})
        archive = Mock()
        result = self._run(repo, archive)
        assert result == {'error': 'Household not found'}
        archive.assert_not_called()

    def test_missing_household(self):
        result = self._run(_repo(household=None), Mock())
        assert result == {'error': 'Household not found'}


@pytest.mark.unit
class TestWithdrawRoute:
    def test_route_is_admin_only_and_returns_the_service_answer(self, app):
        from routes.sis import withdraw_household
        assert withdraw_household is not None
        rule = app.url_map.bind('localhost').match(
            '/api/sis/households/h1/withdraw', method='POST')
        assert rule[0] == 'sis.withdraw_household'
