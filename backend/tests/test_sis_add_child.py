"""The office's own door onto "add a child to this family".

A family who left a child off their registration had no path back in: the
funnel refuses a completed registration, staff could only connect an account
that already existed, and nothing anywhere could create one (iCreate,
2026-09-18 — "Is there a way to add a person manually on our end?").

These pin what that door does and, as much, what it refuses: a child is never
created outside the family that asked for them, never under a household
belonging to another school, and never silently beside a child who is already
there under a different spelling.
"""

from datetime import datetime, timedelta
from unittest.mock import ANY, Mock, patch

import pytest

from services import family_student_service


ORG = 'org-1'
HOUSEHOLD = 'hh-1'


def _dob(years_ago):
    return (datetime.utcnow() - timedelta(days=int(years_ago * 365.25))).strftime('%Y-%m-%d')


def _household(**over):
    return {'id': HOUSEHOLD, 'organization_id': ORG, 'name': 'Watson Family',
            'primary_contact_user_id': 'mum-1', **over}


def _add(data, *, household=None, members=None, parent=None, duplicates=(),
         created=None):
    """Run add_child_to_household with every collaborator stubbed, and hand back
    (result, the create_child mock, the place_child_in_family mock)."""
    household_repo = Mock()
    household_repo.find_by_id.return_value = _household() if household is None else household
    household_repo.members_for_households.return_value = (
        [{'user_id': 'mum-1', 'relationship': 'guardian'},
         {'user_id': 'kid-0', 'relationship': 'student'}] if members is None else members)

    user_repo = Mock()
    user_repo.find_by_ids.return_value = (
        {'mum-1': {'id': 'mum-1', 'first_name': 'Shelby', 'last_name': 'Watson',
                   'organization_id': ORG}} if parent is None else parent)

    with patch('repositories.household_repository.HouseholdRepository',
               return_value=household_repo), \
         patch('repositories.user_repository.UserRepository', return_value=user_repo), \
         patch('services.sis_service.find_household_duplicates',
               return_value=list(duplicates)), \
         patch('services.family_student_service.create_child') as create, \
         patch('services.sis_person_service.place_child_in_family') as place, \
         patch('services.sis_person_service.audit_removal'), \
         patch.object(family_student_service, '_admin', return_value=Mock()):
        create.return_value = created or {'kind': 'dependent', 'child': {'id': 'kid-1'},
                                          'invite_sent': False}
        result = family_student_service.add_child_to_household(
            ORG, HOUSEHOLD, 'admin-1', data)
    return result, create, place


