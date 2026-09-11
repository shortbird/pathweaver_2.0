"""The one click, end to end, against fakes.

The happy path publishes, copies the safe image, rebuilds the site and emails
the founder. A second text leak parks the story in review with the reason.
Review mode never publishes. The gates refuse in the documented order.
"""

from __future__ import annotations

from typing import Any, Dict, List

import pytest

from app_config import Config
from services import marketing_site
from services.stories import assets as assets_mod
from services.stories import drafter as drafter_mod
from services.stories import generate, publish, safety
from services.stories.drafter import DraftResult
from services.stories.safety import ImageVerdict
from services.stories.source import (
    ImageCandidate,
    LinkCandidate,
    QuestSource,
    QuoteCandidate,
    RoundSource,
    StorySource,
    StudentSource,
    TaskSource,
)

pytestmark = pytest.mark.unit

STORY_ID = '11111111-1111-1111-1111-111111111111'
STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
COMPLETION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
REF = ('https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/'
       'quest-evidence/task-evidence/x/{n}.jpg')
VIDEO_REF = ('https://auth.optioeducation.com/storage/v1/object/public/'
             'quest-evidence/evidence-tasks/x/{n}_Dream.MP4')
MP4 = b'\x00\x00\x00\x18ftypmp42' + b'\x00' * 40


# ── fakes ────────────────────────────────────────────────────────────────────

class FakeStoryRepo:
    def __init__(self, rows: List[Dict[str, Any]]):
        self.rows = {r['id']: dict(r) for r in rows}
        self.patches: List[Dict[str, Any]] = []

    def get(self, sid): return dict(self.rows[sid]) if sid in self.rows else None
    def patch(self, sid, changes):
        self.patches.append(changes)
        self.rows[sid].update(changes)
        return dict(self.rows[sid])
    def claim_generating(self, sid, token, started_at):
        row = self.rows.get(sid)
        if not row or row['status'] != 'generating' or row.get('claim_token'):
            return False
        row.update({'claim_token': token, 'started_at': started_at})
        return True
    def finish(self, sid, token, update):
        row = self.rows.get(sid)
        if not row or row.get('claim_token') != token:
            return False
        row.update(update)
        return True
    def slug_exists(self, slug): return any(r.get('slug') == slug for r in self.rows.values())
    def list_for_student(self, student_id, statuses=None):
        return [dict(r) for r in self.rows.values() if r.get('student_user_id') == student_id
                and (not statuses or r.get('status') in statuses)]
    def list_all(self, limit=200): return [dict(r) for r in self.rows.values()]
    def generating_since_before(self, cutoff, limit=50):
        return [{'id': r['id'], 'attempts': r.get('attempts', 0)} for r in self.rows.values()
                if r['status'] == 'generating' and (r.get('started_at') or '9') < cutoff]
    def release_if_generating(self, sid, update):
        if self.rows[sid]['status'] == 'generating':
            self.rows[sid].update(update)
    def unclaimed_generating_ids(self, limit=20):
        return [r['id'] for r in self.rows.values() if r['status'] == 'generating' and not r.get('claim_token')]


class FakeAssetRepo:
    def __init__(self):
        self.rows: Dict[str, Dict[str, Any]] = {}

    def for_story(self, sid): return [dict(a) for a in self.rows.values() if a['story_id'] == sid]
    def replace_for_story(self, sid, rows):
        self.rows = {k: v for k, v in self.rows.items() if v['story_id'] != sid}
        for r in rows:
            self.rows[r['id']] = dict(r)
        return list(rows)
    def patch(self, aid, changes):
        self.rows[aid].update(changes)
        return dict(self.rows[aid])
    def clear_public_paths(self, sid):
        for a in self.rows.values():
            if a['story_id'] == sid:
                a['public_path'] = None


class FakeSourceRepo:
    def __init__(self, *, status='finalized', merged=None, confidential=False, org=None):
        self.completion_row = {'id': COMPLETION_ID, 'user_id': STUDENT_ID,
                               'diploma_status': status, 'merged_into': merged,
                               'is_confidential': confidential, 'user_quest_task_id': 't1'}
        self.student_row = {'id': STUDENT_ID, 'first_name': 'Anna', 'organization_id': org,
                            'role': 'student', 'date_of_birth': '2012-01-01'}

    def completion(self, cid): return self.completion_row if cid == COMPLETION_ID else None
    def student(self, uid): return self.student_row if uid == STUDENT_ID else None
    def user_quest(self, uid): return None


class FakeConsentRepo:
    def __init__(self, active=None): self.active = active
    def active_for_student(self, sid): return self.active


def _video(n: int) -> ImageCandidate:
    return ImageCandidate(index=n, task_index=1, block_id=f'v{n}', item_index=1,
                          source_ref=VIDEO_REF.format(n=n), mime_type='video/mp4', data=MP4,
                          label='Dream', kind='video')


