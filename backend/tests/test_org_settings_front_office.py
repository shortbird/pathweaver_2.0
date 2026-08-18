"""
The org settings a campus coordinator runs, and the prices they do not.

Everything the SIS console configures — rooms, school-day blocks, calendar
categories, the registration funnel — lives in organizations.feature_flags,
behind GET/PUT /api/admin/organizations/<id>. That endpoint was org_admin-only,
so for a coordinator (deliberately NOT an org_admin) the Classes editor lost its
classroom dropdown, and Registration and Settings rendered "Organization not
found". They are ADMIN_ROLES now, with the money taken out per field.

The negative tests are the point: a coordinator holding the settings blob must
not be able to read a price, change one, or DELETE one by saving a form that
never received it.
"""

from unittest.mock import Mock, patch

import pytest

from utils.org_finance_flags import (
    changed_finance_fields, guarded_flags_for_front_office, merge_without_finance,
    redact_finance_flags,
)


STORED = {
    'sis_settings': {
        'rooms': [{'name': 'Kitchen'}],
        'time_blocks': [{'start': '09:30', 'end': '10:30'}],
        'optio_course_tuition_cents': 25000,
        'supply_budget_per_student': 40,
    },
    'registration': {
        'enabled': True,
        'questions': [{'key': 'media_consent'}],
        'fee_mode': 'lesser',
        'registration_fee_cents': 12500,
        'per_student_fee_cents': 5000,
    },
    'sis_enabled': True,
}


@pytest.mark.unit
class TestWhatAcoordinatorSees:

    def test_the_prices_are_gone(self):
        out = redact_finance_flags(STORED)
        assert 'optio_course_tuition_cents' not in out['sis_settings']
        assert 'supply_budget_per_student' not in out['sis_settings']
        assert 'registration_fee_cents' not in out['registration']
        assert 'per_student_fee_cents' not in out['registration']
        assert 'fee_mode' not in out['registration']

    def test_everything_they_run_is_still_there(self):
        out = redact_finance_flags(STORED)
        assert out['sis_settings']['rooms'] == [{'name': 'Kitchen'}]
        assert out['sis_settings']['time_blocks']
        assert out['registration']['questions'] == [{'key': 'media_consent'}]
        assert out['sis_enabled'] is True

    def test_the_stored_blob_is_not_mutated(self):
        redact_finance_flags(STORED)
        assert STORED['sis_settings']['optio_course_tuition_cents'] == 25000


@pytest.mark.unit
class TestWhatTheirSaveCanDo:

    def test_a_round_trip_of_the_redacted_blob_keeps_the_prices(self):
        """The hazard redaction creates: the settings UI PUTs back what it was
        given, and what it was given had no prices in it."""
        merged = merge_without_finance(STORED, redact_finance_flags(STORED))
        assert merged['sis_settings']['optio_course_tuition_cents'] == 25000
        assert merged['registration']['registration_fee_cents'] == 12500

    def test_their_own_edits_still_land(self):
        incoming = redact_finance_flags(STORED)
        incoming['sis_settings']['rooms'] = [{'name': 'Art Studio'}]
        incoming['registration']['questions'] = []
        merged = merge_without_finance(STORED, incoming)
        assert merged['sis_settings']['rooms'] == [{'name': 'Art Studio'}]
        assert merged['registration']['questions'] == []
        assert merged['sis_settings']['optio_course_tuition_cents'] == 25000

    def test_clearing_a_list_still_clears_it(self):
        """The cards write null for "no rows left"; that has to survive a merge."""
        merged = merge_without_finance(STORED, {'sis_settings': {'rooms': None}})
        assert merged['sis_settings']['rooms'] is None

    def test_changing_a_price_is_refused_by_name(self):
        incoming = {'sis_settings': {'optio_course_tuition_cents': 0}}
        assert changed_finance_fields(STORED, incoming) == ['sis_settings.optio_course_tuition_cents']
        flags, blocked = guarded_flags_for_front_office(STORED, incoming)
        assert flags is None and blocked

    def test_resubmitting_the_same_price_is_not_a_change(self):
        incoming = {'sis_settings': {'optio_course_tuition_cents': 25000}}
        assert changed_finance_fields(STORED, incoming) == []

    def test_the_legacy_mirror_is_guarded_too(self):
        """icreate_registration mirrors registration; guarding one and not the
        other leaves the mirror as the way around."""
        incoming = {'icreate_registration': {'registration_fee_cents': 1}}
        assert changed_finance_fields(STORED, incoming) == ['icreate_registration.registration_fee_cents']


def _caller_client(role_row):
    client = Mock()
    table = Mock()
    for chained in ('select', 'eq', 'limit', 'single', 'in_'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=role_row)
    client.table.return_value = table
    return client


