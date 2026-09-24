"""A school quest opens by direct link only for those who may see it.

Owner decision, 2026-09-24. Quest discovery hid a school quest nobody assigned
(fd9a5019), but GET /api/quests/<id> and POST /api/quests/<id>/enroll answered
for any active quest -- another school's included -- to anyone holding the
id. services/quest_visibility_service.may_open_quest is the one rule both
doors (and the task library, pickup and the family enroll-children route) now
ask; a refusal is the same 404 as a quest that does not exist.
"""

import inspect
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask
from postgrest.exceptions import APIError

import repositories.quest_repository as quest_repository
from repositories.quest_repository import QuestRepository, course_is_open_to
from routes.quest import detail, enrollment
from services import quest_visibility_service as visibility

SCHOOL = '11111111-1111-4111-8111-111111111111'
OTHER_SCHOOL = '22222222-2222-4222-8222-222222222222'
STUDENT = '33333333-3333-4333-8333-333333333333'
FOREIGN_STUDENT = '44444444-4444-4444-8444-444444444444'
TEACHER = '55555555-5555-4555-8555-555555555555'
PARENT = '66666666-6666-4666-8666-666666666666'
SUPERADMIN = '77777777-7777-4777-8777-777777777777'
OBSERVER = '88888888-8888-4888-8888-888888888888'
QUEST = '99999999-9999-4999-8999-999999999999'


def _org_user(uid, org, role):
    return {'id': uid, 'role': 'org_managed', 'org_role': role, 'org_roles': [role],
            'organization_id': org}


USERS = {
    STUDENT: _org_user(STUDENT, SCHOOL, 'student'),
    FOREIGN_STUDENT: _org_user(FOREIGN_STUDENT, OTHER_SCHOOL, 'student'),
    TEACHER: _org_user(TEACHER, SCHOOL, 'advisor'),
    # A platform parent: no org of their own, linked to STUDENT.
    PARENT: {'id': PARENT, 'role': 'parent', 'org_role': None, 'org_roles': None,
             'organization_id': None},
    SUPERADMIN: {'id': SUPERADMIN, 'role': 'superadmin', 'org_role': None,
                 'org_roles': None, 'organization_id': None},
    OBSERVER: {'id': OBSERVER, 'role': 'observer', 'org_role': None, 'org_roles': None,
               'organization_id': None},
}


class FakeRepo:
    """The four reads the rule makes, answered from a small world."""

    def __init__(self, assigned=False, enrolled=(), course_users=(), quest=None):
        self.assigned = assigned
        self.enrolled = set(enrolled)
        self.course_users = set(course_users)
        self.quest = quest

    def get_visibility_user(self, user_id):
        return USERS.get(user_id)

    def has_any_enrollment(self, user_id, quest_id):
        return user_id in self.enrolled

    def is_quest_assigned(self, quest_id):
        return self.assigned

    def reachable_through_course(self, user_id, user_org_id, quest_id):
        return user_id in self.course_users

    def find_by_id(self, quest_id):
        return self.quest

    def enrolled_user_ids(self, quest_id, limit=25):
        return sorted(self.enrolled)[:limit]


def _school_quest(org=SCHOOL, created_by=TEACHER):
    return {'id': QUEST, 'title': 'Bridge Building', 'organization_id': org,
            'created_by': created_by, 'is_active': True, 'is_public': False,
            'quest_type': 'optio', 'allow_custom_tasks': True}


def _global_quest():
    """A catalog quest: global and public. A global quest that is NOT public
    is someone's own, and has its own rule (test_quest_access_gaps.py)."""
    return dict(_school_quest(), organization_id=None, is_public=True, created_by=TEACHER)


@pytest.fixture(autouse=True)
def _relationships():
    """No one is linked to anyone unless a test says so."""
    with patch('utils.class_membership.children_of_parent', return_value=set()), \
            patch('utils.portfolio_access.students_observed_by', return_value=set()):
        yield


@pytest.fixture(autouse=True)
def _reset_field_cache():
    quest_repository._assigned_field_missing_until = 0.0
    yield
    quest_repository._assigned_field_missing_until = 0.0


# ── the rule ──────────────────────────────────────────────────────────────────

