"""A task added to a finished quest reopens it (ticket 8a0beab1).

Karen Boyd, an Optio Academy parent working in her son Kaidan's account:
"Once a quest is marked complete, there doesn't appear to be a way to
re-activate it. I forgot to add a task... the quest still displays as complete."

Two faults made that true:

  1. get_or_create_enrollment looked for an ACTIVE enrollment only. A finished
     quest has none, so the first task added after "Mark done" created a
     second, empty enrollment beside the finished one.
  2. The quest lists (services/quest_optimization.py) checked the completed
     enrollment first, so with both rows present the quest still read as
     complete, while the quest page (routes/quest/detail.py) preferred the
     active one. The two surfaces disagreed.

Now a new task goes into the finished run and reopens it with the same write
as POST /api/quests/<id>/reopen, and the active run wins in the lists too.
"""

import inspect
from unittest.mock import patch

import pytest
from flask import Flask

from tests.crm_fakes import FakeSupabase


KID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
QUEST = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
FINISHED_AT = '2026-10-01T18:00:00+00:00'


def _finished_world():
    return FakeSupabase({'user_quests': [{
        'id': 'uq-done', 'user_id': KID, 'quest_id': QUEST,
        'is_active': False, 'completed_at': FINISHED_AT,
        'created_at': '2026-09-01T00:00:00+00:00',
    }], 'user_quest_tasks': [], 'quest_task_completions': []})


def _active_world():
    return FakeSupabase({'user_quests': [{
        'id': 'uq-live', 'user_id': KID, 'quest_id': QUEST,
        'is_active': True, 'completed_at': None,
        'created_at': '2026-09-01T00:00:00+00:00',
    }], 'user_quest_tasks': [], 'quest_task_completions': []})


# ── 1b. the enrollment a new task lands in ───────────────────────────────────

@pytest.mark.unit
class TestGetOrCreateEnrollment:
    def test_a_finished_quest_is_reopened_not_duplicated(self):
        """The regression: this used to insert a second enrollment and leave
        the finished one finished."""
        from utils import personalization_helpers as helpers
        db = _finished_world()
        with patch.object(helpers, 'get_supabase_admin_client', return_value=db):
            uq_id = helpers.get_or_create_enrollment(KID, QUEST)

        assert uq_id == 'uq-done'
        rows = db.data['user_quests']
        assert len(rows) == 1
        assert rows[0]['is_active'] is True
        assert rows[0]['completed_at'] is None

    def test_an_active_quest_is_left_as_it_is(self):
        from utils import personalization_helpers as helpers
        db = _active_world()
        before = dict(db.data['user_quests'][0])
        with patch.object(helpers, 'get_supabase_admin_client', return_value=db):
            uq_id = helpers.get_or_create_enrollment(KID, QUEST)

        assert uq_id == 'uq-live'
        assert db.data['user_quests'] == [before]

    def test_no_enrollment_still_creates_one(self):
        from utils import personalization_helpers as helpers
        db = FakeSupabase({'user_quests': []})
        with patch.object(helpers, 'get_supabase_admin_client', return_value=db):
            helpers.get_or_create_enrollment(KID, QUEST)

        assert len(db.data['user_quests']) == 1
        assert db.data['user_quests'][0]['is_active'] is True


def _add_manual_task(db):
    """POST /api/quests/<id>/add-manual-tasks as the student, on `db`."""
    from routes import quest_personalization as qp
    from utils import personalization_helpers as helpers
    view = inspect.unwrap(qp.add_manual_tasks_batch)
    app = Flask(__name__)
    body = {'tasks': [{'title': 'Lab write-up', 'description': 'Write it up',
                       'pillar': 'stem', 'xp_value': 50,
                       'diploma_subjects': {'Science': 50}}]}
    with app.test_request_context(f'/api/quests/{QUEST}/add-manual-tasks',
                                  method='POST', json=body), \
            patch.object(qp, 'quest_not_openable', return_value=None), \
            patch.object(qp, '_custom_tasks_blocked', return_value=None), \
            patch.object(qp, '_class_subject_override', return_value=(None, None)), \
            patch.object(qp, 'current_student_scope', return_value=None), \
            patch.object(qp, 'missing_criteria_response', return_value=None), \
            patch.object(qp, 'size_family_tasks'), \
            patch.object(qp, 'get_next_order_index', return_value=0), \
            patch.object(qp, 'get_supabase_admin_client', return_value=db), \
            patch.object(helpers, 'get_supabase_admin_client', return_value=db), \
            patch('utils.xp_permissions.get_effective_role_for', return_value='student'), \
            patch('utils.xp_permissions.xp_locked_for_learner', return_value=False):
        return view(KID, QUEST)


