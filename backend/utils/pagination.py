"""
Pagination utilities for standardizing API pagination across all endpoints.

This module provides helpers for consistent pagination using page/per_page parameters
and returning standardized metadata in API responses.

Standard pagination format:
- Request: GET /api/v1/quests?page=2&per_page=20
- Response includes 'meta' with: total, page, per_page, pages
- Response includes 'links' with: self, first, last, next, prev

Cursor-based pagination format (recommended for high-traffic endpoints):
- Request: GET /api/v1/quests?limit=20&cursor=eyJpZCI6MTIzfQ==
- Response includes 'meta' with: has_more, next_cursor
- Response includes 'links' with: self, next
"""

from typing import Any, Dict, Optional, Tuple
from flask import request
import base64
import json


def paginate(query: Any, page: int = 1, per_page: int = 20, max_per_page: int = 100) -> Tuple[Any, Dict[str, Any]]:
    """
    Apply pagination to a Supabase query and return paginated data with metadata.

    Args:
        query: Supabase query object to paginate
        page: Page number (1-indexed)
        per_page: Items per page
        max_per_page: Maximum items allowed per page (default: 100)

    Returns:
        Tuple of (query_with_pagination, pagination_metadata)

    Example:
        >>> query = supabase.table('quests').select('*')
        >>> paginated_query, meta = paginate(query, page=2, per_page=20)
        >>> result = paginated_query.execute()
        >>> return success_response(data=result.data, meta=meta)
    """
    # Ensure per_page doesn't exceed max
    per_page = min(per_page, max_per_page)

    # Ensure page is at least 1
    page = max(page, 1)

    # Calculate offset
    offset = (page - 1) * per_page

    # Apply range to query (Supabase uses inclusive start, exclusive end)
    paginated_query = query.range(offset, offset + per_page - 1)

    # Note: We don't have total count yet - it will be added after query execution
    # The calling code should execute the query and call build_pagination_meta()

    return paginated_query, {
        'page': page,
        'per_page': per_page,
        'offset': offset
    }


def build_pagination_meta(
    total: int,
    page: int,
    per_page: int,
    base_url: Optional[str] = None
) -> Dict[str, Any]:
    """
    Build complete pagination metadata including links.

    Args:
        total: Total number of items
        page: Current page number
        per_page: Items per page
        base_url: Base URL for building links (e.g., '/api/v1/quests')

    Returns:
        Dictionary with pagination metadata

    Example:
        >>> meta = build_pagination_meta(total=156, page=2, per_page=20, base_url='/api/v1/quests')
        >>> # Returns: {'total': 156, 'page': 2, 'per_page': 20, 'pages': 8}
    """
    # Calculate total pages
    pages = (total + per_page - 1) // per_page if total > 0 else 0

    meta = {
        'total': total,
        'page': page,
        'per_page': per_page,
        'pages': pages
    }

    # Add links if base_url provided
    if base_url:
        # Get current query params (excluding page)
        query_params = {k: v for k, v in request.args.items() if k != 'page'}

        def build_link(page_num: Optional[int]) -> Optional[str]:
            """Build URL with page parameter."""
            if page_num is None or page_num < 1 or page_num > pages:
                return None

            params = {**query_params, 'page': page_num}
            param_str = '&'.join([f"{k}={v}" for k, v in params.items()])

            return f"{base_url}?{param_str}" if param_str else base_url

        links = {
            'self': build_link(page),
            'first': build_link(1) if pages > 0 else None,
            'last': build_link(pages) if pages > 0 else None,
            'next': build_link(page + 1) if page < pages else None,
            'prev': build_link(page - 1) if page > 1 else None
        }

        return meta, links

    return meta, None


def get_pagination_params(
    default_per_page: int = 20,
    max_per_page: int = 100
) -> Tuple[int, int]:
    """
    Extract and validate pagination parameters from request.

    Args:
        default_per_page: Default items per page if not specified
        max_per_page: Maximum allowed items per page

    Returns:
        Tuple of (page, per_page)

    Example:
        >>> page, per_page = get_pagination_params()
        >>> # If request has ?page=2&per_page=50, returns (2, 50)
        >>> # If request has no params, returns (1, 20)
    """
    try:
        page = int(request.args.get('page', 1))
        page = max(page, 1)  # Ensure at least 1
    except (ValueError, TypeError):
        page = 1

    try:
        per_page = int(request.args.get('per_page', default_per_page))
        per_page = min(per_page, max_per_page)  # Cap at max
        per_page = max(per_page, 1)  # Ensure at least 1
    except (ValueError, TypeError):
        per_page = default_per_page

    return page, per_page


