"""The learning app's Verifications page, for schools without the SIS
(routes/teacher_verification.py). Fixed 2026-09-25.

It never worked. The queue asked for role='student', which no org member has
(theirs is org_role), so it was always empty; approving read users.advisor_id
and wrote four quest_task_completions columns, none of which existed. Migration
20260925120000 added the columns. What these pin:

  - the queue finds org-managed students and leaves out reviewed work;
  - a teacher may review a student at their own school, and no other;
  - an approve records who, when, the split and the note.
"""

from unittest.mock import Mock, patch

import pytest


class _Query:
    """A chained PostgREST query that records its filters and answers from a
    per-table list of rows."""

    def __init__(self, db, table):
        self.db, self.table = db, table
        self.filters = []
        self.update_payload = None

    def __getattr__(self, name):
        if name in ('select', 'eq', 'in_', 'or_', 'is_', 'order', 'limit', 'single', 'maybe_single'):
            def chain(*args, **kwargs):
                self.filters.append((name, args))
                return self
            return chain
        raise AttributeError(name)

    def update(self, payload):
        self.update_payload = payload
        self.db.updates.append((self.table, payload))
        return self

    def execute(self):
        self.db.queries.append(self)
        rows = self.db.rows.get(self.table, [])
        ids = next((a[1] for n, a in self.filters if n == 'in_' and a[0] == 'id'), None)
        if ids is not None:
            rows = [r for r in rows if r['id'] in ids]
        by_id = next((a[1] for n, a in self.filters if n == 'eq' and a[0] == 'id'), None)
        if by_id is not None:
            rows = [r for r in rows if r['id'] == by_id]
        if any(n in ('single', 'maybe_single') for n, _ in self.filters):
            return Mock(data=rows[0] if rows else None)
        return Mock(data=rows)


class _Db:
    def __init__(self, rows):
        self.rows, self.queries, self.updates = rows, [], []

    def table(self, name):
        return _Query(self, name)


TEACHER = {'id': 'teach', 'role': 'org_managed', 'organization_id': 'org-1'}


def _call(app, db, fn_name, *args, body=None):
    """Run a route's own body (under its auth decorator) in a request context."""
    from routes import teacher_verification
    inner = getattr(teacher_verification, fn_name).__wrapped__
    with app.test_request_context(json=body), \
         patch('routes.teacher_verification.get_supabase_admin_client', return_value=db), \
         patch('routes.teacher_verification.sign_in_place'):
        return inner(*args)


@pytest.mark.unit
def test_the_queue_finds_org_members_and_leaves_out_reviewed_work(app):
    db = _Db({
        'users': [{'id': 'teach', 'organization_id': 'org-1', 'display_name': 'T'},
                  {'id': 'kid', 'organization_id': 'org-1', 'display_name': 'Kid'}],
        'quest_task_completions': [{'id': 'qc1', 'user_id': 'kid', 'user_quest_task_id': 'ut1',
                                    'quest_id': 'q1', 'completed_at': '2026-09-20'}],
        'user_quest_tasks': [{'id': 'ut1', 'title': 'Build a birdhouse', 'xp_value': 100,
                              'subject_xp_distribution': {'cte': 100}, 'quests': {'title': 'Woodshop'}}],
    })
    resp, status = _call(app, db, 'get_pending_verifications', 'teach')
    assert status == 200
    item = resp.get_json()['pending_verifications'][0]
    assert item['quest_title'] == 'Woodshop' and item['xp_awarded'] == 100
    assert item['subject_distribution'] == {'cte': 100}
    assert any(q.table == 'users' and ('or_', ('role.eq.student,org_role.eq.student',)) in q.filters
               for q in db.queries)
    completions_q = next(q for q in db.queries if q.table == 'quest_task_completions')
    assert ('is_', ('subject_verified_at', 'null')) in completions_q.filters


@pytest.mark.unit
class TestVerify:
    APPROVE = {'action': 'approve', 'subject_distribution': {'cte': 100}, 'notes': 'Solid'}

    def _db(self, student_org):
        return _Db({
            'quest_task_completions': [{'id': 'qc1', 'user_id': 'kid'}],
            'users': [TEACHER, {'id': 'kid', 'role': 'org_managed', 'organization_id': student_org}],
        })

    def test_a_teacher_approves_a_student_at_their_own_school(self, app):
        db = self._db('org-1')
        resp, status = _call(app, db, 'verify_task_completion', 'teach', 'qc1', body=self.APPROVE)
        assert status == 200
        table, payload = db.updates[0]
        assert table == 'quest_task_completions'
        assert payload['verified_by_advisor_id'] == 'teach'
        assert payload['subject_distribution'] == {'cte': 100}
        assert payload['verification_notes'] == 'Solid'
        assert payload['subject_verified_at']

    def test_a_student_at_another_school_is_refused(self, app):
        db = self._db('org-2')
        resp, status = _call(app, db, 'verify_task_completion', 'teach', 'qc1', body=self.APPROVE)
        assert status == 403
        assert db.updates == []

    def test_a_reject_records_the_review_without_a_split(self, app):
        db = self._db('org-1')
        body = {'action': 'reject', 'notes': 'No evidence attached'}
        resp, status = _call(app, db, 'verify_task_completion', 'teach', 'qc1', body=body)
        assert status == 200
        assert 'subject_distribution' not in db.updates[0][1]
