"""Own-curriculum courses and the Courses and Credits page (services/courses_and_credits_service.py).

The contract families were promised: a semester course is one check-in worth
1,000 XP (half a credit), a year is two (one credit), the XP lands in the
course's subject and nowhere else, and a course earns its credit only through
its check-ins -- never a second time through the whole-class review.
"""

from __future__ import annotations

import pytest

from tests import crm_fakes
from tests.crm_fakes import FakeQuery, FakeSupabase

STUDENT = '11111111-1111-1111-1111-111111111111'
PARENT = '22222222-2222-2222-2222-222222222222'


class _Not:
    def __init__(self, query):
        self.query = query

    def is_(self, col, val):
        self.query.filters.append(('neq', col, None))
        return self.query


class PlanQuery(FakeQuery):
    _single = False

    @property
    def not_(self):
        return _Not(self)

    def single(self):
        self._single = True
        return self

    def execute(self):
        result = super().execute()
        if self._single:
            result.data = result.data[0] if result.data else None
        return result


class PlanSupabase(FakeSupabase):
    def table(self, name):
        return PlanQuery(self, name)


@pytest.fixture
def fake_db(monkeypatch):
    fake = PlanSupabase()
    monkeypatch.setitem(crm_fakes.EMBEDS, ('user_quests', 'quests'), 'quest_id')
    # QuestRepository.enroll_user reaches for the admin client itself.
    import database
    monkeypatch.setattr(database, 'get_supabase_admin_client', lambda: fake)
    # The header picture comes from an external image search: never call it here.
    from services import image_service
    monkeypatch.setattr(image_service, 'search_quest_image', lambda *a, **k: 'https://images.example/saxon.jpg')
    return fake


# --------------------------------------------------------------------------
# create_course
# --------------------------------------------------------------------------

def test_semester_course_is_one_check_in_worth_half_a_credit(fake_db):
    from services import courses_and_credits_service as plan

    quest_id = plan.create_course(fake_db, STUDENT, title='Saxon Math 8/7', subject='math',
                                  length='semester', enrolled_by=PARENT)

    quest = fake_db.data['quests'][0]
    assert quest['id'] == quest_id
    assert quest['quest_type'] == 'class'
    assert quest['transcript_subject'] == 'math'
    assert quest['created_by'] == STUDENT
    assert quest['metadata'] == {'course_format': 'own_curriculum', 'course_length': 'semester'}
    # A picture is chosen the way every quest's is.
    assert quest['header_image_url'] == quest['image_url'] == 'https://images.example/saxon.jpg'
    assert plan.is_own_curriculum(quest)

    enrollment = fake_db.data['user_quests'][0]
    assert enrollment['user_id'] == STUDENT
    assert enrollment['enrolled_by_user_id'] == PARENT
    assert enrollment['personalization_completed'] is True

    tasks = fake_db.data['user_quest_tasks']
    assert [t['title'] for t in tasks] == ['Semester check-in']
    task = tasks[0]
    assert task['xp_value'] == 1000
    assert task['subject_xp_distribution'] == {'math': 1000}
    # Never the ['Electives'] column default.
    assert task['diploma_subjects'] == {'math': 1000}
    assert task['user_id'] == STUDENT and task['is_required'] is True
    assert plan.course_credits('semester') == 0.5


def test_year_course_is_two_check_ins_worth_one_credit(fake_db):
    from services import courses_and_credits_service as plan

    plan.create_course(fake_db, STUDENT, title='Apologia Biology', subject='science', length='year')

    tasks = fake_db.data['user_quest_tasks']
    assert [t['title'] for t in tasks] == ['First semester check-in', 'Second semester check-in']
    assert sum(t['xp_value'] for t in tasks) == 2000
    assert all(t['subject_xp_distribution'] == {'science': 1000} for t in tasks)
    assert plan.course_credits('year') == 1.0


@pytest.mark.parametrize('kwargs,code', [
    ({'title': '', 'subject': 'math', 'length': 'year'}, 'TITLE_REQUIRED'),
    ({'title': 'X', 'subject': 'underwater_basket', 'length': 'year'}, 'INVALID_SUBJECT'),
    ({'title': 'X', 'subject': 'math', 'length': 'quarter'}, 'INVALID_LENGTH'),
])
def test_create_refuses_bad_input_before_writing(fake_db, kwargs, code):
    from services import courses_and_credits_service as plan

    with pytest.raises(plan.CourseError) as exc:
        plan.create_course(fake_db, STUDENT, **kwargs)
    assert exc.value.code == code
    assert not fake_db.data.get('quests')


