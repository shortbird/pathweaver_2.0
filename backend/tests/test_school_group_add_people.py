"""The school can add people to a group thread it owns.

Ticket 0b85c3f1 (iCreate, org admin): "We need a way to add someone to a group
thread who is not already on it."

A group sent from the console's Compose as "one group thread" belongs to the
school-inbox account (GroupMessageService.create_school_group), which is its
only admin. POST /api/groups/<id>/members asks for a group admin, so nobody in
the office could add anybody, and the console hid the settings gear on a
school group. The fix is the office's own door,
POST /api/school-inbox/groups/<id>/members: the group must be the school's
(school_group_access), the caller must be on the school's inbox
(inbox_access), and the person must be one of the school's people -- the same
set Compose may put in a school group (message_compose_service.people_kinds).
"""

from unittest.mock import Mock, patch

import pytest

from services import school_inbox_service
from services.group_message_service import GroupMessageService

ORG_ID = 'org-1'
ORG = {'id': ORG_ID, 'name': 'iCreate', 'is_active': True, 'inbox_user_id': 'inbox-1'}
GROUP = 'grp-1'
TEACHER = 'teacher-1'
PARENT = 'parent-1'
STUDENT = 'student-1'
OUTSIDER = 'other-school-teacher'
ALREADY = 'already-in'

KINDS = {TEACHER: 'staff', PARENT: 'family', STUDENT: 'student', ALREADY: 'staff'}


class _Table:
    def __init__(self, db, name):
        self.db, self.name, self._payload, self._op = db, name, None, 'select'

    def __getattr__(self, attr):
        return lambda *a, **k: self

    def insert(self, payload):
        self._op, self._payload = 'insert', payload
        return self

    def update(self, payload):
        self._op, self._payload = 'update', payload
        return self

    def execute(self):
        if self._op == 'insert':
            self.db.inserts.append((self.name, self._payload))
            return Mock(data=[self._payload])
        if self._op == 'update':
            self.db.updates.append((self.name, self._payload))
            return Mock(data=[])
        return Mock(data=self.db.reads.get(self.name, []))


class _Db:
    def __init__(self, reads=None):
        self.reads = reads or {}
        self.inserts, self.updates = [], []

    def table(self, name):
        return _Table(self, name)


def _svc(db):
    svc = GroupMessageService()
    svc._get_client = lambda: db
    return svc


def _members_db():
    return _Db({'group_members': [{'user_id': 'inbox-1'}, {'user_id': ALREADY}]})


@pytest.fixture
def kinds():
    with patch('services.message_compose_service.people_kinds', return_value=dict(KINDS)):
        yield


# ── The rule: who may be added ───────────────────────────────────────────────

@pytest.mark.unit
class TestAddSchoolMember:
    def test_a_colleague_is_added_and_the_actor_is_recorded(self, kinds):
        db = _members_db()
        _svc(db).add_school_member(ORG_ID, GROUP, 'kate', TEACHER, group_audience='staff')
        rows = [p for t, p in db.inserts if t == 'group_members']
        assert len(rows) == 1
        assert rows[0]['user_id'] == TEACHER
        assert rows[0]['role'] == 'member'
        assert rows[0]['added_by'] == 'kate'
        # A colleague does not change what the room is.
        assert db.updates == []

    def test_someone_from_another_school_is_refused_and_nothing_is_written(self, kinds):
        db = _members_db()
        with pytest.raises(ValueError):
            _svc(db).add_school_member(ORG_ID, GROUP, 'kate', OUTSIDER, group_audience='staff')
        assert db.inserts == [] and db.updates == []

    def test_someone_already_in_it_is_refused(self, kinds):
        db = _members_db()
        with pytest.raises(ValueError):
            _svc(db).add_school_member(ORG_ID, GROUP, 'kate', ALREADY, group_audience='staff')
        assert db.inserts == []

    def test_a_student_turns_a_staff_room_into_a_student_room(self, kinds):
        """The room is filed the way Compose files a mixed room: a student in
        it makes it a student room, whose adults' words are screened."""
        db = _members_db()
        _svc(db).add_school_member(ORG_ID, GROUP, 'kate', STUDENT, group_audience='staff')
        assert ('group_conversations', {'audience': 'student'}) in db.updates

    def test_a_parent_never_steps_a_student_room_back_down(self, kinds):
        db = _members_db()
        _svc(db).add_school_member(ORG_ID, GROUP, 'kate', PARENT, group_audience='student')
        assert db.updates == []

    def test_the_picker_offers_the_schools_people_minus_the_members(self, kinds):
        db = _members_db()
        with patch('repositories.school_thread_repository.SchoolThreadRepository.user_names',
                   return_value={TEACHER: {'first_name': 'Ada'}}):
            people = _svc(db).school_available_members(ORG_ID, GROUP)
        ids = {p['id'] for p in people}
        assert ids == {TEACHER, PARENT, STUDENT}
        assert next(p for p in people if p['id'] == TEACHER)['first_name'] == 'Ada'


# ── The route gate ───────────────────────────────────────────────────────────

def _role_client(org_role='org_admin'):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'role': 'org_managed', 'org_role': org_role,
                                             'org_roles': None}])
    return client


ACCESS = {'group': {'id': GROUP, 'audience': 'staff'}, 'org': ORG,
          'inbox_user_id': 'inbox-1', 'via': 'office'}


def _post(client, headers, who=TEACHER):
    return client.post(f'/api/school-inbox/groups/{GROUP}/members',
                       headers=headers, json={'user_id': who})


@pytest.mark.unit
class TestRoute:
    def _run(self, client, headers, *, access, on_inbox, who=TEACHER):
        svc = Mock()
        svc.add_school_member.return_value = {'id': 'm-1'}
        with patch('database.get_supabase_admin_client', return_value=_role_client()), \
             patch.object(school_inbox_service, 'school_group_access', return_value=access), \
             patch.object(school_inbox_service, 'inbox_access', return_value=on_inbox), \
             patch('routes.school_inbox.group_service', svc):
            resp = _post(client, headers, who)
        return resp, svc

    def test_a_group_the_school_does_not_own_is_refused(self, client, auth_headers,
                                                         mock_verify_token):
        resp, svc = self._run(client, auth_headers, access=None, on_inbox=True)
        assert resp.status_code == 404
        svc.add_school_member.assert_not_called()

    def test_a_caller_off_the_inbox_is_refused(self, client, auth_headers, mock_verify_token):
        resp, svc = self._run(client, auth_headers, access=ACCESS, on_inbox=False)
        assert resp.status_code == 403
        svc.add_school_member.assert_not_called()

    def test_the_office_adds_through_the_rule(self, client, auth_headers, mock_verify_token):
        resp, svc = self._run(client, auth_headers, access=ACCESS, on_inbox=True)
        assert resp.status_code == 201
        svc.add_school_member.assert_called_once_with(
            ORG_ID, GROUP, 'test-user-123', TEACHER, group_audience='staff')

    def test_another_schools_person_is_a_400_and_nothing_is_written(
            self, client, auth_headers, mock_verify_token, kinds):
        db = _members_db()
        with patch('database.get_supabase_admin_client', return_value=_role_client()), \
             patch.object(school_inbox_service, 'school_group_access', return_value=ACCESS), \
             patch.object(school_inbox_service, 'inbox_access', return_value=True), \
             patch('routes.school_inbox.group_service', _svc(db)):
            resp = _post(client, auth_headers, OUTSIDER)
        assert resp.status_code == 400
        assert db.inserts == [] and db.updates == []
