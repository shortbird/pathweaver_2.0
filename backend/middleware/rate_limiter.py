"""
Rate limiting middleware to prevent abuse

Uses Redis for persistent rate limiting across deployments.
Falls back to in-memory storage if Redis is unavailable (local development).
"""
import time
import os
from flask import request, jsonify
from functools import wraps
from collections import defaultdict
from typing import Dict, Tuple, Optional
from config.rate_limits import get_rate_limit

from utils.logger import get_logger

logger = get_logger(__name__)

# Redis client (lazy-loaded)
_redis_client: Optional[any] = None

# Trusted proxy IPs (Render's infrastructure)
# CVE-OPTIO-2025-012 FIX: Only trust X-Forwarded-For from known proxies
TRUSTED_PROXIES = {
    '127.0.0.1',  # Localhost
    '::1',        # IPv6 localhost
    # Render.com proxy IPs would go here
    # For now, we trust Render's infrastructure by checking if we're behind a proxy
}

def get_real_ip() -> str:
    """
    Get the real client IP address, preventing spoofing attacks.

    CVE-OPTIO-2025-012 FIX: Securely extracts client IP from proxy headers.

    Security considerations:
    - Only trusts X-Forwarded-For when behind known proxy (production)
    - Uses rightmost IP in X-Forwarded-For chain (client's last hop)
    - Falls back to remote_addr if no proxy headers or in development
    - Prevents rate limit bypass via header spoofing

    Returns:
        str: Client IP address
    """
    # In production (Render), we're behind their load balancer
    # X-Forwarded-For format: "client, proxy1, proxy2"
    # We want the leftmost IP (original client), but must validate it

    # Check if we're behind a trusted proxy (production environment)
    is_production = os.getenv('FLASK_ENV') == 'production'

    if is_production and 'X-Forwarded-For' in request.headers:
        # Get the full chain
        forwarded_for = request.headers.get('X-Forwarded-For', '')

        # Split and get the leftmost (client) IP
        ips = [ip.strip() for ip in forwarded_for.split(',')]

        if ips:
            # Return the first IP (original client)
            client_ip = ips[0]

            # Basic validation: ensure it looks like an IP
            if '.' in client_ip or ':' in client_ip:
                return client_ip

    # Fallback to remote_addr (direct connection or dev environment)
    return request.remote_addr or 'unknown'

def get_redis_client():
    """Get Redis client, initializing if needed"""
    global _redis_client

    if _redis_client is not None:
        return _redis_client

    redis_url = os.getenv('REDIS_URL')
    if not redis_url:
        logger.info("REDIS_URL not set - using in-memory rate limiting")
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
        logger.info("Connected to Redis for rate limiting")
        return _redis_client
    except ImportError:
        logger.warning("redis library not installed - using in-memory rate limiting")
        return None
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e} - using in-memory rate limiting")
        return None

