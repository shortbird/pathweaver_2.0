"""
"Email login info" from /admin/users (services/login_info_service.py).

What the email must and must not carry:
- never a password: the link is a minted single-use invite token, and the
  rendered body contains no password string at all;
- the address they sign in with, in the body, because that is the half of
  "login information" people actually forget;
- role-flavoured steps: students and parents see the app-store bullet, staff
  at an SIS org see the School Admin bullet, and neither sees the other's.

And who cannot receive it: dependents, username-only students and placeholder
staff have no inbox, and the caller is told why instead of a silent no-op.
"""

from unittest.mock import Mock, patch

import pytest


def _admin_with(user_row, org_row=None):
    """Admin stub: users select -> user_row; organizations select -> org_row;
    every other execute (token insert) succeeds."""
    client = Mock()

    def table(name):
        t = Mock()
        for chained in ('select', 'eq', 'limit', 'insert', 'update'):
            getattr(t, chained).return_value = t
        if name == 'users':
            t.execute.return_value = Mock(data=[user_row] if user_row else [])
        elif name == 'organizations':
            t.execute.return_value = Mock(data=[org_row] if org_row else [])
        else:
            t.execute.return_value = Mock(data=[{'id': 'tok-row'}])
        return t

    client.table.side_effect = table
    return client


def _student(**overrides):
    row = {'id': 'u-1', 'email': 'kid@example.com', 'first_name': 'Sam',
           'last_name': 'Ng', 'display_name': 'Sam Ng', 'role': 'student',
           'org_role': None, 'org_roles': None, 'organization_id': None,
           'is_dependent': False, 'username': None}
    row.update(overrides)
    return row


def _send(user_row, org_row=None, sis=False):
    """Run send_login_info against stubs; returns (result, send kwargs)."""
    from services import login_info_service
    sender = Mock(return_value=True)
    with patch.object(login_info_service, '_admin', return_value=_admin_with(user_row, org_row)), \
         patch('modules.enabled.module_enabled', return_value=sis), \
         patch('services.email_service.email_service.send_login_info_email', sender):
        result = login_info_service.send_login_info('u-1')
    return result, sender.call_args.kwargs


@pytest.mark.unit
class TestWhatGoesOut:
    def test_student_gets_link_email_and_mobile_step(self):
        result, kwargs = _send(_student())
        assert result['email'] == 'kid@example.com'
        assert kwargs['user_email'] == 'kid@example.com'
        assert kwargs['user_name'] == 'Sam'
        assert '/reset-password?token=' in kwargs['invite_link']
        assert 'email=kid%40example.com' in kwargs['invite_link']
        assert kwargs['login_url'].endswith('/login')
        assert kwargs['show_mobile'] is True
        assert kwargs['show_sis'] is False
        assert kwargs['expiry_days'] == 14

    def test_org_parent_is_named_the_org_and_gets_mobile_step(self):
        _, kwargs = _send(
            _student(role='org_managed', org_role='parent', org_roles=['parent'],
                     organization_id='org-1'),
            org_row={'name': 'Hearthwood'})
        assert kwargs['org_name'] == 'Hearthwood'
        assert kwargs['show_mobile'] is True
        assert kwargs['show_sis'] is False

    def test_staff_at_sis_org_get_school_admin_step_not_mobile(self):
        _, kwargs = _send(
            _student(role='org_managed', org_role='advisor', org_roles=['advisor'],
                     organization_id='org-1'),
            org_row={'name': 'iCreate'}, sis=True)
        assert kwargs['show_sis'] is True
        assert kwargs['show_mobile'] is False

    def test_staff_at_non_sis_org_get_neither_extra_step(self):
        _, kwargs = _send(
            _student(role='org_managed', org_role='org_admin', org_roles=['org_admin'],
                     organization_id='org-1'),
            org_row={'name': 'Horizon'}, sis=False)
        assert kwargs['show_sis'] is False
        assert kwargs['show_mobile'] is False

    def test_link_carries_a_fresh_token_minted_for_the_target(self):
        from services import login_info_service
        with patch.object(login_info_service, '_admin', return_value=_admin_with(_student())), \
             patch('modules.enabled.module_enabled', return_value=False), \
             patch('utils.invite_tokens.mint_invite_token', return_value='tok-xyz') as mint, \
             patch('services.email_service.email_service.send_login_info_email',
                   return_value=True) as sender:
            login_info_service.send_login_info('u-1')
        assert mint.call_args.args == ('u-1',)
        assert 'token=tok-xyz' in sender.call_args.kwargs['invite_link']

    def test_failed_mint_sends_nothing(self):
        from services import login_info_service
        with patch.object(login_info_service, '_admin', return_value=_admin_with(_student())), \
             patch('modules.enabled.module_enabled', return_value=False), \
             patch('utils.invite_tokens.mint_invite_token', return_value=None), \
             patch('services.email_service.email_service.send_login_info_email') as sender, \
             pytest.raises(RuntimeError):
            login_info_service.send_login_info('u-1')
        sender.assert_not_called()


