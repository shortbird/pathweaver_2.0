"""
A teacher working with one student, outside any class.

2026-10-07: "we need a more individual option where school teachers can assign
quests to individual students and work with them that way." The console only
knew the class. These pin what the individual door promises:

  - Giving a quest records the assignment (who, when due) AND enrolls the
    student the ordinary way, so it reads like any other quest; giving it twice
    is one assignment; a quest the student set down comes back onto their list.
  - Never another school's quest, never an inactive one.
  - Taking it back follows the office's Remove: untouched enrollments go, and a
    quest the student still has through a class stays (set down, not deleted).
  - The student's page says where each quest came from, and only tasks someone
    added -- and has not been done -- can be taken back.
  - The submissions inbox sees the work: a teacher the quests they gave, an
    admin every one in the school.
  - /api/advisor/invite-to-quest no longer enrolls any account in any quest.
"""

from unittest.mock import Mock, patch

import pytest

from services import student_quest_assignments as sqa
from services.student_quest_assignments import AssignmentError

ORG = '99999999-9999-4999-8999-999999999990'
OTHER_ORG = '99999999-9999-4999-8999-999999999991'
TEACHER = '55555555-5555-4555-8555-555555555555'
STUDENT = '11111111-1111-4111-8111-111111111111'
CLASS = '44444444-4444-4444-8444-444444444444'
Q1 = '33333333-3333-4333-8333-333333333331'
Q2 = '33333333-3333-4333-8333-333333333332'
FOREIGN = '33333333-3333-4333-8333-333333333339'


class _Table:
    """A filtering fake: eq / in_ / is_(null) narrow the rows, writes mutate the store."""

    def __init__(self, db, name, log):
        self.db, self.name, self.log = db, name, log
        self.filters, self.op, self.payload, self.cap, self.conflict = [], 'select', None, None, None

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.filters.append(('eq', col, val))
        return self

    def in_(self, col, vals):
        self.filters.append(('in', col, list(vals)))
        return self

    def is_(self, col, val):
        if val == 'null':
            self.filters.append(('null', col, None))
        return self

    def __getattr__(self, _name):
        # or_ / lte / order / ilike / not_: chainable no-ops
        return lambda *a, **k: self

    def limit(self, n):
        self.cap = n
        return self

    def insert(self, payload):
        self.op, self.payload = 'insert', payload
        return self

    def upsert(self, payload, on_conflict=None):
        self.op, self.payload, self.conflict = 'upsert', payload, on_conflict
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
            if kind == 'null' and row.get(col) is not None:
                return False
        return True

    def _add(self, rows, r):
        r = {**r}
        r.setdefault('id', f'{self.name}-{len(rows) + 1}')
        rows.append(r)
        return r

    def execute(self):
        rows = self.db.setdefault(self.name, [])
        if self.op == 'select':
            out = [r for r in rows if self._match(r)]
            return Mock(data=out[:self.cap] if self.cap else out)
        if self.op == 'insert':
            payload = self.payload if isinstance(self.payload, list) else [self.payload]
            new = [self._add(rows, r) for r in payload]
            self.log.append(('insert', self.name, new))
            return Mock(data=new)
        if self.op == 'upsert':
            keys = self.conflict.split(',')
            hit = next((r for r in rows if all(r.get(k) == self.payload.get(k) for k in keys)), None)
            if hit:
                hit.update(self.payload)
            else:
                hit = self._add(rows, self.payload)
            self.log.append(('upsert', self.name, hit))
            return Mock(data=[hit])
        hit = [r for r in rows if self._match(r)]
        if self.op == 'update':
            for r in hit:
                r.update(self.payload)
            self.log.append(('update', self.name, self.payload, [r['id'] for r in hit]))
            return Mock(data=hit)
        self.db[self.name] = [r for r in rows if r not in hit]
        self.log.append(('delete', self.name, [r['id'] for r in hit]))
        return Mock(data=hit)


