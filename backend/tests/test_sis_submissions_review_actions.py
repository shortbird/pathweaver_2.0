"""SIS Submissions: Grow this (send back with a note) and bulk accept.

Tanner, 2026-10-15: the Submissions tab reviews "like the credit-review
process" -- the same Accept and Grow this decision, and the same bulk accept
from a selection in the queue. The two flows stay apart on the server: these
write sis_submission_reviews through /api/sis/submissions, never diploma_status
through /api/credit-dashboard.

  - POST /submissions/<id>/review {action: 'grow_this', feedback} saves a
    'grow_this' review and posts the note to the task's feedback thread
    (credit_review_messages). No note, no send-back. Any other action is
    refused, where before any string was stored.
  - POST /submissions/bulk-review {completion_ids} accepts every one inside
    the caller's own inbox, skips the rest without writing them, and skips
    one already accepted so the student is not told twice.
"""

from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

import app  # noqa: F401 -- import graph ordering
from routes.sis import submissions
from tests.test_sis_submissions_search_and_paging import (
    CLASS, ORG, TEACHER, FakeQuery, _world,
)


class WritableQuery(FakeQuery):
    """The search tests' fake, plus the writes the review routes make."""

    def __init__(self, tables, calls, name):
        super().__init__(tables.setdefault(name, []), calls, name)
        self._tables = tables

    def upsert(self, rows, on_conflict=None):
        rows = rows if isinstance(rows, list) else [rows]
        table = self._rows
        for row in rows:
            existing = next((r for r in table if r.get(on_conflict) == row.get(on_conflict)), None)
            if existing is not None:
                existing.update(row)
            else:
                table.append(dict(row))
        self._calls.append((self._name, 'upsert', len(rows)))
        self._written = rows
        return self

    def insert(self, row):
        self._rows.append(dict(row))
        self._calls.append((self._name, 'insert', 1))
        self._written = [row]
        return self

    def execute(self):
        if hasattr(self, '_written'):
            return MagicMock(data=[dict(r) for r in self._written])
        return super().execute()


def _admin(tables, calls):
    admin = MagicMock()
    admin.table.side_effect = lambda name: WritableQuery(tables, calls, name)
    return admin


def _call(view, world, body, *args, scope=None):
    """Run a route as TEACHER. `scope`: the class ids an advisor teaches, or
    None for an org admin who sees every class."""
    calls = []
    admin = _admin(world, calls)
    notify = MagicMock()
    users = MagicMock()
    users.return_value.find_by_id.return_value = {'id': TEACHER, 'role': 'org_managed',
                                                  'org_role': 'advisor', 'org_roles': ['advisor']}
    with Flask(__name__).test_request_context('/', method='POST', json=body), \
         patch.object(submissions, 'get_supabase_admin_client', return_value=admin), \
         patch.object(submissions.sis_service, 'org_or_error', return_value=(ORG, None)), \
         patch.object(submissions.sis_service, 'class_scope', return_value=scope), \
         patch.object(submissions, '_school_students', return_value=None), \
         patch.object(submissions, '_individual_pairs', return_value=set()), \
         patch.object(submissions, '_notify_reviewed', notify), \
         patch('repositories.user_repository.UserRepository', users):
        resp = view.__wrapped__(TEACHER, *args)
    response, status = (resp if isinstance(resp, tuple) else (resp, 200))
    return response.get_json(), status, notify, calls


def _review(world, body, cid='c-00000', scope=None):
    return _call(submissions.review_submission, world, body, cid, scope=scope)


def _bulk(world, body, scope=None):
    return _call(submissions.bulk_review_submissions, world, body, scope=scope)


def _reviews(world):
    return {r['completion_id']: r for r in world['sis_submission_reviews']}


