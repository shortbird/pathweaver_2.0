"""
Masquerade shows what the TARGET sees — including the 403s.

Every admin decorator used to authorize `get_actual_admin_id()`, i.e. the admin
behind the session, while the app around it rendered as the target. The two
identities disagreed in exactly the cases masquerade exists to investigate: a
superadmin viewing as a campus coordinator loaded org settings the coordinator
gets a 403 on, so the SIS class editor showed her a room dropdown she could
never actually get (iCreate, 2026-08-18). The tool reported success on a screen
that was broken for its user.

These tests mint real masquerade JWTs — the decorators resolve them through the
genuine session_manager path, so a regression here fails rather than passes.
"""

from unittest.mock import Mock, patch

import pytest


ADMIN = 'admin-superadmin-1'
COORDINATOR = 'katrine-coordinator-1'
STUDENT = 'student-1'


def _users_client(rows_by_id):
    """Admin Supabase client whose `users` lookups answer per requested id.

    The decorators reach for one of three shapes — .eq('id', x).execute() (list),
    .eq('id', x).single().execute() (row), .in_('id', [...]).execute() (list) —
    so the fake tracks which ids were asked for and which shape to hand back.
    """
    client = Mock()
    table = Mock()
    asked = {'ids': [], 'single': False}

    def _eq(column, value):
        if column == 'id':
            asked['ids'] = [value]
        return table

    def _in(column, values):
        if column == 'id':
            asked['ids'] = list(values)
        return table

    def _single():
        asked['single'] = True
        return table

    def _execute():
        rows = [rows_by_id[i] for i in asked['ids'] if i in rows_by_id]
        if asked['single']:
            asked['single'] = False
            return Mock(data=(rows[0] if rows else None), count=len(rows))
        return Mock(data=rows, count=len(rows))

    table.select.return_value = table
    table.limit.return_value = table
    table.order.return_value = table
    table.range.return_value = table
    table.is_.return_value = table
    table.update.return_value = table
    table.insert.return_value = table
    table.like.return_value = table
    table.eq.side_effect = _eq
    table.in_.side_effect = _in
    table.single.side_effect = _single
    table.execute.side_effect = _execute
    client.table.return_value = table
    return client


SUPERADMIN_ROW = {'id': ADMIN, 'role': 'superadmin', 'org_role': None, 'org_roles': None,
                  'is_org_admin': False, 'organization_id': None, 'email': 'a@b.c'}
COORDINATOR_ROW = {'id': COORDINATOR, 'role': 'org_managed', 'org_role': 'campus_coordinator',
                   'org_roles': ['campus_coordinator'], 'is_org_admin': False,
                   'organization_id': 'org-1', 'email': 'k@icreate.test'}
STUDENT_ROW = {'id': STUDENT, 'role': 'student', 'org_role': None, 'org_roles': None,
               'is_org_admin': False, 'organization_id': None, 'email': 's@b.c'}

ALL_ROWS = {ADMIN: SUPERADMIN_ROW, COORDINATOR: COORDINATOR_ROW, STUDENT: STUDENT_ROW}


@pytest.fixture
def masquerade_headers(app):
    """Bearer headers for a real masquerade token (admin viewing as target)."""
    from utils.session_manager import session_manager

    def _headers(admin_id, target_id):
        with app.test_request_context():
            token = session_manager.generate_masquerade_token(admin_id, target_id)
        return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

    return _headers


@pytest.fixture
def admin_headers(app):
    from utils.session_manager import session_manager

    def _headers(user_id):
        with app.test_request_context():
            token = session_manager.generate_access_token(user_id)
        return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

    return _headers


@pytest.mark.unit
class TestMasqueradeAuthorizesTheTarget:

    def test_you_see_the_coordinator_view_of_org_settings_not_yours(self, client, masquerade_headers):
        """The bug that started this, from the other side: the endpoint now
        answers a coordinator, and what comes back while viewing her is HER
        payload — prices redacted — not the admin's."""
        service = Mock()
        service.get_organization_dashboard_data.return_value = {'organization': {
            'id': 'org-1', 'feature_flags': {'sis_settings': {'rooms': [{'name': 'Kitchen'}]}},
        }}
        with patch('database.get_supabase_admin_client', return_value=_users_client(ALL_ROWS)), \
             patch('services.sis_service.caller_sees_pay', return_value=False), \
             patch('routes.admin.organization_management.OrganizationService', return_value=service):
            resp = client.get('/api/admin/organizations/org-1',
                              headers=masquerade_headers(ADMIN, COORDINATOR))
        assert resp.status_code == 200
        # Her payload, not the admin's: the prices are left out for her, and the
        # session viewing her asks for them left out too.
        assert service.get_organization_dashboard_data.call_args.kwargs['include_finance'] is False
        assert resp.get_json()['organization']['feature_flags']['sis_settings']['rooms']

    def test_an_org_admin_only_route_403s_while_viewing_a_coordinator(self, client, masquerade_headers):
        """Org SETUP is still org_admin-only, and viewing her says so."""
        with patch('database.get_supabase_admin_client', return_value=_users_client(ALL_ROWS)):
            resp = client.get('/api/admin/organizations/org-1/setup-status',
                              headers=masquerade_headers(ADMIN, COORDINATOR))
        assert resp.status_code == 403

    def test_the_same_route_answers_the_admin_alone(self, client, admin_headers):
        with patch('database.get_supabase_admin_client', return_value=_users_client(ALL_ROWS)), \
             patch('routes.admin.org_setup.get_supabase_admin_client',
                   return_value=_users_client(ALL_ROWS)):
            resp = client.get('/api/admin/organizations/org-1/setup-status',
                              headers=admin_headers(ADMIN))
        assert resp.status_code != 403

    def test_control_plane_history_still_answers_the_real_caller(self, client, masquerade_headers):
        """/history is the tool itself, checked against the admin holding the
        session, so it keeps working from inside one."""
        fake = _users_client(ALL_ROWS)
        with patch('database.get_supabase_admin_client', return_value=fake), \
             patch('routes.admin.masquerade.get_supabase_admin_client', return_value=fake):
            resp = client.get('/api/admin/masquerade/history',
                              headers=masquerade_headers(ADMIN, STUDENT))
        assert resp.status_code == 200

    def test_admin_user_management_is_closed_while_viewing_a_student(self, client, masquerade_headers):
        with patch('database.get_supabase_admin_client', return_value=_users_client(ALL_ROWS)):
            resp = client.get('/api/admin/organizations/org-1/setup-status',
                              headers=masquerade_headers(ADMIN, STUDENT))
        assert resp.status_code == 403


