"""One roster for one People page.

The SIS People page was three tabs (Everyone, Staff, Families), each reading
its own list. A teacher's invite state lived on Staff, a family's payment
answer on Families, and the one table the office actually scanned had
neither. get_roster now carries both, computed by the same helpers the staff
and family endpoints use, so the one table can filter on everything the
three tabs could and never disagrees with them.
"""

from unittest.mock import patch

import pytest

from services import sis_service as svc

ORG = 'org-1'


def _user(uid, first, last, *, role='org_managed', org_roles=None, email=None,
          last_active=None, dob=None):
    return {'id': uid, 'first_name': first, 'last_name': last, 'display_name': None,
            'role': role, 'org_role': (org_roles or [None])[0], 'org_roles': org_roles or [],
            'email': email, 'username': None, 'phone_number': None, 'total_xp': 0,
            'last_active': last_active, 'created_at': '2026-09-01T00:00:00+00:00',
            'date_of_birth': dob, 'preferred_name': None, 'gender': None,
            'allergies': None, 'medications': None, 'sis_tuition_plan': None,
            'avatar_url': None}


USERS = [
    _user('molly', 'Molly', 'Christensen', org_roles=['org_admin', 'parent'],
          email='molly@example.com', last_active='2026-09-15T00:00:00+00:00'),
    _user('julia', 'Julia', 'Teacher', org_roles=['advisor'],
          email='julia@example.com', last_active=None),
    _user('julia-ph', 'Julia', 'Teacher', org_roles=['advisor'],
          email='julia.teacher@placeholder.optio.invalid'),
    _user('kid-a', 'Ada', 'Ant', org_roles=['student'], dob='2016-01-01'),
    _user('kid-b', 'Bo', 'Bee', org_roles=['student'], dob='2014-01-01'),
    _user('mom-b', 'Bea', 'Bee', org_roles=['parent'], email='bea@example.com'),
]

HOUSEHOLDS = {
    'kid-a': {'household_id': 'h-ant', 'household_name': 'Ant', 'relationship': 'student',
              'is_primary_guardian': False, 'registration_hold': False,
              'registration_hold_reason': None},
    'kid-b': {'household_id': 'h-bee', 'household_name': 'Bee', 'relationship': 'student',
              'is_primary_guardian': False, 'registration_hold': True,
              'registration_hold_reason': 'Unpaid fee'},
    'mom-b': {'household_id': 'h-bee', 'household_name': 'Bee', 'relationship': 'guardian',
              'is_primary_guardian': True, 'registration_hold': True,
              'registration_hold_reason': 'Unpaid fee'},
}

ENROLLMENTS = {
    'kid-a': {'status': 'active', 'grade_level': '3'},
    'kid-b': {'status': 'withdrawn', 'grade_level': '5'},
}

PROFILES = {'h-bee': {'methods': ['Utah Fits All'], 'ufa_private': True, 'plan': 'monthly'}}


@pytest.fixture
def roster():
    with patch.object(svc, '_org_users', return_value=USERS), \
         patch.object(svc, '_enrollments_by_student', return_value=ENROLLMENTS), \
         patch.object(svc, '_household_by_user', return_value=HOUSEHOLDS), \
         patch.object(svc, 'is_placeholder_staff_email',
                      side_effect=lambda e: bool(e) and e.endswith('placeholder.optio.invalid')), \
         patch.object(svc, '_annotate_class_counts',
                      side_effect=lambda org, staff: [s.__setitem__('class_count', 2 if s['id'] == 'julia-ph' else 0) for s in staff]), \
         patch.object(svc, '_archived_staff_ids', return_value={'molly'}), \
         patch('services.sis_payment_profile.profiles_for_org', return_value=PROFILES), \
         patch.object(svc, 'sign_in_place'):
        rows = svc.get_roster(ORG)
    return {r['student_id']: r for r in rows}


@pytest.mark.unit
class TestStaffFactsOnTheRoster:
    def test_a_placeholder_and_an_invited_account_know_about_each_other(self, roster):
        assert roster['julia-ph']['is_placeholder'] is True
        assert roster['julia']['is_placeholder'] is False
        assert roster['julia']['login_pending'] is True
        assert roster['julia-ph']['duplicate_of']['id'] == 'julia'
        assert roster['julia']['duplicate_of']['id'] == 'julia-ph'
        assert roster['julia-ph']['class_count'] == 2

    def test_a_signed_in_admin_is_not_pending(self, roster):
        assert roster['molly']['login_pending'] is False
        assert roster['molly']['archived'] is True

    def test_nobody_else_gets_staff_fields(self, roster):
        for uid in ('kid-a', 'kid-b', 'mom-b'):
            assert 'is_placeholder' not in roster[uid]
            assert 'archived' not in roster[uid]

    def test_the_shared_helpers_id_alias_does_not_leak(self, roster):
        assert 'id' not in roster['julia']


@pytest.mark.unit
class TestFamilyFactsOnTheRoster:
    def test_how_the_family_pays_lands_on_every_member(self, roster):
        for uid in ('kid-b', 'mom-b'):
            assert roster[uid]['stated_payment_methods'] == ['Utah Fits All']
            assert roster[uid]['payment_plan'] == 'monthly'
        assert roster['kid-a']['stated_payment_methods'] == []

    def test_a_family_whose_students_all_left_is_former_for_its_guardians_too(self, roster):
        assert roster['kid-b']['household_former'] is True
        assert roster['mom-b']['household_former'] is True
        assert roster['kid-a']['household_former'] is False

    def test_a_registration_hold_is_on_the_row(self, roster):
        assert roster['mom-b']['registration_hold'] is True
        assert roster['mom-b']['registration_hold_reason'] == 'Unpaid fee'
        assert roster['kid-a']['registration_hold'] is False

    def test_someone_in_no_family_has_no_family_fields(self, roster):
        assert 'household_former' not in roster['julia']
        assert roster['julia']['household_id'] is None
