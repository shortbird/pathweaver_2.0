"""
The SIS family record's "Add a parent": a second parent with no Optio account
gets one, joins the family, and receives a set-your-password email.

Until 2026-09-30 the office had no door for this (iCreate: "Andrew Larson was
trying to figure out how to add an Optio account for himself ... I wasn't sure
how to make that happen"), so the request came to Optio by email.
"""

from unittest.mock import MagicMock, patch

import pytest

from services import family_guardian_service as svc

ORG = 'org-1'
HH = 'hh-1'


def _admin(existing_users):
    admin = MagicMock()
    table = MagicMock()
    admin.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'maybe_single'):
        getattr(table, chained).return_value = table
    table.execute.return_value = MagicMock(data=existing_users)
    admin.auth.admin.create_user.return_value = MagicMock(user=MagicMock(id='new-parent'))
    return admin


def _run(existing_users, household=None, body=None):
    admin = _admin(existing_users)
    household = household if household is not None else {'id': HH, 'organization_id': ORG,
                                                          'name': 'Larson Family'}
    body = body if body is not None else {'first_name': 'Andrew', 'last_name': 'Larson',
                                          'email': 'Andrew@Example.com '}
    with patch.object(svc, '_admin', return_value=admin), \
         patch('repositories.household_repository.HouseholdRepository') as repo_cls, \
         patch('repositories.user_repository.UserRepository') as users_cls, \
         patch('services.sis_service._org_name', return_value='iCreate'), \
         patch('services.sis_attach_service.attach_guardian',
               return_value=[{'user_id': 'x'}]) as attach, \
         patch('services.sis_person_service.audit_removal') as audit, \
         patch('services.family_student_service._insert_profile_with_retry') as insert, \
         patch('utils.invite_tokens.mint_invite_token', return_value='tok'), \
         patch('services.email_service.email_service.send_guardian_account_invite_email',
               return_value=True) as send:
        repo_cls.return_value.find_by_id.return_value = household
        users_cls.return_value.find_by_email.return_value = existing_users[0] if existing_users else None
        result = svc.add_guardian_to_household(ORG, HH, 'staff-1', body)
    return result, admin, attach, audit, insert, send


@pytest.mark.unit
class TestAddGuardian:
    def test_a_new_parent_gets_an_account_a_family_and_an_invite(self):
        result, admin, attach, audit, insert, send = _run([])
        assert result['kind'] == 'invited'
        assert result['invite_sent'] is True
        created = admin.auth.admin.create_user.call_args[0][0]
        assert created['email'] == 'andrew@example.com'
        assert created['email_confirm'] is False
        profile = insert.call_args[0][1]
        assert profile['role'] == 'org_managed'
        assert profile['org_role'] == 'parent'
        assert profile['organization_id'] == ORG
        # The one attach path: it both joins the family and links the kids.
        attach.assert_called_once_with(ORG, 'new-parent', HH, source='add_parent')
        link = send.call_args.kwargs['invite_link']
        assert '/reset-password?token=tok' in link
        assert audit.call_args[0][2] == 'sis_household_guardian_added'

    def test_a_grown_up_already_at_the_school_is_connected_without_an_email(self):
        result, admin, attach, _, insert, send = _run(
            [{'id': 'p-2', 'organization_id': ORG, 'org_role': 'parent'}])
        assert result['kind'] == 'connected'
        attach.assert_called_once_with(ORG, 'p-2', HH, source='add_parent')
        admin.auth.admin.create_user.assert_not_called()
        send.assert_not_called()

    def test_an_account_outside_the_school_is_never_claimed(self):
        result, admin, attach, _, _, send = _run(
            [{'id': 'p-3', 'organization_id': None, 'role': 'parent'}])
        assert result['status'] == 409
        assert result['code'] == 'email_taken'
        attach.assert_not_called()
        admin.auth.admin.create_user.assert_not_called()
        send.assert_not_called()

    def test_a_student_is_not_made_a_guardian(self):
        result, _, attach, _, _, _ = _run(
            [{'id': 's-1', 'organization_id': ORG, 'org_role': 'student'}])
        assert result['status'] == 409
        assert result['code'] == 'is_student'
        attach.assert_not_called()

    def test_a_family_at_another_school_is_not_found(self):
        result, _, attach, _, _, _ = _run([], household={'id': HH, 'organization_id': 'org-2'})
        assert result['status'] == 404
        attach.assert_not_called()

    @pytest.mark.parametrize('body', [
        {'first_name': '', 'last_name': 'Larson', 'email': 'a@b.co'},
        {'first_name': 'Andrew', 'last_name': 'Larson', 'email': 'not-an-email'},
    ])
    def test_missing_name_or_bad_email_is_refused(self, body):
        result, admin, attach, _, _, _ = _run([], body=body)
        assert result['status'] == 400
        admin.auth.admin.create_user.assert_not_called()
        attach.assert_not_called()
