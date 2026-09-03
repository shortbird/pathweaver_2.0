"""
Assigning a quest to a class enrolls its students in it.

iCreate/Horizon, 2026-09-02: "quests assigned through classes should appear in
student accounts just like other quests do, no difference." They didn't, because
assignment (class_quests) and enrollment (user_quests) are different rows, and
everything a student's account is built from reads the second one. Rory England
had a Science quest due the next day that existed on the class page and in a
dashboard tray and nowhere a student looks for a quest.

Two rules carry the risk here and are asserted directly:

  - An enrollment that already exists is NEVER touched, in any state. Re-running
    over a student who finished the quest would reopen it and re-copy its
    template tasks next to the ones they already completed. This is what makes
    the call safe to fire on every assignment and to backfill with.
  - The enrollment written must match what pressing "start" writes, tasks and
    personalization included. A second, thinner kind of enrollment for the rest
    of the app to special-case is the bug, not the fix.
"""

from unittest.mock import Mock, patch

from services.class_quest_enrollment import (
    class_quest_ids,
    enroll_class_in_quests,
    enroll_safe,
    enroll_student_in_class_quests,
    enroll_students_in_quests,
)


CLASS = '44444444-4444-4444-8444-444444444444'
Q1 = '33333333-3333-4333-8333-333333333331'
Q2 = '33333333-3333-4333-8333-333333333332'
S1 = '11111111-1111-4111-8111-111111111111'
S2 = '11111111-1111-4111-8111-111111111112'

TEMPLATE = {'id': 'tpl-1', 'title': 'Read chapter 1', 'description': 'the first one',
            'pillar': 'stem', 'xp_value': 150, 'order_index': 0, 'is_required': True}