# --------------------------------------------------------------------------
# check-in state
# --------------------------------------------------------------------------

@pytest.mark.parametrize('completion,state', [
    (None, 'open'),
    ({'diploma_status': 'none'}, 'not_sent'),
    ({'diploma_status': 'pending_review'}, 'in_review'),
    ({'diploma_status': 'pending_org_approval'}, 'in_review'),
    ({'diploma_status': 'grow_this'}, 'needs_more'),
    ({'diploma_status': 'finalized'}, 'approved'),
])
def test_check_in_state(completion, state):
    from services.courses_and_credits_service import check_in_state
    assert check_in_state(completion) == state


# --------------------------------------------------------------------------
# build_plan
# --------------------------------------------------------------------------

def test_plan_shows_check_ins_feedback_classes_and_transfer(fake_db):
    from services import courses_and_credits_service as plan

    quest_id = plan.create_course(fake_db, STUDENT, title='Saxon Math', subject='math', length='year')
    first, second = fake_db.data['user_quest_tasks']
    fake_db.data['quest_task_completions'] = [
        {'id': 'c1', 'user_id': STUDENT, 'user_quest_task_id': first['id'], 'diploma_status': 'finalized'},
        {'id': 'c2', 'user_id': STUDENT, 'user_quest_task_id': second['id'], 'diploma_status': 'grow_this'},
    ]
    fake_db.data['diploma_review_rounds'] = [
        {'completion_id': 'c2', 'round_number': 1, 'reviewer_feedback': 'Add the chapter tests.'},
    ]
    fake_db.data['user_subject_xp'] = [
        {'user_id': STUDENT, 'school_subject': 'math', 'xp_amount': 1000, 'pending_xp': 0},
    ]
    # An Optio class a reviewer awarded: half a credit that is not subject XP.
    fake_db.data['quests'].append({
        'id': 'art-class', 'title': 'Watercolor', 'quest_type': 'class', 'transcript_subject': 'fine_arts',
        'class_review_status': 'credit_awarded', 'is_active': True, 'created_by': STUDENT, 'metadata': {},
    })
    fake_db.data['user_quests'].append({'id': 'uq-art', 'user_id': STUDENT, 'quest_id': 'art-class', 'is_active': True})
    fake_db.data['transfer_credits'] = [{
        'user_id': STUDENT, 'school_name': 'Hearthwood Academy',
        'course_names': {'social_studies': [{'name': 'US History', 'credits': 1}]},
    }]

    result = plan.build_plan(fake_db, STUDENT, class_progress=lambda quest_id, subject: 0)
    subjects = {s['key']: s for s in result['subjects']}

    math = subjects['math']
    assert math['earned_xp'] == 1000
    [course] = math['courses']
    assert course['kind'] == 'own' and course['quest_id'] == quest_id
    assert course['credits'] == 1.0 and course['status'] == 'needs_more'
    assert [c['state'] for c in course['check_ins']] == ['approved', 'needs_more']
    assert course['check_ins'][1]['feedback'] == 'Add the chapter tests.'

    art = subjects['fine_arts']
    assert art['earned_xp'] == 1000  # the awarded class, as the XP it stands for
    assert art['courses'][0]['kind'] == 'class' and art['courses'][0]['status'] == 'complete'

    [history] = subjects['social_studies']['courses']
    assert history == {'kind': 'transfer', 'title': 'US History', 'credits': 1.0,
                       'school_name': 'Hearthwood Academy', 'status': 'complete'}

    assert [l['key'] for l in result['course_lengths']] == ['semester', 'year']


def test_own_curriculum_course_never_counts_as_an_awarded_class(fake_db):
    """Its credit arrives as subject XP through check-in review. A stray
    credit_awarded on it must not add a second half credit."""
    from repositories.courses_and_credits_repository import CoursesAndCreditsRepository
    from services import courses_and_credits_service as plan

    plan.create_course(fake_db, STUDENT, title='Saxon Math', subject='math', length='semester')
    fake_db.data['quests'][0]['class_review_status'] = 'credit_awarded'

    assert CoursesAndCreditsRepository(client=fake_db).awarded_class_credits(STUDENT) == []


