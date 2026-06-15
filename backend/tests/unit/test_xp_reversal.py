"""
Unit tests for aggregate-XP reversal on quest deletion.

Guards the class of bug where deleting a quest wiped quest_task_completions
but left user_skill_xp / users.total_xp inflated (denormalized aggregates only
ever incremented on completion). See backend/utils/xp_reversal.py.
"""

import copy
import pytest

from utils.xp_reversal import reverse_quest_xp


# --- A tiny fake Supabase client (PostgREST-style chained builder) -----------

class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, store, table):
        self._store = store
        self._table = table
        self._eq = []
        self._in = None
        self._single = False
        self._update = None

    def select(self, _cols):
        return self

    def update(self, values):
        self._update = values
        return self

    def eq(self, col, val):
        self._eq.append((col, val))
        return self

    def in_(self, col, vals):
        self._in = (col, list(vals))
        return self

    def single(self):
        self._single = True
        return self

    def _matches(self, row):
        for col, val in self._eq:
            if row.get(col) != val:
                return False
        if self._in is not None:
            col, vals = self._in
            if row.get(col) not in vals:
                return False
        return True

    def execute(self):
        rows = self._store.setdefault(self._table, [])
        matched = [r for r in rows if self._matches(r)]
        if self._update is not None:
            for r in matched:
                r.update(self._update)
            return _Result(matched)
        if self._single:
            return _Result(matched[0] if matched else None)
        # Return copies so callers can't mutate the store via read results.
        return _Result([copy.deepcopy(r) for r in matched])


class _FakeClient:
    def __init__(self, store):
        self._store = store

    def table(self, name):
        return _Query(self._store, name)


def _seed():
    """Quest Q completed by user A (civics 50 + communication 100) and user B (civics 50)."""
    return {
        'quest_task_completions': [
            {'id': 'c1', 'quest_id': 'Q', 'user_id': 'A', 'user_quest_task_id': 't1'},
            {'id': 'c2', 'quest_id': 'Q', 'user_id': 'A', 'user_quest_task_id': 't2'},
            {'id': 'c3', 'quest_id': 'Q', 'user_id': 'B', 'user_quest_task_id': 't3'},
            {'id': 'c4', 'quest_id': 'OTHER', 'user_id': 'A', 'user_quest_task_id': 't9'},
        ],
        'user_quest_tasks': [
            {'id': 't1', 'pillar': 'civics', 'xp_value': 50},
            {'id': 't2', 'pillar': 'communication', 'xp_value': 100},
            {'id': 't3', 'pillar': 'civics', 'xp_value': 50},
            {'id': 't9', 'pillar': 'civics', 'xp_value': 999},  # different quest, must be ignored
        ],
        'user_skill_xp': [
            {'id': 's1', 'user_id': 'A', 'pillar': 'civics', 'xp_amount': 200},
            {'id': 's2', 'user_id': 'A', 'pillar': 'communication', 'xp_amount': 300},
            {'id': 's3', 'user_id': 'B', 'pillar': 'civics', 'xp_amount': 50},
        ],
        'users': [
            {'id': 'A', 'total_xp': 500},
            {'id': 'B', 'total_xp': 50},
        ],
    }


def _skill(store, user_id, pillar):
    return next(r['xp_amount'] for r in store['user_skill_xp']
               if r['user_id'] == user_id and r['pillar'] == pillar)


def _total(store, user_id):
    return next(r['total_xp'] for r in store['users'] if r['id'] == user_id)


def test_reverses_skill_and_total_xp_per_user_and_pillar():
    store = _seed()
    reversed_total = reverse_quest_xp(_FakeClient(store), 'Q')

    # Per-pillar decrements
    assert _skill(store, 'A', 'civics') == 150          # 200 - 50
    assert _skill(store, 'A', 'communication') == 200   # 300 - 100
    assert _skill(store, 'B', 'civics') == 0            # 50 - 50

    # Total decrements (sum of that user's reversed task XP)
    assert _total(store, 'A') == 350   # 500 - (50 + 100)
    assert _total(store, 'B') == 0     # 50 - 50

    # Only quest Q reversed, not the OTHER quest's 999-XP task
    assert reversed_total == 200


def test_clamps_at_zero_when_aggregate_already_low():
    store = _seed()
    # B only has 50 civics but pretend the aggregate drifted below the award
    store['user_skill_xp'][2]['xp_amount'] = 10
    store['users'][1]['total_xp'] = 10
    reverse_quest_xp(_FakeClient(store), 'Q')
    assert _skill(store, 'B', 'civics') == 0
    assert _total(store, 'B') == 0


def test_no_completions_is_noop():
    store = _seed()
    before = copy.deepcopy(store)
    assert reverse_quest_xp(_FakeClient(store), 'QUEST_WITH_NO_COMPLETIONS') == 0
    assert store['user_skill_xp'] == before['user_skill_xp']
    assert store['users'] == before['users']


def test_completion_with_missing_task_is_skipped():
    store = _seed()
    # Drop t2's task row -> its completion can't resolve XP and must be skipped, not crash
    store['user_quest_tasks'] = [t for t in store['user_quest_tasks'] if t['id'] != 't2']
    reverse_quest_xp(_FakeClient(store), 'Q')
    # civics still reversed for A; communication untouched because task is gone
    assert _skill(store, 'A', 'civics') == 150
    assert _skill(store, 'A', 'communication') == 300
    assert _total(store, 'A') == 450  # 500 - 50 (only the resolvable civics task)


def test_validate_xp_clamps_to_halved_scale():
    """The AI XP validator must clamp to the halved [25, 150] scale."""
    mod = pytest.importorskip("services.quest_ai_service")
    # _validate_xp uses no instance state; bypass __init__ (which builds the Gemini client).
    svc = mod.QuestAIService.__new__(mod.QuestAIService)
    assert svc._validate_xp(500) == 150   # clamped down
    assert svc._validate_xp(10) == 25     # clamped up
    assert svc._validate_xp(75) == 75     # in range
    assert svc._validate_xp("garbage") == 50  # default on junk
    assert svc._validate_xp(None) == 50       # default on falsy
