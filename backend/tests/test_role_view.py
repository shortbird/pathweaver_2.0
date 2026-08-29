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
