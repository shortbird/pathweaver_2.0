"""
The quests on a student's Learning Snapshot: where each came from, what leaves
with a class, and how the office takes one off.

iCreate, 2026-10-01 (ticket d8a2a8d4, Marika, org_admin, on /overview): "make
all the quests in a student's learning snapshot be categorized and sortable?
It is super chaotic... how does one get rid of quests that shouldn't be there.
AJ should not have any elementary classes/quests on his since he is in high
school".

Three causes, three fixes, each pinned here:

  (a) the overview's active quests carried no class, so nothing could group
      them -- every active quest now says which class it came through
      (`source_class`, null for the student's own);
  (b) joining a class enrolled the student in its quests and leaving it did
      nothing, so a drop left them all behind -- a drop now withdraws the
      class's quests, except one still on another class the student is in;
  (c) there was no way for the office to take one off -- now there is, with
      the same never-delete-work rule a teacher's withdraw uses.
"""

import copy as _copy
import uuid as _uuid
from unittest.mock import Mock, patch

import pytest

from services.class_quest_enrollment import (
    remove_quest_for_student,
    withdraw_student_from_class_quests,
)
from services.student_quest_sources import quest_source_classes
from tests.test_class_quest_audience import _client, _db

ELEM = '44444444-4444-4444-8444-444444444441'      # the elementary class AJ left
HIGH = '44444444-4444-4444-8444-444444444442'      # a class AJ is still in
OLD = '44444444-4444-4444-8444-444444444443'       # a class AJ left last year
Q_ELEM = '33333333-3333-4333-8333-333333333301'    # only on the elementary class
Q_SHARED = '33333333-3333-4333-8333-333333333302'  # on both classes
Q_WORKED = '33333333-3333-4333-8333-333333333303'  # elementary, with work behind it
Q_DONE = '33333333-3333-4333-8333-333333333304'    # elementary, finished
Q_OTHERS = '33333333-3333-4333-8333-333333333305'  # elementary, kept to others
Q_OWN = '33333333-3333-4333-8333-333333333306'     # AJ's own quest
AJ = '11111111-1111-4111-8111-111111111101'
KID = '11111111-1111-4111-8111-111111111102'


def _uq(quest, uq_id, **over):
    row = {'id': uq_id, 'user_id': AJ, 'quest_id': quest, 'completed_at': None,
           'is_active': True, 'started_at': '2026-09-01T00:00:00Z'}
    row.update(over)
    return row


def _link(class_id, quest, **over):
    row = {'id': f'cq-{class_id[-1]}-{quest[-2:]}', 'class_id': class_id, 'quest_id': quest,
           'publish_at': None, 'student_ids': None, 'due_date': None}
    row.update(over)
    return row


def _school(**over):
    """AJ, already dropped from the elementary class, still in the high school one."""
    base = _db(
        class_enrollments=[
            {'class_id': ELEM, 'student_id': AJ, 'status': 'withdrawn'},
            {'class_id': HIGH, 'student_id': AJ, 'status': 'active'},
            {'class_id': ELEM, 'student_id': KID, 'status': 'active'},
        ],
        org_classes=[
            {'id': ELEM, 'name': 'Elementary Art', 'status': 'active'},
            {'id': HIGH, 'name': 'Biology', 'status': 'active'},
            {'id': OLD, 'name': 'Last Year', 'status': 'archived'},
        ],
        quests=[{'id': q, 'is_active': True} for q in
                (Q_ELEM, Q_SHARED, Q_WORKED, Q_DONE, Q_OTHERS, Q_OWN)],
        class_quests=[
            _link(ELEM, Q_ELEM), _link(ELEM, Q_SHARED), _link(ELEM, Q_WORKED),
            _link(ELEM, Q_DONE), _link(ELEM, Q_OTHERS, student_ids=[KID]),
            _link(HIGH, Q_SHARED),
        ],
        user_quests=[
            _uq(Q_ELEM, 'uq-elem'), _uq(Q_SHARED, 'uq-shared'), _uq(Q_WORKED, 'uq-worked'),
            _uq(Q_DONE, 'uq-done', completed_at='2026-09-20T00:00:00Z'),
            _uq(Q_OTHERS, 'uq-others'), _uq(Q_OWN, 'uq-own'),
        ],
        user_quest_tasks=[
            {'id': 't-worked', 'user_quest_id': 'uq-worked', 'is_manual': False},
            {'id': 't-elem', 'user_quest_id': 'uq-elem', 'is_manual': False},
        ],
        quest_task_completions=[{'task_id': 't-worked', 'user_quest_task_id': 't-worked',
                                 'xp_awarded': 50}],
    )
    base.update(over)
    return base


