"""
The People capabilities that moved from the web organization console to the
SIS console (2026-10-15), and the route changes that came with them.

  * Teacher assignments and parent links (routes/admin/org_connections.py)
    are front office now: a campus coordinator runs them, a teacher does not.
  * Bulk username accounts join the one-at-a-time create-username route in
    the front office.
  * Every invitation route checks the URL's org against the caller's. Until
    this change none did, so an admin of one school could read another
    school's invitations and join links, or invite themselves into it.
  * A teacher who is also a parent can be given a student; the check read the
    primary role only.
"""

from unittest.mock import Mock, patch

import pytest
from flask import Flask



def _chain(data):
    """A table mock whose every builder call returns itself."""
    t = Mock()
    for name in ('select', 'eq', 'neq', 'in_', 'is_', 'not_', 'order', 'limit', 'single',
                 'maybe_single', 'like', 'update', 'insert', 'delete'):
        getattr(t, name).return_value = t
    t.not_ = t
    t.execute.return_value = Mock(data=data)
    return t


def _caller_client(role_row):
    client = Mock()
    client.table.return_value = _chain(role_row)
    return client


def _route_client(data=None):
    client = Mock()
    client.table.return_value = _chain([] if data is None else data)
    client.rpc.return_value = _chain(None)
    return client


COORDINATOR = {'id': 'kate', 'role': 'org_managed', 'org_role': 'campus_coordinator',
               'org_roles': ['campus_coordinator'], 'is_org_admin': False,
               'organization_id': 'org-1', 'email': 'kate@icreate.test'}
TEACHER = {'id': 'tess', 'role': 'org_managed', 'org_role': 'advisor',
           'org_roles': ['advisor'], 'is_org_admin': False,
           'organization_id': 'org-1', 'email': 'tess@icreate.test'}

# What the decorators answer when the caller's role is not enough.
GATE_REFUSAL = 'Organization admin access required'

CONNECTION_ROUTES = [
    ('get', '/api/admin/organizations/org-1/students/advisor-assignments'),
    ('get', '/api/admin/organizations/org-1/advisors/t-1/students'),
    ('post', '/api/admin/organizations/org-1/advisors/t-1/students'),
    ('delete', '/api/admin/organizations/org-1/advisors/t-1/students/s-1'),
    ('get', '/api/admin/organizations/org-1/parent-connections/links'),
    ('delete', '/api/admin/organizations/org-1/parent-connections/links/l-1'),
]


