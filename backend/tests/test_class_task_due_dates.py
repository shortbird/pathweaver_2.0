"""
A due date on each task of a class quest, per class.

iCreate, ticket 26c91e25 (Karina): "it isn't possible to create a Quest like
'Out of the Dust' and then have different due dates for each week's reading
assignment. Is there a way to have a running due date list of homework? And
past assignments could move to the bottom, in case kids didn't complete them?"

The date lives on class_quest_task_due_dates, keyed (class_id, template_task_id):
one date for the whole class, independent per class, found by a student's copy
through user_quest_tasks.source_template_task_id. These tests drive the real
routes and repositories over an in-memory table store:

  * the SIS PUT (gates, 404s, set and clear) and the GET that shows the dates;
  * the SIS quest-level PATCH, now behind the same due_dates feature;
  * the student agenda (/api/student/agenda) with its task items;
  * the student quest detail's per-task due_date.
"""

import uuid
from unittest.mock import patch

import pytest
from flask import Flask

from repositories.class_repository import ClassRepository
from routes.sis import class_quests


ORG = '11111111-1111-4111-8111-111111111111'
CLASS_A = '22222222-2222-4222-8222-22222222222a'
CLASS_B = '22222222-2222-4222-8222-22222222222b'
QUEST = '33333333-3333-4333-8333-333333333333'
OTHER_QUEST = '33333333-3333-4333-8333-33333333333f'
TEACHER_A = '44444444-4444-4444-8444-44444444444a'
TEACHER_B = '44444444-4444-4444-8444-44444444444b'
ADMIN = '44444444-4444-4444-8444-4444444444ad'
SUPER = '44444444-4444-4444-8444-4444444444ff'
STUDENT = '55555555-5555-4555-8555-555555555555'
T1 = '66666666-6666-4666-8666-666666666661'
T2 = '66666666-6666-4666-8666-666666666662'
T3 = '66666666-6666-4666-8666-666666666663'
FOREIGN_TASK = '66666666-6666-4666-8666-66666666666f'

WEEK1 = '2026-10-02T23:59:59+00:00'
WEEK2 = '2026-10-09T23:59:59+00:00'
WEEK3 = '2026-10-16T23:59:59+00:00'


# ── In-memory table store ──────────────────────────────────────────────────

class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, db, name):
        self.db, self.name = db, name
        self.op, self.payload, self.filters = 'select', None, []
        self.cols, self.order_col, self.limit_n, self.on_conflict = '*', None, None, None

    def select(self, cols='*', **_):
        self.cols = cols
        return self

    def insert(self, payload):
        self.op, self.payload = 'insert', payload
        return self

    def update(self, payload):
        self.op, self.payload = 'update', payload
        return self

    def upsert(self, payload, on_conflict=None):
        self.op, self.payload, self.on_conflict = 'upsert', payload, on_conflict
        return self

    def delete(self):
        self.op = 'delete'
        return self

    def eq(self, col, val):
        self.filters.append(lambda r, c=col, v=val: r.get(c) == v)
        return self

    def in_(self, col, vals):
        vals = list(vals)
        self.filters.append(lambda r, c=col, v=vals: r.get(c) in v)
        return self

    def or_(self, expr):
        # The only or() here is "publish_at.is.null,publish_at.lte.<now>".
        if expr.startswith('publish_at.is.null'):
            cutoff = expr.split('publish_at.lte.', 1)[1].strip('"')
            self.filters.append(
                lambda r, cut=cutoff: r.get('publish_at') is None or r['publish_at'] <= cut)
        return self

    def order(self, col, desc=False):
        self.order_col = col
        return self

    def limit(self, n):
        self.limit_n = n
        return self

    def _rows(self):
        return [r for r in self.db.setdefault(self.name, []) if all(f(r) for f in self.filters)]

    def execute(self):
        table = self.db.setdefault(self.name, [])
        if self.op == 'select':
            rows = [dict(r) for r in self._rows()]
            if 'quests(' in self.cols:
                by_id = {q['id']: q for q in self.db.get('quests', [])}
                for r in rows:
                    r['quests'] = by_id.get(r.get('quest_id'))
            if self.order_col:
                rows.sort(key=lambda r: str(r.get(self.order_col) or ''))
            if self.limit_n is not None:
                rows = rows[:self.limit_n]
            return _Result(rows)
        if self.op == 'insert':
            row = {'id': str(uuid.uuid4()), **self.payload}
            table.append(row)
            return _Result([row])
        if self.op == 'update':
            hit = self._rows()
            for r in hit:
                r.update(self.payload)
            return _Result([dict(r) for r in hit])
        if self.op == 'upsert':
            keys = self.on_conflict.split(',')
            for r in table:
                if all(r.get(k) == self.payload.get(k) for k in keys):
                    r.update(self.payload)
                    return _Result([dict(r)])
            row = {'id': str(uuid.uuid4()), **self.payload}
            table.append(row)
            return _Result([row])
        if self.op == 'delete':
            hit = self._rows()
            self.db[self.name] = [r for r in table if r not in hit]
            return _Result(hit)
        raise AssertionError(self.op)


