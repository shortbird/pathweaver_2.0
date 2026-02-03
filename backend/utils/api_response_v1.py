"""
API v1 Response Standardization Utilities

Provides standardized response formats for API v1 endpoints.
Ensures consistent structure across all v1 API responses per migration plan.

This is separate from api_response.py to avoid breaking legacy endpoints.

Created: December 26, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: API_VERSIONING_MIGRATION_PLAN.md
"""

from flask import jsonify, request, g
from datetime import datetime
from typing import Any, Dict, List, Optional, Union
import math


def success_response(
    data: Union[Dict, List, Any],
    meta: Optional[Dict] = None,
    links: Optional[Dict] = None,
    status: int = 200
) -> tuple:
    """
    Standardized success response for API v1.

    Format:
        {
            "data": <response data>,
            "meta": <optional metadata>,
            "links": <optional HATEOAS links>
        }

    Args:
        data: Response data (dict, list, or primitive)
        meta: Optional metadata (pagination, counts, timestamps, etc.)
        links: Optional HATEOAS links (self, next, prev, related resources)
        status: HTTP status code (default: 200)

    Returns:
        Flask JSON response tuple (response, status_code)

    Example:
        >>> success_response(
        ...     data=[{"id": "123", "title": "Quest"}],
        ...     meta={"total": 1},
        ...     links={"self": "/api/v1/quests"}
        ... )
    """
    response = {"data": data}

    if meta:
        response["meta"] = meta

    if links:
        response["links"] = links

    return jsonify(response), status


def error_response(
    code: str,
    message: str,
    details: Optional[Dict] = None,
    status: int = 400
) -> tuple:
    """
    Standardized error response for API v1.

    Format:
        {
            "error": {
                "code": "ERROR_CODE",
                "message": "Human-readable message",
                "details": <optional error details>,
                "timestamp": "2025-12-26T12:00:00Z",
                "request_id": "correlation-id"
            }
        }

    Args:
        code: Error code (e.g., 'QUEST_NOT_FOUND', 'VALIDATION_ERROR')
        message: Human-readable error message
        details: Optional error details (field errors, validation issues, etc.)
        status: HTTP status code (default: 400)

    Returns:
        Flask JSON response tuple (response, status_code)

    Example:
        >>> error_response(
        ...     code='QUEST_NOT_FOUND',
        ...     message='Quest with ID "123" not found',
        ...     details={'quest_id': '123'},
        ...     status=404
        ... )
    """
    error = {
        "code": code,
        "message": message,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "request_id": getattr(g, 'correlation_id', None) or request.headers.get('X-Correlation-ID')
    }

    if details:
        error["details"] = details

    return jsonify({"error": error}), status


def paginated_response(
    data: List[Dict],
    page: int,
    per_page: int,
    total: int,
    base_url: str,
    status: int = 200
) -> tuple:
    """
    Standardized paginated response for API v1.

    Includes pagination metadata and HATEOAS links for navigation.

    Format:
        {
            "data": [<items for current page>],
            "meta": {
                "total": 156,
                "page": 2,
                "per_page": 20,
                "pages": 8
            },
            "links": {
                "self": "/api/v1/quests?page=2&per_page=20",
                "first": "/api/v1/quests?page=1&per_page=20",
                "last": "/api/v1/quests?page=8&per_page=20",
                "next": "/api/v1/quests?page=3&per_page=20",
                "prev": "/api/v1/quests?page=1&per_page=20"
            }
        }

    Args:
        data: List of items for current page
        page: Current page number (1-indexed)
        per_page: Items per page
        total: Total number of items across all pages
        base_url: Base URL for pagination links (e.g., '/api/v1/quests')
        status: HTTP status code (default: 200)

    Returns:
        Flask JSON response tuple (response, status_code)

    Example:
        >>> paginated_response(
        ...     data=[{"id": "1"}, {"id": "2"}],
        ...     page=1,
        ...     per_page=20,
        ...     total=45,
        ...     base_url='/api/v1/quests'
        ... )
    """
    total_pages = math.ceil(total / per_page) if per_page > 0 else 0

    meta = {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": total_pages
    }

    links = {
        "self": f"{base_url}?page={page}&per_page={per_page}",
        "first": f"{base_url}?page=1&per_page={per_page}",
        "last": f"{base_url}?page={total_pages}&per_page={per_page}" if total_pages > 0 else None,
        "next": f"{base_url}?page={page + 1}&per_page={per_page}" if page < total_pages else None,
        "prev": f"{base_url}?page={page - 1}&per_page={per_page}" if page > 1 else None
    }

    return success_response(data, meta=meta, links=links, status=status)


