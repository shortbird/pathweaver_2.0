"""A school may hold task XP, and keep the work off the portfolio, until a
teacher accepts it in SIS Submissions.

Ticket 536a3018, Jackie Hill (Arete Academy org admin): "Can you also make it
so the evidence submissions are not on their portfolios until I approve it?
And also have the xp not be awarded until it's approved?"

The switch is feature_flags.sis_settings.require_teacher_acceptance and only
a stored True turns it on. Every test here runs in both directions: with the
switch off (or for a platform student) the behaviour is pinned to what it was
before, and with it on the XP waits for the accept.
"""

import copy
import itertools
from unittest.mock import MagicMock, Mock, patch

import pytest
from flask import Flask

import app  # noqa: F401 -- import graph ordering
from services import teacher_acceptance as ta
from services.teacher_acceptance import REQUIRE_TEACHER_ACCEPTANCE_KEY as KEY

ORG = 'org-arete'
STUDENT = 'test-user-123'   # the id conftest's mock_verify_token signs in as
TEACHER = 'teacher-1'
TASK = 'task-1'
QUEST = 'quest-1'
ON = {'sis_settings': {KEY: True}}
OFF = {'sis_settings': {KEY: False}}


# ── an in-memory PostgREST-style client ──────────────────────────────────────

class _Result:
    def __init__(self, data):
        self.data = data


_ids = itertools.count(1)


class _Query:
    def __init__(self, store, table):
        self._store, self._table = store, table
        self._filters = []
        self._negate = False
        self._op = ('select', None)
        self._single = False
        self._limit = None

    # builders
    def select(self, *_a, **_k):
        return self

    def update(self, values):
        self._op = ('update', values)
        return self

    def insert(self, values):
        self._op = ('insert', values)
        return self

    def upsert(self, values, on_conflict=None):
        self._op = ('upsert', (values, on_conflict))
        return self

    def delete(self):
        self._op = ('delete', None)
        return self

    @property
    def not_(self):
        self._negate = True
        return self

    def _add(self, test):
        negate, self._negate = self._negate, False
        self._filters.append((lambda r: not test(r)) if negate else test)
        return self

    def eq(self, col, val):
        return self._add(lambda r: r.get(col) == val)

    def in_(self, col, vals):
        vals = list(vals)
        return self._add(lambda r: r.get(col) in vals)

    def is_(self, col, val):
        assert val == 'null'
        return self._add(lambda r: r.get(col) is None)

    def order(self, *_a, **_k):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def range(self, *_a):
        return self

    def single(self):
        self._single = True
        return self

    def execute(self):
        rows = self._store.setdefault(self._table, [])
        kind, arg = self._op
        if kind == 'insert':
            new = [dict(r) for r in (arg if isinstance(arg, list) else [arg])]
            for r in new:
                r.setdefault('id', f'{self._table}-{next(_ids)}')
            rows.extend(new)
            return _Result(copy.deepcopy(new))
        if kind == 'upsert':
            values, key = arg
            out = []
            for v in (values if isinstance(values, list) else [values]):
                hit = next((r for r in rows if key and r.get(key) == v.get(key)), None)
                if hit:
                    hit.update(v)
                else:
                    hit = dict(v)
                    hit.setdefault('id', f'{self._table}-{next(_ids)}')
                    rows.append(hit)
                out.append(copy.deepcopy(hit))
            return _Result(out)
        matched = [r for r in rows if all(f(r) for f in self._filters)]
        if kind == 'update':
            for r in matched:
                r.update(arg)
            return _Result(copy.deepcopy(matched))
        if kind == 'delete':
            for r in matched:
                rows.remove(r)
            return _Result(copy.deepcopy(matched))
        if self._limit is not None:
            matched = matched[:self._limit]
        if self._single:
            return _Result(copy.deepcopy(matched[0]) if matched else None)
        return _Result(copy.deepcopy(matched))


class Store:
    def __init__(self, tables):
        self.tables = tables

    def table(self, name):
        return _Query(self.tables, name)

    def rows(self, name):
        return self.tables.setdefault(name, [])