def _rows(db):
    return {r['quest_id']: r for r in db['user_quests'] if r['user_id'] == AJ}


@pytest.mark.unit
class TestADropTakesTheClassQuests:
    """(b) unenroll withdraws, unless another class still carries the quest."""

    def test_untouched_class_quests_are_removed_and_worked_ones_set_down(self):
        db, log = _school(), []
        out = withdraw_student_from_class_quests(_client(db, log), ELEM, AJ)
        rows = _rows(db)
        assert Q_ELEM not in rows                         # untouched: deleted
        assert rows[Q_WORKED]['is_active'] is False       # work: set down
        assert rows[Q_WORKED]['status'] == 'set_down'
        assert rows[Q_DONE]['completed_at']               # finished: left alone
        assert rows[Q_DONE]['is_active'] is True
        # Completed work and the XP it earned are never touched.
        assert db['quest_task_completions'] == [
            {'task_id': 't-worked', 'user_quest_task_id': 't-worked', 'xp_awarded': 50}]
        # Q_ELEM, Q_WORKED, Q_DONE; Q_SHARED is shared, Q_OTHERS was never AJ's.
        assert out == {'quests': 3, 'removed': 1, 'set_down': 1, 'kept': 1, 'shared': 1}

    def test_a_quest_still_on_another_class_they_are_in_stays(self):
        """The shared-quest edge: Biology also carries it, so it is still schoolwork."""
        db, log = _school(), []
        withdraw_student_from_class_quests(_client(db, log), ELEM, AJ)
        assert _rows(db)[Q_SHARED]['is_active'] is True
        assert not [e for e in log if e[0] in ('update', 'delete') and 'uq-shared' in str(e)]

    def test_shared_only_counts_when_they_are_in_its_audience_there(self):
        """Biology kept the quest to another student: it is not AJ's there."""
        db = _school()
        db['class_quests'][-1]['student_ids'] = [KID]
        withdraw_student_from_class_quests(_client(db, []), ELEM, AJ)
        assert Q_SHARED not in _rows(db)

    def test_shared_does_not_count_on_a_class_they_have_left(self):
        db = _school()
        db['class_enrollments'][1]['status'] = 'withdrawn'
        withdraw_student_from_class_quests(_client(db, []), ELEM, AJ)
        assert Q_SHARED not in _rows(db)

    def test_a_quest_the_class_kept_to_others_is_left_alone(self):
        """AJ was never given it by this class, so his enrollment is his own."""
        db = _school()
        withdraw_student_from_class_quests(_client(db, []), ELEM, AJ)
        assert _rows(db)[Q_OTHERS]['is_active'] is True
        assert _rows(db)[Q_OWN]['is_active'] is True

    def test_nothing_on_the_class_writes_nothing(self):
        db, log = _school(class_quests=[]), []
        out = withdraw_student_from_class_quests(_client(db, log), ELEM, AJ)
        assert out == {'quests': 0, 'removed': 0, 'set_down': 0, 'kept': 0, 'shared': 0}
        assert [e for e in log if e[0] != 'select'] == []


