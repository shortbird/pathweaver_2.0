"""
A school's adults are contacts of each other (2026-08-27).

Until this change the only thing that connected two families in Messages was an
ACTIVE carpool post, so a parent could reach the families advertising a ride and
nobody else — and the board carried its own one-shot composer to do it with. An
iCreate parent wrote in: "The carpool board doesn't let me send messages... is
there another way to reach out to parents about carpool?"

Under test here: who counts as an adult of a school (sis_service.org_adults) and
what the Messages contact list does with them.
"""

from unittest.mock import Mock, patch

import pytest


class _Query:
    """Enough of a supabase-py builder for the reads under test: eq/in_ filter
    the fake table by the column they name, so the org-scoped pass and the
    by-id household pass see genuinely different rows."""

    def __init__(self, table, tables):
        self._table = table
        self._tables = tables
        self._filters = []

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._filters.append(lambda r: r.get(col) == val)
        return self

    def in_(self, col, vals):
        wanted = set(vals)
        self._filters.append(lambda r: r.get(col) in wanted)
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def range(self, *_a, **_k):
        return self

    def execute(self):
        rows = [r for r in self._tables.get(self._table, [])
                if all(f(r) for f in self._filters)]
        return Mock(data=rows)


def _client(tables):
    c = Mock()
    c.table.side_effect = lambda name: _Query(name, tables)
    return c


ORG = 'org-1'

# One school: staff, guardians, students, an observer, and one guardian whose own
# row carries no organization_id (a platform parent — a member through their
# child, and the reason the households pass exists at all).
def _member(uid, first, last, org_role, organization_id=ORG):
    return {'id': uid, 'first_name': first, 'last_name': last,
            'role': 'org_managed', 'org_role': org_role,
            'organization_id': organization_id}


_TABLES = {
    'users': [
        _member('admin-1', 'Ada', 'Ng', 'org_admin'),
        _member('coord-1', 'Cal', 'Ruiz', 'campus_coordinator'),
        _member('teach-1', 'Tam', 'Ito', 'advisor'),
        _member('parent-1', 'Dana', 'Cole', 'parent'),
        _member('parent-2', 'Sam', 'Reyes', 'parent'),
        _member('student-1', 'Kit', 'Cole', 'student'),
        _member('observer-1', 'Gran', 'Cole', 'observer'),
        # No organization_id of their own: a member of the school through the
        # household their child is in, and invisible to the org-scoped read.
        {'id': 'parent-3', 'first_name': 'Noor', 'last_name': 'Aziz',
         'role': 'parent', 'org_role': None, 'organization_id': None},
    ],
    'households': [{'id': 'hh-1', 'organization_id': ORG}],
    'household_members': [
        {'household_id': 'hh-1', 'user_id': 'parent-3', 'relationship': 'guardian'},
        {'household_id': 'hh-1', 'user_id': 'student-1', 'relationship': 'student'},
    ],
}


def _org_adults():
    from services import sis_service
    with patch.object(sis_service, '_admin', side_effect=lambda: _client(_TABLES)), \
         patch.object(sis_service, 'fetch_all_rows',
                      side_effect=lambda build, **kw: build().execute().data):
        return sis_service.org_adults(ORG)


@pytest.mark.unit
class TestOrgAdults:
    """Who the school's adults are."""

    def test_guardians_and_staff_are_all_adults(self):
        ids = {a['id'] for a in _org_adults()}
        assert {'admin-1', 'coord-1', 'teach-1', 'parent-1', 'parent-2'} <= ids

    def test_students_are_never_adults(self):
        assert 'student-1' not in {a['id'] for a in _org_adults()}

    def test_observers_are_not_part_of_the_parent_body(self):
        """An observer is linked to one student, not to the school. They keep
        their narrower contacts and stay out of everyone else's."""
        assert 'observer-1' not in {a['id'] for a in _org_adults()}

    def test_a_platform_parent_is_a_member_through_their_household(self):
        """Their own users row has no organization_id, so the org-scoped read
        misses them entirely — the school's own parent body would be short."""
        adults = {a['id']: a for a in _org_adults()}
        assert 'parent-3' in adults
        assert adults['parent-3']['org_role'] == 'parent'

    def test_the_student_in_that_household_still_does_not_come_along(self):
        assert 'student-1' not in {a['id'] for a in _org_adults()}

    def test_they_are_listed_by_name(self):
        names = [f"{a['first_name']} {a['last_name']}" for a in _org_adults()]
        assert names == sorted(names, key=str.lower)


@pytest.mark.unit
class TestOrgAdultContacts:
    """What the Messages contact list does with them."""

    def _contacts(self, user_role, existing=None, org=ORG):
        from routes import direct_messages
        from services import sis_service
        contacts = list(existing or [])
        with patch.object(sis_service, 'member_org_id', return_value=org), \
             patch.object(sis_service, 'org_adults', return_value=[
                 {'id': 'parent-1', 'first_name': 'Dana', 'last_name': 'Cole',
                  'display_name': None, 'avatar_url': None, 'org_role': 'parent'},
                 {'id': 'teach-1', 'first_name': 'Tam', 'last_name': 'Ito',
                  'display_name': None, 'avatar_url': None, 'org_role': 'advisor'},
             ]):
            direct_messages._append_org_adult_contacts(
                Mock(), contacts, 'me', user_role)
        return contacts

    def test_a_parent_gets_the_rest_of_the_school(self):
        ids = {c['id'] for c in self._contacts('parent')}
        assert ids == {'parent-1', 'teach-1'}

    def test_each_one_carries_the_role_to_show_them_under(self):
        by_id = {c['id']: c for c in self._contacts('parent')}
        assert by_id['parent-1']['relationship'] == 'parent'
        assert by_id['teach-1']['relationship'] == 'advisor'

    def test_a_student_gets_nobody(self):
        assert self._contacts('student') == []

    def test_an_observer_gets_nobody(self):
        assert self._contacts('observer') == []

    def test_a_platform_user_with_no_school_gets_nobody(self):
        assert self._contacts('parent', org=None) == []

    def test_the_caller_is_never_their_own_contact(self):
        from routes import direct_messages
        from services import sis_service
        contacts = []
        with patch.object(sis_service, 'member_org_id', return_value=ORG), \
             patch.object(sis_service, 'org_adults', return_value=[
                 {'id': 'me', 'first_name': 'Me', 'last_name': 'Myself',
                  'display_name': None, 'avatar_url': None, 'org_role': 'parent'},
             ]):
            direct_messages._append_org_adult_contacts(Mock(), contacts, 'me', 'parent')
        assert contacts == []

    def test_a_more_specific_relationship_already_in_the_list_wins(self):
        """A child's own teacher is 'advisor' because they teach that child, not
        because they both happen to be at the school. The earlier branch's
        relationship is what the list shows."""
        existing = [{'id': 'teach-1', 'relationship': 'advisor', 'first_name': 'Tam'}]
        rows = [c for c in self._contacts('parent', existing=existing)
                if c['id'] == 'teach-1']
        assert len(rows) == 1
        assert rows[0] is existing[0]

    def test_a_school_roster_that_fails_does_not_empty_the_inbox(self):
        from routes import direct_messages
        from services import sis_service
        contacts = [{'id': 'child-1', 'relationship': 'child'}]
        with patch.object(sis_service, 'member_org_id', side_effect=RuntimeError('down')):
            direct_messages._append_org_adult_contacts(Mock(), contacts, 'me', 'parent')
        assert contacts == [{'id': 'child-1', 'relationship': 'child'}]