def _world(org=ORG, held=False, released=False, xp=50):
    return Store({
        'users': [{'id': STUDENT, 'organization_id': org, 'total_xp': 500},
                  {'id': TEACHER, 'organization_id': ORG}],
        'user_quest_tasks': [{'id': TASK, 'quest_id': QUEST, 'title': 'Build a bridge',
                              'pillar': 'stem', 'xp_value': xp, 'user_id': STUDENT}],
        'user_skill_xp': [{'id': 's1', 'user_id': STUDENT, 'pillar': 'stem', 'xp_amount': 200}],
        'quest_task_completions': [{
            'id': 'comp-1', 'user_id': STUDENT, 'quest_id': QUEST, 'task_id': TASK,
            'user_quest_task_id': TASK, 'completed_at': '2026-10-16T10:00:00Z',
            'diploma_status': 'none', 'revision_number': 1,
            'xp_held_at': '2026-10-16T10:00:00Z' if held else None,
            'xp_released_at': '2026-10-16T11:00:00Z' if released else None,
        }],
        'sis_submission_reviews': [],
    })


def _flags(flags):
    return patch('modules.enabled.org_flags', return_value=flags)


def _completion(store):
    return store.rows('quest_task_completions')[0]


# ── the setting ──────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestTheSetting:

    @pytest.mark.parametrize('flags,expected', [
        (ON, True), (OFF, False), ({'sis_settings': {KEY: 'yes'}}, False),
        ({'sis_settings': {KEY: 1}}, False), ({}, False), (None, False),
    ])
    def test_only_a_stored_true_turns_it_on(self, flags, expected):
        assert ta.requires_teacher_acceptance(flags) is expected

    def test_a_school_with_submissions_off_never_holds(self):
        """Held work needs a screen where a teacher accepts it."""
        flags = {'sis_settings': {KEY: True}, 'modules': {'submissions': False}}
        with _flags(flags):
            assert ta.org_requires_acceptance(ORG) is False
        with _flags(ON):
            assert ta.org_requires_acceptance(ORG) is True

    def test_a_platform_student_is_never_held(self):
        """No organization, no school switch: never held, whatever any org says."""
        store = _world(org=None)
        with _flags(ON):
            assert ta.student_requires_acceptance(store, STUDENT) is False

    def test_an_org_student_follows_the_school_switch(self):
        store = _world()
        with _flags(ON):
            assert ta.student_requires_acceptance(store, STUDENT) is True
        with _flags(OFF):
            assert ta.student_requires_acceptance(store, STUDENT) is False


from tests.test_sis_settings_patch import ADMIN_ROW, _caller_client  # noqa: E402


@pytest.mark.unit
class TestTheSettingsWrite:

    def _patch(self, client, auth_headers, body, stored=None):
        repo = Mock()
        repo.find_by_id.return_value = {'id': 'org-1', 'feature_flags': stored or
                                        {'sis_settings': {'rooms': [{'name': 'Kitchen'}]}}}
        repo.update_organization.side_effect = lambda org_id, data: {'id': org_id, **data}
        with patch('database.get_supabase_admin_client', return_value=_caller_client(ADMIN_ROW)), \
             patch('services.sis_service.get_user_org_context',
                   return_value={'role': 'org_admin', 'organization_id': 'org-1'}), \
             patch('services.sis_service.resolve_org_id', return_value='org-1'), \
             patch('services.sis_service.caller_sees_pay', return_value=True), \
             patch('modules.gate.module_enabled', return_value=True), \
             patch('repositories.organization_repository.OrganizationRepository', return_value=repo):
            resp = client.patch('/api/sis/settings?organization_id=org-1', headers=auth_headers, json=body)
        return resp, repo

    @pytest.mark.parametrize('value', [True, False])
    def test_an_admin_turns_it_on_and_off(self, client, auth_headers, mock_verify_token, value):
        resp, repo = self._patch(client, auth_headers, {'sis_settings': {KEY: value}})
        assert resp.status_code == 200, resp.get_json()
        written = repo.update_organization.call_args[0][1]['feature_flags']['sis_settings']
        assert written[KEY] is value
        assert written['rooms'] == [{'name': 'Kitchen'}]

    @pytest.mark.parametrize('value', ['yes', 1, 'true', {'on': True}])
    def test_a_value_that_is_not_on_or_off_is_refused(self, client, auth_headers,
                                                      mock_verify_token, value):
        resp, repo = self._patch(client, auth_headers, {'sis_settings': {KEY: value}})
        assert resp.status_code == 400
        assert resp.get_json()['fields'] == ['sis_settings.' + KEY]
        repo.update_organization.assert_not_called()