COORDINATOR_ROW = {'id': 'kate', 'role': 'org_managed', 'org_role': 'campus_coordinator',
                   'org_roles': ['campus_coordinator'], 'is_org_admin': False,
                   'organization_id': 'org-1', 'email': 'kate@icreate.test'}


@pytest.mark.unit
class TestTheEndpointItself:
    """@require_org_front_office lets her in; the route redacts per field."""

    def test_she_can_read_the_org_without_the_prices(self, client, auth_headers, mock_verify_token):
        service = Mock()
        service.get_organization_dashboard_data.return_value = {
            'organization': {'id': 'org-1', 'feature_flags': redact_finance_flags(STORED)}}
        with patch('database.get_supabase_admin_client',
                   return_value=_caller_client(COORDINATOR_ROW)), \
             patch('services.sis_service.caller_sees_pay', return_value=False), \
             patch('routes.admin.organization_management.OrganizationService', return_value=service):
            resp = client.get('/api/admin/organizations/org-1', headers=auth_headers)
        assert resp.status_code == 200
        assert service.get_organization_dashboard_data.call_args.kwargs['include_finance'] is False
        sis = resp.get_json()['organization']['feature_flags']['sis_settings']
        assert sis['rooms'] == [{'name': 'Kitchen'}]
        assert 'optio_course_tuition_cents' not in sis

    def test_the_service_is_what_actually_strips_them(self):
        """The route decides WHO, the service does the stripping — so this is
        where the redaction itself is checked."""
        from services.organization_service import OrganizationService
        service = OrganizationService()
        repo = Mock()
        repo.find_by_id.return_value = {'id': 'org-1', 'quest_visibility_policy': 'all_optio',
                                        'feature_flags': STORED}
        repo.get_organization_users.return_value = []
        repo.get_organization_quests.return_value = []
        repo.get_organization_courses.return_value = []
        service.org_repo = repo

        with_money = service.get_organization_dashboard_data('org-1')
        without = service.get_organization_dashboard_data('org-1', include_finance=False)
        assert with_money['organization']['feature_flags']['sis_settings']['optio_course_tuition_cents'] == 25000
        assert 'optio_course_tuition_cents' not in without['organization']['feature_flags']['sis_settings']
        assert without['organization']['feature_flags']['sis_settings']['rooms'] == [{'name': 'Kitchen'}]

    def test_a_student_still_cannot(self, client, auth_headers, mock_verify_token):
        student = {'id': 's', 'role': 'student', 'org_role': None, 'org_roles': None,
                   'is_org_admin': False, 'organization_id': 'org-1', 'email': 's@x.y'}
        with patch('database.get_supabase_admin_client', return_value=_caller_client(student)):
            resp = client.get('/api/admin/organizations/org-1', headers=auth_headers)
        assert resp.status_code == 403

    def test_her_save_merges_and_keeps_the_prices(self, client, auth_headers, mock_verify_token):
        repo = Mock()
        repo.find_by_id.return_value = {'id': 'org-1', 'feature_flags': STORED}
        repo.update_organization.side_effect = lambda org_id, data: {'id': org_id, **data}
        redacted = redact_finance_flags(STORED)
        redacted['sis_settings']['rooms'] = [{'name': 'Art Studio'}]
        with patch('database.get_supabase_admin_client',
                   return_value=_caller_client(COORDINATOR_ROW)), \
             patch('services.sis_service.caller_sees_pay', return_value=False), \
             patch('repositories.organization_repository.OrganizationRepository', return_value=repo):
            resp = client.put('/api/admin/organizations/org-1', headers=auth_headers,
                              json={'feature_flags': redacted})
        assert resp.status_code == 200
        written = repo.update_organization.call_args[0][1]['feature_flags']
        assert written['sis_settings']['rooms'] == [{'name': 'Art Studio'}]
        assert written['sis_settings']['optio_course_tuition_cents'] == 25000
        assert written['registration']['registration_fee_cents'] == 12500

    def test_she_cannot_rename_the_organization(self, client, auth_headers, mock_verify_token):
        repo = Mock()
        repo.find_by_id.return_value = {'id': 'org-1', 'feature_flags': STORED}
        with patch('database.get_supabase_admin_client',
                   return_value=_caller_client(COORDINATOR_ROW)), \
             patch('services.sis_service.caller_sees_pay', return_value=False), \
             patch('repositories.organization_repository.OrganizationRepository', return_value=repo):
            resp = client.put('/api/admin/organizations/org-1', headers=auth_headers,
                              json={'name': 'Kate Academy'})
        assert resp.status_code == 400  # nothing she may write was submitted
        repo.update_organization.assert_not_called()

    def test_she_cannot_change_a_price(self, client, auth_headers, mock_verify_token):
        repo = Mock()
        repo.find_by_id.return_value = {'id': 'org-1', 'feature_flags': STORED}
        with patch('database.get_supabase_admin_client',
                   return_value=_caller_client(COORDINATOR_ROW)), \
             patch('services.sis_service.caller_sees_pay', return_value=False), \
             patch('repositories.organization_repository.OrganizationRepository', return_value=repo):
            resp = client.put('/api/admin/organizations/org-1', headers=auth_headers,
                              json={'feature_flags': {'sis_settings': {'optio_course_tuition_cents': 0}}})
        assert resp.status_code == 403
        repo.update_organization.assert_not_called()

    def test_she_cannot_set_the_stripe_key(self, client, auth_headers, mock_verify_token):
        repo = Mock()
        repo.find_by_id.return_value = {'id': 'org-1', 'feature_flags': STORED}
        with patch('database.get_supabase_admin_client',
                   return_value=_caller_client(COORDINATOR_ROW)), \
             patch('services.sis_service.caller_sees_pay', return_value=False), \
             patch('repositories.organization_repository.OrganizationRepository', return_value=repo):
            resp = client.put('/api/admin/organizations/org-1', headers=auth_headers, json={
                'feature_flags': {'registration': {
                    'stripe_secret_key': 'sk_live_' + 'a' * 30}}})
        assert resp.status_code == 403
        repo.update_organization.assert_not_called()


