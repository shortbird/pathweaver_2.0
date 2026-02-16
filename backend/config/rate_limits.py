"""
Rate Limiting Configuration - Single Source of Truth

Defines all rate limiting rules for API endpoints.
Used by middleware/rate_limiter.py
"""

# Rate limit configurations
# Format: {'requests': int, 'window': int (seconds)}

RATE_LIMITS = {
    # Authentication endpoints - stricter limits
    'auth_login': {
        'production': {'requests': 3, 'window': 900},  # 3 per 15 minutes
        'development': {'requests': 10, 'window': 300},  # 10 per 5 minutes
    },
    'auth_register': {
        'production': {'requests': 3, 'window': 900},  # 3 per 15 minutes
        'development': {'requests': 10, 'window': 300},  # 10 per 5 minutes
    },
    'auth_refresh': {
        'production': {'requests': 10, 'window': 60},  # 10 per minute
        'development': {'requests': 30, 'window': 60},  # 30 per minute
    },

    # File upload endpoints
    'upload': {
        'production': {'requests': 10, 'window': 3600},  # 10 per hour (per P1-SEC-2)
        'development': {'requests': 20, 'window': 3600},  # 20 per hour
    },
    'evidence_upload': {
        'production': {'requests': 10, 'window': 3600},  # 10 per hour (per P1-SEC-2)
        'development': {'requests': 20, 'window': 3600},  # 20 per hour
    },

    # API endpoints - general
    'api_default': {
        'production': {'requests': 60, 'window': 60},  # 60 per minute
        'development': {'requests': 100, 'window': 60},  # 100 per minute
    },

    # Write operations - general (per P1-SEC-2)
    'api_write': {
        'production': {'requests': 100, 'window': 3600},  # 100 per hour
        'development': {'requests': 200, 'window': 3600},  # 200 per hour
    },

    # Quest operations
    'quest_start': {
        'production': {'requests': 20, 'window': 60},  # 20 per minute
        'development': {'requests': 50, 'window': 60},  # 50 per minute
    },
    'task_complete': {
        'production': {'requests': 30, 'window': 60},  # 30 per minute
        'development': {'requests': 60, 'window': 60},  # 60 per minute
    },

    # Admin operations - moderate limits
    'admin_create': {
        'production': {'requests': 30, 'window': 60},  # 30 per minute
        'development': {'requests': 100, 'window': 60},  # 100 per minute
    },
    'admin_update': {
        'production': {'requests': 50, 'window': 60},  # 50 per minute
        'development': {'requests': 100, 'window': 60},  # 100 per minute
    },
    'admin_delete': {
        'production': {'requests': 20, 'window': 60},  # 20 per minute
        'development': {'requests': 50, 'window': 60},  # 50 per minute
    },

    # AI Tutor - token-intensive operations
    'tutor_chat': {
        'production': {'requests': 50, 'window': 3600},  # 50 per hour (per P1-SEC-2)
        'development': {'requests': 100, 'window': 3600},  # 100 per hour
    },

    # Social features
    'friend_request': {
        'production': {'requests': 10, 'window': 300},  # 10 per 5 minutes
        'development': {'requests': 20, 'window': 300},  # 20 per 5 minutes
    },
    'collaboration_invite': {
        'production': {'requests': 10, 'window': 300},  # 10 per 5 minutes
        'development': {'requests': 20, 'window': 300},  # 20 per 5 minutes
    },

    # LMS Integration
    'lms_sync': {
        'production': {'requests': 5, 'window': 300},  # 5 per 5 minutes
        'development': {'requests': 10, 'window': 300},  # 10 per 5 minutes
    },
    'lms_grade_passback': {
        'production': {'requests': 50, 'window': 60},  # 50 per minute
        'development': {'requests': 100, 'window': 60},  # 100 per minute
    },

    # Docs AI endpoints - token-intensive operations
    'docs_ai_generate': {
        'production': {'requests': 10, 'window': 3600},  # 10 per hour
        'development': {'requests': 20, 'window': 3600},  # 20 per hour
    },
    'docs_ai_suggest_missing': {
        'production': {'requests': 5, 'window': 3600},  # 5 per hour
        'development': {'requests': 10, 'window': 3600},  # 10 per hour
    },
    'docs_ai_suggest_updates': {
        'production': {'requests': 20, 'window': 3600},  # 20 per hour
        'development': {'requests': 40, 'window': 3600},  # 40 per hour
    },
    'docs_ai_scaffold': {
        'production': {'requests': 3, 'window': 3600},  # 3 per hour
        'development': {'requests': 10, 'window': 3600},  # 10 per hour
    },
    'docs_ai_reindex': {
        'production': {'requests': 2, 'window': 3600},  # 2 per hour
        'development': {'requests': 10, 'window': 3600},  # 10 per hour
    },
}

# Account lockout configuration
ACCOUNT_LOCKOUT = {
    'max_attempts': 5,  # Max failed login attempts
    'lockout_duration': 1800,  # 30 minutes in seconds
    'window': 900,  # Track attempts within 15 minutes
}

def get_rate_limit(limit_key: str, environment: str = 'production') -> dict:
    """
    Get rate limit configuration for a specific endpoint.

    Args:
        limit_key: The rate limit key (e.g., 'auth_login', 'upload')
        environment: 'production' or 'development'

    Returns:
        dict: Rate limit config with 'requests' and 'window'
    """
    if limit_key not in RATE_LIMITS:
        # Fallback to default API rate limit
        limit_key = 'api_default'

    limit_config = RATE_LIMITS[limit_key]

    # Return environment-specific config, fallback to production if missing
    return limit_config.get(environment, limit_config.get('production'))

def get_lockout_config() -> dict:
    """
    Get account lockout configuration.

    Returns:
        dict: Lockout config with max_attempts, lockout_duration, window
    """
    return ACCOUNT_LOCKOUT
