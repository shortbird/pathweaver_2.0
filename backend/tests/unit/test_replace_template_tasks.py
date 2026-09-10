"""Saving a preset-task list keeps the tasks that are still there.

The training editor deleted every quest_template_tasks row for the quest and
inserted the submitted list again. The words on the page came out right, so
nothing looked wrong — and two things keyed on those rows were quietly wrecked
on every save:

  * user_quest_tasks.source_template_task_id is FK'd to them, so each enrolled
    student's link to the template it came from was NULLed. utils/template_tasks
    ._title_key exists only to re-find them afterwards by matching titles, which
    fails exactly when the edit was the title.
  * quest_resources hangs off task_id ON DELETE CASCADE, so fixing a typo in a
    description would have silently taken every handout attached to that quest's
    tasks with it.

So the list is paired against what is stored, and only what is genuinely gone is
deleted.
"""

from unittest.mock import Mock, call

import pytest

from services import sis_quest_authoring as authoring

QUEST = 'quest-1'


class _Recorder:
    """A Supabase double that records writes and answers the existing-rows read."""

    def __init__(self, existing):
        self.existing = existing
        self.updates = []
        self.inserts = []
        self.deletes = []

    def table(self, name):
        assert name == 'quest_template_tasks'
        return _Table(self)


class _Table:
    def __init__(self, rec):
        self._rec = rec
        self._op = None
        self._payload = None
        self._filter = None

    def select(self, *_a, **_k):
        self._op = 'select'
        return self

    def order(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self._filter = (column, value)
        return self

    def in_(self, column, values):
        self._filter = (column, list(values))
        return self

    def update(self, payload):
        self._op, self._payload = 'update', payload
        return self

    def insert(self, payload):
        self._op, self._payload = 'insert', payload
        return self

    def delete(self):
        self._op = 'delete'
        return self

    def execute(self):
        if self._op == 'select':
            return Mock(data=self._rec.existing)
        if self._op == 'update':
            self._rec.updates.append((self._filter[1], self._payload))
        elif self._op == 'insert':
            self._rec.inserts.extend(self._payload if isinstance(self._payload, list)
                                     else [self._payload])
        elif self._op == 'delete':
            self._rec.deletes.extend(self._filter[1])
        return Mock(data=[])


def _existing(*rows):
    return [{'id': i, 'title': t, 'order_index': n}
            for n, (i, t) in enumerate(rows)]


def _task(title, **extra):
    return {'title': title, 'description': '', 'pillar': 'creativity',
            'xp_value': 100, 'is_required': False, 'order_index': 0, **extra}


@pytest.mark.unit
class TestNothingIsDeletedUnnecessarily:
    def test_an_unchanged_list_deletes_nothing(self):
        rec = _Recorder(_existing(('t1', 'Read the handbook'), ('t2', 'Sign the form')))
        result = authoring.replace_template_tasks(
            rec, QUEST, [_task('Read the handbook'), _task('Sign the form')])
        assert rec.deletes == []
        assert result == {'kept': 2, 'added': 0, 'removed': 0}

    def test_an_unchanged_list_inserts_nothing(self):
        rec = _Recorder(_existing(('t1', 'Read the handbook')))
        authoring.replace_template_tasks(rec, QUEST, [_task('Read the handbook')])
        assert rec.inserts == []

    def test_editing_a_description_keeps_the_task(self):
        rec = _Recorder(_existing(('t1', 'Read the handbook')))
        authoring.replace_template_tasks(
            rec, QUEST, [_task('Read the handbook', description='All of it')])
        assert rec.deletes == []
        assert rec.updates[0][0] == 't1'
        assert rec.updates[0][1]['description'] == 'All of it'


@pytest.mark.unit
class TestPairing:
    def test_it_pairs_on_the_id_the_form_sent_back(self):
        rec = _Recorder(_existing(('t1', 'One'), ('t2', 'Two')))
        authoring.replace_template_tasks(
            rec, QUEST, [_task('Two', id='t2'), _task('One', id='t1')])
        assert {u[0] for u in rec.updates} == {'t1', 't2'}
        assert rec.deletes == []

    def test_a_renamed_task_keeps_its_id_when_the_form_sends_one(self):
        """The case _title_key cannot handle: the edit IS the title."""
        rec = _Recorder(_existing(('t1', 'Read the handbook')))
        authoring.replace_template_tasks(
            rec, QUEST, [_task('Read the staff handbook', id='t1')])
        assert rec.updates[0][0] == 't1'
        assert rec.updates[0][1]['title'] == 'Read the staff handbook'
        assert rec.deletes == []

    def test_it_falls_back_to_the_title(self):
        rec = _Recorder(_existing(('t1', 'Read the handbook')))
        authoring.replace_template_tasks(rec, QUEST, [_task('Read the handbook')])
        assert rec.updates[0][0] == 't1'

    def test_the_title_match_ignores_case_and_spacing(self):
        rec = _Recorder(_existing(('t1', 'Read  the Handbook')))
        authoring.replace_template_tasks(rec, QUEST, [_task('read the handbook')])
        assert rec.updates[0][0] == 't1'
        assert rec.deletes == []

    def test_it_falls_back_to_position(self):
        """A rename with no id sent. The task at that place is still that task,
        and its resources and its students' copies should follow the rename."""
        rec = _Recorder(_existing(('t1', 'Old name')))
        authoring.replace_template_tasks(rec, QUEST, [_task('New name')])
        assert rec.updates[0][0] == 't1'
        assert rec.deletes == []

    def test_two_tasks_with_the_same_title_each_pair_once(self):
        rec = _Recorder(_existing(('t1', 'Practise'), ('t2', 'Practise')))
        authoring.replace_template_tasks(
            rec, QUEST, [_task('Practise'), _task('Practise')])
        assert {u[0] for u in rec.updates} == {'t1', 't2'}
        assert rec.deletes == []


@pytest.mark.unit
class TestAddingAndRemoving:
    def test_a_new_task_is_inserted(self):
        rec = _Recorder(_existing(('t1', 'One')))
        result = authoring.replace_template_tasks(
            rec, QUEST, [_task('One'), _task('Two')])
        assert [i['title'] for i in rec.inserts] == ['Two']
        assert result['added'] == 1

    def test_an_inserted_task_carries_the_quest(self):
        rec = _Recorder([])
        authoring.replace_template_tasks(rec, QUEST, [_task('One')])
        assert rec.inserts[0]['quest_id'] == QUEST

    def test_a_removed_task_is_deleted(self):
        rec = _Recorder(_existing(('t1', 'One'), ('t2', 'Two')))
        result = authoring.replace_template_tasks(rec, QUEST, [_task('One')])
        assert rec.deletes == ['t2']
        assert result['removed'] == 1

    def test_clearing_the_list_removes_everything(self):
        rec = _Recorder(_existing(('t1', 'One'), ('t2', 'Two')))
        authoring.replace_template_tasks(rec, QUEST, [])
        assert sorted(rec.deletes) == ['t1', 't2']

    def test_a_first_save_on_an_empty_quest_just_inserts(self):
        rec = _Recorder([])
        result = authoring.replace_template_tasks(
            rec, QUEST, [_task('One'), _task('Two')])
        assert len(rec.inserts) == 2
        assert result == {'kept': 0, 'added': 2, 'removed': 0}


@pytest.mark.unit
class TestTheUpdatePayload:
    def test_created_at_is_not_rewritten(self):
        """An update carries the whole cleaned row; created_at in it would move
        the task's age forward on every save."""
        rec = _Recorder(_existing(('t1', 'One')))
        authoring.replace_template_tasks(
            rec, QUEST, [_task('One', created_at='2020-01-01', updated_at='now')])
        assert 'created_at' not in rec.updates[0][1]
        assert 'updated_at' in rec.updates[0][1]

    def test_the_submitted_id_is_not_written_as_a_column(self):
        rec = _Recorder(_existing(('t1', 'One')))
        authoring.replace_template_tasks(rec, QUEST, [_task('One', id='t1')])
        assert 'id' not in rec.updates[0][1]

    def test_a_row_with_no_id_is_replaced_rather_than_updated(self):
        """Defensive: a select that did not ask for the id leaves rows that
        cannot be updated in place. Better to insert fresh than to write to an
        unknown row."""
        rec = _Recorder([{'title': 'One', 'order_index': 0}])
        authoring.replace_template_tasks(rec, QUEST, [_task('One')])
        assert rec.updates == []
        assert [i['title'] for i in rec.inserts] == ['One']
