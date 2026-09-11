"""A video upload becomes a media candidate; the evidence loader never sees it.

The loader is for feeding a model a whole submission within one request. A
story wants a video's bytes once, for the safety pass, and then a pointer -- so
`build_task` takes stored video uploads out of the loader's view, downloads
them itself through assets._download, and appends `kind='video'` candidates
after the images. Anything too large, unreadable or not actually a video is
skipped with a flag the founder reads as a concern.
"""

from __future__ import annotations

from typing import Any, Dict, List

import pytest

from services.credit_ai_review import evidence_loader
from services.stories import assets as assets_mod
from services.stories import source as source_mod
from services.stories import source_completion
from services.stories.source import ImageCandidate, MediaCandidate

pytestmark = pytest.mark.unit

STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
COMPLETION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
QUEST_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
USER_QUEST_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

VIDEO_URL = ('https://auth.optioeducation.com/storage/v1/object/public/quest-evidence/'
             'evidence-tasks/11111111-1111-1111-1111-111111111111/'
             '22222222-2222-2222-2222-222222222222_Dream%203.MP4')
MP4 = b'\x00\x00\x00\x18ftypmp42' + b'\x00' * 40


def _video_block(url=VIDEO_URL, title='Dream 3.MP4', **extra) -> Dict[str, Any]:
    item = {'url': url, 'title': title, 'filename': title, **extra}
    return {'id': 'v1', 'block_type': 'video', 'content': {'items': [item]}}


TEXT_BLOCK = {'id': 'b1', 'block_type': 'text', 'content': {'text': 'Maya danced for three minutes.'}}


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
                'user_quest_id': USER_QUEST_ID, 'title': 'Perform the dance',
                'description': 'Film a three minute routine.', 'pillar': 'arts', 'xp_value': 100,
                'diploma_subjects': {'Fine Arts': 100}, 'subject_xp_distribution': None,
                'success_criteria': ['Performed it'], 'source_moment_id': None}

    def quest(self, qid): return {'id': qid, 'title': 'Dance', 'description': '', 'big_idea': ''}
    def user_quest(self, uid): return {'id': uid, 'reflection_notes': None, 'completed_at': None}
    def student(self, uid):
        return {'id': uid, 'first_name': 'Maya', 'last_name': 'Reyes', 'display_name': None,
                'preferred_name': None, 'role': 'student', 'organization_id': None,
                'date_of_birth': None} if uid == STUDENT_ID else None
    def parent_rows(self, student): return []
    def org_name(self, org_id): return None
    def active_academy_enrollment(self, uid): return None


@pytest.fixture(autouse=True)
def _no_ai_review(monkeypatch):
    monkeypatch.setattr(
        'repositories.credit_ai_review_repository.CreditAIReviewRepository.latest_complete_for_completion',
        lambda self, cid: None)


@pytest.fixture
def storage(monkeypatch):
    """The private bucket, as far as the story worker can tell."""
    state: Dict[str, Any] = {'objects': {VIDEO_URL: MP4}, 'downloads': [], 'sniff': 'video/mp4',
                             'listed_size': None, 'probes': []}

    def fake_download(admin, source_ref):
        state['downloads'].append(source_ref)
        return state['objects'].get(source_ref)

    def fake_size(admin, source_ref):
        state['probes'].append(source_ref)
        return state['listed_size']

    monkeypatch.setattr(assets_mod, '_download', fake_download)
    monkeypatch.setattr(assets_mod, 'object_size', fake_size)
    monkeypatch.setattr(assets_mod, '_admin_client', lambda admin=None: 'admin-sentinel')
    monkeypatch.setattr(evidence_loader, 'sniff_mime',
                        lambda blob, declared=None, filename=None: state['sniff'])
    return state


def _load(snapshot, **kw):
    return source_completion.load(COMPLETION_ID, repo=FakeRepo(snapshot), admin=None, **kw)


