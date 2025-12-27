"""
API Version Detection and Management

Provides utilities for detecting API version from requests
and enforcing version requirements on endpoints.

Created: December 26, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: API_VERSIONING_MIGRATION_PLAN.md
"""

from flask import request, jsonify, g
from functools import wraps
import re
from typing import Optional


def detect_api_version() -> Optional[str]:
    """
    Detect API version from request path.

    Checks the request URL path for version indicators:
    - /api/v1/* → returns 'v1'
    - /api/v2/* → returns 'v2'
    - /api/* (no version) → returns 'legacy'
    - Other paths → returns None

    Returns:
        str or None: API version ('v1', 'v2', 'legacy', or None)

    Example:
        >>> # Request to /api/v1/quests
        >>> detect_api_version()
        'v1'

        >>> # Request to /api/quests
        >>> detect_api_version()
        'legacy'
    """
    path = request.path

    # Check for versioned path (/api/v1, /api/v2, etc.)
    version_match = re.search(r'/api/(v\d+)/', path)
    if version_match:
        return version_match.group(1)

    # Check for legacy /api/* path (no version)
    if path.startswith('/api/') and not re.search(r'/api/v\d+/', path):
        return 'legacy'

    # Not an API endpoint
    return None


def require_version(min_version: str = 'v1'):
    """
    Decorator to require minimum API version for an endpoint.

    Blocks requests to legacy endpoints that require a specific version.
    Useful for new features that should only be available in v1+.

    Args:
        min_version: Minimum required version (e.g., 'v1', 'v2')
                    Default: 'v1'

    Returns:
        Decorator function

    Example:
        >>> @app.route('/api/v1/new-feature')
        >>> @require_version('v1')
        ... def new_feature():
        ...     return jsonify({"feature": "only in v1+"})

    Raises:
        400 error if accessed via legacy endpoint
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            current_version = detect_api_version()

            if current_version == 'legacy':
                return jsonify({
                    "error": {
                        "code": "VERSION_REQUIRED",
                        "message": f"This endpoint requires API version {min_version} or higher.",
                        "details": {
                            "required_version": min_version,
                            "current_version": "legacy",
                            "upgrade_url": f"/api/{min_version}{request.path.replace('/api/', '/')}"
                        }
                    }
                }), 400

            # Version check passed, execute the endpoint
            return f(*args, **kwargs)

        return decorated_function
    return decorator


def set_api_version_header(response):
    """
    Add API version header to response.

    Adds X-API-Version header to all API responses for client tracking.

    Args:
        response: Flask response object

    Returns:
        Modified response with X-API-Version header

    Example:
        >>> @app.after_request
        ... def add_version_header(response):
        ...     return set_api_version_header(response)
    """
    version = detect_api_version()
    if version:
        response.headers['X-API-Version'] = version

    return response


def compare_versions(version_a: str, version_b: str) -> int:
    """
    Compare two API version strings.

    Args:
        version_a: First version string (e.g., 'v1', 'v2')
        version_b: Second version string (e.g., 'v1', 'v2')

    Returns:
        int: -1 if version_a < version_b
             0 if version_a == version_b
             1 if version_a > version_b

    Example:
        >>> compare_versions('v1', 'v2')
        -1
        >>> compare_versions('v2', 'v1')
        1
        >>> compare_versions('v1', 'v1')
        0
    """
    # Extract numeric parts
    num_a = int(re.search(r'v(\d+)', version_a).group(1)) if re.search(r'v(\d+)', version_a) else 0
    num_b = int(re.search(r'v(\d+)', version_b).group(1)) if re.search(r'v(\d+)', version_b) else 0

    if num_a < num_b:
        return -1
    elif num_a > num_b:
        return 1
    else:
        return 0


def get_version_info() -> dict:
    """
    Get information about available API versions.

    Returns:
        dict: Information about API versions including:
            - current_version: The version of the current request
            - available_versions: List of all available versions
            - latest_version: The most recent stable version
            - deprecated_versions: List of deprecated versions

    Example:
        >>> get_version_info()
        {
            "current_version": "v1",
            "available_versions": ["v1", "v2"],
            "latest_version": "v2",
            "deprecated_versions": ["legacy"],
            "legacy_sunset_date": "2026-06-30"
        }
    """
    from utils.deprecation import DEPRECATION_SUNSET_DATE

    current = detect_api_version()

    return {
        "current_version": current or "unknown",
        "available_versions": ["v1"],  # Update as new versions are added
        "latest_version": "v1",
        "deprecated_versions": ["legacy"],
        "legacy_sunset_date": DEPRECATION_SUNSET_DATE,
        "migration_guide_url": "/api/docs/migration"
    }


def track_version_usage():
    """
    Track API version usage for analytics.

    Stores version information in Flask's g object for logging.
    This data can be used to monitor version adoption and plan deprecations.

    Should be called in a before_request handler.

    Example:
        >>> @app.before_request
        ... def track_api_version():
        ...     track_version_usage()
    """
    version = detect_api_version()
    if version:
        g.api_version = version
        g.is_legacy_api = (version == 'legacy')


def get_endpoint_version_mapping() -> dict:
    """
    Get mapping of endpoints to their available versions.

    Returns:
        dict: Mapping of endpoint patterns to available versions

    Example:
        >>> get_endpoint_version_mapping()
        {
            "/quests": ["legacy", "v1"],
            "/quests/:id": ["legacy", "v1"],
            "/new-feature": ["v1"]
        }

    Note:
        This is a placeholder for future implementation.
        Would typically read from a configuration file or database.
    """
    # TODO: Implement dynamic endpoint version mapping
    # For now, return basic mapping
    return {
        "message": "Endpoint version mapping not yet implemented",
        "note": "All legacy endpoints have v1 equivalents"
    }