@pytest.mark.unit
@pytest.mark.parametrize('caller, repo, expected', [
    (STUDENT, FakeRepo(assigned=False), False),                        # same org, unassigned
    (STUDENT, FakeRepo(assigned=True), True),                          # same org, assigned
    (STUDENT, FakeRepo(assigned=False, enrolled={STUDENT}), True),     # enrolled, unassigned
    (FOREIGN_STUDENT, FakeRepo(assigned=True), False),                 # other org
    (FOREIGN_STUDENT, FakeRepo(enrolled={FOREIGN_STUDENT}), True),     # other org, enrolled
    (TEACHER, FakeRepo(assigned=False), True),                         # staff of that school
    (SUPERADMIN, FakeRepo(assigned=False), True),
    (STUDENT, FakeRepo(course_users={STUDENT}), True),                 # in its course
    (PARENT, FakeRepo(assigned=True), False),                          # not linked, no org
])
def test_the_rule(caller, repo, expected):
    assert visibility.may_open_quest(caller, _school_quest(), repo=repo) is expected


@pytest.mark.unit
def test_staff_of_another_school_are_not_exempt():
    staff_elsewhere = '12121212-1212-4121-8121-121212121212'
    USERS[staff_elsewhere] = _org_user(staff_elsewhere, OTHER_SCHOOL, 'org_admin')
    try:
        assert not visibility.may_open_quest(staff_elsewhere, _school_quest(),
                                             repo=FakeRepo(assigned=True))
    finally:
        del USERS[staff_elsewhere]


@pytest.mark.unit
def test_the_creator_may_open_their_quest():
    assert visibility.may_open_quest(STUDENT, _school_quest(created_by=STUDENT),
                                     repo=FakeRepo())


@pytest.mark.unit
def test_a_public_global_quest_is_not_judged_at_all():
    repo = MagicMock()
    assert visibility.may_open_quest(FOREIGN_STUDENT, _global_quest(), repo=repo)
    assert repo.method_calls == []


@pytest.mark.unit
def test_family_scope_asks_about_the_child():
    repo = FakeRepo(enrolled={STUDENT})
    assert visibility.may_open_quest(PARENT, _school_quest(), subject_id=STUDENT, repo=repo)


@pytest.mark.unit
def test_a_parent_without_family_scope_opens_their_childs_quest():
    with patch('utils.class_membership.children_of_parent', return_value={STUDENT}):
        assert visibility.may_open_quest(PARENT, _school_quest(),
                                         repo=FakeRepo(enrolled={STUDENT}))
        # ...and a quest the child's school assigned.
        assert visibility.may_open_quest(PARENT, _school_quest(),
                                         repo=FakeRepo(assigned=True))
        # ...but not one the child could not open either.
        assert not visibility.may_open_quest(PARENT, _school_quest(), repo=FakeRepo())


@pytest.mark.unit
def test_an_observer_opens_their_students_quest():
    with patch('utils.portfolio_access.students_observed_by', return_value={STUDENT}):
        assert visibility.may_open_quest(OBSERVER, _school_quest(),
                                         repo=FakeRepo(enrolled={STUDENT}))


@pytest.mark.unit
def test_enrollment_does_not_widen_to_other_children():
    """A sibling's claim does not put another child on the quest."""
    sibling = '13131313-1313-4131-8131-131313131313'
    USERS[sibling] = _org_user(sibling, OTHER_SCHOOL, 'student')
    try:
        with patch('utils.class_membership.children_of_parent', return_value={STUDENT, sibling}):
            assert not visibility.may_open_quest(
                PARENT, _school_quest(), subject_id=sibling,
                include_linked_students=False, repo=FakeRepo(enrolled={STUDENT}))
    finally:
        del USERS[sibling]


# ── the repository reads ──────────────────────────────────────────────────────

class _Chain:
    def __init__(self, data=None, error=None):
        self._data, self._error = data, error

    def __getattr__(self, _name):
        return lambda *a, **k: self

    def execute(self):
        if self._error:
            raise self._error
        return MagicMock(data=self._data)


@pytest.mark.unit
def test_assigned_is_read_from_the_computed_field():
    client = MagicMock()
    client.table.return_value = _Chain([{'id': QUEST, 'quest_is_assigned': False}])
    assert QuestRepository(client=client).is_quest_assigned(QUEST) is False
    client.table.return_value = _Chain([{'id': QUEST, 'quest_is_assigned': True}])
    assert QuestRepository(client=client).is_quest_assigned(QUEST) is True


