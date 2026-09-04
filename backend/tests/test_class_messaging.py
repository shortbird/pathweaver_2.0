"""
Class messaging: who counts as a class's teacher, and who may DM whom.

The SIS assigns a teacher on the class itself (org_classes.primary_instructor_id,
assistant_instructor_ids); class_advisors is the older link table and is nearly
empty in practice. Messaging used to read class_advisors ALONE, which meant every
class chat was built with students only — 184 class chats on prod, zero teachers
in any of them — and a teacher had no relationship that let them DM a student.

These tests pin the fix: all three teacher sources count, and a shared class
roster is a messaging relationship in both directions.
"""

from unittest.mock import patch

import pytest


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    """Fluent stand-in for a supabase-py table query, with real filtering so a
    test can tell 'this teacher's classes' from 'every class'."""

    def __init__(self, table, admin):
        self.table = table
        self.admin = admin
        self._op = 'select'
        self._payload = None
        self._filters = []
        self._single = False

    def select(self, *a, **k):
        self._op = 'select'; return self

    def insert(self, payload):
        self._op = 'insert'; self._payload = payload; return self

    def update(self, payload):
        self._op = 'update'; self._payload = payload; return self

    def delete(self):
        self._op = 'delete'; return self

    def eq(self, col, val):
        self._filters.append(lambda r: r.get(col) == val); return self

    def in_(self, col, vals):
        self._filters.append(lambda r: r.get(col) in vals); return self

    def contains(self, col, vals):
        self._filters.append(lambda r: all(v in (r.get(col) or []) for v in vals)); return self

    def not_(self, *a, **k):
        return self

    def or_(self, *a, **k):
        # Only used for the block check, which these tests keep empty.
        self._filters.append(lambda r: False); return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def single(self):
        self._single = True; return self

    def execute(self):
        if self._op == 'insert':
            payload = self._payload if isinstance(self._payload, list) else [self._payload]
            out = []
            for p in payload:
                self.admin.seq += 1
                self.admin.inserts.append((self.table, p))
                out.append({**p, 'id': f'new-{self.admin.seq}'})
            return _Resp(out)
        rows = [r for r in self.admin.rows.get(self.table, [])
                if all(f(r) for f in self._filters)]
        if self._op == 'update':
            self.admin.updates.append((self.table, self._payload))
            return _Resp(rows)
        if self._op == 'delete':
            self.admin.deletes.extend((self.table, r) for r in rows)
            return _Resp(rows)
        if self._single:
            # .single() yields the row itself, matching supabase-py.
            return _Resp(rows[0] if rows else None)
        return _Resp(rows)


class _FakeAdmin:
    def __init__(self, rows):
        self.rows = rows
        self.inserts = []
        self.updates = []
        self.deletes = []
        self.seq = 0

    def table(self, name):
        return _Query(name, self)


TEACHER = 'teacher-1'
ASSISTANT = 'assistant-1'
ADVISOR = 'advisor-1'
STUDENT = 'student-1'
PARENT = 'parent-1'
LINKED_PARENT = 'parent-2'
OUTSIDER = 'student-9'
CLASS = 'class-1'


def _rows(**over):
    base = {
        'org_classes': [
            {'id': CLASS, 'name': 'Musical Theater', 'organization_id': 'org1',
             'primary_instructor_id': TEACHER, 'assistant_instructor_ids': [ASSISTANT]},
            {'id': 'class-2', 'name': 'Other', 'organization_id': 'org1',
             'primary_instructor_id': 'someone-else', 'assistant_instructor_ids': []},
        ],
        'class_advisors': [
            {'id': 'ca1', 'class_id': CLASS, 'advisor_id': ADVISOR, 'is_active': True},
            {'id': 'ca2', 'class_id': CLASS, 'advisor_id': 'former-1', 'is_active': False},
        ],
        'class_enrollments': [
            {'id': 'e1', 'class_id': CLASS, 'student_id': STUDENT, 'status': 'active'},
            {'id': 'e2', 'class_id': CLASS, 'student_id': 'dropped-1', 'status': 'dropped'},
            {'id': 'e3', 'class_id': 'class-2', 'student_id': OUTSIDER, 'status': 'active'},
        ],
        'group_conversations': [],
        'group_members': [],
        'users': [
            {'id': STUDENT, 'managed_by_parent_id': PARENT},
            {'id': 'dropped-1', 'managed_by_parent_id': 'parent-of-dropped'},
            {'id': OUTSIDER, 'managed_by_parent_id': None},
        ],
        'parent_student_links': [
            {'id': 'psl1', 'student_user_id': STUDENT,
             'parent_user_id': LINKED_PARENT, 'status': 'approved'},
            {'id': 'psl2', 'student_user_id': STUDENT,
             'parent_user_id': 'parent-unapproved', 'status': 'pending'},
        ],
    }
    base.update(over)
    return base