def _source(images: int = 2) -> StorySource:
    student = StudentSource(user_id=STUDENT_ID, first_name='Anna', date_of_birth='2012-01-01',
                            grade_level=None, setting='homeschool', is_org_student=False,
                            organization_id=None, identity_names=['Anna', 'Lindqvist'],
                            org_names=[])
    task = TaskSource(index=1, completion_id=COMPLETION_ID, task_id='t1', title='Load test',
                      description='Test the bridge.', criteria=['Built it', 'Tested it'],
                      criteria_source='success_criteria', subject_split={'science': 150},
                      xp=150, evidence_texts=['It held 12 kg.'],
                      images=[ImageCandidate(index=n, task_index=1, block_id=f'b{n}',
                                             item_index=1, source_ref=REF.format(n=n),
                                             mime_type='image/jpeg', data=b'\xff\xd8')
                              for n in range(1, images + 1)],
                      ai_criteria=[{'index': 1, 'criterion': 'Built it', 'verdict': 'met', 'note': 'yes'}],
                      rounds=[RoundSource(1, '2026-09-01', 'approved', 'Good.', None)],
                      finalized_at='2026-09-05T00:00:00+00:00', diploma_status='finalized')
    return StorySource(source_type='credit_submission', source_id=COMPLETION_ID, student=student,
                       quest=QuestSource('q1', 'Bridge Build', 'Design a bridge.', ''), tasks=[task])


DRAFT = {
    'title': 'A bridge that held 12 kg', 'title_options': [], 'dek': 'A load test that counted.',
    'activity_slug': 'other', 'activity_label': 'A bridge build',
    'receipt': {'activity': 'Backyard bridge build', 'course': 'Science', 'credit': '0.08 credit',
                'icon': 'flask'},
    'what_they_did': 'They built it and tested it.', 'tasks': [],
    'what_it_counted_for': 'Science credit.',
    'faq': [{'q': 'Does a bridge count?', 'a': 'Yes.'}],
    'images': [{'index': 1, 'use': True, 'alt': 'A wooden bridge', 'caption': 'The bridge'},
               {'index': 2, 'use': True, 'alt': 'The table', 'caption': 'Testing'}],
    'hero_index': 1, 'search_phrases': [], 'concerns': ['Check the caption.'],
}


class FakeDrafter:
    def __init__(self, data=None): self.data = data or DRAFT
    def draft(self, source, *, student_label, safe_images, tier='anonymized'):
        self.seen = {'label': student_label, 'safe': [i.index for i in safe_images], 'tier': tier}
        return DraftResult(data=dict(self.data), model='gemini-test', prompt_version='story-draft/test',
                           usage={}, drafted_at='2026-09-11T00:00:00+00:00')


@pytest.fixture
def world(monkeypatch):
    """Every seam the run crosses, stubbed and recording."""
    story_repo = FakeStoryRepo([{
        'id': STORY_ID, 'status': 'generating', 'source_type': 'credit_submission',
        'source_id': COMPLETION_ID, 'student_user_id': STUDENT_ID, 'mode': 'auto',
        'attempts': 0, 'claim_token': None, 'tier': 'anonymized',
    }])
    asset_repo = FakeAssetRepo()
    state: Dict[str, Any] = {
        'story_repo': story_repo, 'asset_repo': asset_repo,
        'source_repo': FakeSourceRepo(), 'consent': FakeConsentRepo(),
        'ai_access': (True, None, None), 'source': _source(),
        'verdicts': [ImageVerdict(1, 'b1', 1, REF.format(n=1), 'safe', None, checked_by='g'),
                     ImageVerdict(2, 'b2', 1, REF.format(n=2), 'excluded', 'faces', faces=1)],
        'text_phrases': [], 'text_blockers': [],
        'drafter': FakeDrafter(), 'copied': [], 'rebuilds': [], 'emails': [], 'deleted': [],
    }
    monkeypatch.setattr(generate, '_repos', lambda admin=None: (story_repo, asset_repo))
    monkeypatch.setattr(publish, '_repos', lambda admin=None: (story_repo, asset_repo))
    monkeypatch.setattr('repositories.story_source_repository.StorySourceRepository',
                        lambda client=None: state['source_repo'])
    monkeypatch.setattr('repositories.promotional_consent_repository.PromotionalConsentRepository',
                        lambda client=None: state['consent'])
    monkeypatch.setattr('utils.ai_access.check_ai_access', lambda sid, strict=False: state['ai_access'])
    monkeypatch.setattr(generate, '_load', lambda row, admin: state['source'])
    monkeypatch.setattr(safety, 'check_images',
                        lambda candidates, **k: [v for v in state['verdicts']
                                                 if v.index in {c.index for c in candidates}])
    monkeypatch.setattr(drafter_mod, 'StoryDrafter', lambda: state['drafter'])

    def fake_check_text(fields, scrubber, checker=None):
        return fields, {'leaks_found': [], 'ai_phrases': state['text_phrases'],
                        'leaks_after': ['Anna'] if state['text_blockers'] else [],
                        'blockers': list(state['text_blockers']), 'model': 'g', 'error': None,
                        'checked_at': 'now'}
    monkeypatch.setattr(safety, 'check_text', fake_check_text)

    def fake_copy(story, assets, *, admin=None, repo=None):
        out = []
        for a in assets:
            if a.get('included'):
                sizeless = a.get('kind') in ('video', 'document')
                path = assets_mod.public_path_for(story['id'], a['id'], kind=a.get('kind') or 'image',
                                                  mime_type=a.get('mime_type'))
                state['copied'].append(path)
                size = {'width': None, 'height': None} if sizeless else {'width': 1600, 'height': 900}
                repo.patch(a['id'], {'public_path': path, **size})
                a = {**a, 'public_path': path, **size}
            out.append(a)
        return out
    monkeypatch.setattr(assets_mod, 'copy_to_public', fake_copy)

    def fake_delete(story, assets, *, admin=None, repo=None):
        state['deleted'].append(story['id'])
        repo.clear_public_paths(story['id'])
        return len([a for a in assets if a.get('public_path')])
    monkeypatch.setattr(assets_mod, 'delete_public', fake_delete)
    monkeypatch.setattr(marketing_site, 'request_rebuild',
                        lambda reason, repo=None: state['rebuilds'].append(reason) or {'status': 'fired'})

    class FakeEmail:
        def send_email(self, **kw):
            state['emails'].append(kw)
            return True
    monkeypatch.setattr('services.email_service.EmailService', FakeEmail)
    monkeypatch.setattr(Config, 'ADMIN_EMAIL', 'founder@example.com')
    monkeypatch.setattr(Config, 'FRONTEND_URL', 'https://app.optioeducation.com')
    monkeypatch.setattr(Config, 'MARKETING_URL', 'https://www.optioeducation.com')
    monkeypatch.setattr(Config, 'STORIES_ENABLED', True)
    return state


