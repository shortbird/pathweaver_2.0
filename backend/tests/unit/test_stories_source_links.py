"""External links: named tier only, never a social profile, never copied.

A `link` block (YouTube, Vimeo, a website, a Google Doc) becomes a `link`
evidence item with the URL and a scrubbed title. In the anonymized tier every
external link is excluded (`external_link_identifies`): a URL to anything a
student controls identifies them. In the named tier a link is included when
its URL and title pass the leak scan. A social host is excluded in both tiers
(`social_profile`). Links are not assets; nothing is fetched or copied here.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import pytest

from services.credit_ai_review import evidence_loader
from services.credit_ai_review.fetchers import Fetched
from services.stories import safety
from services.stories import source_completion
from services.stories.anonymize import Scrubber
from services.stories.drafter import DraftResult, assemble
from services.stories.publish import public_view
from services.stories.source import LinkCandidate, link_video

pytestmark = pytest.mark.unit

STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
COMPLETION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
QUEST_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
USER_QUEST_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
VIMEO = 'https://vimeo.com/123456789'
SITE = 'https://bridges.example.com/load-test'
INSTAGRAM = 'https://www.instagram.com/maya.reyes/'
GOOGLE_DOC = 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit'


def _link_block(url: str, title: Optional[str] = None, block_id: str = 'l1',
                block_type: str = 'link') -> Dict[str, Any]:
    item: Dict[str, Any] = {'url': url}
    if title is not None:
        item['title'] = title
    return {'id': block_id, 'block_type': block_type, 'content': {'items': [item]}}


class FakeRepo:
    def __init__(self, snapshot: List[Dict[str, Any]]):
        self.snapshot = snapshot

    def completion(self, cid):
        if cid != COMPLETION_ID:
            return None
        return {'id': cid, 'user_id': STUDENT_ID, 'quest_id': QUEST_ID, 'task_id': None,
                'user_quest_task_id': 't1', 'completed_at': '2026-09-01', 'is_confidential': False,
                'diploma_status': 'finalized', 'revision_number': 1,
                'finalized_at': '2026-09-05T00:00:00+00:00', 'merged_into': None}

    def rounds_for_completion(self, cid):
        return [{'id': 'r1', 'completion_id': cid, 'round_number': 1,
                 'evidence_snapshot': self.snapshot, 'submitted_at': '2026-09-02T00:00:00+00:00',
                 'reviewer_action': 'approved', 'reviewer_feedback': None,
                 'approved_subjects': None, 'reviewed_at': '2026-09-05'}]

    def task(self, tid):
        return {'id': tid, 'user_id': STUDENT_ID, 'quest_id': QUEST_ID,
                'user_quest_id': USER_QUEST_ID, 'title': 'Film the load test',
                'description': 'Film it.', 'pillar': 'stem', 'xp_value': 100,
                'diploma_subjects': {'Science': 100}, 'subject_xp_distribution': None,
                'success_criteria': ['Filmed it'], 'source_moment_id': None}

    def quest(self, qid): return {'id': qid, 'title': 'Bridge', 'description': '', 'big_idea': ''}
    def user_quest(self, uid): return {'id': uid, 'reflection_notes': None, 'completed_at': None}
    def student(self, uid):
        return {'id': uid, 'first_name': 'Maya', 'last_name': 'Reyes', 'display_name': None,
                'preferred_name': None, 'role': 'student', 'organization_id': None,
                'date_of_birth': None} if uid == STUDENT_ID else None
    def parent_rows(self, student): return []
    def org_name(self, org_id): return None
    def active_academy_enrollment(self, uid): return None


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    """No network: oEmbed answers from a table, every other fetch fails politely."""
    monkeypatch.setattr(
        'repositories.credit_ai_review_repository.CreditAIReviewRepository.latest_complete_for_completion',
        lambda self, cid: None)
    oembed = {'dQw4w9WgXcQ': 'Bridge load test — Maya Reyes — filmed in the garage',
              '123456789': 'Rehearsal'}
    calls: Dict[str, List[Any]] = {'oembed': [], 'fetch': []}

    def fake_oembed(source, video_id):
        calls['oembed'].append((source, video_id))
        return oembed.get(video_id)

    def fake_fetch(url, *, max_bytes, accept=None):
        calls['fetch'].append(url)
        return Fetched(ok=False, reason='the link could not be opened')

    monkeypatch.setattr(evidence_loader.fetchers, 'fetch_oembed', fake_oembed)
    monkeypatch.setattr(evidence_loader.fetchers, 'fetch_bytes', fake_fetch)
    monkeypatch.setattr(evidence_loader.fetchers, 'fetch_google_export',
                        lambda source, extracted, max_bytes: Fetched(ok=False, reason='not public'))
    return calls


def _load(snapshot):
    return source_completion.load(COMPLETION_ID, repo=FakeRepo(snapshot), admin=None)


class TestLinkCandidates:
    def test_a_youtube_link_is_a_candidate_with_the_oembed_title(self, offline):
        source = _load([_link_block(YOUTUBE, block_type='video')])
        task = source.tasks[0]
        assert task.images == []                                   # nothing to copy
        assert len(task.links) == 1
        link = task.links[0]
        assert isinstance(link, LinkCandidate)
        assert link.url == YOUTUBE
        assert link.title == 'Bridge load test'                    # title only, never the author
        assert link.host == 'youtube.com'
        assert (link.provider, link.video_id) == ('youtube', 'dQw4w9WgXcQ')
        assert link.block_id == 'l1' and link.item_index == 1
        # The loader read the oEmbed record (no file_uri part in a story).
        assert offline['oembed'] == [('youtube', 'dQw4w9WgXcQ')]
        assert task.evidence_texts == ['Bridge load test — [name] [name] — filmed in the garage']
        assert source.link_candidates == [link]

    def test_the_students_own_title_wins_and_is_scrubbed(self, offline):
        source = _load([_link_block(SITE, title='Maya Reyes: my bridge site')])
        link = source.tasks[0].links[0]
        assert link.title == '[name] [name]: my bridge site'
        assert (link.provider, link.video_id) == (None, None)

    def test_an_unreachable_site_is_still_a_link_named_by_its_host(self, offline):
        source = _load([_link_block(SITE)])
        link = source.tasks[0].links[0]
        assert link.title == 'bridges.example.com'
        assert offline['fetch'] == [SITE]
        assert source.tasks[0].evidence_flags == [
            f'[E1] {SITE}: the link could not be opened']

    def test_a_google_doc_is_a_link(self, offline):
        source = _load([_link_block(GOOGLE_DOC, title='Reflection')])
        assert [link.host for link in source.tasks[0].links] == ['docs.google.com']

    def test_links_are_numbered_across_blocks_in_order(self, offline):
        source = _load([_link_block(YOUTUBE, block_id='l1'), _link_block(VIMEO, block_id='l2')])
        assert [(link.index, link.provider, link.video_id) for link in source.tasks[0].links] == [
            (1, 'youtube', 'dQw4w9WgXcQ'), (2, 'vimeo', '123456789')]


class TestLinkRules:
    scrubber = Scrubber(['Maya', 'Reyes'])

    def _links(self, *urls):
        return [LinkCandidate(index=i, task_index=1, block_id=f'l{i}', item_index=1, url=url,
                              title='A title', host=url.split('/')[2].replace('www.', ''))
                for i, url in enumerate(urls, start=1)]

    def test_anonymized_tier_excludes_every_external_link(self):
        verdicts = safety.check_links(self._links(YOUTUBE, VIMEO, SITE, GOOGLE_DOC),
                                      tier='anonymized', scrubber=self.scrubber)
        assert [(v.verdict, v.reason) for v in verdicts] == [
            ('excluded', 'external_link_identifies')] * 4

    def test_named_tier_includes_a_clean_link(self):
        verdicts = safety.check_links(self._links(YOUTUBE, SITE), tier='named',
                                      scrubber=self.scrubber)
        assert [(v.verdict, v.reason) for v in verdicts] == [('safe', None), ('safe', None)]

    def test_social_hosts_are_excluded_in_both_tiers(self):
        socials = ['https://www.instagram.com/x/', 'https://tiktok.com/@x', 'https://facebook.com/x',
                   'https://x.com/x', 'https://twitter.com/x', 'https://snapchat.com/add/x',
                   'https://www.linkedin.com/in/x', 'https://m.facebook.com/x']
        for tier in ('anonymized', 'named'):
            verdicts = safety.check_links(self._links(*socials), tier=tier, scrubber=self.scrubber)
            assert {(v.verdict, v.reason) for v in verdicts} == {('excluded', 'social_profile')}, tier

    def test_named_tier_refuses_a_leaking_url_or_title(self):
        leaky_url = self._links('https://example.com/students/maya-reyes')
        assert safety.decide_link(leaky_url[0].url, 'A title', tier='named',
                                  scrubber=self.scrubber) == ('excluded', 'text_leak')
        assert safety.decide_link(SITE, 'Maya at the bridge', tier='named',
                                  scrubber=self.scrubber) == ('excluded', 'text_leak')
        assert safety.decide_link('https://youtube.com/@mayareyes', 'A title', tier='named',
                                  scrubber=self.scrubber) == ('excluded', 'text_leak')

    def test_named_tier_refuses_http(self):
        assert safety.decide_link('http://bridges.example.com/', 'A title', tier='named',
                                  scrubber=self.scrubber) == ('excluded', 'insecure_url')

    def test_social_beats_tier(self):
        assert safety.decide_link(INSTAGRAM, 'A title', tier='anonymized',
                                  scrubber=self.scrubber) == ('excluded', 'social_profile')


class TestYouTubeIds:
    @pytest.mark.parametrize('url, expected', [
        ('https://www.youtube.com/watch?v=dQw4w9WgXcQ', ('youtube', 'dQw4w9WgXcQ')),
        ('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', ('youtube', 'dQw4w9WgXcQ')),
        ('https://youtu.be/dQw4w9WgXcQ', ('youtube', 'dQw4w9WgXcQ')),
        ('https://youtu.be/dQw4w9WgXcQ?si=abc', ('youtube', 'dQw4w9WgXcQ')),
        ('https://www.youtube.com/embed/dQw4w9WgXcQ', ('youtube', 'dQw4w9WgXcQ')),
        ('https://www.youtube.com/shorts/dQw4w9WgXcQ', ('youtube', 'dQw4w9WgXcQ')),
        ('https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ', ('youtube', 'dQw4w9WgXcQ')),
        ('https://vimeo.com/123456789', ('vimeo', '123456789')),
        ('https://player.vimeo.com/video/123456789', ('vimeo', '123456789')),
        ('https://bridges.example.com/load-test', (None, None)),
        ('https://www.youtube.com/', (None, None)),
        ('', (None, None)),
    ])
    def test_extraction(self, url, expected):
        assert link_video(url) == expected


DRAFT = {
    'title': 'A bridge that held', 'title_options': [], 'dek': 'It held.',
    'activity_slug': 'other', 'activity_label': 'A bridge', 'receipt': {},
    'what_they_did': 'They built it.', 'tasks': [], 'what_it_counted_for': 'Credit.',
    'faq': [], 'images': [], 'hero_index': 0, 'search_phrases': [], 'concerns': [],
}


def _assemble(source, tier):
    result = DraftResult(data=dict(DRAFT), model='gemini-test', prompt_version='story-draft/test',
                         usage={}, drafted_at='2026-09-11T00:00:00+00:00')
    return assemble(source, result, student_label='A student', tier=tier, verdicts=[],
                    scrubber=Scrubber(['Maya Reyes']), slug_exists=lambda s: False,
                    story_id='story-1')


class TestAssembledLinks:
    def test_anonymized_story_carries_the_links_switched_off_with_concerns(self, offline):
        source = _load([_link_block(YOUTUBE, block_id='l1', block_type='video'),
                        _link_block(INSTAGRAM, block_id='l2')])
        out = _assemble(source, 'anonymized')
        evidence = next(s for s in out['story']['body']['sections'] if s['kind'] == 'evidence')
        assert [i['type'] for i in evidence['items']] == ['link', 'link']
        youtube, instagram = evidence['items']
        assert youtube == {
            'type': 'link', 'url': YOUTUBE, 'alt': 'Bridge load test', 'caption': None,
            'source_block_id': 'l1', 'source_item_index': 1, 'included': False,
            'safety': {'verdict': 'excluded', 'reason': 'external_link_identifies'},
        }
        assert instagram['safety'] == {'verdict': 'excluded', 'reason': 'social_profile'}
        # After the loader's own "not read" flag for the page it could not fetch.
        assert out['story']['concerns'][-2:] == [
            'Link [L1] (youtube.com) left out: an external link identifies the student in an '
            'anonymized story.',
            'Link [L2] (instagram.com) left out: the link is a social media profile.',
        ]
        # And none of it reaches the page.
        story = {**out['story'], 'id': 'story-1', 'status': 'published'}
        view = public_view(story, [])
        assert next(s for s in view['sections'] if s['kind'] == 'evidence')['items'] == []

    def test_named_story_publishes_the_clean_link_only(self, offline):
        source = _load([_link_block(YOUTUBE, block_id='l1', block_type='video'),
                        _link_block(INSTAGRAM, block_id='l2')])
        out = _assemble(source, 'named')
        evidence = next(s for s in out['story']['body']['sections'] if s['kind'] == 'evidence')
        assert [i['included'] for i in evidence['items']] == [True, False]
        story = {**out['story'], 'id': 'story-1', 'status': 'published'}
        view = public_view(story, [])
        items = next(s for s in view['sections'] if s['kind'] == 'evidence')['items']
        assert items == [{'type': 'link', 'url': YOUTUBE, 'alt': 'Bridge load test', 'caption': None}]
