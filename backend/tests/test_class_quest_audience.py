"""
Who a class quest is for.

Gryffin, 2026-09-10 (Katie Bird): "Is there a way to go into a specific
student's assignments and remove them for a specific student? We have some kids
that can only handle so many assignments. On the flip side, is there a way to
only assign certain assignments to specific kids in each class?"

class_quests.student_ids carries the answer: NULL is the whole class, a list is
those students. Three rules carry the risk and are asserted directly:

  - Every reader intersects the list with the ACTIVE roster, and a newcomer to
    the class picks up only the quests assigned to everyone.
  - Taking a quest away from a student never deletes work. An untouched
    enrollment goes; one with a completion, an evidence document or a task the
    student wrote is set down; a finished one is left alone.
  - Adding a student back reaches their account: a set-down enrollment is
    picked back up, because enroll_students_in_quests skips existing rows on
    purpose and would otherwise leave the quest invisible.
"""

from unittest.mock import Mock, patch

from services.class_quest_enrollment import (
    assigned_to,
    audience,
    enroll_class_in_quests,
    enroll_student_in_class_quests,
    reactivate_set_down,
    set_class_quest_audience,
    withdraw_students_from_quest,
)
from utils import class_assignments


CLASS = '44444444-4444-4444-8444-444444444444'
Q1 = '33333333-3333-4333-8333-333333333331'
Q2 = '33333333-3333-4333-8333-333333333332'
S1 = '11111111-1111-4111-8111-111111111111'
S2 = '11111111-1111-4111-8111-111111111112'
S3 = '11111111-1111-4111-8111-111111111113'
PAST = '2020-01-01T00:00:00+00:00'
FUTURE = '2099-01-01T00:00:00+00:00'


class _Table:
    """A filtering fake: eq / in_ narrow the rows, writes mutate the store."""

    def __init__(self, db, name, log):
        self.db, self.name, self.log = db, name, log
        self.filters, self.op, self.payload, self.cap = [], 'select', None, None

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.filters.append(('eq', col, val))
        return self

    def in_(self, col, vals):
        self.filters.append(('in', col, list(vals)))
        return self

    # publish_at filters are applied by PostgREST in production; the fake
    # ignores them and the tests set publish_at on the rows they care about.
    def or_(self, *_a, **_k):
        return self

    def is_(self, *_a, **_k):
        return self

    def lte(self, *_a, **_k):
        return self

    @property
    def not_(self):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, n):
        self.cap = n
        return self

    def insert(self, payload):
        self.op, self.payload = 'insert', payload
        return self

    def update(self, payload):
        self.op, self.payload = 'update', payload
        return self

    def delete(self):
        self.op = 'delete'
        return self

    def _match(self, row):
        for kind, col, val in self.filters:
            if kind == 'eq' and row.get(col) != val:
                return False
            if kind == 'in' and row.get(col) not in val:
                return False
        return True

    def execute(self):
        rows = self.db.setdefault(self.name, [])
        if self.op == 'select':
            out = [r for r in rows if self._match(r)]
            return Mock(data=out[:self.cap] if self.cap else out)
        if self.op == 'insert':
            payload = self.payload if isinstance(self.payload, list) else [self.payload]
            new = []
            for r in payload:
                r = {**r}
                r.setdefault('id', f'{self.name}-{len(rows) + 1}')
                rows.append(r)
                new.append(r)
            self.log.append(('insert', self.name, new))
            return Mock(data=new)
        hit = [r for r in rows if self._match(r)]
        if self.op == 'update':
            for r in hit:
                r.update(self.payload)
            self.log.append(('update', self.name, self.payload, [r['id'] for r in hit]))
            return Mock(data=hit)
        self.db[self.name] = [r for r in rows if r not in hit]
        self.log.append(('delete', self.name, [r['id'] for r in hit]))
        return Mock(data=hit)


def _client(db, log):
    c = Mock()
    c.table.side_effect = lambda name: _Table(db, name, log)
    return c