@pytest.mark.unit
def test_a_missing_function_counts_as_assigned_and_is_remembered():
    missing = APIError({'code': '42703', 'message': 'column quests.quest_is_assigned does not exist',
                        'details': None, 'hint': None})
    client = MagicMock()
    client.table.return_value = _Chain(error=missing)
    repo = QuestRepository(client=client)

    assert repo.is_quest_assigned(QUEST) is True
    client.table.reset_mock()
    assert repo.is_quest_assigned(QUEST) is True
    client.table.assert_not_called()


@pytest.mark.unit
def test_other_errors_are_not_mistaken_for_a_missing_function():
    client = MagicMock()
    client.table.return_value = _Chain(error=APIError({
        'code': '57014', 'message': 'statement timeout', 'details': None, 'hint': None}))
    with pytest.raises(APIError):
        QuestRepository(client=client).is_quest_assigned(QUEST)


@pytest.mark.unit
@pytest.mark.parametrize('course, org, expected', [
    ({'status': 'published', 'organization_id': SCHOOL, 'visibility': 'organization'}, SCHOOL, True),
    ({'status': 'draft', 'organization_id': SCHOOL, 'visibility': 'organization'}, SCHOOL, False),
    ({'status': 'published', 'organization_id': SCHOOL, 'visibility': 'organization'}, OTHER_SCHOOL, False),
    ({'status': 'published', 'organization_id': SCHOOL, 'visibility': 'public'}, OTHER_SCHOOL, True),
    ({'status': 'published', 'organization_id': None, 'visibility': 'organization'}, None, True),
])
def test_course_is_open_to(course, org, expected):
    assert course_is_open_to(course, org) is expected


@pytest.mark.unit
def test_course_reach_through_enrollment_in_a_draft_course():
    draft = {'id': 'c1', 'organization_id': SCHOOL, 'status': 'draft', 'visibility': 'organization'}
    tables = {
        'course_quests': [{'course_id': 'c1', 'is_published': True, 'courses': draft}],
        'course_enrollments': [{'id': 'ce1'}],
    }
    client = MagicMock()
    client.table.side_effect = lambda name: _Chain(tables[name])
    assert QuestRepository(client=client).reachable_through_course(STUDENT, SCHOOL, QUEST)

    tables['course_enrollments'] = []
    assert not QuestRepository(client=client).reachable_through_course(STUDENT, SCHOOL, QUEST)


@pytest.mark.unit
def test_an_unpublished_project_is_not_reached_through_its_course():
    course = {'id': 'c1', 'organization_id': SCHOOL, 'status': 'published', 'visibility': 'organization'}
    client = MagicMock()
    client.table.side_effect = lambda name: _Chain(
        [{'course_id': 'c1', 'is_published': False, 'courses': course}]
        if name == 'course_quests' else [{'id': 'ce1'}])
    assert not QuestRepository(client=client).reachable_through_course(STUDENT, SCHOOL, QUEST)


# ── GET /api/quests/<id> ──────────────────────────────────────────────────────

class _Query:
    def __init__(self, rows):
        self._rows = rows

    def __getattr__(self, _name):
        return lambda *a, **k: self

    def execute(self):
        return MagicMock(data=self._rows, count=0)


def _detail_admin(quest):
    rows = {'quests': dict(quest, course_quests=[])}
    client = MagicMock()
    client.table.side_effect = lambda name: _Query(rows.get(name, []))
    return client


def _get_detail(caller, quest, repo, student_id=None):
    app = Flask(__name__)
    subject = student_id or caller
    with app.test_request_context(f'/api/quests/{QUEST}'), \
            patch.object(detail, 'get_supabase_admin_client', return_value=_detail_admin(quest)), \
            patch.object(detail, 'resolve_student_scope', return_value=subject), \
            patch.object(detail, 'guardian_capabilities', return_value={}), \
            patch.object(visibility, 'QuestRepository', return_value=repo), \
            patch('routes.quest_types.get_template_tasks', return_value=[]), \
            patch('routes.quest_types.get_sample_tasks_for_quest', return_value=[]), \
            patch('routes.quest_types.get_course_tasks_for_quest', return_value=[]), \
            patch('services.interest_tracks_service.InterestTracksService.get_quest_moments',
                  return_value={'success': True, 'moments': []}):
        response = detail.get_quest_detail.__wrapped__(caller, QUEST)
    if isinstance(response, tuple):
        return response[0].get_json(), response[1]
    return response.get_json(), 200