def _membership(admin):
    from utils import class_membership as m
    return patch.object(m, '_admin', return_value=admin)


@pytest.mark.unit
class TestClassTeachers:
    def test_counts_primary_assistant_and_active_advisors(self):
        from utils import class_membership as m
        admin = _FakeAdmin(_rows())
        with _membership(admin):
            assert m.class_teacher_ids(CLASS) == {TEACHER, ASSISTANT, ADVISOR}

    def test_ignores_inactive_advisor_rows(self):
        from utils import class_membership as m
        admin = _FakeAdmin(_rows())
        with _membership(admin):
            assert 'former-1' not in m.class_teacher_ids(CLASS)

    def test_students_are_the_active_enrollments(self):
        from utils import class_membership as m
        admin = _FakeAdmin(_rows())
        with _membership(admin):
            assert m.class_student_ids(CLASS) == {STUDENT}

    def test_teacher_class_ids_covers_every_assignment_style(self):
        from utils import class_membership as m
        admin = _FakeAdmin(_rows())
        with _membership(admin):
            assert m.teacher_class_ids(TEACHER) == {CLASS}
            assert m.teacher_class_ids(ASSISTANT) == {CLASS}
            assert m.teacher_class_ids(ADVISOR) == {CLASS}

    def test_shares_class_both_directions_and_not_for_outsiders(self):
        from utils import class_membership as m
        admin = _FakeAdmin(_rows())
        with _membership(admin):
            assert m.shares_class(TEACHER, STUDENT) is True
            assert m.shares_class(ASSISTANT, STUDENT) is True
            # shares_class is directional by design (teacher first); the caller
            # checks both orders.
            assert m.shares_class(STUDENT, TEACHER) is False
            assert m.shares_class(TEACHER, OUTSIDER) is False

    def test_rosters_resolve_from_either_end(self):
        from utils import class_membership as m
        admin = _FakeAdmin(_rows())
        with _membership(admin):
            assert m.students_taught_by(TEACHER) == {STUDENT}
            assert m.teachers_of_student(STUDENT) == {TEACHER, ASSISTANT, ADVISOR}

    def test_a_lookup_failure_is_never_fatal(self):
        from utils import class_membership as m

        class _Boom:
            def table(self, *a, **k):
                raise RuntimeError('supabase down')

        with patch.object(m, '_admin', return_value=_Boom()):
            assert m.class_teacher_ids(CLASS) == set()
            assert m.shares_class(TEACHER, STUDENT) is False


@pytest.mark.unit
class TestGuardiansOfStudents:
    def test_both_link_types_count_and_pending_links_do_not(self):
        from utils import class_membership as m
        admin = _FakeAdmin(_rows())
        with _membership(admin):
            assert m.parents_of_students({STUDENT}) == {PARENT, LINKED_PARENT}

    def test_no_students_no_guardians(self):
        from utils import class_membership as m
        admin = _FakeAdmin(_rows())
        with _membership(admin):
            assert m.parents_of_students(set()) == set()


def _members_of(admin, group_id):
    return {p['user_id']: p['role'] for t, p in admin.inserts
            if t == 'group_members' and p['group_id'] == group_id}


