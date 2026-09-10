"""Household guardians count as guardians when a class chat is built.

class_group_sync_service builds each class's "<Class> Parent Chat" from
class_membership.parents_of_students, which composes on guardians_by_student.
That helper knew two of the three parent-child links and not the third --
household_members, which is exactly the one the SIS registration funnel writes.

So at iCreate the chat existed, the teacher posted in it, and most of the
families it was for were never members. Nobody saw an error; the room was just
emptier than anyone realised.
"""

from unittest.mock import Mock, patch

import pytest

from utils import class_membership

KID_A = 'kid-a'
KID_B = 'kid-b'
GUARDIAN = 'guardian-1'
CO_GUARDIAN = 'guardian-2'
GRANDPARENT = 'grandparent-1'
MANAGING_PARENT = 'managing-parent'
LINKED_PARENT = 'linked-parent'


def _client(*, users=(), links=(), household_students=(), household_guardians=()):
    """A double that answers by table, and for household_members by the
    `relationship` filter the caller applied."""
    def _table(name):
        t = Mock()
        state = {}

        def _eq(column, value):
            state[column] = value
            return t

        def _in(column, values):
            state[column] = list(values)
            return t

        def _execute():
            if name == 'users':
                return Mock(data=list(users))
            if name == 'parent_student_links':
                return Mock(data=list(links))
            if name == 'household_members':
                rel = state.get('relationship')
                if rel == 'student':
                    return Mock(data=list(household_students))
                return Mock(data=list(household_guardians))
            return Mock(data=[])

        t.select.return_value = t
        t.eq.side_effect = _eq
        t.in_.side_effect = _in
        t.execute.side_effect = _execute
        return t

    client = Mock()
    client.table.side_effect = _table
    return client


@pytest.mark.unit
class TestGuardiansByStudent:
    def test_a_household_guardian_is_found(self):
        client = _client(
            users=[{'id': KID_A, 'managed_by_parent_id': None}],
            household_students=[{'household_id': 'h1', 'user_id': KID_A}],
            household_guardians=[{'household_id': 'h1', 'user_id': GUARDIAN}],
        )
        with patch.object(class_membership, '_admin', return_value=client):
            assert class_membership.guardians_by_student([KID_A]) == {KID_A: {GUARDIAN}}

    def test_every_guardian_of_the_household_is_found(self):
        """Two parents and a grandparent. 'other' is a guardian relationship --
        the funnel writes it for the grandparent or aunt who registered."""
        client = _client(
            users=[{'id': KID_A, 'managed_by_parent_id': None}],
            household_students=[{'household_id': 'h1', 'user_id': KID_A}],
            household_guardians=[
                {'household_id': 'h1', 'user_id': GUARDIAN},
                {'household_id': 'h1', 'user_id': CO_GUARDIAN},
                {'household_id': 'h1', 'user_id': GRANDPARENT},
            ],
        )
        with patch.object(class_membership, '_admin', return_value=client):
            found = class_membership.guardians_by_student([KID_A])
        assert found == {KID_A: {GUARDIAN, CO_GUARDIAN, GRANDPARENT}}

    def test_siblings_in_one_household_each_get_the_guardians(self):
        client = _client(
            users=[{'id': KID_A, 'managed_by_parent_id': None},
                   {'id': KID_B, 'managed_by_parent_id': None}],
            household_students=[{'household_id': 'h1', 'user_id': KID_A},
                                {'household_id': 'h1', 'user_id': KID_B}],
            household_guardians=[{'household_id': 'h1', 'user_id': GUARDIAN}],
        )
        with patch.object(class_membership, '_admin', return_value=client):
            found = class_membership.guardians_by_student([KID_A, KID_B])
        assert found == {KID_A: {GUARDIAN}, KID_B: {GUARDIAN}}

    def test_the_household_link_is_unioned_with_the_other_two(self):
        client = _client(
            users=[{'id': KID_A, 'managed_by_parent_id': MANAGING_PARENT}],
            links=[{'parent_user_id': LINKED_PARENT, 'student_user_id': KID_A}],
            household_students=[{'household_id': 'h1', 'user_id': KID_A}],
            household_guardians=[{'household_id': 'h1', 'user_id': GUARDIAN}],
        )
        with patch.object(class_membership, '_admin', return_value=client):
            found = class_membership.guardians_by_student([KID_A])
        assert found == {KID_A: {MANAGING_PARENT, LINKED_PARENT, GUARDIAN}}

    def test_a_student_is_never_their_own_guardian(self):
        """A household holds students and guardians in the same table; a row
        with the same user on both sides would put the child in the parent chat."""
        client = _client(
            users=[{'id': KID_A, 'managed_by_parent_id': None}],
            household_students=[{'household_id': 'h1', 'user_id': KID_A}],
            household_guardians=[{'household_id': 'h1', 'user_id': KID_A},
                                 {'household_id': 'h1', 'user_id': GUARDIAN}],
        )
        with patch.object(class_membership, '_admin', return_value=client):
            found = class_membership.guardians_by_student([KID_A])
        assert found == {KID_A: {GUARDIAN}}

    def test_no_household_rows_means_no_extra_queries(self):
        client = _client(users=[{'id': KID_A, 'managed_by_parent_id': None}])
        with patch.object(class_membership, '_admin', return_value=client):
            assert class_membership.guardians_by_student([KID_A]) == {}
        tables = [c[0][0] for c in client.table.call_args_list]
        # users, parent_student_links, household_members (the student read).
        # The guardians read is skipped when no student is in any household.
        assert tables.count('household_members') == 1

    def test_a_lookup_failure_returns_what_was_found(self):
        client = _client(users=[{'id': KID_A, 'managed_by_parent_id': MANAGING_PARENT}])
        original = client.table.side_effect

        def _explode(name):
            if name == 'household_members':
                raise RuntimeError('boom')
            return original(name)

        client.table.side_effect = _explode
        with patch.object(class_membership, '_admin', return_value=client):
            assert class_membership.guardians_by_student([KID_A]) == {KID_A: {MANAGING_PARENT}}

    def test_no_students_asks_nothing(self):
        with patch.object(class_membership, '_admin') as admin:
            assert class_membership.guardians_by_student([]) == {}
        admin.assert_not_called()