def _story(world) -> Dict[str, Any]:
    return world['story_repo'].get(STORY_ID)


# ── the happy path ───────────────────────────────────────────────────────────

class TestAutoPublish:
    def test_publishes_copies_rebuilds_and_emails(self, world):
        out = generate.run(STORY_ID)
        assert out['status'] == 'published'
        story = _story(world)
        assert story['status'] == 'published'
        assert story['published_at']
        assert story['slug'] == 'a-bridge-that-held-12-kg'
        assert story['tier'] == 'anonymized'
        assert story['student_label'] == 'A high school student'
        assert story['claim_token'] is None
        assert story['attempts'] == 1
        assert story['blockers'] == []

        # Only the safe image was copied, and its URL is in the body.
        assets = world['asset_repo'].for_story(STORY_ID)
        included = [a for a in assets if a['included']]
        assert len(included) == 1 and included[0]['source_block_id'] == 'b1'
        assert world['copied'] == [f'stories/{STORY_ID}/{included[0]["id"]}.jpg']
        evidence = next(s for s in story['body']['sections'] if s['kind'] == 'evidence')
        assert evidence['items'][0]['url'].startswith('https://')
        assert '/storage/v1/object/public/story-assets/stories/' in evidence['items'][0]['url']
        assert evidence['items'][0]['width'] == 1600
        assert story['hero_asset_id'] == included[0]['id']

        assert world['rebuilds'] == ['story_published']
        email = world['emails'][0]
        assert email['to_email'] == 'founder@example.com'
        assert email['subject'] == 'Story published: A bridge that held 12 kg'
        assert 'https://www.optioeducation.com/stories/a-bridge-that-held-12-kg/' in email['text_body']
        assert 'Check the caption.' in email['text_body']
        assert f'https://app.optioeducation.com/admin/stories/{STORY_ID}' in email['text_body']

    def test_the_drafter_sees_only_safe_images_and_the_generic_label(self, world):
        generate.run(STORY_ID)
        assert world['drafter'].seen == {'label': 'A high school student', 'safe': [1],
                                         'tier': 'anonymized'}

    def test_safety_verdicts_are_stored_on_the_story_and_the_assets(self, world):
        generate.run(STORY_ID)
        story = _story(world)
        assert [v['verdict'] for v in story['safety']['images']] == ['safe', 'excluded']
        assert story['safety']['text']['blockers'] == []
        excluded = next(a for a in world['asset_repo'].for_story(STORY_ID) if not a['included'])
        assert excluded['safety']['reason'] == 'faces'
        assert excluded['public_path'] is None

    def test_email_failure_does_not_fail_publish(self, world, monkeypatch):
        class Broken:
            def send_email(self, **kw):
                raise RuntimeError('sendgrid down')
        monkeypatch.setattr('services.email_service.EmailService', Broken)
        assert generate.run(STORY_ID)['status'] == 'published'
        assert _story(world)['status'] == 'published'

    def test_named_tier_with_consent(self, world):
        world['consent'] = FakeConsentRepo({'id': 'consent-1', 'scope_work': True,
                                            'scope_first_name': True, 'scope_age': True})
        generate.run(STORY_ID)
        story = _story(world)
        assert story['tier'] == 'named'
        assert story['consent_id'] == 'consent-1'
        assert story['student_label'] == 'Anna, 14'
        assert story['status'] == 'published'