@pytest.mark.unit
class TestTheOfficeRemovesOne:
    """(c) the snapshot's Remove."""

    def test_no_enrollment_is_none_and_writes_nothing(self):
        db, log = _school(), []
        before = _copy.deepcopy(db)
        assert remove_quest_for_student(_client(db, log), KID, Q_ELEM) is None
        assert db == before

    def test_off_every_class_an_untouched_one_is_deleted(self):
        db = _school()
        out = remove_quest_for_student(_client(db, []), AJ, Q_ELEM)
        assert out == {'removed': 1, 'set_down': 0, 'kept': 0, 'still_on_classes': []}
        assert Q_ELEM not in _rows(db)

    def test_work_behind_it_is_set_down_never_deleted(self):
        db = _school()
        out = remove_quest_for_student(_client(db, []), AJ, Q_WORKED)
        assert out['set_down'] == 1 and out['removed'] == 0
        assert _rows(db)[Q_WORKED]['status'] == 'set_down'
        assert len(db['quest_task_completions']) == 1

    def test_a_finished_one_is_kept(self):
        db = _school()
        out = remove_quest_for_student(_client(db, []), AJ, Q_DONE)
        assert out['kept'] == 1 and out['removed'] == 0 and out['set_down'] == 0

    def test_still_on_a_live_class_it_is_set_down_so_the_cron_cannot_bring_it_back(self):
        """A deleted row would be re-enrolled by the release sweep; a set-down one is skipped."""
        db = _school()
        out = remove_quest_for_student(_client(db, []), AJ, Q_SHARED)
        assert out == {'removed': 0, 'set_down': 1, 'kept': 0, 'still_on_classes': [HIGH]}
        assert _rows(db)[Q_SHARED]['is_active'] is False
        # The teacher's audience on Biology is not rewritten.
        assert next(r for r in db['class_quests'] if r['class_id'] == HIGH)['student_ids'] is None


@pytest.mark.unit
class TestWhereEachQuestCameFrom:
    """(a) source_class on each active quest."""

    def test_a_live_class_a_left_class_and_their_own(self):
        db = _school()
        out = quest_source_classes(_client(db, []), AJ, [Q_SHARED, Q_ELEM, Q_OWN])
        assert out[Q_SHARED] == {'id': HIGH, 'name': 'Biology', 'enrolled': True}
        # A class they left is still named, so the leftover can be found.
        assert out[Q_ELEM] == {'id': ELEM, 'name': 'Elementary Art', 'enrolled': False}
        # Their own quest has no class: null on the overview ("Personal").
        assert Q_OWN not in out

    def test_a_quest_kept_to_others_is_not_credited_to_that_class(self):
        out = quest_source_classes(_client(_school(), []), AJ, [Q_OTHERS])
        assert out == {}

    def test_nothing_asked_nothing_read(self):
        client = Mock()
        assert quest_source_classes(client, AJ, []) == {}
        client.table.assert_not_called()


@pytest.mark.unit
class TestTheHomePageCarriesIt:
    """/overview reads /api/users/dashboard; every active quest carries source_class."""

    def _svc(self, db):
        from services.dashboard_service import DashboardService
        svc = DashboardService.__new__(DashboardService)
        svc.client = _client(db, [])
        return svc

    def test_each_enrollment_gets_its_class_or_null(self):
        db = _school()
        quests = [{'quest_id': Q_SHARED}, {'quest_id': Q_ELEM}, {'quest_id': Q_OWN}]
        out = self._svc(db)._attach_class_assignment(AJ, quests)
        by = {q['quest_id']: q for q in out}
        assert by[Q_SHARED]['source_class']['name'] == 'Biology'
        assert by[Q_ELEM]['source_class']['enrolled'] is False
        assert 'source_class' in by[Q_OWN] and by[Q_OWN]['source_class'] is None

    def test_a_failed_read_still_sends_null(self):
        db = _school()
        quests = [{'quest_id': Q_OWN}]
        with patch('services.dashboard_service.student_class_assignments',
                   side_effect=RuntimeError('down')):
            out = self._svc(db)._attach_class_assignment(AJ, quests)
        assert out[0]['source_class'] is None


# ── The routes ────────────────────────────────────────────────────────────────

ORG = 'org-icreate'
OFFICE = str(_uuid.uuid4())
TEACHER = str(_uuid.uuid4())


def _users():
    return [
        {'id': OFFICE, 'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': ['org_admin'],
         'organization_id': ORG},
        {'id': TEACHER, 'role': 'org_managed', 'org_role': 'advisor', 'org_roles': ['advisor'],
         'organization_id': ORG},
    ]


def _delete(client, headers, caller, quest_id, db, same_org=True):
    from utils.auth import relationships
    fake = _client(db, [])
    with patch('database.get_supabase_admin_client', return_value=fake), \
         patch('routes.advisor.student_overview.get_supabase_admin_client', return_value=fake), \
         patch.dict(relationships.RELATIONSHIPS, {'org_staff': lambda c, t: same_org}), \
         patch.object(relationships, '_is_platform_staff', return_value=False):
        return client.delete(f'/api/advisor/student-overview/{AJ}/quests/{quest_id}',
                             headers=headers(caller))