class _Client:
    def __init__(self, db):
        self.db = db

    def table(self, name):
        return _Query(self.db, name)


def _world():
    """One quest ("Out of the Dust") with three weekly readings, on two classes
    of one org. The student is in class A and enrolled in the quest."""
    return {
        'org_classes': [
            {'id': CLASS_A, 'organization_id': ORG, 'name': 'Reading A', 'status': 'active',
             'primary_instructor_id': TEACHER_A, 'assistant_instructor_ids': []},
            {'id': CLASS_B, 'organization_id': ORG, 'name': 'Reading B', 'status': 'active',
             'primary_instructor_id': TEACHER_B, 'assistant_instructor_ids': []},
        ],
        'class_advisors': [],
        'class_enrollments': [
            {'class_id': CLASS_A, 'student_id': STUDENT, 'status': 'active'},
        ],
        'quests': [
            {'id': QUEST, 'title': 'Out of the Dust', 'organization_id': ORG,
             'description': '', 'header_image_url': None},
            {'id': OTHER_QUEST, 'title': 'Other', 'organization_id': ORG,
             'description': '', 'header_image_url': None},
        ],
        'class_quests': [
            {'id': 'cqa', 'class_id': CLASS_A, 'quest_id': QUEST, 'due_date': None,
             'publish_at': None, 'student_ids': None},
            {'id': 'cqb', 'class_id': CLASS_B, 'quest_id': QUEST, 'due_date': None,
             'publish_at': None, 'student_ids': None},
        ],
        'quest_template_tasks': [
            {'id': T1, 'quest_id': QUEST, 'title': 'Chapters 1-5', 'order_index': 0},
            {'id': T2, 'quest_id': QUEST, 'title': 'Chapters 6-10', 'order_index': 1},
            {'id': T3, 'quest_id': QUEST, 'title': 'Chapters 11-15', 'order_index': 2},
            {'id': FOREIGN_TASK, 'quest_id': OTHER_QUEST, 'title': 'Not this quest',
             'order_index': 0},
        ],
        'user_quests': [
            {'id': 'uq1', 'user_id': STUDENT, 'quest_id': QUEST, 'is_active': True,
             'completed_at': None},
        ],
        'user_quest_tasks': [
            {'id': 'u1', 'user_id': STUDENT, 'quest_id': QUEST, 'source_template_task_id': T1,
             'source_task_id': None},
            {'id': 'u2', 'user_id': STUDENT, 'quest_id': QUEST, 'source_template_task_id': T2,
             'source_task_id': None},
            {'id': 'u3', 'user_id': STUDENT, 'quest_id': QUEST, 'source_template_task_id': T3,
             'source_task_id': None},
        ],
        'quest_task_completions': [],
        'class_quest_task_due_dates': [],
    }


