"""GET /api/family/quests: the family's quests, with who is on each.

The family dashboard's quest section (2026-09-15). A quest is the family's
when the parent set it up (created_by) or is enrolled in it themselves;
every family member with an enrollment is listed as a member with their own
progress. A child's own quests are not here -- they are the child's
dashboard.
"""

from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from routes import family_quests


PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
ROMNEY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
SIBLING = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
NZ = 'ffffffff-ffff-4fff-8fff-ffffffffffff'      # Paige's own quest
TRIP = '11111111-1111-4111-8111-111111111111'    # set up for the kids
KIDS_OWN = '22222222-2222-4222-8222-222222222222'  # Romney's own pick
CATALOG = '33333333-3333-4333-8333-333333333333'  # authored by the parent, nobody in the family on it


def _innermost(view):
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    return view


class _Query:
    def __init__(self, table, answers):
        self._table, self._answers = table, answers
        self.filters = {}

    def __getattr__(self, name):
        def chain(*args, **kwargs):
            if name in ('eq', 'in_', 'is_') and len(args) == 2:
                self.filters[args[0]] = args[1]
            return self
        return chain

    def execute(self):
        result = MagicMock()
        answer = self._answers.get(self._table, [])
        result.data = answer(self.filters) if callable(answer) else answer
        return result


def _client(answers):
    client = MagicMock()
    client.table.side_effect = lambda name: _Query(name, answers)
    return client


@pytest.fixture
def app():
    return Flask(__name__)


def _answers():
    def user_quests(filters):
        if filters.get('user_id') == PARENT:
            # Paige's own enrollments, with the quest joined.
            return [{'quest_id': NZ, 'quests': {
                'id': NZ, 'title': 'New Zealand 101', 'created_by': PARENT,
                'created_at': '2026-02-20T00:00:00+00:00'}}]
        # The family x quest matrix.
        return [
            {'id': 'uq-nz-p', 'user_id': PARENT, 'quest_id': NZ, 'started_at': '2026-02-20T00:00:00+00:00', 'completed_at': None},
            {'id': 'uq-trip-r', 'user_id': ROMNEY, 'quest_id': TRIP, 'started_at': '2026-09-01T00:00:00+00:00', 'completed_at': None},
            {'id': 'uq-trip-s', 'user_id': SIBLING, 'quest_id': TRIP, 'started_at': '2026-09-02T00:00:00+00:00', 'completed_at': None},
            {'id': 'uq-own-r', 'user_id': ROMNEY, 'quest_id': KIDS_OWN, 'started_at': '2026-09-03T00:00:00+00:00', 'completed_at': None},
        ]

    def quests(filters):
        rows = [
            {'id': NZ, 'title': 'New Zealand 101', 'created_by': PARENT, 'is_public': False, 'created_at': '2026-02-20T00:00:00+00:00'},
            {'id': TRIP, 'title': 'Pack for the trip', 'created_by': PARENT, 'is_public': False, 'created_at': '2026-09-01T00:00:00+00:00'},
            # A superadmin who is also a parent authored this one for the
            # catalog. Nobody in the family is on it.
            {'id': CATALOG, 'title': 'Explore the music industry', 'created_by': PARENT, 'is_public': False, 'created_at': '2026-01-01T00:00:00+00:00'},
            # ... and this one, which Romney picked himself.
            {'id': KIDS_OWN, 'title': 'Learn to play the guitar', 'created_by': PARENT, 'is_public': True, 'created_at': '2026-01-01T00:00:00+00:00'},
        ]
        return [r for r in rows if r['created_by'] == filters.get('created_by') and r['is_public'] == filters.get('is_public', r['is_public'])]

    return {
        'quests': quests,
        'user_quests': user_quests,
        'user_quest_tasks': [
            {'id': 't1', 'user_quest_id': 'uq-trip-r'},
            {'id': 't2', 'user_quest_id': 'uq-trip-r'},
            {'id': 't3', 'user_quest_id': 'uq-trip-s'},
        ],
        'quest_task_completions': [
            {'user_id': ROMNEY, 'quest_id': TRIP, 'user_quest_task_id': 't1'},
            # A completion on a quest that is not the family's must not leak in.
            {'user_id': ROMNEY, 'quest_id': KIDS_OWN, 'user_quest_task_id': 'zz'},
        ],
        'users': [
            {'id': PARENT, 'first_name': 'Paige', 'avatar_url': None},
            {'id': ROMNEY, 'first_name': 'Romney', 'avatar_url': None},
            {'id': SIBLING, 'first_name': 'Sib', 'avatar_url': None},
        ],
    }