def cursor_paginated_response(
    data: List[Dict],
    next_cursor: Optional[str],
    has_more: bool,
    base_url: str,
    limit: int,
    status: int = 200
) -> tuple:
    """
    Standardized cursor-based paginated response for API v1.

    Cursor pagination is more efficient than offset pagination and provides
    consistent results even when data is being inserted/deleted.

    Format:
        {
            "data": [<items>],
            "meta": {
                "has_more": true,
                "limit": 20,
                "next_cursor": "eyJpZCI6MTIzfQ=="
            },
            "links": {
                "self": "/api/v1/quests?limit=20",
                "next": "/api/v1/quests?limit=20&cursor=eyJpZCI6MTIzfQ=="
            }
        }

    Args:
        data: List of items for current page
        next_cursor: Cursor for next page (base64 encoded), or None if no more pages
        has_more: Whether there are more results after this page
        base_url: Base URL for pagination links
        limit: Number of items per page
        status: HTTP status code (default: 200)

    Returns:
        Flask JSON response tuple (response, status_code)

    Example:
        >>> cursor_paginated_response(
        ...     data=[{"id": "1"}, {"id": "2"}],
        ...     next_cursor="abc123",
        ...     has_more=True,
        ...     base_url='/api/v1/quests',
        ...     limit=20
        ... )
    """
    meta = {
        "has_more": has_more,
        "limit": limit
    }

    if next_cursor:
        meta["next_cursor"] = next_cursor

    # Get current cursor from request (if any)
    current_cursor = request.args.get('cursor')

    links = {
        "self": f"{base_url}?limit={limit}" + (f"&cursor={current_cursor}" if current_cursor else ""),
    }

    if has_more and next_cursor:
        links["next"] = f"{base_url}?limit={limit}&cursor={next_cursor}"

    return success_response(data, meta=meta, links=links, status=status)


def created_response(
    data: Dict,
    location: Optional[str] = None,
    status: int = 201
) -> tuple:
    """
    Standardized response for resource creation (201 Created).

    Args:
        data: Created resource data
        location: Optional location URL of created resource
        status: HTTP status code (default: 201)

    Returns:
        Flask JSON response tuple with Location header if provided

    Example:
        >>> created_response(
        ...     data={"id": "123", "title": "New Quest"},
        ...     location="/api/v1/quests/123"
        ... )
    """
    response = jsonify({"data": data})
    response.status_code = status

    if location:
        response.headers['Location'] = location

    return response, status


def no_content_response() -> tuple:
    """
    Standardized response for successful operations with no content (204 No Content).

    Used for DELETE operations or updates that don't return data.

    Returns:
        Empty response with 204 status code

    Example:
        >>> @app.route('/api/v1/quests/<id>', methods=['DELETE'])
        ... def delete_quest(id):
        ...     quest_service.delete(id)
        ...     return no_content_response()
    """
    return '', 204


def accepted_response(
    data: Optional[Dict] = None,
    message: str = "Request accepted for processing"
) -> tuple:
    """
    Standardized response for asynchronous operations (202 Accepted).

    Used when request is accepted but processing will complete later.

    Args:
        data: Optional data about the async operation (job_id, status_url, etc.)
        message: Message about the async operation

    Returns:
        Flask JSON response tuple (response, 202)

    Example:
        >>> accepted_response(
        ...     data={"job_id": "abc123", "status_url": "/api/v1/jobs/abc123"},
        ...     message="Quest generation started"
        ... )
    """
    response_data = {"message": message}

    if data:
        response_data.update(data)

    return jsonify({"data": response_data}), 202
