"""The public feed: allowlisted fields, public URLs, 404 unless published, cached.

This is the only reader of a story that is not a superadmin. Everything it
serves is `publish.public_view`, so the assertions here are on the JSON a
crawler could fetch.
"""

from __future__ import annotations

from typing import Any, List

import pytest
from flask import Flask

from services.stories.anonymize import NEVER_PUBLISHED
from services.stories.publish import public_view

pytestmark = pytest.mark.unit

STORY_ID = '11111111-1111-1111-1111-111111111111'
OTHER_ID = '22222222-2222-2222-2222-222222222222'
STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
PRIVATE = ('https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/'
           'quest-evidence/task-evidence/x/1.jpg')


def _story(story_id=STORY_ID, slug='a-bridge', status='published', published_at='2026-09-10T00:00:00+00:00'):
    return {
        'id': story_id, 'slug': slug, 'status': status, 'source_type': 'credit_submission',
        'source_id': 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'student_user_id': STUDENT_ID,
        'consent_id': None, 'tier': 'anonymized', 'mode': 'auto',
        'title': 'A bridge that held', 'dek': 'A load test that counted.',
        'body': {
            'sections': [
                {'kind': 'what_they_did', 'body_md': 'They built it.'},
                {'kind': 'tasks', 'rows': [{'title': 'Load test', 'subject': 'Science', 'xp': 150,
                                            'criteria_met': 2, 'criteria_total': 2, 'rounds': 1,
                                            'summary': 'internal only'}]},
                {'kind': 'evidence', 'items': [
                    {'type': 'image', 'asset_id': 'a1', 'url': None, 'alt': 'A bridge',
                     'caption': 'The bridge', 'width': None, 'height': None},
                    {'type': 'image', 'asset_id': 'a2', 'url': None, 'alt': 'Excluded',
                     'caption': None, 'width': None, 'height': None},
                ]},
                {'kind': 'what_reviewer_looked_for', 'criteria': [
                    {'text': 'Built it', 'verdict': 'met', 'note': 'yes', 'extra': 'no'}]},
                {'kind': 'how_it_went', 'rounds': [
                    {'round': 1, 'date': '2026-09-01', 'action': 'approved',
                     'feedback_verbatim': 'Good.', 'what_changed': None}]},
                {'kind': 'what_it_counted_for', 'body_md': 'Science credit.'},
            ],
            'faq': [{'q': 'Does it count?', 'a': 'Yes.'}],
            'title_options': ['x'], 'search_phrases': ['y'],
        },
        'student_label': 'A high school student', 'setting': 'homeschool', 'grade_band': 'high',
        'activity_slug': 'other', 'activity_label': 'A bridge build',
        'receipt': {'activity': 'Backyard bridge', 'course': 'Science', 'credit': '0.08 credit',
                    'icon': 'flask'},
        'subject': 'Physical Education', 'subject_split': [{'subject': 'Physical Education', 'xp': 150}],
        'xp_awarded': 150, 'credit_fraction': 0.08, 'hero_asset_id': 'a1', 'og_image_url': None,
        'author_name': 'Dr. Tanner Bowman', 'author_title': 'Founder, Optio',
        'ai_draft': {'data': {'secret': 1}}, 'safety': {'images': []}, 'blockers': [],
        'concerns': ['x'], 'published_at': published_at, 'unpublished_at': None,
        'error': None, 'attempts': 1, 'started_at': None, 'created_by': 'admin',
        'updated_by': 'admin', 'created_at': '2026-09-09', 'updated_at': '2026-09-10T01:00:00+00:00',
        'claim_token': 'tok',
    }


def _assets(story_id=STORY_ID):
    return [
        {'id': 'a1', 'story_id': story_id, 'source_block_id': 'b1', 'source_item_index': 1,
         'source_ref': PRIVATE, 'public_path': f'stories/{story_id}/a1.jpg', 'alt': 'A bridge',
         'caption': 'The bridge', 'width': 1600, 'height': 900, 'order_index': 0,
         'safety': {'verdict': 'safe'}, 'included': True},
        {'id': 'a2', 'story_id': story_id, 'source_block_id': 'b2', 'source_item_index': 1,
         'source_ref': PRIVATE, 'public_path': None, 'alt': 'Excluded', 'caption': None,
         'width': None, 'height': None, 'order_index': 1,
         'safety': {'verdict': 'excluded', 'faces': 1}, 'included': False},
    ]


