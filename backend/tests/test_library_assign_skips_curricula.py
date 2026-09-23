"""
Assigning a quest from the library puts it on one class, not on a curriculum.

iCreate, 56dbc3ab, 2026-09-23: "when I assign this quest (us history) to the
class: independent study it also adds it to the applied physics curriculum."
The library's Assign dialog posts to the class endpoint, and that endpoint
added every quest to each curriculum linked to the class
(_attach_quest_to_class_curricula) -- right for a teacher adding a quest from
the class page (iCreate, 2026-08-31), wrong for an admin assigning one class
from the library. Decision (Tanner): the library sends
attach_to_curricula=false; the class page sends nothing and keeps attaching.
"""

from unittest.mock import Mock, patch

import pytest

from routes.sis import class_quests


ORG = '11111111-1111-4111-8111-111111111111'
CLASS = '22222222-2222-4222-8222-222222222222'
QUEST = '33333333-3333-4333-8333-333333333333'
USER = '44444444-4444-4444-8444-444444444444'
CURR = '55555555-5555-4555-8555-555555555555'


class _FakeTable:
    def __init__(self, name, rows, log):
        self.name, self._rows, self._log = name, rows, log

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def upsert(self, payload, **_k):
        self._log.append(('upsert', self.name, payload))
        return self

    def execute(self):
        return Mock(data=self._rows)


def _client(log):
    tables = {
        'quests': [{'id': QUEST, 'organization_id': ORG, 'is_public': False, 'is_active': True}],
        'class_quests': [],
        'sis_curriculum_quests': [],
    }
    c = Mock()
    c.table.side_effect = lambda name: _FakeTable(name, tables.get(name, []), log)
    return c


def _assign(body):
    log = []
    admin = _client(log)
    class_row = {'id': CLASS, 'organization_id': ORG}
    with patch.object(class_quests, 'request',
                      Mock(get_json=lambda silent=True: body, args={})), \
         patch.object(class_quests, '_authorize', return_value=(class_row, admin, None)), \
         patch.object(class_quests, '_linked_curricula',
                      return_value=[{'id': CURR, 'title': 'Applied Physics'}]), \
         patch.object(class_quests, 'enroll_safe', return_value={'enrolled': 0}):
        from flask import Flask
        with Flask(__name__).app_context():
            fn = getattr(class_quests.assign_quest, '__wrapped__', class_quests.assign_quest)
            resp = fn(USER, CLASS)
    status = resp[1] if isinstance(resp, tuple) else 200
    return status, log


def _curriculum_writes(log):
    return [e for e in log if e[1] == 'sis_curriculum_quests']


@pytest.mark.unit
class TestLibraryAssignLeavesCurriculaAlone:
    def test_library_assign_does_not_touch_the_curriculum(self):
        """56dbc3ab: "it also adds it to the applied physics curriculum"."""
        status, log = _assign({'quest_id': QUEST, 'attach_to_curricula': False})
        assert status == 200
        assert _curriculum_writes(log) == []
        # The class itself still gets the quest.
        assert any(e[:2] == ('upsert', 'class_quests') for e in log)

    def test_class_page_assign_still_attaches_by_default(self):
        """The class page sends no flag: its quests keep landing on the curriculum."""
        status, log = _assign({'quest_id': QUEST})
        assert status == 200
        writes = _curriculum_writes(log)
        assert len(writes) == 1
        assert writes[0][2]['curriculum_id'] == CURR
        assert writes[0][2]['quest_id'] == QUEST

    def test_an_explicit_true_attaches(self):
        status, log = _assign({'quest_id': QUEST, 'attach_to_curricula': True})
        assert status == 200
        assert len(_curriculum_writes(log)) == 1
