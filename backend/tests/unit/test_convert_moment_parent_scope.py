"""A parent adds their child's moment to a quest (Sentry a3dc3fed).

Sentry a3dc3fed: "Error converting moment to task: Cannot coerce the result to
a single JSON object (PGRST116, 0 rows)" at
POST /api/learning-events/<id>/convert-to-task. A parent captured a moment for
their child and pressed "Add to quest" on the web journal. The modal posted no
student_id, so @student_scope kept the PARENT's id, the moment lookup
(id + user_id) found 0 rows, and `.single()` raised into a 500 that also
handed the raw database error to the client.

What this file pins:
  - a linked parent who names the child converts the child's moment
  - a parent who does not name the child gets a 404 "Moment not found",
    not a 500 or a raw PostgREST message, and nothing is written
  - an unrelated user who names the child is refused, and nothing is written
  - an unexpected failure returns a generic message, never str(e)
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from tests.crm_fakes import FakeSupabase

STUDENT = '11111111-1111-4111-8111-111111111111'
PARENT = '22222222-2222-4222-8222-222222222222'
STRANGER = '33333333-3333-4333-8333-333333333333'
MOMENT = '44444444-4444-4444-8444-444444444444'
QUEST = '55555555-5555-4555-8555-555555555555'


def _world():
    db = FakeSupabase()
    db.data.update({
        'learning_events': [{'id': MOMENT, 'user_id': STUDENT, 'title': 'Built a birdhouse',
                             'description': 'We built a birdhouse together.'}],
        'learning_event_topics': [],
        'user_quests': [{'id': 'uq1', 'user_id': STUDENT, 'quest_id': QUEST}],
        'user_quest_tasks': [],
        'quests': [{'id': QUEST, 'quest_type': 'optio', 'transcript_subject': None}],
        'user_task_evidence_documents': [],
        'evidence_document_blocks': [],
    })
    return db


def _call(caller, json, guardians=(PARENT,), db=None):
    """Run the route below @require_auth with @student_scope live."""
    from flask import Flask

    import routes.interest_tracks as routes

    view = routes.convert_moment_to_task.__wrapped__  # @student_scope's wrapper
    db = db or _world()
    app = Flask(__name__)

    def relationship(c, s):
        return {'via': 'parent'} if c in guardians and s == STUDENT else None

    with app.test_request_context('/', method='POST', json=json):
        with patch('services.interest_tracks_service.get_supabase_admin_client', return_value=db), \
             patch('utils.guardian_scope.guardian_relationship', side_effect=relationship), \
             patch('utils.guardian_scope._log_delegated_read'), \
             patch('utils.xp_permissions.get_effective_role_for', return_value='parent'), \
             patch('utils.xp_permissions.xp_locked_for_learner', return_value=False):
            resp = view(caller, MOMENT)
    body, status = resp if isinstance(resp, tuple) else (resp, 200)
    return body.get_json(), status, db


def test_parent_naming_the_child_converts_the_childs_moment():
    """Sentry a3dc3fed: a parent's "Add to quest" on the child's journal."""
    body, status, db = _call(PARENT, {'quest_id': QUEST, 'student_id': STUDENT, 'pillar': 'stem'})

    assert status == 201, body
    tasks = db.data['user_quest_tasks']
    assert len(tasks) == 1
    assert tasks[0]['user_id'] == STUDENT
    assert tasks[0]['source_moment_id'] == MOMENT


def test_parent_without_student_id_gets_404_not_500():
    """Sentry a3dc3fed: the exact failing request, which used to 500 with the
    raw PGRST116 text. It is now a plain "Moment not found" 404."""
    body, status, db = _call(PARENT, {'quest_id': QUEST, 'pillar': 'stem'})

    assert status == 404
    assert body['error'] == 'Moment not found'
    assert 'PGRST' not in str(body)
    assert db.data['user_quest_tasks'] == []


def test_unrelated_user_is_refused_and_nothing_is_written():
    """Sentry a3dc3fed: naming a student_id is not a way into a stranger's journal."""
    from middleware.error_handler import AuthorizationError

    db = _world()
    with pytest.raises(AuthorizationError):
        _call(STRANGER, {'quest_id': QUEST, 'student_id': STUDENT, 'pillar': 'stem'}, db=db)
    assert db.data['user_quest_tasks'] == []
    assert db.data['learning_event_topics'] == []


def test_unexpected_failure_returns_a_generic_message():
    """Sentry a3dc3fed: the old handler returned str(e) to the client."""
    from services.interest_tracks_service import InterestTracksService

    class Boom:
        def table(self, name):
            raise RuntimeError('relation "secret_internal" does not exist')

    with patch('services.interest_tracks_service.get_supabase_admin_client', return_value=Boom()):
        result = InterestTracksService.convert_moment_to_task(user_id=STUDENT, moment_id=MOMENT, quest_id=QUEST)

    assert result['success'] is False
    assert 'secret_internal' not in result['error']