class _Table:
    def __init__(self, name, rows, log, counter):
        self.name, self._rows, self._log, self._counter = name, rows, log, counter

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def or_(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def insert(self, payload):
        self._log.append(('insert', self.name, payload))
        # user_quests inserts are read back for their ids, so hand back rows
        # shaped like the real ones.
        out = []
        for row in payload:
            self._counter[0] += 1
            out.append({**row, 'id': f'uq-{self._counter[0]}'})
        self._pending = out
        return self

    def update(self, payload):
        self._log.append(('update', self.name, payload))
        self._pending = []
        return self

    def execute(self):
        return Mock(data=getattr(self, '_pending', self._rows))


def _client(tables, log):
    c, counter = Mock(), [0]
    c.table.side_effect = lambda name: _Table(name, tables.get(name, []), log, counter)
    return c


def _written(log, table, op='insert'):
    return [e[2] for e in log if e[0] == op and e[1] == table]


def _tables(**over):
    base = {
        'class_enrollments': [{'student_id': S1}, {'student_id': S2}],
        'quests': [{'id': Q1, 'is_active': True, 'title': 'Anatomy'}],
        'user_quests': [],          # nobody enrolled yet
        'class_quests': [{'quest_id': Q1, 'publish_at': None}],
    }
    base.update(over)
    return base


def _run(fn, tables, templates=(TEMPLATE,), log=None):
    log = log if log is not None else []
    with patch('routes.quest_types.get_template_tasks', return_value=list(templates)), \
         patch('utils.template_tasks.get_valid_source_template_ids',
               return_value={t['id'] for t in templates}):
        result = fn(_client(tables, log))
    return result, log


class TestAssigningEnrollsTheClass:

    def test_every_active_student_is_enrolled(self):
        result, log = _run(
            lambda c: enroll_class_in_quests(c, CLASS, [Q1]), _tables())
        rows = _written(log, 'user_quests')[0]
        assert {r['user_id'] for r in rows} == {S1, S2}
        assert all(r['quest_id'] == Q1 and r['is_active'] for r in rows)
        assert result['enrolled'] == 2

    def test_each_student_gets_their_own_copy_of_the_template_tasks(self):
        """The same rows pressing "start" would have written — otherwise this is
        a second kind of enrollment for the rest of the app to special-case."""
        result, log = _run(
            lambda c: enroll_class_in_quests(c, CLASS, [Q1]), _tables())
        # One insert per enrollment — the copy goes through the shared
        # utils.template_tasks.copy_template_tasks_to_enrollment, so it is
        # literally the same write pressing "start" makes.
        tasks = [t for batch in _written(log, 'user_quest_tasks') for t in batch]
        assert {t['user_id'] for t in tasks} == {S1, S2}
        assert {t['user_quest_id'] for t in tasks} == {'uq-1', 'uq-2'}
        one = tasks[0]
        assert one['title'] == 'Read chapter 1'
        assert one['xp_value'] == 150
        assert one['pillar'] == 'stem'
        assert one['is_required'] is True
        assert one['approval_status'] == 'approved'
        assert one['is_manual'] is False
        assert one['source_template_task_id'] == 'tpl-1'
        assert result['tasks'] == 2

    def test_personalization_is_marked_done_when_tasks_were_copied(self):
        """Template tasks ARE the personalization. Leaving this false parks the
        student in front of a wizard with nothing left to choose."""
        _, log = _run(lambda c: enroll_class_in_quests(c, CLASS, [Q1]), _tables())
        # Once per enrollment, alongside that enrollment's task copy.
        assert _written(log, 'user_quests', op='update') == [
            {'personalization_completed': True}, {'personalization_completed': True}]

    def test_a_quest_with_no_template_tasks_leaves_the_wizard_alone(self):
        """Nothing was copied, so there is still something to personalize."""
        _, log = _run(lambda c: enroll_class_in_quests(c, CLASS, [Q1]),
                      _tables(), templates=())
        assert _written(log, 'user_quest_tasks') == []
        assert _written(log, 'user_quests', op='update') == []

    def test_a_withdrawn_student_gets_nothing(self):
        """class_enrollments is filtered to status=active, so a withdrawn
        student returns no row."""
        result, log = _run(lambda c: enroll_class_in_quests(c, CLASS, [Q1]),
                           _tables(class_enrollments=[]))
        assert result['enrolled'] == 0
        assert _written(log, 'user_quests') == []

    def test_an_inactive_quest_is_never_enrolled(self):
        """A class_quests row outlives the quest it points at; enrolling 30
        students in a retired quest puts a dead entry in every account."""
        result, log = _run(
            lambda c: enroll_class_in_quests(c, CLASS, [Q1]),
            _tables(quests=[{'id': Q1, 'is_active': False}]))
        assert result['enrolled'] == 0
        assert _written(log, 'user_quests') == []


class TestExistingEnrollmentsAreUntouched:
    """The rule the backfill depends on."""

    def test_a_student_already_enrolled_is_skipped(self):
        result, log = _run(
            lambda c: enroll_students_in_quests(c, [S1], [Q1]),
            _tables(user_quests=[{'user_id': S1, 'quest_id': Q1}]))
        assert result == {'enrolled': 0, 'tasks': 0, 'skipped_existing': 1}
        assert _written(log, 'user_quests') == []

    def test_a_completed_enrollment_is_not_reopened(self):
        """user_quests is read without filtering on is_active or completed_at,
        so a finished quest counts as existing and stays finished."""
        result, log = _run(
            lambda c: enroll_students_in_quests(c, [S1, S2], [Q1]),
            _tables(user_quests=[{'user_id': S1, 'quest_id': Q1},
                                 {'user_id': S2, 'quest_id': Q1}]))
        assert result['enrolled'] == 0
        assert _written(log, 'user_quest_tasks') == []

    def test_only_the_missing_pairs_are_written(self):
        _, log = _run(
            lambda c: enroll_students_in_quests(c, [S1, S2], [Q1]),
            _tables(user_quests=[{'user_id': S1, 'quest_id': Q1}]))
        rows = _written(log, 'user_quests')[0]
        assert [r['user_id'] for r in rows] == [S2]

    def test_nothing_is_ever_deleted(self):
        """Unassigning does not unenroll, and neither does anything here."""
        _, log = _run(lambda c: enroll_class_in_quests(c, CLASS, [Q1]), _tables())
        assert not [e for e in log if e[0] == 'delete']


class TestAStudentJoiningAClass:

    def test_they_pick_up_the_quests_already_assigned(self):
        """Without this the fix only reaches students who were on the roster
        when the teacher assigned; everyone who joins later gets the old bug."""
        result, log = _run(
            lambda c: enroll_student_in_class_quests(c, CLASS, S1), _tables())
        rows = _written(log, 'user_quests')[0]
        assert [(r['user_id'], r['quest_id']) for r in rows] == [(S1, Q1)]
        assert result['enrolled'] == 1

    def test_a_class_with_no_quests_enrolls_them_in_nothing(self):
        result, log = _run(
            lambda c: enroll_student_in_class_quests(c, CLASS, S1),
            _tables(class_quests=[]))
        assert result == {'enrolled': 0, 'tasks': 0, 'skipped_existing': 0}


class TestScheduledQuests:

    def test_a_quest_scheduled_for_later_is_not_pulled_forward(self):
        """publish_at is the teacher's statement of when students may see it.
        The read filters on it, so a scheduled quest returns no row here."""
        _, log = _run(lambda c: class_quest_ids(c, CLASS), _tables())
        # The filter is applied in the query, not in Python — assert it was asked
        # for rather than re-implementing PostgREST.
        assert ('insert', 'user_quests') not in [(e[0], e[1]) for e in log]

    def test_staff_can_ask_for_the_unfiltered_list(self):
        ids, _ = _run(lambda c: class_quest_ids(c, CLASS, published_only=False),
                      _tables())
        assert ids == [Q1]


class TestFailuresNeverBreakTheThingTheUserAsked:

    def test_enroll_safe_swallows_and_reports_zero(self):
        """The assignment (or the class enrollment) has already committed when
        this runs. Raising would report success as a failure and invite a retry
        of work that already happened."""
        broken = Mock()
        broken.table.side_effect = RuntimeError('postgrest is having a day')
        assert enroll_safe(enroll_class_in_quests, broken, CLASS, [Q1]) == {
            'enrolled': 0, 'tasks': 0, 'skipped_existing': 0}