class TestVideoEvidence:
    """A safe video publishes as a `video` evidence item; it is never the hero."""

    def _with_video(self, world):
        source = world['source']
        source.tasks[0].images.append(_video(3))
        world['verdicts'].append(ImageVerdict(3, 'v3', 1, VIDEO_REF.format(n=3), 'safe', None,
                                              checked_by='g'))
        world['drafter'] = FakeDrafter({
            **DRAFT,
            'images': DRAFT['images'] + [{'index': 3, 'use': True, 'alt': 'A dance routine',
                                          'caption': 'Three minutes, one take'}],
            'hero_index': 3,                                  # the model picked the video
        })

    def test_published_video_asset_yields_a_video_item_with_an_mp4_url(self, world):
        self._with_video(world)
        assert generate.run(STORY_ID)['status'] == 'published'
        story = _story(world)
        assets = {a['source_block_id']: a for a in world['asset_repo'].for_story(STORY_ID)}
        video = assets['v3']
        assert video['kind'] == 'video' and video['mime_type'] == 'video/mp4'
        assert video['included'] and video['public_path'].endswith('.mp4')
        assert video['width'] is None and video['height'] is None
        assert assets['b1']['kind'] == 'image' and assets['b1']['public_path'].endswith('.jpg')

        evidence = next(s for s in story['body']['sections'] if s['kind'] == 'evidence')
        by_type = {i['type']: i for i in evidence['items']}
        assert set(by_type) == {'image', 'video'}
        assert by_type['video']['url'].endswith(f'/story-assets/stories/{STORY_ID}/{video["id"]}.mp4')
        assert by_type['video']['alt'] == 'A dance routine'

        # The model asked for the video as hero; the hero is the first image.
        assert story['hero_asset_id'] == assets['b1']['id']

        view = publish.public_view(story, world['asset_repo'].for_story(STORY_ID))
        item = next(i for i in next(s for s in view['sections'] if s['kind'] == 'evidence')['items']
                    if i['type'] == 'video')
        assert set(item) == {'type', 'url', 'alt', 'caption'}     # no width, no height
        assert item['url'].endswith('.mp4')
        assert view['hero_image_url'].endswith('.jpg')

    def test_a_video_alone_is_never_a_hero(self, world):
        self._with_video(world)
        world['verdicts'][0] = ImageVerdict(1, 'b1', 1, REF.format(n=1), 'excluded', 'faces', faces=1)
        assert generate.run(STORY_ID)['status'] == 'published'
        story = _story(world)
        assert story['hero_asset_id'] is None
        included = [a for a in world['asset_repo'].for_story(STORY_ID) if a['included']]
        assert [a['kind'] for a in included] == ['video']
        view = publish.public_view(story, world['asset_repo'].for_story(STORY_ID))
        assert view['hero_image_url'] is None

    def test_the_video_bytes_are_dropped_after_the_safety_pass(self, world, monkeypatch):
        self._with_video(world)
        video = world['source'].tasks[0].images[-1]
        seen = {}

        def fake_check(candidates, **k):
            seen['video_bytes'] = next(c for c in candidates if c.is_video).data
            return [v for v in world['verdicts'] if v.index in {c.index for c in candidates}]
        monkeypatch.setattr(safety, 'check_images', fake_check)
        generate.run(STORY_ID)
        assert seen['video_bytes'] == MP4                        # the pass saw them
        assert video.data is None                                 # and nothing after did


PDF_REF = ('https://auth.optioeducation.com/storage/v1/object/public/'
           'quest-evidence/evidence-tasks/x/{n}_Lab%20report.pdf')
PDF = b'%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n'


def _document(n: int) -> ImageCandidate:
    return ImageCandidate(index=n, task_index=1, block_id=f'd{n}', item_index=1,
                          source_ref=PDF_REF.format(n=n), mime_type='application/pdf', data=PDF,
                          label='Lab report', kind='document',
                          excerpt='Load test results. The bridge held 12 kg.')


def _keys(value: Any) -> List[str]:
    if isinstance(value, dict):
        return [k for k in value] + [k for v in value.values() for k in _keys(v)]
    if isinstance(value, list):
        return [k for v in value for k in _keys(v)]
    return []


