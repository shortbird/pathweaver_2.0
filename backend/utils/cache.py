"""Short-TTL cache helpers backed by Redis, with an in-memory fallback.

P2 — used by the user/role hot path where a stale value for a few seconds
is acceptable in exchange for cutting 50–150ms of Supabase latency per
request.

Do NOT use for write paths, authorization decisions that must be real-time,
or data that changes on demand (e.g., masquerade state).
"""

from __future__ import annotations

import json
import time
from typing import Any, Callable, Optional

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

# Lazy-initialized Redis client, reused across calls.
_redis_client: Any = None
# In-memory fallback (process-local). Not safe across workers, but better
# than nothing in dev / when Redis is unreachable.
_memory: dict[str, tuple[float, Any]] = {}

# The fallback is BOUNDED, and that is not belt-and-braces. `_get_redis` writes
# the sentinel `False` on its first failure and never retries for the life of
# the process, so one Redis blip at startup sends every set() here permanently.
# Keys on this path are per-user, and expiry was only ever applied by a get() of
# that same key -- so a user who is cached once and never returns leaves an entry
# that nothing collects. A worker that survives a Redis blip then grows with the
# number of DISTINCT users it has ever seen, which is unbounded on a long-lived
# gunicorn worker.
#
# Found during a leak hunt on the memory watchdog alerts (Sentry OPTIO-BACKEND-B,
# 2026-09-10). It was NOT the cause of those -- the process was at ~155MB RSS and
# the watchdog was measuring it against a stale 512MB constant -- so this is a
# real defect that was not yet costing anything. Cheaper to bound now than to
# rule out again during the next memory scare.
_MEMORY_MAX_ENTRIES = 5000


def _memory_set(key: str, expires: float, value: Any) -> None:
    """Write to the fallback, dropping expired entries and capping the total.

    Sweeps on write rather than on a timer: there is no scheduler here, and a
    write is the only moment the dict can grow.
    """
    _memory[key] = (expires, value)
    if len(_memory) <= _MEMORY_MAX_ENTRIES:
        return
    now = time.time()
    for k in [k for k, (exp, _) in _memory.items() if exp <= now]:
        _memory.pop(k, None)
    # Still over after dropping the dead ones: evict whatever expires soonest,
    # back down to the cap. Losing a live entry costs one Supabase read, which
    # is the trade this whole module exists to make -- unbounded growth is not.
    if len(_memory) > _MEMORY_MAX_ENTRIES:
        for k, _ in sorted(_memory.items(), key=lambda kv: kv[1][0])[
                :len(_memory) - _MEMORY_MAX_ENTRIES]:
            _memory.pop(k, None)


def _get_redis():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    url = Config.RATE_LIMIT_STORAGE_URL  # REDIS_URL
    if not url:
        return None
    try:
        import redis

        _redis_client = redis.Redis.from_url(url, decode_responses=True, socket_timeout=1.5)
        _redis_client.ping()
        return _redis_client
    except Exception as exc:
        logger.warning(f"cache: Redis unavailable ({exc}); using in-memory fallback")
        _redis_client = False  # sentinel — don't try again this process
        return None


def get(key: str) -> Optional[Any]:
    r = _get_redis()
    if r:
        try:
            raw = r.get(key)
            return json.loads(raw) if raw else None
        except Exception as exc:
            logger.warning(f"cache.get({key}): {exc}")
    # Fallback
    entry = _memory.get(key)
    if not entry:
        return None
    expires, value = entry
    if time.time() > expires:
        _memory.pop(key, None)
        return None
    return value


def set(key: str, value: Any, ttl: int) -> None:
    r = _get_redis()
    payload = json.dumps(value, default=str)
    if r:
        try:
            r.setex(key, ttl, payload)
            return
        except Exception as exc:
            logger.warning(f"cache.set({key}): {exc}")
    # Fallback
    _memory_set(key, time.time() + ttl, json.loads(payload))


def delete(key: str) -> None:
    r = _get_redis()
    if r:
        try:
            r.delete(key)
        except Exception as exc:
            logger.warning(f"cache.delete({key}): {exc}")
    _memory.pop(key, None)


def memoize(key_fn: Callable[..., str], ttl: int):
    """Decorator: cache the return value of ``fn(*args, **kwargs)`` keyed by ``key_fn(*args, **kwargs)``."""

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            key = key_fn(*args, **kwargs)
            cached = get(key)
            if cached is not None:
                return cached
            result = fn(*args, **kwargs)
            if result is not None:
                set(key, result, ttl)
            return result

        wrapper.__wrapped__ = fn  # type: ignore[attr-defined]
        return wrapper

    return decorator


def reset_for_tests() -> None:
    """Clear the in-memory fallback; used by tests."""
    _memory.clear()
