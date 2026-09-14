"""
A student who has left the school is off the contact sheets.

iCreate, 2026-09-14 (28937c94): "why are we keeping families and their numbers
if they aren't part of the school anymore? Then their contact information is in
reports, etc. It's confusing." The records stay -- billing and history need
them -- but the emergency, medication and allergy sheets are for the people in
the building, and they read past withdrawn and graduated students now.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_reports_service as reports


ORG = 'org-1'


def _student(sid, status, household='hh-1'):
    return {'student_id': sid, 'name': sid.title(), 'is_student': True, 'age': 9,
            'household_id': household, 'household_name': 'Fam', 'preferred_name': '',
            'enrollment_status': status}


@pytest.mark.unit
class TestEmergencyContactsSheet:
    def _run(self, roster):
        repo = Mock()
        repo.for_students.return_value = {}
        with patch('services.sis_service.get_roster', return_value=roster), \
             patch('repositories.emergency_contact_repository.EmergencyContactRepository',
                   return_value=repo), \
             patch.object(reports, '_admin', return_value=Mock()):
            return reports.emergency_contacts_report(ORG)

    def test_withdrawn_and_graduated_students_are_left_off(self):
        report = self._run([
            _student('ada', 'enrolled'),
            _student('ben', 'withdrawn'),
            _student('cal', 'graduated'),
            _student('dee', 'unassigned'),
        ])
        assert [r['student'] for r in report['rows']] == ['Ada', 'Dee']

    def test_the_guardians_of_a_family_that_left_are_not_listed_anywhere(self):
        """The household's adults come through the students; no student, no row."""
        report = self._run([
            _student('ben', 'withdrawn'),
            {'student_id': 'p1', 'name': 'Erin', 'is_student': False,
             'household_id': 'hh-1', 'household_relationship': 'guardian',
             'phone_number': '555-0100', 'enrollment_status': None},
        ])
        assert report['rows'] == []


@pytest.mark.unit
class TestRegistrationBackedSheets:
    """medications / allergies / registration answers all read _reg_context."""

    def _context(self, regs, gone):
        from routes.sis import reports as routes
        enrollments = {sid: {'status': 'withdrawn'} for sid in gone}
        with patch.object(routes, '_latest_registrations', return_value=regs), \
             patch.object(routes, '_users_by_id', return_value={}), \
             patch.object(routes, '_household_by_user', return_value={}), \
             patch('services.sis_service._enrollments_by_student', return_value=enrollments):
            out, _users, _households = routes._reg_context(ORG)
        return out

    def test_a_withdrawn_child_is_dropped_from_the_family_s_registration(self):
        regs = [{'parent_user_id': 'p1', 'kids': [{'user_id': 'k1'}, {'user_id': 'k2'}]}]
        out = self._context(regs, gone={'k2'})
        assert [k['user_id'] for k in out[0]['kids']] == ['k1']

    def test_a_family_whose_children_have_all_left_is_not_in_the_sheet(self):
        regs = [{'parent_user_id': 'p1', 'kids': [{'user_id': 'k1'}]},
                {'parent_user_id': 'p2', 'kids': [{'user_id': 'k9'}]}]
        out = self._context(regs, gone={'k1'})
        assert [r['parent_user_id'] for r in out] == ['p2']

    def test_a_registration_with_no_children_at_all_is_left_as_it_was(self):
        regs = [{'parent_user_id': 'p1', 'kids': []}]
        assert self._context(regs, gone=set()) == regs