class TestDocumentEvidence:
    """A safe PDF publishes as a `document` item with a .pdf URL; never the hero."""

    def _with_document(self, world):
        world['source'].tasks[0].images.append(_document(3))
        world['verdicts'].append(ImageVerdict(3, 'd3', 1, PDF_REF.format(n=3), 'safe', None,
                                              checked_by='g'))
        world['drafter'] = FakeDrafter({
            **DRAFT,
            'images': DRAFT['images'] + [{'index': 3, 'use': True, 'alt': 'ignored',
                                          'caption': 'The lab report, as submitted'}],
            'hero_index': 3,                                  # the model picked the PDF
        })

    def test_published_pdf_asset_yields_a_document_item_with_a_pdf_url(self, world):
        self._with_document(world)
        assert generate.run(STORY_ID)['status'] == 'published'
        story = _story(world)
        assets = {a['source_block_id']: a for a in world['asset_repo'].for_story(STORY_ID)}
        doc = assets['d3']
        assert doc['kind'] == 'document' and doc['mime_type'] == 'application/pdf'
        assert doc['included'] and doc['public_path'].endswith('.pdf')
        assert doc['alt'] == 'Lab report'                        # the title, not the model's alt
        assert doc['caption'] == 'The lab report, as submitted'
        assert doc['width'] is None and doc['height'] is None

        evidence = next(s for s in story['body']['sections'] if s['kind'] == 'evidence')
        by_type = {i['type']: i for i in evidence['items']}
        assert set(by_type) == {'image', 'document'}
        assert by_type['document']['url'].endswith(f'/story-assets/stories/{STORY_ID}/{doc["id"]}.pdf')
        assert story['hero_asset_id'] == assets['b1']['id']     # the hero is the first image

        view = publish.public_view(story, world['asset_repo'].for_story(STORY_ID))
        item = next(i for i in next(s for s in view['sections'] if s['kind'] == 'evidence')['items']
                    if i['type'] == 'document')
        assert set(item) == {'type', 'url', 'alt', 'caption'}
        assert item['url'].endswith('.pdf') and item['alt'] == 'Lab report'
        assert view['hero_image_url'].endswith('.jpg')

    def test_a_pdf_alone_is_never_a_hero(self, world):
        self._with_document(world)
        world['verdicts'][0] = ImageVerdict(1, 'b1', 1, REF.format(n=1), 'excluded', 'faces', faces=1)
        assert generate.run(STORY_ID)['status'] == 'published'
        assert _story(world)['hero_asset_id'] is None

    def test_the_drafter_sees_the_excerpt_not_the_bytes(self, world, monkeypatch):
        self._with_document(world)
        doc = world['source'].tasks[0].images[-1]
        seen = {}

        class Peeking(FakeDrafter):
            def draft(self, source, *, student_label, safe_images, tier='anonymized'):
                from services.stories import prompt as prompt_mod
                seen['prompt'] = prompt_mod.build_prompt(source, student_label=student_label,
                                                         safe_images=safe_images, tier=tier)
                seen['parts'] = prompt_mod.build_parts(seen['prompt'], safe_images)
                seen['bytes'] = doc.data
                return super().draft(source, student_label=student_label,
                                     safe_images=safe_images, tier=tier)
        world['drafter'] = Peeking(world['drafter'].data)
        generate.run(STORY_ID)
        assert seen['bytes'] is None                              # dropped after the safety pass
        assert 'DOCUMENTS (1 passed the safety check' in seen['prompt']
        assert 'Excerpt of [I3]: Load test results.' in seen['prompt']
        assert all(not (isinstance(p, dict) and p.get('mime_type') == 'application/pdf')
                   for p in seen['parts'])


