"""
Simple in-memory cache implementation for frequently accessed data.
This cache is used to store data that doesn't change often, like skill categories.
"""

import time
from typing import Any, Dict, Optional
from functools import wraps

from utils.logger import get_logger

logger = get_logger(__name__)

class InMemoryCache:
    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache if it exists and hasn't expired."""
        if key in self._cache:
            entry = self._cache[key]
            if entry['expires'] > time.time():
                return entry['value']
            else:
                # Remove expired entry
                del self._cache[key]
        return None
    
    def set(self, key: str, value: Any, ttl: int = 300):
        """Set a value in the cache with a time-to-live (TTL) in seconds."""
        self._cache[key] = {
            'value': value,
            'expires': time.time() + ttl
        }
    
    def delete(self, key: str):
        """Delete a key from the cache."""
        if key in self._cache:
            del self._cache[key]
    
    def clear(self):
        """Clear all cache entries."""
        self._cache.clear()
    
    def cleanup_expired(self):
        """Remove all expired entries from the cache."""
        current_time = time.time()
        expired_keys = [
            key for key, entry in self._cache.items() 
            if entry['expires'] <= current_time
        ]
        for key in expired_keys:
            del self._cache[key]

# Global cache instance
cache = InMemoryCache()

def cached(ttl: int = 300):
    """
    Decorator to cache function results.
    
    Args:
        ttl: Time-to-live in seconds (default: 5 minutes)
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Create a cache key from function name and arguments
            cache_key = f"{func.__name__}:{str(args)}:{str(kwargs)}"
            
            # Try to get from cache
            cached_result = cache.get(cache_key)
            if cached_result is not None:
                logger.info(f"Cache hit for {func.__name__}")
                return cached_result
            
            # Call the function and cache the result
            logger.info(f"Cache miss for {func.__name__}")
            result = func(*args, **kwargs)
            cache.set(cache_key, result, ttl)
            return result
        
        return wrapper
    return decorator