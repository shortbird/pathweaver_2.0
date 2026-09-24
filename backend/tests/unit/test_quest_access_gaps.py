"""The five doors 88b7dfd4's direct-link rule did not reach, closed 2026-09-24.

services/quest_visibility_service.may_open_quest answers "may this person open
this quest by id". This file pins the doors that still answered without it,
and the second half of the rule itself:

  1. GET /api/quest-ai/approach-examples/<id> -- was unauthenticated and
     started a paid Gemini call for any quest id.
  2. generate-tasks / start-personalization -- took any quest id; now the
     caller must open the quest AND be on it (may_work_on_quest). The credit
     calculator is quest content too.
  3. Curriculum reads -- the staff path never compared orgs; campus
     coordinators were missing.
  4. Personal quests (global, not public) -- opened for anyone with the id.
  +  The personalization doors that write a task also CREATE an enrollment,
     so they are held to the enroll door's rule.

Every refusal is the same 404 a missing quest gets.
"""

import inspect
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from services import quest_visibility_service as visibility

CREATOR = '10000000-0000-4000-8000-000000000001'
STRANGER = '20000000-0000-4000-8000-000000000002'
ENROLLED = '30000000-0000-4000-8000-000000000003'
PARENT = '40000000-0000-4000-8000-000000000004'
SUPERADMIN = '50000000-0000-4000-8000-000000000005'
TEACHER = '60000000-0000-4000-8000-000000000006'
TEACHER_ELSEWHERE = '70000000-0000-4000-8000-000000000007'
SCHOOL = 'a0000000-0000-4000-8000-00000000000a'
OTHER_SCHOOL = 'b0000000-0000-4000-8000-00000000000b'
QUEST = 'c0000000-0000-4000-8000-00000000000c'


def _platform(uid, role):
    return {'id': uid, 'role': role, 'org_role': None, 'org_roles': None,
            'organization_id': None}


def _org(uid, org, role):
    return {'id': uid, 'role': 'org_managed', 'org_role': role, 'org_roles': [role],
            'organization_id': org}


USERS = {
    CREATOR: _platform(CREATOR, 'student'),
    STRANGER: _platform(STRANGER, 'student'),
    ENROLLED: _platform(ENROLLED, 'student'),
    PARENT: _platform(PARENT, 'parent'),
    SUPERADMIN: _platform(SUPERADMIN, 'superadmin'),
    TEACHER: _org(TEACHER, SCHOOL, 'advisor'),
    TEACHER_ELSEWHERE: _org(TEACHER_ELSEWHERE, OTHER_SCHOOL, 'advisor'),
}


class FakeRepo:
    def __init__(self, quest=None, enrolled=(), course_users=(), assigned=False):
        self.quest = quest
        self.enrolled = set(enrolled)
        self.course_users = set(course_users)
        self.assigned = assigned

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


def _personal(created_by=CREATOR):
    return {'id': QUEST, 'title': 'My van brake light', 'organization_id': None,
            'created_by': created_by, 'is_public': False, 'is_active': True}


def _catalog():
    return dict(_personal(), is_public=True, created_by=None)


def _school_quest():
    return dict(_personal(), organization_id=SCHOOL, created_by=TEACHER)


def _relationships(pairs):
    """relationship_between answering from a set of (caller, target, name)."""
    def fake(caller, target, allow):
        for name in allow:
            if (caller, target, name) in pairs:
                return name
        return None
    return patch('utils.auth.relationships.relationship_between', side_effect=fake)


@pytest.fixture(autouse=True)
def _no_links():
    """No one is linked to anyone unless a test says so."""
    with patch('utils.class_membership.children_of_parent', return_value=set()), \
            patch('utils.portfolio_access.students_observed_by', return_value=set()), \
            _relationships(set()):
        yield


# ── 4. personal quests ────────────────────────────────────────────────────────

@pytest.mark.unit
def test_a_catalog_quest_opens_for_anyone_without_asking():
    repo = MagicMock()
    assert visibility.may_open_quest(STRANGER, _catalog(), repo=repo)
    assert repo.method_calls == []


