"""
Route tests for POST /api/dependents/add-child — the single door a parent uses
to add any of their children.

Age decides the shape, so these pin the split: under 13 goes to the COPPA
dependent path (no email, parent-managed), 13+ creates the teen's own account
via family_student_service and links the parent. A parent should never have to
classify their own child, and a school's parents shouldn't have to wait on the
teen to self-register.
"""

from datetime import datetime, timedelta
from unittest.mock import Mock, patch

import pytest


def _dob(years_ago):
    return (datetime.utcnow() - timedelta(days=int(years_ago * 365.25))).strftime('%Y-%m-%d')


def _post(client, auth_headers, body, parent_org=None):
    admin = Mock()
    table = Mock()
    admin.table.return_value = table
    for chained in ('select', 'eq', 'single', 'limit', 'insert', 'upsert'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data={'id': 'parent-1', 'organization_id': parent_org})

    with patch('routes.dependents.verify_parent_role', return_value=True), \
         patch('routes.dependents.get_supabase_admin_client', return_value=admin), \
         patch('utils.session_manager.session_manager.get_effective_user_id',
               return_value='parent-1'):
        return client.post('/api/dependents/add-child', json=body, headers=auth_headers)


@pytest.mark.unit
class TestAddChild:
    def test_under_13_creates_a_managed_dependent(self, client, auth_headers, mock_verify_token):
        with patch('routes.dependents.DependentRepository') as repo_cls:
            repo_cls.return_value.create_dependent.return_value = {'id': 'kid-1'}
            resp = _post(client, auth_headers, {
                'first_name': 'Sam', 'last_name': 'Ray', 'date_of_birth': _dob(8),
            })
        assert resp.status_code == 201
        assert resp.get_json()['kind'] == 'dependent'

    def test_13_plus_creates_their_own_account(self, client, auth_headers, mock_verify_token):
        with patch('services.family_student_service.create_teen_student') as create:
            create.return_value = {'student': {'id': 'teen-1', 'email': 'teen@example.com'}}
            resp = _post(client, auth_headers, {
                'first_name': 'Alex', 'last_name': 'Ray', 'date_of_birth': _dob(15),
                'email': 'teen@example.com',
            }, parent_org='org-1')
        assert resp.status_code == 201
        body = resp.get_json()
        assert body['kind'] == 'student'
        assert body['student']['id'] == 'teen-1'
        # The parent's org rides along so the teen lands in the same school.
        parent_arg = create.call_args[0][0]
        assert parent_arg['organization_id'] == 'org-1'

    def test_13_plus_without_email_is_refused(self, client, auth_headers, mock_verify_token):
        with patch('services.family_student_service.create_teen_student') as create:
            create.return_value = {'error': 'An email address is required for students 13 and older',
                                   'code': 'email_required'}
            resp = _post(client, auth_headers, {
                'first_name': 'Alex', 'last_name': 'Ray', 'date_of_birth': _dob(15),
            })
        assert resp.status_code == 400
        assert resp.get_json()['code'] == 'email_required'

    def test_missing_dob_is_refused(self, client, auth_headers, mock_verify_token):
        resp = _post(client, auth_headers, {'first_name': 'Alex', 'last_name': 'Ray'})
        assert resp.status_code == 400

    def test_malformed_dob_is_refused(self, client, auth_headers, mock_verify_token):
        resp = _post(client, auth_headers, {
            'first_name': 'Alex', 'last_name': 'Ray', 'date_of_birth': 'yesterday',
        })
        assert resp.status_code == 400


