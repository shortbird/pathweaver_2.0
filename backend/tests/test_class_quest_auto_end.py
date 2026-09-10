"""A class quest ends itself; a quest the student picked does not.

Gryffin student check-ins, 2026-09-10 (Dallin Bird): "Tarien still has a quest
in class quests that is already done for reading." Both tasks were turned in and
the enrollment was still open, so the quest sat on his home page looking undone.

The rule splits on where the quest came from, and both halves carry risk:

  - Assigned work that is finished must close, or this bug comes back.
  - A quest the student chose must NEVER close on its own. Finishing the last
    task is not the end of a self-directed quest; the student keeps adding to it
    for as long as they want to. Auto-closing one would take that away silently,
    and the student would have no idea why their quest vanished from the
    dashboard.

The done-ness test is the shared one in utils/quest_completion, so a quest that
auto-ends and a teacher's progress grid can never disagree about what "done"
means.
"""

from unittest.mock import Mock, patch

import pytest

from services.class_quest_completion import end_if_class_quest_complete


STUDENT = '11111111-1111-4111-8111-111111111111'
QUEST = '33333333-3333-4333-8333-333333333331'
CLASS = '44444444-4444-4444-8444-444444444444'
UQ = '55555555-5555-4555-8555-555555555551'


class _Table:
    """A fake PostgREST table that records writes and answers reads by name."""

    def __init__(self, name, tables, log):
        self.name, self._tables, self._log = name, tables, log
        self._rows = tables.get(name, [])
        self._pending = None
        self._null_fields = []

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def is_(self, field, value):
        # Modelled, not stubbed. The production read asks PostgREST for open
        # enrollments only (completed_at IS NULL, archived_at IS NULL). A fake
        # that ignored that would hand back closed rows the real database never
        # returns, and the "never acts twice" tests would pass on a lie.
        if value == 'null':
            self._null_fields.append(field)
        return self

    def limit(self, *_a, **_k):
        return self

    def or_(self, *_a, **_k):
        return self

    def update(self, payload):
        self._log.append(('update', self.name, payload))
        # The write is gated on completed_at IS NULL. Model that: a row that is
        # already closed reports no rows updated, which is how the optimistic
        # lock tells a second caller it lost the race.
        already = any(r.get('completed_at') for r in self._tables.get('user_quests', []))
        self._pending = [] if already else [{'id': UQ}]
        return self

    def execute(self):
        if self._pending is not None:
            return Mock(data=self._pending)
        rows = [r for r in self._rows
                if all(r.get(f) is None for f in self._null_fields)]
        return Mock(data=rows)


def _client(tables, log):
    c = Mock()
    c.table.side_effect = lambda name: _Table(name, tables, log)
    return c


def _tables(**over):
    """A finished, class-assigned enrollment, unless a test says otherwise."""
    base = {
        'user_quests': [{'id': UQ, 'completed_at': None, 'archived_at': None}],
        'user_quest_tasks': [{'id': 't1', 'user_quest_id': UQ},
                             {'id': 't2', 'user_quest_id': UQ}],
        'quest_task_completions': [{'task_id': 't1'}, {'task_id': 't2'}],
        'class_enrollments': [{'class_id': CLASS}],
        'org_classes': [{'id': CLASS}],
        'class_quests': [{'quest_id': QUEST}],
        'users': [{'organization_id': None}],
        'quests': [{'title': 'Dickenson at first sight'}],
    }
    base.update(over)
    return base


def _run(tables):
    log = []
    # The completion events are the student's own "End quest" side effects. They
    # are covered where they are defined; here they would only add mocks.
    with patch('services.class_quest_completion._emit_completion_events'):
        ended = end_if_class_quest_complete(_client(tables, log), STUDENT, QUEST)
    return ended, log


def _updates(log):
    return [payload for op, table, payload in log
            if op == 'update' and table == 'user_quests']


class TestAssignedWorkCloses:

    def test_finished_class_quest_ends(self):
        ended, log = _run(_tables())
        assert ended is True
        written = _updates(log)[0]
        assert written['is_active'] is False
        assert written['completed_at']

    def test_it_sets_the_same_columns_the_end_button_sets(self):
        """An auto-ended quest has to be indistinguishable from a hand-ended one.

        Every surface that asks "is this finished" reads completed_at, and the
        pick-up/set-down history reads last_set_down_at. A row missing either
        would be finished on one screen and open on another.
        """
        _, log = _run(_tables())
        written = _updates(log)[0]
        assert set(written) == {'completed_at', 'is_active', 'last_set_down_at'}

    def test_an_unfinished_class_quest_stays_open(self):
        ended, log = _run(_tables(quest_task_completions=[{'task_id': 't1'}]))
        assert ended is False
        assert _updates(log) == []

    def test_a_quest_with_no_tasks_stays_open(self):
        """Nothing was assigned, so nothing was turned in.

        Zero of zero is not "done" — is_quest_done says the same. Closing an
        empty quest would end work the teacher has not finished setting up.
        """
        ended, log = _run(_tables(user_quest_tasks=[], quest_task_completions=[]))
        assert ended is False
        assert _updates(log) == []


