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
            self.admin.inserts.extend((self.table, p) for p in payload)
            return _Resp([{**p, 'id': 'new-id'} for p in payload])
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

    def table(self, name):
        return _Query(name, self)


TEACHER = 'teacher-1'
ASSISTANT = 'assistant-1'
ADVISOR = 'advisor-1'
STUDENT = 'student-1'
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
class TestClassGroupSync:
    def test_primary_instructor_joins_the_class_chat_as_admin(self):
        from utils import class_membership as m
        from services import class_group_sync_service as sync

        admin = _FakeAdmin(_rows())
        with _membership(admin), patch.object(sync, '_admin', return_value=admin):
            group_id = sync.sync_class_group(CLASS, actor_id=TEACHER)

        assert group_id == 'new-id'
        members = {p['user_id']: p['role'] for t, p in admin.inserts if t == 'group_members'}
        assert members[TEACHER] == 'admin'
        assert members[ASSISTANT] == 'admin'
        assert members[ADVISOR] == 'admin'
        assert members[STUDENT] == 'member'
        assert 'dropped-1' not in members

    def test_existing_group_gains_the_missing_teachers(self):
        from utils import class_membership as m
        from services import class_group_sync_service as sync

        rows = _rows(
            group_conversations=[{'id': 'g1', 'source_class_id': CLASS, 'is_active': True}],
            group_members=[{'id': 'gm1', 'group_id': 'g1', 'user_id': STUDENT, 'role': 'member'}],
        )
        admin = _FakeAdmin(rows)
        with _membership(admin), patch.object(sync, '_admin', return_value=admin):
            group_id = sync.sync_class_group(CLASS, actor_id=TEACHER)

        assert group_id == 'g1'
        added = {p['user_id'] for t, p in admin.inserts if t == 'group_members'}
        assert added == {TEACHER, ASSISTANT, ADVISOR}
        # The student who was already there is neither re-added nor removed.
        assert not admin.deletes


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
             patch('services.class_group_sync_service.sync_class_group', return_value=None), \
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
