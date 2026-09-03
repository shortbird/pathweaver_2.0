"""
Who may act as whom — token_authority.caller_may_masquerade, the one rule the
masquerade start route and every token refresh share.

Superadmin: anyone. Org admin: a non-admin member of their OWN school
(iCreate, 2026-08-28: "select a specific teacher so we can see their actual
setup"). Coordinators, teachers, families: nobody.
"""

from utils.token_authority import caller_may_masquerade


def _org(uid, roles, org='org-1'):
    return {'id': uid, 'role': 'org_managed', 'org_role': roles[0],
            'org_roles': roles, 'organization_id': org}


SUPER = {'id': 'su', 'role': 'superadmin', 'org_role': None, 'org_roles': None,
         'organization_id': None}
ADMIN = _org('adm', ['org_admin'])
ADMIN_TEACHER = _org('adm2', ['advisor', 'org_admin'])
COORD = _org('cc', ['campus_coordinator'])
TEACHER = _org('t1', ['advisor'])
PARENT = _org('p1', ['parent'])
OTHER_SCHOOL_TEACHER = _org('t9', ['advisor'], org='org-9')
OTHER_ADMIN = _org('adm9', ['org_admin', 'parent'])


def test_superadmin_may_act_as_anyone():
    for target in (ADMIN, COORD, TEACHER, PARENT, OTHER_SCHOOL_TEACHER):
        assert caller_may_masquerade(SUPER, target)


def test_org_admin_may_act_as_non_admin_members_of_own_school():
    assert caller_may_masquerade(ADMIN, TEACHER)
    assert caller_may_masquerade(ADMIN, PARENT)
    assert caller_may_masquerade(ADMIN, COORD)
    assert caller_may_masquerade(ADMIN_TEACHER, TEACHER)


def test_org_admin_may_not_act_as_admins_or_other_schools():
    assert not caller_may_masquerade(ADMIN, OTHER_ADMIN)   # admin + parent, still an admin
    assert not caller_may_masquerade(ADMIN, SUPER)
    assert not caller_may_masquerade(ADMIN, OTHER_SCHOOL_TEACHER)


def test_non_admins_may_act_as_nobody():
    for caller in (COORD, TEACHER, PARENT):
        for target in (TEACHER, PARENT, ADMIN):
            assert not caller_may_masquerade(caller, target)


def test_missing_rows_fail_closed():
    assert not caller_may_masquerade(None, TEACHER)
    assert not caller_may_masquerade(ADMIN, None)
    assert not caller_may_masquerade(_org('x', ['org_admin'], org=None), TEACHER)
