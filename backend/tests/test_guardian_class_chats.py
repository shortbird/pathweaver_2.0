"""
A guardian's class chats have to say which child they are about.

Class chats are one group per class, named after the class and nothing else.
That reads fine for a teacher and falls apart for a parent of several children:
an iCreate parent of three sat in 37 "<Class> Parent Chat" rows in one flat
list, several of them sharing a NAME because two of her children take the same
course in different sections. Her report (2026-09-09): "I do not know which
message applies to which one of my children/which classes, so I would have to
look it up before I can even respond."

These tests pin the data the fix rests on: which of the caller's children are in
each class chat, and when that class meets (the only thing that separates two
chats sharing a name). Everything here is best-effort by design — the messaging
list must still render when the extra lookups fail — so that is pinned too.
"""

from unittest.mock import patch

import pytest


class _Resp:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _Query:
    """Fluent stand-in for a supabase-py table query, with real filtering."""

    def __init__(self, table, admin):
        self.table = table
        self.admin = admin
        self._filters = []
        self._count = None
        self._range = None
        self._single = False

    def select(self, *a, **k):
        self._count = k.get('count')
        return self

    def eq(self, col, val):
        self._filters.append(lambda r: r.get(col) == val); return self

    def neq(self, col, val):
        self._filters.append(lambda r: r.get(col) != val); return self

    def gt(self, col, val):
        self._filters.append(lambda r: (r.get(col) or '') > val); return self

    def in_(self, col, vals):
        vals = list(vals)
        self._filters.append(lambda r: r.get(col) in vals); return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def range(self, start, end):
        self._range = (start, end); return self

    def single(self):
        self._single = True; return self

    def execute(self):
        self.admin.reads.append(self.table)
        rows = [r for r in self.admin.rows.get(self.table, [])
                if all(f(r) for f in self._filters)]
        if self._range:
            start, end = self._range
            rows = rows[start:end + 1]
        if self._single:
            # .single() yields the row itself, matching supabase-py.
            return _Resp(rows[0] if rows else None)
        if self._count == 'exact':
            return _Resp(rows, count=len(rows))
        return _Resp(rows)


class _FakeAdmin:
    def __init__(self, rows):
        self.rows = rows
        self.reads = []

    def table(self, name):
        return _Query(name, self)


PARENT = 'parent-1'
ZAYAH = 'child-zayah'
DAXTON = 'child-daxton'
RIVERS = 'child-rivers'
TEACHER = 'teacher-1'

# Two children in the same course in different sections — the case that made the
# list unreadable, because both chats are called "Elementary Microschool
# (Wednesday) Parent Chat".
CLASS_MS_A = 'class-microschool-a'
CLASS_MS_C = 'class-microschool-c'
# Two sections of one course, both taken by the SAME child. Sectioning by child
# does not separate these; only the meeting time does.
CLASS_PE_AM = 'class-pe-am'
CLASS_PE_PM = 'class-pe-pm'
# A class two of the children share.
CLASS_SWORD = 'class-sword'


def _rows(**over):
    base = {
        'users': [
            {'id': ZAYAH, 'first_name': 'Zayah', 'last_name': 'T',
             'display_name': 'Zayah T', 'managed_by_parent_id': PARENT},
            {'id': DAXTON, 'first_name': 'Daxton', 'last_name': 'T',
             'display_name': 'Daxton T', 'managed_by_parent_id': PARENT},
            {'id': RIVERS, 'first_name': 'Rivers', 'last_name': 'T',
             'display_name': 'Rivers T', 'managed_by_parent_id': PARENT},
            {'id': 'other-kid', 'first_name': 'Someone', 'last_name': 'Else',
             'display_name': 'Someone Else', 'managed_by_parent_id': 'parent-9'},
        ],
        'parent_student_links': [],
        'class_enrollments': [
            {'id': 'e1', 'class_id': CLASS_MS_A, 'student_id': ZAYAH, 'status': 'active'},
            {'id': 'e2', 'class_id': CLASS_MS_C, 'student_id': RIVERS, 'status': 'active'},
            {'id': 'e3', 'class_id': CLASS_PE_AM, 'student_id': DAXTON, 'status': 'active'},
            {'id': 'e4', 'class_id': CLASS_PE_PM, 'student_id': DAXTON, 'status': 'active'},
            {'id': 'e5', 'class_id': CLASS_SWORD, 'student_id': DAXTON, 'status': 'active'},
            {'id': 'e6', 'class_id': CLASS_SWORD, 'student_id': RIVERS, 'status': 'active'},
            # A dropped enrollment and another family's child must not appear.
            {'id': 'e7', 'class_id': CLASS_MS_A, 'student_id': DAXTON, 'status': 'dropped'},
            {'id': 'e8', 'class_id': CLASS_MS_A, 'student_id': 'other-kid', 'status': 'active'},
        ],
        'class_meetings': [
            {'class_id': CLASS_PE_AM, 'day_of_week': 2, 'start_time': '09:30:00', 'end_time': '10:30:00'},
            {'class_id': CLASS_PE_PM, 'day_of_week': 2, 'start_time': '14:00:00', 'end_time': '15:00:00'},
            {'class_id': CLASS_MS_A, 'day_of_week': 3, 'start_time': '09:30:00', 'end_time': '12:30:00'},
            {'class_id': CLASS_MS_C, 'day_of_week': 3, 'start_time': '09:30:00', 'end_time': '12:30:00'},
            # A second weekly meeting: the earliest one is the label.
            {'class_id': CLASS_SWORD, 'day_of_week': 4, 'start_time': '13:00:00', 'end_time': '14:00:00'},
            {'class_id': CLASS_SWORD, 'day_of_week': 1, 'start_time': '11:00:00', 'end_time': '12:00:00'},
        ],
    }
    base.update(over)
    return base