# ── award site 1: POST /api/tasks/<id>/complete ──────────────────────────────

def _innermost(view):
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    return view


def _complete_task(store, flags, hold_ok=True):
    """Drive routes/tasks/completion.complete_task to its response."""
    from repositories.task_repository import TaskCompletionRepository, TaskRepository
    from routes.tasks import completion as route

    store.rows('quest_task_completions').clear()

    def create_completion(_self, payload):
        return _Query(store.tables, 'quest_task_completions').insert(payload).execute().data[0]

    xp = MagicMock()
    xp.award_xp.return_value = True
    hold = ta.hold_completion if hold_ok else (lambda *_a: False)
    with Flask(__name__).test_request_context(
            f'/api/tasks/{TASK}/complete', method='POST',
            data={'evidence_type': 'text', 'text_content': 'I built it'}), \
         patch.object(route, 'get_supabase_admin_client', return_value=store), \
         patch.object(route, 'xp_service', xp), \
         patch.object(route, 'WebhookService'), \
         patch.object(TaskRepository, 'get_task_with_relations',
                      return_value={'quest_id': QUEST, 'approval_status': 'approved',
                                    'xp_value': 50, 'pillar': 'stem', 'title': 'Build a bridge'}), \
         patch.object(TaskCompletionRepository, 'check_existing_completion', return_value=False), \
         patch.object(TaskCompletionRepository, 'create_completion', create_completion), \
         patch('utils.treehouse.is_treehouse_member', return_value=False), \
         patch('services.teacher_acceptance.hold_completion', hold), \
         _flags(flags):
        resp = _innermost(route.complete_task)(STUDENT, TASK)
    response, status = resp if isinstance(resp, tuple) else (resp, 200)
    return response.get_json()['data'], status, xp


@pytest.mark.unit
class TestTaskCompleteRoute:

    def test_switch_off_awards_at_completion_exactly_as_before(self):
        store = _world()
        data, status, xp = _complete_task(store, OFF)
        assert status == 200
        xp.award_xp.assert_called_once_with(STUDENT, 'stem', 50, f'task_completion:{TASK}')
        assert data['xp_awarded'] == 50
        assert data['message'] == 'Task completed! Earned 50 XP'
        assert 'xp_pending_review' not in data
        assert _completion(store).get('xp_held_at') is None

    def test_platform_student_awards_even_if_an_org_says_on(self):
        store = _world(org=None)
        data, _, xp = _complete_task(store, ON)
        xp.award_xp.assert_called_once()
        assert data['xp_awarded'] == 50

    def test_switch_on_holds_the_xp(self):
        store = _world()
        data, status, xp = _complete_task(store, ON)
        assert status == 200
        xp.award_xp.assert_not_called()
        assert data['xp_awarded'] == 0
        assert data['xp_pending_review'] is True
        assert data['message'] == 'Sent to your teacher. You get the XP when they accept it.'
        assert _completion(store)['xp_held_at']

    def test_a_hold_that_cannot_be_written_awards_as_before(self):
        """No marker, no skip: XP never disappears without something an
        accept could find."""
        store = _world()
        data, _, xp = _complete_task(store, ON, hold_ok=False)
        xp.award_xp.assert_called_once_with(STUDENT, 'stem', 50, f'task_completion:{TASK}')
        assert data['xp_awarded'] == 50
        assert 'xp_pending_review' not in data


