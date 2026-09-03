"""
The credit dashboard must not hand one org's submissions to another org.

Two defects, found 2026-09-01 while tracing the OPTIO-WEB 403 cluster:

1. `_scoped_student_ids`' predecessor left `student_ids = None` for any role it
   did not recognize, and None meant "no filter" -- every org's completions.
   Only superadmin actually fell through behind today's decorator, so nothing
   leaked in production, but the safety of the query depended on a decorator
   two hundred lines away agreeing to stay narrow. Unrecognized now means no
   students, not all of them.

2. The item-detail handler's org check read `role, organization_id` without
   org_role/org_roles. get_effective_role saw 'org_managed', had nothing to
   resolve it with, and returned its 'student' default -- so the
   `caller_eff == 'org_admin'` guard was False for every org admin and the
   org comparison never ran. That one WAS reachable: any org admin could open
   any completion in any other organization.

Both now resolve the caller's full role list, and both fail closed.
"""

import app  # noqa: F401 — import graph ordering

from routes.credit_dashboard.items import (
    UNRESTRICTED,
    _scoped_student_ids,
)


ORG_A = 'org-a'
ORG_B = 'org-b'


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, rows, sink=None):
        self._rows = rows
        self._sink = sink

    def select(self, *a, **k):
        return self

    def eq(self, col, val):
        if self._sink is not None:
            self._sink[col] = val
        return self

    def execute(self):
        return _Result(self._rows)


class _Admin:
    """Records the org filter it was asked for, so a test can prove scoping."""

    def __init__(self, org_students=None, assignments=None):
        self._org_students = org_students or {}
        self._assignments = assignments or []
        self.filters = {}

    def table(self, name):
        if name == 'users':
            _Query([], sink=self.filters)
            # Resolve rows lazily against whatever org was filtered on
            class _OrgQuery(_Query):
                def execute(_self):
                    org = self.filters.get('organization_id')
                    return _Result(
                        [{'id': sid} for sid in self._org_students.get(org, [])]
                    )
            return _OrgQuery([], sink=self.filters)
        if name == 'advisor_student_assignments':
            return _Query(self._assignments)
        raise AssertionError(f'unexpected table {name}')


def _org_user(org, org_role=None, org_roles=None):
    return {
        'role': 'org_managed',
        'org_role': org_role,
        'org_roles': org_roles,
        'organization_id': org,
    }


class TestUnrecognizedRolesGetNothing:
    def test_a_plain_parent_is_scoped_to_no_students(self):
        """The fall-through case. Previously this returned None -> unfiltered."""
        admin = _Admin(org_students={ORG_A: ['s1', 's2']})
        scope = _scoped_student_ids(admin, 'u', _org_user(ORG_A, 'parent'), None)
        assert scope == []
        assert scope is not UNRESTRICTED

    def test_a_student_is_scoped_to_no_students(self):
        admin = _Admin(org_students={ORG_A: ['s1']})
        scope = _scoped_student_ids(admin, 'u', _org_user(ORG_A, 'student'), None)
        assert scope == []

    def test_an_observer_is_scoped_to_no_students(self):
        admin = _Admin(org_students={ORG_A: ['s1']})
        scope = _scoped_student_ids(admin, 'u', _org_user(ORG_A, 'observer'), None)
        assert scope == []


class TestOrgWideRoles:
    def test_org_admin_sees_only_their_own_org(self):
        admin = _Admin(org_students={ORG_A: ['s1', 's2'], ORG_B: ['s9']})
        scope = _scoped_student_ids(admin, 'u', _org_user(ORG_A, 'org_admin'), None)
        assert scope == ['s1', 's2']

    def test_org_admin_cannot_widen_scope_with_the_org_id_param(self):
        """The param is honoured for superadmin only; an org admin passing
        another org's id must still get their own."""
        admin = _Admin(org_students={ORG_A: ['s1'], ORG_B: ['s9']})
        scope = _scoped_student_ids(admin, 'u', _org_user(ORG_A, 'org_admin'), ORG_B)
        assert scope == ['s1']

    def test_campus_coordinator_is_scoped_like_an_org_admin(self):
        admin = _Admin(org_students={ORG_A: ['s1', 's2']})
        scope = _scoped_student_ids(
            admin, 'u', _org_user(ORG_A, 'campus_coordinator'), None
        )
        assert scope == ['s1', 's2']

    def test_org_admin_with_no_org_gets_nothing(self):
        admin = _Admin(org_students={ORG_A: ['s1']})
        scope = _scoped_student_ids(admin, 'u', _org_user(None, 'org_admin'), None)
        assert scope == []


class TestMultiRole:
    def test_a_parent_who_is_also_an_org_admin_is_scoped_as_the_admin(self):
        """The singular org_role would resolve this account to 'parent' and
        return nothing; the array says org_admin."""
        admin = _Admin(org_students={ORG_A: ['s1', 's2']})
        user = _org_user(ORG_A, 'parent', ['parent', 'org_admin'])
        assert _scoped_student_ids(admin, 'u', user, None) == ['s1', 's2']

    def test_a_parent_who_is_also_an_advisor_is_scoped_as_the_advisor(self):
        admin = _Admin(assignments=[{'student_id': 's3'}])
        user = _org_user(ORG_A, 'parent', ['parent', 'advisor'])
        assert _scoped_student_ids(admin, 'u', user, None) == ['s3']

    def test_role_order_does_not_change_the_scope(self):
        admin = _Admin(org_students={ORG_A: ['s1']})
        first = _org_user(ORG_A, 'org_admin', ['org_admin', 'parent'])
        second = _org_user(ORG_A, 'parent', ['parent', 'org_admin'])
        assert _scoped_student_ids(admin, 'u', first, None) == \
               _scoped_student_ids(admin, 'u', second, None)


class TestSuperadmin:
    def test_superadmin_reviews_every_org(self):
        admin = _Admin(org_students={ORG_A: ['s1']})
        user = {'role': 'superadmin', 'organization_id': None}
        assert _scoped_student_ids(admin, 'u', user, None) is UNRESTRICTED

    def test_superadmin_previewing_one_org_is_scoped_to_it(self):
        admin = _Admin(org_students={ORG_A: ['s1'], ORG_B: ['s9']})
        user = {'role': 'superadmin', 'organization_id': None}
        assert _scoped_student_ids(admin, 'u', user, ORG_B) == ['s9']


class TestAdvisor:
    def test_advisor_sees_only_assigned_students(self):
        admin = _Admin(assignments=[{'student_id': 's4'}, {'student_id': 's5'}])
        user = _org_user(ORG_A, 'advisor')
        assert _scoped_student_ids(admin, 'u', user, None) == ['s4', 's5']

    def test_advisor_with_no_assignments_gets_nothing(self):
        admin = _Admin(assignments=[])
        user = _org_user(ORG_A, 'advisor')
        assert _scoped_student_ids(admin, 'u', user, None) == []