class TestQuotesAndLinks:
    """Quotes and links ride on the body, switched on or off by their verdict."""

    YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    INSTAGRAM = 'https://www.instagram.com/anna.l/'

    def _with_words_and_links(self, world, monkeypatch):
        task = world['source'].tasks[0]
        task.evidence_texts = ['It held 12 kg.', 'LEAK: ask [name] about it.']
        task.quotes = [
            QuoteCandidate(1, 1, 'b1', 1, 'It held 12 kg.', None, 'text', text_index=0),
            QuoteCandidate(2, 1, 'b2', 1, 'LEAK: ask [name] about it.', 'From notes', 'document',
                           text_index=1),
        ]
        task.links = [
            LinkCandidate(1, 1, 'l1', 1, self.YOUTUBE, 'Bridge load test', 'youtube.com',
                          provider='youtube', video_id='dQw4w9WgXcQ'),
            LinkCandidate(2, 1, 'l2', 1, self.INSTAGRAM, 'anna.l', 'instagram.com'),
        ]
        # The second quote defeats the re-scrub (the real scrubber cannot be
        # made to; this is the seam the rule is written against).
        monkeypatch.setattr(safety, 'check_quote',
                            lambda text, scrubber: (text, ['Anna'] if 'LEAK' in text else []))

    def test_anonymized_story_publishes_the_clean_quote_and_no_link(self, world, monkeypatch):
        self._with_words_and_links(world, monkeypatch)
        assert generate.run(STORY_ID)['status'] == 'published'
        story = _story(world)
        evidence = next(s for s in story['body']['sections'] if s['kind'] == 'evidence')
        standalone = [i for i in evidence['items'] if i['type'] in ('quote', 'link')]
        assert [(i['type'], i['included'], i['safety']['reason']) for i in standalone] == [
            ('quote', True, None),
            ('quote', False, 'text_leak'),
            ('link', False, 'external_link_identifies'),
            ('link', False, 'social_profile'),
        ]
        assert story['safety']['quotes'] == [
            {'index': 1, 'verdict': 'safe', 'reason': None},
            {'index': 2, 'verdict': 'excluded', 'reason': 'text_leak'}]
        assert [c for c in story['concerns'] if c.startswith(('Quote', 'Link'))] == [
            'Quote [Q2] left out: the text still identified someone after a re-scrub.',
            'Link [L1] (youtube.com) left out: an external link identifies the student in an '
            'anonymized story.',
            'Link [L2] (instagram.com) left out: the link is a social media profile.',
        ]
        assert story['blockers'] == []                            # a concern, never a blocker

        view = publish.public_view(story, world['asset_repo'].for_story(STORY_ID))
        items = next(s for s in view['sections'] if s['kind'] == 'evidence')['items']
        assert [i['type'] for i in items] == ['image', 'quote']
        assert items[1] == {'type': 'quote', 'text': 'It held 12 kg.', 'caption': None}
        keys = set(_keys(view))
        assert 'included' not in keys and 'safety' not in keys
        assert 'source_block_id' not in keys and 'source_item_index' not in keys
        assert 'LEAK' not in str(view) and 'instagram' not in str(view)

    def test_named_story_publishes_the_clean_link_and_still_no_social_profile(self, world, monkeypatch):
        self._with_words_and_links(world, monkeypatch)
        world['consent'] = FakeConsentRepo({'id': 'consent-1', 'scope_work': True,
                                            'scope_first_name': True})
        assert generate.run(STORY_ID)['status'] == 'published'
        story = _story(world)
        assert story['tier'] == 'named'
        view = publish.public_view(story, world['asset_repo'].for_story(STORY_ID))
        items = next(s for s in view['sections'] if s['kind'] == 'evidence')['items']
        assert [i['type'] for i in items] == ['image', 'quote', 'link']
        assert items[2] == {'type': 'link', 'url': self.YOUTUBE, 'alt': 'Bridge load test',
                            'caption': None}
        assert 'instagram' not in str(view)

    def test_quotes_and_links_survive_unpublish_and_republish(self, world, monkeypatch):
        self._with_words_and_links(world, monkeypatch)
        world['consent'] = FakeConsentRepo({'id': 'consent-1', 'scope_work': True})
        generate.run(STORY_ID)
        publish.unpublish(STORY_ID, user_id='admin-1')
        evidence = next(s for s in _story(world)['body']['sections'] if s['kind'] == 'evidence')
        assert [i['type'] for i in evidence['items']] == ['quote', 'quote', 'link', 'link']
        story, found = publish.publish_from_review(STORY_ID, user_id='admin-1')
        assert found == [] and story['status'] == 'published'


