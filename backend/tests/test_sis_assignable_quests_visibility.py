"""
The SIS assign doors respect the school's quest visibility policy.

organizations.quest_visibility_policy decides how much of the shared Optio
library a school may use: all of it (all_optio), only what was granted
(curated, organization_quest_access), or none of it (private_only). The web org
console's picker (/api/organizations/<id>/available-quests) honoured it; the
SIS class page's picker (GET /api/sis/classes/<id>/assignable-quests) and its
assign write did not, so a private_only school could put any public Optio
quest in front of its students from the SIS (found 2026-10-15). Both now ask
services/org_quest_visibility.py, as the console picker does.
"""

from unittest.mock import Mock, patch

import pytest
from flask import Flask

import routes.sis.class_quests as class_quests

ORG = '11111111-1111-4111-8111-111111111111'
CLASS = '66666666-6666-4666-8666-666666666666'
TEACHER = '77777777-7777-4777-8777-777777777777'
OWN = '33333333-3333-4333-8333-333333333331'
LIB_GRANTED = '33333333-3333-4333-8333-333333333332'
LIB_OTHER = '33333333-3333-4333-8333-333333333333'

QUESTS = [
    {'id': OWN, 'title': 'Our Garden', 'organization_id': ORG, 'is_active': True,
     'is_public': False, 'created_by': TEACHER},
    {'id': LIB_GRANTED, 'title': 'Garden Science', 'organization_id': None, 'is_active': True,
     'is_public': True, 'created_by': None},
    {'id': LIB_OTHER, 'title': 'Garden Poetry', 'organization_id': None, 'is_active': True,
     'is_public': True, 'created_by': None},
]


class _Query:
    """A table that applies eq / is_ / in_ so the filters the route adds count."""

    def __init__(self, name, rows):
        self.name = name
        self._rows = list(rows)

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._rows = [r for r in self._rows if r.get(col) == val]
        return self

    def is_(self, col, val):
        assert val == 'null'
        self._rows = [r for r in self._rows if r.get(col) is None]
        return self

    def in_(self, col, vals):
        vals = set(vals)
        self._rows = [r for r in self._rows if r.get(col) in vals]
        return self

    def __getattr__(self, _name):  # ilike / order / limit / range: no-ops here
        return lambda *a, **k: self

    def insert(self, payload):
        self._rows = payload if isinstance(payload, list) else [payload]
        return self

    def execute(self):
        return Mock(data=list(self._rows), count=len(self._rows))


def _client(policy, grants=()):
    tables = {
        'quests': QUESTS,
        'class_quests': [],
        'quest_template_tasks': [],
        'organizations': [{'id': ORG, 'quest_visibility_policy': policy}],
        'organization_quest_access': [{'id': f'a{i}', 'organization_id': ORG, 'quest_id': q}
                                      for i, q in enumerate(grants)],
    }
    c = Mock()
    c.table.side_effect = lambda name: _Query(name, tables.get(name, []))
    return c


def _unwrap(fn):
    while hasattr(fn, '__wrapped__'):
        fn = fn.__wrapped__
    return fn


def _call(route, admin, *, args=None, body=None):
    class_row = {'id': CLASS, 'organization_id': ORG}
    req = Mock(args=args or {}, get_json=lambda silent=True: body or {})
    with patch.object(class_quests, '_authorize', return_value=(class_row, admin, None)), \
         patch.object(class_quests, '_curriculum_quest_ids', return_value=set()), \
         patch.object(class_quests, 'request', req), \
         patch('repositories.org_quest_visibility_repository.fetch_all_rows',
               side_effect=lambda build, **_k: build().execute().data):
        app = Flask(__name__)
        with app.app_context():
            resp = _unwrap(route)(TEACHER, CLASS)
    out = resp[0] if isinstance(resp, tuple) else resp
    status = resp[1] if isinstance(resp, tuple) else 200
    return out.get_json(), status


def _picked(policy, grants=()):
    body, status = _call(class_quests.assignable_quests, _client(policy, grants),
                         args={'search': 'Garden'})
    assert status == 200
    return {q['quest_id'] for q in body['quests']}


def test_all_optio_offers_the_whole_library():
    assert _picked('all_optio') == {OWN, LIB_GRANTED, LIB_OTHER}


def test_private_only_offers_no_optio_quest():
    assert _picked('private_only') == {OWN}


def test_curated_offers_only_the_granted_optio_quests():
    assert _picked('curated', grants=[LIB_GRANTED]) == {OWN, LIB_GRANTED}


def test_curated_with_nothing_granted_offers_the_school_only():
    assert _picked('curated') == {OWN}


@pytest.mark.parametrize('policy, grants, quest_id, allowed', [
    ('private_only', (), LIB_OTHER, False),
    ('curated', (LIB_GRANTED,), LIB_OTHER, False),
    ('curated', (LIB_GRANTED,), LIB_GRANTED, True),
    ('all_optio', (), LIB_OTHER, True),
    ('private_only', (), OWN, True),
])
def test_assign_refuses_a_quest_the_policy_keeps_out(policy, grants, quest_id, allowed):
    """A stale id or a hand-made request cannot get past the picker's rule."""
    with patch.object(class_quests, '_assignment_fields',
                      return_value=(None, (Mock(get_json=lambda: {'stop': True}), 418))):
        body, status = _call(class_quests.assign_quest, _client(policy, grants),
                             body={'quest_id': quest_id})
    # Allowed quests go on to the assignment fields (stubbed to stop at 418);
    # refused ones never get that far.
    assert status == (418 if allowed else 404)
