"""POST /api/family/quests/<id>/enroll-children gives the child the task list.

A parent-made quest has no authored template: every task the parent adds
goes to ONE child's enrollment (user_quest_tasks), not the quest. Until
2026-09-18 "Add <sibling>" on the family card enrolled the sibling with the
template -- nothing -- and the parent retyped the list ("can I copy-paste
the quest to my other kid?"). Now the sibling gets a fresh copy of the
fullest list anybody in the family holds on the quest. A quest made on a
child's account (Create quest from inside the child's page) is the family's
to enroll into, the same as one made on the parent's.
"""

from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from routes import family_quests


PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
ROMNEY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
BUBBA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
STRANGER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
QUEST = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
UQ_ROMNEY = 'uq-romney'
UQ_BUBBA = 'uq-bubba'

ROMNEYS_TASKS = [
    {'id': 't-2', 'user_quest_id': UQ_ROMNEY, 'title': 'Plan the route', 'description': 'Map it', 'pillar': 'stem',
     'xp_value': 50, 'order_index': 1, 'is_required': False, 'is_manual': True,
     'diploma_subjects': ['Social Studies'], 'subject_xp_distribution': {'Social Studies': 50},
     'success_criteria': {'constraint': 'three stops'}, 'source_template_task_id': None, 'created_at': '2026-09-02T00:00:00+00:00'},
    {'id': 't-1', 'user_quest_id': UQ_ROMNEY, 'title': 'Pick the cities', 'description': '', 'pillar': 'society',
     'xp_value': 25, 'order_index': 0, 'is_required': True, 'is_manual': False,
     'diploma_subjects': ['Electives'], 'subject_xp_distribution': None,
     'success_criteria': None, 'source_template_task_id': None, 'created_at': '2026-09-01T00:00:00+00:00'},
]


def _innermost(view):
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    return view


class _Query:
    """A PostgREST chain that answers per table and records writes."""

    def __init__(self, table, answers, log):
        self._table, self._answers, self._log = table, answers, log
        self.filters = {}
        self._single = False

    def __getattr__(self, name):
        def chain(*args, **kwargs):
            if name in ('eq', 'in_') and len(args) == 2:
                self.filters[args[0]] = args[1]
            if name == 'single':
                self._single = True
            if name in ('insert', 'update'):
                self._log.append((name, self._table, args[0] if args else None))
            return self
        return chain

    def execute(self):
        result = MagicMock()
        answer = self._answers.get(self._table, [])
        rows = answer(self.filters) if callable(answer) else answer
        if self._single and isinstance(rows, list):
            rows = rows[0] if rows else None
        result.data = rows
        return result


def _client(answers, log):
    client = MagicMock()
    client.table.side_effect = lambda name: _Query(name, answers, log)
    return client


@pytest.fixture
def app():
    return Flask(__name__)


def _answers(created_by=PARENT, romneys_tasks=ROMNEYS_TASKS, bubbas_tasks=()):
    def user_quests(filters):
        return [{'id': UQ_ROMNEY, 'user_id': ROMNEY, 'quest_id': QUEST}]

    def user_quest_tasks(filters):
        if filters.get('user_quest_id') == UQ_BUBBA:
            return list(bubbas_tasks)                    # the "already has a list?" check
        return [t for t in romneys_tasks if t['user_quest_id'] in filters.get('user_quest_id', [])]

    return {
        'quests': [{'id': QUEST, 'created_by': created_by, 'is_public': False}],
        'users': [{'role': 'parent'}],
        'user_quests': user_quests,
        'user_quest_tasks': user_quest_tasks,
    }


def _add_bubba(app, answers, log, template_tasks=()):
    repo = MagicMock()
    repo.enroll_user.return_value = {'id': UQ_BUBBA}
    with app.test_request_context(f'/api/family/quests/{QUEST}/enroll-children', method='POST', json={'child_ids': [BUBBA]}), \
            patch.object(family_quests, 'verify_parent_role'), \
            patch.object(family_quests, 'get_supabase_admin_client', return_value=_client(answers, log)), \
            patch('utils.class_membership.children_of_parent', return_value={ROMNEY, BUBBA}), \
            patch('routes.quest_types.get_template_tasks', return_value=list(template_tasks)), \
            patch('utils.template_tasks.get_valid_source_template_ids', return_value=set()), \
            patch('repositories.quest_repository.QuestRepository', return_value=repo):
        response = _innermost(family_quests.enroll_children_in_family_quest)(PARENT, QUEST)
    if isinstance(response, tuple):
        return response[0].get_json(), response[1]
    return response.get_json(), response.status_code