@pytest.mark.unit
class TestClassGroupSync:
    """A class carries two chats (2026-08-31): the family chat holds the adults
    — teachers (admin) + guardians of active students (member), students
    deliberately not in it (2026-08-22) — and the student chat holds the
    students + teachers."""

    def test_two_chats_each_holds_only_its_audience(self):
        from services import class_group_sync_service as sync

        admin = _FakeAdmin(_rows())
        with _membership(admin), patch.object(sync, '_admin', return_value=admin):
            res = sync.sync_class_groups(CLASS, actor_id=TEACHER)

        fam, stu = res['family'], res['student']
        assert fam and stu and fam != stu
        audiences = {p['audience']: p['name'] for t, p in admin.inserts
                     if t == 'group_conversations'}
        assert audiences == {'family': 'Musical Theater Parent Chat',
                             'student': 'Musical Theater Student Chat'}

        fam_members = _members_of(admin, fam)
        assert fam_members[TEACHER] == 'admin'
        assert fam_members[ASSISTANT] == 'admin'
        assert fam_members[ADVISOR] == 'admin'
        assert fam_members[PARENT] == 'member'
        assert fam_members[LINKED_PARENT] == 'member'
        assert STUDENT not in fam_members
        assert 'parent-unapproved' not in fam_members
        assert 'parent-of-dropped' not in fam_members

        stu_members = _members_of(admin, stu)
        assert stu_members[STUDENT] == 'member'
        assert stu_members[TEACHER] == 'admin'
        assert stu_members[ASSISTANT] == 'admin'
        assert stu_members[ADVISOR] == 'admin'
        assert PARENT not in stu_members
        assert LINKED_PARENT not in stu_members
        assert 'dropped-1' not in stu_members

    def test_back_compat_wrapper_returns_the_family_chat(self):
        from services import class_group_sync_service as sync

        admin = _FakeAdmin(_rows())
        with _membership(admin), patch.object(sync, '_admin', return_value=admin):
            group_id = sync.sync_class_group(CLASS, actor_id=TEACHER)
        fam = next(p for t, p in admin.inserts
                   if t == 'group_conversations' and p['audience'] == 'family')
        assert group_id is not None
        assert fam['source_class_id'] == CLASS

    def test_existing_family_group_sheds_students_and_gains_the_adults(self):
        from services import class_group_sync_service as sync

        rows = _rows(
            group_conversations=[{'id': 'g1', 'source_class_id': CLASS,
                                  'audience': 'family', 'is_active': True}],
            group_members=[{'id': 'gm1', 'group_id': 'g1', 'user_id': STUDENT, 'role': 'member'}],
        )
        admin = _FakeAdmin(rows)
        with _membership(admin), patch.object(sync, '_admin', return_value=admin):
            res = sync.sync_class_groups(CLASS, actor_id=TEACHER)

        assert res['family'] == 'g1'
        added = set(_members_of(admin, 'g1'))
        assert added == {TEACHER, ASSISTANT, ADVISOR, PARENT, LINKED_PARENT}
        # The student from the old membership model is swept out of the family
        # chat on resync — and lands in the student chat instead.
        assert [r['user_id'] for t, r in admin.deletes if t == 'group_members'] == [STUDENT]
        assert _members_of(admin, res['student'])[STUDENT] == 'member'

    # iCreate, 2026-09-03: a teacher wrote to her students in the parent chat
    # for two days. Both chats were "<Class> ... Chat" and the adults' one was
    # the one that read like the class's. Groups already created keep drifting
    # under the old name unless a resync corrects it.
    def test_an_existing_class_chat_is_renamed_to_say_it_is_the_parents(self):
        from services import class_group_sync_service as sync

        rows = _rows(
            group_conversations=[{'id': 'g1', 'source_class_id': CLASS,
                                  'audience': 'family', 'is_active': True,
                                  'name': 'Musical Theater Class Chat'}],
        )
        admin = _FakeAdmin(rows)
        with _membership(admin), patch.object(sync, '_admin', return_value=admin):
            sync.sync_class_groups(CLASS, actor_id=TEACHER)

        renames = [p for t, p in admin.updates
                   if t == 'group_conversations' and 'name' in p]
        assert renames == [{'name': 'Musical Theater Parent Chat'}]

    def test_a_name_the_school_chose_is_left_alone(self):
        from services import class_group_sync_service as sync

        rows = _rows(
            group_conversations=[{'id': 'g1', 'source_class_id': CLASS,
                                  'audience': 'family', 'is_active': True,
                                  'name': 'Theater Families 26-27'}],
        )
        admin = _FakeAdmin(rows)
        with _membership(admin), patch.object(sync, '_admin', return_value=admin):
            sync.sync_class_groups(CLASS, actor_id=TEACHER)

        assert not [p for t, p in admin.updates
                    if t == 'group_conversations' and 'name' in p]

    def test_a_guardian_who_teaches_the_class_is_admin_not_member(self):
        from services import class_group_sync_service as sync

        rows = _rows()
        # The primary teacher is also the student's guardian.
        rows['users'] = [
            {'id': STUDENT, 'managed_by_parent_id': TEACHER},
            {'id': 'dropped-1', 'managed_by_parent_id': None},
        ]
        rows['parent_student_links'] = []
        admin = _FakeAdmin(rows)
        with _membership(admin), patch.object(sync, '_admin', return_value=admin):
            res = sync.sync_class_groups(CLASS, actor_id=TEACHER)

        assert _members_of(admin, res['family'])[TEACHER] == 'admin'


