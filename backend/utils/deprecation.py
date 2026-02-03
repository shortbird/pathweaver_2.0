"""
API Deprecation Warning System

Provides utilities for marking legacy API endpoints as deprecated
and adding appropriate headers to warn clients about upcoming changes.

Created: December 26, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: API_VERSIONING_MIGRATION_PLAN.md
"""

from flask import g, request
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Sunset date for legacy /api/* endpoints (6 months from Dec 2025)
DEPRECATION_SUNSET_DATE = "2026-06-30"


def add_deprecation_headers(response, sunset_date=None):
    """
    Add deprecation headers to legacy API responses.

    Adds the following HTTP headers:
    - Deprecation: true
    - Sunset: <date when endpoint will be removed>
    - Link: <URL of successor version>
    - X-API-Warning: Human-readable deprecation message

    Args:
        response: Flask response object to modify
        sunset_date: Optional custom sunset date (ISO 8601 format)
                     Defaults to DEPRECATION_SUNSET_DATE

    Returns:
        Modified response object with deprecation headers

    Example:
        >>> @app.route('/api/quests')
        ... def get_quests():
        ...     quests = fetch_quests()
        ...     response = jsonify(quests)
        ...     return add_deprecation_headers(response)
    """
    sunset = sunset_date or DEPRECATION_SUNSET_DATE

    # Standard deprecation headers
    response.headers['Deprecation'] = 'true'
    response.headers['Sunset'] = sunset
    response.headers['Link'] = '</api/v1>; rel="successor-version"'

    # Human-readable warning
    response.headers['X-API-Warning'] = (
        f'This API endpoint is deprecated and will be removed on {sunset}. '
        'Please migrate to /api/v1/* endpoints. '
        'See /api/docs for migration guide.'
    )

    return response


def log_deprecated_access(endpoint, user_id=None, client_info=None):
    """
    Log access to deprecated endpoints for analytics and monitoring.

    Logs include:
    - Endpoint path
    - User ID (if authenticated)
    - Client information (user agent, IP)
    - Timestamp
    - Correlation ID for request tracking

    This data helps identify which clients need migration assistance.

    Args:
        endpoint: The deprecated endpoint being accessed (e.g., '/api/quests')
        user_id: Optional user ID for authenticated requests
        client_info: Optional dict with client metadata (IP, user agent, etc.)

    Example:
        >>> log_deprecated_access(
        ...     endpoint='/api/quests',
        ...     user_id='user-123',
        ...     client_info={'user_agent': 'Mozilla/5.0', 'ip': '192.168.1.1'}
        ... )
    """
    log_data = {
        "event": "deprecated_api_access",
        "endpoint": endpoint,
        "user_id": user_id,
        "correlation_id": getattr(g, 'correlation_id', None),
        "timestamp": datetime.utcnow().isoformat(),
        "method": request.method,
        "client_info": client_info or {}
    }

    # Add request metadata
    log_data["client_info"]["user_agent"] = request.headers.get('User-Agent', 'Unknown')
    log_data["client_info"]["ip"] = request.remote_addr
    log_data["client_info"]["referer"] = request.headers.get('Referer')

    logger.warning(
        f"Deprecated API access: {request.method} {endpoint}",
        extra=log_data
    )


def get_deprecation_stats():
    """
    Get statistics on deprecated endpoint usage.

    This would typically query a logging/analytics database to return
    usage statistics for deprecated endpoints.

    Returns:
        dict: Statistics about deprecated endpoint usage

    Note:
        This is a placeholder for future implementation.
        Requires integration with logging aggregation system.
    """
    # TODO: Implement when logging aggregation is set up
    # For now, return a placeholder
    return {
        "message": "Deprecation statistics not yet implemented",
        "note": "Check application logs for deprecated_api_access events"
    }


def should_block_deprecated_access():
    """
    Determine if deprecated endpoints should be blocked (after sunset date).

    Returns:
        bool: True if current date is past sunset date

    Example:
        >>> if should_block_deprecated_access():
        ...     return jsonify({"error": "Endpoint removed. Use /api/v1"}), 410
    """
    try:
        sunset = datetime.fromisoformat(DEPRECATION_SUNSET_DATE)
        now = datetime.utcnow()
        return now > sunset
    except Exception as e:
        logger.error(f"Error checking deprecation sunset date: {e}")
        return False


def create_deprecation_notice(
    endpoint: str,
    new_endpoint: str,
    sunset_date: str = DEPRECATION_SUNSET_DATE,
    breaking_changes: list = None
) -> dict:
    """
    Create a structured deprecation notice for API documentation.

    Args:
        endpoint: The deprecated endpoint path
        new_endpoint: The replacement endpoint path
        sunset_date: Date when endpoint will be removed
        breaking_changes: Optional list of breaking changes between versions

    Returns:
        dict: Structured deprecation notice

    Example:
        >>> create_deprecation_notice(
        ...     endpoint='/api/quests',
        ...     new_endpoint='/api/v1/quests',
        ...     breaking_changes=['Response format changed to {data, meta, links}']
        ... )
    """
    return {
        "deprecated_endpoint": endpoint,
        "replacement_endpoint": new_endpoint,
        "sunset_date": sunset_date,
        "days_until_sunset": (datetime.fromisoformat(sunset_date) - datetime.utcnow()).days,
        "breaking_changes": breaking_changes or [],
        "migration_guide": f"/api/docs/migration#{endpoint.replace('/', '-')}",
        "support_contact": "support@optioeducation.com"
    }
