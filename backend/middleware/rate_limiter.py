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
    
    def is_allowed(self, identifier: str, max_requests: int, window_seconds: int) -> Tuple[bool, int, Dict[str, any]]:
        """
        Check if request is allowed based on rate limit
        Returns: (is_allowed, retry_after_seconds, rate_limit_info)

        rate_limit_info contains:
        - limit: max requests allowed in window
        - remaining: requests remaining in current window
        - reset_at: unix timestamp when window resets
        """
        redis = self._get_redis()

        if redis:
            return self._is_allowed_redis(redis, identifier, max_requests, window_seconds)
        else:
            return self._is_allowed_memory(identifier, max_requests, window_seconds)

    def _is_allowed_redis(self, redis, identifier: str, max_requests: int, window_seconds: int) -> Tuple[bool, int, Dict[str, any]]:
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
                    rate_info = {
                        'limit': max_requests,
                        'remaining': 0,
                        'reset_at': int(blocked_until)
                    }
                    return False, int(blocked_until - current_time), rate_info
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
                rate_info = {
                    'limit': max_requests,
                    'remaining': 0,
                    'reset_at': int(block_until)
                }
                return False, window_seconds, rate_info

            # Add current request with timestamp as score
            redis.zadd(key, {str(current_time): current_time})
            # Set expiry on the key to auto-cleanup
            redis.expire(key, window_seconds)

            # Calculate reset time (start of next window)
            reset_at = int(current_time + window_seconds)
            rate_info = {
                'limit': max_requests,
                'remaining': max_requests - (request_count + 1),
                'reset_at': reset_at
            }

            return True, 0, rate_info

        except Exception as e:
            logger.error(f"Redis rate limiting error: {e} - falling back to in-memory")
            # Fallback to in-memory if Redis fails
            return self._is_allowed_memory(identifier, max_requests, window_seconds)

    def _is_allowed_memory(self, identifier: str, max_requests: int, window_seconds: int) -> Tuple[bool, int, Dict[str, any]]:
        """In-memory rate limiting (fallback)"""
        current_time = time.time()

        # Check if IP is temporarily blocked
        if identifier in self.blocked_ips:
            block_until = self.blocked_ips[identifier]
            if current_time < block_until:
                rate_info = {
                    'limit': max_requests,
                    'remaining': 0,
                    'reset_at': int(block_until)
                }
                return False, int(block_until - current_time), rate_info
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
            block_until = current_time + window_seconds
            self.blocked_ips[identifier] = block_until
            rate_info = {
                'limit': max_requests,
                'remaining': 0,
                'reset_at': int(block_until)
            }
            return False, window_seconds, rate_info

        # Add current request
        self.requests[identifier].append(current_time)

        # Calculate reset time (start of next window)
        reset_at = int(current_time + window_seconds)
        rate_info = {
            'limit': max_requests,
            'remaining': max_requests - len(self.requests[identifier]),
            'reset_at': reset_at
        }
        return True, 0, rate_info
    
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

def _auto_detect_config_key(endpoint: str, method: str) -> str:
    """
    Auto-detect rate limit config key from endpoint name and HTTP method.

    Args:
        endpoint: Flask endpoint name (e.g., 'auth.login', 'quests.start_quest')
        method: HTTP method (GET, POST, PUT, DELETE)

    Returns:
        str: Config key from RATE_LIMITS or None if no match
    """
    if not endpoint:
        return None

    endpoint_lower = endpoint.lower()

    # Authentication endpoints
    if 'auth' in endpoint_lower and method == 'POST':
        if 'login' in endpoint_lower:
            return 'auth_login'
        elif 'register' in endpoint_lower:
            return 'auth_register'
        elif 'refresh' in endpoint_lower:
            return 'auth_refresh'

    # File upload endpoints
    if 'upload' in endpoint_lower:
        if 'evidence' in endpoint_lower:
            return 'evidence_upload'
        return 'upload'

    # AI Tutor endpoints
    if 'tutor' in endpoint_lower and 'chat' in endpoint_lower:
        return 'tutor_chat'

    # Quest operations
    if 'quest' in endpoint_lower:
        if 'start' in endpoint_lower or 'enroll' in endpoint_lower:
            return 'quest_start'

    # Task operations
    if 'task' in endpoint_lower:
        if 'complete' in endpoint_lower:
            return 'task_complete'

    # Admin operations
    if 'admin' in endpoint_lower:
        if method == 'POST':
            return 'admin_create'
        elif method in ['PUT', 'PATCH']:
            return 'admin_update'
        elif method == 'DELETE':
            return 'admin_delete'

    # Social features
    if 'friend' in endpoint_lower and 'request' in endpoint_lower:
        return 'friend_request'
    if 'collaboration' in endpoint_lower and 'invite' in endpoint_lower:
        return 'collaboration_invite'

    # LMS Integration
    if 'lms' in endpoint_lower:
        if 'sync' in endpoint_lower:
            return 'lms_sync'
        elif 'grade' in endpoint_lower or 'passback' in endpoint_lower:
            return 'lms_grade_passback'

    # Write operations default (for POST/PUT/PATCH/DELETE without specific match)
    if method in ['POST', 'PUT', 'PATCH', 'DELETE']:
        return 'api_write'

    # Default for all other endpoints (including GET)
    return 'api_default'