@pytest.mark.unit
class TestWhoRunsTheRelationships:

    @pytest.mark.parametrize('method,url', CONNECTION_ROUTES)
    def test_a_campus_coordinator_gets_in(self, client, auth_headers, mock_verify_token, method, url):
        with patch('database.get_supabase_admin_client', return_value=_caller_client(COORDINATOR)), \
             patch('routes.admin.org_connections.get_supabase_admin_client', return_value=_route_client()):
            resp = getattr(client, method)(url, headers=auth_headers, json={'student_id': 's-1'})
        # The handler may still refuse the empty mock data (a 403 "Student not
        # in this organization"); the gate is what is under test.
        assert GATE_REFUSAL not in resp.get_data(as_text=True)

    @pytest.mark.parametrize('method,url', CONNECTION_ROUTES)
    def test_a_teacher_does_not(self, client, auth_headers, mock_verify_token, method, url):
        with patch('database.get_supabase_admin_client', return_value=_caller_client(TEACHER)), \
             patch('routes.admin.org_connections.get_supabase_admin_client', return_value=_route_client()):
            resp = getattr(client, method)(url, headers=auth_headers, json={'student_id': 's-1'})
        assert resp.status_code == 403
        assert GATE_REFUSAL in resp.get_data(as_text=True)

    def test_another_schools_relationships_stay_closed(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client', return_value=_caller_client(COORDINATOR)), \
             patch('routes.admin.org_connections.get_supabase_admin_client', return_value=_route_client()):
            resp = client.get('/api/admin/organizations/org-2/students/advisor-assignments',
                              headers=auth_headers)
        assert resp.status_code == 404

    def test_a_coordinator_can_make_many_username_students(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client', return_value=_caller_client(COORDINATOR)), \
             patch('routes.admin.bulk_import.get_supabase_admin_client', return_value=_route_client()):
            resp = client.post('/api/admin/organizations/org-1/users/bulk-create-username',
                               headers=auth_headers, json={'students': []})
        assert resp.status_code == 400  # past the gate, refused for the empty list

    def test_new_passwords_stay_with_an_org_admin(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client', return_value=_caller_client(COORDINATOR)):
            resp = client.post('/api/admin/organizations/org-1/users/bulk-reset-passwords',
                               headers=auth_headers, json={'user_ids': ['s-1']})
        assert resp.status_code == 403


INVITATION_ROUTES = [
    ('get', '/invitations'),
    ('get', '/invitations/links'),
    ('post', '/invitations'),
    ('post', '/invitations/link'),
    ('delete', '/invitations/i-1'),
]


@pytest.mark.unit
class TestInvitationsStayInTheirOwnSchool:

    @pytest.mark.parametrize('method,path', INVITATION_ROUTES)
    def test_another_schools_url_is_not_found(self, client, auth_headers, mock_verify_token, method, path):
        route_db = _route_client()
        with patch('database.get_supabase_admin_client', return_value=_caller_client(COORDINATOR)), \
             patch('routes.admin.user_invitations.get_supabase_admin_client', return_value=route_db):
            resp = getattr(client, method)(f'/api/admin/organizations/org-2{path}', headers=auth_headers,
                                           json={'email': 'me@x.test', 'role': 'student'})
        assert resp.status_code == 404
        route_db.table.assert_not_called()

    def test_her_own_schools_invitations_still_list(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client', return_value=_caller_client(COORDINATOR)), \
             patch('routes.admin.user_invitations.get_supabase_admin_client', return_value=_route_client()):
            resp = client.get('/api/admin/organizations/org-1/invitations?status=pending',
                              headers=auth_headers)
        assert resp.status_code == 200
        assert resp.get_json()['invitations'] == []

    def test_a_superadmin_may_name_any_school(self):
        from routes.admin.user_invitations import _other_org
        assert _other_org(None, True, 'org-2') is None


@pytest.fixture
def bare_app():
    a = Flask(__name__)
    a.config['TESTING'] = True
    return a


def _tables(**by_name):
    db = Mock()
    db.table.side_effect = lambda name: by_name[name]
    return db


@pytest.mark.unit
class TestAssigningATeacher:

    def _assign(self, app, advisor_row):
        from routes.admin.org_connections import assign_org_student_to_advisor
        users = _chain(None)
        users.execute.side_effect = [
            Mock(data=advisor_row),
            Mock(data={'id': 's-1', 'role': 'org_managed', 'org_role': 'student', 'organization_id': 'org-1'}),
        ]
        assignments = _chain([])
        assignments.execute.side_effect = [Mock(data=[]), Mock(data=[{'id': 'a-1'}])]
        db = _tables(users=users, advisor_student_assignments=assignments)
        with app.test_request_context(json={'student_id': 's-1'}), \
             patch('routes.admin.org_connections.get_supabase_admin_client', return_value=db):
            resp = assign_org_student_to_advisor.__wrapped__('kate', 'org-1', False, 'org-1', 't-1')
        return resp if isinstance(resp, tuple) else (resp, 200)

    def test_a_teacher_who_is_also_a_parent_can_be_given_a_student(self, bare_app):
        resp, status = self._assign(bare_app, {'id': 't-1', 'role': 'org_managed', 'org_role': 'parent',
                                          'org_roles': ['parent', 'advisor'], 'organization_id': 'org-1'})
        assert status == 200
        assert resp.get_json()['success'] is True

    def test_a_parent_who_does_not_teach_cannot(self, bare_app):
        resp, status = self._assign(bare_app, {'id': 't-1', 'role': 'org_managed', 'org_role': 'parent',
                                          'org_roles': ['parent'], 'organization_id': 'org-1'})
        assert status == 400


@pytest.mark.unit
class TestOneStudentsParents:

    def test_student_id_narrows_the_links_to_that_student(self, bare_app):
        from routes.admin.org_connections import get_org_parent_links
        users = _chain([{'id': 's-1'}, {'id': 's-2'}])
        links = _chain([])
        db = _tables(users=users, parent_student_links=links)
        with bare_app.test_request_context('/?student_id=s-2'), \
             patch('routes.admin.org_connections.get_supabase_admin_client', return_value=db):
            get_org_parent_links.__wrapped__('kate', 'org-1', False, 'org-1')
        links.in_.assert_called_once_with('student_user_id', ['s-2'])

    def test_a_student_from_elsewhere_reads_nothing(self, bare_app):
        from routes.admin.org_connections import get_org_parent_links
        users = _chain([{'id': 's-1'}])
        links = _chain([])
        db = _tables(users=users, parent_student_links=links)
        with bare_app.test_request_context('/?student_id=not-ours'), \
             patch('routes.admin.org_connections.get_supabase_admin_client', return_value=db):
            resp = get_org_parent_links.__wrapped__('kate', 'org-1', False, 'org-1')
        assert resp.get_json()['links'] == []
        links.in_.assert_not_called()
