"""
Pushing a training quest's edits onto everyone already holding it.

Saving such a quest used to change only what FUTURE enrollees received, so
iCreate edited their orientation quest mid-event and all 152 families stayed on
the previous copy (2026-08-18).

What these tests actually guard is the destructive edge, because
quest_task_completions.user_quest_task_id and
user_task_evidence_documents.task_id are both ON DELETE CASCADE: deleting a
task row takes the completion, the awarded XP and any uploaded evidence with
it. Families submit while a resync runs, so the three cases below are the ones
that matter —

  * a completed task survives untouched;
  * a DRAFT evidence upload survives too (uploaded, not yet completed);
  * a task that gains work *during* the run is not deleted.

Rows are rewritten in place rather than deleted and recreated precisely so a
race cannot cascade. If someone ever "simplifies" this back to delete-then-
insert, these fail.
"""

from unittest.mock import Mock

import pytest

import app  # noqa: F401 — import graph ordering
from utils.template_tasks import resync_enrollments_to_template

QUEST = 'quest-1'


class FakeDB:
    """Enough of the PostgREST builder to record what the resync did."""

    def __init__(self, tasks, completions=(), evidence=(), enrollments=None,
                 work_appears_on=None):
        self.tasks = {t['id']: dict(t) for t in tasks}
        self.completions = list(completions)
        self.evidence = list(evidence)
        # `is None` rather than falsy: an explicitly empty list is a real case.
        self.enrollments = ([{'id': 'uq1', 'user_id': 'u1'}]
                            if enrollments is None else list(enrollments))
        # Task ids that acquire work between the first read and the pre-delete
        # re-check — the mid-run submission.
        self.work_appears_on = set(work_appears_on or ())
        self._work_reads = 0
        self.deleted, self.updated, self.inserted = [], {}, []

    def table(self, name):
        return _Query(self, name)


class _Query:
    def __init__(self, db, name):
        self.db, self.name = db, name
        self._payload = self._update = None
        self._in = self._eq_id = None

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        if col == 'id':
            self._eq_id = val
        return self

    def in_(self, _col, vals):
        self._in = list(vals)
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, *_a, **_k):
        return self

    def insert(self, payload):
        self._payload = payload
        return self

    def update(self, payload):
        self._update = payload
        return self

    def delete(self):
        self._payload = '__delete__'
        return self

    def execute(self):
        db = self.db
        if self.name == 'user_quest_tasks':
            if self._payload == '__delete__':
                for i in self._in or []:
                    db.deleted.append(i)
                    db.tasks.pop(i, None)
                return Mock(data=[])
            if self._payload is not None:
                rows = self._payload if isinstance(self._payload, list) else [self._payload]
                db.inserted.extend(rows)
                return Mock(data=rows)
            if self._update is not None:
                db.updated[self._eq_id] = self._update
                db.tasks[self._eq_id].update(self._update)
                return Mock(data=[db.tasks[self._eq_id]])
            return Mock(data=list(db.tasks.values()))

        if self.name == 'user_quests':
            if self._update is not None:
                return Mock(data=[])
            return Mock(data=list(db.enrollments))

        if self.name == 'quest_task_completions':
            db._work_reads += 1
            rows = list(db.completions)
            if db._work_reads > 1:  # the pre-delete re-check
                rows += [{'id': f'late-{t}', 'user_quest_task_id': t}
                         for t in db.work_appears_on]
            return Mock(data=rows)

        if self.name == 'user_task_evidence_documents':
            wanted = set(self._in or [])
            return Mock(data=[e for e in db.evidence if e['task_id'] in wanted])

        if self.name == 'quest_template_tasks':
            return Mock(data=[{'id': i} for i in (self._in or [])])

        return Mock(data=[])


def _task(i, title, order=0):
    return {'id': i, 'user_id': 'u1', 'user_quest_id': 'uq1',
            'title': title, 'order_index': order}


def _tmpl(title, order=0, tid=None):
    return {'id': tid or f'tmpl-{order}', 'title': title, 'pillar': 'stem',
            'xp_value': 25, 'order_index': order, 'description': ''}


TEMPLATE = [_tmpl('New first task', 0), _tmpl('New second task', 1)]


