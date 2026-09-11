"""The admin routes' contracts: one click is 202, a second is 409, the cron gate is dual.

The decorators are stubbed at their seams (the authorizing identity and the
role lookup); everything below them runs for real against fake repositories.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict

import pytest
from flask import Flask

from app_config import Config
from services import marketing_site
from services.stories import generate, publish

pytestmark = pytest.mark.unit

ADMIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
STUDENT = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
COMPLETION = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
USER_QUEST = 'ffffffff-ffff-ffff-ffff-ffffffffffff'


class FakeStoryRepo:
    def __init__(self):
        self.rows: Dict[str, Dict[str, Any]] = {}

    def get(self, sid): return dict(self.rows[sid]) if sid in self.rows else None
    def get_by_source(self, st, sid):
        return next((dict(r) for r in self.rows.values()
                     if r['source_type'] == st and r['source_id'] == sid), None)
    def create(self, row):
        row = {**row, 'id': f'story-{len(self.rows) + 1}', 'blockers': [], 'claim_token': None}
        self.rows[row['id']] = row
        return dict(row)
    def patch(self, sid, changes):
        self.rows[sid].update(changes)
        return dict(self.rows[sid])
    def list_all(self, limit=200): return [dict(r) for r in self.rows.values()]
    def max_updated_at_published(self): return None


class FakeAssetRepo:
    def for_story(self, sid): return []
    def patch(self, aid, changes): return None


class FakeSourceRepo:
    def completion(self, cid):
        return {'id': cid, 'user_id': STUDENT, 'diploma_status': 'finalized', 'merged_into': None,
                'is_confidential': False, 'user_quest_task_id': 't1'} if cid == COMPLETION else None
    def user_quest(self, uid):
        return {'id': uid, 'user_id': STUDENT} if uid == USER_QUEST else None
    def task(self, tid): return {'id': tid, 'user_quest_id': USER_QUEST}
    def student(self, uid): return {'id': uid, 'role': 'superadmin' if uid == ADMIN else 'student',
                                    'organization_id': None}


@pytest.fixture
def world(monkeypatch):
    story_repo, asset_repo, source_repo = FakeStoryRepo(), FakeAssetRepo(), FakeSourceRepo()
    state: Dict[str, Any] = {'story_repo': story_repo, 'kicked': [], 'identity': ADMIN,
                             'role': 'superadmin', 'sweeps': 0, 'fired': 0, 'reconciled': 0}

    monkeypatch.setattr('routes.stories.admin._repos', lambda: (story_repo, asset_repo, source_repo))
    monkeypatch.setattr(generate, 'kick_background', lambda ids, admin=None: state['kicked'].extend(ids) or True)
    monkeypatch.setattr(Config, 'STORIES_ENABLED', True)
    monkeypatch.setattr(Config, 'CRON_SECRET', 'cron-secret')

    # The superadmin decorator: identity, then a role lookup through the admin client.
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

    # The internal routes' seams.
    monkeypatch.setattr('repositories.story_source_repository.StorySourceRepository',
                        lambda client=None: source_repo)
    monkeypatch.setattr(generate, 'sweep', lambda admin=None: state.__setitem__('sweeps', state['sweeps'] + 1) or {'picked': 0})
    monkeypatch.setattr(marketing_site, 'fire_pending', lambda repo=None: state.__setitem__('fired', state['fired'] + 1) or {'fired': False})
    monkeypatch.setattr(publish, 'reconcile', lambda admin=None: state.__setitem__('reconciled', state['reconciled'] + 1) or {'checked': 0})
    monkeypatch.setattr('repositories.story_repository.StoryRepository', lambda client=None: story_repo)
    monkeypatch.setattr('repositories.marketing_rebuild_repository.MarketingRebuildRepository',
                        lambda client=None: SimpleNamespace(last_fired_at=lambda: None))
    from utils.session_manager import session_manager
    monkeypatch.setattr(session_manager, 'get_effective_user_id', lambda: state['identity'])
    return state


@pytest.fixture
def client(world):
    from routes.stories import admin_stories_bp

    app = Flask(__name__)
    app.register_blueprint(admin_stories_bp)
    return app.test_client()


class TestPublish:
    def test_one_click_is_202_and_kicks_the_thread(self, client, world):
        response = client.post('/api/admin/stories/publish', json={
            'source_type': 'credit_submission', 'source_id': COMPLETION, 'mode': 'auto'})
        assert response.status_code == 202
        story = response.get_json()['data']['story']
        assert story['status'] == 'generating'
        assert story['mode'] == 'auto'
        assert story['student_user_id'] == STUDENT
        assert story['created_by'] == ADMIN
        assert 'claim_token' not in story
        assert world['kicked'] == [story['id']]

    def test_a_second_click_is_409_with_the_existing_id(self, client, world):
        first = client.post('/api/admin/stories/publish', json={
            'source_type': 'credit_submission', 'source_id': COMPLETION, 'mode': 'review'})
        second = client.post('/api/admin/stories/publish', json={
            'source_type': 'credit_submission', 'source_id': COMPLETION, 'mode': 'auto'})
        assert second.status_code == 409
        body = second.get_json()
        assert body['error']['details']['existing_story_id'] == first.get_json()['data']['story']['id']
        assert len(world['kicked']) == 1

    def test_whole_quest_source(self, client, world):
        response = client.post('/api/admin/stories/publish', json={
            'source_type': 'quest', 'source_id': USER_QUEST, 'mode': 'auto'})
        assert response.status_code == 202
        assert response.get_json()['data']['story']['source_type'] == 'quest'

    @pytest.mark.parametrize('body', [
        {}, {'source_type': 'learning_moment', 'source_id': COMPLETION, 'mode': 'auto'},
        {'source_type': 'credit_submission', 'source_id': 'not-a-uuid', 'mode': 'auto'},
        {'source_type': 'credit_submission', 'source_id': COMPLETION, 'mode': 'later'},
    ])
    def test_bad_bodies_are_400(self, client, body):
        assert client.post('/api/admin/stories/publish', json=body).status_code == 400

    def test_missing_source_is_404(self, client):
        response = client.post('/api/admin/stories/publish', json={
            'source_type': 'credit_submission', 'source_id': '99999999-9999-9999-9999-999999999999',
            'mode': 'auto'})
        assert response.status_code == 404

    def test_disabled_is_503(self, client, monkeypatch):
        monkeypatch.setattr(Config, 'STORIES_ENABLED', False)
        response = client.post('/api/admin/stories/publish', json={
            'source_type': 'credit_submission', 'source_id': COMPLETION, 'mode': 'auto'})
        assert response.status_code == 503

    def test_non_superadmin_is_refused(self, client, world):
        world['role'] = 'org_admin'
        response = client.post('/api/admin/stories/publish', json={
            'source_type': 'credit_submission', 'source_id': COMPLETION, 'mode': 'auto'})
        assert response.status_code in (401, 403, 500)
        assert world['kicked'] == []


class TestInternal:
    def test_cron_secret_opens_the_sweep(self, client, world):
        response = client.post('/api/admin/stories/internal/rebuild-sweep',
                               headers={'X-Cron-Secret': 'cron-secret'})
        assert response.status_code == 200
        assert response.get_json()['success'] is True
        assert (world['sweeps'], world['fired']) == (1, 1)

    def test_wrong_secret_and_no_session_is_401(self, client, world):
        world['identity'] = None
        response = client.post('/api/admin/stories/internal/rebuild-sweep',
                               headers={'X-Cron-Secret': 'nope'})
        assert response.status_code == 401
        assert world['sweeps'] == 0

    def test_a_signed_in_superadmin_may_trigger_it(self, client, world):
        response = client.post('/api/admin/stories/internal/nightly')
        assert response.status_code == 200
        assert world['reconciled'] == 1

    def test_a_signed_in_student_may_not(self, client, world):
        world['identity'] = STUDENT
        assert client.post('/api/admin/stories/internal/nightly').status_code == 401
