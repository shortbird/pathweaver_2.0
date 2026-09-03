"""
"View as role" — the invariants that make it safe.

A role-view token narrows the caller's session to ONE of their own roles.
The properties under test:
  1. Narrowing applies only to the caller's own user dict (id-matched).
  2. It can only narrow — a role the account does not hold is ignored.
  3. is_org_admin is recomputed, because four decorators grant on that flag
     alone (see utils/auth/decorators.py).
  4. get_effective_role(s) resolve to the viewed role for the caller, and are
     untouched for every other user dict (announcement recipients, rosters).
"""

from flask import Flask, g

from utils.roles import (
    apply_role_view,
    get_effective_role,
    get_effective_roles,
    has_any_role,
)

_app = Flask(__name__)

KATIE = {
    'id': 'u-katie',
    'role': 'org_managed',
    'org_role': 'org_admin',
    'org_roles': ['org_admin', 'advisor', 'parent'],
    'is_org_admin': True,
}
OTHER = {
    'id': 'u-other',
    'role': 'org_managed',
    'org_role': 'advisor',
    'org_roles': ['advisor'],
}


def _with_view(user_id, role):
    ctx = _app.test_request_context('/')
    ctx.push()
    g._role_view = {'user_id': user_id, 'role': role}
    return ctx


def test_narrows_the_callers_own_dict():
    ctx = _with_view('u-katie', 'advisor')
    try:
        narrowed = apply_role_view(KATIE)
        assert narrowed['org_roles'] == ['advisor']
        assert narrowed['org_role'] == 'advisor'
        assert narrowed['is_org_admin'] is False
        assert get_effective_role(KATIE) == 'advisor'
        assert get_effective_roles(KATIE) == ['advisor']
        assert has_any_role(KATIE, ['org_admin']) is False
        assert has_any_role(KATIE, ['advisor']) is True
        # The original dict is never mutated.
        assert KATIE['org_roles'] == ['org_admin', 'advisor', 'parent']
    finally:
        ctx.pop()


def test_other_users_dicts_are_untouched():
    ctx = _with_view('u-katie', 'advisor')
    try:
        assert apply_role_view(OTHER) is OTHER
        assert get_effective_roles(OTHER) == ['advisor']
    finally:
        ctx.pop()


def test_cannot_widen_to_a_role_not_held():
    ctx = _with_view('u-other', 'org_admin')
    try:
        # OTHER holds only advisor; viewing as org_admin is refused.
        assert apply_role_view(OTHER) is OTHER
        assert get_effective_roles(OTHER) == ['advisor']
        assert has_any_role(OTHER, ['org_admin']) is False
    finally:
        ctx.pop()


PLAIN_ADMIN = {'id': 'u-admin', 'role': 'org_managed', 'org_role': 'org_admin',
               'org_roles': ['org_admin'], 'is_org_admin': True, 'organization_id': 'org-1'}
SUPER = {'id': 'u-super', 'role': 'superadmin', 'org_role': None, 'org_roles': None,
         'is_org_admin': False, 'organization_id': None}


def test_org_admin_may_view_as_any_role_of_the_school():
    """An admin previewing the teacher experience holds no advisor role; the
    admin tier may still step DOWN into any role (never up)."""
    ctx = _with_view('u-admin', 'advisor')
    try:
        assert get_effective_roles(PLAIN_ADMIN) == ['advisor']
        assert apply_role_view(PLAIN_ADMIN)['is_org_admin'] is False
        assert has_any_role(PLAIN_ADMIN, ['org_admin']) is False
    finally:
        ctx.pop()


def test_superadmin_view_is_pinned_to_an_org_and_shaped_like_a_member():
    ctx = _app.test_request_context('/')
    ctx.push()
    g._role_view = {'user_id': 'u-super', 'role': 'advisor', 'organization_id': 'org-9'}
    try:
        narrowed = apply_role_view(SUPER)
        assert narrowed['role'] == 'org_managed'
        assert narrowed['org_roles'] == ['advisor']
        assert narrowed['organization_id'] == 'org-9'
        assert narrowed['is_org_admin'] is False
        assert get_effective_role(SUPER) == 'advisor'
        # Without an org the view cannot apply — a superadmin has no org of
        # their own to fall back to.
        g._role_view = {'user_id': 'u-super', 'role': 'advisor', 'organization_id': None}
        assert apply_role_view(SUPER) is SUPER
    finally:
        ctx.pop()


def test_nobody_views_as_superadmin():
    ctx = _with_view('u-admin', 'superadmin')
    try:
        assert apply_role_view(PLAIN_ADMIN) is PLAIN_ADMIN
    finally:
        ctx.pop()


