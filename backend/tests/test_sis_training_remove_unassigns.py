"""Removing a quest from the training catalog takes it off unstarted accounts.

Ticket bd853b5d (iCreate teacher Hallee): "Hallee still has the 'Icreate
vision & philosophy Teacher quest' in her learning app, but that's been deleted
from the training section."

DELETE /api/sis/training/<id> used to delete only the sis_staff_training row,
so every enrollment it had created stayed active forever. Now the people in
this org who never started the quest have it set down (user_quests.is_active =
false). Anyone with a completed task, or a finished quest, keeps it exactly as
it is -- the "progress untouched" promise in the route's docstring. The same
quest enrolled outside the org is never touched.
"""

from unittest.mock import Mock, patch

import routes.sis.staff_training as training
from services import sis_training_service


ORG = 'org-1'
OTHER_ORG = 'org-2'
QUEST = 'quest-vision'
TRAINING_ID = '3f8a2b1c-9d4e-4f6a-8b7c-1e2d3f4a5b6c'


class _Query:
    """Just enough PostgREST: eq / in_ filters, range paging, update, delete."""

    def __init__(self, db, name):
        self.db, self.name = db, name
        self.filters, self.op, self.payload, self.rng = [], 'select', None, None

    def select(self, *_a, **_k):
        return self

    def eq(self, field, value):
        self.filters.append(lambda r: r.get(field) == value)
        return self

    def in_(self, field, values):
        values = set(values)
        self.filters.append(lambda r: r.get(field) in values)
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, n):
        self.rng = (0, n - 1)
        return self

    def range(self, a, b):
        self.rng = (a, b)
        return self

    def update(self, payload):
        self.op, self.payload = 'update', payload
        return self

    def delete(self):
        self.op = 'delete'
        return self

    def execute(self):
        rows = self.db.setdefault(self.name, [])
        hit = [r for r in rows if all(f(r) for f in self.filters)]
        if self.op == 'update':
            for r in hit:
                r.update(self.payload)
        elif self.op == 'delete':
            self.db[self.name] = [r for r in rows if r not in hit]
        if self.rng:
            hit = hit[self.rng[0]:self.rng[1] + 1]
        return Mock(data=[dict(r) for r in hit])


def _client(db):
    client = Mock()
    client.table.side_effect = lambda n: _Query(db, n)
    return client


def _db():
    return {
        'sis_staff_training': [
            {'id': TRAINING_ID, 'organization_id': ORG, 'quest_id': QUEST},
        ],
        'users': [
            {'id': 'hallee', 'organization_id': ORG},
            {'id': 'started', 'organization_id': ORG},
            {'id': 'finished', 'organization_id': ORG},
            {'id': 'elsewhere', 'organization_id': OTHER_ORG},
        ],
        'user_quests': [
            {'id': 'uq-hallee', 'user_id': 'hallee', 'quest_id': QUEST,
             'is_active': True, 'completed_at': None},
            {'id': 'uq-started', 'user_id': 'started', 'quest_id': QUEST,
             'is_active': True, 'completed_at': None},
            {'id': 'uq-finished', 'user_id': 'finished', 'quest_id': QUEST,
             'is_active': True, 'completed_at': '2026-09-01T00:00:00Z'},
            {'id': 'uq-elsewhere', 'user_id': 'elsewhere', 'quest_id': QUEST,
             'is_active': True, 'completed_at': None},
        ],
        'quest_task_completions': [
            {'id': 'c-1', 'user_id': 'started', 'quest_id': QUEST, 'task_id': 't-1'},
        ],
    }


def _remove(db):
    from flask import Flask
    client = _client(db)
    app = Flask(__name__)
    with patch.object(training, '_admin', return_value=client), \
         patch.object(sis_training_service, '_admin', return_value=client), \
         patch('services.sis_service.org_or_error', return_value=(ORG, None)), \
         app.test_request_context(method='DELETE'):
        resp = training.remove_training.__wrapped__('admin-1', TRAINING_ID)
    status = resp[1] if isinstance(resp, tuple) else 200
    body = (resp[0] if isinstance(resp, tuple) else resp).get_json()
    return body, status


def _active(db, uq_id):
    return next(r for r in db['user_quests'] if r['id'] == uq_id)['is_active']


def test_unstarted_enrollment_is_taken_off_the_account():
    """Ticket bd853b5d: Hallee never started the removed quest, so it leaves
    her learning app with the catalog row."""
    db = _db()
    body, status = _remove(db)
    assert status == 200
    assert _active(db, 'uq-hallee') is False
    assert body['unassigned'] == 1
    assert not db['sis_staff_training'], 'the catalog row is gone'


def test_enrollment_with_progress_is_kept():
    """Ticket bd853b5d: removal must not cost anyone their work -- a completed
    task or a finished quest keeps the enrollment as it was."""
    db = _db()
    _remove(db)
    assert _active(db, 'uq-started') is True
    assert _active(db, 'uq-finished') is True


def test_enrollment_in_another_org_is_untouched():
    """Ticket bd853b5d: one school removing its training must not reach the
    same quest on anybody else's account."""
    db = _db()
    _remove(db)
    assert _active(db, 'uq-elsewhere') is True


def test_quest_still_listed_by_another_catalog_row_stays_assigned():
    """Removing one of two catalog rows for the same quest (say the staff copy
    of a quest the families also have) leaves everybody's enrollment alone."""
    db = _db()
    db['sis_staff_training'].append(
        {'id': 'other-row', 'organization_id': ORG, 'quest_id': QUEST})
    body, status = _remove(db)
    assert status == 200
    assert body['unassigned'] == 0
    assert _active(db, 'uq-hallee') is True


def test_another_orgs_training_row_is_not_found():
    db = _db()
    db['sis_staff_training'][0]['organization_id'] = OTHER_ORG
    _, status = _remove(db)
    assert status == 404
    assert _active(db, 'uq-hallee') is True