@pytest.mark.unit
class TestGrowThis:

    def test_sends_back_with_the_note_on_the_thread(self):
        world = _world(2)
        body, status, notify, _ = _review(world, {'action': 'grow_this',
                                                  'feedback': '  Add a photo of the model.  '})
        assert status == 201 and body['success'] is True
        assert _reviews(world)['c-00000']['action'] == 'grow_this'
        assert _reviews(world)['c-00000']['reviewed_by'] == TEACHER
        notes = world['credit_review_messages']
        assert notes == [{'completion_id': 'c-00000', 'author_id': TEACHER,
                          'author_role': 'advisor', 'body': 'Add a photo of the model.'}]
        # The student hears "revise", not "accepted".
        assert notify.call_args.args[2] == 'grow_this'

    def test_needs_a_note(self):
        world = _world(2)
        body, status, notify, _ = _review(world, {'action': 'grow_this', 'feedback': '   '})
        assert status == 400
        assert world['sis_submission_reviews'] == []
        assert world.get('credit_review_messages', []) == []
        notify.assert_not_called()

    def test_refuses_an_unknown_action(self):
        world = _world(2)
        _, status, _, _ = _review(world, {'action': 'approve'})
        assert status == 400
        assert world['sis_submission_reviews'] == []

    def test_outside_the_callers_classes_is_not_found_and_writes_nothing(self):
        world = _world(2)
        body, status, _, _ = _review(world, {'action': 'grow_this', 'feedback': 'x'},
                                     scope=['some-other-class'])
        assert status == 404
        assert world['sis_submission_reviews'] == []
        assert world.get('credit_review_messages', []) == []

    def test_accept_still_works_and_posts_no_note(self):
        world = _world(2)
        body, status, notify, _ = _review(world, {'action': 'accepted'})
        assert status == 201
        assert _reviews(world)['c-00000']['action'] == 'accepted'
        assert world.get('credit_review_messages', []) == []
        assert notify.call_args.args[2] == 'accepted'

    def test_writes_nothing_to_the_credit_tables(self):
        world = _world(2)
        _, _, _, calls = _review(world, {'action': 'grow_this', 'feedback': 'More, please.'})
        touched = {c[0] for c in calls}
        assert 'diploma_review_rounds' not in touched
        written = {c[0] for c in calls if c[1] in ('upsert', 'insert')}
        assert written == {'sis_submission_reviews', 'credit_review_messages'}


@pytest.mark.unit
class TestBulkAccept:

    def test_accepts_every_selected_submission(self):
        world = _world(3)
        body, status, notify, _ = _bulk(world, {'completion_ids': ['c-00000', 'c-00002']})
        assert status == 201
        assert body['reviewed'] == ['c-00000', 'c-00002'] and body['skipped'] == []
        reviews = _reviews(world)
        assert set(reviews) == {'c-00000', 'c-00002'}
        assert all(r['action'] == 'accepted' and r['organization_id'] == ORG
                   for r in reviews.values())
        assert notify.call_count == 2

    def test_skips_what_is_outside_the_inbox_and_what_does_not_exist(self):
        world = _world(3)
        body, status, _, _ = _bulk(world, {'completion_ids': ['c-00000', 'nope']},
                                   scope=['some-other-class'])
        assert body['reviewed'] == [] and body['skipped'] == ['c-00000', 'nope']
        assert world['sis_submission_reviews'] == []

    def test_an_advisor_accepts_only_their_own_class(self):
        world = _world(2)
        body, _, _, _ = _bulk(world, {'completion_ids': ['c-00000', 'ghost']}, scope=[CLASS])
        assert body['reviewed'] == ['c-00000'] and body['skipped'] == ['ghost']

    def test_does_not_tell_the_student_twice(self):
        world = _world(3, reviewed=(0,))
        body, _, notify, _ = _bulk(world, {'completion_ids': ['c-00000', 'c-00001']})
        assert body['reviewed'] == ['c-00001'] and body['skipped'] == ['c-00000']
        assert notify.call_count == 1

    @pytest.mark.parametrize('payload', [
        {},
        {'completion_ids': []},
        {'completion_ids': 'c-00000'},
        {'completion_ids': ['c-00000'], 'action': 'grow_this'},
        {'completion_ids': [f'c-{i:05d}' for i in range(submissions.BULK_REVIEW_LIMIT + 1)]},
    ])
    def test_refuses_a_bad_request(self, payload):
        world = _world(2)
        _, status, notify, _ = _bulk(world, payload)
        assert status == 400
        assert world['sis_submission_reviews'] == []
        notify.assert_not_called()


@pytest.mark.unit
def test_bulk_review_has_one_owner_and_the_staff_gate():
    from app import app as flask_app
    adapter = flask_app.url_map.bind('localhost')
    endpoint, _ = adapter.match('/api/sis/submissions/bulk-review', method='POST')
    assert endpoint == 'sis_submissions.bulk_review_submissions'
    rules = [r for r in flask_app.url_map.iter_rules()
             if r.rule == '/api/sis/submissions/bulk-review']
    assert len(rules) == 1
    # require_role wraps the view; the unwrapped one is what the tests call.
    assert hasattr(submissions.bulk_review_submissions, '__wrapped__')