def _written(db):
    # Middleware reads other tables through the same fake; only these matter.
    return {k: db[k] for k in ('user_quests', 'user_quest_tasks', 'class_quests')}


@pytest.mark.unit
class TestTheRemoveRoute:

    def test_the_office_removes_a_leftover(self, client, auth_headers_for):
        db = _school(users=_users())
        resp = _delete(client, auth_headers_for, OFFICE, Q_ELEM, db)
        assert resp.status_code == 200, resp.get_json()
        body = resp.get_json()
        assert body == {'success': True, 'removed': 1, 'set_down': 0, 'kept': 0,
                        'still_on_classes': []}
        assert Q_ELEM not in _rows(db)

    def test_still_on_classes_names_the_class(self, client, auth_headers_for):
        db = _school(users=_users())
        body = _delete(client, auth_headers_for, OFFICE, Q_SHARED, db).get_json()
        assert body['still_on_classes'] == [{'id': HIGH, 'name': 'Biology'}]

    def test_a_teacher_is_refused_and_nothing_is_written(self, client, auth_headers_for):
        db = _school(users=_users())
        before = _copy.deepcopy(db)
        resp = _delete(client, auth_headers_for, TEACHER, Q_ELEM, db)
        assert resp.status_code == 403
        assert _written(db) == _written(before)

    def test_another_schools_office_is_refused(self, client, auth_headers_for):
        db = _school(users=_users())
        before = _copy.deepcopy(db)
        resp = _delete(client, auth_headers_for, OFFICE, Q_ELEM, db, same_org=False)
        assert resp.status_code == 403
        assert _written(db) == _written(before)

    def test_a_quest_not_in_their_account_is_404(self, client, auth_headers_for):
        db = _school(users=_users())
        resp = _delete(client, auth_headers_for, OFFICE, '33333333-3333-4333-8333-999999999999', db)
        assert resp.status_code == 404


@pytest.mark.unit
class TestTheDropRouteWithdraws:
    """DELETE /api/sis/classes/<id>/enrollments/<student> calls (b), after the drop."""

    def _drop(self, withdraw):
        import app as _real_app  # noqa: F401 — import graph ordering
        from flask import Flask
        from routes.sis import catalog
        view = catalog.unenroll_student
        while hasattr(view, '__wrapped__'):
            view = view.__wrapped__
        db, log = _school(), []
        db['class_enrollments'][0]['status'] = 'active'
        db['class_enrollments'][0]['id'] = 'ce-1'
        fake = _client(db, log)
        seen = {}

        def _withdraw(admin, class_id, student_id):
            seen['status_then'] = next(
                e['status'] for e in db['class_enrollments'] if e.get('id') == 'ce-1')
            return withdraw(admin, class_id, student_id)

        with Flask(__name__).test_request_context('/x', method='DELETE'), \
             patch.object(catalog.sis_service, 'org_or_error', return_value=('org-1', None)), \
             patch.object(catalog, 'get_supabase_admin_client', return_value=fake), \
             patch.object(catalog, '_load_class', return_value={'id': ELEM}), \
             patch.object(catalog, '_reprice_after_staff_change', return_value=None), \
             patch('services.class_group_sync_service.sync_class_group'), \
             patch('services.sis_waitlist_service.restore_entry_for_withdrawal'), \
             patch('services.sis_waitlist_service.alert_admins_seat_opened'), \
             patch('services.class_quest_enrollment.withdraw_student_from_class_quests',
                   side_effect=_withdraw):
            resp = view('office-1', ELEM, AJ)
        return resp.get_json(), seen

    def test_the_drop_withdraws_and_says_what_it_did(self):
        out = {'quests': 1, 'removed': 1, 'set_down': 0, 'kept': 0, 'shared': 0}
        body, seen = self._drop(lambda *_a: out)
        assert body['success'] is True
        assert body['quests'] == out
        # The enrollment was already withdrawn, so AJ no longer counts as in it.
        assert seen['status_then'] == 'withdrawn'

    def test_a_failed_withdraw_never_fails_the_drop(self):
        def boom(*_a):
            raise RuntimeError('db down')
        body, _ = self._drop(boom)
        assert body['success'] is True
        assert body['quests'] is None