@pytest.mark.unit
@pytest.mark.parametrize('caller, repo, quest, student_id, status', [
    (STUDENT, FakeRepo(assigned=False), _school_quest(), None, 404),
    (STUDENT, FakeRepo(assigned=True), _school_quest(), None, 200),
    (STUDENT, FakeRepo(enrolled={STUDENT}), _school_quest(), None, 200),
    (FOREIGN_STUDENT, FakeRepo(assigned=True), _school_quest(), None, 404),
    (TEACHER, FakeRepo(), _school_quest(), None, 200),
    (PARENT, FakeRepo(enrolled={STUDENT}), _school_quest(), STUDENT, 200),
    (STUDENT, FakeRepo(course_users={STUDENT}), _school_quest(), None, 200),
    (FOREIGN_STUDENT, FakeRepo(), _global_quest(), None, 200),
], ids=['unassigned', 'assigned', 'enrolled-unassigned', 'other-org', 'staff',
        'parent-of-enrolled-child', 'course-member', 'global-unchanged'])
def test_quest_detail(caller, repo, quest, student_id, status):
    payload, got = _get_detail(caller, quest, repo, student_id)
    assert got == status, payload
    if status == 404:
        # Exactly what a missing quest answers: nothing about the quest leaks.
        assert payload == {'success': False, 'error': 'Quest not found'}
    else:
        assert payload['quest']['id'] == QUEST


@pytest.mark.unit
def test_quest_detail_missing_quest_is_a_404():
    app = Flask(__name__)
    client = MagicMock()
    client.table.side_effect = lambda name: _Query(None)
    with app.test_request_context(f'/api/quests/{QUEST}'), \
            patch.object(detail, 'get_supabase_admin_client', return_value=client), \
            patch.object(detail, 'resolve_student_scope', return_value=STUDENT):
        response, status = detail.get_quest_detail.__wrapped__(STUDENT, QUEST)
    assert status == 404
    assert response.get_json() == {'success': False, 'error': 'Quest not found'}


# ── POST /api/quests/<id>/enroll ──────────────────────────────────────────────

def _enroll(caller, quest, repo, student_id=None):
    from utils.guardian_scope import StudentScope
    subject = student_id or caller
    scope = StudentScope(caller_id=caller, student_id=subject,
                         via='parent' if student_id else 'self')

    quest_repo = MagicMock()
    quest_repo.find_by_id.return_value = quest
    quest_repo.client.table.side_effect = lambda name: _Query([])
    quest_repo.enroll_user.return_value = {'id': 'enrollment-1'}
    for name in ('get_visibility_user', 'has_any_enrollment', 'is_quest_assigned',
                 'reachable_through_course'):
        setattr(quest_repo, name, getattr(repo, name))

    admin = MagicMock()
    admin.table.side_effect = lambda name: _Query(USERS.get(caller))

    view = inspect.unwrap(enrollment.enroll_in_quest)
    app = Flask(__name__)
    with app.test_request_context(f'/api/quests/{QUEST}/enroll', method='POST', json={}), \
            patch.object(enrollment, 'current_student_scope', return_value=scope), \
            patch.object(enrollment, 'get_supabase_admin_client', return_value=admin), \
            patch.object(enrollment, 'QuestRepository', return_value=quest_repo), \
            patch('routes.quest_types.get_quest_task_summary', return_value={'total_tasks': 0}):
        response = view(subject, QUEST)
    body, status = (response if isinstance(response, tuple) else (response, 200))
    return body.get_json(), status, quest_repo