# ── award site 2: POST /api/evidence/documents/<id> {status: completed} ─────

def _evidence_world(org=ORG):
    store = _world(org=org)
    store.rows('quest_task_completions').clear()
    store.tables.update({
        'user_quests': [{'id': 'uq-1', 'user_id': STUDENT, 'quest_id': QUEST}],
        'user_task_evidence_documents': [{'id': 'doc-1', 'user_id': STUDENT, 'task_id': TASK}],
        'evidence_document_blocks': [],
    })
    return store


def _save(client, store, flags, status='completed'):
    xp = MagicMock()
    xp.calculate_task_xp.return_value = 50
    xp.award_xp.return_value = True
    with patch('routes.evidence_documents.get_supabase_admin_client', return_value=store), \
         patch('routes.evidence_documents.update_document_blocks'), \
         patch('routes.evidence_documents.check_quest_completion', return_value=False), \
         patch('services.credit_ai_review.trigger.evidence_changed'), \
         patch('routes.evidence_documents.xp_service', xp), \
         _flags(flags):
        resp = client.post(f'/api/evidence/documents/{TASK}',
                           json={'blocks': [{'type': 'text', 'content': {'text': 'my work'}}],
                                 'status': status},
                           headers={'Authorization': 'Bearer t'})
    return resp, xp


@pytest.mark.unit
class TestEvidenceSaveRoute:

    def test_switch_off_awards_at_completion_exactly_as_before(self, client, mock_verify_token):
        store = _evidence_world()
        resp, xp = _save(client, store, OFF)
        body = resp.get_json()
        assert resp.status_code == 200, body
        xp.award_xp.assert_called_once_with(STUDENT, 'stem', 50, f'task_completion:{TASK}')
        assert body['xp_awarded'] == 50
        assert body['message'] == 'Evidence document saved successfully'
        assert 'xp_pending_review' not in body
        assert _completion(store).get('xp_held_at') is None

    def test_switch_on_holds_the_xp(self, client, mock_verify_token):
        store = _evidence_world()
        resp, xp = _save(client, store, ON)
        body = resp.get_json()
        assert resp.status_code == 200, body
        xp.award_xp.assert_not_called()
        assert body['xp_awarded'] == 0
        assert body['xp_pending_review'] is True
        assert _completion(store)['xp_held_at']

    def test_platform_student_is_never_held(self, client, mock_verify_token):
        store = _evidence_world(org=None)
        resp, xp = _save(client, store, ON)
        xp.award_xp.assert_called_once()
        assert resp.get_json()['xp_awarded'] == 50


# ── award site 3: process_evidence_completion (no completion row) ────────────

@pytest.mark.unit
class TestProcessEvidenceCompletion:
    """The legacy path writes no quest_task_completions row, so a hold has
    nothing to stamp. At a school that holds XP it awards nothing."""

    def _run(self, flags):
        from routes import evidence_documents as route
        store = _evidence_world()
        # The path inserts into user_quest_tasks keyed on quest_task_id.
        store.rows('user_quests')[0]['is_active'] = True
        xp = MagicMock()
        xp.calculate_task_xp.return_value = 50
        with patch.object(route, 'get_supabase_admin_client', return_value=store), \
             patch.object(route, 'update_document_blocks'), \
             patch.object(route, 'check_quest_completion', return_value=False), \
             patch.object(route, 'xp_service', xp), \
             _flags(flags):
            result = route.process_evidence_completion(STUDENT, TASK, [], 'completed')
        return result, xp

    def test_switch_off_awards_as_before(self):
        result, xp = self._run(OFF)
        xp.award_xp.assert_called_once_with(STUDENT, 'stem', 50, f'task_completion:{TASK}')
        assert result['xp_awarded'] == 50 and 'xp_pending_review' not in result

    def test_switch_on_awards_nothing(self):
        result, xp = self._run(ON)
        xp.award_xp.assert_not_called()
        assert result['xp_awarded'] == 0 and result['xp_pending_review'] is True


