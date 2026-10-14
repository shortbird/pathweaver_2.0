"""Staff "Set up sign-in" for a parent-managed child profile (ticket cd61587c).

Mandie (org_admin, Apogee Cache Valley) could not give her school's managed
child profiles a login: only the parent could (dependents.py add-login), and
the staff Reset password answered 400 for a profile with no email and no
username. These check the new door:

  - the gate: the student's school's front office (and a superadmin) only;
  - the rule: managed profiles only, and never one that already signs in;
  - the write: a username and a password on the SAME account, nothing else
    touched, so the parent link, the work and the XP stay;
  - uniqueness inside the school, and the parent's in-app notice.
"""

from unittest.mock import Mock, patch

import pytest

ORG = 'org-1'
KID = 'kid-1'
PARENT = 'mum-1'


class _Query:
    """A chainable supabase-py stand-in for one table call."""

    def __init__(self, fake, table):
        self.fake, self.table, self.op, self.payload, self.filters = fake, table, 'select', None, []

    def _chain(self, *args, **kwargs):
        return self

    select = eq = limit = in_ = order = range = single = _chain

    def is_(self, column, value):
        self.filters.append(('is', column, value))
        return self

    @property
    def not_(self):
        return self

    def update(self, payload):
        self.op, self.payload = 'update', payload
        return self

    def insert(self, payload):
        self.op, self.payload = 'insert', payload
        return self

    def execute(self):
        self.fake.calls.append((self.table, self.op, self.payload, list(self.filters)))
        if self.op == 'update':
            return Mock(data=[{'id': KID}] if self.fake.claim_ok else [])
        return Mock(data=self.fake.rows.get(self.table, []))


class FakeClient:
    def __init__(self, profile=None, auth_email='dependent_x@optio-internal-placeholder.local',
                 claim_ok=True):
        self.rows = {
            'users': [profile] if profile else [],
            'organizations': [{'slug': 'apogee-cv', 'name': 'Apogee Cache Valley'}],
        }
        self.calls = []
        self.claim_ok = claim_ok
        self.auth = Mock()
        self.auth.admin.get_user_by_id.return_value = Mock(user=Mock(email=auth_email))

    def table(self, name):
        return _Query(self, name)

    def updates(self, table='users'):
        return [c for c in self.calls if c[0] == table and c[1] == 'update']


def _managed(**overrides):
    row = {'id': KID, 'first_name': 'Ava', 'last_name': 'Watson', 'display_name': 'Ava Watson',
           'username': None, 'email': None, 'organization_id': ORG, 'is_dependent': True,
           'managed_by_parent_id': PARENT}
    row.update(overrides)
    return row


def _setup(client, username=None, taken=None):
    from services import student_sign_in_service as svc
    with patch.object(svc, 'taken_usernames', return_value=set(taken or ())), \
         patch('services.notification_service.NotificationService') as ns:
        result = svc.setup(client, ORG, KID, 'admin-1', username=username)
    return result, ns