# --------------------------------------------------------------------------
# the whole-class review refuses own-curriculum courses
# --------------------------------------------------------------------------

def test_class_review_refuses_an_own_curriculum_course(fake_db, monkeypatch):
    from flask import Flask
    from routes.quest import classes

    fake_db.data['quests'] = [{
        'id': 'q1', 'title': 'Saxon Math', 'quest_type': 'class', 'transcript_subject': 'math',
        'class_review_status': None, 'created_by': STUDENT,
        'metadata': {'course_format': 'own_curriculum', 'course_length': 'semester'},
    }]
    monkeypatch.setattr(classes, 'get_supabase_admin_client', lambda: fake_db)
    monkeypatch.setattr(classes, '_compute_class_progress', lambda *a: {'approved_xp': 1000, 'pending_xp': 0})

    app = Flask(__name__)
    with app.test_request_context('/api/quests/q1/submit-class-for-review', method='POST', json={}):
        # Past the auth + scope decorators: the view body is what decides.
        view = classes.submit_class_for_review.__wrapped__.__wrapped__
        body, status = view(STUDENT, 'q1')
    assert status == 409
    assert body.get_json()['error']['code'] == 'OWN_CURRICULUM_COURSE'
    assert fake_db.data['quests'][0]['class_review_status'] is None


# --------------------------------------------------------------------------
# an own-curriculum course is a quest: families may add tasks to it
# --------------------------------------------------------------------------

def test_tasks_a_family_adds_are_not_check_ins(fake_db):
    from services import courses_and_credits_service as plan

    quest_id = plan.create_course(fake_db, STUDENT, title='Saxon Math', subject='math', length='semester')
    fake_db.data['user_quest_tasks'].append({
        'id': 'extra-1', 'user_id': STUDENT, 'quest_id': quest_id, 'title': 'Chapter 4 test',
        'xp_value': 200, 'order_index': 5, 'is_required': False,
        'subject_xp_distribution': {'math': 200},
    })
    fake_db.data['quest_task_completions'] = [
        {'id': 'cx', 'user_id': STUDENT, 'quest_id': quest_id, 'user_quest_task_id': 'extra-1',
         'diploma_status': 'finalized'},
    ]

    result = plan.build_plan(fake_db, STUDENT, class_progress=lambda quest_id, subject: 0)
    [course] = next(s for s in result['subjects'] if s['key'] == 'math')['courses']
    assert [c['title'] for c in course['check_ins']] == ['Semester check-in']
    assert course['credits'] == 0.5  # the check-in is the course; added tasks are extra
    assert course['added_tasks'] == 1 and course['added_tasks_approved'] == 1


# --------------------------------------------------------------------------
# where a subject's credit came from
# --------------------------------------------------------------------------

