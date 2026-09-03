"""
The extra columns the People CSV export offers: guardians, family phone, and
emergency contacts.

iCreate, 2026-08-18: "a way to ... download user information as CSV files."

The interesting part is not the columns, it is where emergency contacts live.
A school records them once, on the family's registration, filed by whichever
guardian filled the form in. But the list that actually gets used is a list of
CHILDREN — the field trip, the after-school pickup — so a contact filed by a
parent has to come back out against every member of that household.

That mapping (registration -> guardian -> household -> everyone in it) is the
whole of what can go wrong here, so it is what is tested.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_service


ORG = 'org-1'

HOUSEHOLDS = [{'id': 'hh-1', 'name': 'Swenson', 'phone': '435-555-0100'},
              {'id': 'hh-2', 'name': 'Candland', 'phone': None}]

MEMBERS = [
    {'id': 'm1', 'household_id': 'hh-1', 'user_id': 'parent-1',
     'relationship': 'guardian', 'is_primary_guardian': True},
    {'id': 'm2', 'household_id': 'hh-1', 'user_id': 'student-1',
     'relationship': 'student', 'is_primary_guardian': False},
    {'id': 'm3', 'household_id': 'hh-2', 'user_id': 'parent-2',
     'relationship': 'guardian', 'is_primary_guardian': True},
]

GUARDIAN_USERS = [
    {'id': 'parent-1', 'first_name': 'Erin', 'last_name': 'Swenson',
     'display_name': None, 'email': 'erin@example.com', 'phone_number': '435-555-0101'},
    {'id': 'parent-2', 'first_name': 'Nora', 'last_name': 'Candland',
     'display_name': None, 'email': 'nora@example.com', 'phone_number': None},
]

CONTACTS_OLD = [{'name': 'Old Contact', 'phone': '111', 'relationship': 'Aunt'}]
CONTACTS_NEW = [{'name': 'Sam Reed', 'phone': '435-555-0111',
                 'relationship': 'Aunt', 'can_pickup': True}]


def _run(registrations):
    """Stub every read roster_export_details makes."""
    def _table(name):
        t = Mock()
        for chained in ('select', 'eq', 'in_', 'order', 'range'):
            getattr(t, chained).return_value = t
        data = {
            'households': HOUSEHOLDS,
            'household_members': MEMBERS,
            'users': GUARDIAN_USERS,
            'registrations': registrations,
        }.get(name, [])
        t.execute.return_value = Mock(data=data)
        return t
    admin = Mock()
    admin.table.side_effect = _table
    # fetch_all_rows pages until a short page comes back; these stubs return the
    # same rows for any range, so it is stubbed to one call per query.
    with patch.object(sis_service, '_admin', return_value=admin), \
         patch('utils.db_fetch.fetch_all_rows',
               side_effect=lambda build, **kw: build().execute().data or []):
        return sis_service.roster_export_details(ORG)


@pytest.mark.unit
class TestRosterExportDetails:

    def test_guardians_come_back_against_the_household(self):
        out = _run([])
        assert out['student-1']['guardians'] == [
            {'name': 'Erin Swenson', 'email': 'erin@example.com',
             'phone': '435-555-0101', 'is_primary': True}]

    def test_the_family_phone_rides_along(self):
        out = _run([])
        assert out['student-1']['household_phone'] == '435-555-0100'
        assert out['parent-2']['household_phone'] is None

    def test_emergency_contacts_land_on_the_child_not_just_the_parent(self):
        """The list that gets printed is a list of children."""
        out = _run([{'id': 'r1', 'parent_user_id': 'parent-1',
                     'emergency_contacts': CONTACTS_NEW, 'created_at': '2026-01-01'}])
        assert out['student-1']['emergency_contacts'] == CONTACTS_NEW
        assert out['parent-1']['emergency_contacts'] == CONTACTS_NEW

    def test_a_later_registration_wins(self):
        """A family who re-registered means the new list, not both and not the
        one that happened to be read first."""
        out = _run([
            {'id': 'r1', 'parent_user_id': 'parent-1',
             'emergency_contacts': CONTACTS_OLD, 'created_at': '2025-01-01'},
            {'id': 'r2', 'parent_user_id': 'parent-1',
             'emergency_contacts': CONTACTS_NEW, 'created_at': '2026-01-01'},
        ])
        assert out['student-1']['emergency_contacts'] == CONTACTS_NEW

    def test_a_family_that_never_registered_simply_has_none(self):
        out = _run([])
        assert out['parent-2']['emergency_contacts'] == []

    def test_a_registration_from_outside_any_household_is_ignored(self):
        out = _run([{'id': 'r1', 'parent_user_id': 'nobody',
                     'emergency_contacts': CONTACTS_NEW, 'created_at': '2026-01-01'}])
        assert all(v['emergency_contacts'] == [] for v in out.values())

    def test_an_org_with_no_households_returns_nothing_rather_than_querying_on(self):
        def _table(name):
            t = Mock()
            for chained in ('select', 'eq', 'in_', 'order', 'range'):
                getattr(t, chained).return_value = t
            t.execute.return_value = Mock(data=[])
            return t
        admin = Mock()
        admin.table.side_effect = _table
        with patch.object(sis_service, '_admin', return_value=admin), \
             patch('utils.db_fetch.fetch_all_rows',
                   side_effect=lambda build, **kw: build().execute().data or []):
            assert sis_service.roster_export_details(ORG) == {}

    def test_org_wide_reads_are_paged(self):
        """Every read here grows with the school. An emergency-contact list that
        silently drops its last families is worse than not having one — see
        CLAUDE.md on PostgREST's 1000-row truncation."""
        calls = []

        def _table(name):
            t = Mock()
            for chained in ('select', 'eq', 'in_', 'order', 'range'):
                getattr(t, chained).return_value = t
            t.execute.return_value = Mock(data={
                'households': HOUSEHOLDS, 'household_members': MEMBERS,
                'users': GUARDIAN_USERS, 'registrations': [],
            }.get(name, []))
            return t
        admin = Mock()
        admin.table.side_effect = _table

        def _spy(build, **kw):
            rows = build().execute().data or []
            calls.append(len(rows))
            return rows

        with patch.object(sis_service, '_admin', return_value=admin), \
             patch('utils.db_fetch.fetch_all_rows', side_effect=_spy):
            sis_service.roster_export_details(ORG)
        # households, household_members, registrations
        assert len(calls) == 3
