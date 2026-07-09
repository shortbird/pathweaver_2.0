"""
Regression test for the iCreate parent-login duplication bug.

An existing Optio account logging in through the iCreate invite link used to get a
BRAND-NEW registration inserted at status='family' every time, which sent an
already-registered parent back through the family step and created a second set
of children (Samuel Harrison et al. doubled on the family dashboard, 2026-07-09).

/api/icreate/login must instead reuse the parent's existing registration:
  - completed  -> return 'completed' (app), never insert a new one
  - in-flight  -> resume in place, never insert a new one
  - none       -> start a fresh 'family' registration (only genuinely-new case)
"""

from unittest.mock import patch

import pytest
from flask import Flask


@pytest.fixture
def client():
    """Minimal app with only the iCreate blueprint (avoids importing app.py,
    which pulls in optional Swagger deps not needed for this route)."""
    from routes import icreate_registration
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(icreate_registration.bp)
    return app.test_client()


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    """Minimal fluent stand-in for a supabase-py table query."""

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

    def single(self):
        return self

    def execute(self):
        if self._op == 'insert':
            self.admin.inserts.append((self.table, self._payload))
            return _Resp([{**self._payload, 'id': 'new-reg-id'}])
        if self._op == 'update':
            self.admin.updates.append((self.table, self._payload))
            return _Resp([])
        return _Resp(list(self.admin.selects.get(self.table, [])))


class _FakeAdmin:
    def __init__(self, users, regs):
        self.selects = {'users': users, 'icreate_registrations': regs}
        self.inserts = []
        self.updates = []

    def table(self, name):
        return _Query(name, self)


_USER = {'id': 'parent1', 'role': 'org_managed', 'org_role': 'parent',
         'organization_id': 'org1', 'first_name': 'Amy', 'last_name': 'Harrison'}
_INVITE = ({'organization': {'id': 'org1', 'name': 'iCreate', 'slug': 'icreate'}}, None)
_BODY = {'code': 'invite-code', 'email': 'amy@example.com', 'password': 'pw'}


def _post(client, admin):
    with patch('routes.icreate_registration._admin', return_value=admin), \
         patch('routes.icreate_registration._load_icreate_invite', return_value=_INVITE), \
         patch('routes.icreate_registration._password_ok', return_value=True):
        return client.post('/api/icreate/login', json=_BODY)


@pytest.mark.unit
class TestICreateLoginNoDuplicate:
    def test_completed_registration_is_not_restarted(self, client):
        admin = _FakeAdmin([_USER], [{'id': 'reg1', 'status': 'completed', 'access_token': 'tok'}])
        resp = _post(client, admin)
        assert resp.status_code == 200
        assert resp.get_json()['status'] == 'completed'
        # The bug: a new registration row was inserted, restarting the funnel.
        assert not any(t == 'icreate_registrations' for t, _ in admin.inserts)

    def test_in_flight_registration_is_resumed_not_duplicated(self, client):
        admin = _FakeAdmin([_USER], [{'id': 'reg1', 'status': 'family', 'access_token': 'tok'}])
        resp = _post(client, admin)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['status'] == 'family'
        assert body['registration_id'] == 'reg1'
        assert not any(t == 'icreate_registrations' for t, _ in admin.inserts)

    def test_new_parent_starts_a_family_registration(self, client):
        admin = _FakeAdmin([_USER], [])  # no prior registration
        resp = _post(client, admin)
        assert resp.status_code == 200
        assert resp.get_json()['status'] == 'family'
        assert any(t == 'icreate_registrations' for t, _ in admin.inserts)
