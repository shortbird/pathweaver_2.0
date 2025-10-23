"""Standardized API response utilities"""

from flask import jsonify
from typing import Any, Dict, List, Optional, Union

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

def deleted_response(
    message: str = 'Resource deleted successfully',
    **kwargs
) -> tuple:
    """
    Create a standardized response for resource deletion
    
    Args:
        message: Success message
        **kwargs: Additional fields to include in response
    
    Returns:
        Flask response tuple (jsonify object, 200)
    """
    return success_response(message=message, **kwargs)

def validation_error_response(
    errors: Union[str, Dict, List],
    message: str = 'Validation failed',
    **kwargs
) -> tuple:
    """
    Create a standardized validation error response
    
    Args:
        errors: Validation errors (string, dict, or list)
        message: Error message
        **kwargs: Additional fields to include in response
    
    Returns:
        Flask response tuple (jsonify object, 422)
    """
    if isinstance(errors, str):
        details = {'validation_errors': [errors]}
    elif isinstance(errors, list):
        details = {'validation_errors': errors}
    else:
        details = {'validation_errors': errors}
    
    return error_response(
        error=message,
        status_code=422,
        error_code='VALIDATION_ERROR',
        details=details,
        **kwargs
    )

def unauthorized_response(
    message: str = 'Authentication required',
    **kwargs
) -> tuple:
    """
    Create a standardized unauthorized response
    
    Args:
        message: Error message
        **kwargs: Additional fields to include in response
    
    Returns:
        Flask response tuple (jsonify object, 401)
    """
    return error_response(
        error=message,
        status_code=401,
        error_code='UNAUTHORIZED',
        **kwargs
    )

def forbidden_response(
    message: str = 'Access denied',
    **kwargs
) -> tuple:
    """
    Create a standardized forbidden response
    
    Args:
        message: Error message
        **kwargs: Additional fields to include in response
    
    Returns:
        Flask response tuple (jsonify object, 403)
    """
    return error_response(
        error=message,
        status_code=403,
        error_code='FORBIDDEN',
        **kwargs
    )

def not_found_response(
    resource: str = 'Resource',
    **kwargs
) -> tuple:
    """
    Create a standardized not found response
    
    Args:
        resource: Name of the resource that wasn't found
        **kwargs: Additional fields to include in response
    
    Returns:
        Flask response tuple (jsonify object, 404)
    """
    return error_response(
        error=f'{resource} not found',
        status_code=404,
        error_code='NOT_FOUND',
        **kwargs
    )

def server_error_response(
    message: str = 'An internal server error occurred',
    **kwargs
) -> tuple:
    """
    Create a standardized server error response
    
    Args:
        message: Error message
        **kwargs: Additional fields to include in response
    
    Returns:
        Flask response tuple (jsonify object, 500)
    """
    return error_response(
        error=message,
        status_code=500,
        error_code='INTERNAL_SERVER_ERROR',
        **kwargs
    )