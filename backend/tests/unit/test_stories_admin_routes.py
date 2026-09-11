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


YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
INSTAGRAM = 'https://www.instagram.com/anna.l/'
PUBLIC_COPY = ('https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/'
               'story-assets/stories/x/a1.jpg')
PRIVATE_COPY = ('https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/'
                'quest-evidence/task-evidence/x/1.jpg')


def _evidence_items():
    return [
        {'type': 'image', 'asset_id': 'a1', 'url': PUBLIC_COPY, 'alt': 'A bridge', 'caption': None},
        {'type': 'quote', 'text': 'It held 12 kg.', 'caption': None, 'source_block_id': 'b1',
         'source_item_index': 1, 'included': True, 'safety': {'verdict': 'safe', 'reason': None}},
        {'type': 'link', 'url': YOUTUBE, 'alt': 'Bridge load test', 'caption': None,
         'source_block_id': 'l1', 'source_item_index': 1, 'included': False,
         'safety': {'verdict': 'excluded', 'reason': 'external_link_identifies'}},
        {'type': 'link', 'url': INSTAGRAM, 'alt': 'anna.l', 'caption': None,
         'source_block_id': 'l2', 'source_item_index': 1, 'included': False,
         'safety': {'verdict': 'excluded', 'reason': 'social_profile'}},
    ]


@pytest.fixture
def editable(world, monkeypatch):
    """A story in review with a quote and two links, and the PUT's other seams stubbed."""
    monkeypatch.setattr('routes.stories.admin._consent_view', lambda student_id: None)
    monkeypatch.setattr('routes.stories.admin.sign_thumb_urls', lambda refs, size=None: {})
    story = world['story_repo'].create({
        'status': 'review', 'source_type': 'credit_submission', 'source_id': COMPLETION,
        'student_user_id': STUDENT, 'mode': 'review', 'tier': 'anonymized',
        'title': 'A bridge', 'dek': 'It held.', 'subject': 'Science',
        'receipt': {'activity': 'Bridge', 'course': 'Science', 'credit': '0.5 credit', 'icon': 'flask'},
        'student_label': 'A high school student',
        'body': {'sections': [
            {'kind': 'what_they_did', 'body_md': 'They built it.'},
            {'kind': 'evidence', 'items': _evidence_items()},
        ], 'faq': []},
    })
    return story


def _put(client, story_id, items, **extra):
    body = {'sections': [{'kind': 'what_they_did', 'body_md': 'They built it.'},
                         {'kind': 'evidence', 'items': items}], 'faq': []}
    return client.put(f'/api/admin/stories/{story_id}', json={'body': body, **extra})


class TestEditQuotesAndLinks:
    def _items(self, **included):
        items = _evidence_items()
        for item in items:
            key = item.get('source_block_id')
            if key in included:
                item['included'] = included[key]
        return items

    def test_a_published_copy_and_an_external_url_are_allowed_a_private_pointer_is_not(self, client, editable):
        assert _put(client, editable['id'], self._items()).status_code == 200
        items = self._items()
        items[0]['url'] = PRIVATE_COPY
        response = _put(client, editable['id'], items)
        assert response.status_code == 400
        assert response.get_json()['error']['code'] == 'STORAGE_URL'

    def test_anonymized_tier_cannot_include_an_external_link(self, client, editable):
        response = _put(client, editable['id'], self._items(l1=True))
        assert response.status_code == 400
        assert response.get_json()['error']['code'] == 'EXCLUSION_STANDS'

    def test_a_social_profile_stays_out_in_the_named_tier(self, client, editable, world):
        world['story_repo'].patch(editable['id'], {'tier': 'named'})
        response = _put(client, editable['id'], self._items(l2=True))
        assert response.status_code == 400
        assert 'social profile' in response.get_json()['error']['message']

    def test_named_tier_may_include_an_external_link_and_it_is_recorded_as_an_override(self, client, editable, world):
        world['story_repo'].patch(editable['id'], {'tier': 'named'})
        response = _put(client, editable['id'], self._items(l1=True))
        assert response.status_code == 200
        saved = world['story_repo'].get(editable['id'])
        items = next(s for s in saved['body']['sections'] if s['kind'] == 'evidence')['items']
        youtube = next(i for i in items if i.get('url') == YOUTUBE)
        assert youtube['included'] is True
        assert youtube['safety'] == {'verdict': 'excluded', 'reason': 'external_link_identifies',
                                     'override': ADMIN}

    def test_the_text_the_url_and_the_verdict_come_from_the_stored_item(self, client, editable, world):
        items = self._items()
        items[1]['text'] = 'Rewritten by an editor.'
        items[1]['caption'] = 'A caption'
        items[1]['safety'] = {'verdict': 'safe'}
        items[2]['url'] = 'https://elsewhere.example.com/'
        items[2]['safety'] = {'verdict': 'safe', 'reason': None}     # a client cannot launder it
        items.append({'type': 'quote', 'text': 'Invented.', 'included': True,
                      'safety': {'verdict': 'safe'}})
        response = _put(client, editable['id'], items)
        assert response.status_code == 200
        saved = world['story_repo'].get(editable['id'])
        saved_items = next(s for s in saved['body']['sections'] if s['kind'] == 'evidence')['items']
        quote = next(i for i in saved_items if i['type'] == 'quote')
        assert quote['text'] == 'It held 12 kg.' and quote['caption'] == 'A caption'
        links = [i for i in saved_items if i['type'] == 'link']
        assert [link['url'] for link in links] == [YOUTUBE, INSTAGRAM]
        assert links[0]['included'] is False
        assert links[0]['safety']['reason'] == 'external_link_identifies'
        assert 'Invented.' not in str(saved)

    def test_switching_a_quote_off_is_saved(self, client, editable, world):
        assert _put(client, editable['id'], self._items(b1=False)).status_code == 200
        saved = world['story_repo'].get(editable['id'])
        quote = next(i for s in saved['body']['sections'] if s['kind'] == 'evidence'
                     for i in s['items'] if i['type'] == 'quote')
        assert quote['included'] is False


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