def _client(db, log=None):
    c = Mock()
    c.table.side_effect = lambda name: _Table(db, name, log if log is not None else [])
    return c


def _db(**over):
    base = {
        'quests': [
            {'id': Q1, 'title': 'Fractions', 'organization_id': ORG, 'is_active': True, 'is_public': False},
            {'id': Q2, 'title': 'Library: Birds', 'organization_id': None, 'is_active': True, 'is_public': True},
            {'id': FOREIGN, 'title': 'Theirs', 'organization_id': OTHER_ORG, 'is_active': True, 'is_public': True},
        ],
        'users': [
            {'id': TEACHER, 'first_name': 'Sam', 'last_name': 'Teacher'},
            {'id': STUDENT, 'first_name': 'Ada', 'last_name': 'Lee'},
        ],
        'user_quests': [], 'user_quest_tasks': [], 'quest_task_completions': [],
        'user_task_evidence_documents': [], 'student_quest_assignments': [],
        'class_enrollments': [], 'org_classes': [], 'class_quests': [],
    }
    base.update(over)
    return base


def _patches():
    """Enrollment's side doors: template tasks and guardian notices."""
    return (
        patch('services.class_quest_enrollment.load_template_tasks', return_value=[]),
        patch('services.class_quest_enrollment.copy_template_tasks_to_enrollment', return_value=0),
        patch('services.class_quest_enrollment._notify_guardians_of_assignment'),
    )


def _assign(db, quest_id=Q1, due=None):
    a, b, c = _patches()
    with a, b, c:
        return sqa.assign(_client(db), ORG, STUDENT, quest_id, TEACHER, due)


class TestGiving:

    def test_records_the_assignment_and_enrolls_the_student(self):
        db = _db()
        result = _assign(db, due='2026-10-31T23:59:59+00:00')
        assert result['enrolled'] is True
        [row] = db['student_quest_assignments']
        assert (row['student_id'], row['quest_id'], row['assigned_by'], row['due_date']) == \
            (STUDENT, Q1, TEACHER, '2026-10-31T23:59:59+00:00')
        [uq] = db['user_quests']
        assert uq['user_id'] == STUDENT and uq['is_active'] is True
        # Who put it there, on the enrollment the rest of the app reads.
        assert uq['enrolled_by_user_id'] == TEACHER

    def test_a_library_quest_can_be_given(self):
        db = _db()
        _assign(db, quest_id=Q2)
        assert db['student_quest_assignments'][0]['quest_id'] == Q2

    def test_giving_it_twice_is_one_assignment_and_one_enrollment(self):
        db = _db()
        _assign(db)
        again = _assign(db, due='2026-11-01T23:59:59+00:00')
        assert len(db['student_quest_assignments']) == 1
        assert db['student_quest_assignments'][0]['due_date'] == '2026-11-01T23:59:59+00:00'
        assert len(db['user_quests']) == 1
        assert again['already_had_it'] is True

    def test_a_quest_they_set_down_comes_back_onto_their_list(self):
        db = _db(user_quests=[{'id': 'uq1', 'user_id': STUDENT, 'quest_id': Q1,
                               'is_active': False, 'status': 'set_down', 'completed_at': None}])
        result = _assign(db)
        assert result['reactivated'] is True
        assert db['user_quests'][0]['is_active'] is True

    def test_another_schools_quest_is_refused(self):
        db = _db()
        with pytest.raises(AssignmentError) as e:
            _assign(db, quest_id=FOREIGN)
        assert e.value.status == 404
        assert db['student_quest_assignments'] == [] and db['user_quests'] == []

    def test_an_inactive_quest_is_refused(self):
        db = _db()
        db['quests'][0]['is_active'] = False
        with pytest.raises(AssignmentError):
            _assign(db)


