"""What routes/dependents.py declares about the caller, and what it must not.

SEC-10 step (c) migrated all 12 id-bearing routes in routes/dependents.py to
`@require_relationship_to(<param>, allow=('parent',))`. These are the routes
that read a child's profile, rename them, upload their photo, DELETE their
account, promote them to an adult login, and mint an act-as token that lets the
caller browse as them. The declaration is worth pinning.

TWO THINGS THIS FILE EXISTS TO STOP.

**Observers must not be on this list.** routes/parent/* splits its allow set --
read paths take ('parent', 'observer'), writes take ('parent',) -- because a
grandparent with view access should see the work and not be able to change
anything. None of these twelve is a read-only view of schoolwork; the mildest
is a profile read that carries the child's date of birth, and the rest are
destructive. So the split does not apply here: it is ('parent',) throughout.

**The in-view checks must not be collapsed away.** In routes/parent/* the
decorator replaced verify_parent_access outright, because the two were exactly
equivalent. Here they are NOT. These routes gate on
`users.managed_by_parent_id == caller`; the decorator's `parent` predicate is
`is_parent_of`, which ALSO accepts an approved `parent_student_links` row.
Measured against production on 2026-09-03: 129 of the 131 approved links point
at a student whose managed_by_parent_id is somebody else. Collapsing would hand
those 129 pairs delete, promote and act-as over a teen who is not their
dependent. The decorator is the outer structural gate; managed_by_parent_id
stays as the precise one.
"""

import pytest

from utils.auth.relationships import ENFORCED_ATTR


#: endpoint -> the path parameter that names the child.
DEPENDENT_ROUTES = {
    'dependents.add_dependent_login': 'dependent_id',
    'dependents.delete_dependent': 'dependent_id',
    'dependents.export_dependent_progress_report': 'dependent_id',
    'dependents.generate_acting_as_token': 'dependent_id',
    'dependents.get_dependent': 'dependent_id',
    'dependents.get_dependent_progress_report': 'dependent_id',
    'dependents.promote_dependent': 'dependent_id',
    'dependents.resend_student_invite': 'student_id',
    'dependents.toggle_child_ai_access': 'child_id',
    'dependents.update_child_ai_features': 'child_id',
    'dependents.update_dependent': 'dependent_id',
    'dependents.upload_dependent_avatar': 'dependent_id',
}


@pytest.fixture(scope='module')
def declarations():
    """endpoint -> (param, allow), read off the real registered app.

    The declaration is read from the app the process actually serves, not from
    the source text: a decorator that failed to apply, or a second blueprint
    shadowing the rule (see test_no_duplicate_routes), would still look right
    in the file and be absent here.
    """
    from app import app

    return {endpoint: getattr(view, ENFORCED_ATTR, None)
            for endpoint, view in app.view_functions.items()
            if endpoint in DEPENDENT_ROUTES}


def test_every_dependents_route_is_accounted_for(declarations):
    """A new id-bearing route here should fail loudly, not slip past this file."""
    assert set(declarations) == set(DEPENDENT_ROUTES), (
        'routes/dependents.py gained or lost an id-bearing route; decide its '
        'allow set and add it here. Missing: '
        f'{sorted(set(DEPENDENT_ROUTES) - set(declarations))}')


@pytest.mark.parametrize('endpoint,param', sorted(DEPENDENT_ROUTES.items()))
def test_route_declares_parent_only(declarations, endpoint, param):
    declared = declarations[endpoint]
    assert declared is not None, f'{endpoint} declares no relationship'
    declared_param, allow = declared
    assert declared_param == param, (
        f'{endpoint} gates on {declared_param!r} but its URL names {param!r} -- '
        'the gate would read a parameter the route does not carry and deny '
        'everyone, or worse, gate the wrong id')
    assert allow == ('parent',), (
        f'{endpoint} allows {allow}. These routes delete accounts, mint act-as '
        'tokens and change credentials; only a guardian may reach them. '
        'Observers are read-only by design and belong on routes/parent/* reads, '
        'not here.')