@pytest.mark.unit
class TestWhoCannotReceiveIt:
    def _refuse(self, row):
        from services.login_info_service import LoginInfoError
        with pytest.raises(LoginInfoError) as excinfo:
            _send(row)
        return str(excinfo.value)

    def test_dependent_without_email(self):
        msg = self._refuse(_student(email=None, is_dependent=True))
        assert 'dependent' in msg.lower()

    def test_username_only_student(self):
        msg = self._refuse(_student(email='', username='sam.ng'))
        assert 'sam.ng' in msg

    def test_placeholder_staff(self):
        msg = self._refuse(_student(email='jane@icreate-staff.placeholder.optioeducation.com'))
        assert 'placeholder' in msg.lower()

    def test_unknown_user(self):
        from services import login_info_service
        from services.login_info_service import LoginInfoError
        with patch.object(login_info_service, '_admin', return_value=_admin_with(None)), \
             pytest.raises(LoginInfoError, match='User not found'):
            login_info_service.send_login_info('nope')

    def test_refusal_sends_nothing(self):
        from services import login_info_service
        with patch.object(login_info_service, '_admin',
                          return_value=_admin_with(_student(email=None, is_dependent=True))), \
             patch('services.email_service.email_service.send_login_info_email') as sender, \
             pytest.raises(login_info_service.LoginInfoError):
            login_info_service.send_login_info('u-1')
        sender.assert_not_called()


@pytest.mark.unit
class TestBulk:
    def test_one_failure_does_not_stop_the_rest(self):
        from services import login_info_service

        def fake_send(uid):
            if uid == 'bad':
                raise login_info_service.LoginInfoError('This is a placeholder account.')
            return {'email': f'{uid}@example.com', 'expiry_days': 14}

        with patch.object(login_info_service, 'send_login_info', side_effect=fake_send):
            result = login_info_service.send_login_info_bulk(['a', 'bad', 'c'])
        assert result['sent'] == 2
        assert result['failed'] == [{'user_id': 'bad', 'error': 'This is a placeholder account.'}]


@pytest.mark.unit
class TestRenderedEmail:
    """The template itself: no password, the email address in the body, and
    the conditional steps present only for the roles that get them."""

    def _render(self, **flags):
        from services.email_service import email_service
        captured = {}

        def fake_send(to_email, subject, html_body, text_body, *a, **k):
            captured.update(subject=subject, html=html_body, text=text_body)
            return True

        with patch.object(email_service, 'send_email', side_effect=fake_send):
            ok = email_service.send_login_info_email(
                user_email='kid@example.com', user_name='Sam',
                invite_link='https://app.example/reset-password?token=abc&email=kid%40example.com',
                login_url='https://app.example/login', org_name=flags.pop('org_name', ''),
                **flags)
        assert ok
        return captured

    def test_no_password_and_email_in_body(self):
        out = self._render(show_mobile=True)
        assert 'password' in out['html'].lower()  # the word, in the instructions
        assert 'changeme' not in out['html'].lower()
        assert 'kid@example.com' in out['html']
        assert 'token=abc' in out['html']
        assert 'https://app.example/login' in out['html']
        assert out['subject'] == 'Your Optio login information'

    def test_mobile_step_only_for_mobile_roles(self):
        with_mobile = self._render(show_mobile=True)['html']
        without = self._render(show_mobile=False)['html']
        assert 'apps.apple.com' in with_mobile
        assert 'apps.apple.com' not in without
        assert 'School Admin' not in with_mobile

    def test_sis_step_names_the_org(self):
        html = self._render(show_sis=True, org_name='iCreate')['html']
        assert 'School Admin' in html
        assert 'iCreate console' in html
        assert 'apps.apple.com' not in html

    def test_link_ampersand_is_escaped_exactly_once(self):
        # Regression: the CTA url was autoescaped, then escaped again by the
        # wrapper, so "&email=" reached inboxes as "&amp;amp;email=".
        html = self._render()['html']
        assert 'token=abc&amp;email=kid%40example.com' in html
        assert '&amp;amp;' not in html

    def test_conditional_bullets_leave_no_empty_items(self):
        html = self._render()['html']
        assert '<li class="list-item"></li>' not in html
        assert html.count('<li class="list-item">') == 2


