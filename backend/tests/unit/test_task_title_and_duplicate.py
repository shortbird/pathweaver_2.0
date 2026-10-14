"""Edit a task's title, and copy a task (tickets 03ee5c2d, 4476c061).

Karen Boyd, an Optio Academy parent working in her son Kaidan's account:

  03ee5c2d: "everything but the title can be edited. It would be nice to also
  be able to edit the task title."  PUT /api/tasks/<id> always accepted a
  title; the edit dialog never offered one. The route side is pinned here.

  4476c061: "copy an existing task to create a new one by just changing the
  title while keeping the same task description and evidence requirements."
  POST /api/tasks/<id>/duplicate copies the work's description, Definition of
  Done, pillar, XP and diploma subjects into the same enrollment, with no
  completion and no evidence, under the same permission as editing the task.
"""

import inspect
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask, g

from tests.crm_fakes import FakeSupabase
from utils.guardian_scope import StudentScope


KID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
STRANGER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
QUEST = 'ffffffff-ffff-4fff-8fff-ffffffffffff'


class _SingleQuery:
    """FakeQuery plus .single(), which the task routes use."""

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


class _DB(FakeSupabase):
    def table(self, name):
        return _SingleQuery(super().table(name))


SOURCE = {
    'id': 't-src', 'user_id': KID, 'quest_id': QUEST, 'user_quest_id': 'uq-1',
    'title': 'Read chapter 3', 'description': 'Read it and take notes.',
    'success_criteria': ['You read every page', 'You wrote five notes'],
    'pillar': 'communication', 'xp_value': 75,
    'diploma_subjects': {'Language Arts': 75},
    'subject_xp_distribution': {'language_arts': 75},
    'ai_suggested_xp': 50, 'order_index': 0, 'is_required': True,
    'source_template_task_id': None,
}


def _world(completed_at=None, **task_overrides):
    return _DB({
        'users': [
            {'id': KID, 'role': 'student', 'org_role': None, 'org_roles': None,
             'organization_id': None},
            {'id': STRANGER, 'role': 'student', 'org_role': None, 'org_roles': None,
             'organization_id': None},
        ],
        'quests': [{'id': QUEST, 'organization_id': None, 'allow_custom_tasks': True}],
        'user_quests': [{'id': 'uq-1', 'user_id': KID, 'quest_id': QUEST,
                         'is_active': completed_at is None, 'completed_at': completed_at}],
        'user_quest_tasks': [{**SOURCE, **task_overrides}],
        'quest_task_completions': [{'id': 'c-1', 'user_id': KID,
                                    'user_quest_task_id': 't-src'}],
    })


def _repo_for(db):
    repo = MagicMock()

    def find(task_id):
        return next((dict(t) for t in db.data['user_quest_tasks'] if t['id'] == task_id), None)
    repo.find_by_id.side_effect = find

    def create(row):
        return db.table('user_quest_tasks').insert(row).execute().data[0]
    repo.create_task.side_effect = create
    return repo


def _call(view_name, db, acting_as, *, caller=None, method='POST', body=None,
          blocked=None):
    from routes.tasks import crud
    view = inspect.unwrap(getattr(crud, view_name))
    app = Flask(__name__)
    with app.test_request_context('/api/tasks/t-src', method=method, json=body or {}), \
            patch('repositories.task_repository.TaskRepository', return_value=_repo_for(db)), \
            patch.object(crud, 'get_supabase_admin_client', return_value=db), \
            patch('utils.personalization_helpers.get_next_order_index', return_value=1), \
            patch('routes.quest_personalization._custom_tasks_blocked', return_value=blocked), \
            patch('utils.xp_permissions.is_xp_guide_user', return_value=False):
        g.student_scope = StudentScope(caller_id=caller or acting_as,
                                       student_id=acting_as, via='parent' if caller else 'self')
        response = view(acting_as, 't-src')
    body_, status = response if isinstance(response, tuple) else (response, 200)
    return body_.get_json(), status


# ── 03ee5c2d: the title ──────────────────────────────────────────────────────

@pytest.mark.unit
class TestEditingTheTitle:
    def test_a_new_title_is_saved_trimmed(self):
        db = _world()
        payload, status = _call('update_task', db, KID, caller=PARENT, method='PUT',
                                body={'title': '  Read chapter 4  '})
        assert status == 200, payload
        assert db.data['user_quest_tasks'][0]['title'] == 'Read chapter 4'

    def test_an_empty_title_is_refused(self):
        db = _world()
        payload, status = _call('update_task', db, KID, method='PUT', body={'title': '   '})
        assert status == 400
        assert db.data['user_quest_tasks'][0]['title'] == 'Read chapter 3'


# ── 4476c061: duplicate ──────────────────────────────────────────────────────

def _copies(db):
    return [t for t in db.data['user_quest_tasks'] if t['id'] != 't-src']


@pytest.mark.unit
class TestDuplicatingATask:
    def test_the_copy_keeps_the_work_and_drops_the_doing(self):
        db = _world()
        payload, status = _call('duplicate_task', db, KID, caller=PARENT)

        assert status == 201, payload
        [copy] = _copies(db)
        assert copy['title'] == 'Read chapter 3 (copy)'
        for field in ('description', 'success_criteria', 'pillar', 'xp_value',
                      'subject_xp_distribution'):
            assert copy[field] == SOURCE[field], field
        assert copy['user_id'] == KID
        assert copy['quest_id'] == QUEST
        assert copy['user_quest_id'] == 'uq-1'
        assert copy['is_required'] is False
        assert copy['approval_status'] == 'approved'
        # The parent made it, so the parent is named.
        assert copy['created_by_user_id'] == PARENT
        # Not completed: the only completion is still the original's.
        assert [c['user_quest_task_id'] for c in db.data['quest_task_completions']] == ['t-src']
        assert payload['task']['id'] == copy['id']

    def test_the_diploma_subjects_are_copied_not_defaulted(self):
        """The column defaults to ["Electives"]; a copy that omitted it would
        move the credit."""
        db = _world(diploma_subjects=['Math', 'Science'])
        _call('duplicate_task', db, KID)

        [copy] = _copies(db)
        assert copy['diploma_subjects'] == ['Math', 'Science']
        assert copy['created_by_user_id'] is None

    def test_another_students_task_is_refused(self):
        db = _world()
        payload, status = _call('duplicate_task', db, STRANGER)

        assert status == 403
        assert _copies(db) == []

    def test_a_quest_closed_to_own_tasks_is_refused(self):
        from flask import jsonify
        db = _world()
        app = Flask(__name__)
        with app.app_context():
            refusal = (jsonify({'success': False, 'error': 'no'}), 403)
        payload, status = _call('duplicate_task', db, KID, blocked=refusal)

        assert status == 403
        assert _copies(db) == []

    def test_a_copy_on_a_finished_quest_reopens_it(self):
        db = _world(completed_at='2026-10-01T18:00:00+00:00')
        _call('duplicate_task', db, KID)

        row = db.data['user_quests'][0]
        assert row['is_active'] is True
        assert row['completed_at'] is None