# ── accept, bulk accept, grow this, un-review ────────────────────────────────

def _review(store, flags, body, cid='comp-1'):
    from routes.sis import submissions
    xp = MagicMock()
    xp.award_xp.return_value = True
    completion = next(c for c in store.rows('quest_task_completions') if c['id'] == cid)
    users = MagicMock()
    users.return_value.find_by_id.return_value = {'id': TEACHER, 'role': 'org_managed',
                                                  'org_role': 'advisor', 'org_roles': ['advisor']}
    with Flask(__name__).test_request_context('/', method='POST', json=body), \
         patch.object(submissions, 'get_supabase_admin_client', return_value=store), \
         patch.object(submissions.sis_service, 'org_or_error', return_value=(ORG, None)), \
         patch.object(submissions, '_completion_in_scope', return_value=(completion, None)), \
         patch.object(submissions, '_notify_reviewed'), \
         patch('repositories.user_repository.UserRepository', users), \
         patch('services.xp_service.XPService', return_value=xp), \
         _flags(flags):
        resp = submissions.review_submission.__wrapped__(TEACHER, cid)
    response, status = resp if isinstance(resp, tuple) else (resp, 200)
    return response.get_json(), status, xp


def _unreview(store, flags, cid='comp-1'):
    from routes.sis import submissions
    completion = next(c for c in store.rows('quest_task_completions') if c['id'] == cid)
    with Flask(__name__).test_request_context('/', method='DELETE'), \
         patch.object(submissions, 'get_supabase_admin_client', return_value=store), \
         patch.object(submissions.sis_service, 'org_or_error', return_value=(ORG, None)), \
         patch.object(submissions, '_completion_in_scope', return_value=(completion, None)), \
         _flags(flags):
        resp = submissions.unreview_submission.__wrapped__(TEACHER, cid)
    response, status = resp if isinstance(resp, tuple) else (resp, 200)
    return response.get_json(), status


def _skill(store):
    return store.rows('user_skill_xp')[0]['xp_amount']


def _total(store):
    return next(u for u in store.rows('users') if u['id'] == STUDENT)['total_xp']


@pytest.mark.unit
class TestAccept:

    def test_accept_awards_the_held_xp_once(self):
        store = _world(held=True)
        body, status, xp = _review(store, ON, {'action': 'accepted'})
        assert status == 201 and body['xp_awarded'] == 50
        xp.award_xp.assert_called_once_with(STUDENT, 'stem', 50, f'task_completion:{TASK}')
        assert _completion(store)['xp_held_at'] is None
        assert _completion(store)['xp_released_at']

        body, _, xp_again = _review(store, ON, {'action': 'accepted'})
        assert body['xp_awarded'] == 0
        xp_again.award_xp.assert_not_called()

    def test_accept_of_work_that_was_never_held_awards_nothing(self):
        """Work finished before the school turned this on, or at a school
        without it: XP came at completion, so the accept adds none."""
        for flags in (ON, OFF):
            store = _world(held=False)
            body, status, xp = _review(store, flags, {'action': 'accepted'})
            assert status == 201 and body['xp_awarded'] == 0
            xp.award_xp.assert_not_called()

    def test_a_failed_award_leaves_the_work_held_for_the_next_accept(self):
        store = _world(held=True)
        from routes.sis import submissions  # noqa: F401
        with patch.object(ta, 'award_task_completion_xp', return_value=False):
            body, _, _ = _review(store, ON, {'action': 'accepted'})
        assert body['xp_awarded'] == 0
        assert _completion(store)['xp_held_at']
        assert _completion(store)['xp_released_at'] is None

    def test_bulk_accept_awards_each_held_submission_once(self):
        from routes.sis import submissions
        store = _world(held=True)
        store.rows('quest_task_completions').append({
            **_completion(store), 'id': 'comp-2', 'xp_held_at': None})  # never held
        xp = MagicMock()
        xp.award_xp.return_value = True
        with Flask(__name__).test_request_context(
                '/', method='POST', json={'completion_ids': ['comp-1', 'comp-2']}), \
             patch.object(submissions, 'get_supabase_admin_client', return_value=store), \
             patch.object(submissions.sis_service, 'org_or_error', return_value=(ORG, None)), \
             patch.object(submissions, '_scope_test', return_value=lambda c: True), \
             patch.object(submissions, '_notify_reviewed'), \
             patch('services.xp_service.XPService', return_value=xp), \
             _flags(ON):
            resp = submissions.bulk_review_submissions.__wrapped__(TEACHER)
        body = resp[0].get_json()
        assert sorted(body['reviewed']) == ['comp-1', 'comp-2']
        xp.award_xp.assert_called_once_with(STUDENT, 'stem', 50, f'task_completion:{TASK}')
        assert _completion(store)['xp_held_at'] is None


