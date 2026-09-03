"""
Promoting an observer to a co-parent, for an organisation's families.

This is step two of the flow schools actually use to add a second parent:
invite them as an observer, then promote them. iCreate, 2026-08-18 — Mary
Caples adding her husband — is why it was looked at, and it was shut for every
org family in three separate places:

  1. the caller check refused Mary, because an org parent is role='org_managed'
     with 'parent' in org_role/org_roles;
  2. the target check refused her husband, for the same reason;
  3. the write set role='parent' on an org member, which is not how the role
     model stores it. Nothing in the database refuses that — users_role_check
     permits 'parent' — so it would have corrupted the account quietly.

The write is asserted here because a promotion that "succeeds" into the wrong
column is worse than one that fails: the account stops reading as a member of
its school and nobody is told.
"""


import app  # noqa: F401 — import graph ordering
from utils.roles import get_effective_roles

ORG = 'org-1340'


def _promotion_write(observer):
    """The user-row update the route performs for this observer, mirroring
    routes/parent_linking/requests.py::promote_observer_to_parent."""
    roles = set(get_effective_roles(observer))
    if 'parent' in roles:
        return None  # already a parent; no write
    if observer.get('organization_id'):
        existing = observer.get('org_roles')
        existing = list(existing) if isinstance(existing, list) else []
        if observer.get('org_role') and observer['org_role'] not in existing:
            existing.append(observer['org_role'])
        if 'parent' not in existing:
            existing.append('parent')
        return {'role': 'org_managed', 'org_role': 'parent', 'org_roles': existing}
    return {'role': 'parent'}


def _may_promote(user):
    return bool({'parent', 'superadmin'} & set(get_effective_roles(user)))


def _valid_target(user):
    return bool({'observer', 'parent'} & set(get_effective_roles(user)))


def test_org_parent_may_promote():
    """Mary's account: the one that was refused."""
    assert _may_promote({'role': 'org_managed', 'org_role': 'parent',
                         'org_roles': ['parent'], 'organization_id': ORG})


def test_platform_parent_may_promote():
    assert _may_promote({'role': 'parent'})


def test_org_student_may_not_promote():
    assert not _may_promote({'role': 'org_managed', 'org_role': 'student',
                             'org_roles': ['student'], 'organization_id': ORG})


def test_org_observer_is_a_valid_target():
    """Her husband, invited as an observer inside the school."""
    assert _valid_target({'role': 'org_managed', 'org_role': 'observer',
                          'org_roles': ['observer'], 'organization_id': ORG})


def test_org_student_is_not_a_valid_target():
    """A child must never be promotable into a parent on their own family."""
    assert not _valid_target({'role': 'org_managed', 'org_role': 'student',
                              'org_roles': ['student'], 'organization_id': ORG})


def test_org_member_is_promoted_in_the_org_columns():
    write = _promotion_write({'role': 'org_managed', 'org_role': 'observer',
                              'org_roles': ['observer'], 'organization_id': ORG})
    assert write['role'] == 'org_managed', "org members must stay org_managed"
    assert write['org_role'] == 'parent'
    assert 'parent' in write['org_roles']


def test_platform_member_is_promoted_on_the_role_column():
    """A user with no organisation carries the role directly."""
    assert _promotion_write({'role': 'observer', 'organization_id': None}) == {'role': 'parent'}


def test_an_existing_org_role_is_kept():
    """A school's advisor who is also a parent must remain an advisor —
    promotion adds a role, it does not replace one."""
    write = _promotion_write({'role': 'org_managed', 'org_role': 'advisor',
                              'org_roles': ['advisor', 'observer'],
                              'organization_id': ORG})
    assert 'advisor' in write['org_roles']
    assert 'observer' in write['org_roles']
    assert 'parent' in write['org_roles']


def test_already_a_parent_is_not_rewritten():
    assert _promotion_write({'role': 'org_managed', 'org_role': 'parent',
                             'org_roles': ['parent'], 'organization_id': ORG}) is None


def test_route_does_not_write_role_parent_onto_an_org_member():
    """Source guard: the original one-liner is what corrupted the row."""
    import inspect
    from routes.parent_linking import requests as mod

    src = inspect.getsource(mod.promote_observer_to_parent)
    assert "update({'role': 'parent'})" not in src, (
        "promote_observer_to_parent writes role='parent' unconditionally; an "
        "organisation's members must be updated via org_role/org_roles."
    )
