"""
Pagination utilities for standardizing API pagination across all endpoints.

This module provides helpers for consistent pagination using page/per_page parameters
and returning standardized metadata in API responses.

Standard pagination format:
- Request: GET /api/v1/quests?page=2&per_page=20
- Response includes 'meta' with: total, page, per_page, pages
- Response includes 'links' with: self, first, last, next, prev
"""

from typing import Any, Dict, Optional, Tuple
from flask import request


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
