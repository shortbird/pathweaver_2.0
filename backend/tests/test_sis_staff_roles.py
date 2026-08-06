"""
Giving somebody a role — the half the campus coordinator shipped without.

iCreate, 2026-08-06: "i also think we established a campus coordinator role but
we don't know how to set someone to have that role."

They were right: the role landed on 2026-08-04 with every gate, tier and pay
redaction it needs, and no endpoint that could put a person in it. Kate could be
read about but not made one.

What these tests hold is mostly the refusals, because the failure modes here are
the expensive kind:

  - a school locked out of its own console, by demoting its last admin or by an
    admin tidying up their own row;
  - a campus coordinator promoting themselves to admin, which hands back exactly
    the finance access the role exists to withhold;
  - "make Kate a coordinator" quietly cancelling "Kate is a parent here", which
    would take her children's family portal away.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_service
from utils import sis_roles


ORG = 'org-1'


def _table(rows, captured):
    """A supabase table mock that records what update() was handed."""
    t = Mock()
    for chained in ('select', 'eq', 'in_', 'limit', 'order', 'range', 'contains'):
        getattr(t, chained).return_value = t
    t.execute.return_value = Mock(data=rows)

    def _update(payload):
        captured.append(payload)
        return t
    t.update.side_effect = _update
    return t


def _run(target, roles, actor_id=None, staff_list=None):
    """Call set_staff_roles against a single stubbed user row.

    Returns (result, updates) — updates being every payload written to `users`.
    """
    captured = []
    client = Mock()
    client.table.side_effect = lambda name: _table([target] if name == 'users' else [], captured)
    with patch.object(sis_service, '_admin', return_value=client), \
         patch.object(sis_service, 'list_org_staff', return_value=staff_list if staff_list is not None else []), \
         patch.object(sis_service, '_org_name', return_value='iCreate'), \
         patch('services.sis_notifications.notify'):
        result = sis_service.set_staff_roles(ORG, target['id'], roles, actor_id=actor_id)
    return result, captured


def _person(user_id='kate', roles=('advisor',)):
    return {'id': user_id, 'email': f'{user_id}@x.com', 'role': 'org_managed',
            'org_role': roles[0] if roles else None, 'org_roles': list(roles),
            'organization_id': ORG, 'first_name': 'Kate', 'last_name': 'M',
            'display_name': 'Kate M'}


ANOTHER_ADMIN = [{'id': 'molly', 'roles': ['org_admin'], 'name': 'Molly'}]


@pytest.mark.unit
class TestMakingSomebodyACoordinator:
    def test_the_role_can_actually_be_given(self):
        result, updates = _run(_person(roles=('advisor',)), ['campus_coordinator'])
        assert result.get('error') is None
        assert result['roles'] == ['campus_coordinator']
        assert updates[0]['org_roles'] == ['campus_coordinator']

    def test_the_legacy_single_role_column_follows(self):
        """org_role is still read by older code paths; leaving it on the old
        value would make the change half-apply."""
        _, updates = _run(_person(roles=('advisor',)), ['campus_coordinator'])
        assert updates[0]['org_role'] == 'campus_coordinator'

    def test_somebody_can_be_a_coordinator_and_a_teacher(self):
        result, _ = _run(_person(roles=('advisor',)), ['campus_coordinator', 'advisor'])
        assert set(result['roles']) == {'campus_coordinator', 'advisor'}

    def test_the_higher_role_takes_the_single_column(self):
        _, updates = _run(_person(roles=('advisor',)), ['advisor', 'campus_coordinator'])
        assert updates[0]['org_role'] == 'campus_coordinator'

    def test_a_coordinator_can_be_promoted_to_admin(self):
        result, _ = _run(_person(roles=('campus_coordinator',)), ['org_admin'],
                         actor_id='someone-else', staff_list=ANOTHER_ADMIN)
        assert result['roles'] == ['org_admin']


@pytest.mark.unit
class TestRolesTheyHoldElsewhere:
    def test_a_parent_who_teaches_stays_a_parent(self):
        """One person, one login. Making Kate staff must not remove her from her
        own children's family portal."""
        result, updates = _run(_person(roles=('advisor', 'parent')), ['campus_coordinator'])
        assert 'parent' in result['all_roles']
        assert 'parent' in updates[0]['org_roles']

    def test_the_staff_roles_are_replaced_not_added_to(self):
        result, _ = _run(_person(roles=('org_admin', 'advisor')), ['advisor'],
                         actor_id='someone-else', staff_list=ANOTHER_ADMIN)
        assert result['roles'] == ['advisor']


@pytest.mark.unit
class TestTheLockoutGuards:
    def test_the_last_admin_cannot_be_demoted(self):
        result, updates = _run(_person(roles=('org_admin',)), ['advisor'],
                               actor_id='someone-else', staff_list=[])
        assert 'only admin' in result['error']
        assert updates == []

    def test_you_cannot_remove_your_own_admin_role(self):
        result, updates = _run(_person('kate', roles=('org_admin',)), ['campus_coordinator'],
                               actor_id='kate', staff_list=ANOTHER_ADMIN)
        assert 'your own admin role' in result['error']
        assert updates == []

    def test_demoting_an_admin_is_fine_when_another_one_exists(self):
        result, _ = _run(_person(roles=('org_admin',)), ['campus_coordinator'],
                         actor_id='someone-else', staff_list=ANOTHER_ADMIN)
        assert result.get('error') is None

    def test_an_admin_keeping_their_admin_role_is_not_a_demotion(self):
        """Adding a second role to your own account must not trip the self-demote
        guard — nothing is being taken away."""
        result, _ = _run(_person('kate', roles=('org_admin',)), ['org_admin', 'advisor'],
                         actor_id='kate', staff_list=ANOTHER_ADMIN)
        assert result.get('error') is None


@pytest.mark.unit
class TestWhatItRefuses:
    def test_an_empty_role_list(self):
        result, updates = _run(_person(), [])
        assert 'at least one role' in result['error']
        assert updates == []

    def test_a_role_that_is_not_a_staff_role(self):
        result, updates = _run(_person(), ['student'])
        assert 'Not a staff role' in result['error']
        assert updates == []

    def test_anything_that_is_not_a_list(self):
        result, _ = _run(_person(), 'org_admin')
        assert result['error'] == 'roles must be a list'

    def test_somebody_from_another_school(self):
        outsider = {**_person(), 'organization_id': 'org-2'}
        result, updates = _run(outsider, ['advisor'])
        assert result['error'] == 'Staff member not found'
        assert updates == []


@pytest.mark.unit
class TestWhoMayGrantRoles:
    def test_the_grant_tier_excludes_campus_coordinators(self):
        """The whole point of the role is to withhold the money. A coordinator
        who can grant roles grants themselves org_admin and takes it back."""
        assert sis_roles.CAMPUS_COORDINATOR not in sis_roles.ROLE_GRANT_ROLES

    def test_admins_and_superadmins_may(self):
        assert set(sis_roles.ROLE_GRANT_ROLES) == {'org_admin', 'superadmin'}

    def test_the_route_is_gated_to_that_tier(self):
        """A route on ADMIN_ROLES would let a coordinator through — this is the
        one endpoint where the admin tier is too wide."""
        import routes.sis as sis_routes
        assert sis_routes.ROLE_GRANT_ROLES == sis_roles.ROLE_GRANT_ROLES
        assert sis_roles.CAMPUS_COORDINATOR in sis_roles.ADMIN_ROLES  # ...which is why