@pytest.mark.unit
class TestChildrenOfParent:
    def test_a_household_guardians_children_are_found(self):
        client = _client(
            household_guardians=[{'household_id': 'h1'}],
            household_students=[{'user_id': KID_A}, {'user_id': KID_B}],
        )
        with patch.object(class_membership, '_admin', return_value=client):
            assert class_membership.children_of_parent(GUARDIAN) == {KID_A, KID_B}

    def test_all_three_links_are_unioned(self):
        client = _client(
            users=[{'id': KID_A}],
            links=[{'student_user_id': KID_B}],
            household_guardians=[{'household_id': 'h1'}],
            household_students=[{'user_id': 'kid-c'}],
        )
        with patch.object(class_membership, '_admin', return_value=client):
            assert class_membership.children_of_parent(GUARDIAN) == {KID_A, KID_B, 'kid-c'}

    def test_the_caller_is_never_their_own_child(self):
        client = _client(
            household_guardians=[{'household_id': 'h1'}],
            household_students=[{'user_id': GUARDIAN}, {'user_id': KID_A}],
        )
        with patch.object(class_membership, '_admin', return_value=client):
            assert class_membership.children_of_parent(GUARDIAN) == {KID_A}

    def test_nobody_has_no_children(self):
        with patch.object(class_membership, '_admin') as admin:
            assert class_membership.children_of_parent('') == set()
        admin.assert_not_called()


@pytest.mark.unit
class TestParentsOfStudents:
    def test_it_composes_on_guardians_by_student(self):
        """parents_of_students is what class_group_sync_service calls, so this
        is the line the parent chat actually walks."""
        with patch.object(class_membership, 'guardians_by_student',
                          return_value={KID_A: {GUARDIAN}, KID_B: {GUARDIAN, CO_GUARDIAN}}):
            assert class_membership.parents_of_students([KID_A, KID_B]) == \
                {GUARDIAN, CO_GUARDIAN}