class TestVideoCandidates:
    def test_a_video_block_becomes_a_video_candidate(self, storage):
        source = _load([TEXT_BLOCK, _video_block()])
        task = source.tasks[0]
        assert task.evidence_texts == ['[name] danced for three minutes.']
        assert len(task.images) == 1
        video = task.images[0]
        assert isinstance(video, ImageCandidate) and MediaCandidate is ImageCandidate
        assert video.kind == 'video' and video.is_video
        assert video.index == 1 and video.task_index == 1
        assert video.block_id == 'v1' and video.item_index == 1
        assert video.mime_type == 'video/mp4'
        assert video.data == MP4
        assert video.label == 'Dream 3'                          # title, extension gone
        assert video.file_name == 'Dream 3.MP4'
        assert video.source_ref == source_mod.canonical_stored_url(VIDEO_URL)
        assert 'quest-evidence' in video.source_ref
        assert task.evidence_flags == []
        assert storage['downloads'] == [VIDEO_URL]
        assert source.video_candidates == [video]

    def test_the_label_is_scrubbed(self, storage):
        source = _load([_video_block(title='Maya Reyes solo.mov')])
        assert source.tasks[0].images[0].label == '[name] [name] solo'

    def test_an_oversized_video_is_skipped_with_a_flag(self, storage, monkeypatch):
        monkeypatch.setattr(source_mod, 'MAX_VIDEO_SIZE', len(MP4) - 1)
        source = _load([_video_block()])
        task = source.tasks[0]
        assert task.images == []
        assert task.evidence_flags == ['[E1] Dream 3: the video is too large for a story']

    def test_a_declared_size_over_the_ceiling_is_not_even_downloaded(self, storage, monkeypatch):
        monkeypatch.setattr(source_mod, 'MAX_VIDEO_SIZE', 1000)
        source = _load([_video_block(file_size=5000)])
        assert source.tasks[0].images == []
        assert source.tasks[0].evidence_flags == ['[E1] Dream 3: the video is too large for a story']
        assert storage['downloads'] == []

    def test_the_bucket_listing_is_asked_before_the_download(self, storage, monkeypatch):
        monkeypatch.setattr(source_mod, 'MAX_VIDEO_SIZE', 1000)
        storage['listed_size'] = 500 * 1024 * 1024
        source = _load([_video_block()])
        assert source.tasks[0].images == []
        assert source.tasks[0].evidence_flags == ['[E1] Dream 3: the video is too large for a story']
        assert storage['probes'] == [VIDEO_URL]
        assert storage['downloads'] == []

    def test_an_unknown_listing_size_falls_through_to_the_download(self, storage):
        storage['listed_size'] = None
        source = _load([_video_block()])
        assert len(source.tasks[0].images) == 1
        assert storage['downloads'] == [VIDEO_URL]

    def test_a_non_video_mime_is_skipped(self, storage):
        storage['sniff'] = 'image/jpeg'
        source = _load([_video_block()])
        assert source.tasks[0].images == []
        assert source.tasks[0].evidence_flags == ['[E1] Dream 3: the file is not a video (image/jpeg)']

    def test_an_unreadable_object_is_skipped(self, storage):
        storage['objects'] = {}
        source = _load([_video_block()])
        assert source.tasks[0].images == []
        assert source.tasks[0].evidence_flags == ['[E1] Dream 3: the video could not be read']

    def test_load_images_false_downloads_nothing(self, storage):
        source = _load([TEXT_BLOCK, _video_block()], load_images=False)
        assert source.tasks[0].images == []
        assert source.tasks[0].evidence_texts == []
        assert storage['downloads'] == []

    def test_release_videos_drops_only_video_bytes(self, storage):
        source = _load([_video_block()])
        image = ImageCandidate(index=2, task_index=1, block_id='i', item_index=1,
                               source_ref='x', mime_type='image/jpeg', data=b'\xff\xd8')
        source.tasks[0].images.append(image)
        source.release_videos()
        assert source.tasks[0].images[0].data is None
        assert image.data == b'\xff\xd8'
        source.release_images()
        assert image.data is None

    def test_videos_never_reach_the_evidence_loader(self, storage, monkeypatch):
        seen: List[Any] = []
        real = evidence_loader.load_evidence

        def spy(snapshot, **kw):
            seen.append(snapshot)
            return real(snapshot, **kw)
        monkeypatch.setattr(evidence_loader, 'load_evidence', spy)
        _load([TEXT_BLOCK, _video_block()])
        assert len(seen) == 1
        loader_blocks = seen[0]
        assert len(loader_blocks) == 2                           # block positions are kept
        assert loader_blocks[0] == TEXT_BLOCK
        assert loader_blocks[1]['block_type'] == 'video'
        assert loader_blocks[1]['content'] == {'items': []}