def test_credit_is_split_by_where_it_came_from_and_adds_up(fake_db):
    from services import courses_and_credits_service as plan

    own_id = plan.create_course(fake_db, STUDENT, title='Saxon Math', subject='math', length='semester')
    check_in = fake_db.data['user_quest_tasks'][0]
    fake_db.data['quests'] += [
        {'id': 'garden-quest', 'quest_type': 'optio', 'metadata': {}, 'created_by': STUDENT},
        {'id': 'math-class', 'title': 'Stats', 'quest_type': 'class', 'transcript_subject': 'math',
         'class_review_status': 'credit_awarded', 'is_active': True, 'created_by': STUDENT, 'metadata': {}},
    ]
    fake_db.data['user_quests'].append({'id': 'uq-c', 'user_id': STUDENT, 'quest_id': 'math-class'})
    fake_db.data['user_quest_tasks'].append({
        'id': 'garden-task', 'user_id': STUDENT, 'quest_id': 'garden-quest',
        'subject_xp_distribution': {'math': 100, 'science': 100},
    })
    fake_db.data['quest_task_completions'] = [
        {'id': 'c-own', 'user_id': STUDENT, 'quest_id': own_id,
         'user_quest_task_id': check_in['id'], 'diploma_status': 'finalized'},
        {'id': 'c-garden', 'user_id': STUDENT, 'quest_id': 'garden-quest',
         'user_quest_task_id': 'garden-task', 'diploma_status': 'finalized'},
        # Not approved yet: never counted as earned.
        {'id': 'c-pending', 'user_id': STUDENT, 'quest_id': 'garden-quest',
         'user_quest_task_id': 'garden-task', 'diploma_status': 'pending_review'},
    ]
    # The reviewer moved the garden task's split: all 250 XP to math. The
    # approved split is what was deposited, so it wins over the task's own.
    fake_db.data['diploma_review_rounds'] = [
        {'completion_id': 'c-garden', 'round_number': 1, 'reviewer_action': 'approved',
         'approved_subjects': {'math': 250}},
    ]
    fake_db.data['transfer_credits'] = [{
        'user_id': STUDENT, 'school_name': 'Hearthwood Academy',
        'subject_xp': {'math': 2000}, 'course_names': {'math': [{'name': 'Algebra 1', 'credits': 1}]},
    }]
    # Ledger: 1000 own + 250 quest + 2000 transfer + 300 nobody can place.
    fake_db.data['user_subject_xp'] = [
        {'user_id': STUDENT, 'school_subject': 'math', 'xp_amount': 3550, 'pending_xp': 200},
    ]

    result = plan.build_plan(fake_db, STUDENT, class_progress=lambda quest_id, subject: 0)
    math = next(s for s in result['subjects'] if s['key'] == 'math')

    assert math['sources'] == {
        'own_curriculum': 1000,
        'optio_classes': 1000,  # the awarded class, half a credit
        'quests': 250,
        'transfer': 2000,
        'other': 300,
    }
    assert sum(math['sources'].values()) == math['earned_xp'] == 4550
    science = next(s for s in result['subjects'] if s['key'] == 'science')
    assert science['sources']['quests'] == 0


def test_each_subject_lists_the_quests_that_earned_approved_credit_there(fake_db):
    """A quest shows under every subject it earned approved credit in, with the
    other subjects it also counted toward and only this subject's tasks. A
    quest with nothing approved yet shows nowhere (2026-09-28)."""
    from services import courses_and_credits_service as plan

    fake_db.data['quests'] = [
        {'id': 'garden', 'title': 'Backyard Garden', 'quest_type': 'optio', 'metadata': {}},
        {'id': 'rocket', 'title': 'Water Rockets', 'quest_type': 'optio', 'metadata': {}},
    ]
    fake_db.data['user_quest_tasks'] = [
        {'id': 'soil', 'user_id': STUDENT, 'quest_id': 'garden', 'title': 'Test soil pH',
         'subject_xp_distribution': {'science': 50}},
        {'id': 'plan', 'user_id': STUDENT, 'quest_id': 'garden', 'title': 'Sketch a planting plan',
         'subject_xp_distribution': {'fine_arts': 25, 'math': 25}},
        {'id': 'launch', 'user_id': STUDENT, 'quest_id': 'rocket', 'title': 'Launch three rockets',
         'subject_xp_distribution': {'science': 100}},
    ]
    fake_db.data['quest_task_completions'] = [
        {'id': 'c-soil', 'user_id': STUDENT, 'quest_id': 'garden',
         'user_quest_task_id': 'soil', 'diploma_status': 'finalized'},
        {'id': 'c-plan', 'user_id': STUDENT, 'quest_id': 'garden',
         'user_quest_task_id': 'plan', 'diploma_status': 'finalized'},
        # Rockets: submitted, not approved. Not on the page yet.
        {'id': 'c-launch', 'user_id': STUDENT, 'quest_id': 'rocket',
         'user_quest_task_id': 'launch', 'diploma_status': 'pending_review'},
    ]

    result = plan.build_plan(fake_db, STUDENT, class_progress=lambda quest_id, subject: 0)
    by_key = {s['key']: s for s in result['subjects']}

    science = by_key['science']['quests']
    assert [q['title'] for q in science] == ['Backyard Garden']
    assert science[0]['xp'] == 50
    assert [t['title'] for t in science[0]['tasks']] == ['Test soil pH']
    assert {a['key'] for a in science[0]['also_counted_toward']} == {'fine_arts', 'math'}

    math = by_key['math']['quests']
    assert math[0]['quest_id'] == 'garden' and math[0]['xp'] == 25
    assert [t['title'] for t in math[0]['tasks']] == ['Sketch a planting plan']
    assert {a['key'] for a in math[0]['also_counted_toward']} == {'science', 'fine_arts'}

    assert by_key['language_arts']['quests'] == []
