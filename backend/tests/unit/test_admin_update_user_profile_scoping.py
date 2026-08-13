"""Org-scoping tests for PUT /api/admin/users/<id>.

This rule used to be defined twice — admin_core and admin/user_management —
and admin_core's blueprint registers first, so admin_core's @require_admin
(superadmin-only) view was the one Flask dispatched to and the org-scoped
@require_school_admin view was unreachable. The org People tab saves the
profile BEFORE it saves roles, so that 403 aborted the whole save and an org
admin could never promote anyone to org_admin.

Both copies are now merged into admin/user_management.update_user_profile:
superadmins edit anyone, org admins are scoped to their own organization.
test_no_duplicate_routes.py keeps the shadowing from coming back.

Calls the undecorated view (functools.wraps -> __wrapped__) in a request
context with the admin client mocked.
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


def _mock_supabase(rows):
    """select->eq->limit->execute returns each entry of `rows` in turn."""
    supabase = Mock()
    table = supabase.table.return_value
    table.select.return_value.eq.return_value.limit.return_value.execute.side_effect = [
        Mock(data=[row] if row else []) for row in rows
    ]
    table.update.return_value.eq.return_value.execute.return_value = Mock(
        data=[{'id': TARGET_ID}]
    )
    return supabase


def _call(app, rows, body):
    from routes.admin.user_management import update_user_profile

    supabase = _mock_supabase(rows)
    with app.test_request_context(json=body), \
         patch('routes.admin.user_management.get_supabase_admin_client', return_value=supabase):
        result = update_user_profile.__wrapped__(ADMIN_ID, TARGET_ID)
    return result, supabase


def test_org_admin_can_edit_user_in_own_org(app):
    """THE regression: the profile save must succeed so the role save can follow."""
    admin = {'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': ['org_admin'],
             'organization_id': 'org-1'}
    target = {'organization_id': 'org-1'}
    resp, supabase = _call(app, [admin, target], {'first_name': 'Ada'})

    _body, status = resp
    assert status == 200
    assert supabase.table.return_value.update.call_args[0][0] == {'first_name': 'Ada'}


def test_org_admin_cannot_edit_user_in_another_org(app):
    admin = {'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': ['org_admin'],
             'organization_id': 'org-1'}
    target = {'organization_id': 'org-2'}
    resp, supabase = _call(app, [admin, target], {'first_name': 'Ada'})

    _body, status = resp
    assert status == 403
    supabase.table.return_value.update.assert_not_called()


def test_org_admin_cannot_edit_platform_user(app):
    """A user with no organization (incl. superadmins) is out of an org admin's reach."""
    admin = {'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': ['org_admin'],
             'organization_id': 'org-1'}
    target = {'organization_id': None}
    resp, supabase = _call(app, [admin, target], {'first_name': 'Ada'})

    _body, status = resp
    assert status == 403
    supabase.table.return_value.update.assert_not_called()


def test_org_admin_without_organization_is_rejected(app):
    admin = {'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': ['org_admin'],
             'organization_id': None}
    target = {'organization_id': None}
    resp, supabase = _call(app, [admin, target], {'first_name': 'Ada'})

    _body, status = resp
    assert status == 403
    supabase.table.return_value.update.assert_not_called()


def test_superadmin_skips_the_org_check(app):
    """Superadmin must not consume a target lookup — it edits across tenants."""
    admin = {'role': 'superadmin', 'org_role': None, 'org_roles': None,
             'organization_id': None}
    resp, supabase = _call(app, [admin], {'first_name': 'Ada'})

    _body, status = resp
    assert status == 200
    assert supabase.table.return_value.update.call_args[0][0] == {'first_name': 'Ada'}


def test_unknown_target_user_404s(app):
    admin = {'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': ['org_admin'],
             'organization_id': 'org-1'}
    resp, supabase = _call(app, [admin, None], {'first_name': 'Ada'})

    _body, status = resp
    assert status == 404
    supabase.table.return_value.update.assert_not_called()


def test_blank_email_still_stored_as_null(app):
    """Pre-existing behaviour must survive the gate change (dependents have no email)."""
    admin = {'role': 'superadmin', 'org_role': None, 'org_roles': None,
             'organization_id': None}
    _resp, supabase = _call(app, [admin], {'email': '   '})

    assert supabase.table.return_value.update.call_args[0][0] == {'email': None}