class TestSplitStoredVideos:
    YOUTUBE = {'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'title': 'Rehearsal'}

    def test_a_pasted_youtube_link_stays_with_the_loader(self):
        block = {'id': 'v1', 'block_type': 'video', 'content': {'items': [self.YOUTUBE]}}
        loader, index_map, videos = source_mod._split_stored_videos([block])
        assert loader == [block] and index_map == {} and videos == []

    def test_a_mixed_block_keeps_item_indexes_aligned(self):
        stored = {'url': VIDEO_URL, 'title': 'Dream 3.MP4'}
        block = {'id': 'v1', 'block_type': 'video', 'content': {'items': [stored, self.YOUTUBE]}}
        loader, index_map, videos = source_mod._split_stored_videos([TEXT_BLOCK, block])
        assert loader[0] == TEXT_BLOCK
        assert loader[1]['content'] == {'items': [self.YOUTUBE]}
        assert index_map == {(2, 1): 2}                          # loader's item 1 was item 2
        assert [(b, i) for b, i, _, _ in videos] == [(2, 1)]

    def test_a_stored_upload_in_a_non_video_block_is_not_taken(self):
        block = {'id': 'f1', 'block_type': 'file', 'content': {'items': [{'url': VIDEO_URL}]}}
        loader, index_map, videos = source_mod._split_stored_videos([block])
        assert loader == [block] and videos == []


class TestObjectSize:
    class FakeBucket:
        def __init__(self, rows, fail=False):
            self.rows, self.fail, self.calls = rows, fail, []

        def list(self, folder, options=None):
            self.calls.append((folder, options))
            if self.fail:
                raise RuntimeError('storage down')
            return self.rows

    class FakeAdmin:
        def __init__(self, bucket): self.bucket = bucket
        @property
        def storage(self): return self
        def from_(self, name): return self.bucket

    def test_reads_the_size_of_the_named_object_with_the_path_decoded(self):
        bucket = self.FakeBucket([
            {'name': 'other.MP4', 'metadata': {'size': 1}},
            {'name': '22222222-2222-2222-2222-222222222222_Dream 3.MP4', 'metadata': {'size': 4242}},
        ])
        assert assets_mod.object_size(self.FakeAdmin(bucket), VIDEO_URL) == 4242
        folder, options = bucket.calls[0]
        assert folder == 'evidence-tasks/11111111-1111-1111-1111-111111111111'
        assert options['search'] == '22222222-2222-2222-2222-222222222222_Dream 3.MP4'

    def test_none_when_the_listing_fails_or_does_not_name_it(self):
        assert assets_mod.object_size(self.FakeAdmin(self.FakeBucket([], fail=True)), VIDEO_URL) is None
        assert assets_mod.object_size(self.FakeAdmin(self.FakeBucket([{'name': 'x'}])), VIDEO_URL) is None
        assert assets_mod.object_size(self.FakeAdmin(self.FakeBucket([])), 'https://youtube.com/w') is None


def test_strip_extension():
    assert source_mod._strip_extension('Dream 3.MP4') == 'Dream 3'
    assert source_mod._strip_extension('a/b/clip.webm') == 'clip'
    assert source_mod._strip_extension('no extension') == 'no extension'
    assert source_mod._strip_extension('v2.0 final') == 'v2.0 final'
    assert source_mod._strip_extension('') == ''
