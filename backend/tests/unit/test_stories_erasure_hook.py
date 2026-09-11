"""Erasing a student takes their stories off the site, before the cascade.

The public objects are keyed by the STORY id, and stories.student_user_id
cascades, so the ids are collected first (like learning-event media), the
published rows are marked unpublished, and one rebuild is queued for the cron.
"""

from __future__ import annotations

from typing import Any, Dict, List

import pytest

from repositories import user_erasure_repository as erasure

pytestmark = pytest.mark.unit

STUDENT = 'dddddddd-dddd-dddd-dddd-dddddddddddd'


class FakeStoryRepo:
    def __init__(self, client=None, rows: List[Dict[str, Any]] = None):
        self.rows = rows if rows is not None else FakeStoryRepo.seed
        self.patches: List[tuple] = []

    def list_for_student(self, sid, statuses=None):
        return [dict(r) for r in self.rows if r['student_user_id'] == sid]

    def patch(self, sid, changes):
        self.patches.append((sid, changes))
        FakeStoryRepo.patched.append((sid, changes))


class FakeRebuildRepo:
    created: List[tuple] = []

    def __init__(self, client=None):
        pass

    def create(self, reason, status='requested', requested_at=None):
        FakeRebuildRepo.created.append((reason, status))
        return {'id': 'rb1'}


@pytest.fixture(autouse=True)
def _repos(monkeypatch):
    FakeStoryRepo.seed = [
        {'id': 's1', 'student_user_id': STUDENT, 'status': 'published'},
        {'id': 's2', 'student_user_id': STUDENT, 'status': 'review'},
        {'id': 's3', 'student_user_id': 'someone-else', 'status': 'published'},
    ]
    FakeStoryRepo.patched = []
    FakeRebuildRepo.created = []
    monkeypatch.setattr('repositories.story_repository.StoryRepository', FakeStoryRepo)
    monkeypatch.setattr('repositories.marketing_rebuild_repository.MarketingRebuildRepository',
                        FakeRebuildRepo)


def test_collects_prefixes_unpublishes_and_queues_one_rebuild():
    prefixes: List[tuple] = []
    errors: List[str] = []
    count = erasure._unpublish_stories(client=None, user_id=STUDENT, prefixes=prefixes, errors=errors)
    assert count == 1
    # Every story of the student, published or not: a review-mode story may
    # hold a public copy from an earlier publish.
    assert prefixes == [('story-assets', 'stories/s1'), ('story-assets', 'stories/s2')]
    assert [sid for sid, _ in FakeStoryRepo.patched] == ['s1']
    assert FakeStoryRepo.patched[0][1]['status'] == 'unpublished'
    assert FakeStoryRepo.patched[0][1]['unpublished_at']
    assert FakeRebuildRepo.created == [('student_erased', 'requested')]
    assert errors == []


def test_nothing_to_do_queues_nothing():
    FakeStoryRepo.seed = []
    prefixes: List[tuple] = []
    assert erasure._unpublish_stories(client=None, user_id=STUDENT, prefixes=prefixes, errors=[]) == 0
    assert prefixes == [] and FakeRebuildRepo.created == []


def test_a_failed_read_is_an_error_not_an_exception(monkeypatch):
    class Broken:
        def __init__(self, client=None):
            pass

        def list_for_student(self, sid, statuses=None):
            raise RuntimeError('db down')
    monkeypatch.setattr('repositories.story_repository.StoryRepository', Broken)
    errors: List[str] = []
    assert erasure._unpublish_stories(client=None, user_id=STUDENT, prefixes=[], errors=errors) == 0
    assert errors == ['read stories: db down']


def test_purge_user_calls_the_hook_before_the_storage_sweep(monkeypatch):
    """The hook runs first, so the prefixes it adds are in the sweep that follows."""
    order: List[str] = []
    monkeypatch.setattr(erasure, '_unpublish_stories',
                        lambda client, user_id, prefixes, errors: order.append('stories') or 0)
    monkeypatch.setattr(erasure, 'delete_storage_prefixes',
                        lambda client, prefixes, errors: order.append('storage') or 0)

    class _Q:
        def __getattr__(self, name):
            if name == 'execute':
                return lambda: type('R', (), {'data': []})()
            return lambda *a, **k: self

    class _Client:
        def table(self, name):
            return _Q()

        class auth:
            class admin:
                @staticmethod
                def delete_user(uid):
                    return None
    monkeypatch.setattr(erasure, '_delete_rows', lambda *a, **k: None)
    monkeypatch.setattr(erasure, '_null_refs', lambda *a, **k: None)
    monkeypatch.setattr(erasure, '_write_audit', lambda *a, **k: None, raising=False)
    import contextlib
    # The tail of purge_user (auth delete, audit row) is not under test here.
    with contextlib.suppress(Exception):
        erasure.purge_user(STUDENT, admin=_Client())
    assert order[:2] == ['stories', 'storage']


def test_a_missing_stories_table_does_not_block_the_erasure(monkeypatch):
    """Before the migration lands (a preview branch), there is nothing to take down."""
    class Absent:
        def __init__(self, client=None):
            pass

        def list_for_student(self, sid, statuses=None):
            raise RuntimeError('relation "stories" does not exist')
    monkeypatch.setattr('repositories.story_repository.StoryRepository', Absent)
    errors: List[str] = []
    assert erasure._unpublish_stories(client=None, user_id=STUDENT, prefixes=[], errors=errors) == 0
    assert errors == []