@pytest.mark.unit
class TestClassMessagingEndpoint:
    """GET /api/sis/teacher/classes/<id>/messaging — who the tab offers to DM."""

    def _call(self, viewer, rows=None, scope=None):
        from flask import Flask
        from routes.sis import staff_portal

        admin = _FakeAdmin(rows or _rows())
        app = Flask(__name__)
        app.config['TESTING'] = True
        app.register_blueprint(staff_portal.bp)

        # @require_role is already bound at import time, so authenticate through
        # it: the session resolves to `viewer`, whose users row carries the role.
        from utils.auth import decorators as auth_decorators
        users = admin.rows.setdefault('users', [])
        existing = next((u for u in users if u['id'] == viewer), None)
        if existing:
            existing.update({'role': 'org_managed', 'org_role': 'advisor'})
        else:
            users.append({'id': viewer, 'role': 'org_managed', 'org_role': 'advisor',
                          'email': f'{viewer}@school.org', 'first_name': 'Viewer', 'last_name': ''})

        with patch.object(auth_decorators.session_manager, 'get_effective_user_id',
                          return_value=viewer), \
             patch('database.get_supabase_admin_client', return_value=admin), \
             patch.object(staff_portal, 'get_supabase_admin_client', return_value=admin), \
             patch.object(staff_portal.sis_service, 'resolve_org_id', return_value='org1'), \
             patch.object(staff_portal.sis_service, 'class_scope', return_value=scope), \
             patch.object(staff_portal.sis_service, 'is_placeholder_staff_email',
                          side_effect=lambda e: bool(e) and 'placeholder' in e), \
             patch('services.class_group_sync_service.sync_class_groups',
                   return_value={'family': None, 'student': None}), \
             _membership(admin):
            resp = app.test_client().get(
                f'/api/sis/teacher/classes/{CLASS}/messaging?organization_id=org1')
        return resp.get_json()

    def _rows_with_users(self):
        rows = _rows()
        rows['users'] = [
            {'id': TEACHER, 'first_name': 'Liz', 'last_name': '', 'email': 'liz@school.org'},
            {'id': ASSISTANT, 'first_name': 'Sam', 'last_name': 'Reed', 'email': 'sam@school.org'},
            {'id': ADVISOR, 'first_name': 'Placeholder', 'last_name': 'Teacher',
             'email': 'tbd@icreate-staff.placeholder.optioeducation.com'},
            {'id': STUDENT, 'first_name': 'Christian', 'last_name': 'Tiberius', 'email': 's@x.com'},
        ]
        return rows

    def test_a_teacher_never_sees_themselves(self):
        body = self._call(TEACHER, self._rows_with_users(), scope=[CLASS])
        assert TEACHER not in [t['id'] for t in body['teachers']]
        assert 'Sam Reed' in [t['name'] for t in body['teachers']]

    def test_an_admin_browsing_gets_no_teacher_dm_shortcuts(self):
        # scope=None means org_admin/superadmin. The class page is the teacher's
        # workspace; offering to DM its teacher there reads as messaging yourself.
        body = self._call('admin-1', self._rows_with_users(), scope=None)
        assert body['teachers'] == []

    def test_placeholder_staff_are_never_offered_as_dm_targets(self):
        body = self._call(TEACHER, self._rows_with_users(), scope=[CLASS])
        assert ADVISOR not in [t['id'] for t in body['teachers']]

    def test_only_active_students_are_listed(self):
        rows = self._rows_with_users()
        rows['class_enrollments'].append(
            {'id': 'e4', 'class_id': CLASS, 'student_id': 'withdrawn-1', 'status': 'withdrawn'})
        body = self._call(TEACHER, rows, scope=[CLASS])
        assert [s['id'] for s in body['students']] == [STUDENT]


