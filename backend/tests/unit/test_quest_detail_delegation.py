"""GET /api/quests/<id>?student_id= reads the CHILD's quest, or refuses.

This is the endpoint that makes the parent's quest screen the same screen the
kid sees. Two things must hold, and neither is visible by reading the view:

  1. every per-user query below the swap is scoped to the STUDENT — a single
     one left on the caller would render a parent's own (empty) enrollment
     under the child's quest title, which reads as lost work;
  2. a caller with no claim on the student gets a 403 rather than a 500 with
     somebody's kid's tasks half-assembled behind it.
"""

from unittest.mock import MagicMock, patch

from flask import Flask

from routes.quest import detail
from utils.guardian_scope import GuardianAccessError


PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
KID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
QUEST = 'qqqqqqqq-qqqq-4qqq-8qqq-qqqqqqqqqqqq'


class _Query:
    """Records the .eq() filters a chain accumulates and answers with fixed rows."""

    def __init__(self, name, rows, log):
        self.name = name
        self._rows = rows
        self._log = log
        self.filters = {}

    def select(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def in_(self, column, value):
        self.filters[column] = value
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def single(self):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        self._log.append((self.name, dict(self.filters)))
        result = MagicMock()
        result.data = self._rows
        return result


def _supabase(log):
    rows = {
        'quests': {
            'id': QUEST, 'title': 'Bridge Building', 'description': 'd', 'big_idea': 'b',
            'header_image_url': None, 'image_url': None, 'quest_type': 'optio',
            'transcript_subject': None, 'approach_examples': [], 'is_active': True,
            'metadata': {}, 'allow_custom_tasks': True, 'organization_id': None,
            'course_quests': [],
        },
        'user_quests': [],          # not enrolled -> the short path through the view
        'user_quest_tasks': [],
        'quest_task_completions': [],
        'sis_staff_training': [],
    }
    client = MagicMock()
    client.table.side_effect = lambda name: _Query(name, rows.get(name, []), log)
    return client


def _call(caller, student_id):
    """Invoke the undecorated view with ?student_id= and return (payload, status)."""
    log = []
    app = Flask(__name__)
    query = f'?student_id={student_id}' if student_id else ''
    with app.test_request_context(f'/api/quests/{QUEST}{query}'), \
            patch.object(detail, 'get_supabase_admin_client', return_value=_supabase(log)), \
            patch('routes.quest_types.get_template_tasks', return_value=[]), \
            patch('routes.quest_types.get_sample_tasks_for_quest', return_value=[]), \
            patch('routes.quest_types.get_course_tasks_for_quest', return_value=[]), \
            patch('services.interest_tracks_service.InterestTracksService.get_quest_moments',
                  return_value={'success': True, 'moments': []}):
        response = detail.get_quest_detail.__wrapped__(caller, QUEST)
    if isinstance(response, tuple):
        return response[0].get_json(), response[1], log
    return response.get_json(), 200, log


def test_delegated_read_scopes_every_per_user_query_to_the_child():
    with patch.object(detail, 'resolve_student_scope', return_value=KID), \
            patch.object(detail, 'guardian_capabilities', return_value={'student_id': KID}):
        payload, status, log = _call(PARENT, KID)

    assert status == 200
    user_scoped = [filters for table, filters in log if 'user_id' in filters]
    assert user_scoped, 'expected at least one per-user query'
    assert all(f['user_id'] == KID for f in user_scoped), user_scoped


def test_delegated_read_says_what_the_parent_may_do():
    caps = {
        'student_id': KID, 'student_name': 'Ada', 'is_dependent': False,
        'can_add_tasks': True, 'can_complete_tasks': False, 'can_remove_tasks': False,
    }
    with patch.object(detail, 'resolve_student_scope', return_value=KID), \
            patch.object(detail, 'guardian_capabilities', return_value=caps):
        payload, status, _ = _call(PARENT, KID)

    assert status == 200
    assert payload['quest']['viewer_context'] == caps


def test_a_refused_delegation_is_a_403_not_a_500():
    with patch.object(detail, 'resolve_student_scope',
                      side_effect=GuardianAccessError("You do not have access to this student's data")):
        payload, status, log = _call(PARENT, KID)

    assert status == 403
    assert payload['success'] is False
    # Nothing was read before the refusal.
    assert log == []


def test_a_normal_read_carries_no_viewer_context():
    """A student on their own quest gets exactly the payload they always got."""
    with patch.object(detail, 'resolve_student_scope', return_value=PARENT):
        payload, status, log = _call(PARENT, None)

    assert status == 200
    assert 'viewer_context' not in payload['quest']
    assert all(f.get('user_id', PARENT) == PARENT for _table, f in log)
