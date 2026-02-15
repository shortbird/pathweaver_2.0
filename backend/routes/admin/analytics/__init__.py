"""
Admin Analytics Routes Module

Split from single analytics.py file for maintainability.
Each endpoint category has its own file.

Provides comprehensive analytics data for the admin dashboard including
real-time metrics, user engagement, quest completion rates, and system health.
"""

from flask import Blueprint
from datetime import datetime, timedelta

# Create blueprint for all analytics routes
bp = Blueprint('admin_analytics', __name__, url_prefix='/api/admin/analytics')

# Simple in-memory cache for analytics data (shared across endpoints)
_analytics_cache = {
    'overview': {'data': None, 'expires_at': None},
    'activity': {'data': None, 'expires_at': None},
    'trends': {'data': None, 'expires_at': None},
    'health': {'data': None, 'expires_at': None}
}


def get_cached_data(cache_key: str, ttl_seconds: int = 120):
    """Get cached data if not expired"""
    cache_entry = _analytics_cache.get(cache_key, {})
    if cache_entry.get('data') and cache_entry.get('expires_at'):
        if datetime.utcnow() < cache_entry['expires_at']:
            return cache_entry['data']
    return None


def set_cached_data(cache_key: str, data, ttl_seconds: int = 120):
    """Set cached data with expiration"""
    _analytics_cache[cache_key] = {
        'data': data,
        'expires_at': datetime.utcnow() + timedelta(seconds=ttl_seconds)
    }


# Import route modules to register endpoints with blueprint
from . import overview
from . import activity
from . import trends
from . import health
from . import spark
from . import user_journey
