"""
An organisation's parents must be able to manage observers for their children.

iCreate family orientation, 2026-08-18: Mary Caples tried to add her husband so
he could follow their two children, and the link button failed. Every
parent-side observer route gated on `users.role == 'parent'`, but an
organisation's parents are role='org_managed' with 'parent' in
org_role/org_roles — so the check read 'org_managed', returned 403, and the app
surfaced it as "failed to create link".

Not one account: every org parent at the school was locked out, on all seven
parent endpoints across these two modules. Same shape as the campus-coordinator
lockout found the same day (Sentry OPTIO-BACKEND-6P).

These tests pin the ROLE RESOLUTION rather than any one route, because the bug
was a single predicate copied seven times.
"""

import pytest

import app  # noqa: F401 — import graph ordering
from routes.observer.family import _is_parent as family_is_parent
from routes.observer.parent_management import _is_parent as pm_is_parent

BOTH = (family_is_parent, pm_is_parent)

ORG_PARENT = {'role': 'org_managed', 'org_role': 'parent', 'org_roles': ['parent']}
PLATFORM_PARENT = {'role': 'parent', 'org_role': None, 'org_roles': None}
COORDINATOR_PARENT = {'role': 'org_managed', 'org_role': 'campus_coordinator',
                      'org_roles': ['campus_coordinator', 'parent']}
ADVISOR_PARENT = {'role': 'org_managed', 'org_role': 'advisor',
                  'org_roles': ['advisor', 'parent']}
SUPERADMIN = {'role': 'superadmin', 'org_role': None, 'org_roles': None}

ORG_STUDENT = {'role': 'org_managed', 'org_role': 'student', 'org_roles': ['student']}
ORG_ADVISOR = {'role': 'org_managed', 'org_role': 'advisor', 'org_roles': ['advisor']}
ORG_ADMIN = {'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': ['org_admin']}
OBSERVER = {'role': 'observer', 'org_role': None, 'org_roles': None}


@pytest.mark.parametrize('is_parent', BOTH)
@pytest.mark.parametrize('user,label', [
    (ORG_PARENT, 'org parent (the account that broke)'),
    (PLATFORM_PARENT, 'platform parent'),
    (COORDINATOR_PARENT, 'coordinator who is also a parent'),
    (ADVISOR_PARENT, 'advisor who is also a parent'),
    (SUPERADMIN, 'superadmin'),
])
def test_parents_are_allowed(is_parent, user, label):
    assert is_parent(user) is True, label


@pytest.mark.parametrize('is_parent', BOTH)
@pytest.mark.parametrize('user,label', [
    (ORG_STUDENT, 'student'),
    (ORG_ADVISOR, 'advisor who is not a parent'),
    (ORG_ADMIN, 'org admin who is not a parent'),
    (OBSERVER, 'observer'),
])
def test_non_parents_are_still_refused(is_parent, user, label):
    """The fix widens role RESOLUTION, not the set of people allowed in."""
    assert is_parent(user) is False, label


@pytest.mark.parametrize('is_parent', BOTH)
def test_missing_or_empty_user_is_refused(is_parent):
    assert is_parent({}) is False
    assert is_parent(None) is False


def test_no_parent_route_still_reads_the_bare_role_column():
    """The predicate was copied seven times; a re-introduced copy fails here."""
    import inspect
    from routes.observer import family, parent_management

    for mod in (family, parent_management):
        src = inspect.getsource(mod)
        assert "data['role'] not in ('parent'" not in src, (
            f"{mod.__name__} still gates on the bare `role` column — an "
            "organisation's parents carry 'parent' in org_role/org_roles."
        )