@pytest.mark.unit
class TestSetup:
    def test_gives_the_same_account_a_username_and_password(self):
        """Ticket cd61587c: before this, staff had no way to do it at all."""
        client = FakeClient(_managed())
        result, _ = _setup(client)
        assert result['username'] == 'avaw'
        assert result['password'] and result['login_url'] == '/login/apogee-cv'
        # The profile row gets the username and nothing else: no email on the
        # child, and the parent link, XP and data are not rewritten.
        (_, _, payload, filters), = client.updates()
        assert payload == {'username': 'avaw'}
        assert ('is', 'username', 'null') in filters
        # Same auth user, password set, placeholder confirmed so sign-in works.
        uid, attrs = client.auth.admin.update_user_by_id.call_args.args
        assert uid == KID
        assert attrs == {'password': result['password'], 'email_confirm': True}
        client.auth.admin.create_user.assert_not_called()

    def test_the_chosen_username_is_used(self):
        result, _ = _setup(FakeClient(_managed()), username='Ava.W')
        assert result['username'] == 'ava.w'

    def test_a_username_taken_in_the_school_is_refused_with_a_suggestion(self):
        from services.student_sign_in_service import SignInSetupError
        client = FakeClient(_managed())
        with pytest.raises(SignInSetupError) as err:
            _setup(client, username='avaw', taken={'avaw'})
        assert err.value.status == 409
        assert 'already used' in str(err.value) and 'avawatson' in str(err.value)
        assert client.updates() == []
        client.auth.admin.update_user_by_id.assert_not_called()

    def test_a_generated_username_skips_taken_ones(self):
        result, _ = _setup(FakeClient(_managed()), taken={'avaw'})
        assert result['username'] == 'avawatson'

    def test_the_parent_gets_an_in_app_notice_and_the_child_is_not_emailed(self):
        result, ns = _setup(FakeClient(_managed()))
        assert result['parent_notified'] is True
        kwargs = ns.return_value.create_notification.call_args.kwargs
        assert kwargs['user_id'] == PARENT
        assert 'Apogee Cache Valley set up sign-in for Ava Watson' == kwargs['title']
        assert result['password'] not in kwargs['message']

    def test_an_account_that_is_not_managed_is_refused(self):
        from services.student_sign_in_service import SignInSetupError
        client = FakeClient(_managed(is_dependent=False, email='teen@example.com'))
        with pytest.raises(SignInSetupError) as err:
            _setup(client)
        assert 'Only a profile a parent manages' in str(err.value)
        assert client.updates() == []

    def test_a_student_in_another_school_is_not_found(self):
        from services.student_sign_in_service import SignInSetupError
        client = FakeClient(_managed(organization_id='org-2'))
        with pytest.raises(SignInSetupError) as err:
            _setup(client)
        assert err.value.status == 404
        assert client.updates() == []

    def test_a_profile_that_already_has_a_username_is_refused(self):
        from services.student_sign_in_service import SignInSetupError
        with pytest.raises(SignInSetupError) as err:
            _setup(FakeClient(_managed(username='avaw')))
        assert err.value.status == 409

    def test_a_login_the_parent_already_added_is_not_overwritten(self):
        """add_dependent_login puts a real email on the auth user only."""
        from services.student_sign_in_service import SignInSetupError
        client = FakeClient(_managed(), auth_email='ava@family.example')
        with pytest.raises(SignInSetupError) as err:
            _setup(client)
        assert 'parent already set up a sign-in' in str(err.value)
        client.auth.admin.update_user_by_id.assert_not_called()

    def test_a_lost_race_writes_no_password(self):
        from services.student_sign_in_service import SignInSetupError
        client = FakeClient(_managed(), claim_ok=False)
        with pytest.raises(SignInSetupError):
            _setup(client)
        client.auth.admin.update_user_by_id.assert_not_called()

    def test_a_failed_password_write_gives_the_username_back(self):
        from services.student_sign_in_service import SignInSetupError
        client = FakeClient(_managed())
        client.auth.admin.update_user_by_id.side_effect = RuntimeError('gotrue down')
        with pytest.raises(SignInSetupError):
            _setup(client)
        assert client.updates()[-1][2] == {'username': None}


@pytest.mark.unit
class TestBulk:
    def test_each_student_gets_a_distinct_username_and_refusals_are_listed(self):
        from services import student_sign_in_service as svc
        profiles = {
            'kid-1': _managed(id='kid-1'),
            'kid-2': _managed(id='kid-2'),  # same name: needs a different username
            'kid-3': _managed(id='kid-3', is_dependent=False),
        }

        def fake_load(client, org_id, sid):
            return profiles[sid]

        client = FakeClient(_managed())
        with patch.object(svc, '_load_profile', side_effect=fake_load), \
             patch.object(svc, 'taken_usernames', return_value=set()), \
             patch('services.notification_service.NotificationService'):
            out = svc.setup_many(client, ORG, ['kid-1', 'kid-2', 'kid-3'], 'admin-1')
        assert [r['username'] for r in out['results']] == ['avaw', 'avawatson']
        assert all({'name', 'username', 'password'} <= set(r) for r in out['results'])
        assert [f['user_id'] for f in out['failed']] == ['kid-3']

    def test_an_empty_list_is_refused(self):
        from services import student_sign_in_service as svc
        with pytest.raises(svc.SignInSetupError):
            svc.setup_many(FakeClient(), ORG, [], 'admin-1')


# ── The gate ────────────────────────────────────────────────────────────────

def _caller(role_row):
    client = Mock()
    table = Mock()
    for chained in ('select', 'eq', 'limit', 'single', 'in_'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=role_row)
    client.table.return_value = table
    return client


def _row(role, org_role=None, org=ORG):
    return {'id': 'caller', 'role': role, 'org_role': org_role,
            'org_roles': [org_role] if org_role else None, 'is_org_admin': org_role == 'org_admin',
            'organization_id': org, 'email': 'c@school.test'}


SETUP_URL = f'/api/admin/organizations/{ORG}/users/{KID}/setup-sign-in'
BULK_URL = f'/api/admin/organizations/{ORG}/users/bulk-setup-sign-in'


