"""
LMS Platform Configuration

Defines supported LMS platforms and their authentication/integration settings.
Each platform supports different authentication methods:
- LTI 1.3: Standards-based integration for Canvas, Moodle
- OAuth 2.0: API-based integration for Google Classroom, Schoology
"""

import os

from utils.logger import get_logger

logger = get_logger(__name__)

LMS_PLATFORMS = {
    'canvas': {
        'name': 'Canvas LMS',
        'auth_method': 'lti_1_3',
        'client_id': 'ENV:CANVAS_CLIENT_ID',
        'platform_url': 'https://canvas.instructure.com',
        'jwks_url': 'https://canvas.instructure.com/api/lti/security/jwks',
        'auth_url': 'https://canvas.instructure.com/api/lti/authorize_redirect',
        'token_url': 'https://canvas.instructure.com/login/oauth2/token',
        'supports_grade_passback': True,
        'supports_deep_linking': True,
        'supports_roster_sync': True
    },
    'google_classroom': {
        'name': 'Google Classroom',
        'auth_method': 'oauth2',
        'client_id': 'ENV:GOOGLE_CLIENT_ID',
        'client_secret': 'ENV:GOOGLE_CLIENT_SECRET',
        'auth_url': 'https://accounts.google.com/o/oauth2/v2/auth',
        'token_url': 'https://oauth2.googleapis.com/token',
        'api_url': 'https://classroom.googleapis.com/v1',
        'scopes': [
            'https://www.googleapis.com/auth/classroom.courses.readonly',
            'https://www.googleapis.com/auth/classroom.rosters.readonly',
            'https://www.googleapis.com/auth/classroom.coursework.students'
        ],
        'supports_grade_passback': False,
        'supports_deep_linking': False,
        'supports_roster_sync': True
    },
    'schoology': {
        'name': 'Schoology',
        'auth_method': 'oauth2',
        'client_id': 'ENV:SCHOOLOGY_CLIENT_ID',
        'client_secret': 'ENV:SCHOOLOGY_CLIENT_SECRET',
        'api_url': 'https://api.schoology.com/v1',
        'auth_url': 'https://app.schoology.com/oauth/authorize',
        'token_url': 'https://app.schoology.com/oauth/access_token',
        'supports_grade_passback': True,
        'supports_deep_linking': False,
        'supports_roster_sync': True
    },
    'moodle': {
        'name': 'Moodle',
        'auth_method': 'lti_1_3',
        'platform_url': 'ENV:MOODLE_URL',
        'supports_grade_passback': True,
        'supports_deep_linking': True,
        'supports_roster_sync': True
    },
    'spark': {
        'name': 'Spark LMS',
        'auth_method': 'simple_jwt',
        'shared_secret': 'ENV:SPARK_SSO_SECRET',
        'webhook_secret': 'ENV:SPARK_WEBHOOK_SECRET',
        'api_url': 'ENV:SPARK_API_URL',
        'api_key': 'ENV:SPARK_API_KEY',
        'supports_grade_passback': True,
        'supports_deep_linking': False,
        'supports_roster_sync': True,
        'supports_webhooks': True
    }
}

def get_platform_config(platform_name):
    """
    Get configuration for specific LMS platform

    Args:
        platform_name: Name of the platform (canvas, google_classroom, etc.)

    Returns:
        Dict with platform configuration or None if not found
    """
    config = LMS_PLATFORMS.get(platform_name)

    if config:
        # Resolve environment variables
        resolved_config = config.copy()
        for key, value in resolved_config.items():
            if isinstance(value, str) and value.startswith('ENV:'):
                env_var = value.replace('ENV:', '')
                resolved_config[key] = os.getenv(env_var)

        return resolved_config

    return None

def get_supported_platforms():
    """
    Get list of supported LMS platforms

    Returns:
        List of platform identifiers
    """
    return list(LMS_PLATFORMS.keys())

def validate_platform_config(platform_name):
    """
    Validate that required environment variables are set for a platform

    Args:
        platform_name: Name of the platform to validate

    Returns:
        Tuple of (is_valid, missing_vars)
    """
    config = LMS_PLATFORMS.get(platform_name)

    if not config:
        return False, ['Platform not found']

    missing_vars = []

    for key, value in config.items():
        if isinstance(value, str) and value.startswith('ENV:'):
            env_var = value.replace('ENV:', '')
            if not os.getenv(env_var):
                missing_vars.append(env_var)

    return len(missing_vars) == 0, missing_vars

def get_platform_display_name(platform_name):
    """
    Get human-readable display name for platform

    Args:
        platform_name: Platform identifier

    Returns:
        Display name or None if platform not found
    """
    config = LMS_PLATFORMS.get(platform_name)
    return config.get('name') if config else None
