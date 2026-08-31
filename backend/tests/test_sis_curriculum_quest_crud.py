"""
Admin CRUD on a quest inside the curriculum, and the teacher round trip.

iCreate, 2026-08-31, two halves of one request:
  - "when admin creates a quest in /curriculum they need to be able to view the
    quests inside the curriculum and also have full CRUD" — the library row was
    title-only, so checking a quest meant finding a class it was assigned to;
  - "if teachers add quests it should appear there as well, in the curriculum
    for the class" — assigning or creating a quest on a class now auto-attaches
    it to the class's linked curricula.

The lines worth pinning: an Optio-library quest is readable but never editable
or deletable from here (an edit would change it for every school); a delete
refuses when any student has started the quest; and the auto-attach is additive
and idempotent — it never reorders or removes anything already saved.
"""

from unittest.mock import Mock, patch

import pytest

import routes.sis.curriculum as curriculum
from routes.sis import class_quests


ORG = '11111111-1111-4111-8111-111111111111'
CURR = '22222222-2222-4222-8222-222222222222'
QUEST = '33333333-3333-4333-8333-333333333333'
TASK = '44444444-4444-4444-8444-444444444444'
USER = '55555555-5555-4555-8555-555555555555'
CLASS = '66666666-6666-4666-8666-666666666666'


class _FakeTable:
    def __init__(self, name, rows, log):
        self.name = name
        self._rows = rows
        self._log = log

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def delete(self):
        self._log.append(('delete', self.name))
        return self

    def insert(self, payload):
        self._log.append(('insert', self.name, payload))
        return self

    def update(self, payload):
        self._log.append(('update', self.name, payload))
        return self

    def upsert(self, payload, **_k):
        self._log.append(('upsert', self.name, payload))
        return self

    def execute(self):
        return Mock(data=self._rows)


def _client(tables, log):
    c = Mock()
    c.table.side_effect = lambda name: _FakeTable(name, tables.get(name, []), log)
    return c


def _quest_row(org=ORG):
    return {'id': QUEST, 'title': 'Watercolor Basics', 'description': 'Paint.',
            'quest_type': 'project', 'organization_id': org, 'is_active': True}


def _run(route, args, body, tables):
    log = []
    with patch.object(curriculum, '_admin', return_value=_client(tables, log)), \
         patch.object(curriculum, '_org_or_error', return_value=(ORG, None)), \
         patch.object(curriculum, '_owned', return_value={'id': CURR, 'organization_id': ORG}), \
         patch.object(curriculum, 'request', Mock(get_json=lambda silent=True: body, args={})):
        from flask import Flask
        app = Flask(__name__)
        with app.app_context():
            fn = route.__wrapped__ if hasattr(route, '__wrapped__') else route
            resp = fn(USER, *args)
    body_json = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return body_json, status, log


def _tables(quest_org=ORG, linked=True, extra=None):
    t = {
        'sis_curriculum_quests': [{'quest_id': QUEST}] if linked else [],
        'quests': [_quest_row(org=quest_org)],
    }
    t.update(extra or {})
    return t


@pytest.mark.unit
class TestTheLibraryLineHolds:
    """A shared Optio quest is readable here but never editable or deletable."""

    def test_reading_a_library_quest_is_allowed_but_not_editable(self):
        out, status, _ = _run(curriculum.curriculum_quest_tasks, (CURR, QUEST),
                              {}, _tables(quest_org=None))
        assert status == 200
        assert out['editable'] is False

    def test_editing_a_library_quest_is_refused(self):
        out, status, log = _run(curriculum.update_curriculum_quest, (CURR, QUEST),
                                {'title': 'Hijacked'}, _tables(quest_org=None))
        assert status == 403
        assert log == []

    def test_deleting_a_library_quest_is_refused(self):
        out, status, log = _run(curriculum.delete_curriculum_quest, (CURR, QUEST),
                                {}, _tables(quest_org=None))
        assert status == 403
        assert log == []

    def test_adding_a_task_to_a_library_quest_is_refused(self):
        out, status, log = _run(curriculum.add_curriculum_quest_task, (CURR, QUEST),
                                {'title': 'Sneaky task'}, _tables(quest_org=None))
        assert status == 403
        assert log == []