class TestDueDates:

    def test_a_plain_date_is_the_end_of_that_day(self):
        assert sqa.parse_due_date('2026-10-31') == '2026-10-31T23:59:59+00:00'

    def test_blank_clears_it(self):
        assert sqa.parse_due_date('') is None and sqa.parse_due_date(None) is None

    def test_garbage_is_refused_not_dropped(self):
        with pytest.raises(AssignmentError):
            sqa.parse_due_date('next friday')

    def test_changing_it_needs_an_individual_assignment(self):
        with pytest.raises(AssignmentError) as e:
            sqa.set_due_date(_client(_db()), STUDENT, Q1, None)
        assert e.value.status == 404


class TestTakingItBack:

    def test_an_untouched_quest_leaves_their_account(self):
        db = _db()
        _assign(db)
        sqa.unassign(_client(db), STUDENT, Q1)
        assert db['student_quest_assignments'] == []
        assert db['user_quests'] == []

    def test_started_work_is_set_down_not_deleted(self):
        db = _db()
        _assign(db)
        uq = db['user_quests'][0]
        db['user_quest_tasks'] = [{'id': 't1', 'user_quest_id': uq['id'], 'is_manual': False}]
        db['quest_task_completions'] = [{'id': 'c1', 'task_id': 't1'}]
        out = sqa.unassign(_client(db), STUDENT, Q1)
        assert out['set_down'] == 1
        assert db['user_quests'][0]['is_active'] is False

    def test_a_quest_they_also_have_through_a_class_stays_with_its_work(self):
        db = _db(class_enrollments=[{'class_id': CLASS, 'student_id': STUDENT, 'status': 'active'}],
                 org_classes=[{'id': CLASS, 'name': 'Math', 'status': 'active'}],
                 class_quests=[{'class_id': CLASS, 'quest_id': Q1, 'student_ids': None}])
        _assign(db)
        out = sqa.unassign(_client(db), STUDENT, Q1)
        assert out['still_on_classes'] == [CLASS]
        assert len(db['user_quests']) == 1  # set down, never deleted

    def test_only_an_individual_assignment_can_be_taken_back_here(self):
        with pytest.raises(AssignmentError):
            sqa.unassign(_client(_db()), STUDENT, Q1)