@pytest.mark.unit
@pytest.mark.parametrize('caller, repo, expected', [
    (CREATOR, FakeRepo(), True),                               # its creator
    (STRANGER, FakeRepo(), False),                             # anybody with the id
    (ENROLLED, FakeRepo(enrolled={ENROLLED}), True),           # on it already
    (SUPERADMIN, FakeRepo(), True),
    (STRANGER, FakeRepo(course_users={STRANGER}), True),       # a course project
    (TEACHER, FakeRepo(), False),                              # staff of a school: no
], ids=['creator', 'stranger', 'enrolled', 'superadmin', 'course-project', 'unrelated-staff'])
def test_the_personal_quest_rule(caller, repo, expected):
    assert visibility.may_open_quest(caller, _personal(), repo=repo) is expected


@pytest.mark.unit
def test_a_parent_of_the_creator_opens_it():
    with _relationships({(PARENT, CREATOR, 'parent')}):
        assert visibility.may_open_quest(PARENT, _personal(), repo=FakeRepo())


@pytest.mark.unit
def test_the_advisor_of_an_enrolled_student_opens_it():
    with _relationships({(TEACHER, ENROLLED, 'advisor')}):
        assert visibility.may_open_quest(TEACHER, _personal(), repo=FakeRepo(enrolled={ENROLLED}))
        # ...and not once that student is off it.
        assert not visibility.may_open_quest(TEACHER, _personal(), repo=FakeRepo())


@pytest.mark.unit
def test_an_observer_of_the_creator_opens_it_but_cannot_enroll():
    with _relationships({(PARENT, CREATOR, 'observer')}):
        assert visibility.may_open_quest(PARENT, _personal(), repo=FakeRepo())
        assert not visibility.may_open_quest(PARENT, _personal(), repo=FakeRepo(),
                                             include_linked_students=False)


@pytest.mark.unit
def test_a_guardian_of_the_creator_may_start_a_sibling_on_it():
    sibling = STRANGER
    with _relationships({(PARENT, CREATOR, 'parent')}):
        assert visibility.may_open_quest(PARENT, _personal(), subject_id=sibling,
                                         repo=FakeRepo(), include_linked_students=False)


@pytest.mark.unit
def test_a_missing_is_public_is_read_rather_than_guessed():
    row = {k: v for k, v in _catalog().items() if k != 'is_public'}
    assert visibility.may_open_quest(STRANGER, row, repo=FakeRepo(quest=_catalog()))
    row = {k: v for k, v in _personal().items() if k != 'is_public'}
    assert not visibility.may_open_quest(STRANGER, row, repo=FakeRepo(quest=_personal()))


@pytest.mark.unit
def test_autocomplete_lists_a_global_quest_only_when_public_or_own():
    """search_similar_quests used `organization_id.is.null` alone, so every
    personal quest's title autocompleted for everyone."""
    from repositories.quest_repository import QuestRepository

    captured = []

    class Chain:
        def __getattr__(self, name):
            def call(*args, **_kwargs):
                if name == 'or_':
                    captured.append(args[0])
                if name == 'is_':
                    captured.append(f'is_:{args}')
                return self
            return call

        def execute(self):
            if not captured:  # the users read
                return MagicMock(data=[{'organization_id': None}])
            return MagicMock(data=[])

    admin = MagicMock()
    admin.rpc.return_value.execute.return_value = MagicMock(data=[{'organization_id': None}])
    admin.table.side_effect = lambda _name: Chain()
    with patch('database.get_supabase_admin_client', return_value=admin):
        QuestRepository(client=MagicMock()).search_similar_quests(STRANGER, 'brake')
    assert captured, 'expected the visibility filter to be applied'
    assert any('is_public.eq.true' in c and f'created_by.eq.{STRANGER}' in c for c in captured), captured
    assert not any(c.startswith('is_:') for c in captured), captured


# ── 2. may_work_on_quest: the AI personalization rule ─────────────────────────

def _work(caller, repo, subject_id=None):
    with patch.object(visibility, 'QuestRepository', return_value=repo):
        return visibility.may_work_on_quest(caller, QUEST, subject_id=subject_id)