def _membership(admin):
    from utils import class_membership as m
    return patch.object(m, '_admin', return_value=admin)


@pytest.mark.unit
class TestChildrenInClasses:
    def test_maps_each_class_to_this_parents_children(self):
        from utils import class_membership as m
        admin = _FakeAdmin(_rows())
        with _membership(admin):
            got = m.children_in_classes(
                PARENT, [CLASS_MS_A, CLASS_MS_C, CLASS_PE_AM, CLASS_SWORD])
        assert got == {
            CLASS_MS_A: {ZAYAH},
            CLASS_MS_C: {RIVERS},
            CLASS_PE_AM: {DAXTON},
            CLASS_SWORD: {DAXTON, RIVERS},
        }

    def test_ignores_dropped_enrollments(self):
        from utils import class_membership as m
        admin = _FakeAdmin(_rows())
        with _membership(admin):
            assert DAXTON not in m.children_in_classes(PARENT, [CLASS_MS_A])[CLASS_MS_A]

    def test_ignores_another_familys_child(self):
        from utils import class_membership as m
        admin = _FakeAdmin(_rows())
        with _membership(admin):
            assert 'other-kid' not in m.children_in_classes(PARENT, [CLASS_MS_A])[CLASS_MS_A]

    def test_empty_for_a_caller_with_no_children(self):
        from utils import class_membership as m
        admin = _FakeAdmin(_rows())
        with _membership(admin):
            assert m.children_in_classes(TEACHER, [CLASS_MS_A]) == {}

    def test_empty_for_no_classes_without_touching_the_database(self):
        from utils import class_membership as m
        admin = _FakeAdmin(_rows())
        with _membership(admin):
            assert m.children_in_classes(PARENT, []) == {}
        assert admin.reads == []

    def test_a_lookup_failure_is_not_fatal(self):
        from utils import class_membership as m
        boom = _FakeAdmin(_rows())
        boom.table = lambda name: (_ for _ in ()).throw(RuntimeError('down'))
        with patch.object(m, '_admin', return_value=boom):
            assert m.children_in_classes(PARENT, [CLASS_MS_A]) == {}


def _groups():
    """The group rows as get_user_groups reads them out of the database."""
    return [
        {'id': 'g-ms-a', 'name': 'Elementary Microschool (Wednesday) Parent Chat',
         'source_class_id': CLASS_MS_A, 'is_active': True, 'last_message_at': None},
        {'id': 'g-ms-c', 'name': 'Elementary Microschool (Wednesday) Parent Chat',
         'source_class_id': CLASS_MS_C, 'is_active': True, 'last_message_at': None},
        {'id': 'g-pe-am', 'name': 'Peak Play PE Parent Chat',
         'source_class_id': CLASS_PE_AM, 'is_active': True, 'last_message_at': None},
        {'id': 'g-pe-pm', 'name': 'Peak Play PE Parent Chat',
         'source_class_id': CLASS_PE_PM, 'is_active': True, 'last_message_at': None},
        {'id': 'g-sword', 'name': 'Sword of Truth Parent Chat',
         'source_class_id': CLASS_SWORD, 'is_active': True, 'last_message_at': None},
        {'id': 'g-announce', 'name': 'School Announcements',
         'source_class_id': None, 'is_active': True, 'last_message_at': None},
    ]