def test_id_required_explicit_user_id_narrows_idless_dicts():
    """Auth decorators select only role columns — no id. They pass user_id
    explicitly; without it the dict must stay untouched."""
    row = {'role': 'org_managed', 'org_roles': ['org_admin', 'advisor'],
           'org_role': 'org_admin', 'is_org_admin': True}
    ctx = _with_view('u-katie', 'advisor')
    try:
        assert apply_role_view(row) is row  # no id, no explicit user_id
        narrowed = apply_role_view(row, user_id='u-katie')
        assert narrowed['org_roles'] == ['advisor']
        assert narrowed['is_org_admin'] is False
    finally:
        ctx.pop()


def test_no_view_no_change():
    ctx = _app.test_request_context('/')
    ctx.push()
    g._role_view = None
    try:
        assert apply_role_view(KATIE) is KATIE
        assert get_effective_role(KATIE) == 'org_admin'
        assert sorted(get_effective_roles(KATIE)) == ['advisor', 'org_admin', 'parent']
    finally:
        ctx.pop()


def test_parent_view_reaches_the_family_surface_role():
    ctx = _with_view('u-katie', 'parent')
    try:
        assert get_effective_role(KATIE) == 'parent'
        assert has_any_role(KATIE, ['advisor', 'org_admin']) is False
    finally:
        ctx.pop()


# --- /api/role-view/people: the person picker's list ------------------------
#
# Since 2026-08-31 the SIS "Viewing as" switcher is a single searchable person
# picker, so the endpoint must answer WITHOUT a role filter: the school's
# non-admin STAFF (teachers, coordinators — not students or parents), each
# carrying their viewable roles for the label.

from unittest.mock import Mock, patch


def _org_people_db(caller_row, members):
    db = Mock()
    table = Mock()
    db.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[caller_row])
    return db, members


def test_people_without_role_lists_staff_only(client, mock_verify_token):
    caller = {'id': 'test-user-123', 'role': 'org_managed', 'org_role': 'org_admin',
              'org_roles': None, 'organization_id': 'org-1'}
    members = [
        {'id': 'u-t', 'first_name': 'Dallin', 'last_name': 'Bird',
         'role': 'org_managed', 'org_role': 'advisor', 'org_roles': ['advisor', 'parent']},
        {'id': 'u-c', 'first_name': 'Cora', 'last_name': 'Front',
         'role': 'org_managed', 'org_role': 'campus_coordinator', 'org_roles': None},
        {'id': 'u-s', 'first_name': 'Sam', 'last_name': 'Hearth',
         'role': 'org_managed', 'org_role': 'student', 'org_roles': None},
        {'id': 'u-p', 'first_name': 'Penny', 'last_name': 'Hearth',
         'role': 'org_managed', 'org_role': 'parent', 'org_roles': None},
        {'id': 'u-a', 'first_name': 'Christina', 'last_name': 'Admin',
         'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': None},
    ]
    db, _ = _org_people_db(caller, members)
    with patch('routes.role_view.get_supabase_admin_client', return_value=db), \
         patch('routes.role_view.fetch_all_rows', return_value=members):
        resp = client.get('/api/role-view/people',
                          headers={'Authorization': 'Bearer t'})
    assert resp.status_code == 200
    people = {p['id']: p for p in resp.get_json()['people']}
    # Staff only: no students, no parents; admin-tier members never appear —
    # the masquerade rule refuses them.
    assert set(people) == {'u-t', 'u-c'}
    assert people['u-t']['roles'] == ['advisor', 'parent']
    assert people['u-c']['roles'] == ['campus_coordinator']


def test_people_still_filters_by_role_when_asked(client, mock_verify_token):
    caller = {'id': 'test-user-123', 'role': 'org_managed', 'org_role': 'org_admin',
              'org_roles': None, 'organization_id': 'org-1'}
    members = [
        {'id': 'u-t', 'first_name': 'Dallin', 'last_name': 'Bird',
         'role': 'org_managed', 'org_role': 'advisor', 'org_roles': None},
        {'id': 'u-s', 'first_name': 'Sam', 'last_name': 'Hearth',
         'role': 'org_managed', 'org_role': 'student', 'org_roles': None},
    ]
    db, _ = _org_people_db(caller, members)
    with patch('routes.role_view.get_supabase_admin_client', return_value=db), \
         patch('routes.role_view.fetch_all_rows', return_value=members):
        resp = client.get('/api/role-view/people?role=advisor',
                          headers={'Authorization': 'Bearer t'})
    assert resp.status_code == 200
    assert [p['id'] for p in resp.get_json()['people']] == ['u-t']