@pytest.mark.unit
class TestTheStandingRegistrationLink:
    """The Registration page provisions the family link. Front office work —
    but a link IS a standing role grant, so staff roles stay with an admin."""

    def test_she_cannot_mint_an_org_admin_link(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_caller_client(COORDINATOR_ROW)), \
             patch('services.sis_service.caller_can_grant_privileged_role', return_value=False):
            resp = client.post('/api/admin/organizations/org-1/invitations/link',
                               headers=auth_headers, json={'role': 'org_admin'})
        assert resp.status_code == 403

    def test_she_cannot_mint_an_advisor_link(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_caller_client(COORDINATOR_ROW)), \
             patch('services.sis_service.caller_can_grant_privileged_role', return_value=False):
            resp = client.post('/api/admin/organizations/org-1/invitations/link',
                               headers=auth_headers, json={'role': 'advisor'})
        assert resp.status_code == 403

    def test_a_parent_link_is_hers_to_make(self, client, auth_headers, mock_verify_token):
        """Not asserting the 201 body — only that the role gate lets her past
        it, which is where she used to be stopped."""
        with patch('database.get_supabase_admin_client',
                   return_value=_caller_client(COORDINATOR_ROW)), \
             patch('services.sis_service.caller_can_grant_privileged_role', return_value=False):
            resp = client.post('/api/admin/organizations/org-1/invitations/link',
                               headers=auth_headers, json={'role': 'parent'})
        assert resp.status_code != 403


@pytest.mark.unit
class TestAddingPeople:
    """Families are the front office's to add; staff accounts are not."""

    def test_she_can_create_a_student_account(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_caller_client(COORDINATOR_ROW)), \
             patch('services.sis_service.caller_may_grant', return_value=True):
            resp = client.post('/api/admin/organizations/org-1/users/create-username',
                               headers=auth_headers,
                               json={'username': 'kid.one', 'first_name': 'Kid',
                                     'last_name': 'One', 'org_role': 'student'})
        assert resp.status_code != 403

    def test_she_cannot_create_a_teacher_account(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_caller_client(COORDINATOR_ROW)), \
             patch('services.sis_service.caller_can_grant_privileged_role', return_value=False):
            resp = client.post('/api/admin/organizations/org-1/users/create-username',
                               headers=auth_headers,
                               json={'username': 't.one', 'first_name': 'T',
                                     'last_name': 'One', 'org_role': 'advisor'})
        assert resp.status_code == 403

    def test_she_cannot_invite_an_org_admin(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_caller_client(COORDINATOR_ROW)), \
             patch('services.sis_service.caller_can_grant_privileged_role', return_value=False):
            resp = client.post('/api/admin/organizations/org-1/invitations', headers=auth_headers,
                               json={'email': 'new@admin.test', 'role': 'org_admin'})
        assert resp.status_code == 403

    def test_the_guard_leaves_family_roles_alone(self):
        """No DB lookup at all for a family role — the check is only reached
        when a staff role is asked for."""
        from services.sis_service import caller_may_grant
        for role in ('student', 'parent', 'observer'):
            assert caller_may_grant('nobody-at-all', role) is True
