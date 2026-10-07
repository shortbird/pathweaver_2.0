"""
POST /api/registration/start names a weak or breached password as the problem.

Tickets 77688d67-1c9e-4841-a0ba-ecd8b218b828 and
f61b7520-0b94-4bce-882d-63c34bb6492f (Sentry, 2026-10-07): a parent on
/enroll/optio-academy chose a password Supabase refused as "Password is known
to be weak and easy to guess, please choose a different one." The route logged
it at ERROR and told the parent "Could not create your account. Please try
again." -- a dead end for a password they could simply have changed.

This is the case commit a46a48392 (ticket 132cd11c) fixed for add-dependent-
login and promote-to-independent; /start now follows the same pattern: ask HIBP
before creating the account, and recognise GoTrue's refusal when it arrives
anyway.
"""

from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from utils.validation.breached_password import BREACHED_PASSWORD_MESSAGE


@pytest.fixture
def client():
    from routes import registration_funnel
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(registration_funnel.bp)
    return app.test_client()


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table, admin):
        self.table = table
        self.admin = admin
        self._op = 'select'
        self._payload = None

    def select(self, *a, **k):
        self._op = 'select'; return self

    def insert(self, payload):
        self._op = 'insert'; self._payload = payload; return self

    def update(self, payload):
        self._op = 'update'; self._payload = payload; return self

    def eq(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        if self._op == 'insert':
            self.admin.inserts.append((self.table, self._payload))
            return _Resp([{**self._payload, 'id': 'new-reg-id'}])
        return _Resp([])


class _FakeAdmin:
    def __init__(self):
        self.inserts = []

    def table(self, name):
        return _Query(name, self)


class _GoTrueWeakPassword(Exception):
    """Shape of supabase-py's AuthWeakPasswordError as the route sees it."""

    def __init__(self):
        super().__init__('Password is known to be weak and easy to guess, please choose a different one.')
        self.message = str(self)
        self.code = 'weak_password'
        self.status = 422


_INVITE = ({'organization': {'id': 'org1', 'name': 'Optio Academy', 'slug': 'optio-academy'}}, None)
_BODY = {'code': 'optio-academy', 'email': 'new.parent@example.com',
         'password': 'password123', 'first_name': 'Pat', 'last_name': 'Parent'}


def _post(client, admin, *, breached, create_parent):
    with patch('routes.registration_entry._admin', return_value=admin), \
         patch('routes.registration_entry._load_registration_invite', return_value=_INVITE), \
         patch('routes.registration_entry._email_exists', return_value=False), \
         patch('routes.registration_entry.validate_password_not_breached',
               return_value=(False, BREACHED_PASSWORD_MESSAGE) if breached else (True, None)), \
         patch('routes.registration_entry._create_org_parent', create_parent), \
         patch('routes.registration_entry._issue_otp', return_value='123456'), \
         patch('routes.registration_entry._send_otp_email', return_value=True):
        return client.post('/api/registration/start', json=_BODY)


@pytest.mark.unit
class TestRegistrationStartWeakPassword:
    def test_gotrue_weak_refusal_is_a_400_with_the_breached_message(self, client):
        """Tickets 77688d67 / f61b7520: GoTrue refused the password ("known to
        be weak and easy to guess") and the parent saw "Could not create your
        account. Please try again." Now a 400 that names the password, and no
        registrations row is written."""
        admin = _FakeAdmin()
        create_parent = MagicMock(side_effect=_GoTrueWeakPassword())
        resp = _post(client, admin, breached=False, create_parent=create_parent)
        assert resp.status_code == 400
        assert resp.get_json()['error'] == BREACHED_PASSWORD_MESSAGE
        assert not any(t == 'registrations' for t, _ in admin.inserts)

    def test_hibp_hit_is_a_400_before_any_account_is_created(self, client):
        """Tickets 77688d67 / f61b7520: the HIBP pre-check catches a breached
        password before Supabase sees it, so _create_org_parent never runs."""
        admin = _FakeAdmin()
        create_parent = MagicMock(return_value='parent-1')
        resp = _post(client, admin, breached=True, create_parent=create_parent)
        assert resp.status_code == 400
        assert resp.get_json()['error'] == BREACHED_PASSWORD_MESSAGE
        create_parent.assert_not_called()
        assert admin.inserts == []

    def test_other_failure_is_still_a_500(self, client):
        """Tickets 77688d67 / f61b7520: only the password refusal becomes a
        400. Any other account-creation failure keeps the generic 500."""
        admin = _FakeAdmin()
        create_parent = MagicMock(side_effect=RuntimeError('Failed to create parent account'))
        resp = _post(client, admin, breached=False, create_parent=create_parent)
        assert resp.status_code == 500
        assert resp.get_json()['error'] == 'Could not create your account. Please try again.'
        assert not any(t == 'registrations' for t, _ in admin.inserts)

    def test_clean_password_creates_the_registration(self, client):
        """Control: a clean password still reaches the code step."""
        admin = _FakeAdmin()
        create_parent = MagicMock(return_value='parent-1')
        resp = _post(client, admin, breached=False, create_parent=create_parent)
        assert resp.status_code == 201
        assert any(t == 'registrations' for t, _ in admin.inserts)