class TestCopyToPublic:
    """The real copy step against a fake bucket: a video goes up as-is."""

    class FakeBucket:
        def __init__(self, objects):
            self.objects = objects
            self.uploads: List[Any] = []

        def download(self, path): return self.objects[path]
        def upload(self, path, blob, options):
            self.uploads.append((path, blob, options))

    class FakeAdmin:
        def __init__(self, buckets): self.buckets = buckets
        @property
        def storage(self): return self
        def from_(self, name): return self.buckets[name]

    def _world(self, monkeypatch, *, private_objects):
        private = self.FakeBucket(private_objects)
        public = self.FakeBucket({})
        admin = self.FakeAdmin({'quest-evidence': private, 'story-assets': public})
        repo = FakeAssetRepo()

        def no_pillow(blob):
            raise AssertionError('prepare_public_image must not run for a video')
        monkeypatch.setattr(assets_mod, 'prepare_public_image', no_pillow)
        return admin, public, repo

    def test_video_uploads_the_original_bytes_with_its_content_type(self, monkeypatch):
        admin, public, repo = self._world(monkeypatch, private_objects={
            'evidence-tasks/x/3_Dream.MP4': MP4})
        asset = {'id': 'a-video', 'story_id': STORY_ID, 'source_ref': VIDEO_REF.format(n=3),
                 'kind': 'video', 'mime_type': 'video/quicktime', 'included': True,
                 'public_path': None, 'safety': {'verdict': 'safe'}}
        repo.rows[asset['id']] = dict(asset)
        out = assets_mod.copy_to_public({'id': STORY_ID}, [asset], admin=admin, repo=repo)
        path = f'stories/{STORY_ID}/a-video.mov'
        assert public.uploads == [(path, MP4, {'content-type': 'video/quicktime', 'upsert': 'true'})]
        assert out[0]['public_path'] == path
        assert out[0]['width'] is None and out[0]['height'] is None
        assert repo.rows['a-video']['public_path'] == path

    def test_a_video_type_the_bucket_refuses_is_dropped_with_a_reason(self, monkeypatch):
        admin, public, repo = self._world(monkeypatch, private_objects={
            'evidence-tasks/x/3_Dream.MP4': MP4})
        asset = {'id': 'a-video', 'story_id': STORY_ID, 'source_ref': VIDEO_REF.format(n=3),
                 'kind': 'video', 'mime_type': 'video/x-msvideo', 'included': True,
                 'public_path': None, 'safety': {'verdict': 'safe'}}
        repo.rows[asset['id']] = dict(asset)
        out = assets_mod.copy_to_public({'id': STORY_ID}, [asset], admin=admin, repo=repo)
        assert public.uploads == []
        assert out[0]['included'] is False
        assert out[0]['safety']['copy_error'] == 'unsupported_video_type'

    def test_a_pdf_uploads_the_original_bytes_as_application_pdf(self, monkeypatch):
        admin, public, repo = self._world(monkeypatch, private_objects={
            'evidence-tasks/x/3_Lab%20report.pdf': PDF})
        monkeypatch.setattr('services.credit_ai_review.evidence_loader.sniff_mime',
                            lambda blob, declared=None, filename=None: 'application/pdf')
        asset = {'id': 'a-doc', 'story_id': STORY_ID, 'source_ref': PDF_REF.format(n=3),
                 'kind': 'document', 'mime_type': 'application/pdf', 'included': True,
                 'public_path': None, 'safety': {'verdict': 'safe'}}
        repo.rows[asset['id']] = dict(asset)
        out = assets_mod.copy_to_public({'id': STORY_ID}, [asset], admin=admin, repo=repo)
        path = f'stories/{STORY_ID}/a-doc.pdf'
        assert public.uploads == [(path, PDF, {'content-type': 'application/pdf', 'upsert': 'true'})]
        assert out[0]['public_path'] == path

    def test_bytes_that_are_no_longer_a_pdf_are_not_published(self, monkeypatch):
        admin, public, repo = self._world(monkeypatch, private_objects={
            'evidence-tasks/x/3_Lab%20report.pdf': b'\xff\xd8 not a pdf'})
        monkeypatch.setattr('services.credit_ai_review.evidence_loader.sniff_mime',
                            lambda blob, declared=None, filename=None: 'image/jpeg')
        asset = {'id': 'a-doc', 'story_id': STORY_ID, 'source_ref': PDF_REF.format(n=3),
                 'kind': 'document', 'mime_type': 'application/pdf', 'included': True,
                 'public_path': None, 'safety': {'verdict': 'safe'}}
        repo.rows[asset['id']] = dict(asset)
        out = assets_mod.copy_to_public({'id': STORY_ID}, [asset], admin=admin, repo=repo)
        assert public.uploads == []
        assert out[0]['included'] is False
        assert out[0]['safety']['copy_error'] == 'unsupported_document_type'

    def test_public_path_extension_follows_the_mime(self):
        assert assets_mod.public_path_for('s', 'a') == 'stories/s/a.jpg'
        assert assets_mod.public_path_for('s', 'a', kind='video', mime_type='video/mp4') == 'stories/s/a.mp4'
        assert assets_mod.public_path_for('s', 'a', kind='video', mime_type='video/webm') == 'stories/s/a.webm'
        assert assets_mod.public_path_for('s', 'a', kind='video', mime_type='video/quicktime') == 'stories/s/a.mov'
        assert assets_mod.public_path_for('s', 'a', kind='document') == 'stories/s/a.pdf'