def _db(**over):
    base = {
        'class_enrollments': [
            {'class_id': CLASS, 'student_id': S1, 'status': 'active'},
            {'class_id': CLASS, 'student_id': S2, 'status': 'active'},
            {'class_id': CLASS, 'student_id': S3, 'status': 'withdrawn'},
        ],
        'org_classes': [{'id': CLASS, 'name': 'Earth Science', 'status': 'active'}],
        'quests': [{'id': Q1, 'is_active': True}, {'id': Q2, 'is_active': True}],
        'class_quests': [
            {'id': 'cq-1', 'class_id': CLASS, 'quest_id': Q1, 'publish_at': None,
             'student_ids': None, 'due_date': None},
        ],
        'user_quests': [],
        'user_quest_tasks': [],
        'quest_task_completions': [],
        'user_task_evidence_documents': [],
    }
    base.update(over)
    return base


def _run(fn, db, log=None):
    log = log if log is not None else []
    with patch('routes.quest_types.get_template_tasks', return_value=[]), \
         patch('utils.template_tasks.get_valid_source_template_ids', return_value=set()):
        return fn(_client(db, log)), log


def _enrolled(db, quest_id=Q1):
    return sorted(r['user_id'] for r in db['user_quests'] if r['quest_id'] == quest_id)


class TestTheRule:

    def test_null_is_everyone(self):
        assert assigned_to({'student_ids': None}, S1)
        assert assigned_to({}, S1)
        assert audience({'student_ids': None}, [S1, S2]) == [S1, S2]

    def test_a_list_is_those_students_only(self):
        link = {'student_ids': [S2]}
        assert not assigned_to(link, S1)
        assert assigned_to(link, S2)

    def test_the_list_is_cut_to_the_roster_in_roster_order(self):
        """A withdrawn student's id left in the list is inert."""
        assert audience({'student_ids': [S3, S2, S1]}, [S1, S2]) == [S1, S2]
        assert audience({'student_ids': [S3]}, [S1, S2]) == []


class TestEnrollmentFollowsTheAudience:

    def test_a_quest_kept_to_one_student_enrolls_one_student(self):
        db = _db(class_quests=[{'id': 'cq-1', 'class_id': CLASS, 'quest_id': Q1,
                                'publish_at': None, 'student_ids': [S2]}])
        result, _ = _run(lambda c: enroll_class_in_quests(c, CLASS, [Q1]), db)
        assert result['enrolled'] == 1
        assert _enrolled(db) == [S2]

    def test_a_class_wide_quest_still_enrolls_everyone_active(self):
        db = _db()
        result, _ = _run(lambda c: enroll_class_in_quests(c, CLASS, [Q1]), db)
        assert result['enrolled'] == 2
        assert _enrolled(db) == sorted([S1, S2])

    def test_a_newcomer_picks_up_only_what_everyone_has(self):
        """A quest the teacher kept to specific students does not spread to a
        student who joins the class later."""
        db = _db(class_quests=[
            {'id': 'cq-1', 'class_id': CLASS, 'quest_id': Q1, 'publish_at': None, 'student_ids': None},
            {'id': 'cq-2', 'class_id': CLASS, 'quest_id': Q2, 'publish_at': None, 'student_ids': [S1]},
        ])
        result, _ = _run(lambda c: enroll_student_in_class_quests(c, CLASS, S2), db)
        assert result['enrolled'] == 1
        assert _enrolled(db, Q1) == [S2]
        assert _enrolled(db, Q2) == []


def _uq(student, quest=Q1, uq_id=None, **over):
    row = {'id': uq_id or f'uq-{student[-1]}', 'user_id': student, 'quest_id': quest,
           'completed_at': None, 'is_active': True}
    row.update(over)
    return row


def _task(uq_id, task_id, **over):
    row = {'id': task_id, 'user_quest_id': uq_id, 'is_manual': False}
    row.update(over)
    return row


