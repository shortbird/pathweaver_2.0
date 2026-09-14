"""Reordering a quest's preset tasks after the quest exists.

Tasks could be moved up and down while a quest was still a draft, and never
again once saved: "when you edit a quest, you can't move the tasks up and down.
You can only do that when you first create the quest" (iCreate, 2026-09-14,
c7d1f7a5). The order is order_index on quest_template_tasks, written here from
the full list, then pushed to enrolled students by the existing resync.
"""

import pytest

from repositories.quest_template_task_repository import QuestTemplateTaskRepository

QUEST = 'quest-1'


class _Recorder:
    def __init__(self, existing_ids):
        self.existing_ids = list(existing_ids)
        self.updates = []   # (task_id, order_index)

    def table(self, name):
        assert name == 'quest_template_tasks'
        return _Table(self)


class _Table:
    def __init__(self, rec):
        self._rec = rec
        self._op = None
        self._payload = None
        self._filters = {}
        self._ordered = False

    def select(self, *_a, **_k):
        self._op = 'select'
        return self

    def order(self, *_a, **_k):
        self._ordered = True
        return self

    def eq(self, column, value):
        self._filters[column] = value
        return self

    def update(self, payload):
        self._op, self._payload = 'update', payload
        return self

    def execute(self):
        class R:
            data = None
        r = R()
        if self._op == 'update':
            self._rec.updates.append((self._filters['id'], self._payload['order_index']))
            r.data = [{'id': self._filters['id']}]
            return r
        if self._ordered:
            # The read-back after writing: rows in their new order.
            by_id = dict(self._rec.updates)
            r.data = sorted(({'id': i, 'order_index': by_id.get(i, 0)} for i in self._rec.existing_ids),
                            key=lambda t: t['order_index'])
            return r
        r.data = [{'id': i} for i in self._rec.existing_ids]
        return r


@pytest.mark.unit
class TestReorderTemplateTasks:
    def test_writes_the_position_of_every_task_and_returns_them_in_order(self):
        rec = _Recorder(['a', 'b', 'c'])
        rows = QuestTemplateTaskRepository(client=rec).reorder(QUEST, ['c', 'a', 'b'])
        assert rec.updates == [('c', 0), ('a', 1), ('b', 2)]
        assert [t['id'] for t in rows] == ['c', 'a', 'b']

    def test_refuses_a_partial_list(self):
        """A single move is not accepted: two admins nudging different rows
        must not leave two tasks at one position."""
        rec = _Recorder(['a', 'b', 'c'])
        assert QuestTemplateTaskRepository(client=rec).reorder(QUEST, ['c', 'a']) is None
        assert rec.updates == []

    def test_refuses_an_id_from_another_quest(self):
        rec = _Recorder(['a', 'b'])
        assert QuestTemplateTaskRepository(client=rec).reorder(QUEST, ['a', 'zzz']) is None
        assert rec.updates == []

    def test_refuses_a_duplicate_that_pads_the_count(self):
        rec = _Recorder(['a', 'b', 'c'])
        assert QuestTemplateTaskRepository(client=rec).reorder(QUEST, ['a', 'a', 'b']) is None
        assert rec.updates == []
