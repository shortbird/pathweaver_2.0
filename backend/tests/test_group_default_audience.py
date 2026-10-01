"""A group made without a named audience gets one from its members
(GroupMessageService._audience_for_members).

iCreate, ticket 6f9ed4fb (2026-09-30): "There are some 'class chats' in
messages which is good, but it says 'parents' on echo dots - when it was all
sent to teachers." The New group button (POST /api/groups) named no audience,
so its groups took the column default, 'family', and the school inbox filed
teachers' groups with the parents' class chats. What these pin:

  - teachers only -> staff; a teacher who is also a parent is still staff;
  - a parent who is not staff -> family;
  - any student -> student, the screened room, whoever else is in it;
  - an audience the caller names always wins, and nothing is read for it.
"""

from unittest.mock import MagicMock, Mock, patch

import pytest

from services.group_message_service import GroupMessageService

TEACHER = {'id': 't', 'role': 'org_managed', 'org_role': 'advisor', 'org_roles': ['advisor']}
TEACHER_PARENT = {'id': 'tp', 'role': 'org_managed', 'org_role': 'parent',
                  'org_roles': ['parent', 'advisor']}
PARENT = {'id': 'p', 'role': 'org_managed', 'org_role': 'parent', 'org_roles': ['parent']}
STUDENT = {'id': 's', 'role': 'org_managed', 'org_role': 'student', 'org_roles': ['student']}


def _db(rows):
    db = MagicMock()
    q = db.table.return_value.select.return_value.in_.return_value
    q.execute.return_value = Mock(data=rows)
    return db


def _audience(rows):
    return GroupMessageService()._audience_for_members(_db(rows), [r['id'] for r in rows])


@pytest.mark.unit
class TestAudienceForMembers:
    def test_teachers_make_a_staff_room(self):
        assert _audience([TEACHER]) == 'staff'

    def test_a_teacher_who_is_also_a_parent_is_staff(self):
        """The Echo Dots case: three of the teachers were also guardians."""
        assert _audience([TEACHER, TEACHER_PARENT]) == 'staff'

    def test_a_parent_makes_a_family_room(self):
        assert _audience([TEACHER, PARENT]) == 'family'

    def test_a_student_makes_a_student_room_whoever_else_is_in_it(self):
        assert _audience([TEACHER, PARENT, STUDENT]) == 'student'

    def test_no_members_is_a_staff_room(self):
        assert GroupMessageService()._audience_for_members(MagicMock(), []) == 'staff'

    def test_an_unreadable_member_list_leaves_the_column_default(self):
        db = MagicMock()
        db.table.side_effect = RuntimeError('db down')
        assert GroupMessageService()._audience_for_members(db, ['t']) is None


@pytest.mark.unit
class TestCreateGroupAudience:
    def _create(self, **kwargs):
        svc = GroupMessageService()
        db = MagicMock()
        db.table.return_value.select.return_value.eq.return_value.single.return_value \
            .execute.return_value = Mock(data={'organization_id': 'org-1', 'role': 'org_managed'})
        with patch.object(svc, '_get_client', return_value=db), \
             patch.object(svc, 'can_create_group', return_value=True), \
             patch.object(svc, '_insert_group', side_effect=lambda _db, g, m: g) as insert, \
             patch.object(svc, 'add_member'), \
             patch.object(svc, '_audience_for_members', return_value='staff') as derive:
            group = svc.create_group('t', 'Echo Dots', member_ids=['a', 'b'], **kwargs)
        return group, derive, insert

    def test_a_group_with_no_audience_named_takes_its_members(self):
        group, derive, _ = self._create()
        assert group['audience'] == 'staff'
        assert derive.call_args.args[1] == ['a', 'b']

    def test_a_named_audience_wins_and_nothing_is_derived(self):
        group, derive, _ = self._create(audience='family')
        assert group['audience'] == 'family'
        derive.assert_not_called()