def _caller_client(role_row):
    client = Mock()
    table = Mock()
    for chained in ('select', 'eq', 'limit', 'single', 'in_'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[role_row])  # require_admin reads .data[0]
    client.table.return_value = table
    return client


SUPERADMIN_ROW = {'id': 'super', 'role': 'superadmin', 'org_role': None, 'org_roles': None,
                  'is_org_admin': False, 'organization_id': None, 'email': 'super@optio.test'}
ORG_ADMIN_ROW = {'id': 'admin', 'role': 'org_managed', 'org_role': 'org_admin',
                 'org_roles': ['org_admin'], 'is_org_admin': True,
                 'organization_id': 'org-1', 'email': 'admin@school.test'}


@pytest.mark.unit
class TestRoutes:
    URL = '/api/admin/users/u-1/login-info'
    BULK = '/api/admin/users/bulk-login-info'

    def _post(self, client, auth_headers, caller, url=None, json=None, **service_patch):
        with patch('database.get_supabase_admin_client', return_value=_caller_client(caller)), \
             patch('services.login_info_service.send_login_info', **service_patch), \
             patch('services.login_info_service.send_login_info_bulk',
                   return_value={'sent': 1, 'failed': []}):
            return client.post(url or self.URL, headers=auth_headers, json=json or {})

    def test_unauthenticated_is_refused(self, client):
        assert client.post(self.URL, json={}).status_code == 401

    def test_org_admin_is_refused(self, client, auth_headers, mock_verify_token):
        resp = self._post(client, auth_headers, ORG_ADMIN_ROW,
                          return_value={'email': 'x', 'expiry_days': 14})
        assert resp.status_code == 403

    def test_superadmin_sends_and_hears_where(self, client, auth_headers, mock_verify_token):
        resp = self._post(client, auth_headers, SUPERADMIN_ROW,
                          return_value={'email': 'kid@example.com', 'expiry_days': 14})
        assert resp.status_code == 200
        assert resp.get_json()['message'] == 'Login information sent to kid@example.com'

    def test_unsendable_account_is_a_400_with_the_reason(self, client, auth_headers, mock_verify_token):
        from services.login_info_service import LoginInfoError
        resp = self._post(client, auth_headers, SUPERADMIN_ROW,
                          side_effect=LoginInfoError('This is a placeholder account.'))
        assert resp.status_code == 400
        assert resp.get_json()['error'] == 'This is a placeholder account.'

    def test_send_failure_is_a_503_that_says_so(self, client, auth_headers, mock_verify_token):
        resp = self._post(client, auth_headers, SUPERADMIN_ROW,
                          side_effect=RuntimeError('The email could not be sent'))
        assert resp.status_code == 503
        assert resp.get_json()['error']['message'] == 'The email could not be sent'

    def test_bulk_needs_a_list(self, client, auth_headers, mock_verify_token):
        resp = self._post(client, auth_headers, SUPERADMIN_ROW, url=self.BULK,
                          json={'user_ids': []}, return_value=None)
        assert resp.status_code == 400

    def test_bulk_reports_counts(self, client, auth_headers, mock_verify_token):
        resp = self._post(client, auth_headers, SUPERADMIN_ROW, url=self.BULK,
                          json={'user_ids': ['a']}, return_value=None)
        assert resp.status_code == 200
        assert resp.get_json() == {'success': True, 'sent': 1, 'failed': []}