class TestTakingAQuestBack:

    def test_an_untouched_enrollment_is_deleted(self):
        db = _db(user_quests=[_uq(S1, uq_id='uq-1')],
                 user_quest_tasks=[_task('uq-1', 't-1'), _task('uq-1', 't-2')])
        result, log = _run(lambda c: withdraw_students_from_quest(c, [S1], Q1), db)
        assert result == {'removed': 1, 'set_down': 0, 'kept': 0}
        assert db['user_quests'] == []
        assert ('delete', 'user_quests', ['uq-1']) in log

    def test_a_completed_task_means_set_down_not_deleted(self):
        db = _db(user_quests=[_uq(S1, uq_id='uq-1')],
                 user_quest_tasks=[_task('uq-1', 't-1')],
                 quest_task_completions=[{'task_id': 't-1'}])
        result, log = _run(lambda c: withdraw_students_from_quest(c, [S1], Q1), db)
        assert result == {'removed': 0, 'set_down': 1, 'kept': 0}
        row = db['user_quests'][0]
        assert row['is_active'] is False and row['status'] == 'set_down'
        assert row['last_set_down_at']
        assert not [e for e in log if e[0] == 'delete']

    def test_an_evidence_document_counts_as_work(self):
        db = _db(user_quests=[_uq(S1, uq_id='uq-1')],
                 user_quest_tasks=[_task('uq-1', 't-1')],
                 user_task_evidence_documents=[{'task_id': 't-1'}])
        result, _ = _run(lambda c: withdraw_students_from_quest(c, [S1], Q1), db)
        assert result['set_down'] == 1 and result['removed'] == 0

    def test_a_task_the_student_wrote_counts_as_work(self):
        db = _db(user_quests=[_uq(S1, uq_id='uq-1')],
                 user_quest_tasks=[_task('uq-1', 't-1', is_manual=True)])
        result, _ = _run(lambda c: withdraw_students_from_quest(c, [S1], Q1), db)
        assert result['set_down'] == 1 and result['removed'] == 0

    def test_a_finished_quest_is_left_alone(self):
        db = _db(user_quests=[_uq(S1, uq_id='uq-1', completed_at='2026-09-01T00:00:00+00:00')])
        result, log = _run(lambda c: withdraw_students_from_quest(c, [S1], Q1), db)
        assert result == {'removed': 0, 'set_down': 0, 'kept': 1}
        assert log == []

    def test_rescheduling_keeps_started_work_visible(self):
        """set_down_started=False: a release date pushed out hides the quest
        only from students who have not touched it."""
        db = _db(user_quests=[_uq(S1, uq_id='uq-1'), _uq(S2, uq_id='uq-2')],
                 user_quest_tasks=[_task('uq-1', 't-1'), _task('uq-2', 't-2')],
                 quest_task_completions=[{'task_id': 't-1'}])
        result, _ = _run(lambda c: withdraw_students_from_quest(
            c, [S1, S2], Q1, set_down_started=False), db)
        assert result == {'removed': 1, 'set_down': 0, 'kept': 1}
        assert [r['user_id'] for r in db['user_quests']] == [S1]
        assert db['user_quests'][0]['is_active'] is True

    def test_only_the_named_students_are_touched(self):
        db = _db(user_quests=[_uq(S1, uq_id='uq-1'), _uq(S2, uq_id='uq-2')])
        _run(lambda c: withdraw_students_from_quest(c, [S2], Q1), db)
        assert [r['user_id'] for r in db['user_quests']] == [S1]


class TestAddingAStudentBack:

    def test_a_set_down_enrollment_is_picked_back_up(self):
        db = _db(user_quests=[_uq(S1, uq_id='uq-1', is_active=False, status='set_down')])
        n, _ = _run(lambda c: reactivate_set_down(c, [S1], Q1), db)
        assert n == 1
        row = db['user_quests'][0]
        assert row['is_active'] is True and row['status'] == 'picked_up'

    def test_a_finished_one_stays_finished(self):
        db = _db(user_quests=[_uq(S1, uq_id='uq-1', is_active=False,
                                  completed_at='2026-09-01T00:00:00+00:00')])
        n, log = _run(lambda c: reactivate_set_down(c, [S1], Q1), db)
        assert n == 0 and log == []