@pytest.mark.unit
class TestAddChildToHousehold:
    def test_creates_the_child_and_puts_them_in_the_family(self):
        result, create, place = _add({
            'first_name': 'Reece', 'last_name': 'Watson', 'date_of_birth': _dob(9)})
        assert result['kind'] == 'dependent'
        assert result['household_id'] == HOUSEHOLD
        # Created under the family's primary contact: a managed profile belongs
        # to a guardian, and which guardian is not arbitrary.
        assert create.call_args[0][0]['id'] == 'mum-1'
        place.assert_called_once_with(ORG, 'kid-1', 'mum-1', household_id=HOUSEHOLD)

    def test_a_household_from_another_school_is_not_found(self):
        result, create, _ = _add(
            {'first_name': 'Reece', 'last_name': 'Watson', 'date_of_birth': _dob(9)},
            household=_household(organization_id='another-org'))
        assert result['status'] == 404
        create.assert_not_called()

    def test_a_family_with_no_guardian_is_refused_before_anything_is_created(self):
        result, create, _ = _add(
            {'first_name': 'Reece', 'last_name': 'Watson', 'date_of_birth': _dob(9)},
            members=[{'user_id': 'kid-0', 'relationship': 'student'}])
        assert result['status'] == 400
        assert result['code'] == 'no_guardian'
        create.assert_not_called()

    def test_a_look_alike_asks_before_doubling_the_child_up(self):
        result, create, _ = _add(
            {'first_name': 'Reece', 'last_name': 'Watson', 'date_of_birth': _dob(9)},
            duplicates=[{'user_id': 'kid-0', 'name': 'Reece Watson'}])
        assert result['status'] == 409
        assert result['needs_confirmation'] is True
        assert 'Reece Watson' in result['error']
        create.assert_not_called()

    def test_confirming_the_duplicate_goes_through(self):
        result, create, _ = _add(
            {'first_name': 'Reece', 'last_name': 'Watson', 'date_of_birth': _dob(9),
             'confirm_duplicate': True},
            duplicates=[{'user_id': 'kid-0', 'name': 'Reece Watson'}])
        assert result.get('status') is None
        create.assert_called_once()

    def test_a_missing_birth_date_is_refused(self):
        result, create, _ = _add({'first_name': 'Reece', 'last_name': 'Watson'})
        assert result['status'] == 400
        create.assert_not_called()

    def test_a_missing_name_is_refused(self):
        result, create, _ = _add({'last_name': 'Watson', 'date_of_birth': _dob(9)})
        assert result['status'] == 400
        create.assert_not_called()

    def test_the_school_decides_the_org_not_the_guardians_own_row(self):
        """A guardian imported without an organization_id would otherwise mint a
        platform account inside a school's family."""
        _, create, _ = _add(
            {'first_name': 'Reece', 'last_name': 'Watson', 'date_of_birth': _dob(9)},
            parent={'mum-1': {'id': 'mum-1', 'organization_id': None}})
        assert create.call_args[0][0]['organization_id'] == ORG

    def test_a_refused_create_is_reported_not_swallowed(self):
        result, _, place = _add(
            {'first_name': 'Alex', 'last_name': 'Watson', 'date_of_birth': _dob(15)},
            created={'error': 'An email address is required for students 13 and older',
                     'code': 'email_required'})
        assert result['status'] == 400
        assert result['code'] == 'email_required'
        place.assert_not_called()


