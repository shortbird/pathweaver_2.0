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
from utils.roles import get_effective_role, UserRole

logger = get_logger(__name__)

def has_admin_privileges(role: str) -> bool:
    """Check if a role has admin privileges (superadmin only)."""
    return role == 'superadmin'

def has_org_admin_privileges(effective_role: str) -> bool:
    """Check if an effective role has org admin privileges (org_admin or superadmin)."""
    return effective_role in ['org_admin', 'superadmin']

def has_role_or_admin(effective_role: str, *allowed_roles) -> bool:
    """Check if user has one of the allowed roles (using effective role), or is superadmin."""
    if effective_role in allowed_roles:
        return True
    if has_admin_privileges(effective_role):
        return True
    return False

def require_auth(f):
    """
    Decorator to require authentication for routes.

    Uses httpOnly cookies exclusively for enhanced security.
    Tokens stored in localStorage are vulnerable to XSS attacks.

    When masquerading, this returns the effective user ID (masquerade target).

    Sprint 2 - Task 4.2: Authentication Standardization (2025-01-22)
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # Get effective user ID (masquerade target if masquerading, else actual user)
        user_id = session_manager.get_effective_user_id()

        if not user_id:
            raise AuthenticationError('Authentication required')

        # Store user_id in request context for error logging
        request.user_id = user_id

        return f(user_id, *args, **kwargs)

    return decorated_function

def require_admin(f):
    """
    Decorator to require superadmin access for routes.

    Uses httpOnly cookies exclusively for enhanced security.
    Verifies user has 'superadmin' role.

    When masquerading, this checks the ACTUAL admin identity, not the masquerade target.

    Sprint 2 - Task 4.2: Authentication Standardization (2025-01-22)
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # Get actual admin user ID (not masquerade target)
        user_id = session_manager.get_actual_admin_id()

        if not user_id:
            raise AuthenticationError('Authentication required')

        # Store user_id in request context
        request.user_id = user_id

        # Verify superadmin status with retry logic (use admin client to bypass RLS)
        from database import get_supabase_admin_client
        max_retries = 2
        for attempt in range(max_retries):
            try:
                supabase = get_supabase_admin_client()
                user = supabase.table('users').select('role').eq('id', user_id).execute()

                if not user.data or len(user.data) == 0 or user.data[0].get('role') != 'superadmin':
                    raise AuthorizationError('Superadmin access required')

                return f(user_id, *args, **kwargs)

            except (AuthenticationError, AuthorizationError):
                raise
            except Exception as e:
                if attempt < max_retries - 1:
                    # Retry on connection errors
                    print(f"Retrying admin verification (attempt {attempt + 1}/{max_retries}): {str(e)}", file=sys.stderr, flush=True)
                    continue
                else:
                    # Final attempt failed
                    print(f"Error verifying admin status: {str(e)}", file=sys.stderr, flush=True)
                    raise AuthorizationError('Failed to verify admin status')

    return decorated_function

