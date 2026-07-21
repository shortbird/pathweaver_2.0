"""
Tests for connecting pre-existing Optio accounts during iCreate registration.

Before 2026-07 a kid whose email already had an Optio account was 409-blocked
("contact iCreate"), which produced duplicate dependents and half-connected
accounts. Now:
  - a kid email matching an attachable student account ATTACHES it (org fields
    normalized, history kept); other-org / non-student / other-parent accounts
    still refuse.
  - a returning parent's own dependents are matched by name+DOB and reused
    instead of duplicated.
  - /login refuses platform NON-parent accounts instead of silently converting
    them into iCreate parents.
  - sis_service.attach_student_to_org fully attaches a student added to a
    household by staff (org fields + parent links).
"""

from unittest.mock import patch

import pytest
from flask import Flask

from routes import icreate_registration as icr
from services import sis_service


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

    def in_(self, *a, **k):
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
            return _Resp([{**(self._payload or {}), 'id': 'new-id'}])
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


# ── _existing_account_for_kid ────────────────────────────────────────────────

def _kid_lookup(user_rows, link_rows=()):
    admin = _FakeAdmin({'users': list(user_rows), 'parent_student_links': list(link_rows)})
    return icr._existing_account_for_kid(admin, 'org1', 'parent1', 'kid@x.com')


@pytest.mark.unit
class TestExistingAccountForKid:
    def test_platform_student_is_attachable(self):
        u, why = _kid_lookup([{'id': 'k1', 'role': 'student', 'org_role': None,
                               'organization_id': None, 'is_dependent': False}])
        assert u and u['id'] == 'k1' and why is None

    def test_same_org_student_is_attachable(self):
        """School-imported accounts (in the org before the funnel) must connect."""
        u, why = _kid_lookup([{'id': 'k1', 'role': 'org_managed', 'org_role': 'student',
                               'organization_id': 'org1', 'is_dependent': False}])
        assert u and why is None

    def test_unused_email(self):
        u, why = _kid_lookup([])
        assert u is None and why is None

    def test_other_org_refuses(self):
        u, why = _kid_lookup([{'id': 'k1', 'role': 'org_managed', 'org_role': 'student',
                               'organization_id': 'org2', 'is_dependent': False}])
        assert u is None and why == 'other_org'

    def test_non_student_refuses(self):
        u, why = _kid_lookup([{'id': 'k1', 'role': 'parent', 'org_role': None,
                               'organization_id': None, 'is_dependent': False}])
        assert u is None and why == 'not_student'

    def test_dependent_and_superadmin_refuse(self):
        u, why = _kid_lookup([{'id': 'k1', 'role': 'student', 'organization_id': None,
                               'is_dependent': True}])
        assert u is None and why == 'not_attachable'
        u, why = _kid_lookup([{'id': 'k1', 'role': 'superadmin', 'organization_id': None,
                               'is_dependent': False}])
        assert u is None and why == 'not_attachable'

    def test_linked_to_other_parent_refuses(self):
        u, why = _kid_lookup(
            [{'id': 'k1', 'role': 'student', 'organization_id': None, 'is_dependent': False}],
            link_rows=[{'parent_user_id': 'someone-else'}])
        assert u is None and why == 'other_parent'

    def test_linked_to_same_parent_is_attachable(self):
        u, why = _kid_lookup(
            [{'id': 'k1', 'role': 'student', 'organization_id': None, 'is_dependent': False}],
            link_rows=[{'parent_user_id': 'parent1'}])
        assert u and why is None


# ── _match_existing_dependent ────────────────────────────────────────────────

