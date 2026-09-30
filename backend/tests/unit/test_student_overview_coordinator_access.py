"""Guard: a campus coordinator may open a student's overview in their own org.

Tickets 71528c9f-a930-4653-b561-63c26e9ebecf and
430edcfe-1e72-4172-8ad1-932ddc2531b4 (Sentry): iCreate campus coordinators
(role 'org_managed', org_role 'campus_coordinator') got a 403 on
GET /api/advisor/student-overview/<student_id> from the SIS People page's
org student overview.

The route decorator already let STAFF_ROLES through. The refusal came from
`verify_advisor_access`, which accepted only superadmin, an effective role of
exactly 'org_admin' in the same org, or an advisor_student_assignments row. A
coordinator is an org admin minus the finances (utils/sis_roles.py), so the
front-office tier -- ADMIN_ROLES -- is the right test, checked across every
effective role, and still only inside the student's own organization.
"""

from unittest.mock import MagicMock

import pytest

from middleware.error_handler import AuthorizationError
from routes.advisor.student_overview import verify_advisor_access


ORG = '11111111-1111-4111-8111-111111111111'
OTHER_ORG = '22222222-2222-4222-8222-222222222222'
CALLER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
STUDENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'


def _supabase(caller, *, student_org=ORG, assigned=False):
    """A fake client answering the three reads verify_advisor_access makes."""
    users = {
        CALLER: {'id': CALLER, **caller},
        STUDENT: {'id': STUDENT, 'organization_id': student_org},
    }

    def table(name):
        t = MagicMock()
        if name == 'users':
            def select(*_a, **_k):
                q = MagicMock()

                def eq(_col, value):
                    single = MagicMock()
                    single.single.return_value.execute.return_value = MagicMock(
                        data=users.get(value))
                    return single
                q.eq.side_effect = eq
                return q
            t.select.side_effect = select
        elif name == 'advisor_student_assignments':
            chain = t.select.return_value.eq.return_value.eq.return_value.eq.return_value
            chain.execute.return_value = MagicMock(
                data=[{'id': 'x'}] if assigned else [])
        else:
            raise AssertionError(f'unexpected table {name}')
        return t

    client = MagicMock()
    client.table.side_effect = table
    return client


def _org_member(org_role, org=ORG, org_roles=None):
    return {
        'role': 'org_managed',
        'org_role': org_role,
        'org_roles': org_roles if org_roles is not None else [org_role],
        'organization_id': org,
    }


def test_same_org_campus_coordinator_is_allowed():
    """The bug: this raised AuthorizationError before the fix."""
    sb = _supabase(_org_member('campus_coordinator'))
    assert verify_advisor_access(sb, CALLER, STUDENT) is True


def test_coordinator_held_only_in_org_roles_array_is_allowed():
    """A teacher who is also a coordinator may carry it only in the array."""
    sb = _supabase(_org_member('advisor', org_roles=['advisor', 'campus_coordinator']))
    assert verify_advisor_access(sb, CALLER, STUDENT) is True


def test_other_org_coordinator_is_refused():
    sb = _supabase(_org_member('campus_coordinator', org=OTHER_ORG))
    with pytest.raises(AuthorizationError):
        verify_advisor_access(sb, CALLER, STUDENT)


def test_same_org_org_admin_is_still_allowed():
    sb = _supabase(_org_member('org_admin'))
    assert verify_advisor_access(sb, CALLER, STUDENT) is True


def test_same_org_advisor_without_assignment_is_refused():
    sb = _supabase(_org_member('advisor'), assigned=False)
    with pytest.raises(AuthorizationError):
        verify_advisor_access(sb, CALLER, STUDENT)


def test_assigned_advisor_is_allowed():
    sb = _supabase(_org_member('advisor'), assigned=True)
    assert verify_advisor_access(sb, CALLER, STUDENT) is True