def require_role(*allowed_roles):
    """
    Decorator to require specific roles for routes.

    Uses httpOnly cookies exclusively for enhanced security.
    Verifies user has one of the specified roles (using effective role for org_managed users).

    When masquerading, this checks the masquerade target's role.

    Args:
        *allowed_roles: One or more role names (e.g., 'student', 'parent', 'advisor')

    Sprint 2 - Task 4.2: Authentication Standardization (2025-01-22)
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Skip authentication for OPTIONS requests (CORS preflight)
            if request.method == 'OPTIONS':
                return ('', 200)

            # Get effective user ID (masquerade target if masquerading)
            user_id = session_manager.get_effective_user_id()

            if not user_id:
                raise AuthenticationError('Authentication required')

            # Store user_id in request context
            request.user_id = user_id

            # Verify user role with retry logic (use admin client to bypass RLS)
            from database import get_supabase_admin_client
            max_retries = 2
            for attempt in range(max_retries):
                try:
                    supabase = get_supabase_admin_client()
                    user = supabase.table('users').select('role, org_role').eq('id', user_id).execute()

                    if not user.data or len(user.data) == 0:
                        raise AuthorizationError('User not found')

                    user_data = user.data[0]
                    effective_role = get_effective_role(user_data)

                    # Superadmin has access to everything
                    if effective_role == 'superadmin':
                        return f(user_id, *args, **kwargs)

                    if effective_role not in allowed_roles:
                        raise AuthorizationError(f'Required role: {", ".join(allowed_roles)}')

                    return f(user_id, *args, **kwargs)

                except (AuthenticationError, AuthorizationError):
                    raise
                except Exception as e:
                    if attempt < max_retries - 1:
                        # Retry on connection errors
                        print(f"Retrying role verification (attempt {attempt + 1}/{max_retries}): {str(e)}", file=sys.stderr, flush=True)
                        continue
                    else:
                        # Final attempt failed
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
    Decorator to require advisor, org_admin, or superadmin access for routes.

    Uses httpOnly cookies exclusively for enhanced security.
    Verifies user has 'advisor', 'org_admin', or 'superadmin' effective role,
    OR has is_org_admin=True (for users who are org admins but have a different base role).
    Advisors can create quest drafts but need admin approval to publish.

    When masquerading, this checks the actual admin identity, not the masquerade target.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # Get actual user ID (not masquerade target for advisor routes)
        user_id = session_manager.get_actual_admin_id()

        if not user_id:
            raise AuthenticationError('Authentication required')

        # Store user_id in request context
        request.user_id = user_id

        # Verify advisor or admin status (use admin client to bypass RLS)
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()

        try:
            user = supabase.table('users').select('role, org_role, is_org_admin').eq('id', user_id).execute()

            if not user.data or len(user.data) == 0:
                raise AuthorizationError('User not found')

            user_data = user.data[0]
            effective_role = get_effective_role(user_data)
            is_org_admin = user_data.get('is_org_admin', False)

            # Allow access if user has advisor/org_admin/superadmin effective role OR is_org_admin=True
            if effective_role not in ['advisor', 'org_admin', 'superadmin'] and not is_org_admin:
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

    When masquerading, this checks the actual admin identity, not the masquerade target.

    Usage: Decorate routes that access student-specific data.
    The decorated function must have 'target_user_id' or 'student_id' as a parameter.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # Get actual user ID (not masquerade target for advisor routes)
        user_id = session_manager.get_actual_admin_id()

        if not user_id:
            raise AuthenticationError('Authentication required')

        # Store user_id in request context
        request.user_id = user_id

        # Get student ID from kwargs (can be target_user_id or student_id)
        student_id = kwargs.get('target_user_id') or kwargs.get('student_id')

        if not student_id:
            raise ValidationError('Student ID required')

        # Verify permissions (use admin client to bypass RLS)
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()

        try:
            # Check user role
            user = supabase.table('users').select('role, org_role').eq('id', user_id).execute()

            if not user.data or len(user.data) == 0:
                raise AuthorizationError('User not found')

            user_data = user.data[0]
            effective_role = get_effective_role(user_data)

            # Superadmin always has access
            if effective_role == 'superadmin':
                return f(user_id, *args, **kwargs)

            # For advisors and org_admins, check if they're assigned to this student
            if effective_role in ['advisor', 'org_admin']:
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

def require_superadmin(f):
    """
    Decorator to require superadmin role.
    Superadmin is defined as role='superadmin'.
    Only tannerbowman@gmail.com should have this role.

    Uses httpOnly cookies exclusively for enhanced security.
    When masquerading, this checks the ACTUAL admin identity, not the masquerade target.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # Get actual admin user ID (not masquerade target)
        user_id = session_manager.get_actual_admin_id()

        if not user_id:
            raise AuthenticationError('Authentication required')

        # Store user_id in request context
        request.user_id = user_id

        # Verify superadmin status (use admin client to bypass RLS)
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()

        try:
            user = supabase.table('users').select('role').eq('id', user_id).single().execute()

            if not user.data or user.data['role'] != 'superadmin':
                raise AuthorizationError('Superadmin access required')

            return f(user_id, *args, **kwargs)

        except (AuthenticationError, AuthorizationError):
            raise
        except Exception as e:
            print(f"Error verifying superadmin status: {str(e)}", file=sys.stderr, flush=True)
            raise AuthorizationError('Failed to verify superadmin status')

    return decorated_function