def _call(app, answers, children):
    with app.test_request_context('/api/family/quests'), \
            patch.object(family_quests, 'verify_parent_role'), \
            patch.object(family_quests, 'get_supabase_admin_client', return_value=_client(answers)), \
            patch('utils.class_membership.children_of_parent', return_value=set(children)):
        response = _innermost(family_quests.list_family_quests)(PARENT)
    return response.get_json()


def test_lists_the_parents_own_quest_and_the_ones_set_up_for_the_children(app):
    body = _call(app, _answers(), [ROMNEY, SIBLING])
    assert body['success'] is True
    by_id = {q['id']: q for q in body['quests']}
    assert set(by_id) == {NZ, TRIP}
    assert KIDS_OWN not in by_id

    nz = by_id[NZ]
    assert nz['is_family_quest'] is True
    assert [m['first_name'] for m in nz['members']] == ['Paige']
    assert nz['members'][0]['is_self'] is True

    trip = by_id[TRIP]
    assert [m['first_name'] for m in trip['members']] == ['Romney', 'Sib']
    assert all(m['is_self'] is False for m in trip['members'])


def test_each_member_carries_their_own_progress(app):
    body = _call(app, _answers(), [ROMNEY, SIBLING])
    trip = next(q for q in body['quests'] if q['id'] == TRIP)
    romney, sib = trip['members']
    assert romney['progress'] == {'completed_tasks': 1, 'total_tasks': 2, 'percentage': 50}
    assert sib['progress'] == {'completed_tasks': 0, 'total_tasks': 1, 'percentage': 0}


def test_most_recently_started_quest_comes_first(app):
    body = _call(app, _answers(), [ROMNEY, SIBLING])
    assert [q['id'] for q in body['quests']] == [TRIP, NZ]


def test_a_quest_the_parent_authored_that_nobody_in_the_family_is_on_stays_out(app):
    # Tanner, 2026-09-14: a superadmin's family dashboard listed every quest
    # he had ever authored -- the catalog, class quests, training quests.
    body = _call(app, _answers(), [ROMNEY, SIBLING])
    assert CATALOG not in {q['id'] for q in body['quests']}


def test_a_public_quest_the_parent_authored_is_the_catalogs_even_if_a_child_picked_it(app):
    body = _call(app, _answers(), [ROMNEY, SIBLING])
    assert KIDS_OWN not in {q['id'] for q in body['quests']}


def test_a_parent_with_no_quests_gets_an_empty_list(app):
    answers = _answers()
    answers['quests'] = []
    answers['user_quests'] = []
    body = _call(app, answers, [ROMNEY])
    assert body == {'success': True, 'quests': []}


def test_each_member_carries_their_rhythm_on_the_quest(app):
    # The family dashboard shows a member's rhythm instead of a progress bar.
    with patch('routes.parent.engagement.quest_rhythm', return_value={'state': 'in_flow', 'state_display': 'In Flow', 'last_7_days': []}):
        body = _call(app, _answers(), [ROMNEY, SIBLING])
    trip = next(q for q in body['quests'] if q['id'] == TRIP)
    assert trip['members'][0]['rhythm']['state'] == 'in_flow'
