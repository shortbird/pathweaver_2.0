"""The two process-local caches that could grow without limit.

Found during a leak hunt on the memory watchdog alerts (Sentry OPTIO-BACKEND-B).
Neither caused those -- the watchdog was comparing a ~155MB process against a
512MB constant while the service ran on a 4GB `pro` instance -- but both were
genuinely unbounded, and both are keyed by something a user supplies.

The property under test is the one that matters at 3am: the dict does not grow
forever, whatever the traffic looks like.
"""

import time

import pytest

from utils import cache as cache_mod
from routes import link_preview


@pytest.fixture(autouse=True)
def _no_redis(monkeypatch):
    """Force the in-memory fallback, which is the path that could leak."""
    monkeypatch.setattr(cache_mod, '_get_redis', lambda: None)
    cache_mod.reset_for_tests()
    yield
    cache_mod.reset_for_tests()


class TestCacheFallbackIsBounded:
    def test_distinct_keys_do_not_grow_without_limit(self):
        """One Redis blip used to mean 'grow with every user seen, forever'."""
        for i in range(cache_mod._MEMORY_MAX_ENTRIES + 500):
            cache_mod.set(f'user:{i}', {'role': 'student'}, ttl=300)
        assert len(cache_mod._memory) <= cache_mod._MEMORY_MAX_ENTRIES

    def test_expired_entries_are_dropped_before_live_ones(self):
        for i in range(cache_mod._MEMORY_MAX_ENTRIES):
            cache_mod.set(f'dead:{i}', {'v': i}, ttl=-1)  # already expired
        cache_mod.set('alive', {'v': 'keep'}, ttl=3600)
        for i in range(600):
            cache_mod.set(f'fresh:{i}', {'v': i}, ttl=3600)
        assert len(cache_mod._memory) <= cache_mod._MEMORY_MAX_ENTRIES
        assert cache_mod.get('alive') == {'v': 'keep'}

    def test_a_live_value_still_reads_back(self):
        cache_mod.set('k', {'v': 1}, ttl=60)
        assert cache_mod.get('k') == {'v': 1}

    def test_an_expired_value_does_not(self):
        cache_mod.set('k', {'v': 1}, ttl=-1)
        assert cache_mod.get('k') is None


class TestLinkPreviewCacheIsBounded:
    def setup_method(self):
        link_preview._cache.clear()

    def teardown_method(self):
        link_preview._cache.clear()

    def test_distinct_urls_do_not_grow_without_limit(self):
        now = time.time()
        for i in range(link_preview._CACHE_MAX_ENTRIES + 300):
            link_preview._cache_put(f'https://example.com/{i}', {'title': str(i)}, now)
        assert len(link_preview._cache) <= link_preview._CACHE_MAX_ENTRIES

    def test_stale_entries_are_dropped_first(self):
        now = time.time()
        stale = now - link_preview._CACHE_TTL - 1
        for i in range(link_preview._CACHE_MAX_ENTRIES):
            link_preview._cache[f'https://old.com/{i}'] = {
                'data': {'title': str(i)}, 'fetched_at': stale
            }
        link_preview._cache_put('https://new.com/keep', {'title': 'keep'}, now)
        assert len(link_preview._cache) <= link_preview._CACHE_MAX_ENTRIES
        assert 'https://new.com/keep' in link_preview._cache

    def test_the_newest_entry_survives_an_eviction_of_live_entries(self):
        now = time.time()
        for i in range(link_preview._CACHE_MAX_ENTRIES + 50):
            link_preview._cache_put(f'https://example.com/{i}', {'title': str(i)}, now + i)
        assert len(link_preview._cache) <= link_preview._CACHE_MAX_ENTRIES
        newest = f'https://example.com/{link_preview._CACHE_MAX_ENTRIES + 49}'
        assert newest in link_preview._cache