@pytest.mark.unit
class TestDirectMessagePermission:
    def _service(self, admin):
        from services.direct_message_service import DirectMessageService
        svc = DirectMessageService()
        return svc, patch.object(svc, '_get_client', return_value=admin)

    def _blank_admin(self):
        rows = _rows()
        rows.update({
            'user_blocks': [],
            'users': [
                {'id': TEACHER, 'role': 'org_managed', 'org_role': 'advisor', 'organization_id': 'org1'},
                {'id': STUDENT, 'role': 'org_managed', 'org_role': 'student', 'organization_id': 'org1'},
                {'id': OUTSIDER, 'role': 'org_managed', 'org_role': 'student', 'organization_id': 'org1'},
            ],
            'advisor_student_assignments': [],
            'parent_student_links': [],
            'observer_student_links': [],
        })
        return _FakeAdmin(rows)

    def test_a_shared_class_lets_teacher_and_student_message_each_other(self):
        from utils import class_membership as m
        admin = self._blank_admin()
        svc, client_patch = self._service(admin)
        with client_patch, patch.object(m, '_admin', return_value=admin):
            assert svc.can_message_user(TEACHER, STUDENT) is True
            assert svc.can_message_user(STUDENT, TEACHER) is True

    def test_no_shared_class_is_still_denied(self):
        from utils import class_membership as m
        admin = self._blank_admin()
        svc, client_patch = self._service(admin)
        with client_patch, patch.object(m, '_admin', return_value=admin):
            assert svc.can_message_user(TEACHER, OUTSIDER) is False

    def test_a_teacher_and_their_students_guardian_can_dm(self):
        from utils import class_membership as m
        admin = self._blank_admin()
        admin.rows['users'].append(
            {'id': PARENT, 'role': 'parent', 'org_role': None, 'organization_id': 'org1'})
        # STUDENT (in TEACHER's class) is managed by PARENT.
        for u in admin.rows['users']:
            if u['id'] == STUDENT:
                u['managed_by_parent_id'] = PARENT
        svc, client_patch = self._service(admin)
        with client_patch, patch.object(m, '_admin', return_value=admin):
            assert svc.can_message_user(TEACHER, PARENT) is True
            assert svc.can_message_user(PARENT, TEACHER) is True

    def test_a_guardian_with_no_child_in_the_class_is_denied(self):
        from utils import class_membership as m
        admin = self._blank_admin()
        admin.rows['users'].append(
            {'id': 'stranger-parent', 'role': 'parent', 'org_role': None, 'organization_id': 'org1'})
        svc, client_patch = self._service(admin)
        with client_patch, patch.object(m, '_admin', return_value=admin):
            assert svc.can_message_user(TEACHER, 'stranger-parent') is False