@pytest.mark.unit
@pytest.mark.parametrize('caller, quest, repo_kwargs, subject, expected', [
    (ENROLLED, _catalog(), {'enrolled': {ENROLLED}}, None, True),
    (STRANGER, _catalog(), {}, None, False),                    # may open, not on it
    (STRANGER, _school_quest(), {'enrolled': set()}, None, False),
    (TEACHER, _school_quest(), {}, None, True),                 # staff of its school
    (TEACHER_ELSEWHERE, _school_quest(), {'assigned': True}, None, False),
    (PARENT, _catalog(), {'enrolled': {ENROLLED}}, ENROLLED, True),   # family scope
    (PARENT, _catalog(), {}, ENROLLED, False),
    (SUPERADMIN, _personal(), {}, None, True),
    (STRANGER, None, {}, None, False),                          # missing quest
], ids=['enrolled', 'catalog-not-enrolled', 'foreign-school', 'school-staff',
        'other-school-staff', 'parent-for-enrolled-child', 'parent-child-not-on-it',
        'superadmin', 'missing'])
def test_may_work_on_quest(caller, quest, repo_kwargs, subject, expected):
    repo = FakeRepo(quest=quest, **repo_kwargs)
    assert _work(caller, repo, subject) is expected


# ── 2. the personalization routes ─────────────────────────────────────────────

def _scope(caller, student=None):
    from utils.guardian_scope import StudentScope
    return StudentScope(caller_id=caller, student_id=student or caller,
                        via='parent' if student else 'self')


def _call_personalization(view_name, caller, allowed, body=None, student=None):
    from routes import quest_personalization as qp
    view = inspect.unwrap(getattr(qp, view_name))
    app = Flask(__name__)
    learner = student or caller
    with app.test_request_context(f'/api/quests/{QUEST}/x', method='POST', json=body or {}), \
            patch.object(qp, 'current_student_scope', return_value=_scope(caller, student)), \
            patch('routes.personalization_gates.current_student_scope',
                  return_value=_scope(caller, student)), \
            patch('services.quest_visibility_service.may_work_on_quest',
                  return_value=allowed) as gate, \
            patch.object(qp, '_custom_tasks_blocked', return_value=None), \
            patch.object(qp, 'get_supabase_admin_client', return_value=MagicMock()), \
            patch.object(qp, 'require_ai_access', return_value=None), \
            patch.object(qp, 'personalization_service') as service:
        service.start_personalization_session.return_value = {
            'success': True, 'session': {'id': 's1'}, 'resumed': False}
        service.generate_task_suggestions.return_value = {'success': True, 'tasks': []}
        response = view(learner, QUEST)
    body_out, status = response if isinstance(response, tuple) else (response, 200)
    return body_out.get_json(), status, gate, service


@pytest.mark.unit
@pytest.mark.parametrize('view_name, service_method', [
    ('start_personalization', 'start_personalization_session'),
    ('generate_tasks', 'generate_task_suggestions'),
    ('refine_tasks', 'generate_task_suggestions'),
])
def test_a_quest_the_learner_is_not_on_is_a_404_and_nothing_runs(view_name, service_method):
    body = {'session_id': 's1', 'interests': ['bikes']}
    payload, status, gate, service = _call_personalization(view_name, STRANGER, False, body)
    assert status == 404
    assert payload == {'success': False, 'error': 'Quest not found'}
    getattr(service, service_method).assert_not_called()
    gate.assert_called_once_with(STRANGER, QUEST, subject_id=STRANGER)


@pytest.mark.unit
def test_start_personalization_runs_when_allowed():
    _payload, status, _gate, service = _call_personalization('start_personalization', ENROLLED, True)
    assert status == 200
    service.start_personalization_session.assert_called_once()


@pytest.mark.unit
def test_family_scope_asks_about_the_child_and_the_parent():
    _payload, status, gate, _service = _call_personalization(
        'start_personalization', PARENT, True, student=ENROLLED)
    assert status == 200
    gate.assert_called_once_with(PARENT, QUEST, subject_id=ENROLLED)