def _service_with(rows, caller):
    """A GroupMessageService whose client reads `rows`, with `caller` a member
    of every group in _groups(). Returns the service plus a second fake for the
    class_membership lookups, which take their own admin client."""
    from services.group_message_service import GroupMessageService

    rows = dict(rows)
    rows['group_conversations'] = _groups()
    rows['group_members'] = [
        {'id': f'gm-{i}', 'group_id': g['id'], 'user_id': caller, 'last_read_at': None}
        for i, g in enumerate(_groups())
    ]
    rows.setdefault('group_messages', [])

    admin = _FakeAdmin(rows)
    service = GroupMessageService()
    service._get_client = lambda: admin
    return service, admin, _FakeAdmin(rows)


@pytest.mark.unit
class TestGuardianGroupList:
    def _list(self, caller=PARENT, rows=None):
        service, admin, mem = _service_with(rows or _rows(), caller)
        with _membership(mem):
            return {g['id']: g for g in service.get_user_groups(caller)}

    def test_each_class_chat_names_the_child_it_is_about(self):
        groups = self._list()
        assert [s['first_name'] for s in groups['g-ms-a']['for_students']] == ['Zayah']
        assert [s['first_name'] for s in groups['g-ms-c']['for_students']] == ['Rivers']

    def test_two_same_named_chats_are_told_apart_by_their_child(self):
        groups = self._list()
        assert groups['g-ms-a']['name'] == groups['g-ms-c']['name']
        assert groups['g-ms-a']['for_students'] != groups['g-ms-c']['for_students']

    def test_two_sections_of_one_course_are_told_apart_by_meeting_time(self):
        groups = self._list()
        # Same name, same child — only the meeting time separates them.
        assert groups['g-pe-am']['name'] == groups['g-pe-pm']['name']
        assert groups['g-pe-am']['class_meeting']['start_time'] == '09:30:00'
        assert groups['g-pe-pm']['class_meeting']['start_time'] == '14:00:00'

    def test_the_earliest_weekly_meeting_is_the_one_reported(self):
        groups = self._list()
        assert groups['g-sword']['class_meeting']['day_of_week'] == 1

    def test_a_shared_class_names_both_children_in_order(self):
        groups = self._list()
        assert [s['first_name'] for s in groups['g-sword']['for_students']] == ['Daxton', 'Rivers']

    def test_a_group_with_no_class_is_left_alone(self):
        groups = self._list()
        assert 'for_students' not in groups['g-announce']
        assert 'class_meeting' not in groups['g-announce']

    def test_a_caller_with_no_children_gets_the_list_unchanged(self):
        groups = self._list(caller=TEACHER)
        assert len(groups) == len(_groups())
        assert all('for_students' not in g for g in groups.values())

    def test_the_list_still_renders_when_the_child_lookup_fails(self):
        from utils import class_membership as m
        service, admin, _ = _service_with(_rows(), PARENT)
        boom = _FakeAdmin(_rows())
        boom.table = lambda name: (_ for _ in ()).throw(RuntimeError('down'))
        with patch.object(m, '_admin', return_value=boom):
            groups = service.get_user_groups(PARENT)
        assert len(groups) == len(_groups())
        assert all('for_students' not in g for g in groups)

    def test_counts_and_unread_are_untouched(self):
        groups = self._list()
        assert all('member_count' in g and 'unread_count' in g for g in groups.values())


@pytest.mark.unit
class TestGuardianGroupDetail:
    """The thread a push notification opens carries the same context. Landing
    there from a notification is exactly the case the report describes."""

    def _get(self, group_id, caller=PARENT):
        service, admin, mem = _service_with(_rows(), caller)
        with _membership(mem):
            return service.get_group(caller, group_id)

    def test_the_thread_header_data_names_the_child(self):
        group = self._get('g-ms-a')
        assert [s['first_name'] for s in group['for_students']] == ['Zayah']
        assert group['class_meeting']['day_of_week'] == 3

    def test_a_thread_with_no_class_is_left_alone(self):
        assert 'for_students' not in self._get('g-announce')

    def test_a_caller_with_no_children_gets_the_thread_unchanged(self):
        group = self._get('g-ms-a', caller=TEACHER)
        assert group['id'] == 'g-ms-a'
        assert 'for_students' not in group