@pytest.mark.unit
class TestGrowThisAndUnreview:

    def test_grow_this_on_held_work_keeps_it_held_and_awards_nothing(self):
        store = _world(held=True)
        body, status, xp = _review(store, ON, {'action': 'grow_this', 'feedback': 'Add a photo.'})
        assert status == 201
        xp.award_xp.assert_not_called()
        assert _completion(store)['xp_held_at']
        assert _skill(store) == 200 and _total(store) == 500

    def test_unreview_after_accept_reverses_and_holds_again(self):
        store = _world(held=True)
        _review(store, ON, {'action': 'accepted'})
        # The award itself is mocked; the aggregates show the reversal.
        body, status = _unreview(store, ON)
        assert status == 200 and body['success'] is True
        assert _completion(store)['xp_held_at']
        assert _completion(store)['xp_released_at'] is None
        assert _skill(store) == 150 and _total(store) == 450
        # A second un-review takes nothing more.
        _unreview(store, ON)
        assert _skill(store) == 150 and _total(store) == 450

    def test_grow_this_after_accept_reverses_and_holds_again(self):
        store = _world(released=True)
        _review(store, ON, {'action': 'grow_this', 'feedback': 'One more step.'})
        assert _completion(store)['xp_held_at']
        assert _skill(store) == 150 and _total(store) == 450

    def test_unreview_of_work_never_held_takes_nothing_back(self):
        """Work accepted before the school turned this on keeps its XP: the
        settings card promises that."""
        store = _world()
        _unreview(store, ON)
        assert _completion(store)['xp_held_at'] is None
        assert _skill(store) == 200 and _total(store) == 500

    def test_switch_off_unreview_is_unchanged(self):
        store = _world(released=True)
        _unreview(store, OFF)
        assert _completion(store)['xp_held_at'] is None
        assert _skill(store) == 200 and _total(store) == 500


# ── resubmission after Grow This ─────────────────────────────────────────────

@pytest.mark.unit
class TestResubmission:

    def _sent_back(self, action='grow_this'):
        store = _world(held=True)
        store.rows('sis_submission_reviews').append(
            {'id': 'r1', 'completion_id': 'comp-1', 'action': action, 'organization_id': ORG})
        return store

    def test_saving_again_returns_sent_back_work_to_new(self):
        store = self._sent_back()
        with _flags(ON):
            assert ta.reopen_sent_back_review(store, STUDENT, TASK) is True
        assert store.rows('sis_submission_reviews') == []

    def test_switch_off_leaves_the_review_alone(self):
        store = self._sent_back()
        with _flags(OFF):
            assert ta.reopen_sent_back_review(store, STUDENT, TASK) is False
        assert len(store.rows('sis_submission_reviews')) == 1

    def test_an_accepted_review_is_not_reopened(self):
        store = self._sent_back('accepted')
        with _flags(ON):
            assert ta.reopen_sent_back_review(store, STUDENT, TASK) is False
        assert len(store.rows('sis_submission_reviews')) == 1

    def test_the_save_route_reopens_it(self, client, mock_verify_token):
        store = _evidence_world()
        store.rows('quest_task_completions').append(copy.deepcopy(_world(held=True).rows(
            'quest_task_completions')[0]))
        store.rows('sis_submission_reviews').append(
            {'id': 'r1', 'completion_id': 'comp-1', 'action': 'grow_this', 'organization_id': ORG})
        resp, xp = _save(client, store, ON, status='draft')
        assert resp.status_code == 200
        assert store.rows('sis_submission_reviews') == []
        xp.award_xp.assert_not_called()


