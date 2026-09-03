"""
Authentication Decorators

Sprint 2 - Task 4.2: Authentication Standardization (2025-01-22)
All decorators now use httpOnly cookies exclusively for enhanced security.
Authorization header fallback removed to prevent XSS token theft via localStorage.
"""

from functools import wraps
from flask import request, jsonify
from middleware.error_handler import AuthenticationError, AuthorizationError, ValidationError
from utils.session_manager import session_manager
from utils.validation import validate_uuid

from utils.logger import get_logger
from utils.roles import get_effective_roles, has_any_role, apply_role_view, VALID_ROLES, VALID_ORG_ROLES

logger = get_logger(__name__)


def is_assigned_advisor(user_id: str) -> bool:
    """
    Check if user has active advisor_student_assignments.
    This allows parents (or any user) with advisor assignments to access advisor features.
    """
    from database import get_supabase_admin_client
    try:
        # admin client justified: auth utility — reads user identity/permissions to make the access-control decision itself
        supabase = get_supabase_admin_client()
        result = supabase.table('advisor_student_assignments')\
            .select('id', count='exact')\
            .eq('advisor_id', user_id)\
            .eq('is_active', True)\
            .execute()
        return (result.count or 0) > 0
    except Exception as e:
        logger.error(f"Error checking advisor assignments: {str(e)}")
        return False

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

def authorizing_user_id():
    """The identity this request is AUTHORIZED as.

    Normally that is simply the caller. During a MASQUERADE it is the target,
    and the admin behind them counts for nothing.

    Masquerade exists to answer one question — "what does this person see?" —
    and an answer computed from the viewer's own role is not an answer, it is a
    different account's screen with the target's name on the banner. Every
    decorator that authorized `get_actual_admin_id()` gave exactly that: a
    superadmin viewing as a campus coordinator was authorized as the superadmin,
    so the org-settings read that 403s for the coordinator succeeded for them,
    and the Classes editor showed a room dropdown that the coordinator herself
    could never get (iCreate, 2026-08-18). Every such divergence is invisible
    from inside the masquerade, which is the worst property a debugging tool can
    have.

    Acting-as (a parent working inside their dependent's account) is deliberately
    NOT redirected here: get_masquerade_info() covers masquerade tokens only, so
    a parent keeps their own authority, which is what those flows are built on.

    The real admin stays on `request.masquerade_admin_id` for audit logging. It
    must never be consulted for a permission decision.
    """
    info = session_manager.get_masquerade_info()
    if info and info.get('is_masquerading') and info.get('target_user_id'):
        request.masquerade_admin_id = info.get('admin_id')
        return info['target_user_id']
    return session_manager.get_actual_admin_id()


def _log_masquerade_denial(check: str, user_id: str) -> None:
    """Note a 403 that a masquerade produced ON PURPOSE.

    The target genuinely lacks this; the admin viewing them does not. Without
    the line it reads like a broken admin session, and the previous fix for
    that was to authorize the admin instead — which is the bug.
    """
    admin_id = getattr(request, 'masquerade_admin_id', None)
    if admin_id:
        logger.info(
            f"[Masquerade] {check} denied for target {str(user_id)[:8]}... "
            f"(admin {str(admin_id)[:8]}... is viewing as them) — "
            f"this is what that user sees")


