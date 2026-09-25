"""A student's own quest, made for one of their classes (Gryffin, 2026-09-25).

Katie Bird asked her Earth Science class to write their own quests and could
not see them: a quest a student creates is personal and nothing tied it to the
class. The create form can now name a class. The rules that carry the risk:

  - The quest stays private. No school is put on it, and it is on the class for
    its maker alone -- a NULL audience would enroll the whole class and email
    their parents.
  - Only a class the student is actively in, checked before anything is
    written.
  - Teacher pages tell it from the teacher's own quests (`made_by`), one
    student's panel does not list a classmate's, and the audience endpoints
    refuse to hand it to anybody else.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, Mock, patch

import pytest

from services import student_class_quests


CLASS = '44444444-4444-4444-8444-444444444444'
OTHER_CLASS = '44444444-4444-4444-8444-444444444445'
QUEST = '33333333-3333-4333-8333-333333333331'
STUDENT = '11111111-1111-4111-8111-111111111111'
CLASSMATE = '11111111-1111-4111-8111-111111111112'
TEACHER = '22222222-2222-4222-8222-222222222222'


def _repo(enrollments=(), enrolled=()):
    repo = Mock()
    repo.get_student_enrollments.return_value = list(enrollments)
    repo.enrolled_student_ids.side_effect = lambda _cid, ids: {i for i in ids if i in enrolled}
    return repo


# ── Which class a student may put a quest on ─────────────────────────────────

@pytest.mark.unit
def test_a_student_may_attach_only_to_an_active_class_they_are_in():
    repo = _repo(enrollments=[
        {'org_classes': {'id': CLASS, 'status': 'active'}},
        {'org_classes': {'id': OTHER_CLASS, 'status': 'archived'}},
    ])
    assert student_class_quests.attachable_class(STUDENT, CLASS, repo=repo)['id'] == CLASS
    assert student_class_quests.attachable_class(STUDENT, OTHER_CLASS, repo=repo) is None
    assert student_class_quests.attachable_class(STUDENT, 'not-mine', repo=repo) is None
    repo.get_student_enrollments.assert_called_with(STUDENT, status='active')


# ── The class link is kept to the student ────────────────────────────────────

@pytest.mark.unit
def test_the_class_link_is_kept_to_the_student_who_made_it():
    client = MagicMock()
    for chained in ('table', 'select', 'eq', 'order', 'limit', 'upsert'):
        getattr(client, chained).return_value = client
    client.execute.side_effect = [
        SimpleNamespace(data=[{'sequence_order': 4}]),
        SimpleNamespace(data=[{'id': 'link'}]),
    ]
    from repositories.class_repository import ClassRepository
    repo = ClassRepository()
    repo._admin_client = client

    student_class_quests.attach(STUDENT, QUEST, CLASS, repo=repo)

    payload = client.upsert.call_args.args[0]
    assert payload == {'class_id': CLASS, 'quest_id': QUEST, 'added_by': STUDENT,
                       'sequence_order': 5, 'student_ids': [STUDENT]}


# ── Telling a student's quest from the teacher's ─────────────────────────────

@pytest.mark.unit
def test_made_by_names_only_quests_a_student_of_the_class_wrote_with_no_school():
    repo = _repo(enrolled={STUDENT})
    made = student_class_quests.made_by(CLASS, [
        {'quest_id': 'student', 'organization_id': None, 'created_by': STUDENT},
        {'quest_id': 'teacher', 'organization_id': 'org', 'created_by': TEACHER},
        {'quest_id': 'library', 'organization_id': None, 'created_by': TEACHER},
        # A student's quest that somehow carries a school is the school's now.
        {'quest_id': 'school', 'organization_id': 'org', 'created_by': STUDENT},
        {'quest_id': 'orphan', 'organization_id': None, 'created_by': None},
    ], repo=repo)
    assert made == {'student': STUDENT}


@pytest.mark.unit
def test_made_by_asks_nothing_when_no_quest_could_be_a_students():
    repo = _repo()
    assert student_class_quests.made_by(
        CLASS, [{'quest_id': 'q', 'organization_id': 'org', 'created_by': TEACHER}], repo=repo) == {}
    repo.enrolled_student_ids.assert_not_called()


# ── The create route ─────────────────────────────────────────────────────────

def _create(body, *, attachable=True, attach=None):
    from routes.quest.enrollment import create_user_quest
    from app import app
    inner = create_user_quest.__wrapped__.__wrapped__

    admin = MagicMock()
    for chained in ('table', 'select', 'insert', 'eq', 'delete'):
        getattr(admin, chained).return_value = admin
    admin.execute.return_value = SimpleNamespace(data=[{'id': QUEST, 'title': body.get('title')}])
    quest_repo = Mock()
    quest_repo.enroll_user.return_value = {'id': 'enr-1', 'is_active': True}
    quest_repo.get_user_enrollment.return_value = {'id': 'enr-1'}
    attach_mock = attach or Mock()

    with app.test_request_context('/api/quests/create', method='POST', json=body), \
            patch('routes.quest.enrollment.current_student_scope', return_value=None), \
            patch('routes.quest.enrollment.get_supabase_admin_client', return_value=admin), \
            patch('routes.quest.enrollment.QuestRepository', return_value=quest_repo), \
            patch('services.image_service.search_quest_image', return_value=None), \
            patch.object(student_class_quests, 'attachable_class',
                         return_value={'id': CLASS} if attachable else None), \
            patch.object(student_class_quests, 'attach', attach_mock):
        resp = inner(STUDENT)
    resp, status = resp if isinstance(resp, tuple) else (resp, resp.status_code)
    return resp.get_json(), status, admin, attach_mock


@pytest.mark.unit
def test_a_quest_made_for_a_class_stays_private_and_goes_on_the_class():
    body, status, admin, attach = _create({'title': 'Minerals in Rocks', 'class_id': CLASS})
    assert status == 200 and body['class_attached'] is True and body['class_id'] == CLASS
    inserted = admin.insert.call_args.args[0]
    assert inserted['is_public'] is False
    assert 'organization_id' not in inserted
    attach.assert_called_once_with(STUDENT, QUEST, CLASS)


@pytest.mark.unit
def test_a_class_the_student_is_not_in_is_refused_before_anything_is_written():
    body, status, admin, attach = _create({'title': 'x', 'class_id': CLASS}, attachable=False)
    assert status == 403 and body['error']['code'] == 'NOT_IN_CLASS'
    admin.insert.assert_not_called()
    attach.assert_not_called()


@pytest.mark.unit
def test_without_a_class_the_quest_is_personal_as_before():
    body, status, _admin, attach = _create({'title': 'Just mine'})
    assert status == 200 and body['class_attached'] is False and body['class_id'] is None
    attach.assert_not_called()


@pytest.mark.unit
def test_a_failed_class_link_keeps_the_quest_and_says_so():
    body, status, _admin, _attach = _create(
        {'title': 'x', 'class_id': CLASS}, attach=Mock(side_effect=RuntimeError('db down')))
    assert status == 200 and body['quest_id'] == QUEST and body['class_attached'] is False


# ── Teacher pages ─────────────────────────────────────────────────────────────

@pytest.mark.unit
@pytest.mark.parametrize('wanted, refused', [
    (None, True),                    # everyone in the class
    ([STUDENT, CLASSMATE], True),    # one more student
    ([STUDENT], False),              # unchanged
    ([], False),                     # off the maker's own list
])
def test_a_students_quest_cannot_be_handed_to_anyone_else(wanted, refused):
    from app import app
    from routes.sis.class_quest_students import _student_quest_refusal
    with app.test_request_context(), \
            patch.object(student_class_quests, 'maker_of', return_value=STUDENT):
        result = _student_quest_refusal(Mock(), {'id': CLASS}, QUEST, wanted)
    assert (result is not None) is refused
    if refused:
        assert result[1] == 409


@pytest.mark.unit
def test_the_teachers_own_quests_keep_their_audience_controls():
    from app import app
    from routes.sis.class_quest_students import _student_quest_refusal
    with app.test_request_context(), \
            patch.object(student_class_quests, 'maker_of', return_value=None):
        assert _student_quest_refusal(Mock(), {'id': CLASS}, QUEST, None) is None


@pytest.mark.unit
def test_one_students_panel_does_not_list_a_classmates_own_quest():
    from routes.sis import class_quest_students as mod
    links = [
        {'quest_id': 'teacher-q', 'student_ids': None, 'quests': {'title': 'Rocks'}},
        {'quest_id': 'mine', 'student_ids': [STUDENT], 'quests': {'title': 'My quest'}},
        {'quest_id': 'theirs', 'student_ids': [CLASSMATE], 'quests': {'title': 'Their quest'}},
    ]
    admin = MagicMock()
    for chained in ('table', 'select', 'eq', 'order'):
        getattr(admin, chained).return_value = admin
    admin.execute.return_value = SimpleNamespace(data=links)
    with patch.object(mod, '_made_by', return_value={'mine': STUDENT, 'theirs': CLASSMATE}), \
            patch.object(mod, '_read_enrollments', return_value=[]):
        work = mod._student_work(admin, {'id': CLASS}, STUDENT)
    assert [(q['quest_id'], q['made_by']) for q in work] == [('teacher-q', None), ('mine', STUDENT)]