# ── the inbox reviews every student's work when the switch is on ─────────────

@pytest.mark.unit
class TestInboxScope:

    @pytest.mark.parametrize('individual,flags,expected', [
        (False, OFF, None), (False, ON, {'s1'}), (True, OFF, {'s1'}), (True, ON, {'s1'}),
    ])
    def test_held_work_always_has_a_reviewer(self, individual, flags, expected):
        from routes.sis import submissions
        with patch('modules.enabled.module_enabled', return_value=individual), \
             patch.object(submissions.sis_service, 'current_student_ids', return_value={'s1'}), \
             _flags(flags):
            assert submissions._school_students(ORG) == expected


# ── the portfolio and the diploma ────────────────────────────────────────────

def _portfolio_world(held):
    store = _world(held=held)
    store.rows('quest_task_completions')[0].update({
        'in_portfolio': True, 'evidence_text': 'I built it', 'is_confidential': False,
        'user_quest_tasks': {'title': 'Build a bridge', 'pillar': 'stem', 'quest_id': QUEST,
                             'user_quest_id': 'uq-1', 'xp_value': 50},
    })
    store.tables['user_task_evidence_documents'] = [
        {'id': 'doc-1', 'user_id': STUDENT, 'task_id': TASK, 'evidence_document_blocks': []}]
    return store


@pytest.mark.unit
class TestPortfolio:

    @pytest.mark.parametrize('held', [True, False])
    def test_held_work_is_off_the_portfolio_until_accepted(self, held):
        from services.portfolio_service import PortfolioService
        service = PortfolioService(client=_portfolio_world(held))
        shown = 0 if held else 1
        assert len(service.get_task_completions(STUDENT)) == shown
        assert len(service.get_evidence_documents(STUDENT)) == shown
        assert len(service.get_curated_completions(STUDENT)) == shown

    def test_accepting_puts_it_on_the_portfolio(self):
        from services.portfolio_service import PortfolioService
        store = _portfolio_world(held=True)
        service = PortfolioService(client=store)
        assert service.get_task_completions(STUDENT) == []
        with patch('services.xp_service.XPService'):
            ta.release_held_xp(store, 'comp-1')
        assert len(service.get_task_completions(STUDENT)) == 1

    @pytest.mark.parametrize('held,total', [(True, 30), (False, 80)])
    def test_diploma_total_xp_leaves_out_held_work(self, held, total):
        """GET /diploma/<user_id> and /api/portfolio/public/<slug> both call
        get_diploma_data."""
        from services.portfolio_service import PortfolioService
        store = _portfolio_world(held)
        service = PortfolioService(client=store)
        approved = [{'id': TASK, 'pillar': 'stem', 'xp_value': 50, 'quest_id': QUEST},
                    {'id': 'task-2', 'pillar': 'art', 'xp_value': 30, 'quest_id': QUEST}]
        with patch.object(service, 'get_user_basic_info', return_value={'id': STUDENT}), \
             patch.object(service, 'get_diploma_by_user_id', return_value={'is_public': True}), \
             patch.object(service, 'get_completed_quests', return_value=[]), \
             patch.object(service, 'get_in_progress_quests', return_value=[]), \
             patch.object(service, 'get_approved_tasks', return_value=approved), \
             patch.object(service, 'get_subject_xp', return_value=[{'school_subject': 'x'}]), \
             patch.object(service, 'get_transfer_credits', return_value=None), \
             patch.object(service, '_prior_learning', return_value=[]):
            data = service.get_diploma_data(STUDENT)
        assert data['total_xp'] == total
        assert len(data['curated']) == (0 if held else 1)