class TestSelfDirectedWorkIsLeftAlone:

    def test_a_quest_the_student_picked_never_auto_ends(self):
        """The whole point of the split. This is the assertion that protects
        "The Process Is The Goal" from the fix above."""
        ended, log = _run(_tables(class_quests=[]))
        assert ended is False
        assert _updates(log) == []

    def test_a_student_in_no_classes_never_auto_ends(self):
        ended, log = _run(_tables(class_enrollments=[]))
        assert ended is False
        assert _updates(log) == []

    def test_an_archived_class_is_not_an_assignment(self):
        """A class the school archived at the end of a term stops assigning.

        Otherwise last spring's quest closes itself the moment the student
        touches it again this fall.
        """
        ended, log = _run(_tables(org_classes=[]))
        assert ended is False
        assert _updates(log) == []


class TestItNeverActsTwice:

    def test_an_already_finished_enrollment_is_left_alone(self):
        ended, log = _run(_tables(
            user_quests=[{'id': UQ, 'completed_at': '2026-09-01T00:00:00+00:00',
                          'archived_at': None}]))
        assert ended is False
        assert _updates(log) == []

    def test_an_archived_enrollment_is_left_alone(self):
        """Archived is the student saying "not now". Ending it would overrule
        them and drop it out of their Saved for Later list."""
        ended, log = _run(_tables(
            user_quests=[{'id': UQ, 'completed_at': None,
                          'archived_at': '2026-09-01T00:00:00+00:00'}]))
        assert ended is False
        assert _updates(log) == []

    def test_a_student_with_no_enrollment_is_a_no_op(self):
        ended, log = _run(_tables(user_quests=[]))
        assert ended is False
        assert _updates(log) == []


class TestDuplicateEnrollments:
    """`user_quests` has no unique index on (user_id, quest_id).

    Duplicates are real in production. Reading one row and closing it would
    leave the twin open, and the twin is what the home page renders — the
    student would watch the quest refuse to go away.
    """

    def test_every_finished_duplicate_is_closed(self):
        ended, log = _run(_tables(
            user_quests=[{'id': UQ, 'completed_at': None, 'archived_at': None},
                         {'id': 'uq-twin', 'completed_at': None, 'archived_at': None}],
            user_quest_tasks=[{'id': 't1', 'user_quest_id': UQ},
                              {'id': 't2', 'user_quest_id': 'uq-twin'}],
            quest_task_completions=[{'task_id': 't1'}, {'task_id': 't2'}]))
        assert ended is True
        assert len(_updates(log)) == 2

    def test_an_unfinished_twin_is_left_open(self):
        """Closing it would end work the student has not turned in."""
        ended, log = _run(_tables(
            user_quests=[{'id': UQ, 'completed_at': None, 'archived_at': None},
                         {'id': 'uq-twin', 'completed_at': None, 'archived_at': None}],
            user_quest_tasks=[{'id': 't1', 'user_quest_id': UQ},
                              {'id': 't2', 'user_quest_id': 'uq-twin'}],
            quest_task_completions=[{'task_id': 't1'}]))
        assert ended is True
        assert len(_updates(log)) == 1


class TestItNeverCostsTheTaskCompletion:

    def test_a_database_failure_returns_false_rather_than_raising(self):
        """The student's task is already saved and their XP already awarded by
        the time this runs. Raising here would report that work as failed."""
        broken = Mock()
        broken.table.side_effect = RuntimeError('connection reset')
        assert end_if_class_quest_complete(broken, STUDENT, QUEST) is False


@pytest.mark.parametrize('field', ['completed_at', 'is_active'])
def test_the_write_is_gated_on_completed_at_being_null(field):
    """Two tasks finished in the same breath must end the quest once.

    Without the optimistic lock both calls would write completed_at and both
    would fire a quest.completed webhook, which is a duplicate grade post to
    Canvas.
    """
    _, log = _run(_tables())
    assert field in _updates(log)[0]
