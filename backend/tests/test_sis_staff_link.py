"""
Service tests for sis_service.link_staff_account — connecting a placeholder
staff row (synthetic *.placeholder.optioeducation.com email) to the teacher's
real email.

Two outcomes: a brand-new email claims the placeholder in place (same user id,
set-password invite), while an email that already has an Optio account absorbs
the placeholder's instructor references and gains the advisor role. Everything
else must refuse without mutating.
"""

from unittest.mock import Mock, patch

import pytest


PH_ID = 'ph-1'
ORG = 'org-1'
PH_EMAIL = 'liz@icreate-staff.placeholder.optioeducation.com'


def _placeholder_row(**over):
    row = {'id': PH_ID, 'email': PH_EMAIL, 'organization_id': ORG,
           'org_role': 'advisor', 'org_roles': ['advisor'],
           'bio': 'Art teacher', 'avatar_url': 'http://x/pic.jpg'}
    row.update(over)
    return row


def _admin_with(responses):
    """Admin client stub: all table chains share one mock; each .execute() pops
    the next scripted response (same pattern as test_sis_household_member_attach)."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'update', 'delete', 'insert'):
        getattr(table, chained).return_value = table
    table.execute.side_effect = [Mock(data=d) for d in responses] + [Mock(data=[])] * 10
    return client, table


def _link(responses, email='real@example.com'):
    from services import sis_service
    client, table = _admin_with(responses)
    with patch('services.sis_service.get_supabase_admin_client', return_value=client), \
         patch('services.class_group_sync_service.sync_class_group') as sync:
        result = sis_service.link_staff_account(ORG, PH_ID, email)
    return result, client, table, sync


@pytest.mark.unit
class TestLinkStaffAccountClaim:
    def test_new_email_claims_placeholder_in_place(self):
        result, client, table, _ = _link([
            [_placeholder_row()],  # placeholder lookup
            [],                    # no account with the real email
            [],                    # users email update
        ])
        assert result == {'linked': 'invited', 'staff_id': PH_ID, 'email_sent': True}
        client.auth.admin.update_user_by_id.assert_called_once_with(
            PH_ID, {'email': 'real@example.com'})
        client.auth.resend.assert_called_once_with(
            {'type': 'signup', 'email': 'real@example.com'})
        table.update.assert_called_once_with({'email': 'real@example.com'})

    def test_failed_invite_email_is_reported_not_fatal(self):
        client, table = _admin_with([[_placeholder_row()], [], []])
        client.auth.resend.side_effect = Exception('smtp down')
        from services import sis_service
        with patch('services.sis_service.get_supabase_admin_client', return_value=client):
            result = sis_service.link_staff_account(ORG, PH_ID, 'real@example.com')
        assert result['linked'] == 'invited'
        assert result['email_sent'] is False

    def test_failed_auth_email_swap_refuses(self):
        client, table = _admin_with([[_placeholder_row()], []])
        client.auth.admin.update_user_by_id.side_effect = Exception('email taken')
        from services import sis_service
        with patch('services.sis_service.get_supabase_admin_client', return_value=client):
            result = sis_service.link_staff_account(ORG, PH_ID, 'real@example.com')
        assert 'error' in result


@pytest.mark.unit
class TestLinkStaffAccountMerge:
    def test_parent_account_gains_advisor_and_classes(self):
        target = {'id': 'real-1', 'role': 'org_managed', 'org_role': 'parent',
                  'org_roles': ['parent'], 'organization_id': ORG,
                  'is_dependent': False, 'bio': None, 'avatar_url': None}
        result, client, table, sync = _link([
            [_placeholder_row()],
            [target],
            [],                   # target user update
            [{'id': 'class-1'}, {'id': 'class-2'}],  # org_classes repoint
            [],                   # class_advisors repoint
            [],                   # org_course_settings repoint
            [],                   # placeholder users delete
        ])
        assert result['linked'] == 'merged'
        assert result['staff_id'] == 'real-1'
        assert result['placeholder_removed'] is True
        # First update call is the role merge: advisor primary, parent kept,
        # and the placeholder's bio/photo copied onto the empty profile.
        role_update = table.update.call_args_list[0].args[0]
        assert role_update['org_roles'] == ['advisor', 'parent']
        assert role_update['org_role'] == 'advisor'
        assert role_update['role'] == 'org_managed'
        assert role_update['bio'] == 'Art teacher'
        assert role_update['avatar_url'] == 'http://x/pic.jpg'
        # Instructor references repointed onto the real account.
        repoints = [c.args[0] for c in table.update.call_args_list[1:4]]
        assert repoints == [{'primary_instructor_id': 'real-1'},
                            {'advisor_id': 'real-1'}, {'teacher_id': 'real-1'}]
        # Messaging groups re-synced for the repointed classes.
        assert [c.args[0] for c in sync.call_args_list] == ['class-1', 'class-2']
        client.auth.admin.delete_user.assert_called_once_with(PH_ID)

    def test_platform_parent_is_attached_to_org(self):
        target = {'id': 'real-2', 'role': 'parent', 'org_role': None,
                  'org_roles': None, 'organization_id': None,
                  'is_dependent': False, 'bio': 'Own bio', 'avatar_url': None}
        result, client, table, _ = _link([
            [_placeholder_row()], [target], [], [], [], [], [],
        ])
        assert result['linked'] == 'merged'
        role_update = table.update.call_args_list[0].args[0]
        assert role_update['organization_id'] == ORG
        assert role_update['org_roles'] == ['advisor', 'parent']
        assert 'bio' not in role_update  # target already has one


@pytest.mark.unit
class TestLinkStaffAccountRefusals:
    def test_refuses_student_account(self):
        target = {'id': 's-1', 'role': 'org_managed', 'org_role': 'student',
                  'org_roles': ['student'], 'organization_id': ORG,
                  'is_dependent': False}
        result, *_ = _link([[_placeholder_row()], [target]])
        assert 'student' in result['error']

    def test_refuses_other_org_account(self):
        target = {'id': 'o-1', 'role': 'org_managed', 'org_role': 'advisor',
                  'org_roles': ['advisor'], 'organization_id': 'org-2',
                  'is_dependent': False}
        result, *_ = _link([[_placeholder_row()], [target]])
        assert 'another organization' in result['error']

    def test_refuses_superadmin_and_dependents(self):
        sa = {'id': 'sa', 'role': 'superadmin', 'organization_id': None,
              'is_dependent': False}
        result, *_ = _link([[_placeholder_row()], [sa]])
        assert 'error' in result
        dep = {'id': 'dep', 'role': 'student', 'organization_id': None,
               'is_dependent': True}
        result, *_ = _link([[_placeholder_row()], [dep]])
        assert 'error' in result

    def test_refuses_non_placeholder_staff_row(self):
        result, *_ = _link([[_placeholder_row(email='liz@gmail.com')]])
        assert 'already has a real email' in result['error']

    def test_refuses_staff_outside_org(self):
        result, *_ = _link([[_placeholder_row(organization_id='org-2')]])
        assert result['error'] == 'Staff member not found'

    def test_refuses_placeholder_email_as_target(self):
        result, *_ = _link([], email='bob@x.placeholder.optioeducation.com')
        assert 'real email' in result['error']

    def test_refuses_missing_email(self):
        result, *_ = _link([], email='')
        assert 'error' in result