@pytest.mark.unit
@pytest.mark.parametrize('caller, repo, quest, student_id, status', [
    (STUDENT, FakeRepo(assigned=False), _school_quest(), None, 404),
    (STUDENT, FakeRepo(assigned=True), _school_quest(), None, 200),
    (STUDENT, FakeRepo(enrolled={STUDENT}), _school_quest(), None, 200),
    (FOREIGN_STUDENT, FakeRepo(assigned=True), _school_quest(), None, 404),
    (TEACHER, FakeRepo(), _school_quest(), None, 200),
    (PARENT, FakeRepo(enrolled={STUDENT}), _school_quest(), STUDENT, 200),
    (STUDENT, FakeRepo(course_users={STUDENT}), _school_quest(), None, 200),
    (FOREIGN_STUDENT, FakeRepo(), _global_quest(), None, 200),
], ids=['unassigned', 'assigned', 'enrolled-unassigned', 'other-org', 'staff',
        'parent-of-enrolled-child', 'course-member', 'global-unchanged'])
def test_quest_enroll(caller, repo, quest, student_id, status):
    payload, got, quest_repo = _enroll(caller, quest, repo, student_id)
    assert got == status, payload
    if status == 404:
        assert payload['error']['code'] == 'QUEST_NOT_FOUND'
        quest_repo.enroll_user.assert_not_called()
    else:
        quest_repo.enroll_user.assert_called_once()


@pytest.mark.unit
def test_an_inactive_foreign_quest_does_not_reveal_itself():
    payload, status, _ = _enroll(FOREIGN_STUDENT, dict(_school_quest(), is_active=False),
                                 FakeRepo(assigned=True))
    assert status == 404
    assert payload['error']['code'] == 'QUEST_NOT_FOUND'


# ── pickup: the other door that creates an enrollment ─────────────────────────

@pytest.mark.unit
def test_first_pickup_of_an_unassigned_school_quest_is_a_404():
    from services.quest_lifecycle_service import QuestLifecycleService
    service = QuestLifecycleService(user_client=MagicMock(), admin_client=MagicMock())
    with patch.object(service, 'get_quest', return_value={'id': QUEST, 'quest_type': 'optio'}), \
            patch.object(service, 'get_user_quest', return_value=None), \
            patch.object(service, '_pickup_new_quest') as new_pickup, \
            patch.object(visibility, 'QuestRepository',
                         return_value=FakeRepo(quest=_school_quest())):
        result = service.pickup_quest(STUDENT, QUEST)
    assert result == {'error': 'Quest not found', 'status': 404}
    new_pickup.assert_not_called()


# ── POST /api/family/quests/<id>/enroll-children ──────────────────────────────

@pytest.mark.unit
@pytest.mark.parametrize('repo, enrolled', [
    (FakeRepo(assigned=False), False),
    (FakeRepo(assigned=True), True),
], ids=['unassigned', 'assigned'])
def test_a_parent_cannot_put_a_child_on_an_unassigned_school_quest(repo, enrolled):
    from routes import family_quests

    rows = {
        'quests': {'id': QUEST, 'created_by': TEACHER, 'is_public': False,
                   'organization_id': SCHOOL},
        'users': [{'id': PARENT, 'role': 'parent', 'organization_id': SCHOOL}],
    }
    admin = MagicMock()
    admin.table.side_effect = lambda name: _Query(rows.get(name, []))
    quest_repo = MagicMock()
    quest_repo.enroll_user.return_value = {'id': 'enrollment-1'}

    view = inspect.unwrap(family_quests.enroll_children_in_family_quest)
    app = Flask(__name__)
    with app.test_request_context(f'/api/family/quests/{QUEST}/enroll-children', method='POST',
                                  json={'child_ids': [STUDENT]}), \
            patch.object(family_quests, 'verify_parent_role'), \
            patch.object(family_quests, 'get_supabase_admin_client', return_value=admin), \
            patch('utils.class_membership.children_of_parent', return_value={STUDENT}), \
            patch('routes.quest_types.get_template_tasks', return_value=[]), \
            patch('utils.template_tasks.get_valid_source_template_ids', return_value=set()), \
            patch('repositories.task_repository.TaskRepository'), \
            patch('repositories.quest_repository.QuestRepository', return_value=quest_repo), \
            patch.object(visibility, 'QuestRepository', return_value=repo):
        response = view(PARENT, QUEST)
    body = (response[0] if isinstance(response, tuple) else response).get_json()

    if enrolled:
        quest_repo.enroll_user.assert_called_once()
        assert not body.get('failed')
    else:
        quest_repo.enroll_user.assert_not_called()
        assert body['failed'] == [{'child_id': STUDENT, 'error': 'Quest not found'}]