class TestTheStudentsPage:

    def _db(self):
        return _db(
            class_enrollments=[{'class_id': CLASS, 'student_id': STUDENT, 'status': 'active'}],
            org_classes=[{'id': CLASS, 'name': 'Math', 'status': 'active'}],
            class_quests=[{'class_id': CLASS, 'quest_id': Q2, 'student_ids': None}],
            student_quest_assignments=[{'id': 'a1', 'student_id': STUDENT, 'quest_id': Q1,
                                        'assigned_by': TEACHER, 'due_date': '2026-10-31T23:59:59+00:00',
                                        'created_at': '2026-10-07'}],
            user_quests=[
                {'id': 'uq1', 'user_id': STUDENT, 'quest_id': Q1, 'is_active': True},
                {'id': 'uq2', 'user_id': STUDENT, 'quest_id': Q2, 'is_active': True},
            ],
            user_quest_tasks=[
                {'id': 't1', 'user_quest_id': 'uq1', 'user_id': STUDENT, 'title': 'Template', 'xp_value': 50},
                {'id': 't2', 'user_quest_id': 'uq1', 'user_id': STUDENT, 'title': 'Just for Ada', 'xp_value': 25,
                 'created_by_user_id': TEACHER},
                {'id': 't3', 'user_quest_id': 'uq1', 'user_id': STUDENT, 'title': 'Added, done', 'xp_value': 25,
                 'created_by_user_id': TEACHER},
            ],
            quest_task_completions=[{'id': 'c3', 'task_id': 't3', 'completed_at': '2026-10-06'}],
        )

    def test_each_quest_says_where_it_came_from(self):
        work = {q['quest_id']: q for q in sqa.student_work(_client(self._db()), STUDENT)}
        assert work[Q1]['individual']['assigned_by_name'] == 'Sam Teacher'
        assert work[Q1]['individual']['due_date'] == '2026-10-31T23:59:59+00:00'
        assert work[Q1]['classes'] == []
        assert work[Q2]['individual'] is None and work[Q2]['classes'] == ['Math']

    def test_individual_quests_come_first(self):
        work = sqa.student_work(_client(self._db()), STUDENT)
        assert [q['quest_id'] for q in work] == [Q1, Q2]

    def test_progress_and_which_tasks_can_be_taken_back(self):
        work = {q['quest_id']: q for q in sqa.student_work(_client(self._db()), STUDENT)}
        q = work[Q1]
        assert (q['tasks_done'], q['tasks_total'], q['xp_earned']) == (1, 3, 25)
        removable = {t['id']: t['removable'] for t in q['tasks']}
        assert removable == {'t1': False, 't2': True, 't3': False}
        assert {t['id']: t['added_by_name'] for t in q['tasks']}['t2'] == 'Sam Teacher'

    def test_a_task_the_quest_came_with_cannot_be_removed(self):
        with pytest.raises(AssignmentError) as e:
            sqa.remove_teacher_task(_client(self._db()), STUDENT, 't1')
        assert e.value.status == 409

    def test_a_done_task_stays(self):
        with pytest.raises(AssignmentError):
            sqa.remove_teacher_task(_client(self._db()), STUDENT, 't3')

    def test_an_added_open_task_is_removed(self):
        db = self._db()
        sqa.remove_teacher_task(_client(db), STUDENT, 't2')
        assert 't2' not in {t['id'] for t in db['user_quest_tasks']}

    def test_another_students_task_is_not_found(self):
        db = self._db()
        db['user_quest_tasks'][1]['user_id'] = 'someone-else'
        with pytest.raises(AssignmentError) as e:
            sqa.remove_teacher_task(_client(db), STUDENT, 't2')
        assert e.value.status == 404


class TestTheSubmissionsInbox:
    """Work on an individually given quest reaches the inbox. Before this, the
    inbox matched only class_quests, so a teacher never saw it."""

    def _pairs(self, scope):
        import routes.sis.submissions as subs
        db = _db(student_quest_assignments=[
            {'id': 'a1', 'organization_id': ORG, 'student_id': STUDENT, 'quest_id': Q1, 'assigned_by': TEACHER},
            {'id': 'a2', 'organization_id': ORG, 'student_id': STUDENT, 'quest_id': Q2, 'assigned_by': 'other'},
        ])
        with patch.object(subs, 'get_supabase_admin_client', return_value=_client(db)), \
             patch.object(subs.sis_service, 'class_scope', return_value=scope), \
             patch('repositories.student_quest_assignment_repository.fetch_all_rows',
                   side_effect=lambda build, order_by='id': build().execute().data):
            return subs._individual_pairs(TEACHER, ORG)

    def test_a_teacher_sees_the_quests_they_gave(self):
        assert self._pairs(scope=[]) == {(STUDENT, Q1)}

    def test_an_admin_sees_every_one_in_the_school(self):
        assert self._pairs(scope=None) == {(STUDENT, Q1), (STUDENT, Q2)}


