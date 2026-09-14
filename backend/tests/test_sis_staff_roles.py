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
    the finance access the role exists to withhold — the one role they may not
    give or take, now that every role below it is theirs (2026-09-14: "can
    change roles from CC down");
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


def _run(target, roles, actor_id=None, staff_list=None, actor_is_admin=True):
    """Call set_staff_roles against a single stubbed user row.

    `actor_is_admin` is what caller_can_grant_privileged_role answers for the
    actor — True is an org_admin at the keyboard, False a campus coordinator.

    Returns (result, updates) — updates being every payload written to `users`.
    """
    captured = []
    client = Mock()
    client.table.side_effect = lambda name: _table([target] if name == 'users' else [], captured)
    with patch.object(sis_service, '_admin', return_value=client), \
         patch.object(sis_service, 'list_org_staff', return_value=staff_list if staff_list is not None else []), \
         patch.object(sis_service, '_org_name', return_value='iCreate'), \
         patch.object(sis_service, 'caller_can_grant_privileged_role', return_value=actor_is_admin), \
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
    """The route is ADMIN_ROLES; the org_admin boundary is the service's job.

    Until 2026-09-14 the route itself was ROLE_GRANT_ROLES and a coordinator
    could not open the role editor at all. The ask that changed it: "the campus
    coordinator role needs to be able to change the roles of other users. They
    can't change admin or make new users admin, but can change roles from CC
    down." So the door admits the front office and the service refuses the one
    thing a coordinator must not do.
    """

    def test_the_grant_tier_excludes_campus_coordinators(self):
        """The whole point of the role is to withhold the money. A coordinator
        who can grant org_admin grants it to themselves and takes it back."""
        assert sis_roles.CAMPUS_COORDINATOR not in sis_roles.ROLE_GRANT_ROLES

    def test_admins_and_superadmins_may(self):
        assert set(sis_roles.ROLE_GRANT_ROLES) == {'org_admin', 'superadmin'}

    def test_the_route_admits_the_front_office(self):
        """The route is not the gate any more: a coordinator must reach it to
        change anything at all. ROLE_GRANT_ROLES has no business on it."""
        import routes.sis as sis_routes
        assert not hasattr(sis_routes, 'ROLE_GRANT_ROLES')
        assert sis_roles.CAMPUS_COORDINATOR in sis_roles.ADMIN_ROLES


COORDINATOR = dict(actor_id='kate-cc', actor_is_admin=False)


@pytest.mark.unit
class TestWhatACoordinatorMayChange:
    """Everything from campus coordinator down; nothing that touches org_admin."""

    def test_a_coordinator_can_make_a_teacher_a_coordinator(self):
        result, updates = _run(_person(roles=('advisor',)), ['campus_coordinator'], **COORDINATOR)
        assert result.get('error') is None
        assert updates[0]['org_roles'] == ['campus_coordinator']

    def test_a_coordinator_can_make_a_coordinator_a_teacher(self):
        result, updates = _run(_person(roles=('campus_coordinator',)), ['advisor'], **COORDINATOR)
        assert result.get('error') is None
        assert updates[0]['org_roles'] == ['advisor']

    def test_a_coordinator_cannot_grant_admin(self):
        """The self-promotion path, one step removed: grant it to an ally."""
        result, updates = _run(_person(roles=('advisor',)), ['org_admin'],
                               staff_list=ANOTHER_ADMIN, **COORDINATOR)
        assert 'Only an admin' in result['error']
        assert updates == []

    def test_a_coordinator_cannot_grant_themselves_admin(self):
        result, updates = _run(_person('kate-cc', roles=('campus_coordinator',)),
                               ['org_admin', 'campus_coordinator'],
                               staff_list=ANOTHER_ADMIN, **COORDINATOR)
        assert 'Only an admin' in result['error']
        assert updates == []

    def test_a_coordinator_cannot_demote_an_admin(self):
        """Not even to coordinator, not even with another admin left: the
        admin is the person who could undo whatever the coordinator does."""
        result, updates = _run(_person(roles=('org_admin',)), ['campus_coordinator'],
                               staff_list=ANOTHER_ADMIN, **COORDINATOR)
        assert 'Only an admin' in result['error']
        assert updates == []

    def test_a_coordinator_cannot_add_a_role_to_an_admin(self):
        """Keeping org_admin in the list is still a write to an admin's row."""
        result, updates = _run(_person(roles=('org_admin',)), ['org_admin', 'advisor'],
                               staff_list=ANOTHER_ADMIN, **COORDINATOR)
        assert 'Only an admin' in result['error']
        assert updates == []

    def test_the_boundary_is_asked_of_the_actor_not_the_target(self):
        """A coordinator whose target holds NO admin role never triggers the
        lookup at all — the boundary is about org_admin, not about who is
        asking."""
        with patch.object(sis_service, 'caller_can_grant_privileged_role') as gate:
            gate.return_value = False
            captured = []
            client = Mock()
            client.table.side_effect = lambda name: _table([_person(roles=('advisor',))], captured)
            with patch.object(sis_service, '_admin', return_value=client), \
                 patch.object(sis_service, 'list_org_staff', return_value=[]), \
                 patch.object(sis_service, '_org_name', return_value='iCreate'), \
                 patch('services.sis_notifications.notify'):
                result = sis_service.set_staff_roles(ORG, 'kate', ['campus_coordinator'], actor_id='kate-cc')
        assert result.get('error') is None
        gate.assert_not_called()

    def test_no_actor_at_all_cannot_touch_admin(self):
        """A caller that forgot to pass actor_id gets the coordinator's answer,
        not the admin's — the safe default when nobody is accountable."""
        result, updates = _run(_person(roles=('advisor',)), ['org_admin'],
                               actor_id=None, staff_list=ANOTHER_ADMIN)
        assert 'Only an admin' in result['error']
        assert updates == []


def _run_user_role(target, roles, actor_id='kate-cc', actor_is_admin=False):
    """Call update_user_role (PATCH /users/<id>/role — the people-page path,
    which reaches students and parents as well as staff) against one stubbed
    row. Same shape as _run."""
    captured = []
    client = Mock()
    client.table.side_effect = lambda name: _table([target], captured)
    with patch.object(sis_service, '_admin', return_value=client), \
         patch.object(sis_service, 'caller_can_grant_privileged_role', return_value=actor_is_admin):
        result = sis_service.update_user_role(ORG, target['id'], roles=roles, actor_id=actor_id)
    return result, captured


@pytest.mark.unit
class TestTheOtherRolePathHoldsTheSameLine:
    """update_user_role is the second way to change a role — the one the
    people page uses, which is why it always admitted ADMIN_ROLES. It must
    draw the org_admin boundary exactly where set_staff_roles does; two
    endpoints with two rules is how a boundary gets walked around."""

    def test_a_coordinator_can_make_a_parent_a_teacher(self):
        result, updates = _run_user_role(_person(roles=('parent',)), ['advisor', 'parent'])
        assert result.get('error') is None
        assert updates[0]['org_roles'] == ['advisor', 'parent']

    def test_a_coordinator_can_make_a_teacher_a_coordinator(self):
        result, updates = _run_user_role(_person(roles=('advisor',)), ['campus_coordinator'])
        assert result.get('error') is None
        assert updates[0]['org_role'] == 'campus_coordinator'

    def test_a_coordinator_cannot_grant_admin(self):
        result, updates = _run_user_role(_person(roles=('advisor',)), ['org_admin'])
        assert 'not authorized' in result['error']
        assert updates == []

    def test_a_coordinator_cannot_change_an_admin(self):
        result, updates = _run_user_role(_person(roles=('org_admin',)), ['advisor'])
        assert 'not authorized' in result['error']
        assert updates == []

    def test_an_admin_still_can(self):
        result, updates = _run_user_role(_person(roles=('advisor',)), ['org_admin'],
                                         actor_id='molly', actor_is_admin=True)
        assert result.get('error') is None
        assert updates[0]['org_roles'] == ['org_admin']
