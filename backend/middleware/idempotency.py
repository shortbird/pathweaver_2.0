"""
Idempotency middleware to prevent duplicate mutations

Uses Redis for persistent idempotency tracking across deployments.
Falls back to in-memory storage if Redis is unavailable (local development).

Idempotency keys allow clients to safely retry requests without duplicating operations.
According to API design best practices, POST/PUT/DELETE requests should support
idempotency keys to prevent accidental duplicate charges, data corruption, etc.
"""
import json
import os
from flask import request, jsonify, Response
from functools import wraps
from typing import Dict, Optional, Tuple
from datetime import datetime, timedelta
from collections import OrderedDict

from utils.logger import get_logger

logger = get_logger(__name__)

# Redis client (lazy-loaded from rate_limiter)
_redis_client: Optional[any] = None

def get_redis_client():
    """Get Redis client, initializing if needed (shared with rate_limiter)"""
    global _redis_client

    if _redis_client is not None:
        return _redis_client

    redis_url = os.getenv('REDIS_URL')
    if not redis_url:
        logger.info("REDIS_URL not set - using in-memory idempotency cache")
        return None

    try:
        import redis
        _redis_client = redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
            health_check_interval=30
        )
        # Test connection
        _redis_client.ping()
        logger.info("Connected to Redis for idempotency tracking")
        return _redis_client
    except ImportError:
        logger.warning("redis library not installed - using in-memory idempotency cache")
        return None
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e} - using in-memory idempotency cache")
        return None


class IdempotencyCache:
    """
    Idempotency cache with Redis backend (falls back to in-memory LRU)

    Stores completed request responses keyed by Idempotency-Key header.
    Responses are cached for 24 hours to allow safe retries.
    """

    def __init__(self, max_memory_size: int = 1000):
        """
        Initialize idempotency cache

        Args:
            max_memory_size: Maximum number of keys to store in-memory (LRU eviction)
        """
        # In-memory fallback storage (LRU cache)
        self.memory_cache: OrderedDict[str, dict] = OrderedDict()
        self.max_memory_size = max_memory_size
        self.redis_client = None

    def _get_redis(self):
        """Get Redis client, caching for this instance"""
        if self.redis_client is None:
            self.redis_client = get_redis_client()
        return self.redis_client

    def get(self, key: str) -> Optional[dict]:
        """
        Get cached response for idempotency key

        Args:
            key: Idempotency key from request header

        Returns:
            Cached response dict or None if not found
        """
        redis = self._get_redis()

        if redis:
            return self._get_redis(redis, key)
        else:
            return self._get_memory(key)

    def set(self, key: str, response_data: dict, ttl_seconds: int = 86400):
        """
        Cache response for idempotency key

        Args:
            key: Idempotency key from request header
            response_data: Response dict to cache (status, headers, body)
            ttl_seconds: Time-to-live in seconds (default 24 hours)
        """
        redis = self._get_redis()

        if redis:
            self._set_redis(redis, key, response_data, ttl_seconds)
        else:
            self._set_memory(key, response_data, ttl_seconds)

    def _get_redis(self, redis, key: str) -> Optional[dict]:
        """Get from Redis"""
        try:
            redis_key = f"idempotency:{key}"
            cached = redis.get(redis_key)

            if cached:
                logger.info(f"Idempotency cache HIT for key: {key[:16]}...")
                return json.loads(cached)

            return None

        except Exception as e:
            logger.error(f"Redis idempotency get error: {e} - falling back to in-memory")
            return self._get_memory(key)

    def _set_redis(self, redis, key: str, response_data: dict, ttl_seconds: int):
        """Set in Redis"""
        try:
            redis_key = f"idempotency:{key}"

            # Store response with TTL
            redis.setex(
                redis_key,
                ttl_seconds,
                json.dumps(response_data)
            )

            logger.info(f"Idempotency response cached for key: {key[:16]}... (TTL: {ttl_seconds}s)")

        except Exception as e:
            logger.error(f"Redis idempotency set error: {e} - falling back to in-memory")
            self._set_memory(key, response_data, ttl_seconds)

    def _get_memory(self, key: str) -> Optional[dict]:
        """Get from in-memory cache"""
        if key in self.memory_cache:
            cached = self.memory_cache[key]

            # Check expiry
            if datetime.utcnow() < cached['expires_at']:
                # Move to end (LRU)
                self.memory_cache.move_to_end(key)
                logger.info(f"Idempotency cache HIT (in-memory) for key: {key[:16]}...")
                return cached['response']
            else:
                # Expired
                del self.memory_cache[key]

        return None

    def _set_memory(self, key: str, response_data: dict, ttl_seconds: int):
        """Set in in-memory cache (LRU eviction)"""
        # Evict oldest if at capacity
        if len(self.memory_cache) >= self.max_memory_size:
            self.memory_cache.popitem(last=False)  # Remove oldest (FIFO)

        # Store with expiry
        self.memory_cache[key] = {
            'response': response_data,
            'expires_at': datetime.utcnow() + timedelta(seconds=ttl_seconds)
        }

        logger.info(f"Idempotency response cached (in-memory) for key: {key[:16]}... (TTL: {ttl_seconds}s)")


