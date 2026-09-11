"""Rebuilding the static site: debounced through the table, never raising.

An unset hook records skipped. Inside the interval a request waits; the
sweep fires one deploy for all of them and marks the rest coalesced. A hook
that fails records failed and the publish that asked is unaffected.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

from app_config import Config
from services import marketing_site

pytestmark = pytest.mark.unit


class FakeRebuildRepo:
    def __init__(self, rows: Optional[List[Dict[str, Any]]] = None):
        self.rows = list(rows or [])
        self.n = len(self.rows)

    def create_request(self, reason, status='requested', requested_at=None):
        self.n += 1
        row = {'id': f'rb{self.n}', 'reason': reason, 'status': status, 'fired_at': None,
               'requested_at': requested_at or datetime.now(timezone.utc).isoformat()}
        self.rows.append(row)
        return row

    def last_fired_at(self):
        fired = [r['fired_at'] for r in self.rows if r['status'] == 'fired' and r.get('fired_at')]
        return max(fired) if fired else None

    def requested(self, limit=200):
        return [r for r in self.rows if r['status'] == 'requested']

    def patch(self, rid, changes):
        for r in self.rows:
            if r['id'] == rid:
                r.update(changes)

    def mark_many(self, ids, changes):
        for r in self.rows:
            if r['id'] in ids:
                r.update(changes)

    def by_id(self, rid):
        return next(r for r in self.rows if r['id'] == rid)


@pytest.fixture
def posts(monkeypatch):
    calls: List[Dict[str, Any]] = []
    state = {'status': 200, 'text': 'ok', 'raise': None}

    def fake_post(url, timeout=None):
        calls.append({'url': url, 'timeout': timeout})
        if state['raise']:
            raise state['raise']
        return SimpleNamespace(status_code=state['status'], text=state['text'])

    monkeypatch.setattr(marketing_site.requests, 'post', fake_post)
    monkeypatch.setattr(Config, 'MARKETING_DEPLOY_HOOK_URL', 'https://api.render.com/deploy/x')
    monkeypatch.setattr(Config, 'MARKETING_REBUILD_MIN_INTERVAL_SECONDS', 300)
    return calls, state


def _ago(seconds: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat()


class TestRequestRebuild:
    def test_unset_hook_records_skipped(self, monkeypatch):
        monkeypatch.setattr(Config, 'MARKETING_DEPLOY_HOOK_URL', None)
        repo = FakeRebuildRepo()
        out = marketing_site.request_rebuild('story_published', repo=repo)
        assert out['status'] == 'skipped'
        assert repo.rows[0]['status'] == 'skipped'

    def test_first_request_fires_the_hook(self, posts):
        calls, _ = posts
        repo = FakeRebuildRepo()
        out = marketing_site.request_rebuild('story_published', repo=repo)
        assert out['status'] == 'fired'
        assert calls == [{'url': 'https://api.render.com/deploy/x', 'timeout': 10}]
        row = repo.rows[0]
        assert row['status'] == 'fired' and row['fired_at'] and row['response'] == '200 ok'

    def test_inside_the_interval_the_request_waits(self, posts):
        calls, _ = posts
        repo = FakeRebuildRepo([{'id': 'old', 'reason': 'x', 'status': 'fired',
                                 'fired_at': _ago(60)}])
        out = marketing_site.request_rebuild('story_published', repo=repo)
        assert out == {'status': 'requested', 'id': 'rb2', 'deferred': True}
        assert calls == []
        assert repo.by_id('rb2')['status'] == 'requested'

    def test_after_the_interval_it_fires_and_coalesces_the_waiting(self, posts):
        calls, _ = posts
        repo = FakeRebuildRepo([
            {'id': 'old', 'reason': 'x', 'status': 'fired', 'fired_at': _ago(600)},
            {'id': 'w1', 'reason': 'y', 'status': 'requested', 'fired_at': None},
        ])
        out = marketing_site.request_rebuild('story_unpublished', repo=repo)
        assert out['status'] == 'fired'
        assert len(calls) == 1
        assert repo.by_id('w1')['status'] == 'coalesced'
        assert repo.by_id(out['id'])['status'] == 'fired'

    def test_hook_failure_records_failed_and_returns(self, posts):
        _, state = posts
        state['status'] = 500
        state['text'] = 'boom'
        repo = FakeRebuildRepo()
        out = marketing_site.request_rebuild('story_published', repo=repo)
        assert out['status'] == 'failed'
        assert repo.rows[0]['status'] == 'failed'
        assert '500' in repo.rows[0]['response']

    def test_network_error_never_raises(self, posts):
        _, state = posts
        state['raise'] = marketing_site.requests.ConnectionError('refused')
        out = marketing_site.request_rebuild('story_published', repo=FakeRebuildRepo())
        assert out['status'] == 'failed'

    def test_a_broken_repository_never_raises(self, posts):
        class Broken:
            def create_request(self, *a, **k):
                raise RuntimeError('db down')
        out = marketing_site.request_rebuild('story_published', repo=Broken())
        assert out['status'] == 'error'


class TestFirePending:
    def test_nothing_pending(self, posts):
        assert marketing_site.fire_pending(repo=FakeRebuildRepo()) == {'fired': False, 'pending': 0}

    def test_fires_once_and_coalesces_the_rest(self, posts):
        calls, _ = posts
        repo = FakeRebuildRepo([
            {'id': 'old', 'reason': 'x', 'status': 'fired', 'fired_at': _ago(600)},
            {'id': 'w1', 'reason': 'a', 'status': 'requested', 'fired_at': None},
            {'id': 'w2', 'reason': 'b', 'status': 'requested', 'fired_at': None},
            {'id': 'w3', 'reason': 'c', 'status': 'requested', 'fired_at': None},
        ])
        out = marketing_site.fire_pending(repo=repo)
        assert out['fired'] is True and out['coalesced'] == 2
        assert len(calls) == 1
        assert repo.by_id('w1')['status'] == 'fired'
        assert repo.by_id('w2')['status'] == 'coalesced'
        assert repo.by_id('w3')['status'] == 'coalesced'

    def test_waits_inside_the_interval(self, posts):
        calls, _ = posts
        repo = FakeRebuildRepo([
            {'id': 'old', 'reason': 'x', 'status': 'fired', 'fired_at': _ago(10)},
            {'id': 'w1', 'reason': 'a', 'status': 'requested', 'fired_at': None},
        ])
        out = marketing_site.fire_pending(repo=repo)
        assert out == {'fired': False, 'pending': 1, 'deferred': True}
        assert calls == []

    def test_unset_hook_skips_everything_pending(self, monkeypatch):
        monkeypatch.setattr(Config, 'MARKETING_DEPLOY_HOOK_URL', None)
        repo = FakeRebuildRepo([{'id': 'w1', 'reason': 'a', 'status': 'requested', 'fired_at': None}])
        out = marketing_site.fire_pending(repo=repo)
        assert out['skipped'] == 1
        assert repo.by_id('w1')['status'] == 'skipped'

    def test_failed_hook_leaves_the_others_requested(self, posts):
        _, state = posts
        state['status'] = 503
        repo = FakeRebuildRepo([
            {'id': 'w1', 'reason': 'a', 'status': 'requested', 'fired_at': None},
            {'id': 'w2', 'reason': 'b', 'status': 'requested', 'fired_at': None},
        ])
        out = marketing_site.fire_pending(repo=repo)
        assert out['fired'] is False
        assert repo.by_id('w1')['status'] == 'failed'
        assert repo.by_id('w2')['status'] == 'requested'


def test_story_url(monkeypatch):
    monkeypatch.setattr(Config, 'MARKETING_URL', 'https://www.optioeducation.com/')
    assert marketing_site.story_url('a-bridge') == 'https://www.optioeducation.com/stories/a-bridge/'