def caller_is_superadmin(supabase, effective_user_id: str) -> bool:
    """True if the request is from a superadmin.

    While ACTING-AS a dependent the parent's own identity still counts, so a
    superadmin working inside a dependent account keeps their privileges. While
    MASQUERADING it does not: the whole point is to be the other person, and a
    superadmin bypass leaking through here is the difference between "this
    observer can comment" and "the observer sees what I see because I am me".
    """
    from utils.session_manager import session_manager
    candidate_ids = {effective_user_id}
    try:
        if not session_manager.is_masquerading():
            actual = session_manager.get_actual_admin_id()
            if actual:
                candidate_ids.add(actual)
    except Exception as _exc:
        logger.debug("masquerade check failed: %s", _exc, exc_info=True)
    try:
        res = supabase.table('users').select('id, role').in_('id', list(candidate_ids)).execute()
        return any(r.get('role') == 'superadmin' for r in (res.data or []))
    except Exception:
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
        # Attach the user (id only — no PII) to the Sentry scope so issues show
        # how many users are affected and can be filtered by user. No-op when
        # Sentry isn't initialized (local dev).
        _set_sentry_user(user_id)

        return f(user_id, *args, **kwargs)

    return decorated_function


def _set_sentry_user(user_id: str) -> None:
    """Best-effort: tag the current Sentry scope with the request's user id."""
    try:
        import sentry_sdk
        sentry_sdk.set_user({'id': user_id})
    except Exception:
        # telemetry must never break the request
        ...

def require_admin(f):
    """
    Decorator to require superadmin access for routes.

    Uses httpOnly cookies exclusively for enhanced security.
    Verifies user has 'superadmin' role.

    When masquerading, this checks the TARGET: an admin viewing as a student is
    not an admin for the duration. Exiting the masquerade (/api/admin/masquerade/exit)
    is undecorated and reads the token directly, so nobody gets stranded.

    Sprint 2 - Task 4.2: Authentication Standardization (2025-01-22)
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # Whoever this request is authorized as — the masquerade target, if any
        user_id = authorizing_user_id()

        if not user_id:
            raise AuthenticationError('Authentication required')

        # Store user_id in request context
        request.user_id = user_id
        _set_sentry_user(user_id)

        # Verify superadmin status with retry logic (use admin client to bypass RLS)
        # The route call stays OUTSIDE this loop: retrying f() would re-execute
        # route side effects, and catching its exceptions would mask real route
        # errors as 403s.
        from database import get_supabase_admin_client
        max_retries = 2
        for attempt in range(max_retries):
            try:
                # admin client justified: auth utility — reads user identity/permissions to make the access-control decision itself
                supabase = get_supabase_admin_client()
                user = supabase.table('users').select('role').eq('id', user_id).execute()

                if not user.data or len(user.data) == 0 or user.data[0].get('role') != 'superadmin':
                    _log_masquerade_denial('superadmin', user_id)
                    raise AuthorizationError('Superadmin access required')

                break

            except (AuthenticationError, AuthorizationError):
                raise
            except Exception as e:
                if attempt < max_retries - 1:
                    # Retry on connection errors
                    logger.debug(f"Retrying admin verification (attempt {attempt + 1}/{max_retries}): {str(e)}")
                    continue
                else:
                    # Final attempt failed
                    logger.error(f"Error verifying admin status: {str(e)}")
                    raise AuthorizationError('Failed to verify admin status') from e

        return f(user_id, *args, **kwargs)

    # Marks this decorator as superadmin-only for
    # tests/unit/test_id_routes_declare_relationship.py: a route gated here
    # needs no per-target relationship check, because the role is global.
    # If the route is ever loosened to a narrower decorator, the marker
    # disappears with it and the guard test starts demanding a declaration.
    decorated_function._superadmin_only = True
    return decorated_function

def require_role(*allowed_roles):
    """
    Decorator to require specific roles for routes.

    Uses httpOnly cookies exclusively for enhanced security.
    Verifies user has one of the specified roles (using effective role for org_managed users).
    Supports users with multiple roles (org_roles array) - access is granted if ANY user role
    matches ANY of the allowed roles.

    When masquerading, this checks the masquerade target's role.

    Args:
        *allowed_roles: One or more role names (e.g., 'student', 'parent', 'advisor')

    Sprint 2 - Task 4.2: Authentication Standardization (2025-01-22)
    """
    # A role name that isn't real never matches anyone, so the route silently
    # becomes superadmin-only — and silently becomes a grant if the name is ever
    # added as a role. Seven routes shipped with @require_role('admin') that way
    # (SEC-01, 2026-08-31). Fail at import so it can't register at all.
    for role in allowed_roles:
        if not isinstance(role, str) or role not in (VALID_ROLES | VALID_ORG_ROLES):
            raise ValueError(
                f"require_role({role!r}): not a valid role. "
                f"Valid: {sorted(VALID_ROLES | VALID_ORG_ROLES)}. "
                "Tuples must be unpacked: require_role(*ADMIN_ROLES)."
            )
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
            # The route call stays OUTSIDE this loop: retrying f() would re-execute
            # route side effects, and catching its exceptions would mask real route
            # errors as 403s.
            from database import get_supabase_admin_client
            max_retries = 2
            for attempt in range(max_retries):
                try:
                    # admin client justified: auth utility — reads user identity/permissions to make the access-control decision itself
                    supabase = get_supabase_admin_client()
                    user = supabase.table('users').select('role, org_role, org_roles').eq('id', user_id).execute()

                    if not user.data or len(user.data) == 0:
                        raise AuthorizationError('User not found')

                    user_data = apply_role_view(user.data[0], user_id=user_id)

                    # Superadmin has access to everything
                    if user_data.get('role') == 'superadmin':
                        break

                    # Check if user has ANY of the allowed roles (supports multiple roles)
                    if has_any_role(user_data, list(allowed_roles)):
                        break

                    raise AuthorizationError(f'Required role: {", ".join(allowed_roles)}')

                except (AuthenticationError, AuthorizationError):
                    raise
                except Exception as e:
                    if attempt < max_retries - 1:
                        # Retry on connection errors
                        logger.debug(f"Retrying role verification (attempt {attempt + 1}/{max_retries}): {str(e)}")
                        continue
                    else:
                        # Final attempt failed
                        logger.error(f"Error verifying user role: {str(e)}")
                        raise AuthorizationError('Failed to verify user role') from e

            return f(user_id, *args, **kwargs)

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

def require_real_identity(f):
    """Any authenticated caller, resolved to their REAL account — ignoring an
    active masquerade or role view. For control-plane endpoints whose whole job
    is to change who the session acts as (view-as pickers, masquerade start):
    they must keep answering to the person at the keyboard while that person is
    inside somebody else's account or a narrowed role. The route decides the
    role rule itself, on the real row."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if request.method == 'OPTIONS':
            return ('', 200)
        user_id = session_manager.get_actual_admin_id()
        if not user_id:
            raise AuthenticationError('Authentication required')
        request.user_id = user_id
        _set_sentry_user(user_id)
        return f(user_id, *args, **kwargs)

    return decorated_function


