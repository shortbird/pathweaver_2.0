"""
The XP a class quest takes to finish.

iCreate asked four times in the first week of September, and each time reached
for the XP box on a preset task -- which is that task's value, not a target for
the quest:

  2026-09-01  "I would like to have an option to add an XP minimum for each quest."
  2026-09-01  "I can update the required XP for this quest, but I can't save it."
  2026-09-01  "Oops, the XP was to add my own preset task. I was hoping to have a
               required amount of XP for the entire quest."
  2026-09-03  "There is no way to save the XP. It was originally 100, but I need
               to change it to 50."  (Nicole Connole)

Deliberately NOT a new mechanism: `quests.xp_threshold` already exists, the
staff-training page already writes it, and POST /api/quests/<id>/end already
refuses below it. What was missing was any way to set it from the class a
teacher actually works on.

The line that carries the risk: the number lives on the QUEST, so setting it on
an Optio-library quest would change the finish line for every school that uses
it. That is refused, and nothing is written when it is.
"""

from unittest.mock import Mock, patch

import pytest

from routes.sis import class_quests


ORG = '11111111-1111-4111-8111-111111111111'
OTHER_ORG = '11111111-1111-4111-8111-111111111112'
CLASS = '22222222-2222-4222-8222-222222222222'
QUEST = '33333333-3333-4333-8333-333333333333'
USER = '44444444-4444-4444-8444-444444444444'


class _FakeTable:
    def __init__(self, name, rows, log):
        self.name, self._rows, self._log = name, rows, log

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def update(self, payload):
        self._log.append(('update', self.name, payload))
        return self

    def execute(self):
        return Mock(data=self._rows)


def _client(tables, log):
    c = Mock()
    c.table.side_effect = lambda name: _FakeTable(name, tables.get(name, []), log)
    return c


def _run(body, quest_org=ORG, linked=True):
    log = []
    tables = {
        'class_quests': ([{'id': 'cq1', 'due_date': None, 'publish_at': None}]
                         if linked else []),
        'quests': [{'id': QUEST, 'organization_id': quest_org}],
    }
    client = _client(tables, log)
    class_row = {'id': CLASS, 'organization_id': ORG}
    with patch.object(class_quests, '_authorize', return_value=(class_row, client, None)), \
         patch.object(class_quests, 'request',
                      Mock(get_json=lambda silent=True: body, args={})):
        from flask import Flask
        app = Flask(__name__)
        with app.app_context():
            fn = class_quests.update_class_quest
            fn = getattr(fn, '__wrapped__', fn)
            resp = fn(USER, CLASS, QUEST)
    payload = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return payload, status, log


def _quest_writes(log):
    return [p for op, name, p in log if op == 'update' and name == 'quests']


@pytest.mark.unit
class TestSettingTheFinishLine:
    def test_a_number_is_written_to_the_quest(self):
        out, status, log = _run({'xp_threshold': 50})
        assert status == 200
        assert out['xp_threshold'] == 50
        assert _quest_writes(log) == [{'xp_threshold': 50}]

    def test_the_class_link_is_left_alone_when_only_xp_changes(self):
        _, status, log = _run({'xp_threshold': 50})
        assert status == 200
        assert [n for op, n, _ in log if op == 'update'] == ['quests']

    def test_zero_and_empty_both_clear_the_requirement(self):
        """The completion route reads `if xp_threshold and xp_threshold > 0`, so
        a stored 0 and a stored NULL behave alike -- but only NULL reads as
        'this quest never had one' everywhere else."""
        for raw in (0, '', None):
            _, status, log = _run({'xp_threshold': raw})
            assert status == 200, raw
            assert _quest_writes(log) == [{'xp_threshold': None}], raw

    def test_a_due_date_and_a_target_can_be_saved_in_one_call(self):
        _, status, log = _run({'due_date': '2026-09-30T23:59:59Z', 'xp_threshold': 300})
        assert status == 200
        assert ('update', 'class_quests', {'due_date': '2026-09-30T23:59:59Z'}) in log
        assert _quest_writes(log) == [{'xp_threshold': 300}]


@pytest.mark.unit
class TestWhatIsRefused:
    def test_a_library_quest_keeps_its_finish_line(self):
        """It belongs to every school, so one school's teacher cannot move it."""
        out, status, log = _run({'xp_threshold': 300}, quest_org=None)
        assert status == 403
        assert _quest_writes(log) == []

    def test_another_school_s_quest_is_refused_too(self):
        _, status, log = _run({'xp_threshold': 300}, quest_org=OTHER_ORG)
        assert status == 403
        assert _quest_writes(log) == []

    def test_words_are_not_a_number(self):
        out, status, log = _run({'xp_threshold': 'lots'})
        assert status == 400
        assert 'number' in out['error']
        assert log == []

    def test_a_negative_target_is_refused(self):
        _, status, log = _run({'xp_threshold': -50})
        assert status == 400
        assert log == []

    def test_an_empty_patch_still_says_so(self):
        _, status, log = _run({})
        assert status == 400
        assert log == []

    def test_a_quest_not_on_this_class_is_a_404(self):
        _, status, log = _run({'xp_threshold': 100}, linked=False)
        assert status == 404
        assert _quest_writes(log) == []
