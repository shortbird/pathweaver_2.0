"""
Tests for the teacher-onboarding wiring added on top of the SIS staff flow:

- create_org_teacher can auto-assign an onboarding checklist at add-time, and
  detects an existing placeholder teacher of the same name so an admin doesn't
  create a duplicate account and strand the placeholder's classes.
- find_placeholder_match only matches placeholder (never real) staff rows.
- onboarding recipient lists exclude placeholder accounts that can't log in.
"""

from unittest.mock import Mock, patch

import pytest


ORG = 'org-1'
PH_EMAIL = 'jane@icreate-staff.placeholder.optioeducation.com'


def _admin_with(responses):
    """Admin client stub: one shared table mock; each .execute() pops the next
    scripted response (mirrors test_sis_staff_link)."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'update', 'delete', 'insert', 'in_', 'order'):
        getattr(table, chained).return_value = table
    table.execute.side_effect = [Mock(data=d) for d in responses] + [Mock(data=[])] * 10
    return client, table


def _create_client(responses):
    """Admin stub for create_org_teacher: adds an auth.admin.create_user that
    returns a fixed new user id."""
    client, table = _admin_with(responses)
    client.auth.admin.create_user.return_value = Mock(user=Mock(id='new-1'))
    return client, table


@pytest.mark.unit
class TestCreateTeacherOnboarding:
    def test_assigns_onboarding_template_when_provided(self):
        from services import sis_service
        client, table = _create_client([[], []])  # dup-email check, profile insert
        with patch('services.sis_service.get_supabase_admin_client', return_value=client), \
             patch('services.sis_service.find_placeholder_match', return_value=None), \
             patch('services.sis_service.send_staff_invite', return_value=True), \
             patch('services.sis_onboarding_service.assign',
                   return_value={'assignment': {'id': 'a1'}}) as assign:
            result = sis_service.create_org_teacher(
                ORG, {'first_name': 'Jane', 'last_name': 'Doe', 'email': 'jane@real.com',
                      'onboarding_template_id': 'tmpl-1'},
                actor_id='admin-1')
        assert result['teacher']['id'] == 'new-1'
        assert result['onboarding_assigned'] is True
        assign.assert_called_once_with(ORG, 'tmpl-1', 'new-1', assigned_by='admin-1')

    def test_no_template_skips_onboarding(self):
        from services import sis_service
        client, table = _create_client([[], []])
        with patch('services.sis_service.get_supabase_admin_client', return_value=client), \
             patch('services.sis_service.find_placeholder_match', return_value=None), \
             patch('services.sis_service.send_staff_invite', return_value=True), \
             patch('services.sis_onboarding_service.assign') as assign:
            result = sis_service.create_org_teacher(
                ORG, {'first_name': 'Jane', 'last_name': 'Doe', 'email': 'jane@real.com'},
                actor_id='admin-1')
        assert result['onboarding_assigned'] is False
        assign.assert_not_called()

    def test_onboarding_assign_failure_does_not_fail_creation(self):
        from services import sis_service
        client, table = _create_client([[], []])
        with patch('services.sis_service.get_supabase_admin_client', return_value=client), \
             patch('services.sis_service.find_placeholder_match', return_value=None), \
             patch('services.sis_service.send_staff_invite', return_value=True), \
             patch('services.sis_onboarding_service.assign',
                   return_value={'error': 'Template not found'}):
            result = sis_service.create_org_teacher(
                ORG, {'first_name': 'Jane', 'last_name': 'Doe', 'email': 'jane@real.com',
                      'onboarding_template_id': 'bad'},
                actor_id='admin-1')
        assert result['teacher']['id'] == 'new-1'   # account still created
        assert result['onboarding_assigned'] is False


@pytest.mark.unit
class TestCreateTeacherPlaceholderGuard:
    def test_returns_placeholder_match_without_creating(self):
        from services import sis_service
        match = {'id': 'ph-1', 'name': 'Jane Doe', 'class_count': 5}
        client, table = _create_client([[], []])
        with patch('services.sis_service.get_supabase_admin_client', return_value=client), \
             patch('services.sis_service.find_placeholder_match', return_value=match), \
             patch('services.sis_service.send_staff_invite') as invite:
            result = sis_service.create_org_teacher(
                ORG, {'first_name': 'Jane', 'last_name': 'Doe', 'email': 'jane@real.com'},
                actor_id='admin-1')
        assert result == {'placeholder_match': match}
        client.auth.admin.create_user.assert_not_called()  # no duplicate account
        invite.assert_not_called()

    def test_force_new_bypasses_placeholder_check(self):
        from services import sis_service
        client, table = _create_client([[], []])
        with patch('services.sis_service.get_supabase_admin_client', return_value=client), \
             patch('services.sis_service.find_placeholder_match') as finder, \
             patch('services.sis_service.send_staff_invite', return_value=True):
            result = sis_service.create_org_teacher(
                ORG, {'first_name': 'Jane', 'last_name': 'Doe', 'email': 'jane@real.com',
                      'force_new': True},
                actor_id='admin-1')
        assert result['teacher']['id'] == 'new-1'
        finder.assert_not_called()


@pytest.mark.unit
class TestFindPlaceholderMatch:
    def _rows_client(self, rows):
        client, table = _admin_with([rows])
        return client

    def test_matches_placeholder_by_name(self):
        from services import sis_service
        rows = [{'id': 'ph-1', 'first_name': 'Jane', 'last_name': 'Doe',
                 'display_name': 'Jane Doe', 'email': PH_EMAIL,
                 'org_role': 'advisor', 'org_roles': ['advisor']}]
        with patch('services.sis_service.get_supabase_admin_client',
                   return_value=self._rows_client(rows)), \
             patch('services.sis_service.advisor_class_ids', return_value=['c1', 'c2']):
            match = sis_service.find_placeholder_match(ORG, 'jane', 'DOE')
        assert match == {'id': 'ph-1', 'name': 'Jane Doe', 'class_count': 2}

    def test_ignores_real_email_same_name(self):
        from services import sis_service
        rows = [{'id': 'u-1', 'first_name': 'Jane', 'last_name': 'Doe',
                 'display_name': 'Jane Doe', 'email': 'jane@gmail.com',
                 'org_role': 'advisor', 'org_roles': ['advisor']}]
        with patch('services.sis_service.get_supabase_admin_client',
                   return_value=self._rows_client(rows)):
            assert sis_service.find_placeholder_match(ORG, 'Jane', 'Doe') is None

    def test_no_match_when_name_differs(self):
        from services import sis_service
        rows = [{'id': 'ph-1', 'first_name': 'Liz', 'last_name': 'Smith',
                 'display_name': 'Liz Smith', 'email': PH_EMAIL,
                 'org_role': 'advisor', 'org_roles': ['advisor']}]
        with patch('services.sis_service.get_supabase_admin_client',
                   return_value=self._rows_client(rows)):
            assert sis_service.find_placeholder_match(ORG, 'Jane', 'Doe') is None


@pytest.mark.unit
class TestOnboardingRecipientsExcludePlaceholders:
    def test_placeholder_staff_excluded(self):
        from services import sis_onboarding_service as onboarding
        rows = [
            {'id': 'real-1', 'first_name': 'Amy', 'last_name': 'Real',
             'display_name': 'Amy Real', 'email': 'amy@real.com',
             'org_role': 'advisor', 'role': 'org_managed'},
            {'id': 'ph-1', 'first_name': 'Jane', 'last_name': 'Doe',
             'display_name': 'Jane Doe', 'email': PH_EMAIL,
             'org_role': 'advisor', 'role': 'org_managed'},
        ]
        client, _ = _admin_with([rows])
        with patch('services.sis_onboarding_service.get_supabase_admin_client',
                   return_value=client):
            people = onboarding.list_recipients(ORG, 'staff')
        ids = [p['id'] for p in people]
        assert ids == ['real-1']  # placeholder omitted (can't log in to complete it)