def require_admin_identity(f):
    """Superadmin check against the REAL caller, ignoring any active masquerade.

    Reserved for the masquerade CONTROL PLANE — starting a session, reading the
    audit history. Those endpoints are the tool itself, not the app being
    viewed, so they have to stay reachable while the admin is inside somebody
    else's account (otherwise switching from one target to another means
    exiting first, and an admin who lands on a broken account can get stuck).

    Everything else authorizes the target: see authorizing_user_id(). Reaching
    for this decorator anywhere else re-creates the exact bug it exists beside —
    a screen that answers to the admin while claiming to be the user's.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if request.method == 'OPTIONS':
            return ('', 200)

        user_id = session_manager.get_actual_admin_id()
        if not user_id:
            raise AuthenticationError('Authentication required')

        request.user_id = user_id
        _set_sentry_user(user_id)

        from database import get_supabase_admin_client
        try:
            # admin client justified: auth utility — reads user identity/permissions to make the access-control decision itself
            supabase = get_supabase_admin_client()
            user = supabase.table('users').select('role').eq('id', user_id).execute()
            if not user.data or user.data[0].get('role') != 'superadmin':
                raise AuthorizationError('Superadmin access required')
        except (AuthenticationError, AuthorizationError):
            raise
        except Exception as e:
            logger.error(f"Error verifying admin identity: {str(e)}")
            raise AuthorizationError('Failed to verify admin status') from e

        return f(user_id, *args, **kwargs)

    # Superadmin-only; see require_admin for what this marker is for.
    decorated_function._superadmin_only = True
    return decorated_function


def require_advisor(f):
    """
    Decorator to require advisor, org_admin, or superadmin access for routes.

    Uses httpOnly cookies exclusively for enhanced security.
    Verifies user has 'advisor', 'org_admin', or 'superadmin' in their effective roles,
    OR has is_org_admin=True (for users who are org admins but have a different base role).
    Supports users with multiple roles (org_roles array).
    Advisors can create quest drafts but need admin approval to publish.

    Authorization AND data both use the masquerade target while masquerading, so
    "My Students" is their student list and an admin viewing a plain student is
    refused exactly as that student would be.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        # Flask-CORS handles the actual CORS headers
        if request.method == 'OPTIONS':
            from flask import make_response
            response = make_response()
            response.status_code = 200
            return response

        # Whoever this request is authorized as — the masquerade target, if any
        actual_user_id = authorizing_user_id()

        if not actual_user_id:
            raise AuthenticationError('Authentication required')

        # Verify advisor or admin status (use admin client to bypass RLS)
        from database import get_supabase_admin_client
        # admin client justified: auth utility — reads user identity/permissions to make the access-control decision itself
        supabase = get_supabase_admin_client()

        try:
            user = supabase.table('users').select('role, org_role, org_roles, is_org_admin').eq('id', actual_user_id).execute()

            if not user.data or len(user.data) == 0:
                raise AuthorizationError('User not found')

            user_data = apply_role_view(user.data[0], user_id=actual_user_id)
            is_org_admin_flag = user_data.get('is_org_admin', False)

            # Debug logging for advisor access issues
            effective_roles = get_effective_roles(user_data)
            logger.info(f"require_advisor check - actual_user_id: {actual_user_id}, role: {user_data.get('role')}, org_role: {user_data.get('org_role')}, org_roles: {user_data.get('org_roles')}, effective_roles: {effective_roles}, is_org_admin_flag: {is_org_admin_flag}")

            # Check if user has any advisor-level role (supports multiple roles)
            has_role_access = has_any_role(user_data, ['advisor', 'org_admin', 'superadmin']) or is_org_admin_flag
            if not has_role_access:
                # Check if user has advisor assignments (parent-advisor implicit access)
                has_assignments = is_assigned_advisor(actual_user_id)
                logger.info(f"require_advisor - user {actual_user_id} has_role_access={has_role_access}, checking assignments: {has_assignments}")
                if not has_assignments:
                    _log_masquerade_denial('advisor', actual_user_id)
                    raise AuthorizationError('Advisor access required')

            # The identity that was authorized above is the identity the route
            # operates as. There used to be a second lookup here that swapped in
            # the masquerade target for data while the ADMIN had been authorized:
            # two identities in one request, and the route could only see one.
            effective_user_id = actual_user_id

            # Store user_id in request context
            request.user_id = effective_user_id

        except (AuthenticationError, AuthorizationError):
            raise
        except Exception as e:
            logger.error(f"Error verifying advisor status: {str(e)}")
            raise AuthorizationError('Failed to verify advisor status') from e

        # Outside the try so route exceptions aren't masked as 403s
        return f(effective_user_id, *args, **kwargs)

    return decorated_function

