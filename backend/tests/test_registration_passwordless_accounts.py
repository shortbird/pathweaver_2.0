"""
Accounts with NO password must be able to register a family.

The funnel used to prove identity with a password and nothing else, which
silently excluded every account that has none — Google and Apple signups, plus
org-imported parents (118 of 906 accounts on 2026-08-25). Carolyn Waite, who had
signed up with Apple, hit a closed loop: "Create account" said her email was
taken, "Sign in" said her password was wrong — and named Google while doing it.

Two things are locked down here:

1. /login must not answer a passwordless account with a bare "wrong password".
   It returns code='oauth_account' naming the real provider, so the page can
   point at the button that works.
2. /attach is the door those accounts actually come through: identity proven by
   the session instead, and then the SAME guardrails and attach behaviour as
   /login — the two must never drift apart.
"""

from unittest.mock import patch

import pytest
from flask import Flask


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """The rate limiter's in-memory store is a process-wide singleton; without a
    reset these tests eat the shared per-IP budget and 429 later login tests."""
    from middleware.rate_limiter import rate_limiter
    rate_limiter.requests.clear()
    rate_limiter.blocked_ips.clear()
    yield
    rate_limiter.requests.clear()
    rate_limiter.blocked_ips.clear()


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


class _Identities:
    """Stands in for supabase.auth.admin.get_user_by_id."""
    def __init__(self, providers):
        self.providers = providers

    def get_user_by_id(self, user_id):
        if self.providers is None:
            raise RuntimeError('auth admin unavailable')
        return type('R', (), {
            'user': type('U', (), {'identities': [{'provider': p} for p in self.providers]})()
        })()


class _FakeAdmin:
    def __init__(self, selects, providers=('email',)):
        self.selects = selects
        self.inserts = []
        self.updates = []
        self.auth = type('A', (), {'admin': _Identities(providers)})()

    def table(self, name):
        return _Query(name, self)


_INVITE = ({'organization': {'id': 'org1', 'name': 'Optio Academy', 'slug': 'optio-academy'}}, None)


def _parent(**over):
    """A pristine platform account — role='student' because the main Optio
    signup defaults everyone to it, which is exactly Carolyn's shape."""
    return {'id': 'u1', 'role': 'student', 'org_role': None, 'org_roles': None,
            'organization_id': None, 'first_name': 'Carolyn', 'last_name': 'Waite',
            'is_dependent': False, 'managed_by_parent_id': None,
            'date_of_birth': None, 'total_xp': 0, **over}


def _login(client, admin, password_ok=False):
    with patch('routes.registration_funnel._admin', return_value=admin), \
         patch('routes.registration_funnel._load_registration_invite', return_value=_INVITE), \
         patch('routes.registration_funnel._password_ok', return_value=password_ok):
        return client.post('/api/registration/login',
                           json={'code': 'invite-code', 'email': 'c@example.com', 'password': 'pw'})


def _attach(client, admin, user_id='u1'):
    with patch('routes.registration_funnel._admin', return_value=admin), \
         patch('routes.registration_funnel._load_registration_invite', return_value=_INVITE), \
         patch('utils.session_manager.session_manager.get_effective_user_id', return_value=user_id):
        return client.post('/api/registration/attach', json={'code': 'invite-code'})


@pytest.mark.unit
class TestPasswordFailureNamesTheProvider:
    def test_apple_only_account_is_told_to_use_apple(self, client):
        admin = _FakeAdmin({'users': [_parent()], 'user_quests': [], 'registrations': []},
                           providers=('apple',))
        resp = _login(client, admin)
        body = resp.get_json()
        assert resp.status_code == 409
        assert body['code'] == 'oauth_account'
        assert body['providers'] == ['apple']
        assert 'Apple' in body['error']
        # The old message named Google at every passwordless account. Never again.
        assert 'Google' not in body['error']

    def test_google_only_account_is_told_to_use_google(self, client):
        admin = _FakeAdmin({'users': [_parent()], 'user_quests': [], 'registrations': []},
                           providers=('google',))
        body = _login(client, admin).get_json()
        assert body['code'] == 'oauth_account'
        assert 'Google' in body['error']

    def test_social_account_that_also_has_a_password_gets_the_normal_401(self, client):
        """An email identity means a password exists, so a wrong one is just wrong."""
        admin = _FakeAdmin({'users': [_parent()], 'user_quests': [], 'registrations': []},
                           providers=('google', 'email'))
        resp = _login(client, admin)
        assert resp.status_code == 401
        assert resp.get_json()['code'] == 'bad_password'

    def test_password_account_is_pointed_at_the_reset_flow(self, client):
        admin = _FakeAdmin({'users': [_parent()], 'user_quests': [], 'registrations': []},
                           providers=('email',))
        resp = _login(client, admin)
        assert resp.status_code == 401
        assert 'Forgot password' in resp.get_json()['error']

    def test_identity_lookup_failure_degrades_to_the_normal_401(self, client):
        """A flaky auth admin call must never invent an oauth_account refusal."""
        admin = _FakeAdmin({'users': [_parent()], 'user_quests': [], 'registrations': []},
                           providers=None)
        resp = _login(client, admin)
        assert resp.status_code == 401
        assert resp.get_json()['code'] == 'bad_password'

    def test_correct_password_still_attaches(self, client):
        admin = _FakeAdmin({'users': [_parent()], 'user_quests': [], 'registrations': []})
        resp = _login(client, admin, password_ok=True)
        assert resp.status_code == 200
        assert resp.get_json()['status'] == 'family'