ROLES = {
    TEACHER_A: {'role': 'org_managed', 'org_role': 'advisor', 'admin': False},
    TEACHER_B: {'role': 'org_managed', 'org_role': 'advisor', 'admin': False},
    STUDENT: {'role': 'org_managed', 'org_role': 'student', 'admin': False},
    ADMIN: {'role': 'org_managed', 'org_role': 'org_admin', 'admin': True},
    SUPER: {'role': 'superadmin', 'org_role': None, 'admin': True},
}


def _call(fn, user, *args, db, method='GET', body=None, feature=True):
    """Run a class_quests view as `user` against `db`, with the moderator gate
    real and only the caller's role and the org flag stubbed."""
    client = _Client(db)
    app = Flask(__name__)
    ctx = lambda uid: {'role': ROLES[uid]['role'], 'organization_id':  # noqa: E731
                       None if ROLES[uid]['role'] == 'superadmin' else ORG}
    with patch.object(class_quests, 'get_supabase_admin_client', return_value=client), \
         patch.object(class_quests.sis_service, 'caller_is_admin',
                      side_effect=lambda uid: ROLES[uid]['admin']), \
         patch.object(class_quests.sis_service, 'resolve_org_id',
                      side_effect=lambda uid, org: org if ROLES[uid]['role'] == 'superadmin' else ORG), \
         patch.object(class_quests.sis_service, 'get_user_org_context', side_effect=ctx), \
         patch('utils.org_features.org_has_feature', return_value=feature), \
         app.test_request_context(method=method, json=body):
        view = getattr(fn, '__wrapped__', fn)
        resp = view(user, *args)
    if isinstance(resp, tuple):
        return resp[1], resp[0].get_json()
    return 200, resp.get_json()


def _put(user, class_id, task_id, due, db, quest_id=QUEST, feature=True):
    return _call(class_quests.set_task_due_date, user, class_id, quest_id, task_id,
                 db=db, method='PUT', body={'due_date': due}, feature=feature)


def _dates(db):
    return {(r['class_id'], r['template_task_id']): r['due_date']
            for r in db['class_quest_task_due_dates']}


def _agenda(db, student=STUDENT):
    repo = ClassRepository()
    repo._admin_client = _Client(db)
    return repo.get_student_agenda(student)


# ── The reported behaviour ─────────────────────────────────────────────────

@pytest.mark.unit
class TestTheReportedBehaviour:
    """26c91e25: one quest, a different date for each week's reading."""

    def _dated(self):
        db = _world()
        for task, due in ((T1, WEEK1), (T2, WEEK2), (T3, WEEK3)):
            status, out = _put(TEACHER_A, CLASS_A, task, due, db)
            assert status == 200, out
        return db

    def test_three_dated_tasks_are_three_agenda_items(self):
        items = [i for i in _agenda(self._dated()) if i['kind'] == 'task']
        assert [(i['task_title'], i['quest_title'], i['due_date']) for i in items] == [
            ('Chapters 1-5', 'Out of the Dust', WEEK1),
            ('Chapters 6-10', 'Out of the Dust', WEEK2),
            ('Chapters 11-15', 'Out of the Dust', WEEK3),
        ]
        assert {i['task_id'] for i in items} == {T1, T2, T3}
        assert all(i['class_id'] == CLASS_A and i['class_name'] == 'Reading A' for i in items)
        assert all(i['quest_id'] == QUEST for i in items)

    def test_a_turned_in_task_drops_out(self):
        db = self._dated()
        db['quest_task_completions'].append(
            {'id': 'c1', 'user_id': STUDENT, 'quest_id': QUEST, 'user_quest_task_id': 'u1'})
        titles = [i['task_title'] for i in _agenda(db) if i['kind'] == 'task']
        assert titles == ['Chapters 6-10', 'Chapters 11-15']

    def test_a_past_due_task_stays_until_it_is_done(self):
        db = self._dated()
        db['class_quest_task_due_dates'][0]['due_date'] = '2020-01-01T23:59:59+00:00'
        items = _agenda(db)
        assert items[0]['task_title'] == 'Chapters 1-5'
        assert items[0]['due_date'] == '2020-01-01T23:59:59+00:00'

    def test_an_older_copy_found_through_source_task_id_still_drops_out(self):
        db = self._dated()
        db['user_quest_tasks'][0].update(source_template_task_id=None, source_task_id=T1)
        db['quest_task_completions'].append(
            {'id': 'c1', 'user_id': STUDENT, 'quest_id': QUEST, 'user_quest_task_id': 'u1'})
        assert 'Chapters 1-5' not in [i.get('task_title') for i in _agenda(db)]