def test_a_completed_task_is_never_touched():
    db = FakeDB(
        tasks=[_task('t1', 'Done already', 0), _task('t2', 'Old wording', 1)],
        completions=[{'id': 'c1', 'user_quest_task_id': 't1'}],
    )
    out = resync_enrollments_to_template(db, QUEST, TEMPLATE)

    assert 't1' not in db.deleted, 'deleting it would cascade the completion away'
    assert 't1' not in db.updated, 'a finished task must not be retitled'
    assert out['kept'] == 1


def test_a_draft_evidence_upload_survives():
    """Uploaded but not completed. The cascade does not care about the
    difference, so neither does the protection."""
    db = FakeDB(
        tasks=[_task('t1', 'Has a photo', 0), _task('t2', 'Old wording', 1)],
        evidence=[{'task_id': 't1'}],
    )
    resync_enrollments_to_template(db, QUEST, TEMPLATE)

    assert 't1' not in db.deleted
    assert 't1' not in db.updated


def test_a_task_that_gains_work_mid_run_is_not_deleted():
    """The race the whole design exists for: surplus at snapshot time, somebody
    submits, and the pre-delete re-check has to catch it."""
    db = FakeDB(
        tasks=[_task('t1', 'Keep', 0), _task('t2', 'Keep too', 1),
               _task('t3', 'Surplus', 2)],
        work_appears_on={'t3'},
    )
    out = resync_enrollments_to_template(db, QUEST, TEMPLATE)

    assert 't3' not in db.deleted, 'a task somebody just completed was deleted'
    assert out['removed'] == 0


def test_unprotected_rows_are_rewritten_not_recreated():
    db = FakeDB(tasks=[_task('t1', 'Old one', 0), _task('t2', 'Old two', 1)])
    out = resync_enrollments_to_template(db, QUEST, TEMPLATE)

    assert set(db.updated) == {'t1', 't2'}
    assert db.deleted == [], 'rewriting must not go through a delete'
    assert out['updated'] == 2 and out['inserted'] == 0
    assert db.tasks['t1']['title'] == 'New first task'


def test_surplus_rows_are_removed_when_they_carry_nothing():
    db = FakeDB(tasks=[_task('t1', 'a', 0), _task('t2', 'b', 1), _task('t3', 'c', 2)])
    out = resync_enrollments_to_template(db, QUEST, TEMPLATE)

    assert db.deleted == ['t3']
    assert out['removed'] == 1


def test_missing_tasks_are_added():
    db = FakeDB(tasks=[_task('t1', 'only one', 0)])
    out = resync_enrollments_to_template(db, QUEST, TEMPLATE)

    assert out['inserted'] == 1
    assert db.inserted[0]['title'] == 'New second task'
    assert db.inserted[0]['user_quest_id'] == 'uq1'


def test_a_completed_task_is_not_duplicated_by_the_template():
    """Its title is already covered, so the template's copy must not be added
    alongside it."""
    db = FakeDB(
        tasks=[_task('t1', 'New first task', 0)],
        completions=[{'id': 'c1', 'user_quest_task_id': 't1'}],
    )
    resync_enrollments_to_template(db, QUEST, TEMPLATE)

    titles = [r['title'] for r in db.inserted]
    assert 'New first task' not in titles
    assert titles == ['New second task']


def test_title_match_ignores_whitespace_and_case():
    db = FakeDB(
        tasks=[_task('t1', '  new   FIRST task ', 0)],
        completions=[{'id': 'c1', 'user_quest_task_id': 't1'}],
    )
    resync_enrollments_to_template(db, QUEST, TEMPLATE)

    assert 'New first task' not in [r['title'] for r in db.inserted]


def test_nothing_happens_without_enrollments():
    db = FakeDB(tasks=[], enrollments=[])
    out = resync_enrollments_to_template(db, QUEST, TEMPLATE)
    assert out == {'enrollments': 0, 'updated': 0, 'inserted': 0,
                   'removed': 0, 'kept': 0}


def test_a_failed_work_probe_writes_nothing():
    """No probe, no deletes: not knowing what carries work is exactly when
    guessing is unaffordable."""
    class Exploding(FakeDB):
        def table(self, name):
            if name == 'quest_task_completions':
                raise RuntimeError('db down')
            return super().table(name)

    db = Exploding(tasks=[_task('t1', 'a', 0), _task('t2', 'b', 1)])
    out = resync_enrollments_to_template(db, QUEST, TEMPLATE)

    assert 'error' in out
    assert db.deleted == [] and db.updated == {} and db.inserted == []
