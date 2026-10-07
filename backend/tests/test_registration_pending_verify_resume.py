"""
A parent who left before entering the emailed code must be able to come back.

Supabase refuses to sign in an unconfirmed email, so any password check on such
an account fails with the right password. Until 2026-10-07 both doors refused
these parents: "Create account" with the same email said "Enter the same
password", and "Sign in" said "Incorrect password". 0 of 368 unconfirmed
accounts had ever signed in. Both doors now send a fresh code instead; the code
only reaches the address, so it is the proof of ownership.
"""
from unittest.mock import patch

import pytest

from tests.test_registration_passwordless_accounts import (  # noqa: F401  (fixtures)
    _INVITE, _FakeAdmin, _parent, _reset_rate_limiter, client)

PENDING = {'id': 'reg-1', 'status': 'verify', 'parent_user_id': 'u1',
           'users': {'email': 'c@example.com'}}


def _post(client, admin, path, body):
    sent = []
    with patch('routes.registration_entry._admin', return_value=admin), \
         patch('routes.registration_entry._load_registration_invite', return_value=_INVITE), \
         patch('routes.registration_entry._password_ok', return_value=False) as pw, \
         patch('routes.registration_entry._issue_otp', return_value='123456'), \
         patch('routes.registration_entry._send_otp_email',
               side_effect=lambda *a, **k: sent.append(a) or True), \
         patch('routes.registration_entry._email_exists', return_value=True):
        resp = client.post(path, json={'code': 'invite-code', **body})
    return resp, sent, pw


@pytest.mark.unit
class TestPendingVerifyResume:
    def test_create_account_again_resends_the_code_without_a_password_check(self, client):
        admin = _FakeAdmin({'registrations': [PENDING]})
        resp, sent, pw = _post(client, admin, '/api/registration/start', {
            'email': 'c@example.com', 'password': 'whatever-they-typed',
            'first_name': 'Carolyn', 'last_name': 'Waite'})
        assert resp.status_code == 200
        assert resp.get_json()['registration_id'] == 'reg-1'
        assert len(sent) == 1
        pw.assert_not_called()

    def test_sign_in_sends_a_code_and_asks_for_it(self, client):
        admin = _FakeAdmin({'users': [_parent()], 'user_quests': [],
                            'registrations': [PENDING]})
        resp, sent, pw = _post(client, admin, '/api/registration/login',
                               {'email': 'c@example.com', 'password': 'pw'})
        body = resp.get_json()
        assert resp.status_code == 200
        assert body['pending_verify'] is True
        assert body['registration_id'] == 'reg-1'
        assert 'access_token' not in body
        assert len(sent) == 1
        pw.assert_not_called()

    def test_sign_in_without_a_pending_code_still_checks_the_password(self, client):
        admin = _FakeAdmin({'users': [_parent()], 'user_quests': [], 'registrations': []})
        resp, sent, pw = _post(client, admin, '/api/registration/login',
                               {'email': 'c@example.com', 'password': 'pw'})
        assert resp.status_code == 401
        assert sent == []
        pw.assert_called_once()
