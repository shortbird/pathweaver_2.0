"""
Response Helper Utilities

Centralized HTTP response utilities to reduce code duplication and ensure consistency.
Replaces 1,500+ occurrences of manual jsonify() calls across 78 route files.

All functions return Flask response tuples: (jsonify(data), status_code)
"""

from flask import jsonify
from typing import Any, Dict, Optional, Union, Tuple


# ===== Success Responses =====

def success(
    data: Optional[Dict[str, Any]] = None,
    message: Optional[str] = None,
    status_code: int = 200
) -> Tuple[Any, int]:
    """
    Generic success response.

    Args:
        data: Response data (optional)
        message: Success message (optional)
        status_code: HTTP status code (default: 200)

    Returns:
        tuple: (jsonify(response), status_code)

    Example:
        >>> return success({'user': user_data})
        >>> return success(message='Quest completed successfully')
        >>> return success({'quest': quest_data}, 'Quest created', 201)
    """
    response = {}

    if message:
        response['message'] = message

    if data:
        response.update(data)

    return jsonify(response), status_code


def success_message(message: str, status_code: int = 200) -> Tuple[Any, int]:
    """
    Success response with message only.

    Replaces: return jsonify({'message': '...'}), 200

    Args:
        message: Success message
        status_code: HTTP status code (default: 200)

    Returns:
        tuple: (jsonify({'message': message}), status_code)

    Example:
        >>> return success_message('User updated successfully')
        >>> return success_message('Quest deleted', 200)
    """
    return jsonify({'message': message}), status_code


def created(data: Dict[str, Any], message: Optional[str] = None) -> Tuple[Any, int]:
    """
    201 Created response for resource creation.

    Args:
        data: Created resource data
        message: Optional success message

    Returns:
        tuple: (jsonify(response), 201)

    Example:
        >>> return created({'quest': new_quest})
        >>> return created({'user': new_user}, 'User created successfully')
    """
    return success(data, message, status_code=201)


def no_content() -> Tuple[str, int]:
    """
    204 No Content response.

    Returns:
        tuple: ('', 204)

    Example:
        >>> return no_content()  # DELETE operations
    """
    return '', 204


# ===== Error Responses =====

def error(
    message: str,
    status_code: int = 500,
    details: Optional[Dict[str, Any]] = None
) -> Tuple[Any, int]:
    """
    Generic error response.

    Args:
        message: Error message
        status_code: HTTP status code (default: 500)
        details: Additional error details (optional)

    Returns:
        tuple: (jsonify({'error': message, ...}), status_code)

    Example:
        >>> return error('Database error', 500)
        >>> return error('Invalid input', 400, {'field': 'email'})
    """
    response = {'error': message}

    if details:
        response['details'] = details

    return jsonify(response), status_code


def bad_request(message: str = 'Bad request', details: Optional[Dict[str, Any]] = None) -> Tuple[Any, int]:
    """
    400 Bad Request response.

    Replaces: return jsonify({'error': '...'}), 400

    Args:
        message: Error message (default: 'Bad request')
        details: Additional error details (optional)

    Returns:
        tuple: (jsonify({'error': message}), 400)

    Example:
        >>> return bad_request('Invalid email format')
        >>> return bad_request('Validation failed', {'field': 'password'})
    """
    return error(message, 400, details)


def unauthorized(message: str = 'Unauthorized') -> Tuple[Any, int]:
    """
    401 Unauthorized response.

    Replaces: return jsonify({'error': 'Unauthorized'}), 401

    Args:
        message: Error message (default: 'Unauthorized')

    Returns:
        tuple: (jsonify({'error': message}), 401)

    Example:
        >>> return unauthorized()
        >>> return unauthorized('Invalid credentials')
    """
    return error(message, 401)


def forbidden(message: str = 'Forbidden') -> Tuple[Any, int]:
    """
    403 Forbidden response.

    Replaces: return jsonify({'error': 'Forbidden'}), 403

    Args:
        message: Error message (default: 'Forbidden')

    Returns:
        tuple: (jsonify({'error': message}), 403)

    Example:
        >>> return forbidden()
        >>> return forbidden('You do not have permission to access this resource')
    """
    return error(message, 403)


def not_found(resource: str = 'Resource') -> Tuple[Any, int]:
    """
    404 Not Found response.

    Replaces: return jsonify({'error': 'X not found'}), 404

    Args:
        resource: Name of the resource (default: 'Resource')

    Returns:
        tuple: (jsonify({'error': 'Resource not found'}), 404)

    Example:
        >>> return not_found('User')  # {'error': 'User not found'}
        >>> return not_found('Quest')  # {'error': 'Quest not found'}
        >>> return not_found()  # {'error': 'Resource not found'}
    """
    return error(f'{resource} not found', 404)