def require_advisor_for_student(f):
    """
    Decorator to require advisor assigned to specific student, or admin access.

    Uses httpOnly cookies exclusively for enhanced security.
    Checks advisor_student_assignments table to verify advisor is assigned to student.
    Supports users with multiple roles (org_roles array).
    Admins always have access.

    When masquerading, this checks the TARGET — the advisor being viewed needs
    the assignment, not the admin doing the viewing.

    Usage: Decorate routes that access student-specific data.
    The decorated function must have 'target_user_id' or 'student_id' as a parameter.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # Whoever this request is authorized as — the masquerade target, if any
        user_id = authorizing_user_id()

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
        # admin client justified: auth utility — reads user identity/permissions to make the access-control decision itself
        supabase = get_supabase_admin_client()

        try:
            # Check user role
            user = supabase.table('users').select('role, org_role, org_roles').eq('id', user_id).execute()

            if not user.data or len(user.data) == 0:
                raise AuthorizationError('User not found')

            user_data = apply_role_view(user.data[0], user_id=user_id)

            # Superadmin always has access; advisors/org_admins need an active
            # assignment to this student
            if user_data.get('role') != 'superadmin':
                if not has_any_role(user_data, ['advisor', 'org_admin']):
                    # Other roles don't have access
                    _log_masquerade_denial('advisor-for-student', user_id)
                    raise AuthorizationError('Advisor or admin access required')

                assignment = supabase.table('advisor_student_assignments')\
                    .select('id')\
                    .eq('advisor_id', user_id)\
                    .eq('student_id', student_id)\
                    .eq('is_active', True)\
                    .execute()

                if not assignment.data or len(assignment.data) == 0:
                    _log_masquerade_denial('advisor-student-assignment', user_id)
                    raise AuthorizationError('Not authorized to access this student')

        except (AuthenticationError, AuthorizationError, ValidationError):
            raise
        except Exception as e:
            logger.error(f"Error verifying advisor-student assignment: {str(e)}")
            raise AuthorizationError('Failed to verify access permissions') from e

        # Outside the try so route exceptions aren't masked as 403s
        return f(user_id, *args, **kwargs)

    return decorated_function

def require_superadmin(f):
    """
    Decorator to require superadmin role.
    Superadmin is defined as role='superadmin'.
    Only tannerbowman@gmail.com should have this role.

    Uses httpOnly cookies exclusively for enhanced security.
    When masquerading, this checks the TARGET, not the admin behind them.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # Whoever this request is authorized as — the masquerade target, if any
        user_id = authorizing_user_id()

        if not user_id:
            raise AuthenticationError('Authentication required')

        # Store user_id in request context
        request.user_id = user_id

        # Verify superadmin status (use admin client to bypass RLS)
        from database import get_supabase_admin_client
        # admin client justified: auth utility — reads user identity/permissions to make the access-control decision itself
        supabase = get_supabase_admin_client()

        try:
            user = supabase.table('users').select('role').eq('id', user_id).single().execute()

            if not user.data or user.data['role'] != 'superadmin':
                _log_masquerade_denial('superadmin', user_id)
                raise AuthorizationError('Superadmin access required')

        except (AuthenticationError, AuthorizationError):
            raise
        except Exception as e:
            logger.error(f"Error verifying superadmin status: {str(e)}")
            raise AuthorizationError('Failed to verify superadmin status') from e

        # Outside the try so route exceptions aren't masked as 403s
        return f(user_id, *args, **kwargs)

    # Superadmin-only; see require_admin for what this marker is for.
    decorated_function._superadmin_only = True
    return decorated_function


