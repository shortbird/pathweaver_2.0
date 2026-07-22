"""
Adults who self-registered on the main Optio site must be able to log into
the iCreate parent funnel.

The main signup defaults EVERYONE to role='student', so an adult who created
their own account there (Stephanie Davis did exactly this while the funnel
was down, 2026-07-21) was refused with "This looks like a student's Optio
account" — despite only ever having an account for herself.

The guardrail must refuse only accounts with actual evidence of being a
kid's: dependent/managed, linked to a parent as the student, a minor by DOB,
or (DOB unknown) an account with real learning activity.
"""

from unittest.mock import patch

import pytest
from flask import Flask


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """The rate limiter's in-memory store is a process-wide singleton; these
    tests each POST /api/icreate/login, and without a reset they consume the
    shared per-IP budget and 429 OTHER login tests later in the run."""
    from middleware.rate_limiter import rate_limiter
    rate_limiter.requests.clear()
    rate_limiter.blocked_ips.clear()
    yield
    rate_limiter.requests.clear()
    rate_limiter.blocked_ips.clear()


@pytest.fixture
def client():
    from routes import icreate_registration
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(icreate_registration.bp)
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

    def select(self, *a, **k): self._op = 'select'; return self
    def insert(self, payload): self._op = 'insert'; self._payload = payload; return self
    def update(self, payload): self._op = 'update'; self._payload = payload; return self
    def eq(self, *a, **k): return self
    def order(self, *a, **k): return self
    def limit(self, *a, **k): return self
    def single(self): return self

    def execute(self):
        if self._op == 'insert':
            self.admin.inserts.append((self.table, self._payload))
            return _Resp([{**self._payload, 'id': 'new-reg-id'}])
        if self._op == 'update':
            self.admin.updates.append((self.table, self._payload))
            return _Resp([])
        return _Resp(list(self.admin.selects.get(self.table, [])))


class _FakeAdmin:
    def __init__(self, selects):
        self.selects = selects
        self.inserts = []
        self.updates = []

    def table(self, name):
        return _Query(name, self)


_INVITE = ({'organization': {'id': 'org1', 'name': 'iCreate', 'slug': 'icreate'}}, None)
_BODY = {'code': 'invite-code', 'email': 'steph@example.com', 'password': 'pw'}


def _platform_student(**over):
    return {'id': 'u1', 'role': 'student', 'org_role': None, 'org_roles': None,
            'organization_id': None, 'first_name': 'Stephanie', 'last_name': 'Davis',
            'is_dependent': False, 'managed_by_parent_id': None,
            'date_of_birth': None, 'total_xp': 0, **over}


def _post(client, admin):
    with patch('routes.icreate_registration._admin', return_value=admin), \
         patch('routes.icreate_registration._load_icreate_invite', return_value=_INVITE), \
         patch('routes.icreate_registration._password_ok', return_value=True):
        return client.post('/api/icreate/login', json=_BODY)


@pytest.mark.unit
class TestAdultParentLogin:
    def test_adult_by_dob_is_allowed_and_attached_as_parent(self, client):
        admin = _FakeAdmin({'users': [_platform_student(date_of_birth='1985-09-22')],
                            'icreate_registrations': []})
        resp = _post(client, admin)
        assert resp.status_code == 200
        assert resp.get_json()['status'] == 'family'
        attach = [p for t, p in admin.updates if t == 'users']
        assert attach and attach[0]['org_role'] == 'parent'

    def test_minor_by_dob_is_still_refused(self, client):
        admin = _FakeAdmin({'users': [_platform_student(date_of_birth='2012-05-02')],
                            'icreate_registrations': []})
        resp = _post(client, admin)
        assert resp.status_code == 409
        assert 'student' in resp.get_json()['error'].lower()

    def test_account_linked_to_a_parent_is_still_refused(self, client):
        admin = _FakeAdmin({'users': [_platform_student(date_of_birth='1985-09-22')],
                            'parent_student_links': [{'id': 'link1'}],
                            'icreate_registrations': []})
        resp = _post(client, admin)
        assert resp.status_code == 409

    def test_dependent_account_is_still_refused(self, client):
        admin = _FakeAdmin({'users': [_platform_student(
            date_of_birth='1985-09-22', managed_by_parent_id='someparent')],
            'icreate_registrations': []})
        resp = _post(client, admin)
        assert resp.status_code == 409

    def test_no_dob_pristine_account_is_allowed(self, client):
        admin = _FakeAdmin({'users': [_platform_student()],
                            'user_quests': [],
                            'icreate_registrations': []})
        resp = _post(client, admin)
        assert resp.status_code == 200

    def test_no_dob_with_learning_activity_is_refused(self, client):
        admin = _FakeAdmin({'users': [_platform_student(total_xp=450)],
                            'icreate_registrations': []})
        resp = _post(client, admin)
        assert resp.status_code == 409
