"""The family dashboard names the class that set each of a child's quests.

Ticket 55ef3acf (Marika Connole, iCreate, 2026-09-14): "can we get any class
associated quests to show up with the class? For example, Language Studio B
has a vocab quest that we have no idea how to find as a parent." Assigning a
quest to a class enrolls its students, so the quest was on the child's list
all along -- indistinguishable from one the child picked. The parent
dashboard's active_quests now carry `class_assignment`, the same
{class_id, class_name, due_date} the student's own dashboard attaches.
"""

from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from routes.parent import dashboard_overview


PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
CHILD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
VOCAB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
OWN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'


def _client():
    """Admin client stub: every chained call returns the same table mock;
    execute() answers by table name (a queue per table, so the route's second
    user_quests read -- recent completions -- gets an empty page rather than
    the active rows again)."""
    responses = {
        'users': [[{'id': CHILD, 'first_name': 'Wynter', 'last_name': 'C',
                    'avatar_url': None, 'level': 1, 'total_xp': 10, 'streak_days': 0}]],
        'user_quests': [[
            {'quest_id': VOCAB, 'started_at': '2026-09-10T23:10:05+00:00', 'is_active': True,
             'quests': {'id': VOCAB, 'title': 'Building Words with Prefixes and Roots'}},
            {'quest_id': OWN, 'started_at': '2026-09-01T00:00:00+00:00', 'is_active': True,
             'quests': {'id': OWN, 'title': 'Backyard Birds'}},
        ]],
    }
    client = MagicMock()

    def table(name):
        t = MagicMock()
        for chained in ('select', 'eq', 'is_', 'in_', 'gte', 'order', 'limit'):
            getattr(t, chained).return_value = t
        t.not_ = t   # `.not_.is_(...)` is an attribute hop, not a call
        queue = responses.get(name) or []
        result = MagicMock()
        result.data = queue.pop(0) if queue else []
        result.count = 0
        t.execute.return_value = result
        return t
    client.table.side_effect = table
    rpc = MagicMock()
    rpc.execute.return_value = MagicMock(data=[])
    client.rpc.return_value = rpc
    return client


def _run():
    view = dashboard_overview.get_parent_dashboard
    while hasattr(view, '__wrapped__'):   # past require_auth + require_relationship_to
        view = view.__wrapped__
    app = Flask(__name__)
    with app.test_request_context(f'/api/parent/dashboard/{CHILD}'):
        with patch.object(dashboard_overview, 'get_supabase_admin_client', return_value=_client()), \
             patch.object(dashboard_overview, 'quest_rhythm', return_value=None), \
             patch.object(dashboard_overview, 'student_class_assignments', return_value={
                 VOCAB: {'class_id': 'cls-1', 'class_name': 'Language Studio B',
                         'due_date': '2026-09-29T05:59:59+00:00'},
             }) as assignments:
            resp = view(PARENT, CHILD)
    body = resp.get_json() if hasattr(resp, 'get_json') else resp[0].get_json()
    return body, assignments


@pytest.mark.unit
def test_a_class_quest_names_its_class():
    body, assignments = _run()
    by_id = {q['quest_id']: q for q in body['active_quests']}
    assert by_id[VOCAB]['class_assignment'] == {
        'class_id': 'cls-1', 'class_name': 'Language Studio B',
        'due_date': '2026-09-29T05:59:59+00:00',
    }
    assignments.assert_called_once()
    assert assignments.call_args[0][1] == CHILD


@pytest.mark.unit
def test_a_quest_the_child_picked_carries_no_class():
    body, _ = _run()
    by_id = {q['quest_id']: q for q in body['active_quests']}
    assert by_id[OWN]['class_assignment'] is None