def require_school_admin(f):
    """
    Decorator to require org_admin or superadmin access for routes.
    (Legacy name - use require_org_admin for new code)

    Uses httpOnly cookies exclusively for enhanced security.
    Verifies user has 'org_admin' or 'superadmin' effective role, OR is_org_admin=True.
    Org admins can manage their organization (quest visibility, announcements, etc.).

    When masquerading, this checks the actual admin identity, not the masquerade target.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # Get actual user ID (not masquerade target)
        user_id = session_manager.get_actual_admin_id()

        if not user_id:
            raise AuthenticationError('Authentication required')

        # Store user_id in request context
        request.user_id = user_id

        # Verify org_admin or superadmin status (use admin client to bypass RLS)
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()

        try:
            user = supabase.table('users').select('role, org_role, is_org_admin').eq('id', user_id).execute()

            if not user.data or len(user.data) == 0:
                raise AuthorizationError('User not found')

            user_data = user.data[0]
            effective_role = get_effective_role(user_data)
            is_org_admin = user_data.get('is_org_admin', False)

            # Check if superadmin, org_admin effective role, or is_org_admin flag
            if effective_role not in ['org_admin', 'superadmin'] and not is_org_admin:
                raise AuthorizationError('Organization admin access required')

            return f(user_id, *args, **kwargs)

        except (AuthenticationError, AuthorizationError):
            raise
        except Exception as e:
            print(f"Error verifying org admin status: {str(e)}", file=sys.stderr, flush=True)
            raise AuthorizationError('Failed to verify org admin status')

    return decorated_function


def require_org_admin(f):
    """
    Decorator to require org admin or superadmin role.
    Org admins can manage their own organization.
    Superadmins can manage all organizations.

    Uses httpOnly cookies exclusively for enhanced security.
    When masquerading, this checks the ACTUAL admin identity, not the masquerade target.

    Passes user_id, organization_id, and is_superadmin to the decorated function.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # Get actual admin user ID (not masquerade target)
        user_id = session_manager.get_actual_admin_id()

        if not user_id:
            raise AuthenticationError('Authentication required')

        # Store user_id in request context
        request.user_id = user_id

        # Verify org admin or superadmin status (use admin client to bypass RLS)
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()

        try:
            user = supabase.table('users')\
                .select('role, org_role, email, is_org_admin, organization_id')\
                .eq('id', user_id)\
                .single()\
                .execute()

            if not user.data:
                raise AuthorizationError('User not found')

            user_data = user.data
            effective_role = get_effective_role(user_data)

            # Check if superadmin
            is_superadmin = effective_role == 'superadmin'

            # Check if org admin (effective role or flag)
            is_org_admin_flag = user_data.get('is_org_admin', False)
            has_org_admin_access = is_superadmin or effective_role == 'org_admin' or is_org_admin_flag

            if not has_org_admin_access:
                raise AuthorizationError('Organization admin access required')

            # Pass user info to handler
            return f(user_id, user_data['organization_id'], is_superadmin, *args, **kwargs)

        except (AuthenticationError, AuthorizationError):
            raise
        except Exception as e:
            print(f"Error verifying org admin status: {str(e)}", file=sys.stderr, flush=True)
            raise AuthorizationError('Failed to verify organization admin status')

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
    from database import get_supabase_admin_client
    supabase = get_supabase_admin_client()

    try:
        # Check if user is admin
        user = supabase.table('users').select('role, org_role').eq('id', advisor_id).execute()

        if user.data and len(user.data) > 0:
            user_data = user.data[0]
            effective_role = get_effective_role(user_data)

            # Superadmin sees all students
            if effective_role == 'superadmin':
                return None

            # Advisors and org_admins see only assigned students
            if effective_role in ['advisor', 'org_admin']:
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

def require_parental_consent(f):
    """
    Decorator to check parental consent status for COPPA compliance.

    Blocks access for users who require parental consent but haven't been verified.
    This applies to users under 13 years old when they registered.

    COPPA Compliance: Users with requires_parental_consent=true must have
    parental_consent_status='approved' to access the platform.

    Returns 403 Forbidden with consent_required flag if not verified.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip check for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # Get user ID (should already be set by @require_auth)
        user_id = getattr(request, 'user_id', None) or session_manager.get_effective_user_id()

        if not user_id:
            # Auth will be handled by @require_auth decorator
            return f(*args, **kwargs)

        # Check parental consent status (use admin client to bypass RLS)
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()

        try:
            user = supabase.table('users').select(
                'requires_parental_consent, parental_consent_verified, parental_consent_status'
            ).eq('id', user_id).single().execute()

            if not user.data:
                # User not found, let other decorators handle it
                return f(*args, **kwargs)

            # If user requires parental consent
            if user.data.get('requires_parental_consent'):
                consent_status = user.data.get('parental_consent_status', 'pending_submission')

                # Only allow access if status is 'approved'
                if consent_status != 'approved':
                    return jsonify({
                        'error': 'Parental consent required',
                        'consent_required': True,
                        'consent_status': consent_status,
                        'message': _get_consent_message(consent_status)
                    }), 403

            # Consent not required or already approved
            return f(*args, **kwargs)

        except Exception as e:
            logger.error(f"Error checking parental consent: {str(e)}")
            # On error, allow access to prevent blocking legitimate users
            # (security risk is low since this is additional protection, not primary auth)
            return f(*args, **kwargs)

    return decorated_function

def _get_consent_message(status):
    """Helper to get user-friendly message based on consent status"""
    messages = {
        'pending_submission': 'Please have your parent or guardian submit consent documents to activate your account.',
        'pending_review': 'Your parental consent documents are being reviewed. This typically takes 24-48 hours.',
        'rejected': 'Your parental consent documents need to be resubmitted. Please check your parent\'s email for details.',
        'approved': 'Your account is active.'
    }
    return messages.get(status, 'Parental consent verification required.')