@pytest.mark.unit
class TestAddingATaskByHand:
    def test_adding_a_task_to_a_finished_quest_reopens_it(self):
        db = _finished_world()
        response = _add_manual_task(db)

        assert response.get_json()['success'] is True
        rows = db.data['user_quests']
        assert len(rows) == 1, 'no second enrollment'
        assert rows[0]['is_active'] is True
        assert rows[0]['completed_at'] is None
        task = db.data['user_quest_tasks'][0]
        assert task['user_quest_id'] == 'uq-done'

    def test_adding_a_task_to_an_active_quest_changes_nothing_else(self):
        db = _active_world()
        before = dict(db.data['user_quests'][0])
        response = _add_manual_task(db)

        assert response.get_json()['success'] is True
        assert db.data['user_quests'] == [before]
        assert db.data['user_quest_tasks'][0]['user_quest_id'] == 'uq-live'


@pytest.mark.unit
def test_the_reopen_write_is_both_columns():
    """The one reopen write, shared with POST /reopen."""
    from repositories.quest_repository import QuestRepository
    db = _finished_world()
    assert QuestRepository(client=db).reopen_enrollment('uq-done') is True
    row = db.data['user_quests'][0]
    assert row['is_active'] is True and row['completed_at'] is None


# ── 1a. which run the quest lists show ───────────────────────────────────────

@pytest.mark.unit
def test_lists_show_the_active_run_when_a_finished_one_also_exists():
    """Both rows exist for families who added a task before this fix. The
    quest page already preferred the active run; the lists now agree."""
    from services.quest_optimization import QuestOptimizationService
    db = FakeSupabase({
        'user_quests': [
            {'id': 'uq-done', 'user_id': KID, 'quest_id': QUEST,
             'is_active': False, 'completed_at': FINISHED_AT},
            {'id': 'uq-live', 'user_id': KID, 'quest_id': QUEST,
             'is_active': True, 'completed_at': None},
        ],
        'user_quest_tasks': [
            {'id': 't-old', 'user_quest_id': 'uq-done', 'pillar': 'stem',
             'xp_value': 50, 'approval_status': 'approved'},
            {'id': 't-new', 'user_quest_id': 'uq-live', 'pillar': 'stem',
             'xp_value': 50, 'approval_status': 'approved'},
        ],
        'quest_task_completions': [
            {'id': 'c-1', 'user_id': KID, 'user_quest_task_id': 't-old'},
        ],
    })
    service = QuestOptimizationService()
    service._supabase = db

    [quest] = service.enrich_quests_with_user_data([{'id': QUEST}], KID)

    assert quest['user_enrollment']['id'] == 'uq-live'
    assert 'completed_enrollment' not in quest
    assert quest['progress'] == {'completed_tasks': 0, 'total_tasks': 1, 'percentage': 0}


@pytest.mark.unit
def test_lists_still_show_a_finished_quest_as_finished():
    from services.quest_optimization import QuestOptimizationService
    db = FakeSupabase({
        'user_quests': [{'id': 'uq-done', 'user_id': KID, 'quest_id': QUEST,
                         'is_active': False, 'completed_at': FINISHED_AT}],
        'user_quest_tasks': [], 'quest_task_completions': [],
    })
    service = QuestOptimizationService()
    service._supabase = db

    [quest] = service.enrich_quests_with_user_data([{'id': QUEST}], KID)

    assert quest['completed_enrollment']['id'] == 'uq-done'
    assert 'user_enrollment' not in quest


# ── the task library add path ────────────────────────────────────────────────

class _SingleQuery:
    """FakeQuery plus .single(), which the library route uses."""

    def __init__(self, inner):
        self._inner, self._single = inner, False

    def single(self):
        self._single = True
        return self

    def execute(self):
        result = self._inner.execute()
        if self._single:
            result.data = result.data[0] if result.data else None
        return result

    def __getattr__(self, name):
        attr = getattr(self._inner, name)
        if not callable(attr):
            return attr

        def chain(*args, **kwargs):
            out = attr(*args, **kwargs)
            return self if out is self._inner else out
        return chain


class _SingleDB(FakeSupabase):
    def table(self, name):
        return _SingleQuery(super().table(name))


@pytest.mark.unit
def test_adding_a_library_task_to_a_finished_quest_clears_completed_at():
    """This path set is_active only, so the quest stayed 'complete'."""
    from routes import task_library
    db = _SingleDB(_finished_world().data)
    db.data['quest_sample_tasks'] = [{
        'id': 's-1', 'quest_id': QUEST, 'title': 'Lab write-up',
        'description': 'Write it up', 'pillar': 'stem', 'xp_value': 50,
        'diploma_subjects': {'Science': 50},
    }]
    view = inspect.unwrap(task_library.select_library_task)
    app = Flask(__name__)
    with app.test_request_context(f'/api/quests/{QUEST}/task-library/select',
                                  method='POST', json={'sample_task_id': 's-1'}), \
            patch('database.get_supabase_admin_client', return_value=db), \
            patch.object(task_library, 'TaskLibraryService'):
        response = view(KID, QUEST)

    assert response[1] == 201
    row = db.data['user_quests'][0]
    assert row['is_active'] is True
    assert row['completed_at'] is None
