"""Regression tests for PUT /api/admin/users/<id>/role (Sentry OPTIO-BACKEND-9/-A).

An org user (organization_id set) was given role 'org_admin', which the route
wrote straight into users.role — rejected by the users_role_check constraint
('org_admin' is only valid in org_role). A follow-up attempt with a direct role
left the stale org_role in place, tripping direct_role_no_org_role.

The route must translate roles for org users (role stays 'org_managed', the
requested role goes to org_role) and clear org_role when assigning a direct
platform role.

Calls the undecorated view (require_admin uses functools.wraps, so __wrapped__
is the raw function) inside a request context, with the admin client mocked.
"""

from unittest.mock import Mock, patch

import pytest
from flask import Flask

ADMIN_ID = 'admin-1'
TARGET_ID = 'target-1'


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    return app


def _mock_supabase(target_row, updated_row=None):
    """Admin client mock: select→eq→limit→execute yields target_row,
    update→eq→execute yields updated_row."""
    supabase = Mock()
    table = supabase.table.return_value
    table.select.return_value.eq.return_value.limit.return_value.execute.return_value = Mock(
        data=[target_row] if target_row else []
    )
    table.update.return_value.eq.return_value.execute.return_value = Mock(
        data=[updated_row if updated_row is not None else {'id': TARGET_ID}]
    )
    return supabase


def _call(app, target_row, body, updated_row=None):
    from routes.admin.user_management import update_user_role

    supabase = _mock_supabase(target_row, updated_row)
    with app.test_request_context(json=body), \
         patch('routes.admin.user_management.get_supabase_admin_client',
               return_value=supabase):
        result = update_user_role.__wrapped__(ADMIN_ID, TARGET_ID)
    return result, supabase


def _update_payload(supabase):
    return supabase.table.return_value.update.call_args[0][0]


def test_org_admin_for_org_user_goes_to_org_role(app):
    """THE regression: org user promoted to org_admin must keep role='org_managed'."""
    target = {'organization_id': 'org-1', 'role': 'org_managed', 'org_role': 'parent'}
    resp, supabase = _call(app, target, {'role': 'org_admin'})
    assert _update_payload(supabase) == {'role': 'org_managed', 'org_role': 'org_admin'}


def test_direct_role_for_org_user_goes_to_org_role(app):
    """Setting 'student' on an org user updates org_role, not the role column."""
    target = {'organization_id': 'org-1', 'role': 'org_managed', 'org_role': 'org_admin'}
    _, supabase = _call(app, target, {'role': 'student'})
    assert _update_payload(supabase) == {'role': 'org_managed', 'org_role': 'student'}


def test_org_admin_for_platform_user_is_rejected(app):
    """No organization -> org_admin is meaningless; must 400, not hit the DB."""
    target = {'organization_id': None, 'role': 'parent', 'org_role': None}
    resp, supabase = _call(app, target, {'role': 'org_admin'})
    body, status = resp
    assert status == 400
    supabase.table.return_value.update.assert_not_called()


def test_direct_role_clears_stale_org_role(app):
    """Second half of the regression: direct platform role must null org_role
    or the direct_role_no_org_role constraint rejects the row."""
    target = {'organization_id': None, 'role': 'org_managed', 'org_role': 'student'}
    _, supabase = _call(app, target, {'role': 'parent'})
    assert _update_payload(supabase) == {'role': 'parent', 'org_role': None}


def test_superadmin_promotion_clears_org_role_even_for_org_user(app):
    target = {'organization_id': 'org-1', 'role': 'org_managed', 'org_role': 'org_admin'}
    _, supabase = _call(app, target, {'role': 'superadmin'})
    assert _update_payload(supabase) == {'role': 'superadmin', 'org_role': None}


def test_org_managed_requires_organization(app):
    target = {'organization_id': None, 'role': 'student', 'org_role': None}
    resp, supabase = _call(app, target, {'role': 'org_managed'})
    body, status = resp
    assert status == 400
    supabase.table.return_value.update.assert_not_called()


def test_org_managed_defaults_missing_org_role_to_student(app):
    target = {'organization_id': 'org-1', 'role': 'student', 'org_role': None}
    _, supabase = _call(app, target, {'role': 'org_managed'})
    assert _update_payload(supabase) == {'role': 'org_managed', 'org_role': 'student'}


def test_unknown_target_user_404s(app):
    resp, supabase = _call(app, None, {'role': 'student'})
    body, status = resp
    assert status == 404
    supabase.table.return_value.update.assert_not_called()