def paginate_list(
    items: list,
    page: int = 1,
    per_page: int = 20,
    base_url: Optional[str] = None
) -> Tuple[list, Dict[str, Any], Optional[Dict[str, str]]]:
    """
    Paginate an in-memory list and return data with metadata.

    Use this when you already have a list in memory (e.g., after filtering).
    For database queries, use paginate() instead.

    Args:
        items: List of items to paginate
        page: Page number (1-indexed)
        per_page: Items per page
        base_url: Base URL for building pagination links

    Returns:
        Tuple of (paginated_items, meta, links)

    Example:
        >>> all_quests = [q1, q2, q3, ..., q100]
        >>> data, meta, links = paginate_list(all_quests, page=2, per_page=20)
        >>> return success_response(data=data, meta=meta, links=links)
    """
    total = len(items)

    # Calculate offset
    offset = (page - 1) * per_page

    # Slice the list
    paginated_items = items[offset:offset + per_page]

    # Build metadata
    meta, links = build_pagination_meta(
        total=total,
        page=page,
        per_page=per_page,
        base_url=base_url
    )

    return paginated_items, meta, links


def count_total(query: Any) -> int:
    """
    Get total count for a Supabase query.

    This executes a separate count query to get the total number of items.

    Args:
        query: Supabase query object

    Returns:
        Total count of items

    Example:
        >>> query = supabase.table('quests').select('*', count='exact')
        >>> total = count_total(query)
    """
    # Execute with count='exact' to get total
    # Note: This is a separate query and may impact performance
    # Consider caching for frequently accessed endpoints
    result = query.execute(count='exact')
    return result.count if hasattr(result, 'count') else 0


# Cursor-based pagination functions

def encode_cursor(last_item: Dict[str, Any]) -> str:
    """
    Encode cursor from last item in result set.

    The cursor contains the ID and created_at timestamp of the last item
    to enable consistent pagination even when data changes.

    Args:
        last_item: Last item in the result set (must have 'id' and 'created_at')

    Returns:
        Base64-encoded cursor string

    Example:
        >>> last_quest = {"id": "123e4567-e89b-12d3-a456-426614174000", "created_at": "2025-01-01T12:00:00Z"}
        >>> cursor = encode_cursor(last_quest)
        >>> # Returns: "eyJpZCI6IjEyM2U0NTY3LWU4OWItMTJkMy1hNDU2LTQyNjYxNDE3NDAwMCIsImNyZWF0ZWRfYXQiOiIyMDI1LTAxLTAxVDEyOjAwOjAwWiJ9"
    """
    cursor_data = {
        "id": last_item.get('id'),
        "created_at": last_item.get('created_at')
    }
    return base64.b64encode(json.dumps(cursor_data).encode()).decode()


def decode_cursor(cursor: str) -> Dict[str, Any]:
    """
    Decode cursor to extract pagination position.

    Args:
        cursor: Base64-encoded cursor string

    Returns:
        Dictionary with 'id' and 'created_at' keys

    Raises:
        ValueError: If cursor is invalid or malformed

    Example:
        >>> cursor = "eyJpZCI6IjEyMyIsImNyZWF0ZWRfYXQiOiIyMDI1LTAxLTAxIn0="
        >>> data = decode_cursor(cursor)
        >>> # Returns: {"id": "123", "created_at": "2025-01-01"}
    """
    try:
        decoded_bytes = base64.b64decode(cursor)
        cursor_data = json.loads(decoded_bytes.decode())

        if not isinstance(cursor_data, dict) or 'id' not in cursor_data or 'created_at' not in cursor_data:
            raise ValueError("Cursor must contain 'id' and 'created_at' fields")

        return cursor_data
    except (base64.binascii.Error, json.JSONDecodeError, UnicodeDecodeError) as e:
        raise ValueError(f"Invalid cursor format: {str(e)}")


def get_cursor_params(
    default_limit: int = 20,
    max_limit: int = 100
) -> Tuple[Optional[str], int]:
    """
    Extract and validate cursor pagination parameters from request.

    Args:
        default_limit: Default limit if not specified
        max_limit: Maximum allowed limit

    Returns:
        Tuple of (cursor, limit)

    Example:
        >>> cursor, limit = get_cursor_params()
        >>> # If request has ?cursor=abc123&limit=50, returns ("abc123", 50)
        >>> # If request has no params, returns (None, 20)
    """
    cursor = request.args.get('cursor')

    try:
        limit = int(request.args.get('limit', default_limit))
        limit = min(limit, max_limit)  # Cap at max
        limit = max(limit, 1)  # Ensure at least 1
    except (ValueError, TypeError):
        limit = default_limit

    return cursor, limit