@pytest.mark.unit
class TestGate:
    def _post(self, client, auth_headers, caller_row, url=SETUP_URL, body=None):
        # The relationship gate's own lookups are tested where it lives; here
        # it answers what it would: staff of the student's school, or nothing.
        same_school = caller_row['organization_id'] == ORG or caller_row['role'] == 'superadmin'
        with patch('database.get_supabase_admin_client', return_value=_caller(caller_row)), \
             patch('utils.auth.relationships.relationship_between',
                   return_value='org_staff' if same_school else None), \
             patch('routes.admin.organization_users.get_supabase_admin_client', return_value=Mock()), \
             patch('services.student_sign_in_service.setup',
                   return_value={'user_id': KID, 'username': 'avaw', 'password': '1234apple'}) as setup, \
             patch('services.student_sign_in_service.setup_many',
                   return_value={'results': [], 'failed': []}) as many:
            resp = client.post(url, headers=auth_headers, json=body or {})
        return resp, setup, many

    @pytest.mark.parametrize('role,org_role', [('org_managed', 'advisor'), ('org_managed', 'parent'),
                                               ('org_managed', 'student')])
    def test_a_teacher_parent_or_student_is_refused(self, client, auth_headers, mock_verify_token,
                                                     role, org_role):
        resp, setup, _ = self._post(client, auth_headers, _row(role, org_role))
        assert resp.status_code == 403
        setup.assert_not_called()

    def test_another_schools_admin_is_refused(self, client, auth_headers, mock_verify_token):
        resp, setup, many = self._post(client, auth_headers, _row('org_managed', 'org_admin', org='org-2'))
        assert resp.status_code == 403
        setup.assert_not_called()
        resp, _, many = self._post(client, auth_headers, _row('org_managed', 'org_admin', org='org-2'),
                                   url=BULK_URL, body={'user_ids': [KID]})
        assert resp.status_code == 403
        many.assert_not_called()

    @pytest.mark.parametrize('org_role', ['org_admin', 'campus_coordinator'])
    def test_the_schools_front_office_is_allowed(self, client, auth_headers, mock_verify_token, org_role):
        resp, setup, _ = self._post(client, auth_headers, _row('org_managed', org_role),
                                    body={'username': 'avaw'})
        assert resp.status_code == 200
        assert resp.get_json()['password'] == '1234apple'
        assert setup.call_args.args[1:3] == (ORG, KID)
        assert setup.call_args.kwargs['username'] == 'avaw'

    def test_a_superadmin_is_allowed_in_any_school(self, client, auth_headers, mock_verify_token):
        resp, setup, _ = self._post(client, auth_headers, _row('superadmin', org=None))
        assert resp.status_code == 200
        setup.assert_called_once()

    def test_bulk_for_the_front_office(self, client, auth_headers, mock_verify_token):
        resp, _, many = self._post(client, auth_headers, _row('org_managed', 'campus_coordinator'),
                                   url=BULK_URL, body={'user_ids': ['a', 'b']})
        assert resp.status_code == 200
        assert many.call_args.args[1:3] == (ORG, ['a', 'b'])

    def test_one_owner_per_route(self, app):
        adapter = app.url_map.bind('localhost')
        for url, method in ((SETUP_URL, 'POST'), (SETUP_URL, 'GET'), (BULK_URL, 'POST')):
            endpoint, _ = adapter.match(url, method=method)
            assert endpoint.startswith('organization_users.'), (url, endpoint)


@pytest.mark.unit
def test_the_roster_says_which_students_are_managed_profiles():
    """Ticket cd61587c: the record and the People page offer Set up sign-in
    from this flag. Before it, the roster could not tell a managed profile
    from a student whose sign-in was simply not shown."""
    from tests.test_sis_roster_one_table import ENROLLMENTS, HOUSEHOLDS, PROFILES, USERS
    from services import sis_service as svc
    users = [dict(u, is_dependent=(u['id'] == 'kid-a')) for u in USERS]
    with patch.object(svc, '_org_users', return_value=users), \
         patch.object(svc, '_enrollments_by_student', return_value=ENROLLMENTS), \
         patch.object(svc, '_household_by_user', return_value=HOUSEHOLDS), \
         patch.object(svc, 'is_placeholder_staff_email', return_value=False), \
         patch.object(svc, '_annotate_class_counts'), \
         patch.object(svc, '_archived_staff_ids', return_value=set()), \
         patch('services.sis_payment_profile.profiles_for_org', return_value=PROFILES), \
         patch.object(svc, 'sign_in_place'):
        rows = {r['student_id']: r for r in svc.get_roster(ORG)}
    assert rows['kid-a']['is_dependent'] is True
    assert rows['kid-b']['is_dependent'] is False
