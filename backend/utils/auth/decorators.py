"""
Authentication Decorators

Sprint 2 - Task 4.2: Authentication Standardization (2025-01-22)
All decorators now use httpOnly cookies exclusively for enhanced security.
Authorization header fallback removed to prevent XSS token theft via localStorage.
"""

import sys
from functools import wraps
from flask import request, jsonify
from database import get_authenticated_supabase_client
from middleware.error_handler import AuthenticationError, AuthorizationError, ValidationError
from utils.session_manager import session_manager
from utils.validation import validate_uuid

from utils.logger import get_logger

logger = get_logger(__name__)

def require_auth(f):
    """
    Decorator to require authentication for routes.

    Uses httpOnly cookies exclusively for enhanced security.
    Tokens stored in localStorage are vulnerable to XSS attacks.

    Sprint 2 - Task 4.2: Authentication Standardization (2025-01-22)
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # Get user ID from secure httpOnly cookies only
        user_id = session_manager.get_current_user_id()

        if not user_id:
            raise AuthenticationError('Authentication required')

        # Store user_id in request context for error logging
        request.user_id = user_id

        return f(user_id, *args, **kwargs)

    return decorated_function

def require_admin(f):
    """
    Decorator to require admin access for routes.

    Uses httpOnly cookies exclusively for enhanced security.
    Verifies user has 'admin' or 'educator' role.

    Sprint 2 - Task 4.2: Authentication Standardization (2025-01-22)
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # Get user ID from secure httpOnly cookies only
        user_id = session_manager.get_current_user_id()

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
    """
    Decorator to require specific roles for routes.

    Uses httpOnly cookies exclusively for enhanced security.
    Verifies user has one of the specified roles.

    Args:
        *allowed_roles: One or more role names (e.g., 'student', 'parent', 'admin')

    Sprint 2 - Task 4.2: Authentication Standardization (2025-01-22)
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Skip authentication for OPTIONS requests (CORS preflight)
            if request.method == 'OPTIONS':
                return ('', 200)

            # Get user ID from secure httpOnly cookies only
            user_id = session_manager.get_current_user_id()

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

def require_advisor(f):
    """
    Decorator to require advisor or admin access for routes.

    Uses httpOnly cookies exclusively for enhanced security.
    Verifies user has 'advisor' or 'admin' role.
    Advisors can create quest drafts but need admin approval to publish.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # Get user ID from secure httpOnly cookies only
        user_id = session_manager.get_current_user_id()

        if not user_id:
            raise AuthenticationError('Authentication required')

        # Store user_id in request context
        request.user_id = user_id

        # Verify advisor or admin status
        supabase = get_authenticated_supabase_client()

        try:
            user = supabase.table('users').select('role').eq('id', user_id).execute()

            if not user.data or len(user.data) == 0 or user.data[0].get('role') not in ['advisor', 'admin']:
                raise AuthorizationError('Advisor access required')

            return f(user_id, *args, **kwargs)

        except (AuthenticationError, AuthorizationError):
            raise
        except Exception as e:
            print(f"Error verifying advisor status: {str(e)}", file=sys.stderr, flush=True)
            raise AuthorizationError('Failed to verify advisor status')

    return decorated_function

def require_advisor_for_student(f):
    """
    Decorator to require advisor assigned to specific student, or admin access.

    Uses httpOnly cookies exclusively for enhanced security.
    Checks advisor_student_assignments table to verify advisor is assigned to student.
    Admins always have access.

    Usage: Decorate routes that access student-specific data.
    The decorated function must have 'target_user_id' or 'student_id' as a parameter.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # Get user ID from secure httpOnly cookies only
        user_id = session_manager.get_current_user_id()

        if not user_id:
            raise AuthenticationError('Authentication required')

        # Store user_id in request context
        request.user_id = user_id

        # Get student ID from kwargs (can be target_user_id or student_id)
        student_id = kwargs.get('target_user_id') or kwargs.get('student_id')

        if not student_id:
            raise ValidationError('Student ID required')

        # Verify permissions
        supabase = get_authenticated_supabase_client()

        try:
            # Check user role
            user = supabase.table('users').select('role').eq('id', user_id).execute()

            if not user.data or len(user.data) == 0:
                raise AuthorizationError('User not found')

            user_role = user.data[0].get('role')

            # Admins always have access
            if user_role == 'admin':
                return f(user_id, *args, **kwargs)

            # For advisors, check if they're assigned to this student
            if user_role == 'advisor':
                assignment = supabase.table('advisor_student_assignments')\
                    .select('id')\
                    .eq('advisor_id', user_id)\
                    .eq('student_id', student_id)\
                    .eq('is_active', True)\
                    .execute()

                if assignment.data and len(assignment.data) > 0:
                    return f(user_id, *args, **kwargs)
                else:
                    raise AuthorizationError('Not authorized to access this student')

            # Other roles don't have access
            raise AuthorizationError('Advisor or admin access required')

        except (AuthenticationError, AuthorizationError, ValidationError):
            raise
        except Exception as e:
            print(f"Error verifying advisor-student assignment: {str(e)}", file=sys.stderr, flush=True)
            raise AuthorizationError('Failed to verify access permissions')

    return decorated_function

def get_advisor_assigned_students(advisor_id):
    """
    Helper function to get list of student IDs assigned to an advisor.

    Args:
        advisor_id: UUID of the advisor

    Returns:
        None if user is admin (meaning "all students")
        List of student UUIDs if user is advisor
        Empty list if advisor has no assigned students
    """
    supabase = get_authenticated_supabase_client()

    try:
        # Check if user is admin
        user = supabase.table('users').select('role').eq('id', advisor_id).execute()

        if user.data and len(user.data) > 0:
            user_role = user.data[0].get('role')

            # Admins see all students
            if user_role == 'admin':
                return None

            # Advisors see only assigned students
            if user_role == 'advisor':
                assignments = supabase.table('advisor_student_assignments')\
                    .select('student_id')\
                    .eq('advisor_id', advisor_id)\
                    .eq('is_active', True)\
                    .execute()

                if assignments.data:
                    return [a['student_id'] for a in assignments.data]
                else:
                    return []

        return []

    except Exception as e:
        print(f"Error getting advisor assigned students: {str(e)}", file=sys.stderr, flush=True)
        return []