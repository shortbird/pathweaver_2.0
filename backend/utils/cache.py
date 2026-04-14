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
    _memory[key] = (time.time() + ttl, json.loads(payload))


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