# ── XP reconciliation ────────────────────────────────────────────────────────

@pytest.mark.unit
class TestReconciliation:

    @pytest.mark.parametrize('held,expected', [(True, 0), (False, 50)])
    def test_held_xp_is_not_owed(self, held, expected):
        """A reconcile must not award what a school is holding."""
        from routes.admin.xp_reconciliation import calculate_expected_xp
        store = _world(held=held)
        store.rows('quest_task_completions')[0]['user_quest_tasks'] = {'pillar': 'stem', 'xp_value': 50}
        assert calculate_expected_xp(store, STUDENT)['stem'] == expected


# ── requesting diploma credit on held work ───────────────────────────────────

@pytest.mark.unit
class TestCreditRequest:

    def _request(self, store):
        from routes.tasks import credit
        with Flask(__name__).test_request_context(f'/api/tasks/{TASK}/request-credit', method='POST'), \
             patch.object(credit, 'get_supabase_admin_client', return_value=store):
            resp = _innermost(credit.request_diploma_credit)(STUDENT, TASK)
        response, status = resp if isinstance(resp, tuple) else (resp, 200)
        return response.get_json(), status

    def test_held_work_cannot_request_credit_yet(self):
        body, status = self._request(_world(held=True))
        assert status == 400
        assert body['error']['code'] == 'AWAITING_TEACHER_ACCEPTANCE'
        assert 'has not accepted this work yet' in body['error']['message']

    def test_work_that_is_not_held_gets_past_the_check(self):
        """Pinned through the next check in line: approved work answers
        ALREADY_APPROVED, so the hold check let it through."""
        store = _world(held=False)
        _completion(store)['diploma_status'] = 'approved'
        body, status = self._request(store)
        assert status == 400 and body['error']['code'] == 'ALREADY_APPROVED'


# ── quest deletion and a parent's un-complete do not reverse held XP ─────────

@pytest.mark.unit
class TestReversalSkipsHeldWork:

    @pytest.mark.parametrize('held,skill', [(True, 200), (False, 150)])
    def test_quest_delete(self, held, skill):
        from utils.xp_reversal import reverse_quest_xp
        store = _world(held=held)
        reverse_quest_xp(store, QUEST)
        assert _skill(store) == skill


# ── one sentence on every surface ────────────────────────────────────────────

def test_the_apps_show_the_sentence_the_backend_sends():
    """shared/xpReview.ts is the apps' copy; it must match the backend's."""
    from pathlib import Path
    shared = Path(__file__).resolve().parents[2] / 'shared' / 'xpReview.ts'
    assert f"'{ta.PENDING_REVIEW_MESSAGE}'" in shared.read_text(encoding='utf-8')


# ── a teacher changes the XP of held work before accepting it ────────────────

@pytest.mark.unit
class TestXpAdjustOnHeldWork:
    """The accept awards the task's value at that moment, so an adjustment
    before the accept must not also move the totals, or the XP counts twice."""

    @pytest.mark.parametrize('held,skill', [(True, 200), (False, 230)])
    def test_only_awarded_xp_moves_the_totals(self, held, skill):
        from services.xp_adjustment_service import adjust_task_xp
        store = _world(held=held)
        task = dict(store.rows('user_quest_tasks')[0])
        with patch('services.xp_service.XPService'):
            adjust_task_xp(store, task=task, student_id=STUDENT, new_xp=80, adjusted_by=TEACHER,
                           reason='More work than it looked', min_xp=0, xp_held=held)
        assert store.rows('user_quest_tasks')[0]['xp_value'] == 80
        assert _skill(store) == skill

    def test_the_accept_then_awards_the_adjusted_value(self):
        store = _world(held=True)
        store.rows('user_quest_tasks')[0]['xp_value'] = 80
        xp = MagicMock()
        xp.award_xp.return_value = True
        assert ta.release_held_xp(store, 'comp-1', xp_service=xp) == 80
        xp.award_xp.assert_called_once_with(STUDENT, 'stem', 80, f'task_completion:{TASK}')