def require_school_admin(f):
    """
    Decorator to require org_admin or superadmin access for routes.
    (Legacy name - use require_org_admin for new code)
    Supports users with multiple roles (org_roles array).

    Uses httpOnly cookies exclusively for enhanced security.
    Verifies user has 'org_admin' or 'superadmin' effective role, OR is_org_admin=True.
    Org admins can manage their organization (quest visibility, announcements, etc.).

    When masquerading, this checks the TARGET, not the admin behind them.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # Whoever this request is authorized as — the masquerade target, if any
        user_id = authorizing_user_id()

        if not user_id:
            raise AuthenticationError('Authentication required')

        # Store user_id in request context
        request.user_id = user_id

        # Verify org_admin or superadmin status (use admin client to bypass RLS)
        from database import get_supabase_admin_client
        # admin client justified: auth utility — reads user identity/permissions to make the access-control decision itself
        supabase = get_supabase_admin_client()

        try:
            user = supabase.table('users').select('role, org_role, org_roles, is_org_admin').eq('id', user_id).execute()

            if not user.data or len(user.data) == 0:
                raise AuthorizationError('User not found')

            user_data = apply_role_view(user.data[0], user_id=user_id)
            is_org_admin_flag = user_data.get('is_org_admin', False)

            # Check if superadmin, has org_admin role, or is_org_admin flag
            if user_data.get('role') != 'superadmin' and not has_any_role(user_data, ['org_admin']) and not is_org_admin_flag:
                _log_masquerade_denial('org-admin', user_id)
                raise AuthorizationError('Organization admin access required')

        except (AuthenticationError, AuthorizationError):
            raise
        except Exception as e:
            logger.error(f"Error verifying org admin status: {str(e)}")
            raise AuthorizationError('Failed to verify org admin status') from e

        # Outside the try so route exceptions aren't masked as 403s
        return f(user_id, *args, **kwargs)

    return decorated_function


def require_org_admin(f):
    """
    Decorator to require org admin or superadmin role.
    Org admins can manage their own organization.
    Superadmins can manage all organizations.
    Supports users with multiple roles (org_roles array).

    Uses httpOnly cookies exclusively for enhanced security.
    When masquerading, the TARGET is authorized and scoped — one identity, not
    two. It used to authorize the admin and scope to the target, which is how a
    campus coordinator (deliberately not an org_admin) could watch a superadmin
    load her org's settings from inside her own account and conclude the page
    worked for her. It did not; she got a 403 nobody could see.

    Passes user_id, organization_id, and is_superadmin to the decorated function.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip authentication for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return ('', 200)

        # Whoever this request is authorized as — the masquerade target, if any
        user_id = authorizing_user_id()

        if not user_id:
            raise AuthenticationError('Authentication required')

        # Store user_id in request context
        request.user_id = user_id

        # Verify org admin or superadmin status (use admin client to bypass RLS)
        from database import get_supabase_admin_client
        # admin client justified: auth utility — reads user identity/permissions to make the access-control decision itself
        supabase = get_supabase_admin_client()

        try:
            user = supabase.table('users')\
                .select('role, org_role, org_roles, email, is_org_admin, organization_id')\
                .eq('id', user_id)\
                .single()\
                .execute()

            if not user.data:
                raise AuthorizationError('User not found')

            user_data = apply_role_view(user.data, user_id=user_id)

            # Check if superadmin
            is_superadmin = user_data.get('role') == 'superadmin'

            # Check if org admin (has org_admin role or flag) - supports multiple roles
            is_org_admin_flag = user_data.get('is_org_admin', False)
            has_org_admin_access = is_superadmin or has_any_role(user_data, ['org_admin']) or is_org_admin_flag

            if not has_org_admin_access:
                _log_masquerade_denial('org-admin', user_id)
                raise AuthorizationError('Organization admin access required')

            # Scope comes from the same row that was just authorized, so the
            # org and the role context can no longer belong to two people.
            organization_id = user_data['organization_id']
            effective_is_superadmin = is_superadmin

        except (AuthenticationError, AuthorizationError):
            raise
        except Exception as e:
            logger.error(f"Error verifying org admin status: {str(e)}")
            raise AuthorizationError('Failed to verify organization admin status') from e

        # Outside the try so route exceptions aren't masked as 403s
        return f(user_id, organization_id, effective_is_superadmin, *args, **kwargs)

    return decorated_function