@pytest.mark.unit
class TestMatchExistingDependent:
    DEPS = [
        {'id': 'd1', 'first_name': 'Flynn', 'last_name': 'Pulham', 'date_of_birth': '2015-04-01'},
        {'id': 'd2', 'first_name': 'River', 'last_name': 'Pulham', 'date_of_birth': None},
    ]

    def test_matches_name_and_dob(self):
        d = icr._match_existing_dependent(self.DEPS, 'Flynn', 'Pulham', '2015-04-01')
        assert d and d['id'] == 'd1'

    def test_dob_mismatch_no_match(self):
        assert icr._match_existing_dependent(self.DEPS, 'Flynn', 'Pulham', '2016-01-01') is None

    def test_missing_dob_matches_on_name(self):
        d = icr._match_existing_dependent(self.DEPS, 'river', 'pulham', '2018-09-09')
        assert d and d['id'] == 'd2'

    def test_unknown_kid_no_match(self):
        assert icr._match_existing_dependent(self.DEPS, 'New', 'Kid', '2015-04-01') is None


# ── _existing_org_student_by_name_dob (re-registration guard) ────────────────

def _name_dob_lookup(user_rows, link_rows=(), first='Zach', last='Barlow', dob='2009-10-06'):
    admin = _FakeAdmin({'users': list(user_rows), 'parent_student_links': list(link_rows)})
    return icr._existing_org_student_by_name_dob(admin, 'org1', 'parent1', first, last, dob)


@pytest.mark.unit
class TestExistingOrgStudentByNameDob:
    ORIGINAL = {'id': 'orig', 'role': 'org_managed', 'org_role': 'student',
                'organization_id': 'org1', 'is_dependent': False,
                'first_name': 'Zach', 'last_name': 'Barlow', 'date_of_birth': '2009-10-06'}

    def test_matches_org_student_by_name_and_dob(self):
        # The Barlow pattern: parent re-enters a kid who already has an org account.
        assert _name_dob_lookup([self.ORIGINAL])['id'] == 'orig'

    def test_case_insensitive_name(self):
        assert _name_dob_lookup([self.ORIGINAL], first='zach', last='barlow')['id'] == 'orig'

    def test_dob_mismatch_no_match(self):
        assert _name_dob_lookup([self.ORIGINAL], dob='2010-01-01') is None

    def test_no_dob_provided_no_match(self):
        # Without a DOB the match is too weak to auto-attach, so it must refuse.
        assert _name_dob_lookup([self.ORIGINAL], dob=None) is None

    def test_dependent_is_skipped(self):
        # Dependents are handled by _match_existing_dependent against the parent's own.
        dep = {**self.ORIGINAL, 'is_dependent': True}
        assert _name_dob_lookup([dep]) is None

    def test_non_student_skipped(self):
        parent = {**self.ORIGINAL, 'org_role': 'parent'}
        assert _name_dob_lookup([parent]) is None

    def test_linked_to_other_parent_refuses(self):
        assert _name_dob_lookup([self.ORIGINAL],
                                link_rows=[{'parent_user_id': 'someone-else'}]) is None

    def test_linked_to_same_parent_ok(self):
        assert _name_dob_lookup([self.ORIGINAL],
                                link_rows=[{'parent_user_id': 'parent1'}])['id'] == 'orig'


# ── _existing_household_for_parent (no duplicate households on re-registration) ─

@pytest.mark.unit
class TestExistingHouseholdForParent:
    def test_reuses_household_the_parent_guards(self):
        admin = _FakeAdmin({'household_members': [{'household_id': 'h1'}],
                            'households': [{'id': 'h1', 'organization_id': 'org1'}]})
        assert icr._existing_household_for_parent(admin, 'org1', 'parent1') == 'h1'

    def test_none_when_parent_has_no_household(self):
        admin = _FakeAdmin({'household_members': [], 'households': []})
        assert icr._existing_household_for_parent(admin, 'org1', 'parent1') is None

    def test_falls_back_to_primary_contact_household(self):
        # No guardian membership row, but the parent is a household's primary contact.
        admin = _FakeAdmin({'household_members': [], 'households': [{'id': 'h2'}]})
        assert icr._existing_household_for_parent(admin, 'org1', 'parent1') == 'h2'


# ── /login platform-role guardrails ──────────────────────────────────────────