@pytest.mark.unit
class TestOwnQuestCrud:
    def test_the_detail_read_carries_description_and_tasks(self):
        tasks = [{'id': TASK, 'title': 'Mix a color wheel', 'pillar': 'art',
                  'xp_value': 100, 'is_required': True, 'order_index': 0}]
        out, status, _ = _run(curriculum.curriculum_quest_tasks, (CURR, QUEST),
                              {}, _tables(extra={'quest_template_tasks': tasks}))
        assert status == 200
        assert out['editable'] is True
        assert out['quest']['description'] == 'Paint.'
        assert [t['title'] for t in out['tasks']] == ['Mix a color wheel']

    def test_a_rename_updates_the_quest(self):
        out, status, log = _run(curriculum.update_curriculum_quest, (CURR, QUEST),
                                {'title': 'Watercolor II'}, _tables())
        assert status == 200
        assert ('update', 'quests', {'title': 'Watercolor II'}) in log

    def test_a_quest_not_on_this_curriculum_is_not_reachable(self):
        out, status, _ = _run(curriculum.curriculum_quest_tasks, (CURR, QUEST),
                              {}, _tables(linked=False))
        assert status == 404


@pytest.mark.unit
class TestDeleteRefusesToDestroyStudentWork:
    def test_started_by_a_student_means_409_and_no_deletes(self):
        out, status, log = _run(curriculum.delete_curriculum_quest, (CURR, QUEST), {},
                                _tables(extra={'user_quests': [{'id': 'uq1'}]}))
        assert status == 409
        assert 'started' in out['error']
        assert log == []

    def test_unstarted_quest_is_deleted_with_every_link(self):
        out, status, log = _run(curriculum.delete_curriculum_quest, (CURR, QUEST), {},
                                _tables(extra={'user_quests': []}))
        assert status == 200
        deleted = [e[1] for e in log if e[0] == 'delete']
        assert deleted == ['class_quests', 'sis_curriculum_quests',
                           'quest_template_tasks', 'quests']


@pytest.mark.unit
class TestTeacherQuestsLandOnTheCurriculum:
    """_attach_quest_to_class_curricula: additive, idempotent, appended last."""

    def _run(self, existing, curricula=None):
        log = []
        admin = _client({'sis_curriculum_quests': existing}, log)
        with patch.object(class_quests, '_linked_curricula',
                          return_value=curricula if curricula is not None
                          else [{'id': CURR, 'title': 'Art'}]):
            class_quests._attach_quest_to_class_curricula(admin, CLASS, QUEST, USER)
        return log

    def test_a_new_quest_is_appended_after_the_saved_set(self):
        log = self._run([{'quest_id': 'other', 'sequence_order': 4}])
        upserts = [e for e in log if e[0] == 'upsert']
        assert len(upserts) == 1
        assert upserts[0][2]['quest_id'] == QUEST
        assert upserts[0][2]['sequence_order'] == 5

    def test_already_saved_means_nothing_is_written(self):
        log = self._run([{'quest_id': QUEST, 'sequence_order': 0}])
        assert [e for e in log if e[0] == 'upsert'] == []

    def test_no_curriculum_on_the_class_means_nothing_happens(self):
        log = self._run([], curricula=[])
        assert log == []

    def test_a_failure_never_raises_out_of_the_assignment(self):
        admin = Mock()
        admin.table.side_effect = RuntimeError('db down')
        with patch.object(class_quests, '_linked_curricula',
                          side_effect=RuntimeError('db down')):
            class_quests._attach_quest_to_class_curricula(admin, CLASS, QUEST, USER)