def require_org_front_office(f):
    """The org's front office: org_admin, campus_coordinator, superadmin.

    Same contract as @require_org_admin — the view receives
    (user_id, organization_id, is_superadmin) — but authorized against
    utils.sis_roles.ADMIN_ROLES, so a campus coordinator gets in.

    Use it for the OPERATIONAL org routes the SIS console runs on: reading the
    org's settings, editing the registration funnel, handing out family
    invitation links. NEVER for the money (FINANCE_ROLES) or for anything that
    grants a role (ROLE_GRANT_ROLES) — a coordinator who can grant org_admin can
    grant themselves the finance access this whole tier exists to withhold.

    Routes that use it are responsible for the per-field half: a coordinator on
    an otherwise-operational endpoint must not read or write the money on it.
    See utils/org_finance_flags.py, which does that for feature_flags.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if request.method == 'OPTIONS':
            return ('', 200)

        # Whoever this request is authorized as — the masquerade target, if any
        user_id = authorizing_user_id()
        if not user_id:
            raise AuthenticationError('Authentication required')

        request.user_id = user_id
        _set_sentry_user(user_id)

        from database import get_supabase_admin_client
        from utils.sis_roles import CAMPUS_COORDINATOR
        # admin client justified: auth utility — reads user identity/permissions to make the access-control decision itself
        supabase = get_supabase_admin_client()

        try:
            user = supabase.table('users')\
                .select('role, org_role, org_roles, email, is_org_admin, organization_id')\
                .eq('id', user_id)\
                .single()\
                .execute()

            if not user.data:
                raise AuthorizationError('User not found')

            user_data = apply_role_view(user.data, user_id=user_id)
            is_superadmin = user_data.get('role') == 'superadmin'
            has_access = (
                is_superadmin
                or has_any_role(user_data, ['org_admin', CAMPUS_COORDINATOR])
                or user_data.get('is_org_admin', False)
            )
            if not has_access:
                _log_masquerade_denial('org-front-office', user_id)
                raise AuthorizationError('Organization admin access required')

            organization_id = user_data['organization_id']

        except (AuthenticationError, AuthorizationError):
            raise
        except Exception as e:
            logger.error(f"Error verifying org front-office status: {str(e)}")
            raise AuthorizationError('Failed to verify organization admin status') from e

        # Outside the try so route exceptions aren't masked as 403s
        return f(user_id, organization_id, is_superadmin, *args, **kwargs)

    return decorated_function


def get_advisor_assigned_students(advisor_id):
    """
    Helper function to get list of student IDs assigned to an advisor.
    Supports users with multiple roles (org_roles array).

    Args:
        advisor_id: UUID of the advisor

    Returns:
        None if user is admin (meaning "all students")
        List of student UUIDs if user is advisor
        Empty list if advisor has no assigned students
    """
    from database import get_supabase_admin_client
    # admin client justified: auth utility — reads user identity/permissions to make the access-control decision itself
    supabase = get_supabase_admin_client()

    try:
        # Check if user is admin
        user = supabase.table('users').select('role, org_role, org_roles').eq('id', advisor_id).execute()

        if user.data and len(user.data) > 0:
            user_data = apply_role_view(user.data[0], user_id=advisor_id)

            # Superadmin sees all students
            if user_data.get('role') == 'superadmin':
                return None

            # Users with advisor or org_admin role see only assigned students
            if has_any_role(user_data, ['advisor', 'org_admin']):
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
        logger.error(f"Error getting advisor assigned students: {str(e)}")
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
        # admin client justified: auth utility — reads user identity/permissions to make the access-control decision itself
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
            # AUTH-M4 fix: FAIL CLOSED. This is a COPPA gate protecting minors;
            # allowing access on error let an under-13 account bypass consent
            # whenever the lookup failed. Deny with a retryable error instead.
            return jsonify({
                'error': 'Unable to verify parental consent at this time. Please try again.',
                'consent_required': True,
                'consent_status': 'verification_error'
            }), 503

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