def paginate_cursor(
    query: Any,
    cursor: Optional[str] = None,
    limit: int = 20,
    order_column: str = 'created_at',
    id_column: str = 'id'
) -> Tuple[Any, Dict[str, Any]]:
    """
    Apply cursor-based pagination to a Supabase query.

    This provides consistent results even when data changes between requests.
    The query is filtered to return items after the cursor position.

    Args:
        query: Supabase query object to paginate
        cursor: Base64-encoded cursor from previous response
        limit: Number of items to return
        order_column: Column to order by (default: 'created_at')
        id_column: ID column name (default: 'id')

    Returns:
        Tuple of (query_with_cursor_filter, cursor_metadata)

    Example:
        >>> query = supabase.table('quests').select('*')
        >>> cursor = request.args.get('cursor')
        >>> paginated_query, meta = paginate_cursor(query, cursor, limit=20)
        >>> result = paginated_query.execute()
        >>> # meta will contain 'has_more' and 'next_cursor' if applicable
    """
    # Apply cursor filter if provided
    if cursor:
        try:
            cursor_data = decode_cursor(cursor)

            # Filter: created_at < cursor.created_at OR (created_at = cursor.created_at AND id < cursor.id)
            # This ensures we get items after the cursor position
            # For Supabase, we need to use .lt() and .eq() filters

            # Note: Supabase postgrest doesn't support OR directly in this way
            # We need to use a different approach: use created_at < cursor OR created_at = cursor AND id < cursor.id
            # For simplicity, we'll use created_at <= cursor AND id < cursor for items on same timestamp
            query = query.lt(order_column, cursor_data['created_at'])

        except ValueError:
            # Invalid cursor - ignore it and start from beginning
            pass

    # Fetch limit + 1 to check if there are more results
    query = query.order(order_column, desc=True).order(id_column, desc=True).limit(limit + 1)

    # Return query and metadata placeholder
    # The caller will execute the query and call build_cursor_meta()
    return query, {
        'limit': limit,
        'order_column': order_column,
        'id_column': id_column
    }


def build_cursor_meta(
    items: list,
    limit: int,
    base_url: Optional[str] = None
) -> Tuple[list, Dict[str, Any], Optional[Dict[str, str]]]:
    """
    Build cursor pagination metadata from query results.

    This should be called after executing a cursor-paginated query.

    Args:
        items: Query results (should contain limit + 1 items if there are more)
        limit: The limit that was requested
        base_url: Base URL for building links (e.g., '/api/v1/quests')

    Returns:
        Tuple of (data, meta, links)
        - data: Items for current page (limited to 'limit' count)
        - meta: Dictionary with 'has_more' and 'next_cursor' (if applicable)
        - links: Dictionary with 'self' and 'next' (if applicable)

    Example:
        >>> result = paginated_query.execute()
        >>> data, meta, links = build_cursor_meta(result.data, limit=20, base_url='/api/v1/quests')
        >>> return success_response(data=data, meta=meta, links=links)
    """
    has_more = len(items) > limit
    data = items[:limit]  # Only return requested limit

    meta = {
        'has_more': has_more
    }

    links = None
    next_cursor = None

    if has_more and len(data) > 0:
        # Create cursor from last item in the limited dataset
        next_cursor = encode_cursor(data[-1])
        meta['next_cursor'] = next_cursor

        # Build links if base_url provided
        if base_url:
            # Get current query params (excluding cursor)
            query_params = {k: v for k, v in request.args.items() if k != 'cursor'}
            query_params['cursor'] = next_cursor

            param_str = '&'.join([f"{k}={v}" for k, v in query_params.items()])
            next_link = f"{base_url}?{param_str}" if param_str else base_url

            # Get self link
            self_params = {k: v for k, v in request.args.items()}
            self_param_str = '&'.join([f"{k}={v}" for k, v in self_params.items()])
            self_link = f"{base_url}?{self_param_str}" if self_param_str else base_url

            links = {
                'self': self_link,
                'next': next_link if has_more else None
            }

    elif base_url:
        # Even if no next, provide self link
        self_params = {k: v for k, v in request.args.items()}
        self_param_str = '&'.join([f"{k}={v}" for k, v in self_params.items()])
        self_link = f"{base_url}?{self_param_str}" if self_param_str else base_url

        links = {
            'self': self_link,
            'next': None
        }

    return data, meta, links