@pytest.mark.unit
class TestResendInvite:
    """Delivery is best-effort, so a create can land with the invite unsent.
    Without a resend the only recovery is "Forgot password" on an account the
    teen can't yet name."""

    def _client(self, link_rows, student_row):
        admin = Mock()
        table = Mock()
        admin.table.return_value = table
        for chained in ('select', 'eq', 'limit', 'maybe_single'):
            getattr(table, chained).return_value = table
        table.execute.side_effect = [
            Mock(data=link_rows),      # parent_student_links ownership check
            Mock(data=student_row),    # the student row
            Mock(data={'id': 'parent-1', 'first_name': 'Pat'}),  # the parent
        ]
        return admin

    def _post(self, client, auth_headers, admin, sent=True, student_id='teen-1'):
        with patch('routes.dependents.verify_parent_role', return_value=True), \
             patch('routes.dependents.get_supabase_admin_client', return_value=admin), \
             patch('services.family_student_service.send_account_invite', return_value=sent), \
             patch('utils.session_manager.session_manager.get_effective_user_id',
                   return_value='parent-1'):
            return client.post(
                f'/api/dependents/00000000-0000-4000-8000-000000000001/resend-invite',
                json={}, headers=auth_headers)

    def test_parent_can_resend(self, client, auth_headers, mock_verify_token):
        admin = self._client([{'id': 'link-1'}],
                             {'id': 'teen-1', 'email': 'teen@example.com',
                              'first_name': 'Alex', 'organization_id': 'org-1'})
        resp = self._post(client, auth_headers, admin)
        assert resp.status_code == 200
        assert 'teen@example.com' in resp.get_json()['message']

    def test_a_stranger_cannot_resend_for_someone_elses_child(self, client, auth_headers, mock_verify_token):
        # No approved link between caller and student: the lookup IS the authz.
        admin = self._client([], None)
        resp = self._post(client, auth_headers, admin)
        assert resp.status_code == 403

    def test_reports_a_failed_send_instead_of_claiming_success(self, client, auth_headers, mock_verify_token):
        admin = self._client([{'id': 'link-1'}],
                             {'id': 'teen-1', 'email': 'teen@example.com',
                              'first_name': 'Alex', 'organization_id': 'org-1'})
        resp = self._post(client, auth_headers, admin, sent=False)
        assert resp.status_code == 502
        assert resp.get_json()['success'] is False


@pytest.mark.unit
class TestTeenStudentService:
    def test_refuses_an_email_that_already_exists(self):
        from services import family_student_service
        admin = Mock()
        table = Mock()
        admin.table.return_value = table
        for chained in ('select', 'eq', 'limit'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[{'id': 'someone-else', 'email': 'taken@example.com'}])

        with patch.object(family_student_service, '_admin', return_value=admin):
            result = family_student_service.create_teen_student(
                {'id': 'parent-1', 'organization_id': 'org-1'},
                'Alex', 'Ray', 'taken@example.com',
                datetime.utcnow().date() - timedelta(days=15 * 365),
            )
        assert result['code'] == 'email_taken'
        admin.auth.admin.create_user.assert_not_called()

    def test_refuses_under_13(self):
        from services import family_student_service
        result = family_student_service.create_teen_student(
            {'id': 'parent-1', 'organization_id': None},
            'Sam', 'Ray', 'kid@example.com',
            datetime.utcnow().date() - timedelta(days=8 * 365),
        )
        assert result['code'] == 'under_13'

    def test_invite_is_a_set_password_link_not_a_signup_code(self):
        """The teen must get a link that both sets a password and confirms the
        email. The Supabase signup OTP was a dead end: a 6-digit code with no
        logged-out page to enter it, on an account whose password is a random
        string nobody knows."""
        from services import family_student_service
        admin = Mock()
        table = Mock()
        admin.table.return_value = table
        for chained in ('select', 'eq', 'limit', 'maybe_single', 'insert', 'upsert'):
            getattr(table, chained).return_value = table
        # No existing account for the email; org lookup returns a name.
        table.execute.side_effect = [Mock(data=[])] + [Mock(data={'name': 'Hearthwood Academy'})] * 8
        auth_user = Mock()
        auth_user.id = 'teen-1'
        admin.auth.admin.create_user.return_value = Mock(user=auth_user)

        with patch.object(family_student_service, '_admin', return_value=admin), \
             patch('services.portfolio_service.PortfolioService'), \
             patch('services.email_service.email_service.send_student_account_invite_email',
                   return_value=True) as send:
            result = family_student_service.create_teen_student(
                {'id': 'parent-1', 'organization_id': 'org-1', 'first_name': 'Pat'},
                'Alex', 'Ray', 'teen@example.com',
                datetime.utcnow().date() - timedelta(days=15 * 365),
            )

        assert result['student']['id'] == 'teen-1'
        # A set-password link went out...
        send.assert_called_once()
        assert '/reset-password?token=' in send.call_args.kwargs['invite_link']
        # ...and no Supabase signup code did.
        admin.auth.resend.assert_not_called()