@pytest.mark.unit
class TestAttachBySession:
    def test_passwordless_account_attaches_and_starts_a_registration(self, client):
        admin = _FakeAdmin({'users': [_parent()], 'user_quests': [], 'registrations': []},
                           providers=('apple',))
        resp = _attach(client, admin)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['status'] == 'family'
        assert body['access_token']
        attach = [p for t, p in admin.updates if t == 'users']
        assert attach and attach[0]['org_role'] == 'parent'
        assert attach[0]['role'] == 'org_managed'

    def test_requires_a_session(self, client):
        from utils.auth.decorators import AuthenticationError
        admin = _FakeAdmin({'users': [_parent()], 'registrations': []})
        with patch('routes.registration_funnel._admin', return_value=admin), \
             patch('routes.registration_funnel._load_registration_invite', return_value=_INVITE), \
             patch('utils.session_manager.session_manager.get_effective_user_id', return_value=None):
            with pytest.raises(AuthenticationError):
                client.post('/api/registration/attach', json={'code': 'invite-code'})

    def test_resumes_an_existing_registration_instead_of_duplicating(self, client):
        """Same rule as /login: a second row here would create a second set of
        children on the family step."""
        admin = _FakeAdmin({
            'users': [_parent()], 'user_quests': [],
            'registrations': [{'id': 'reg1', 'status': 'details', 'access_token': 'tok1'}],
        }, providers=('google',))
        body = _attach(client, admin).get_json()
        assert body['registration_id'] == 'reg1'
        assert body['status'] == 'details'
        assert not [t for t, _ in admin.inserts if t == 'registrations']

    def test_completed_registration_is_never_restarted(self, client):
        admin = _FakeAdmin({
            'users': [_parent()], 'user_quests': [],
            'registrations': [{'id': 'reg1', 'status': 'completed', 'access_token': 'tok1'}],
        }, providers=('google',))
        assert _attach(client, admin).get_json()['status'] == 'completed'


@pytest.mark.unit
class TestAttachEnforcesTheSameGuardrails:
    """The whole point of sharing _parent_guardrails: a new door must not be a
    softer one. Each case here mirrors a /login refusal."""

    def test_account_in_another_org_is_refused(self, client):
        admin = _FakeAdmin({'users': [_parent(organization_id='other-org')],
                            'registrations': []}, providers=('google',))
        resp = _attach(client, admin)
        assert resp.status_code == 409
        assert 'another school' in resp.get_json()['error']

    def test_superadmin_is_refused(self, client):
        admin = _FakeAdmin({'users': [_parent(role='superadmin')],
                            'registrations': []}, providers=('google',))
        assert _attach(client, admin).status_code == 403

    def test_a_kids_account_is_refused(self, client):
        admin = _FakeAdmin({'users': [_parent(date_of_birth='2012-05-02')],
                            'registrations': []}, providers=('apple',))
        resp = _attach(client, admin)
        assert resp.status_code == 409
        assert 'student' in resp.get_json()['error'].lower()

    def test_account_linked_to_a_parent_is_refused(self, client):
        admin = _FakeAdmin({'users': [_parent()], 'parent_student_links': [{'id': 'l1'}],
                            'registrations': []}, providers=('apple',))
        assert _attach(client, admin).status_code == 409

    def test_same_org_staff_keep_their_staff_role(self, client):
        """An advisor registering their own kids gains 'parent' without being
        demoted out of the staff surfaces."""
        admin = _FakeAdmin({
            'users': [_parent(role='org_managed', org_role='advisor',
                              org_roles=['advisor'], organization_id='org1')],
            'registrations': [],
        }, providers=('google',))
        resp = _attach(client, admin)
        assert resp.status_code == 200
        roles = [p for t, p in admin.updates if t == 'users'][0]['org_roles']
        assert roles == ['advisor', 'parent']

    @pytest.mark.parametrize('staff_role', ['org_admin', 'campus_coordinator', 'advisor'])
    def test_every_staff_role_may_register_their_own_children(self, client, staff_role):
        """campus_coordinator was missing from the funnel's hand-written staff
        tuple, so a coordinator enrolling her own child hit "This is not a parent
        account. Please register with a parent email." — with no parent email to
        register with. The tuple comes from utils/sis_roles.py now.

        The staff role stays PRIMARY: get_effective_role and every staff surface
        read the first entry, so a coordinator must not be turned into a parent
        by enrolling her own kid."""
        admin = _FakeAdmin({
            'users': [_parent(role='org_managed', org_role=staff_role,
                              org_roles=[staff_role], organization_id='org1')],
            'registrations': [],
        }, providers=('apple',))
        resp = _attach(client, admin)
        assert resp.status_code == 200
        assert resp.get_json()['status'] == 'family'
        roles = [p for t, p in admin.updates if t == 'users'][0]['org_roles']
        assert roles == [staff_role, 'parent']

    def test_staff_who_are_already_parents_are_not_given_a_second_parent_role(self, client):
        admin = _FakeAdmin({
            'users': [_parent(role='org_managed', org_role='campus_coordinator',
                              org_roles=['campus_coordinator', 'parent'],
                              organization_id='org1')],
            'registrations': [],
        }, providers=('apple',))
        assert _attach(client, admin).status_code == 200
        assert not [p for t, p in admin.updates if t == 'users']

    def test_a_coordinator_at_a_different_org_is_still_refused(self, client):
        """Widening the staff tuple must not widen the cross-org rule."""
        admin = _FakeAdmin({
            'users': [_parent(role='org_managed', org_role='campus_coordinator',
                              org_roles=['campus_coordinator'], organization_id='other-org')],
            'registrations': [],
        }, providers=('apple',))
        resp = _attach(client, admin)
        assert resp.status_code == 409
        assert 'another school' in resp.get_json()['error']
