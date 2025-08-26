"""
Rate limiting middleware to prevent abuse
"""
import time
from flask import request, jsonify
from functools import wraps
from collections import defaultdict
from typing import Dict, Tuple

class RateLimiter:
    """Simple in-memory rate limiter"""
    
    def __init__(self):
        self.requests = defaultdict(list)
        self.blocked_ips = {}
    
    def is_allowed(self, identifier: str, max_requests: int, window_seconds: int) -> Tuple[bool, int]:
        """
        Check if request is allowed based on rate limit
        Returns: (is_allowed, retry_after_seconds)
        """
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
        if identifier in self.requests:
            del self.requests[identifier]
        if identifier in self.blocked_ips:
            del self.blocked_ips[identifier]

# Global rate limiter instance
rate_limiter = RateLimiter()

def rate_limit(max_requests: int = 60, window_seconds: int = 60):
    """
    Decorator to apply rate limiting to routes
    
    Args:
        max_requests: Maximum number of requests allowed
        window_seconds: Time window in seconds
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Use IP address as identifier
            identifier = request.remote_addr or 'unknown'
            
            # Special handling for auth endpoints (stricter limits)
            if 'auth' in request.endpoint and request.method == 'POST':
                max_req = 5  # Only 5 auth attempts
                window = 60  # Per minute
            else:
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