def conflict(message: str = 'Resource already exists') -> Tuple[Any, int]:
    """
    409 Conflict response.

    Args:
        message: Error message (default: 'Resource already exists')

    Returns:
        tuple: (jsonify({'error': message}), 409)

    Example:
        >>> return conflict('Email already registered')
        >>> return conflict('Quest already started')
    """
    return error(message, 409)


def unprocessable_entity(message: str = 'Unprocessable entity', details: Optional[Dict[str, Any]] = None) -> Tuple[Any, int]:
    """
    422 Unprocessable Entity response.

    Args:
        message: Error message (default: 'Unprocessable entity')
        details: Validation error details (optional)

    Returns:
        tuple: (jsonify({'error': message, 'details': details}), 422)

    Example:
        >>> return unprocessable_entity('Validation failed', {'email': 'Invalid format'})
    """
    return error(message, 422, details)


def internal_server_error(message: str = 'Internal server error', exception: Optional[Exception] = None) -> Tuple[Any, int]:
    """
    500 Internal Server Error response.

    Replaces: return jsonify({'error': str(e)}), 500

    Args:
        message: Error message (default: 'Internal server error')
        exception: Exception object (optional, converted to string for details)

    Returns:
        tuple: (jsonify({'error': message}), 500)

    Example:
        >>> return internal_server_error()
        >>> return internal_server_error('Database connection failed')
        >>> return internal_server_error('Query failed', exception=e)
    """
    if exception:
        details = {'exception': str(exception)}
        return error(message, 500, details)
    return error(message, 500)


# ===== Validation Response Helpers =====

def validation_error(errors: Union[str, Dict[str, str]]) -> Tuple[Any, int]:
    """
    Validation error response (400) with field-specific errors.

    Args:
        errors: Validation errors (string or dict of field: error)

    Returns:
        tuple: (jsonify({'error': ..., 'validation_errors': ...}), 400)

    Example:
        >>> return validation_error('Invalid input')
        >>> return validation_error({'email': 'Required', 'password': 'Too short'})
    """
    if isinstance(errors, str):
        return bad_request(errors)

    return jsonify({
        'error': 'Validation failed',
        'validation_errors': errors
    }), 400


def missing_field(field_name: str) -> Tuple[Any, int]:
    """
    Missing required field error (400).

    Args:
        field_name: Name of the missing field

    Returns:
        tuple: (jsonify({'error': 'Field is required'}), 400)

    Example:
        >>> return missing_field('email')  # {'error': 'email is required'}
        >>> return missing_field('password')  # {'error': 'password is required'}
    """
    return bad_request(f'{field_name} is required')


# ===== Paginated Response Helper =====

def paginated(
    data: list,
    total: int,
    page: int,
    per_page: int,
    message: Optional[str] = None
) -> Tuple[Any, int]:
    """
    Paginated response with metadata.

    Args:
        data: List of items for current page
        total: Total number of items
        page: Current page number
        per_page: Items per page
        message: Optional message

    Returns:
        tuple: (jsonify({'data': ..., 'pagination': ...}), 200)

    Example:
        >>> return paginated(quests, total=100, page=1, per_page=20)
    """
    response = {
        'data': data,
        'pagination': {
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': (total + per_page - 1) // per_page,
            'has_next': page * per_page < total,
            'has_prev': page > 1
        }
    }

    if message:
        response['message'] = message

    return jsonify(response), 200


# ===== Boolean Result Helpers =====

def success_bool(result: bool, true_msg: str, false_msg: str) -> Tuple[Any, int]:
    """
    Success response based on boolean result.

    Args:
        result: Boolean result
        true_msg: Message if True
        false_msg: Message if False

    Returns:
        tuple: (jsonify({'message': msg}), 200)

    Example:
        >>> return success_bool(is_enrolled, 'Already enrolled', 'Not enrolled')
    """
    message = true_msg if result else false_msg
    return success_message(message)


# ===== Convenience Aliases =====

# Common success patterns
ok = success  # Alias for success()
ok_message = success_message  # Alias for success_message()

# Common error patterns
err = error  # Alias for error()
err_bad_request = bad_request  # Alias for bad_request()
err_unauthorized = unauthorized  # Alias for unauthorized()
err_forbidden = forbidden  # Alias for forbidden()
err_not_found = not_found  # Alias for not_found()
err_server = internal_server_error  # Alias for internal_server_error()