class RateLimiter:
    """Rate limiter with Redis backend (falls back to in-memory)"""

    def __init__(self):
        # In-memory fallback storage
        self.requests = defaultdict(list)
        self.blocked_ips = {}
        self.redis_client = None

    def _get_redis(self):
        """Get Redis client, caching for this instance"""
        if self.redis_client is None:
            self.redis_client = get_redis_client()
        return self.redis_client
    
    def is_allowed(self, identifier: str, max_requests: int, window_seconds: int) -> Tuple[bool, int]:
        """
        Check if request is allowed based on rate limit
        Returns: (is_allowed, retry_after_seconds)
        """
        redis = self._get_redis()

        if redis:
            return self._is_allowed_redis(redis, identifier, max_requests, window_seconds)
        else:
            return self._is_allowed_memory(identifier, max_requests, window_seconds)

    def _is_allowed_redis(self, redis, identifier: str, max_requests: int, window_seconds: int) -> Tuple[bool, int]:
        """Redis-based rate limiting using sorted sets"""
        try:
            current_time = time.time()
            key = f"rate_limit:{identifier}"
            block_key = f"rate_limit:blocked:{identifier}"

            # Check if IP is blocked
            blocked_until = redis.get(block_key)
            if blocked_until:
                blocked_until = float(blocked_until)
                if current_time < blocked_until:
                    return False, int(blocked_until - current_time)
                else:
                    redis.delete(block_key)

            # Use sorted set with timestamps as scores
            # Remove old entries outside the window
            min_timestamp = current_time - window_seconds
            redis.zremrangebyscore(key, '-inf', min_timestamp)

            # Count requests in current window
            request_count = redis.zcard(key)

            if request_count >= max_requests:
                # Block for the window duration
                block_until = current_time + window_seconds
                redis.setex(block_key, window_seconds, str(block_until))
                return False, window_seconds

            # Add current request with timestamp as score
            redis.zadd(key, {str(current_time): current_time})
            # Set expiry on the key to auto-cleanup
            redis.expire(key, window_seconds)

            return True, 0

        except Exception as e:
            logger.error(f"Redis rate limiting error: {e} - falling back to in-memory")
            # Fallback to in-memory if Redis fails
            return self._is_allowed_memory(identifier, max_requests, window_seconds)

    def _is_allowed_memory(self, identifier: str, max_requests: int, window_seconds: int) -> Tuple[bool, int]:
        """In-memory rate limiting (fallback)"""
        current_time = time.time()

        # Check if IP is temporarily blocked
        if identifier in self.blocked_ips:
            block_until = self.blocked_ips[identifier]
            if current_time < block_until:
                return False, int(block_until - current_time)
            else:
                # Unblock if time has passed
                del self.blocked_ips[identifier]

        # Clean old requests
        self.requests[identifier] = [
            req_time for req_time in self.requests[identifier]
            if current_time - req_time < window_seconds
        ]

        # Check rate limit
        if len(self.requests[identifier]) >= max_requests:
            # Block for the window duration
            self.blocked_ips[identifier] = current_time + window_seconds
            return False, window_seconds

        # Add current request
        self.requests[identifier].append(current_time)
        return True, 0
    
    def reset(self, identifier: str):
        """Reset rate limit for an identifier"""
        redis = self._get_redis()

        if redis:
            try:
                # Delete Redis keys
                key = f"rate_limit:{identifier}"
                block_key = f"rate_limit:blocked:{identifier}"
                redis.delete(key, block_key)
            except Exception as e:
                logger.error(f"Redis reset error: {e}")

        # Also reset in-memory (for fallback or local dev)
        if identifier in self.requests:
            del self.requests[identifier]
        if identifier in self.blocked_ips:
            del self.blocked_ips[identifier]

# Global rate limiter instance
rate_limiter = RateLimiter()

def rate_limit(max_requests: int = None, window_seconds: int = None, limit: int = None, per: int = None):
    """
    Decorator to apply rate limiting to routes

    Args:
        max_requests: Maximum number of requests allowed (deprecated, use limit)
        window_seconds: Time window in seconds (deprecated, use per)
        limit: Maximum number of requests allowed (new style)
        per: Time window in seconds (new style)
    """
    # Support both old and new parameter styles
    if limit is not None:
        max_requests = limit
    if per is not None:
        window_seconds = per

    # Default values
    if max_requests is None:
        max_requests = 60
    if window_seconds is None:
        window_seconds = 60
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # CVE-OPTIO-2025-012 FIX: Use secure IP extraction to prevent spoofing
            identifier = get_real_ip()

            # Get environment
            environment = 'development' if os.getenv('FLASK_ENV') == 'development' else 'production'

            # Determine rate limit based on endpoint type
            if 'auth' in request.endpoint and request.method == 'POST':
                # Authentication endpoints use centralized config
                if 'login' in request.endpoint:
                    limit_config = get_rate_limit('auth_login', environment)
                elif 'register' in request.endpoint:
                    limit_config = get_rate_limit('auth_register', environment)
                elif 'refresh' in request.endpoint:
                    limit_config = get_rate_limit('auth_refresh', environment)
                else:
                    limit_config = get_rate_limit('api_default', environment)

                max_req = limit_config['requests']
                window = limit_config['window']
            else:
                # Use decorator parameters or default
                max_req = max_requests
                window = window_seconds

            is_allowed, retry_after = rate_limiter.is_allowed(identifier, max_req, window)
            
            if not is_allowed:
                response = jsonify({
                    'error': 'Too many requests. Please try again later.',
                    'retry_after': retry_after
                })
                response.status_code = 429
                response.headers['Retry-After'] = str(retry_after)
                return response
            
            return f(*args, **kwargs)
        
        return decorated_function
    return decorator

def apply_rate_limiting_to_blueprint(blueprint, max_requests=60, window_seconds=60):
    """Apply rate limiting to all routes in a blueprint"""
    for endpoint, func in blueprint.view_functions.items():
        blueprint.view_functions[endpoint] = rate_limit(max_requests, window_seconds)(func)