# Global idempotency cache instance
idempotency_cache = IdempotencyCache()


def require_idempotency(ttl_seconds: int = 86400):
    """
    Decorator to add idempotency support to an endpoint

    When a client provides an Idempotency-Key header:
    1. If the key has been seen before, return the cached response (same status, headers, body)
    2. If the key is new, execute the request and cache the response for 24 hours

    This allows clients to safely retry POST/PUT/DELETE operations without duplicating effects.

    Usage:
        @app.route('/api/v1/tasks/<task_id>/complete', methods=['POST'])
        @require_idempotency(ttl_seconds=86400)
        def complete_task(task_id):
            # ... task completion logic
            return jsonify({'success': True}), 200

    Args:
        ttl_seconds: How long to cache responses (default 24 hours)

    Returns:
        Decorated function that checks/caches idempotency keys
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Check for Idempotency-Key header
            idempotency_key = request.headers.get('Idempotency-Key')

            if not idempotency_key:
                # No idempotency key - execute normally (not idempotent)
                logger.debug(f"{request.method} {request.path} - No Idempotency-Key header")
                return f(*args, **kwargs)

            # Validate key format (128 char max, alphanumeric + hyphens)
            if len(idempotency_key) > 128 or not all(c.isalnum() or c in '-_' for c in idempotency_key):
                logger.warning(f"Invalid Idempotency-Key format: {idempotency_key[:32]}...")
                return jsonify({
                    'error': 'Invalid Idempotency-Key header',
                    'message': 'Idempotency-Key must be alphanumeric (max 128 chars)'
                }), 400

            # Check cache for existing response
            cached_response = idempotency_cache.get(idempotency_key)

            if cached_response:
                # Return cached response (idempotent replay)
                logger.info(f"Idempotent request replay for key: {idempotency_key[:16]}...")

                response = jsonify(cached_response['body'])
                response.status_code = cached_response['status']

                # Add custom headers from cache
                for header_name, header_value in cached_response.get('headers', {}).items():
                    response.headers[header_name] = header_value

                # Add idempotency replay header
                response.headers['X-Idempotency-Replay'] = 'true'

                return response

            # Execute request (first time seeing this key)
            logger.info(f"Executing idempotent request for key: {idempotency_key[:16]}...")
            result = f(*args, **kwargs)

            # Extract response data
            if isinstance(result, tuple):
                # Flask returns (response, status) or (response, status, headers)
                response_body = result[0]
                status_code = result[1] if len(result) > 1 else 200
                headers = result[2] if len(result) > 2 else {}
            elif isinstance(result, Response):
                response_body = result.get_json()
                status_code = result.status_code
                headers = dict(result.headers)
            else:
                response_body = result
                status_code = 200
                headers = {}

            # Only cache successful responses (2xx status codes)
            if 200 <= status_code < 300:
                # Serialize response for caching
                response_data = {
                    'status': status_code,
                    'body': response_body if isinstance(response_body, dict) else response_body.get_json(),
                    'headers': {k: v for k, v in headers.items() if k.lower() not in ['content-length', 'date', 'server']},
                    'cached_at': datetime.utcnow().isoformat()
                }

                # Cache the response
                idempotency_cache.set(idempotency_key, response_data, ttl_seconds)
            else:
                logger.warning(f"Not caching non-2xx response for idempotency key: {idempotency_key[:16]}... (status: {status_code})")

            return result

        return decorated_function
    return decorator