def _inserted_tasks(log):
    return [rows for op, table, rows in log if op == 'insert' and table == 'user_quest_tasks']


def test_the_sibling_gets_a_fresh_copy_of_the_list(app):
    log = []
    body, status = _add_bubba(app, _answers(), log)
    assert status == 200, body
    assert body['enrolled'] == [{'child_id': BUBBA, 'enrollment_id': UQ_BUBBA, 'tasks_copied': 2}]

    (rows,) = _inserted_tasks(log)
    assert [r['title'] for r in rows] == ['Pick the cities', 'Plan the route']   # in Romney's order
    plan = rows[1]
    assert plan == {
        'user_id': BUBBA, 'quest_id': QUEST, 'user_quest_id': UQ_BUBBA,
        'title': 'Plan the route', 'description': 'Map it', 'pillar': 'stem', 'xp_value': 50,
        'order_index': 1, 'is_required': False, 'is_manual': True, 'approval_status': 'approved',
        'diploma_subjects': ['Social Studies'], 'subject_xp_distribution': {'Social Studies': 50},
        'success_criteria': {'constraint': 'three stops'},
        'source_template_task_id': None, 'source_task_id': 't-2',
        'created_by_user_id': PARENT,
    }
    # Nothing of Romney's progress comes across.
    for r in rows:
        assert r['user_id'] == BUBBA
        assert not {'latest_feedback', 'feedback_at', 'current_revision', 'source_moment_id', 'due_date'} & set(r)


def test_a_missing_subject_list_defaults_to_electives_not_null(app):
    log = []
    tasks = [dict(ROMNEYS_TASKS[1], diploma_subjects=None)]
    body, status = _add_bubba(app, _answers(romneys_tasks=tasks), log)
    assert status == 200, body
    (rows,) = _inserted_tasks(log)
    assert rows[0]['diploma_subjects'] == ['Electives']


def test_the_template_still_wins_when_the_quest_has_one(app):
    log = []
    template = [{'id': 'tpl-1', 'title': 'From the template', 'pillar': 'stem', 'xp_value': 100}]
    body, status = _add_bubba(app, _answers(), log, template_tasks=template)
    assert status == 200, body
    (rows,) = _inserted_tasks(log)
    assert [r['title'] for r in rows] == ['From the template']
    assert body['enrolled'][0]['tasks_copied'] == 1


def test_a_child_picking_the_quest_back_up_keeps_their_own_list(app):
    # Bubba ended the quest and is being added again: enroll_user reactivates
    # the enrollment, and the list already on it must not be doubled.
    log = []
    body, status = _add_bubba(app, _answers(bubbas_tasks=[{'id': 'b-1'}]), log)
    assert status == 200, body
    assert _inserted_tasks(log) == []
    assert body['enrolled'][0]['tasks_copied'] == 0


def test_nobody_in_the_family_holding_a_list_means_an_empty_quest(app):
    log = []
    body, status = _add_bubba(app, _answers(romneys_tasks=[]), log)
    assert status == 200, body
    assert _inserted_tasks(log) == []
    assert body['enrolled'][0]['tasks_copied'] == 0


def test_a_quest_made_on_a_childs_account_is_the_familys_to_enroll_into(app):
    # Create quest from inside Romney's page makes the quest on ROMNEY's
    # account; the parent may put Bubba on it.
    log = []
    body, status = _add_bubba(app, _answers(created_by=ROMNEY), log)
    assert status == 200, body
    assert body['enrolled'][0]['tasks_copied'] == 2


def test_another_familys_private_quest_is_still_refused(app):
    log = []
    body, status = _add_bubba(app, _answers(created_by=STRANGER), log)
    assert status == 403
    assert body['error'] == 'Permission denied'
    assert log == []
