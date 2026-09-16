"""Standardized API response utilities"""

from flask import jsonify
from typing import Dict, List, Optional, Union

from utils.logger import get_logger

logger = get_logger(__name__)

def success_response(
    data: Optional[Union[Dict, List]] = None,
    message: Optional[str] = None,
    status_code: int = 200,
    **kwargs
) -> tuple:
    """
    Create a standardized success response
    
    Args:
        data: The response data (dict or list)
        message: Optional success message
        status_code: HTTP status code (default 200)
        **kwargs: Additional fields to include in response
    
    Returns:
        Flask response tuple (jsonify object, status_code)
    """
    response = {
        'success': True,
        'data': data or {}
    }
    
    if message:
        response['message'] = message
    
    # Add any additional fields
    response.update(kwargs)
    
    return jsonify(response), status_code

def error_response(
    error: str,
    status_code: int = 400,
    error_code: Optional[str] = None,
    details: Optional[Dict] = None,
    **kwargs
) -> tuple:
    """
    Create a standardized error response
    
    Args:
        error: Error message
        status_code: HTTP status code (default 400)
        error_code: Optional error code for client handling
        details: Optional additional error details
        **kwargs: Additional fields to include in response
    
    Returns:
        Flask response tuple (jsonify object, status_code)
    """
    response = {
        'success': False,
        'error': error
    }
    
    if error_code:
        response['error_code'] = error_code
    
    if details:
        response['details'] = details
    
    # Add any additional fields
    response.update(kwargs)
    
    return jsonify(response), status_code

def paginated_response(
    data: List,
    page: int,
    per_page: int,
    total: int,
    message: Optional[str] = None,
    **kwargs
) -> tuple:
    """
    Create a standardized paginated response
    
    Args:
        data: List of items for current page
        page: Current page number
        per_page: Items per page
        total: Total number of items
        message: Optional message
        **kwargs: Additional fields to include in response
    
    Returns:
        Flask response tuple (jsonify object, status_code)
    """
    total_pages = (total + per_page - 1) // per_page if per_page > 0 else 1
    
    response = {
        'success': True,
        'data': data,
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': total,
            'total_pages': total_pages,
            'has_next': page < total_pages,
            'has_prev': page > 1
        }
    }
    
    if message:
        response['message'] = message
    
    # Add any additional fields
    response.update(kwargs)
    
    return jsonify(response), 200

def created_response(
    data: Optional[Union[Dict, List]] = None,
    message: str = 'Resource created successfully',
    **kwargs
) -> tuple:
    """
    Create a standardized response for resource creation
    
    Args:
        data: The created resource data
        message: Success message
        **kwargs: Additional fields to include in response
    
    Returns:
        Flask response tuple (jsonify object, 201)
    """
    return success_response(data=data, message=message, status_code=201, **kwargs)
