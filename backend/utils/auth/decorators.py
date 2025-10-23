"""Authentication decorators"""

import sys
from functools import wraps
from flask import request, jsonify
from database import get_authenticated_supabase_client
from middleware.error_handler import AuthenticationError, AuthorizationError, ValidationError
from .token_utils import verify_token
from utils.session_manager import session_manager
from utils.validation import validate_uuid

def require_auth(f):
    """Decorator to require authentication for routes - prioritizes secure cookies"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # First try to get user ID from secure httpOnly cookies
        user_id = session_manager.get_current_user_id()

        # Fallback to Authorization header for backward compatibility
        if not user_id:
            token = request.headers.get('Authorization', '').replace('Bearer ', '')
            if token:
                user_id = verify_token(token)

        if not user_id:
            raise AuthenticationError('Authentication required')

        # Store user_id in request context for error logging
        request.user_id = user_id

        return f(user_id, *args, **kwargs)

    return decorated_function

def require_admin(f):
    """Decorator to require admin access for routes - prioritizes secure cookies"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # First try to get user ID from secure httpOnly cookies
        user_id = session_manager.get_current_user_id()

        # Fallback to Authorization header for backward compatibility
        if not user_id:
            token = request.headers.get('Authorization', '').replace('Bearer ', '')
            if token:
                user_id = verify_token(token)

        if not user_id:
            raise AuthenticationError('Authentication required')

        # Store user_id in request context
        request.user_id = user_id

        # Verify admin status
        supabase = get_authenticated_supabase_client()

        try:
            user = supabase.table('users').select('role').eq('id', user_id).execute()

            if not user.data or len(user.data) == 0 or user.data[0].get('role') not in ['admin', 'educator']:
                raise AuthorizationError('Admin access required')

            return f(user_id, *args, **kwargs)

        except (AuthenticationError, AuthorizationError):
            raise
        except Exception as e:
            print(f"Error verifying admin status: {str(e)}", file=sys.stderr, flush=True)
            raise AuthorizationError('Failed to verify admin status')

    return decorated_function

def require_role(*allowed_roles):
    """Decorator to require specific roles for routes - prioritizes secure cookies"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Skip authentication for OPTIONS requests (CORS preflight)
            if request.method == 'OPTIONS':
                return ('', 200)

            # First try to get user ID from secure httpOnly cookies
            user_id = session_manager.get_current_user_id()

            # Fallback to Authorization header for backward compatibility
            if not user_id:
                token = request.headers.get('Authorization', '').replace('Bearer ', '')
                if token:
                    user_id = verify_token(token)

            if not user_id:
                raise AuthenticationError('Authentication required')

            # Store user_id in request context
            request.user_id = user_id

            # Verify user role
            supabase = get_authenticated_supabase_client()

            try:
                user = supabase.table('users').select('role').eq('id', user_id).execute()

                if not user.data or len(user.data) == 0 or user.data[0].get('role') not in allowed_roles:
                    raise AuthorizationError(f'Required role: {", ".join(allowed_roles)}')

                return f(user_id, *args, **kwargs)

            except (AuthenticationError, AuthorizationError):
                raise
            except Exception as e:
                print(f"Error verifying user role: {str(e)}", file=sys.stderr, flush=True)
                raise AuthorizationError('Failed to verify user role')

        return decorated_function
    return decorator

# require_paid_tier decorator removed in Phase 2 refactoring (January 2025)
# All subscription tier functionality has been removed from the platform
# Use @require_auth instead for authentication

def validate_uuid_param(*param_names):
    """
    Decorator to validate UUID route parameters to prevent SQL injection
    Usage: @validate_uuid_param('user_id', 'quest_id')
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Validate each specified parameter
            for param_name in param_names:
                param_value = kwargs.get(param_name)
                if param_value:
                    is_valid, error = validate_uuid(param_value)
                    if not is_valid:
                        raise ValidationError(f"Invalid {param_name}: {error}")

            return f(*args, **kwargs)

        return decorated_function
    return decorator