class TestLandsInReview:
    def test_second_text_leak_parks_the_story_with_the_reason(self, world):
        world['text_blockers'] = ['text_leak']
        out = generate.run(STORY_ID)
        assert out['status'] == 'review'
        story = _story(world)
        assert story['status'] == 'review'
        assert [b['code'] for b in story['blockers']] == ['text_leak']
        assert world['copied'] == [] and world['rebuilds'] == [] and world['emails'] == []

    def test_anonymized_story_may_not_show_a_face_even_if_the_drafter_chose_it(self, world):
        """apply_verdicts drops it first; if a row still claimed included, blockers catch it."""
        world['verdicts'][1] = ImageVerdict(2, 'b2', 1, REF.format(n=2), 'safe', None, faces=1)
        out = generate.run(STORY_ID)
        assert out['status'] == 'review'
        assert 'faces_in_anonymized' in [b['code'] for b in _story(world)['blockers']]

    def test_empty_title_blocks(self, world):
        world['drafter'] = FakeDrafter({**DRAFT, 'title': ''})
        generate.run(STORY_ID)
        assert 'empty_title' in [b['code'] for b in _story(world)['blockers']]
        assert _story(world)['status'] == 'review'

    def test_review_mode_never_publishes(self, world):
        world['story_repo'].rows[STORY_ID]['mode'] = 'review'
        out = generate.run(STORY_ID)
        assert out['status'] == 'review'
        story = _story(world)
        assert story['status'] == 'review'
        assert story['title'] == 'A bridge that held 12 kg'
        assert story['blockers'] == []                       # nothing wrong, just parked
        assert world['copied'] == [] and world['rebuilds'] == [] and world['emails'] == []

    def test_publish_from_review_then_unpublish(self, world):
        world['story_repo'].rows[STORY_ID]['mode'] = 'review'
        generate.run(STORY_ID)
        story, found = publish.publish_from_review(STORY_ID, user_id='admin-1')
        assert found == [] and story['status'] == 'published'
        assert world['rebuilds'] == ['story_published']
        assert len(world['copied']) == 1

        down = publish.unpublish(STORY_ID, user_id='admin-1')
        assert down['status'] == 'unpublished' and down['unpublished_at']
        assert world['deleted'] == [STORY_ID]
        assert world['rebuilds'] == ['story_published', 'story_unpublished']
        evidence = next(s for s in _story(world)['body']['sections'] if s['kind'] == 'evidence')
        assert evidence['items'] == []


class TestGates:
    @pytest.mark.parametrize('setup, code', [
        (dict(status='pending_review'), 'source_not_finalized'),
        (dict(merged='c9'), 'merged'),
        (dict(confidential=True), 'confidential'),
    ])
    def test_refusals_by_source_state(self, world, setup, code):
        world['source_repo'] = FakeSourceRepo(**setup)
        out = generate.run(STORY_ID)
        assert out == {'status': 'failed', 'reason': code}
        story = _story(world)
        assert story['status'] == 'failed'
        assert story['blockers'][0]['code'] == code
        assert story['claim_token'] is None
        assert world['drafter'].__dict__.get('seen') is None

    def test_ai_disabled_refuses_before_loading(self, world, monkeypatch):
        world['ai_access'] = (False, {'code': 'DEPENDENT_AI_DISABLED', 'message': 'off'}, 403)
        loaded = []
        monkeypatch.setattr(generate, '_load', lambda row, admin: loaded.append(1))
        out = generate.run(STORY_ID)
        assert out == {'status': 'failed', 'reason': 'ai_disabled'}
        assert loaded == []

    def test_gate_order_merged_before_confidential(self, world):
        world['source_repo'] = FakeSourceRepo(merged='c9', confidential=True)
        assert generate.run(STORY_ID)['reason'] == 'merged'


class TestClaimAndFailure:
    def test_second_worker_cannot_claim(self, world):
        world['story_repo'].rows[STORY_ID]['claim_token'] = 'someone-else'
        assert generate.run(STORY_ID) == {'status': 'not_claimed', 'story_id': STORY_ID}

    def test_an_exception_lands_in_failed_never_raises(self, world, monkeypatch):
        monkeypatch.setattr(generate, '_load', lambda row, admin: (_ for _ in ()).throw(RuntimeError('boom')))
        out = generate.run(STORY_ID)
        assert out['status'] == 'failed'
        story = _story(world)
        assert story['status'] == 'failed' and story['error'] == 'boom'
        assert story['claim_token'] is None

    def test_requeue_stale_then_fail_after_budget(self, world):
        world['story_repo'].rows[STORY_ID].update({'claim_token': 'dead', 'started_at': '2000-01-01T00:00:00+00:00'})
        assert generate.requeue_stale() == 1
        row = world['story_repo'].rows[STORY_ID]
        assert row['status'] == 'generating' and row['claim_token'] is None and row['attempts'] == 1
        row.update({'claim_token': 'dead-again', 'started_at': '2000-01-01T00:00:00+00:00'})
        assert generate.requeue_stale() == 1
        assert world['story_repo'].rows[STORY_ID]['status'] == 'failed'

    def test_unpublish_all_for_student_takes_named_only_when_asked(self, world):
        repo = world['story_repo']
        repo.rows['s2'] = {'id': 's2', 'status': 'published', 'student_user_id': STUDENT_ID,
                           'tier': 'named', 'body': {'sections': []}}
        repo.rows['s3'] = {'id': 's3', 'status': 'published', 'student_user_id': STUDENT_ID,
                           'tier': 'anonymized', 'body': {'sections': []}}
        assert publish.unpublish_all_for_student(STUDENT_ID, tier='named') == 1
        assert repo.rows['s2']['status'] == 'unpublished'
        assert repo.rows['s3']['status'] == 'published'
        assert world['rebuilds'] == ['consent_revoked']
        assert publish.unpublish_all_for_student(STUDENT_ID, reason='student_erased') == 1
        assert repo.rows['s3']['status'] == 'unpublished'