@pytest.mark.unit
class TestMasqueradeControlPlaneStaysReachable:
    """An admin must never be stranded inside an account."""

    def test_status_reports_the_session(self, client, masquerade_headers):
        fake = _users_client(ALL_ROWS)
        with patch('database.get_supabase_admin_client', return_value=fake), \
             patch('routes.admin.masquerade.get_supabase_admin_client', return_value=fake):
            resp = client.get('/api/admin/masquerade/status',
                              headers=masquerade_headers(ADMIN, STUDENT))
        assert resp.status_code == 200
        assert resp.get_json()['is_masquerading'] is True

    def test_exit_works_from_inside_a_session(self, client, masquerade_headers):
        fake = _users_client(ALL_ROWS)
        with patch('database.get_supabase_admin_client', return_value=fake), \
             patch('routes.admin.masquerade.get_supabase_admin_client', return_value=fake):
            resp = client.post('/api/admin/masquerade/exit',
                               headers=masquerade_headers(ADMIN, STUDENT))
        assert resp.status_code == 200

    def test_can_switch_targets_without_exiting_first(self, client, masquerade_headers):
        fake = _users_client(ALL_ROWS)
        with patch('database.get_supabase_admin_client', return_value=fake), \
             patch('routes.admin.masquerade.get_supabase_admin_client', return_value=fake):
            resp = client.post(f'/api/admin/masquerade/{COORDINATOR}',
                               headers=masquerade_headers(ADMIN, STUDENT), json={'reason': 'support'})
        assert resp.status_code == 200
        assert resp.get_json()['target_user']['id'] == COORDINATOR


@pytest.mark.unit
class TestAuthorizingIdentity:

    def test_is_the_target_while_masquerading(self, app):
        from utils.auth.decorators import authorizing_user_id
        from utils.session_manager import session_manager
        with app.test_request_context():
            token = session_manager.generate_masquerade_token(ADMIN, COORDINATOR)
        with app.test_request_context(headers={'Authorization': f'Bearer {token}'}):
            assert authorizing_user_id() == COORDINATOR

    def test_is_the_caller_otherwise(self, app):
        from utils.auth.decorators import authorizing_user_id
        from utils.session_manager import session_manager
        with app.test_request_context():
            token = session_manager.generate_access_token(ADMIN)
        with app.test_request_context(headers={'Authorization': f'Bearer {token}'}):
            assert authorizing_user_id() == ADMIN

    def test_superadmin_bypass_does_not_leak_through_a_masquerade(self, app):
        """caller_is_superadmin() kept the admin's powers alive inside the
        session — an observer surface behaved as the admin, not the observer."""
        from utils.auth.decorators import caller_is_superadmin
        from utils.session_manager import session_manager
        supabase = _users_client(ALL_ROWS)
        with app.test_request_context():
            token = session_manager.generate_masquerade_token(ADMIN, STUDENT)
        with app.test_request_context(headers={'Authorization': f'Bearer {token}'}):
            assert caller_is_superadmin(supabase, STUDENT) is False

    def test_acting_as_a_dependent_keeps_the_parent_identity(self, app):
        """Acting-as is not masquerade: a parent works inside their child's
        account with their OWN authority, and those flows depend on it."""
        from utils.auth.decorators import authorizing_user_id
        from utils.session_manager import session_manager
        with app.test_request_context():
            token = session_manager.generate_acting_as_token('parent-1', 'child-1')
        with app.test_request_context(headers={'Authorization': f'Bearer {token}'}):
            assert authorizing_user_id() == 'parent-1'


@pytest.mark.unit
class TestAccessLogNamesTheHumanBehindTheSession:

    def test_disclosure_row_records_the_masquerading_admin(self, app):
        from utils.access_logger import AccessLogger
        from utils.session_manager import session_manager

        inserted = {}
        admin_client = Mock()
        table = Mock()
        admin_client.table.return_value = table
        table.insert.side_effect = lambda row: (inserted.update(row) or Mock(execute=Mock()))

        with app.test_request_context():
            token = session_manager.generate_masquerade_token(ADMIN, COORDINATOR)
        with app.test_request_context(headers={'Authorization': f'Bearer {token}'}), \
             patch('utils.access_logger.get_supabase_admin_singleton', return_value=admin_client), \
             patch.object(AccessLogger, '_lookup_accessor_role', return_value='advisor'):
            AccessLogger.log_student_data_access(
                student_id='stu-9', accessor_id=COORDINATOR, data_type='grades')

        assert inserted['accessor_id'] == COORDINATOR
        assert inserted['data_accessed']['masquerading_admin_id'] == ADMIN