@pytest.mark.unit
@pytest.mark.parametrize('view_name', [
    'add_manual_tasks_batch', 'add_path_tasks', 'finalize_tasks', 'accept_task_immediate',
])
def test_the_task_writing_doors_do_not_enroll_in_a_quest_the_learner_may_not_open(view_name):
    """Each of these creates the user_quests row through
    get_or_create_enrollment, so each is an enroll door."""
    from routes import quest_personalization as qp
    view = inspect.unwrap(getattr(qp, view_name))
    app = Flask(__name__)
    with app.test_request_context(f'/api/quests/{QUEST}/x', method='POST',
                                  json={'tasks': [{'title': 't'}], 'session_id': 's1',
                                        'task': {'title': 't'}}), \
            patch.object(qp, 'current_student_scope', return_value=_scope(STRANGER)), \
            patch('routes.personalization_gates.current_student_scope',
                  return_value=_scope(STRANGER)), \
            patch('services.quest_visibility_service.may_open_quest_id',
                  return_value=False) as gate, \
            patch.object(qp, 'get_or_create_enrollment') as enroll, \
            patch.object(qp, 'get_supabase_admin_client') as admin:
        response = view(STRANGER, QUEST)
    body, status = response
    assert status == 404
    assert body.get_json() == {'success': False, 'error': 'Quest not found'}
    enroll.assert_not_called()
    admin.assert_not_called()
    gate.assert_called_once_with(STRANGER, QUEST, subject_id=STRANGER,
                                 include_linked_students=False)


# ── 1. approach examples ──────────────────────────────────────────────────────

@pytest.mark.unit
def test_approach_examples_needs_a_signed_in_caller(client):
    response = client.get(f'/api/quest-ai/approach-examples/{QUEST}')
    assert response.status_code == 401


@pytest.mark.unit
def test_approach_examples_is_rate_limited_per_user():
    """The reused D5 limiter, keyed by user rather than IP (a school NAT must
    not share one bucket)."""
    from routes import quest_ai
    source = inspect.getsource(quest_ai)
    block = source[source.index("@bp.route('/approach-examples/<quest_id>'"):
                   source.index('def get_approach_examples')]
    assert '@require_auth' in block
    assert '@rate_limit(' in block and 'per_user=True' in block


def _approach(caller, quest, allowed):
    from routes import quest_ai
    view = inspect.unwrap(quest_ai.get_approach_examples)
    admin = MagicMock()
    chain = admin.table.return_value.select.return_value.eq.return_value.limit.return_value
    chain.execute.return_value = MagicMock(data=[quest] if quest else [])
    app = Flask(__name__)
    with app.test_request_context(f'/api/quest-ai/approach-examples/{QUEST}'), \
            patch('database.get_supabase_admin_client', return_value=admin), \
            patch('services.quest_visibility_service.may_open_quest',
                  return_value=allowed) as gate, \
            patch('threading.Thread') as thread:
        quest_ai._generating_quests.discard(QUEST)
        response = view(caller, QUEST)
        quest_ai._generating_quests.discard(QUEST)
    body, status = response
    return body.get_json(), status, gate, thread


@pytest.mark.unit
def test_approach_examples_for_a_quest_the_caller_may_not_open_is_a_404_and_spends_nothing():
    payload, status, gate, thread = _approach(STRANGER, _school_quest(), allowed=False)
    assert status == 404
    assert payload == {'success': False, 'error': 'Quest not found'}
    thread.assert_not_called()
    gate.assert_called_once()
    assert gate.call_args.args[0] == STRANGER


@pytest.mark.unit
def test_approach_examples_generate_for_a_quest_the_caller_may_open():
    _payload, status, _gate, thread = _approach(ENROLLED, dict(_catalog(), approach_examples=None),
                                                allowed=True)
    assert status == 200
    thread.assert_called_once()


