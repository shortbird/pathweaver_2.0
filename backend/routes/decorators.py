"""
Route Decorators for API Versioning

Provides decorators for marking routes as deprecated and
automatically adding deprecation warnings to responses.

Created: December 26, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: API_VERSIONING_MIGRATION_PLAN.md
"""

from functools import wraps
from flask import g, request, make_response
from utils.deprecation import add_deprecation_headers, log_deprecated_access


def deprecated_route(f):
    """
    Decorator to mark legacy routes as deprecated.

    Automatically:
    1. Adds deprecation headers to response
    2. Logs deprecated endpoint access for analytics
    3. Extracts user ID if authenticated

    Apply this decorator to all legacy /api/* routes that have
    a /api/v1/* equivalent.

    Args:
        f: The route function to decorate

    Returns:
        Decorated function that adds deprecation warnings

    Example:
        >>> @app.route('/api/quests')
        >>> @deprecated_route
        ... def get_quests():
        ...     # Existing logic...
        ...     return jsonify(quests)

    Response Headers:
        Deprecation: true
        Sunset: 2026-06-30
        Link: </api/v1>; rel="successor-version"
        X-API-Warning: <deprecation message>
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Log deprecated access
        user_id = getattr(g, 'user_id', None)
        log_deprecated_access(request.path, user_id)

        # Execute original route function
        result = f(*args, **kwargs)

        # Convert result to response object if needed
        if not hasattr(result, 'headers'):
            response = make_response(result)
        else:
            response = result

        # Add deprecation headers
        response = add_deprecation_headers(response)

        return response

    return decorated_function


def version_aware(legacy_func=None, v1_func=None):
    """
    Decorator to create a version-aware route that can handle both legacy and v1.

    This is useful during transition period when you want both versions
    to use the same underlying logic but return different response formats.

    Args:
        legacy_func: Optional function to use for legacy requests
        v1_func: Optional function to use for v1 requests

    Returns:
        Decorator function

    Example:
        >>> def legacy_response(data):
        ...     return jsonify(data)
        ...
        >>> def v1_response(data):
        ...     return success_response(data)
        ...
        >>> @version_aware(legacy_func=legacy_response, v1_func=v1_response)
        ... def get_quests():
        ...     # Fetch data
        ...     quests = fetch_quests()
        ...     # Response formatter is automatically selected based on version
        ...     return quests

    Note:
        This is an advanced pattern. For most cases, separate routes are simpler.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            from utils.versioning import detect_api_version

            version = detect_api_version()

            # Execute the main function to get data
            data = f(*args, **kwargs)

            # Format response based on version
            if version == 'v1' and v1_func:
                return v1_func(data)
            elif version == 'legacy' and legacy_func:
                return legacy_func(data)
            else:
                # Default: return data as-is
                return data

        return decorated_function
    return decorator