# ── Who may set a date ─────────────────────────────────────────────────────

@pytest.mark.unit
class TestTheGates:
    def test_refused_without_the_due_dates_feature_and_nothing_is_written(self):
        db = _world()
        status, out = _put(TEACHER_A, CLASS_A, T1, WEEK1, db, feature=False)
        assert status == 403
        assert 'not enabled' in out['error']
        assert db['class_quest_task_due_dates'] == []

    def test_a_teacher_of_another_class_is_refused(self):
        db = _world()
        status, _ = _put(TEACHER_B, CLASS_A, T1, WEEK1, db)
        assert status == 403
        assert db['class_quest_task_due_dates'] == []

    def test_a_student_is_refused(self):
        db = _world()
        status, _ = _put(STUDENT, CLASS_A, T1, WEEK1, db)
        assert status == 403
        assert db['class_quest_task_due_dates'] == []

    def test_a_task_of_another_quest_is_a_404(self):
        db = _world()
        status, _ = _put(TEACHER_A, CLASS_A, FOREIGN_TASK, WEEK1, db)
        assert status == 404
        assert db['class_quest_task_due_dates'] == []

    def test_a_quest_not_on_the_class_is_a_404(self):
        db = _world()
        status, _ = _put(TEACHER_A, CLASS_A, FOREIGN_TASK, WEEK1, db, quest_id=OTHER_QUEST)
        assert status == 404
        assert db['class_quest_task_due_dates'] == []

    def test_the_class_teacher_may(self):
        db = _world()
        status, out = _put(TEACHER_A, CLASS_A, T1, WEEK1, db)
        assert status == 200
        assert out == {'success': True, 'task_id': T1, 'due_date': WEEK1}
        assert _dates(db) == {(CLASS_A, T1): WEEK1}
        assert db['class_quest_task_due_dates'][0]['set_by'] == TEACHER_A

    def test_an_org_admin_may(self):
        db = _world()
        assert _put(ADMIN, CLASS_A, T1, WEEK1, db)[0] == 200
        assert _dates(db) == {(CLASS_A, T1): WEEK1}

    def test_a_superadmin_may_even_without_the_feature(self):
        db = _world()
        assert _put(SUPER, CLASS_A, T1, WEEK1, db, feature=False)[0] == 200
        assert _dates(db) == {(CLASS_A, T1): WEEK1}

    def test_a_malformed_date_is_a_400(self):
        db = _world()
        assert _put(TEACHER_A, CLASS_A, T1, 'next friday', db)[0] == 400
        assert db['class_quest_task_due_dates'] == []

    def test_null_and_empty_both_clear(self):
        for cleared in (None, ''):
            db = _world()
            _put(TEACHER_A, CLASS_A, T1, WEEK1, db)
            status, out = _put(TEACHER_A, CLASS_A, T1, cleared, db)
            assert status == 200 and out['due_date'] is None
            assert db['class_quest_task_due_dates'] == []

    def test_setting_again_replaces_rather_than_duplicates(self):
        db = _world()
        _put(TEACHER_A, CLASS_A, T1, WEEK1, db)
        _put(TEACHER_A, CLASS_A, T1, WEEK2, db)
        assert _dates(db) == {(CLASS_A, T1): WEEK2}
        assert len(db['class_quest_task_due_dates']) == 1


