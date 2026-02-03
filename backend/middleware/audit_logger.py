"""
Audit Logger Middleware

Provides decorators for automatically logging administrative actions.
Use on admin routes that modify data to maintain compliance audit trail.
"""

from functools import wraps
from flask import request, g
from typing import Optional, Dict, Any
from services.admin_audit_service import AdminAuditService
from utils.logger import get_logger

logger = get_logger(__name__)


def audit_log(
    action_type: str,
    resource_type: Optional[str] = None,
    resource_id_param: Optional[str] = None,
    organization_id_param: Optional[str] = None
):
    """
    Decorator to automatically log administrative actions.

    Usage:
        @audit_log(
            action_type='update_org_policy',
            resource_type='organization',
            resource_id_param='org_id'
        )
        @require_org_admin
        def update_organization_policy(current_user_id, current_org_id, is_superadmin, org_id):
            # ... route logic ...

    Args:
        action_type: Type of action (e.g., 'update_user_role', 'update_org_policy')
        resource_type: Type of resource being modified (e.g., 'user', 'organization', 'quest')
        resource_id_param: Name of the parameter containing the resource ID (e.g., 'user_id', 'org_id')
        organization_id_param: Name of the parameter containing the organization ID (optional)

    Returns:
        Decorated function that logs the action after successful execution
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Execute the route function first
            response = f(*args, **kwargs)

            # Only log if the response indicates success (2xx status code)
            if isinstance(response, tuple):
                # Response is (data, status_code) or (data, status_code, headers)
                status_code = response[1] if len(response) > 1 else 200
            else:
                # Response is just data, assume 200
                status_code = 200

            if 200 <= status_code < 300:
                try:
                    # Extract admin_id from kwargs (set by auth decorator)
                    admin_id = kwargs.get('current_user_id')

                    if not admin_id:
                        logger.warning(f"Cannot log audit - no current_user_id in kwargs for {action_type}")
                        return response

                    # Extract resource_id if specified
                    resource_id = None
                    if resource_id_param:
                        resource_id = kwargs.get(resource_id_param)

                    # Extract organization_id if specified
                    organization_id = None
                    if organization_id_param:
                        organization_id = kwargs.get(organization_id_param)
                    else:
                        # Try to get from current_org_id (set by @require_org_admin)
                        organization_id = kwargs.get('current_org_id')

                    # Extract metadata from request (if present)
                    metadata = {}
                    if request.is_json and request.get_json(silent=True):
                        request_data = request.get_json(silent=True)
                        # Store relevant fields (exclude sensitive data like passwords)
                        if isinstance(request_data, dict):
                            metadata['request_data'] = {
                                k: v for k, v in request_data.items()
                                if k not in ['password', 'token', 'secret', 'key']
                            }

                    # Log the action
                    service = AdminAuditService()
                    service.log_action(
                        admin_id=admin_id,
                        action_type=action_type,
                        resource_type=resource_type,
                        resource_id=resource_id,
                        organization_id=organization_id,
                        metadata=metadata
                    )

                except Exception as e:
                    # Don't fail the request if audit logging fails
                    logger.error(f"Failed to log audit for {action_type}: {e}")

            return response

        return decorated_function
    return decorator


def log_admin_action(
    admin_id: str,
    action_type: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    organization_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
):
    """
    Manually log an admin action (for use within route functions).

    Use this when you need more control over what gets logged, or when
    logging needs to happen in the middle of a function rather than at the end.

    Args:
        admin_id: UUID of the admin performing the action
        action_type: Type of action
        resource_type: Type of resource being modified
        resource_id: UUID of the resource
        organization_id: UUID of the organization
        metadata: Additional context

    Returns:
        Audit log record (or None if logging fails)
    """
    try:
        service = AdminAuditService()
        return service.log_action(
            admin_id=admin_id,
            action_type=action_type,
            resource_type=resource_type,
            resource_id=resource_id,
            organization_id=organization_id,
            metadata=metadata
        )
    except Exception as e:
        logger.error(f"Failed to manually log admin action {action_type}: {e}")
        return None
