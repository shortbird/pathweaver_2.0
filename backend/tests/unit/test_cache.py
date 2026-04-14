"""P2 — cache helpers work under the in-memory fallback."""

from __future__ import annotations

import time

import pytest


@pytest.fixture(autouse=True)
def _reset_cache():
    # Force the Redis client to the "unavailable" sentinel so the test uses
    # the in-memory fallback deterministically.
    from utils import cache

    cache._redis_client = False  # skip Redis init
    cache.reset_for_tests()
    yield
    cache.reset_for_tests()


def test_set_and_get_round_trip():
    from utils import cache

    cache.set("k", {"a": 1}, ttl=30)
    assert cache.get("k") == {"a": 1}


def test_get_missing_returns_none():
    from utils import cache

    assert cache.get("missing") is None


def test_ttl_expiry(monkeypatch):
    from utils import cache

    cache.set("k", "v", ttl=30)
    # Fast-forward the clock past the TTL.
    real = time.time()
    monkeypatch.setattr(cache.time, "time", lambda: real + 31)
    assert cache.get("k") is None


def test_delete_removes_entry():
    from utils import cache

    cache.set("k", 1, ttl=30)
    cache.delete("k")
    assert cache.get("k") is None


def test_memoize_caches_and_respects_ttl():
    from utils import cache

    calls = {"n": 0}

    @cache.memoize(lambda x: f"user:{x}", ttl=30)
    def load(x: str):
        calls["n"] += 1
        return {"id": x, "role": "student"}

    assert load("u1") == {"id": "u1", "role": "student"}
    assert load("u1") == {"id": "u1", "role": "student"}
    assert calls["n"] == 1  # second call hit cache


def test_memoize_does_not_cache_none_results():
    from utils import cache

    calls = {"n": 0}

    @cache.memoize(lambda x: f"miss:{x}", ttl=30)
    def load(x: str):
        calls["n"] += 1
        return None

    load("u")
    load("u")
    assert calls["n"] == 2  # None isn't cached — useful for "not found" paths
