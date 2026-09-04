"""Guard tests for POST /api/admin/organizations/<org>/users/<id>/status (blocks P2).

The org-scoped account switch must refuse: cross-org targets, superadmins,
other org admins (unless the caller is superadmin), and self. Calls the
undecorated view (__wrapped__) in a request context with the admin client
mocked, following test_admin_update_user_profile_scoping.py.
"""

from unittest.mock import Mock, patch

import pytest
from flask import Flask

ADMIN_ID = 'admin-1'
TARGET_ID = 'target-1'
ORG = 'org-1'


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    return app


def _mock_supabase(target_row):
    supabase = Mock()
    table = supabase.table.return_value
    maybe = table.select.return_value.eq.return_value.maybe_single.return_value
    maybe.execute.return_value = Mock(data=target_row)
    table.update.return_value.eq.return_value.eq.return_value.execute.return_value = Mock(
        data=[{'id': TARGET_ID}]
    )
    return supabase


def _call(app, target_row, *, body=None, caller_org=ORG, is_superadmin=False,
          org_id=ORG, target_id=TARGET_ID):
    from routes.admin.org_member_status import set_member_status

    supabase = _mock_supabase(target_row)
    with app.test_request_context(json=body or {'status': 'disabled'}), \
         patch('routes.admin.org_member_status.get_supabase_admin_client', return_value=supabase), \
         patch('routes.admin.org_member_status.AdminAuditService') as audit:
        # Unwrap the whole stack: @require_relationship_to (SEC-10) sits above
        # the view now, so a single __wrapped__ lands on the gate.
        view = set_member_status
        while hasattr(view, '__wrapped__'):
            view = view.__wrapped__
        result = view(ADMIN_ID, caller_org, is_superadmin, org_id, target_id)
    return result, supabase, audit


def _student(org=ORG, status='active'):
    return {'role': 'org_managed', 'org_role': 'student', 'org_roles': ['student'],
            'is_org_admin': False, 'organization_id': org, 'status': status,
            'display_name': 'A Student'}


def test_disables_a_student_in_own_org(app):
    (body, code), supabase, audit = _call(app, _student())
    assert code == 200
    assert body.get_json()['status'] == 'disabled'
    supabase.table.return_value.update.assert_called_once()
    audit.return_value.log_action.assert_called_once()


def test_reenables_a_disabled_student(app):
    (body, code), _, _ = _call(app, _student(status='disabled'), body={'status': 'active'})
    assert code == 200
    assert body.get_json()['status'] == 'active'


def test_refuses_cross_org_caller(app):
    (_, code), supabase, _ = _call(app, _student(), caller_org='other-org')
    assert code == 403
    supabase.table.return_value.update.assert_not_called()


def test_refuses_target_outside_named_org(app):
    (_, code), supabase, _ = _call(app, _student(org='other-org'))
    assert code == 404
    supabase.table.return_value.update.assert_not_called()


def test_refuses_superadmin_target(app):
    row = _student()
    row['role'] = 'superadmin'
    (_, code), supabase, _ = _call(app, row)
    assert code == 403
    supabase.table.return_value.update.assert_not_called()


def test_refuses_org_admin_target_for_org_admin_caller(app):
    row = _student()
    row['is_org_admin'] = True
    row['org_role'] = 'org_admin'
    (_, code), supabase, _ = _call(app, row)
    assert code == 403
    supabase.table.return_value.update.assert_not_called()


def test_superadmin_may_change_an_org_admin(app):
    row = _student()
    row['is_org_admin'] = True
    row['org_role'] = 'org_admin'
    (_, code), _, _ = _call(app, row, is_superadmin=True, caller_org=None)
    assert code == 200


def test_refuses_self(app):
    (body, code), supabase, _ = _call(app, _student(), target_id=ADMIN_ID)
    assert code == 400
    supabase.table.return_value.update.assert_not_called()


def test_refuses_invalid_status_value(app):
    (_, code), supabase, _ = _call(app, _student(), body={'status': 'banned'})
    assert code == 400
    supabase.table.return_value.update.assert_not_called()


def test_noop_when_already_in_state(app):
    (body, code), supabase, audit = _call(app, _student(status='disabled'))
    assert code == 200
    supabase.table.return_value.update.assert_not_called()
    audit.return_value.log_action.assert_not_called()
