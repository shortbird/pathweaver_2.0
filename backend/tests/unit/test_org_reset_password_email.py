"""A school admin's "Reset password" on an EMAIL student.

2026-10-06: the SIS drawer's button POSTs {} to
/api/admin/organizations/<org>/users/<id>/reset-password. For a username
student that mints a new password to read aloud. For an email student it
answered 400 "new_password is required", so the button failed for every
student with an email (found while writing the Help Center article for
Apogee Central Florida, whose 60 students all have school email). Now it
emails the student a link to set their own password.
"""

import inspect
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from routes.admin import organization_users as route

ORG = 'org-1'
handler = inspect.unwrap(route.reset_user_password)


def _client_with(user_row):
    client = MagicMock()
    q = client.table.return_value
    for name in ('select', 'eq', 'single'):
        getattr(q, name).return_value = q
    q.execute.return_value = MagicMock(data=user_row)
    return client


def _call(user_row, body):
    app = Flask(__name__)
    client = _client_with(user_row)
    with app.test_request_context(json=body), \
         patch.object(route, 'get_supabase_admin_client', return_value=client), \
         patch('services.password_reset_service.send_reset_link', return_value=True) as send:
        resp, status = handler('admin-1', ORG, False, ORG, 'kid-1')
    return resp.get_json(), status, client, send


EMAIL_KID = {'id': 'kid-1', 'username': None, 'email': 'kid@school.org',
             'organization_id': ORG, 'first_name': 'Silas', 'last_name': 'Morton'}
USERNAME_KID = {'id': 'kid-1', 'username': 'liamd', 'email': None,
                'organization_id': ORG, 'first_name': 'Liam', 'last_name': 'D'}


@pytest.mark.unit
class TestEmailAccountReset:
    def test_empty_body_emails_a_reset_link_instead_of_400(self):
        body, status, client, send = _call(EMAIL_KID, {})
        assert status == 200
        assert body['emailed'] is True
        assert 'kid@school.org' in body['message']
        send.assert_called_once()
        args, kwargs = send.call_args
        assert args[1:3] == ('kid-1', 'kid@school.org')
        assert kwargs['expiry_hours'] == route.ADMIN_RESET_LINK_EXPIRY_HOURS
        # The admin never sets or sees an email account's password.
        client.auth.admin.update_user_by_id.assert_not_called()
        assert 'new_password' not in body

    def test_a_failed_send_says_so(self):
        app = Flask(__name__)
        with app.test_request_context(json={}), \
             patch.object(route, 'get_supabase_admin_client', return_value=_client_with(EMAIL_KID)), \
             patch('services.password_reset_service.send_reset_link', return_value=False):
            resp, status = handler('admin-1', ORG, False, ORG, 'kid-1')
        assert status == 502

    def test_username_account_still_gets_a_new_password(self):
        body, status, client, send = _call(USERNAME_KID, {})
        assert status == 200
        assert body['new_password']
        send.assert_not_called()
        client.auth.admin.update_user_by_id.assert_called_once()

    def test_regenerate_on_an_email_account_still_returns_a_password(self):
        """EditUserModal's "Regenerate" asks for a password on purpose."""
        body, status, client, send = _call(EMAIL_KID, {'regenerate': True})
        assert status == 200
        assert body['new_password']
        send.assert_not_called()

    def test_another_orgs_student_is_refused_and_nothing_is_sent(self):
        body, status, client, send = _call({**EMAIL_KID, 'organization_id': 'org-2'}, {})
        assert status == 403
        send.assert_not_called()


@pytest.mark.unit
def test_send_reset_link_stores_the_hash_and_mails_the_plaintext():
    from services import password_reset_service as svc
    from utils.reset_tokens import hash_reset_token
    client = MagicMock()
    with patch('services.email_service.email_service') as mail:
        mail.send_password_reset_email.return_value = True
        assert svc.send_reset_link(client, 'kid-1', 'kid@school.org', 'Silas', expiry_hours=24) is True
    row = client.table.return_value.insert.call_args[0][0]
    link = mail.send_password_reset_email.call_args.kwargs['reset_link']
    token = link.split('token=')[1]
    assert row['token'] == hash_reset_token(token) != token
    assert row['user_id'] == 'kid-1' and row['used'] is False
    assert mail.send_password_reset_email.call_args.kwargs['user_email'] == 'kid@school.org'