@pytest.fixture
def client():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(icr.bp)
    return app.test_client()


_INVITE = ({'organization': {'id': 'org1', 'name': 'iCreate', 'slug': 'icreate'}}, None)


def _login(client, user, regs=()):
    admin = _FakeAdmin({'users': [user], 'icreate_registrations': list(regs)})
    with patch('routes.icreate_registration._admin', return_value=admin), \
         patch('routes.icreate_registration._load_icreate_invite', return_value=_INVITE), \
         patch('routes.icreate_registration._password_ok', return_value=True):
        resp = client.post('/api/icreate/login',
                           json={'code': 'c', 'email': 'a@x.com', 'password': 'pw'})
    return resp, admin


@pytest.mark.unit
class TestLoginPlatformGuardrails:
    def test_platform_student_refused(self, client):
        resp, admin = _login(client, {'id': 'u1', 'role': 'student', 'org_role': None,
                                      'org_roles': None, 'organization_id': None})
        assert resp.status_code == 409
        assert 'student' in resp.get_json()['error'].lower()
        assert not admin.updates and not admin.inserts

    def test_platform_advisor_refused(self, client):
        resp, admin = _login(client, {'id': 'u1', 'role': 'advisor', 'org_role': None,
                                      'org_roles': None, 'organization_id': None})
        assert resp.status_code == 409
        assert not admin.updates

    def test_platform_parent_attached(self, client):
        resp, admin = _login(client, {'id': 'u1', 'role': 'parent', 'org_role': None,
                                      'org_roles': None, 'organization_id': None,
                                      'first_name': 'Pat', 'last_name': 'Parent'})
        assert resp.status_code == 200
        attach = [p for t, p in admin.updates if t == 'users']
        assert attach and attach[0]['org_role'] == 'parent'
        assert attach[0]['organization_id'] == 'org1'


# ── sis_service.attach_student_to_org ────────────────────────────────────────

@pytest.mark.unit
class TestAttachStudentToOrg:
    def _run(self, user, links=()):
        admin = _FakeAdmin({'users': [user] if user else [],
                            'parent_student_links': list(links)})
        with patch('services.sis_service._admin', return_value=admin):
            ok = sis_service.attach_student_to_org('org1', 'k1', guardian_ids=['g1'])
        return ok, admin

    def test_platform_student_fully_attached(self):
        ok, admin = self._run({'id': 'k1', 'role': 'student', 'org_role': None,
                               'organization_id': None, 'is_dependent': False})
        assert ok
        user_updates = [p for t, p in admin.updates if t == 'users']
        assert user_updates[0] == {'organization_id': 'org1', 'role': 'org_managed',
                                   'org_role': 'student', 'org_roles': ['student']}
        assert any(t == 'parent_student_links' for t, _ in admin.inserts)

    def test_dependent_gets_org_only_and_no_link(self):
        ok, admin = self._run({'id': 'k1', 'role': 'student', 'org_role': None,
                               'organization_id': None, 'is_dependent': True})
        assert ok
        user_updates = [p for t, p in admin.updates if t == 'users']
        assert user_updates[0] == {'organization_id': 'org1'}
        assert not any(t == 'parent_student_links' for t, _ in admin.inserts)

    def test_other_org_refused(self):
        ok, admin = self._run({'id': 'k1', 'role': 'org_managed', 'org_role': 'student',
                               'organization_id': 'org2', 'is_dependent': False})
        assert not ok and not admin.updates

    def test_non_student_refused(self):
        ok, admin = self._run({'id': 'k1', 'role': 'parent', 'org_role': None,
                               'organization_id': None, 'is_dependent': False})
        assert not ok and not admin.updates

    def test_existing_link_not_duplicated(self):
        ok, admin = self._run({'id': 'k1', 'role': 'student', 'org_role': None,
                               'organization_id': None, 'is_dependent': False},
                              links=[{'id': 'l1'}])
        assert ok
        assert not any(t == 'parent_student_links' for t, _ in admin.inserts)