@pytest.mark.unit
class TestTheRoute:
    """POST /api/sis/households/<id>/children — the front office's tier, and
    nobody else's. A campus coordinator runs the families page, so the gate is
    ADMIN_ROLES rather than org_admin alone."""

    def _post(self, client, auth_headers, role='org_admin', result=None):
        admin = Mock()
        table = Mock()
        admin.table.return_value = table
        for chained in ('select', 'eq', 'limit', 'in_'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(
            data=[{'role': role, 'org_role': None, 'org_roles': None}])
        with patch('database.get_supabase_admin_client', return_value=admin), \
             patch('routes.sis.get_supabase_admin_client', return_value=admin), \
             patch('services.sis_service.resolve_org_id', return_value=ORG), \
             patch('services.family_student_service.add_child_to_household') as add:
            add.return_value = result if result is not None else {
                'kind': 'dependent', 'child': {'id': 'kid-1'},
                'invite_sent': False, 'household_id': HOUSEHOLD}
            resp = client.post(
                f'/api/sis/households/{HOUSEHOLD}/children',
                json={'organization_id': ORG, 'first_name': 'Reece',
                      'last_name': 'Watson', 'date_of_birth': _dob(9)},
                headers=auth_headers)
        return resp, add

    def test_an_admin_can_add_a_child(self, client, auth_headers, mock_verify_token):
        resp, add = self._post(client, auth_headers)
        assert resp.status_code == 201
        assert resp.get_json()['kind'] == 'dependent'
        assert add.call_args[0][:2] == (ORG, HOUSEHOLD)

    def test_a_campus_coordinator_can_too(self, client, auth_headers, mock_verify_token):
        resp, _ = self._post(client, auth_headers, role='campus_coordinator')
        assert resp.status_code == 201

    def test_a_teacher_cannot(self, client, auth_headers, mock_verify_token):
        resp, add = self._post(client, auth_headers, role='advisor')
        assert resp.status_code == 403
        add.assert_not_called()

    def test_a_parent_cannot(self, client, auth_headers, mock_verify_token):
        resp, add = self._post(client, auth_headers, role='parent')
        assert resp.status_code == 403
        add.assert_not_called()

    def test_a_refusal_keeps_its_status_and_its_reason(self, client, auth_headers, mock_verify_token):
        resp, _ = self._post(client, auth_headers, result={
            'needs_confirmation': True, 'duplicates': [{'user_id': 'kid-0', 'name': 'Reece Watson'}],
            'error': 'This family already includes Reece Watson', 'status': 409})
        assert resp.status_code == 409
        body = resp.get_json()
        assert body['success'] is False
        assert body['needs_confirmation'] is True
        assert 'status' not in body


@pytest.mark.unit
class TestCreateChild:
    """The age split both doors share."""

    def test_under_13_is_a_managed_profile(self):
        with patch('services.family_student_service.DependentRepository') as repo_cls, \
             patch.object(family_student_service, '_admin', return_value=Mock()):
            repo_cls.return_value.create_dependent.return_value = {'id': 'kid-1'}
            result = family_student_service.create_child(
                {'id': 'mum-1', 'organization_id': ORG}, 'Reece', 'Watson',
                datetime.utcnow().date() - timedelta(days=9 * 365))
        assert result == {'kind': 'dependent', 'child': {'id': 'kid-1'}, 'invite_sent': False}

    def test_13_plus_gets_their_own_account(self):
        with patch('services.family_student_service.create_teen_student') as create:
            create.return_value = {'student': {'id': 'teen-1', 'invite_sent': True}}
            result = family_student_service.create_child(
                {'id': 'mum-1', 'organization_id': ORG}, 'Alex', 'Watson',
                datetime.utcnow().date() - timedelta(days=15 * 365),
                email='alex@example.com')
        assert result['kind'] == 'student'
        assert result['invite_sent'] is True

    def test_13_plus_without_an_email_is_refused_not_quietly_made_managed(self):
        result = family_student_service.create_child(
            {'id': 'mum-1', 'organization_id': ORG}, 'Alex', 'Watson',
            datetime.utcnow().date() - timedelta(days=15 * 365))
        assert result['code'] == 'email_required'


@pytest.mark.unit
class TestPlaceChildInFamily:
    def _place(self, for_guardian=HOUSEHOLD, members=None, org=ORG, household_id=None):
        from services import sis_person_service
        repo = Mock()
        repo.for_guardian.return_value = for_guardian
        repo.members_for_households.return_value = (
            [{'user_id': 'mum-1', 'relationship': 'guardian'},
             {'user_id': 'dad-1', 'relationship': 'guardian'},
             {'user_id': 'kid-0', 'relationship': 'student'}] if members is None else members)
        with patch('repositories.household_repository.HouseholdRepository', return_value=repo), \
             patch('services.sis_service.attach_student_to_org') as attach, \
             patch('services.sis_person_service.join_household') as join, \
             patch.object(sis_person_service, '_admin', return_value=Mock()):
            result = sis_person_service.place_child_in_family(
                org, 'kid-1', 'mum-1', household_id=household_id)
        return result, attach, join, repo

    def test_joins_the_household_and_links_every_guardian(self):
        result, attach, join, _ = self._place()
        assert result == HOUSEHOLD
        assert attach.call_args.kwargs['guardian_ids'] == ['mum-1', 'dad-1']
        # Through the one attach path (sis_attach_service, M16), which passes
        # its client along.
        join.assert_called_once_with(HOUSEHOLD, students=['kid-1'], client=ANY)

    def test_a_named_household_is_not_looked_up(self):
        _, _, join, repo = self._place(household_id='hh-2')
        repo.for_guardian.assert_not_called()
        join.assert_called_once_with('hh-2', students=['kid-1'], client=ANY)

    def test_a_platform_family_has_nothing_to_join(self):
        """No organisation means no household and no org attach — not an error."""
        result, attach, join, _ = self._place(org=None)
        assert result is None
        attach.assert_not_called()
        join.assert_not_called()

    def test_a_family_with_no_household_still_gets_the_org_attach(self):
        result, attach, join, _ = self._place(for_guardian=None)
        assert result is None
        attach.assert_called_once()
        join.assert_not_called()
