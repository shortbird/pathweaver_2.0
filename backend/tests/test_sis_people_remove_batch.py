"""
Removing the people a deleted family leaves behind, in one go.

iCreate, 2026-09-14 (75037697): "This still doesn't make sense how to
permanently delete someone" -- from the Delete family dialog, which said the
accounts survive and sent the office to People > Everyone to remove each one.
The dialog after the delete now offers to do it, and this is what it calls.

Students go first so a guardian's dependents are gone (or archived) before the
guardian is judged; each person's outcome is reported on its own because
"deleted" and "kept on file as withdrawn" are different answers.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_person_service as people


ORG = 'org-1'
USERS = {
    's1': {'id': 's1', 'first_name': 'Ryder', 'last_name': 'Swenson', 'role': 'student',
           'org_role': None, 'org_roles': None, 'organization_id': ORG},
    'p1': {'id': 'p1', 'first_name': 'Erin', 'last_name': 'Swenson', 'role': 'org_managed',
           'org_role': 'parent', 'org_roles': None, 'organization_id': ORG},
}


@pytest.mark.unit
class TestRemovePeople:
    def _run(self, ids, remove_person):
        with patch('services.sis_person_service._user', side_effect=lambda org, uid: USERS.get(uid)), \
             patch('services.sis_person_service.remove_person', remove_person):
            return people.remove_people(ORG, ids, actor_id='admin-1')

    def test_students_are_handled_before_guardians_whatever_order_was_sent(self):
        calls = []

        def remove_person(org, uid, actor_id, mode):
            calls.append((uid, mode))
            return {'deleted': True, 'name': 'x'}

        result = self._run(['p1', 's1'], remove_person)
        assert [c[0] for c in calls] == ['s1', 'p1']
        assert [(r['name'], r['outcome']) for r in result['removed']] == [
            ('Ryder Swenson', 'deleted'), ('Erin Swenson', 'deleted')]

    def test_a_person_with_records_is_archived_instead_and_says_so(self):
        def remove_person(org, uid, actor_id, mode):
            if mode == 'delete':
                return {'error': 'has school records attached (attendance)',
                        'blocking': {'attendance': 3}}
            return {'archived': True, 'name': 'x', 'seats_released': 1}

        result = self._run(['s1'], remove_person)
        assert result['removed'][0]['outcome'] == 'archived'

    def test_the_fallback_archive_message_rides_along(self):
        def remove_person(org, uid, actor_id, mode):
            return {'archived': True, 'name': 'x', 'delete_blocked_by': 'group_members',
                    'message': 'Ryder could not be deleted outright because ...'}

        result = self._run(['s1'], remove_person)
        assert result['removed'][0]['outcome'] == 'archived'
        assert 'could not be deleted' in result['removed'][0]['detail']

    def test_an_error_on_one_person_does_not_stop_the_rest(self):
        def remove_person(org, uid, actor_id, mode):
            if uid == 's1':
                raise RuntimeError('boom')
            return {'deleted': True, 'name': 'x'}

        result = self._run(['s1', 'p1'], remove_person)
        assert [(r['id'], r['outcome']) for r in result['removed']] == [
            ('s1', 'error'), ('p1', 'deleted')]

    def test_someone_not_in_the_org_is_skipped_silently(self):
        remove_person = Mock(return_value={'deleted': True, 'name': 'x'})
        result = self._run(['nobody', 's1'], remove_person)
        assert [r['id'] for r in result['removed']] == ['s1']
        remove_person.assert_called_once()