@pytest.mark.unit
class TestTheQuestLevelPatchIsGatedToo:
    def _patch(self, body, feature):
        db = _world()
        status, out = _call(class_quests.update_class_quest, TEACHER_A, CLASS_A, QUEST,
                            db=db, method='PATCH', body=body, feature=feature)
        return status, out, db['class_quests'][0]

    def test_a_due_date_is_refused_without_the_feature_and_nothing_is_written(self):
        status, _, link = self._patch(
            {'due_date': WEEK1, 'publish_at': '2026-09-01T00:00:00+00:00'}, feature=False)
        assert status == 403
        assert link['due_date'] is None and link['publish_at'] is None

    def test_other_settings_still_save_without_the_feature(self):
        status, _, link = self._patch({'publish_at': '2026-09-01T00:00:00+00:00'}, feature=False)
        assert status == 200
        assert link['publish_at'] == '2026-09-01T00:00:00+00:00'

    def test_a_due_date_saves_with_the_feature(self):
        status, _, link = self._patch({'due_date': WEEK1}, feature=True)
        assert status == 200
        assert link['due_date'] == WEEK1


# ── What the screens read ──────────────────────────────────────────────────

@pytest.mark.unit
class TestTheWire:
    def test_get_tasks_carries_due_date_null_and_set(self):
        db = _world()
        _put(TEACHER_A, CLASS_A, T2, WEEK2, db)
        with patch.object(class_quests.quest_edit_rules, 'can_edit_quest', return_value=False):
            status, out = _call(class_quests.list_preset_tasks, TEACHER_A, CLASS_A, QUEST, db=db)
        assert status == 200
        assert [(t['id'], t['due_date']) for t in out['tasks']] == [
            (T1, None), (T2, WEEK2), (T3, None)]
        # Read-only (office/library) quests still carry the class's dates.
        assert out['editable'] is False

    def test_two_classes_sharing_a_quest_keep_their_own_dates(self):
        db = _world()
        _put(TEACHER_A, CLASS_A, T1, WEEK1, db)
        _put(TEACHER_B, CLASS_B, T1, WEEK3, db)
        assert _dates(db) == {(CLASS_A, T1): WEEK1, (CLASS_B, T1): WEEK3}
        with patch.object(class_quests.quest_edit_rules, 'can_edit_quest', return_value=True):
            _, a = _call(class_quests.list_preset_tasks, TEACHER_A, CLASS_A, QUEST, db=db)
            _, b = _call(class_quests.list_preset_tasks, TEACHER_B, CLASS_B, QUEST, db=db)
        assert a['tasks'][0]['due_date'] == WEEK1
        assert b['tasks'][0]['due_date'] == WEEK3
        # The student in class A is held to class A's date only.
        assert [i['due_date'] for i in _agenda(db) if i['kind'] == 'task'] == [WEEK1]

    def test_clearing_one_class_leaves_the_other(self):
        db = _world()
        _put(TEACHER_A, CLASS_A, T1, WEEK1, db)
        _put(TEACHER_B, CLASS_B, T1, WEEK3, db)
        _put(TEACHER_A, CLASS_A, T1, None, db)
        assert _dates(db) == {(CLASS_B, T1): WEEK3}

    def test_editing_a_task_keeps_its_date(self):
        """The date is keyed on the template id, which a task edit and the
        resync that follows it do not change."""
        db = _world()
        _put(TEACHER_A, CLASS_A, T1, WEEK1, db)
        with patch.object(class_quests, '_authorize_editable_quest',
                          return_value=({'id': CLASS_A, 'organization_id': ORG},
                                        _Client(db), {'id': QUEST}, None)), \
             patch.object(class_quests, '_subject_updates', return_value={}), \
             patch('utils.template_tasks.resync_enrollments_to_template'):
            status, _ = _call(class_quests.update_preset_task, TEACHER_A, CLASS_A, QUEST, T1,
                              db=db, method='PATCH', body={'title': 'Chapters 1-6'})
        assert status == 200
        with patch.object(class_quests.quest_edit_rules, 'can_edit_quest', return_value=True):
            _, out = _call(class_quests.list_preset_tasks, TEACHER_A, CLASS_A, QUEST, db=db)
        assert (out['tasks'][0]['title'], out['tasks'][0]['due_date']) == ('Chapters 1-6', WEEK1)
        assert _agenda(db)[0]['task_title'] == 'Chapters 1-6'

    def test_agenda_quest_items_say_their_kind_and_leave_when_the_quest_is_ended(self):
        db = _world()
        db['class_quests'][0]['due_date'] = WEEK2
        _put(TEACHER_A, CLASS_A, T1, WEEK1, db)
        items = _agenda(db)
        assert [(i['kind'], i['due_date']) for i in items] == [('task', WEEK1), ('quest', WEEK2)]
        quest_item = items[1]
        assert quest_item['quest_title'] == 'Out of the Dust' and quest_item['title'] == 'Out of the Dust'

        db['user_quests'][0].update(is_active=False, completed_at='2026-10-01T00:00:00+00:00')
        assert _agenda(db) == []

    def test_a_restarted_quest_is_not_ended(self):
        db = _world()
        db['class_quests'][0]['due_date'] = WEEK2
        db['user_quests'][0].update(is_active=True, completed_at='2026-10-01T00:00:00+00:00')
        assert [i['kind'] for i in _agenda(db)] == ['quest']

    def test_agenda_leaves_out_quests_that_are_not_released_or_not_for_this_student(self):
        db = _world()
        _put(TEACHER_A, CLASS_A, T1, WEEK1, db)
        db['class_quests'][0]['publish_at'] = '2999-01-01T00:00:00+00:00'
        assert _agenda(db) == []
        db['class_quests'][0].update(publish_at=None, student_ids=['someone-else'])
        assert _agenda(db) == []

    def test_quest_detail_tasks_carry_due_date(self):
        from routes.quest.detail import _attach_task_due_dates
        db = _world()
        _put(TEACHER_A, CLASS_A, T2, WEEK2, db)
        tasks = [
            {'id': 'u1', 'source_template_task_id': T1},
            {'id': 'u2', 'source_template_task_id': T2},
            {'id': 'own', 'source_template_task_id': None},  # written by the student
        ]
        _attach_task_due_dates(_Client(db), STUDENT, QUEST, tasks)
        assert [t['due_date'] for t in tasks] == [None, WEEK2, None]

    def test_quest_detail_takes_the_soonest_when_two_of_the_students_classes_carry_it(self):
        from routes.quest.detail import _attach_task_due_dates
        db = _world()
        db['class_enrollments'].append({'class_id': CLASS_B, 'student_id': STUDENT,
                                        'status': 'active'})
        _put(TEACHER_A, CLASS_A, T1, WEEK3, db)
        _put(TEACHER_B, CLASS_B, T1, WEEK1, db)
        tasks = [{'id': 'u1', 'source_template_task_id': T1}]
        _attach_task_due_dates(_Client(db), STUDENT, QUEST, tasks)
        assert tasks[0]['due_date'] == WEEK1

    def test_quest_detail_ignores_a_class_the_student_is_not_in(self):
        from routes.quest.detail import _attach_task_due_dates
        db = _world()
        _put(TEACHER_B, CLASS_B, T1, WEEK1, db)
        tasks = [{'id': 'u1', 'source_template_task_id': T1}]
        _attach_task_due_dates(_Client(db), STUDENT, QUEST, tasks)
        assert tasks[0]['due_date'] is None


@pytest.mark.unit
def test_the_put_rule_has_one_owner():
    """One route, one owner: the rule resolves to this handler."""
    import app as app_module
    adapter = app_module.app.url_map.bind('localhost')
    endpoint, _ = adapter.match(
        f'/api/sis/classes/{CLASS_A}/quests/{QUEST}/tasks/{T1}/due-date', method='PUT')
    assert endpoint == 'sis_class_quests.set_task_due_date'