class TestInviteToQuestIsChecked:
    """Until 2026-10-07 /api/advisor/invite-to-quest checked only the role:
    any advisor could enroll any account in any quest."""

    def _refusal(self, *, advises=False, same_school=False, quest_org=ORG, is_public=False,
                 super_=False):
        import routes.advisor.main as advisor
        quest = {'id': Q1, 'organization_id': quest_org, 'is_public': is_public,
                 'is_active': True, 'created_by': 'someone'}
        rels = {'advisor': lambda c, t: advises, 'org_staff': lambda c, t: same_school}
        with patch('utils.auth.org_scope.caller_roles_and_org',
                   return_value=({'advisor'}, ORG, super_)), \
             patch('utils.auth.relationships.RELATIONSHIPS', rels):
            return advisor._invite_refusal(_client({'quests': [quest]}), TEACHER, [Q1], [STUDENT])

    def test_a_student_from_nowhere_is_refused(self):
        assert self._refusal() is not None

    def test_a_student_at_my_school_and_my_schools_quest_pass(self):
        assert self._refusal(same_school=True) is None

    def test_an_advised_student_and_a_library_quest_pass(self):
        assert self._refusal(advises=True, quest_org=None, is_public=True) is None

    def test_another_schools_quest_is_refused(self):
        assert self._refusal(same_school=True, quest_org=OTHER_ORG, is_public=True) is not None

    def test_a_superadmin_is_not_limited(self):
        assert self._refusal(super_=True) is None


class TestTheRouteGate:
    """A superadmin passes every relationship check, so the route also pins the
    student to the org the request resolved to."""

    def _student(self, row):
        import routes.sis.student_work as sw
        with patch.object(sw, '_admin', return_value=_client({'users': [row] if row else []})), \
             patch('services.sis_service.org_or_error', return_value=(ORG, None)):
            from flask import Flask
            with Flask(__name__).app_context():
                return sw._student_or_error(TEACHER, STUDENT)

    def test_a_student_of_this_school_resolves(self):
        org, student, err = self._student({'id': STUDENT, 'organization_id': ORG, 'role': 'student'})
        assert err is None and student['id'] == STUDENT

    def test_a_student_of_another_school_is_not_found(self):
        _org, _s, err = self._student({'id': STUDENT, 'organization_id': OTHER_ORG, 'role': 'student'})
        assert err[1] == 404

    def test_a_staff_member_is_not_a_student(self):
        _org, _s, err = self._student({'id': STUDENT, 'organization_id': ORG,
                                       'role': 'org_managed', 'org_role': 'advisor'})
        assert err[1] == 404


class TestMessaging:
    """A teacher who gave a student a quest by name may message them, the way a
    class teacher may message their roster. Nobody else gains anything."""

    def test_gave_quest_to_reads_the_assignment(self):
        from repositories.student_quest_assignment_repository import StudentQuestAssignmentRepository
        db = _db(student_quest_assignments=[{'id': 'a1', 'student_id': STUDENT, 'quest_id': Q1,
                                             'assigned_by': TEACHER}])
        repo = StudentQuestAssignmentRepository(_client(db))
        assert repo.gave_quest_to(TEACHER, STUDENT) is True
        assert repo.gave_quest_to('another-teacher', STUDENT) is False
        assert repo.gave_quest_to(STUDENT, TEACHER) is False

    def test_a_failed_lookup_grants_nothing(self):
        from services.direct_message_service import DirectMessageService
        broken = Mock()
        broken.table.side_effect = RuntimeError('db down')
        assert DirectMessageService._gave_quest_to(broken, TEACHER, STUDENT) is False


class TestWritingANewQuestForAStudent:
    """The quest editor can start a draft for one student (context 'student'),
    but only for a student of the caller's own school."""

    def _check(self, row):
        import routes.sis.quest_editor as qe
        with patch.object(qe, '_admin', return_value=_client({'users': [row] if row else []})):
            from flask import Flask
            with Flask(__name__).app_context():
                return qe._student_at_school(STUDENT, ORG)

    def test_a_student_here_may_have_one(self):
        assert self._check({'id': STUDENT, 'organization_id': ORG, 'role': 'student'}) is None

    def test_a_student_elsewhere_may_not(self):
        assert self._check({'id': STUDENT, 'organization_id': OTHER_ORG, 'role': 'student'})[1] == 404

    def test_student_is_a_draft_context(self):
        from services.sis_quest_authoring import DRAFT_CONTEXTS
        assert 'student' in DRAFT_CONTEXTS