class _OverviewTable:
    """Wraps the audience fake with the few extra calls the overview makes."""

    def __init__(self, inner):
        self.inner, self._single, self._count = inner, False, False

    def select(self, *_a, count=None, **_k):
        self._count = bool(count)
        return self

    def single(self):
        self._single = True
        return self

    def __getattr__(self, name):
        if name in ('gte', 'lt', 'lte', 'neq', 'or_', 'is_', 'order', 'range'):
            return lambda *_a, **_k: self
        if name == 'not_':
            return self
        attr = getattr(self.inner, name)
        if callable(attr):
            def call(*a, **k):
                attr(*a, **k)
                return self
            return call
        return attr

    def execute(self):
        res = self.inner.execute()
        data = res.data
        if self._single:
            return Mock(data=data[0] if data else None)
        return Mock(data=data, count=len(data) if self._count else None)


@pytest.mark.unit
class TestTheOverviewsSendIt:
    """GET /api/advisor/student-overview/<id> and /api/parent/child-overview/<id>: source_class and last_activity_at
    on each active quest, null when the quest is the student's own."""

    @pytest.mark.parametrize('route', ['advisor', 'parent'])
    def test_each_active_quest_names_its_class_or_null(self, route):
        import importlib
        import app as _real_app  # noqa: F401 — import graph ordering
        from flask import Flask
        from tests.test_class_quest_audience import _Table
        so = importlib.import_module('routes.advisor.student_overview' if route == 'advisor'
                                     else 'routes.parent.child_overview')

        db = _school(
            users=[{'id': AJ, 'first_name': 'AJ', 'last_name': 'R', 'total_xp': 0,
                    'created_at': '2026-01-01T00:00:00Z'}],
            user_quests=[
                {**_uq(Q_SHARED, 'uq-shared'), 'quests': {'id': Q_SHARED, 'title': 'Cells'}},
                {**_uq(Q_ELEM, 'uq-elem'), 'quests': {'id': Q_ELEM, 'title': 'Finger paint'}},
                {**_uq(Q_OWN, 'uq-own'), 'quests': {'id': Q_OWN, 'title': 'My robot'}},
            ],
            # Two tasks, one done: the parent overview hides a quest whose
            # tasks are all done, and this one is still in progress.
            user_quest_tasks=[{'id': 't-1', 'user_id': AJ, 'quest_id': Q_SHARED,
                               'user_quest_id': 'uq-shared'},
                              {'id': 't-2', 'user_id': AJ, 'quest_id': Q_SHARED,
                               'user_quest_id': 'uq-shared'}],
            quest_task_completions=[{'id': 'c-1', 'user_id': AJ, 'quest_id': Q_SHARED,
                                     'task_id': 't-1', 'user_quest_task_id': 't-1',
                                     'completed_at': '2026-09-30T10:00:00Z'}],
        )
        fake = Mock()
        fake.table.side_effect = lambda name: _OverviewTable(_Table(db, name, []))
        view = so.get_student_overview if route == 'advisor' else so.get_child_overview
        while hasattr(view, '__wrapped__'):
            view = view.__wrapped__
        with Flask(__name__).test_request_context('/x'), \
             patch.object(so, 'get_supabase_admin_client', return_value=fake), \
             patch.object(so, 'verify_advisor_access', return_value=True, create=True), \
             patch.object(so.AccessLogger, 'log_student_data_access', return_value=True), \
             patch.object(so, 'calculate_subject_xp_from_tasks', return_value={}, create=True), \
             patch('services.portfolio_service.PortfolioService') as portfolio:
            portfolio.return_value.get_transfer_credits.return_value = None
            portfolio.return_value.get_visibility_status.return_value = {}
            resp = view('office-1', AJ)
        body, status = resp if isinstance(resp, tuple) else (resp, 200)
        assert status == 200, body.get_json()
        quests = {q['quest_id']: q for q in body.get_json()['dashboard']['active_quests']}
        assert quests[Q_SHARED]['source_class'] == {'id': HIGH, 'name': 'Biology', 'enrolled': True}
        assert quests[Q_ELEM]['source_class'] == {'id': ELEM, 'name': 'Elementary Art',
                                                  'enrolled': False}
        assert 'source_class' in quests[Q_OWN] and quests[Q_OWN]['source_class'] is None
        # Newest completion, else when they started.
        assert quests[Q_SHARED]['last_activity_at'] == '2026-09-30T10:00:00Z'
        assert quests[Q_OWN]['last_activity_at'] == '2026-09-01T00:00:00Z'