def _keys(value: Any) -> List[str]:
    if isinstance(value, dict):
        return [k for k in value] + [k for v in value.values() for k in _keys(v)]
    if isinstance(value, list):
        return [k for v in value for k in _keys(v)]
    return []


def _urls(value: Any) -> List[str]:
    if isinstance(value, str):
        return [value] if value.startswith('http') else []
    if isinstance(value, dict):
        return [u for v in value.values() for u in _urls(v)]
    if isinstance(value, list):
        return [u for v in value for u in _urls(v)]
    return []


class TestPublicView:
    def test_no_forbidden_field_anywhere(self):
        view = public_view(_story(), _assets())
        keys = set(_keys(view))
        for column in NEVER_PUBLISHED:
            assert column not in keys, column
        for column in ('asset_id', 'summary', 'extra', 'title_options', 'search_phrases',
                       'concerns', 'id', 'tier', 'claim_token'):
            assert column not in keys, column

    def test_exact_top_level_shape(self):
        view = public_view(_story(), _assets())
        assert set(view) == {
            'slug', 'title', 'dek', 'status', 'published_at', 'updated_at', 'author', 'student',
            'activity', 'receipt', 'subject', 'subject_slug', 'subject_split', 'xp_awarded',
            'credit_fraction', 'task_count', 'sections', 'faq', 'hero_image_url', 'hero_alt',
            'og_image_url', 'source'}
        assert view['status'] == 'published'
        assert view['author'] == {'name': 'Dr. Tanner Bowman', 'title': 'Founder, Optio'}
        assert view['student'] == {'label': 'A high school student', 'setting': 'homeschool',
                                   'grade_band': 'high'}
        assert view['activity'] == {'slug': 'other', 'label': 'A bridge build'}
        assert view['receipt'] == {'activity': 'Backyard bridge', 'course': 'Science',
                                   'credit': '0.08 credit', 'icon': 'flask'}
        assert view['subject_slug'] == 'physical-education'
        assert view['credit_fraction'] == '0.08 credit'
        assert view['task_count'] == 1
        assert view['og_image_url'] is None
        assert view['source'] == {'type': 'credit_submission'}

    def test_every_url_is_public_story_assets(self):
        view = public_view(_story(), _assets())
        urls = _urls(view)
        assert urls, 'expected at least the evidence and hero URLs'
        for url in urls:
            assert '/storage/v1/object/public/story-assets/stories/' in url, url
            assert 'quest-evidence' not in url and 'user-uploads' not in url and '/sign/' not in url
        assert view['hero_image_url'].endswith(f'stories/{STORY_ID}/a1.jpg')
        assert view['hero_alt'] == 'A bridge'

    def test_excluded_asset_never_appears(self):
        view = public_view(_story(), _assets())
        evidence = next(s for s in view['sections'] if s['kind'] == 'evidence')
        assert len(evidence['items']) == 1
        assert set(evidence['items'][0]) == {'type', 'url', 'alt', 'caption', 'width', 'height'}
        assert evidence['items'][0]['width'] == 1600

    def test_sections_carry_only_their_declared_keys(self):
        view = public_view(_story(), _assets())
        by_kind = {s['kind']: s for s in view['sections']}
        assert set(by_kind['tasks']['rows'][0]) == {'title', 'subject', 'xp', 'criteria_met',
                                                    'criteria_total', 'rounds'}
        assert set(by_kind['what_reviewer_looked_for']['criteria'][0]) == {'text', 'verdict', 'note'}
        assert set(by_kind['how_it_went']['rounds'][0]) == {'round', 'date', 'action',
                                                            'feedback_verbatim', 'what_changed'}
        assert [s['kind'] for s in view['sections']] == [
            'what_they_did', 'tasks', 'evidence', 'what_reviewer_looked_for', 'how_it_went',
            'what_it_counted_for']

    def test_hero_pointing_at_an_excluded_asset_is_null(self):
        story = {**_story(), 'hero_asset_id': 'a2'}
        view = public_view(story, _assets())
        assert view['hero_image_url'] is None and view['hero_alt'] is None

    def test_a_video_asset_passes_through_as_type_video(self):
        """The asset row decides the type, the URL is the public .mp4, and a
        video carries no pixel size -- the keys are absent, not null."""
        story = _story()
        evidence = next(s for s in story['body']['sections'] if s['kind'] == 'evidence')
        evidence['items'].append({'type': 'video', 'asset_id': 'a3', 'url': None,
                                  'alt': 'A dance routine', 'caption': 'One take',
                                  'width': None, 'height': None})
        assets = _assets() + [{
            'id': 'a3', 'story_id': STORY_ID, 'source_block_id': 'v1', 'source_item_index': 1,
            'source_ref': PRIVATE.replace('1.jpg', 'Dream.MP4'), 'kind': 'video',
            'mime_type': 'video/mp4', 'public_path': f'stories/{STORY_ID}/a3.mp4',
            'alt': 'A dance routine', 'caption': 'One take', 'width': None, 'height': None,
            'order_index': 2, 'safety': {'verdict': 'safe'}, 'included': True,
        }]
        view = public_view(story, assets)
        items = next(s for s in view['sections'] if s['kind'] == 'evidence')['items']
        assert [i['type'] for i in items] == ['image', 'video']
        video = items[1]
        assert set(video) == {'type', 'url', 'alt', 'caption'}
        assert video['url'].endswith(f'/story-assets/stories/{STORY_ID}/a3.mp4')
        assert video['alt'] == 'A dance routine' and video['caption'] == 'One take'
        for url in _urls(view):
            assert 'quest-evidence' not in url and '/sign/' not in url

    def test_quote_link_and_document_pass_through_with_their_fields(self):
        """Each standalone item ships exactly its public keys; the asset row
        decides that a PDF is a document; excluded items and the editor's
        `included` and `safety` never leave the row."""
        story = _story()
        evidence = next(s for s in story['body']['sections'] if s['kind'] == 'evidence')
        evidence['items'].extend([
            {'type': 'document', 'asset_id': 'a4', 'url': None, 'alt': 'Lab report',
             'caption': 'As submitted', 'width': None, 'height': None},
            {'type': 'quote', 'text': 'It held 12 kg.', 'caption': None,
             'source_block_id': 'b5', 'source_item_index': 1,
             'included': True, 'safety': {'verdict': 'safe', 'reason': None}},
            {'type': 'quote', 'text': 'From the doc.', 'caption': 'From notes',
             'source_block_id': 'b6', 'source_item_index': 1,
             'included': True, 'safety': {'verdict': 'safe', 'reason': None}},
            {'type': 'quote', 'text': 'Ask Anna.', 'caption': None,
             'included': False, 'safety': {'verdict': 'excluded', 'reason': 'text_leak',
                                           'leaks': ['Anna']}},
            {'type': 'link', 'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
             'alt': 'Bridge load test', 'caption': 'Filmed in one take',
             'included': True, 'safety': {'verdict': 'safe', 'reason': None}},
            {'type': 'link', 'url': 'https://www.instagram.com/anna.l/', 'alt': 'anna.l',
             'caption': None, 'included': False,
             'safety': {'verdict': 'excluded', 'reason': 'social_profile'}},
        ])
        assets = _assets() + [{
            'id': 'a4', 'story_id': STORY_ID, 'source_block_id': 'd1', 'source_item_index': 1,
            'source_ref': PRIVATE.replace('1.jpg', 'Lab.pdf'), 'kind': 'document',
            'mime_type': 'application/pdf', 'public_path': f'stories/{STORY_ID}/a4.pdf',
            'alt': 'Lab report', 'caption': 'As submitted', 'width': None, 'height': None,
            'order_index': 3, 'safety': {'verdict': 'safe'}, 'included': True,
        }]
        view = public_view(story, assets)
        items = next(s for s in view['sections'] if s['kind'] == 'evidence')['items']
        assert [i['type'] for i in items] == ['image', 'document', 'quote', 'quote', 'link']
        document, quote, labelled, link = items[1], items[2], items[3], items[4]
        assert document == {'type': 'document', 'alt': 'Lab report', 'caption': 'As submitted',
                            'url': document['url']}
        assert document['url'].endswith(f'/story-assets/stories/{STORY_ID}/a4.pdf')
        assert quote == {'type': 'quote', 'text': 'It held 12 kg.', 'caption': None}
        assert labelled == {'type': 'quote', 'text': 'From the doc.', 'caption': 'From notes'}
        assert link == {'type': 'link', 'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                        'alt': 'Bridge load test', 'caption': 'Filmed in one take'}
        keys = set(_keys(view))
        for forbidden in ('included', 'safety', 'leaks', 'source_block_id', 'source_item_index'):
            assert forbidden not in keys, forbidden
        assert 'Anna' not in str(view) and 'instagram' not in str(view)

    @pytest.mark.parametrize('kind, path', [('video', 'a3.mp4'), ('document', 'a3.pdf')])
    def test_a_video_or_a_document_is_never_the_hero_image(self, kind, path):
        story = {**_story(), 'hero_asset_id': 'a3'}
        assets = _assets() + [{
            'id': 'a3', 'story_id': STORY_ID, 'source_ref': PRIVATE, 'kind': kind,
            'mime_type': 'video/mp4' if kind == 'video' else 'application/pdf',
            'public_path': f'stories/{STORY_ID}/{path}',
            'alt': 'A file', 'caption': None, 'width': None, 'height': None,
            'order_index': 2, 'safety': {'verdict': 'safe'}, 'included': True,
        }]
        view = public_view(story, assets)
        assert view['hero_image_url'] is None and view['hero_alt'] is None


# ── the endpoint ─────────────────────────────────────────────────────────────

class FakeStoryRepo:
    def __init__(self, rows):
        self.rows = rows

    def list_published(self):
        rows = [r for r in self.rows if r['status'] == 'published']
        return sorted(rows, key=lambda r: r['published_at'], reverse=True)

    def get_by_slug(self, slug):
        return next((r for r in self.rows if r['slug'] == slug), None)


class FakeAssetRepo:
    def __init__(self, rows):
        self.rows = rows

    def for_story(self, sid):
        return [a for a in self.rows if a['story_id'] == sid]

    def for_stories(self, ids):
        return [a for a in self.rows if a['story_id'] in ids]


@pytest.fixture
def client(monkeypatch):
    from routes.stories import public_stories_bp

    rows = [
        _story(),
        _story(OTHER_ID, slug='newer', published_at='2026-09-11T00:00:00+00:00'),
        _story('33333333-3333-3333-3333-333333333333', slug='parked', status='review'),
        _story('44444444-4444-4444-4444-444444444444', slug='gone', status='unpublished'),
    ]
    assets = _assets() + _assets(OTHER_ID)
    monkeypatch.setattr('repositories.story_repository.StoryRepository',
                        lambda client=None: FakeStoryRepo(rows))
    monkeypatch.setattr('repositories.story_asset_repository.StoryAssetRepository',
                        lambda client=None: FakeAssetRepo(assets))
    app = Flask(__name__)
    app.register_blueprint(public_stories_bp)
    return app.test_client()


class TestEndpoint:
    def test_list_is_published_only_newest_first_and_cached(self, client):
        response = client.get('/api/public/stories')
        assert response.status_code == 200
        assert response.headers['Cache-Control'] == 'public, max-age=300'
        body = response.get_json()
        assert body['success'] is True
        assert [s['slug'] for s in body['stories']] == ['newer', 'a-bridge']
        keys = set(_keys(body))
        for column in NEVER_PUBLISHED:
            assert column not in keys
        for url in _urls(body):
            assert 'story-assets' in url

    def test_single_story(self, client):
        response = client.get('/api/public/stories/a-bridge')
        assert response.status_code == 200
        assert response.headers['Cache-Control'] == 'public, max-age=300'
        body = response.get_json()
        assert body['success'] is True and body['story']['slug'] == 'a-bridge'

    @pytest.mark.parametrize('slug', ['parked', 'gone', 'never-existed'])
    def test_404_unless_published(self, client, slug):
        response = client.get(f'/api/public/stories/{slug}')
        assert response.status_code == 404
        assert response.get_json()['success'] is False

    def test_no_private_substring_in_the_raw_body(self, client):
        raw = client.get('/api/public/stories').get_data(as_text=True)
        for needle in ('quest-evidence', 'user-uploads', '/sign/', STUDENT_ID, 'cccccccc-cccc',
                       'claim_token', 'ai_draft', 'tok'):
            assert needle not in raw, needle


def test_story_assets_is_a_public_bucket():
    """The plan's one-line contract: the public copies live in a bucket the
    signing layer does not treat as private, so a plain <img> can load them."""
    from utils.storage_urls import is_private_bucket, public_object_url

    assert is_private_bucket('story-assets') is False
    assert is_private_bucket('quest-evidence') is True
    assert '/storage/v1/object/public/story-assets/stories/x/y.jpg' in \
        public_object_url('story-assets', 'stories/x/y.jpg')


def test_rows_an_editor_switched_off_are_not_published():
    """The admin editor writes included:false onto a criterion, round or task row.

    Off means gone from the public page, and the flag itself never ships.
    """
    from services.stories.publish import public_view

    story = {
        'slug': 's', 'title': 'T', 'dek': 'D', 'status': 'published',
        'body': {'sections': [
            {'kind': 'what_reviewer_looked_for', 'criteria': [
                {'text': 'kept', 'verdict': 'met', 'note': ''},
                {'text': 'dropped', 'verdict': 'partial', 'note': '', 'included': False},
            ]},
            {'kind': 'how_it_went', 'rounds': [
                {'round': 1, 'action': 'grow_this', 'feedback_verbatim': 'x', 'included': False},
                {'round': 2, 'action': 'approve', 'feedback_verbatim': 'y'},
            ]},
            {'kind': 'tasks', 'rows': [
                {'title': 'a', 'subject': 'S', 'xp': 50, 'included': False},
                {'title': 'b', 'subject': 'S', 'xp': 50},
            ]},
        ], 'faq': []},
        'receipt': {'activity': 'a', 'course': 'c', 'credit': '0.5 credit', 'icon': 'ball'},
        'subject': 'Science', 'xp_awarded': 100,
    }
    view = public_view(story, [])
    by_kind = {s['kind']: s for s in view['sections']}
    assert [c['text'] for c in by_kind['what_reviewer_looked_for']['criteria']] == ['kept']
    assert [r['round'] for r in by_kind['how_it_went']['rounds']] == [2]
    assert [r['title'] for r in by_kind['tasks']['rows']] == ['b']
    assert 'included' not in str(view)


class TestPreviewFlag:
    """``?preview=1`` is a developer convenience and must be inert in production."""

    def test_ignored_in_production(self, monkeypatch):
        from app_config import Config
        from routes.stories import public as public_mod
        from flask import Flask
        monkeypatch.setattr(Config, 'FLASK_ENV', 'production')
        app = Flask(__name__)
        with app.test_request_context('/api/public/stories?preview=1'):
            assert public_mod._preview_requested() is False

    def test_honoured_in_development(self, monkeypatch):
        from app_config import Config
        from routes.stories import public as public_mod
        from flask import Flask
        monkeypatch.setattr(Config, 'FLASK_ENV', 'development')
        app = Flask(__name__)
        with app.test_request_context('/api/public/stories?preview=1'):
            assert public_mod._preview_requested() is True
        with app.test_request_context('/api/public/stories'):
            assert public_mod._preview_requested() is False

    def test_preview_view_signs_the_original_when_nothing_is_public(self, monkeypatch):
        from services.stories import publish
        monkeypatch.setattr('utils.storage_urls.sign_stored_url', lambda ref: f'signed:{ref}')
        story = {
            'slug': 's', 'title': 'T', 'dek': 'D', 'status': 'review', 'updated_at': '2026-09-11T00:00:00Z',
            'body': {'sections': [{'kind': 'evidence', 'items': [{'type': 'image', 'asset_id': 'a1', 'alt': 'x'}]}], 'faq': []},
            'receipt': {'activity': 'a', 'course': 'c', 'credit': '0.5 credit', 'icon': 'ball'},
            'subject': 'Science', 'xp_awarded': 100,
        }
        assets = [{'id': 'a1', 'included': True, 'public_path': None,
                   'source_ref': 'https://x.supabase.co/storage/v1/object/public/quest-evidence/p.jpg'}]
        view = publish.public_view(story, assets, preview=True)
        items = next(s for s in view['sections'] if s['kind'] == 'evidence')['items']
        assert items[0]['url'].startswith('signed:')
        assert view['status'] == 'review'
        assert view['published_at'] == '2026-09-11T00:00:00Z'
        # And without preview the same story shows nothing it has not published.
        plain = publish.public_view(story, assets)
        assert next(s for s in plain['sections'] if s['kind'] == 'evidence')['items'] == []