@pytest.mark.unit
def test_accept_approach_does_not_enroll_in_a_quest_the_caller_may_not_open():
    from routes import quest_ai
    view = inspect.unwrap(quest_ai.accept_approach)
    admin = MagicMock()
    chain = admin.table.return_value.select.return_value.eq.return_value.limit.return_value
    chain.execute.return_value = MagicMock(data=[_school_quest()])
    app = Flask(__name__)
    with app.test_request_context(f'/api/quest-ai/accept-approach/{QUEST}', method='POST',
                                  json={'approach_index': -1}), \
            patch('database.get_supabase_admin_client', return_value=admin), \
            patch('services.quest_visibility_service.may_open_quest', return_value=False):
        body, status = view(STRANGER, QUEST)
    assert status == 404
    admin.table.return_value.insert.assert_not_called()


# ── 2. the credit calculator ──────────────────────────────────────────────────

@pytest.mark.unit
@pytest.mark.parametrize('allowed, status', [(False, 404), (True, 200)])
def test_quest_credit_calculation_is_quest_content(allowed, status):
    from routes import credits
    view = inspect.unwrap(credits.calculate_quest_credits)
    app = Flask(__name__)
    with app.test_request_context(f'/api/credits/quest/{QUEST}/calculate'), \
            patch('services.quest_visibility_service.may_open_quest_id',
                  return_value=allowed), \
            patch.object(credits.CreditMappingService, 'calculate_quest_credits',
                         return_value={'total_credits': 1}) as calc:
        body, got = view(STRANGER, QUEST)
    assert got == status
    assert calc.called is allowed


# ── 3. curriculum reads ───────────────────────────────────────────────────────

class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def __getattr__(self, _name):
        return lambda *a, **k: self

    def execute(self):
        return MagicMock(data=self._rows)


def _curriculum(user, quest_org, enrolled=False):
    from services.curriculum_permission_service import CurriculumPermissionService
    rows = {
        'users': [user],
        'quests': [{'id': QUEST, 'title': 'q', 'organization_id': quest_org}],
        'user_quests': [{'id': 'uq'}] if enrolled else [],
        'course_enrollments': [],
    }
    client = MagicMock()
    client.table.side_effect = lambda name: _Rows(rows.get(name, []))
    return CurriculumPermissionService(client)


@pytest.mark.unit
@pytest.mark.parametrize('role', ['advisor', 'org_admin', 'campus_coordinator'])
def test_staff_do_not_read_another_schools_curriculum(role):
    from services.base_service import PermissionError as ServicePermissionError
    user = _org(TEACHER_ELSEWHERE, OTHER_SCHOOL, role)
    with pytest.raises(ServicePermissionError):
        _curriculum(user, SCHOOL).can_read_curriculum(TEACHER_ELSEWHERE, QUEST)


@pytest.mark.unit
@pytest.mark.parametrize('role', ['advisor', 'org_admin', 'campus_coordinator'])
def test_staff_read_their_own_schools_curriculum(role):
    user = _org(TEACHER, SCHOOL, role)
    assert _curriculum(user, SCHOOL).can_read_curriculum(TEACHER, QUEST) is True


@pytest.mark.unit
def test_staff_read_a_global_quests_curriculum():
    user = _org(TEACHER, SCHOOL, 'campus_coordinator')
    assert _curriculum(user, None).can_read_curriculum(TEACHER, QUEST) is True


@pytest.mark.unit
def test_a_platform_advisor_reads_global_but_not_a_schools_curriculum():
    from services.base_service import PermissionError as ServicePermissionError
    user = _platform(TEACHER, 'advisor')
    assert _curriculum(user, None).can_read_curriculum(TEACHER, QUEST) is True
    with pytest.raises(ServicePermissionError):
        _curriculum(user, SCHOOL).can_read_curriculum(TEACHER, QUEST)


@pytest.mark.unit
def test_a_superadmin_reads_any_curriculum():
    user = _platform(SUPERADMIN, 'superadmin')
    assert _curriculum(user, SCHOOL).can_read_curriculum(SUPERADMIN, QUEST) is True


@pytest.mark.unit
def test_an_enrolled_student_still_reads_their_schools_curriculum():
    user = _org(ENROLLED, SCHOOL, 'student')
    assert _curriculum(user, SCHOOL, enrolled=True).can_read_curriculum(ENROLLED, QUEST) is True

