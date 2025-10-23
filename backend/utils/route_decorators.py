"""
Route decorators for standardized API endpoint handling
Provides @api_endpoint decorator with automatic error handling
"""

from functools import wraps
from flask import jsonify
from utils.logger import get_logger
from utils.exceptions import (
    ValidationError,
    NotFoundError,
    PermissionError,
    AuthenticationError,
)

logger = get_logger(__name__)


def api_endpoint(f):
    """
    Decorator for API endpoints with standardized error handling.

    Automatically wraps endpoint response in success format:
    {'success': True, 'data': result}

    Catches common exceptions and returns appropriate error responses:
    - ValidationError -> 400
    - AuthenticationError -> 401
    - PermissionError -> 403
    - NotFoundError -> 404
    - Exception -> 500

    Usage:
        @bp.route('/endpoint', methods=['POST'])
        @require_auth
        @api_endpoint
        def endpoint(user_id):
            data = service.do_work(user_id)
            return data  # Automatically wrapped

    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            # Execute endpoint function
            result = f(*args, **kwargs)

            # If already a tuple (response, status_code), return as-is
            if isinstance(result, tuple):
                return result

            # If already a Response object, return as-is
            if hasattr(result, 'status_code'):
                return result

            # Wrap in success response
            return jsonify({
                'success': True,
                'data': result
            }), 200

        except ValidationError as e:
            logger.warning(
                f"Validation error in {f.__name__}: {str(e)}",
                extra={'extra_fields': {'endpoint': f.__name__, 'error': str(e)}}
            )
            return jsonify({
                'success': False,
                'error': str(e),
                'error_type': 'validation_error'
            }), 400

        except AuthenticationError as e:
            logger.warning(
                f"Authentication error in {f.__name__}: {str(e)}",
                extra={'extra_fields': {'endpoint': f.__name__}}
            )
            return jsonify({
                'success': False,
                'error': 'Authentication required',
                'error_type': 'authentication_error'
            }), 401

        except PermissionError as e:
            logger.warning(
                f"Permission error in {f.__name__}: {str(e)}",
                extra={'extra_fields': {'endpoint': f.__name__}}
            )
            return jsonify({
                'success': False,
                'error': 'Insufficient permissions',
                'error_type': 'permission_error'
            }), 403

        except NotFoundError as e:
            logger.info(
                f"Resource not found in {f.__name__}: {str(e)}",
                extra={'extra_fields': {'endpoint': f.__name__}}
            )
            return jsonify({
                'success': False,
                'error': str(e),
                'error_type': 'not_found_error'
            }), 404

        except Exception as e:
            logger.error(
                f"Unexpected error in {f.__name__}: {str(e)}",
                exc_info=True,
                extra={'extra_fields': {'endpoint': f.__name__}}
            )
            return jsonify({
                'success': False,
                'error': 'An unexpected error occurred',
                'error_type': 'internal_error'
            }), 500

    return decorated_function
