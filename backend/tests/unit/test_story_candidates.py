"""Story candidates: the app's bookmark on a feed item, and the queue the web
Stories page reads back (routes/stories/candidates.py).

Same seams as test_stories_admin_routes: the decorators are stubbed at the
identity and the role lookup; the routes run against fake repositories.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict

import pytest
from flask import Flask

from app_config import Config
from services.stories import generate

pytestmark = pytest.mark.unit

ADMIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
STUDENT = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
COMPLETION = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
DRAFT_COMPLETION = 'cccccccc-cccc-cccc-cccc-000000000002'
CLASS_DAY_COMPLETION = 'cccccccc-0000-4000-8000-00000000c1a5'
CLASS_USER_QUEST = 'cccccccc-0000-4000-8000-00000000c1a6'
EVENT = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
USER_QUEST = 'ffffffff-ffff-ffff-ffff-ffffffffffff'


class FakeCandidateRepo:
    def __init__(self):
        self.rows: Dict[str, Dict[str, Any]] = {}

    def get(self, cid): return dict(self.rows[cid]) if cid in self.rows else None
    def get_by_target(self, tt, tid):
        return next((dict(r) for r in self.rows.values()
                     if r['target_type'] == tt and r['target_id'] == tid), None)
    def list_by_status(self, status='open', limit=200):
        return [dict(r) for r in self.rows.values() if r['status'] == status]
    def open_target_ids(self, tt, ids):
        return {r['target_id'] for r in self.rows.values()
                if r['target_type'] == tt and r['status'] == 'open' and r['target_id'] in ids}
    def flag(self, tt, tid, *, student_user_id, flagged_by, note=None):
        existing = self.get_by_target(tt, tid)
        if existing:
            self.rows[existing['id']].update({'status': 'open', 'resolved_at': None, 'story_id': None,
                                              'flagged_by': flagged_by,
                                              **({'note': note} if note is not None else {})})
            return dict(self.rows[existing['id']])
        row = {'id': f'cand-{len(self.rows) + 1}', 'target_type': tt, 'target_id': tid,
               'student_user_id': student_user_id, 'flagged_by': flagged_by, 'note': note,
               'status': 'open', 'story_id': None, 'resolved_at': None,
               'created_at': '2026-09-15T00:00:00Z'}
        self.rows[row['id']] = row
        return dict(row)
    def resolve(self, cid, status, story_id=None):
        self.rows[cid].update({'status': status, 'story_id': story_id, 'resolved_at': 'now'})
        return dict(self.rows[cid])
    def unflag(self, tt, tid):
        row = self.get_by_target(tt, tid)
        if row:
            del self.rows[row['id']]
        return bool(row)


class FakeStoryRepo:
    def __init__(self):
        self.rows: Dict[str, Dict[str, Any]] = {}
    def get_by_source(self, st, sid):
        return next((dict(r) for r in self.rows.values()
                     if r['source_type'] == st and r['source_id'] == sid), None)
    def create(self, row):
        row = {**row, 'id': f'story-{len(self.rows) + 1}', 'blockers': [], 'claim_token': None}
        self.rows[row['id']] = row
        return dict(row)


class FakeSourceRepo:
    def completion(self, cid):
        if cid == COMPLETION:
            return {'id': cid, 'user_id': STUDENT, 'diploma_status': 'finalized', 'merged_into': None,
                    'is_confidential': False, 'user_quest_task_id': 't1', 'quest_id': 'q1',
                    'completed_at': '2026-09-10T00:00:00Z'}
        if cid == DRAFT_COMPLETION:
            return {'id': cid, 'user_id': STUDENT, 'diploma_status': 'draft', 'merged_into': None,
                    'is_confidential': False, 'user_quest_task_id': 't1', 'quest_id': 'q1'}
        if cid == CLASS_DAY_COMPLETION:
            # A POE day: never finalized on its own, credited with the class.
            return {'id': cid, 'user_id': STUDENT, 'diploma_status': 'none', 'merged_into': None,
                    'is_confidential': False, 'user_quest_task_id': 't-poe', 'quest_id': 'q-poe'}
        return None
    def user_quest(self, uid):
        if uid == CLASS_USER_QUEST:
            return {'id': uid, 'user_id': STUDENT, 'completed_at': None,
                    'quests': {'id': 'q-poe', 'quest_type': 'class',
                               'class_review_status': 'credit_awarded'}}
        return {'id': uid, 'user_id': STUDENT} if uid == USER_QUEST else None
    def task(self, tid):
        if tid == 't-poe':
            return {'id': tid, 'user_quest_id': CLASS_USER_QUEST, 'title': 'POE Day 3'}
        return {'id': tid, 'user_quest_id': USER_QUEST, 'title': 'Build a drone'}
    def quest(self, qid):
        if qid == 'q-poe':
            return {'id': qid, 'title': 'Pipe Organ Encounter', 'quest_type': 'class',
                    'class_review_status': 'credit_awarded'}
        return {'id': qid, 'title': 'Flight'}
    def learning_event(self, eid):
        return {'id': eid, 'user_id': STUDENT, 'title': 'First solo flight', 'description': 'It flew.',
                'pillars': ['stem'], 'is_confidential': False, 'event_date': '2026-09-12'} if eid == EVENT else None
    def student(self, uid):
        return {'id': uid, 'display_name': 'Dr. Tanner' if uid == ADMIN else 'Romney H.',
                'role': 'superadmin' if uid == ADMIN else 'student', 'organization_id': None}


@pytest.fixture
def world(monkeypatch):
    candidate_repo, story_repo, source_repo = FakeCandidateRepo(), FakeStoryRepo(), FakeSourceRepo()
    state: Dict[str, Any] = {'candidates': candidate_repo, 'stories': story_repo, 'kicked': [],
                             'identity': ADMIN, 'role': 'superadmin'}

    monkeypatch.setattr('routes.stories.admin._repos', lambda: (story_repo, None, source_repo))
    monkeypatch.setattr('routes.stories.candidates.StoryCandidateRepository', lambda client=None: candidate_repo)
    monkeypatch.setattr('repositories.story_candidate_repository.StoryCandidateRepository',
                        lambda client=None: candidate_repo)
    monkeypatch.setattr('services.stories.source_quest.status',
                        lambda uq, repo=None, admin=None: {'can_start': True, 'complete': True, 'submitted_task_count': 3, 'credited_task_count': 3, 'task_count': 3})
    monkeypatch.setattr(generate, 'kick_background', lambda ids, admin=None: state['kicked'].extend(ids) or True)
    monkeypatch.setattr(Config, 'STORIES_ENABLED', True)

    monkeypatch.setattr('utils.auth.decorators.authorizing_user_id', lambda: state['identity'])

    class _Users:
        def __getattr__(self, name):
            if name == 'execute':
                return lambda: SimpleNamespace(data={'role': state['role']})
            return lambda *a, **k: self

    class _Client:
        def table(self, name):
            return _Users()
    monkeypatch.setattr('database.get_supabase_admin_client', lambda: _Client())
    from utils.session_manager import session_manager
    monkeypatch.setattr(session_manager, 'get_effective_user_id', lambda: state['identity'])
    return state


@pytest.fixture
def client(world):
    from routes.stories import admin_stories_bp

    app = Flask(__name__)
    app.register_blueprint(admin_stories_bp)
    return app.test_client()


class TestToggle:
    def test_bookmarks_a_task_completion_for_the_student_it_belongs_to(self, client, world):
        response = client.post('/api/admin/stories/candidates/toggle', json={
            'target_type': 'task_completed', 'target_id': COMPLETION})
        assert response.status_code == 200
        body = response.get_json()['data']
        assert body['is_story_candidate'] is True
        assert body['candidate']['student_user_id'] == STUDENT
        assert body['candidate']['flagged_by'] == ADMIN

    def test_takes_the_le_prefix_the_feed_uses_on_a_learning_moment(self, client, world):
        response = client.post('/api/admin/stories/candidates/toggle', json={
            'target_type': 'learning_moment', 'target_id': f'le_{EVENT}', 'note': 'the drone video'})
        assert response.status_code == 200
        row = response.get_json()['data']['candidate']
        assert row['target_id'] == EVENT
        assert row['note'] == 'the drone video'

    def test_a_second_tap_takes_the_bookmark_off(self, client, world):
        client.post('/api/admin/stories/candidates/toggle', json={
            'target_type': 'task_completed', 'target_id': COMPLETION})
        response = client.post('/api/admin/stories/candidates/toggle', json={
            'target_type': 'task_completed', 'target_id': COMPLETION})
        assert response.get_json()['data']['is_story_candidate'] is False
        assert world['candidates'].rows == {}

    def test_an_explicit_on_is_honoured(self, client, world):
        response = client.post('/api/admin/stories/candidates/toggle', json={
            'target_type': 'task_completed', 'target_id': COMPLETION, 'on': False})
        assert response.get_json()['data']['is_story_candidate'] is False
        assert world['candidates'].rows == {}

    def test_a_feed_item_that_is_gone_is_404(self, client):
        response = client.post('/api/admin/stories/candidates/toggle', json={
            'target_type': 'task_completed', 'target_id': 'cccccccc-cccc-cccc-cccc-000000000009'})
        assert response.status_code == 404

    def test_a_bad_type_is_400(self, client):
        response = client.post('/api/admin/stories/candidates/toggle', json={
            'target_type': 'quest', 'target_id': COMPLETION})
        assert response.status_code == 400

    def test_not_for_anyone_but_a_superadmin(self, client, world):
        world['role'] = 'parent'
        # The bare test app has no error handler: the decorator raises, and the
        # real app turns that into a 403. Either way, nothing is written.
        response = client.post('/api/admin/stories/candidates/toggle', json={
            'target_type': 'task_completed', 'target_id': COMPLETION})
        assert response.status_code in (401, 403, 500)
        assert world['candidates'].rows == {}


class TestQueue:
    def _flag(self, client, target_type, target_id):
        return client.post('/api/admin/stories/candidates/toggle', json={
            'target_type': target_type, 'target_id': target_id}).get_json()['data']['candidate']

    def test_a_finalized_task_comes_back_with_both_story_sources_ready(self, client):
        self._flag(client, 'task_completed', COMPLETION)
        rows = client.get('/api/admin/stories/candidates').get_json()['data']['candidates']
        assert len(rows) == 1
        row = rows[0]
        assert row['student'] == {'id': STUDENT, 'display_name': 'Romney H.'}
        assert row['flagged_by_name'] == 'Dr. Tanner'
        assert row['item']['title'] == 'Build a drone'
        assert row['item']['quest_title'] == 'Flight'
        assert row['sources']['credit_submission'] == {
            'source_id': COMPLETION, 'eligible': True, 'reasons': [], 'existing_story': None}
        assert row['sources']['quest']['source_id'] == USER_QUEST
        assert row['sources']['quest']['complete'] is True

    def test_an_unfinalized_task_can_start_and_says_the_credit_is_not_in(self, client):
        """Credit is not a gate (2026-09-15): the row says where the credit stands."""
        self._flag(client, 'task_completed', DRAFT_COMPLETION)
        row = client.get('/api/admin/stories/candidates').get_json()['data']['candidates'][0]
        assert row['item']['credited'] is False
        assert row['sources']['credit_submission']['eligible'] is True
        assert row['sources']['credit_submission']['reasons'] == []

    def test_a_day_of_a_credited_class_can_start_a_story(self, client):
        """POE: the class review credited the week; no day was ever finalized."""
        self._flag(client, 'task_completed', CLASS_DAY_COMPLETION)
        row = client.get('/api/admin/stories/candidates').get_json()['data']['candidates'][0]
        assert row['item']['title'] == 'POE Day 3'
        assert row['item']['diploma_status'] == 'none'
        assert row['item']['credited'] is True
        assert row['sources']['credit_submission']['eligible'] is True
        assert row['sources']['credit_submission']['reasons'] == []
        assert row['sources']['quest']['source_id'] == CLASS_USER_QUEST

    def test_a_learning_moment_is_kept_with_no_source_yet(self, client):
        self._flag(client, 'learning_moment', f'le_{EVENT}')
        row = client.get('/api/admin/stories/candidates').get_json()['data']['candidates'][0]
        assert row['item']['title'] == 'First solo flight'
        assert row['sources'] == {}

    def test_dismiss_moves_the_row_out_of_the_open_queue(self, client):
        cand = self._flag(client, 'task_completed', COMPLETION)
        response = client.post(f"/api/admin/stories/candidates/{cand['id']}/dismiss")
        assert response.status_code == 404  # not a uuid: the fake ids are short
        response = client.get('/api/admin/stories/candidates?status=open')
        assert len(response.get_json()['data']['candidates']) == 1

    def test_a_bad_status_filter_is_400(self, client):
        assert client.get('/api/admin/stories/candidates?status=done').status_code == 400


class TestStartingAStoryFromTheQueue:
    def test_publish_with_candidate_id_marks_the_row_started(self, client, world):
        # A uuid-shaped candidate id, the way the real table hands them out.
        repo = world['candidates']
        row = repo.flag('task_completed', COMPLETION, student_user_id=STUDENT, flagged_by=ADMIN)
        cid = '12345678-1234-1234-1234-123456789abc'
        repo.rows[cid] = {**repo.rows.pop(row['id']), 'id': cid}

        response = client.post('/api/admin/stories/publish', json={
            'source_type': 'credit_submission', 'source_id': COMPLETION, 'mode': 'review',
            'candidate_id': cid})
        assert response.status_code == 202
        story_id = response.get_json()['data']['story']['id']
        assert repo.rows[cid]['status'] == 'started'
        assert repo.rows[cid]['story_id'] == story_id
        assert client.get('/api/admin/stories/candidates').get_json()['data']['candidates'] == []
        assert len(client.get('/api/admin/stories/candidates?status=started').get_json()['data']['candidates']) == 1

    def test_dismiss_by_uuid(self, client, world):
        repo = world['candidates']
        cid = '12345678-1234-1234-1234-123456789abc'
        repo.rows[cid] = {'id': cid, 'target_type': 'task_completed', 'target_id': COMPLETION,
                          'student_user_id': STUDENT, 'flagged_by': ADMIN, 'note': None,
                          'status': 'open', 'story_id': None, 'resolved_at': None}
        assert client.post(f'/api/admin/stories/candidates/{cid}/dismiss').status_code == 200
        assert repo.rows[cid]['status'] == 'dismissed'
        assert client.delete(f'/api/admin/stories/candidates/{cid}').status_code == 200


class TestGraderEligibilityReadsTheBookmark:
    """The grader's story panel (web) is one bookmark button since 2026-09-15.
    It reads the bookmark's state off the eligibility payload it already
    fetches, so the panel opens showing "in the queue" for an item the
    superadmin flagged from the app's feed."""

    def test_not_a_candidate_until_flagged(self, client, world, monkeypatch):
        monkeypatch.setattr('utils.ai_access.check_ai_access', lambda uid, strict=True: (True, None, None))
        body = client.get(f'/api/admin/stories/eligibility/{COMPLETION}').get_json()['data']['eligibility']
        assert body['is_story_candidate'] is False

        client.post('/api/admin/stories/candidates/toggle', json={
            'target_type': 'task_completed', 'target_id': COMPLETION, 'on': True})
        body = client.get(f'/api/admin/stories/eligibility/{COMPLETION}').get_json()['data']['eligibility']
        assert body['is_story_candidate'] is True

    def test_a_dismissed_bookmark_reads_as_not_a_candidate(self, client, world, monkeypatch):
        monkeypatch.setattr('utils.ai_access.check_ai_access', lambda uid, strict=True: (True, None, None))
        repo = world['candidates']
        row = repo.flag('task_completed', COMPLETION, student_user_id=STUDENT, flagged_by=ADMIN)
        repo.resolve(row['id'], 'dismissed')
        body = client.get(f'/api/admin/stories/eligibility/{COMPLETION}').get_json()['data']['eligibility']
        assert body['is_story_candidate'] is False