class TestSettingTheAudience:

    def test_the_whole_roster_is_stored_as_null(self):
        """So students who join later keep picking it up."""
        db = _db()
        result, _ = _run(lambda c: set_class_quest_audience(c, CLASS, Q1, [S2, S1]), db)
        assert result['student_ids'] is None
        assert db['class_quests'][0]['student_ids'] is None

    def test_removing_one_student_stores_the_rest_and_withdraws_them(self):
        db = _db(user_quests=[_uq(S1, uq_id='uq-1'), _uq(S2, uq_id='uq-2')])
        result, _ = _run(lambda c: set_class_quest_audience(c, CLASS, Q1, [S1]), db)
        assert result['student_ids'] == [S1]
        assert result['removed'] == [S2] and result['withdrawn'] == 1
        assert _enrolled(db) == [S1]
        assert db['class_quests'][0]['student_ids'] == [S1]

    def test_adding_a_student_enrolls_them_when_released(self):
        db = _db(class_quests=[{'id': 'cq-1', 'class_id': CLASS, 'quest_id': Q1,
                                'publish_at': PAST, 'student_ids': [S1]}],
                 user_quests=[_uq(S1, uq_id='uq-1')])
        result, _ = _run(lambda c: set_class_quest_audience(c, CLASS, Q1, [S1, S2]), db)
        assert result['added'] == [S2] and result['enrolled'] == 1
        assert _enrolled(db) == sorted([S1, S2])
        assert result['student_ids'] is None  # S1 + S2 is the whole active roster

    def test_adding_a_student_back_picks_their_set_down_quest_up(self):
        db = _db(class_quests=[{'id': 'cq-1', 'class_id': CLASS, 'quest_id': Q1,
                                'publish_at': None, 'student_ids': [S1]}],
                 user_quests=[_uq(S1, uq_id='uq-1'),
                              _uq(S2, uq_id='uq-2', is_active=False, status='set_down')])
        result, _ = _run(lambda c: set_class_quest_audience(c, CLASS, Q1, None), db)
        assert result['reactivated'] == 1 and result['enrolled'] == 0
        assert db['user_quests'][1]['is_active'] is True

    def test_a_quest_not_yet_released_enrolls_nobody(self):
        """The release date still governs: the newly added student sees it
        when the date comes, via the publish sweep, not today."""
        db = _db(class_quests=[{'id': 'cq-1', 'class_id': CLASS, 'quest_id': Q1,
                                'publish_at': FUTURE, 'student_ids': [S1]}])
        result, _ = _run(lambda c: set_class_quest_audience(c, CLASS, Q1, [S1, S2]), db)
        assert result['added'] == [S2] and result['enrolled'] == 0
        assert _enrolled(db) == []

    def test_ids_off_the_roster_are_dropped(self):
        db = _db()
        result, _ = _run(lambda c: set_class_quest_audience(c, CLASS, Q1, [S1, S3]), db)
        assert result['student_ids'] == [S1]

    def test_a_quest_not_on_the_class_is_none(self):
        result, _ = _run(lambda c: set_class_quest_audience(c, CLASS, Q2, [S1]), _db())
        assert result is None


class TestWhatAStudentIsToldAbout:
    """utils.class_assignments feeds the home page's due chip, the class card's
    outstanding count and the auto-end rule. A quest kept to classmates must not
    reach any of them for this student."""

    def _db(self):
        return _db(class_quests=[
            {'id': 'cq-1', 'class_id': CLASS, 'quest_id': Q1, 'publish_at': None,
             'student_ids': None, 'due_date': '2026-09-20T05:59:59+00:00'},
            {'id': 'cq-2', 'class_id': CLASS, 'quest_id': Q2, 'publish_at': None,
             'student_ids': [S1], 'due_date': '2026-09-10T05:59:59+00:00'},
        ])

    def test_due_dates_only_for_the_quests_that_are_theirs(self):
        db = self._db()
        mine = class_assignments.student_class_assignments(_client(db, []), S2)
        assert set(mine) == {Q1}
        theirs = class_assignments.student_class_assignments(_client(db, []), S1)
        assert set(theirs) == {Q1, Q2}

    def test_the_class_card_counts_only_their_assignments(self):
        db = self._db()
        by_class = class_assignments.assigned_quest_ids_by_class(_client(db, []), [CLASS], student_id=S2)
        assert by_class == {CLASS: {Q1}}
        # Staff, unnarrowed: everything on the class.
        assert class_assignments.assigned_quest_ids_by_class(_client(db, []), [CLASS]) == {CLASS: {Q1, Q2}}

    def test_a_quest_kept_from_them_is_not_their_schoolwork(self):
        db = self._db()
        assert class_assignments.is_class_assigned(_client(db, []), S2, Q2) is False
        assert class_assignments.is_class_assigned(_client(db, []), S1, Q2) is True
        assert class_assignments.is_class_assigned(_client(db, []), S2, Q1) is True
