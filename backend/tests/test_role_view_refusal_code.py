"""
A 403 caused by a "view as" role view says so: code 'role_view_active'.

Apogee Central Florida's org admin produced five Sentry 403s on
sis.optioeducation.com (GET /api/sis/dashboard, /api/sis/resources,
/api/sis/staff, /api/admin/organizations/:id/partner-offerings,
/setup-status): a console tab still held the admin /me while the cookie, set
from another tab by "Parent (my own family)", said parent. Every admin read
was refused with the same bare 403 a real parent gets, and the dashboard only
said "Failed to load dashboard". Tickets 0f573318 (Arete: "the school admin
button keeps going back to family") and 43fee34b (Treehouse: "Can't toggle
back to my admin account after I switch to parent mode") are the same view.

With the code, the web client (services/api.ts) ends the view and reloads the
console once. A real parent's refusal is unchanged: no code, nothing learned.
"""

from unittest.mock import Mock, patch

from flask import Flask, g

from middleware.error_handler import ErrorHandler
from utils.auth.decorators import require_role, require_org_admin, require_org_front_office

ADMIN_ROW = {
    'role': 'org_managed', 'org_role': 'org_admin',
    'org_roles': ['org_admin', 'parent'], 'is_org_admin': True,
    'organization_id': 'org-1', 'email': 'a@example.com',
}
PARENT_ROW = {
    'role': 'org_managed', 'org_role': 'parent',
    'org_roles': ['parent'], 'is_org_admin': False,
    'organization_id': 'org-1', 'email': 'p@example.com',
}


def _app(view_role=None):
    app = Flask(__name__)
    ErrorHandler(app)

    @app.before_request
    def _view():
        g._role_view = {'user_id': 'u-1', 'role': view_role} if view_role else None

    @app.route('/role')
    @require_role('org_admin', 'campus_coordinator', 'superadmin')
    def by_role(user_id):
        return {'ok': True}

    @app.route('/org-admin')
    @require_org_admin
    def by_org_admin(user_id, org_id, is_superadmin):
        return {'ok': True, 'org': org_id}

    @app.route('/front-office')
    @require_org_front_office
    def by_front_office(user_id, org_id, is_superadmin):
        return {'ok': True}

    return app


def _client_for(row):
    sb = Mock()
    q = sb.table.return_value.select.return_value.eq.return_value
    q.execute.return_value = Mock(data=[dict(row)])
    q.single.return_value.execute.return_value = Mock(data=dict(row))
    return sb


def _get(path, row, view_role=None):
    with patch('utils.auth.decorators.session_manager') as sm, \
         patch('utils.auth.decorators.authorizing_user_id', return_value='u-1'), \
         patch('database.get_supabase_admin_client', return_value=_client_for(row)):
        sm.get_effective_user_id.return_value = 'u-1'
        return _app(view_role).test_client().get(path)


PATHS = ['/role', '/org-admin', '/front-office']


def test_admin_narrowed_to_parent_gets_role_view_active():
    for path in PATHS:
        resp = _get(path, ADMIN_ROW, view_role='parent')
        assert resp.status_code == 403, path
        err = resp.get_json()['error']
        assert err['code'] == 'role_view_active', path
        # Same message as the plain refusal; only the code is new.
        assert err['message'] in ('Required role: org_admin, campus_coordinator, superadmin',
                                  'Organization admin access required'), path


def test_real_parent_gets_the_old_403_without_the_code():
    for path in PATHS:
        resp = _get(path, PARENT_ROW, view_role=None)
        assert resp.status_code == 403, path
        assert resp.get_json()['error']['code'] == 'AUTHORIZATION_ERROR', path


def test_real_parent_with_a_parent_view_still_gets_the_old_403():
    # The view narrowed nothing away that the stored row would have passed.
    for path in PATHS:
        resp = _get(path, PARENT_ROW, view_role='parent')
        assert resp.status_code == 403, path
        assert resp.get_json()['error']['code'] == 'AUTHORIZATION_ERROR', path


def test_admin_without_a_view_is_allowed():
    for path in PATHS:
        resp = _get(path, ADMIN_ROW, view_role=None)
        assert resp.status_code == 200, path
        assert resp.get_json()['ok'] is True