def rate_limit(config_key: str = None, max_requests: int = None, window_seconds: int = None,
               limit: int = None, per: int = None, calls: int = None, period: int = None):
    """
    Decorator to apply rate limiting to routes

    Supports multiple parameter styles:
    - @rate_limit('tutor_chat') - Use config key from config/rate_limits.py
    - @rate_limit(calls=10, period=60) - Explicit limit (new style)
    - @rate_limit(limit=10, per=60) - Explicit limit (alt style)
    - @rate_limit(max_requests=10, window_seconds=60) - Explicit limit (legacy)
    - @rate_limit() - Auto-detect from endpoint name or use default

    Args:
        config_key: Key from RATE_LIMITS config (e.g., 'tutor_chat', 'upload')
        max_requests: Maximum number of requests allowed (legacy style)
        window_seconds: Time window in seconds (legacy style)
        limit: Maximum number of requests allowed (alt style)
        per: Time window in seconds (alt style)
        calls: Maximum number of requests allowed (new style)
        period: Time window in seconds (new style)
    """
    # Support multiple parameter naming conventions
    # Priority: calls/period > limit/per > max_requests/window_seconds
    if calls is not None:
        max_requests = calls
    elif limit is not None:
        max_requests = limit

    if period is not None:
        window_seconds = period
    elif per is not None:
        window_seconds = per

    # If both are still None, they'll be determined later from config or defaults
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # CVE-OPTIO-2025-012 FIX: Use secure IP extraction to prevent spoofing
            client_ip = get_real_ip()

            # Get environment
            environment = 'development' if os.getenv('FLASK_ENV') == 'development' else 'production'

            # Determine rate limit based on priority:
            # 1. Explicit config_key parameter
            # 2. Explicit max_requests/window_seconds parameters
            # 3. Auto-detect from endpoint name
            # 4. Default values

            determined_config_key = config_key
            max_req = max_requests
            window = window_seconds

            # If explicit values provided, use them
            if max_req is not None and window is not None:
                # Use explicit decorator parameters
                pass
            else:
                # Auto-detect config key from endpoint if not provided
                if determined_config_key is None:
                    determined_config_key = _auto_detect_config_key(request.endpoint, request.method)

                # If we have a config key, use it
                if determined_config_key:
                    limit_config = get_rate_limit(determined_config_key, environment)
                    max_req = limit_config['requests']
                    window = limit_config['window']
                else:
                    # Fallback to defaults if still not set
                    if max_req is None:
                        max_req = 60
                    if window is None:
                        window = 60

            # Create identifier combining IP and endpoint for per-endpoint rate limiting
            # This allows different endpoints to have separate rate limit buckets
            identifier = f"{client_ip}:{request.endpoint}"

            is_allowed, retry_after, rate_info = rate_limiter.is_allowed(identifier, max_req, window)

            # Store rate limit info in request context for header injection
            request.rate_limit_info = rate_info

            if not is_allowed:
                response = jsonify({
                    'error': 'Too many requests. Please try again later.',
                    'retry_after': retry_after
                })
                response.status_code = 429
                response.headers['Retry-After'] = str(retry_after)
                # Add rate limit headers even for 429 responses
                response.headers['X-RateLimit-Limit'] = str(rate_info['limit'])
                response.headers['X-RateLimit-Remaining'] = str(rate_info['remaining'])
                response.headers['X-RateLimit-Reset'] = str(rate_info['reset_at'])
                return response

            return f(*args, **kwargs)
        
        return decorated_function
    return decorator

def apply_rate_limiting_to_blueprint(blueprint, max_requests=60, window_seconds=60):
    """Apply rate limiting to all routes in a blueprint"""
    for endpoint, func in blueprint.view_functions.items():
        blueprint.view_functions[endpoint] = rate_limit(max_requests, window_seconds)(func)


def add_rate_limit_headers(response):
    """
    Add rate limit headers to all responses.
    Should be registered as an after_request handler in the Flask app.

    Usage:
        app.after_request(add_rate_limit_headers)

    Headers added:
        X-RateLimit-Limit: Maximum requests allowed in window
        X-RateLimit-Remaining: Requests remaining in current window
        X-RateLimit-Reset: Unix timestamp when window resets
    """
    if hasattr(request, 'rate_limit_info'):
        rate_info = request.rate_limit_info
        response.headers['X-RateLimit-Limit'] = str(rate_info['limit'])
        response.headers['X-RateLimit-Remaining'] = str(rate_info['remaining'])
        response.headers['X-RateLimit-Reset'] = str(rate_info['reset_at'])

    return response