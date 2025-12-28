"""
Admin Audit Service - Administrative action logging

Business logic for administrative audit trails.
Tracks organization management, user role changes, curriculum edits.
"""

from typing import Optional, Dict, List, Any
from datetime import datetime
from flask import request

from services.base_service import BaseService, ServiceError
from repositories.admin_audit_repository import AdminAuditRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class AdminAuditService(BaseService):
    """
    Service for managing administrative action audit logs.

    Provides business logic for:
    - Logging admin actions
    - Querying audit logs
    - Generating compliance reports
    """

    def __init__(self, user_id: Optional[str] = None):
        """
        Initialize service with optional user context.

        Args:
            user_id: UUID of authenticated user (for RLS enforcement)
        """
        super().__init__()
        self.audit_repo = AdminAuditRepository(user_id=user_id)

    def log_action(
        self,
        admin_id: str,
        action_type: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        organization_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Log an administrative action with request context.

        Automatically extracts IP address, user agent, and request path from Flask request.

        Args:
            admin_id: UUID of the admin performing the action
            action_type: Type of action (e.g., 'change_user_role', 'update_org_policy')
            resource_type: Type of resource (e.g., 'user', 'organization', 'quest')
            resource_id: UUID of the resource being modified
            organization_id: UUID of the organization (if applicable)
            metadata: Additional context (old/new values, affected users, etc.)

        Returns:
            Created audit log record

        Raises:
            ServiceError: If logging fails
        """
        try:
            # Extract request context
            ip_address = self._get_client_ip()
            user_agent = request.headers.get('User-Agent')
            request_path = request.path

            # Log the action
            audit_log = self.audit_repo.log_action(
                admin_id=admin_id,
                action_type=action_type,
                resource_type=resource_type,
                resource_id=resource_id,
                organization_id=organization_id,
                ip_address=ip_address,
                user_agent=user_agent,
                request_path=request_path,
                metadata=metadata
            )

            logger.info(
                f"Admin action logged: {action_type} - "
                f"admin={admin_id[:8]} "
                f"resource={resource_type}/{resource_id[:8] if resource_id else 'N/A'}"
            )

            return audit_log

        except Exception as e:
            logger.error(f"Failed to log admin action: {e}")
            raise ServiceError(f"Failed to log admin action: {e}") from e

    def get_admin_activity(
        self,
        admin_id: str,
        limit: int = 100,
        offset: int = 0,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all actions performed by a specific admin.

        Args:
            admin_id: UUID of the admin
            limit: Maximum number of logs to return
            offset: Number of logs to skip
            start_date: Filter logs after this date
            end_date: Filter logs before this date

        Returns:
            List of audit log records
        """
        try:
            return self.audit_repo.get_admin_logs(
                admin_id=admin_id,
                limit=limit,
                offset=offset,
                start_date=start_date,
                end_date=end_date
            )
        except Exception as e:
            logger.error(f"Failed to fetch admin activity: {e}")
            raise ServiceError(f"Failed to fetch admin activity: {e}") from e

    def get_resource_history(
        self,
        resource_type: str,
        resource_id: str,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get all actions performed on a specific resource.

        Args:
            resource_type: Type of resource (e.g., 'user', 'organization', 'quest')
            resource_id: UUID of the resource
            limit: Maximum number of logs to return
            offset: Number of logs to skip

        Returns:
            List of audit log records
        """
        try:
            return self.audit_repo.get_resource_logs(
                resource_type=resource_type,
                resource_id=resource_id,
                limit=limit,
                offset=offset
            )
        except Exception as e:
            logger.error(f"Failed to fetch resource history: {e}")
            raise ServiceError(f"Failed to fetch resource history: {e}") from e

    def get_organization_activity(
        self,
        organization_id: str,
        limit: int = 100,
        offset: int = 0,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all administrative actions within an organization.

        Args:
            organization_id: UUID of the organization
            limit: Maximum number of logs to return
            offset: Number of logs to skip
            start_date: Filter logs after this date
            end_date: Filter logs before this date

        Returns:
            List of audit log records
        """
        try:
            return self.audit_repo.get_organization_logs(
                organization_id=organization_id,
                limit=limit,
                offset=offset,
                start_date=start_date,
                end_date=end_date
            )
        except Exception as e:
            logger.error(f"Failed to fetch organization activity: {e}")
            raise ServiceError(f"Failed to fetch organization activity: {e}") from e

    def get_recent_activity(
        self,
        hours: int = 24,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get recent administrative actions across the platform.

        Args:
            hours: Number of hours to look back
            limit: Maximum number of logs to return
            offset: Number of logs to skip

        Returns:
            List of audit log records
        """
        try:
            return self.audit_repo.get_recent_logs(
                hours=hours,
                limit=limit,
                offset=offset
            )
        except Exception as e:
            logger.error(f"Failed to fetch recent activity: {e}")
            raise ServiceError(f"Failed to fetch recent activity: {e}") from e

    def get_audit_logs_paginated(
        self,
        limit: int = 50,
        offset: int = 0,
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Get paginated audit logs for admin dashboard.

        Args:
            limit: Maximum number of logs to return
            offset: Number of logs to skip
            filters: Optional filters (admin_id, action_type, resource_type, organization_id)

        Returns:
            Dictionary with 'logs' and 'total' count
        """
        try:
            return self.audit_repo.get_all_logs_paginated(
                limit=limit,
                offset=offset,
                filters=filters
            )
        except Exception as e:
            logger.error(f"Failed to fetch paginated audit logs: {e}")
            raise ServiceError(f"Failed to fetch paginated audit logs: {e}") from e

    def get_admin_statistics(
        self,
        admin_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Get statistics about an admin's activity.

        Args:
            admin_id: UUID of the admin
            start_date: Filter logs after this date
            end_date: Filter logs before this date

        Returns:
            Dictionary with statistics (total_actions, action_breakdown, etc.)
        """
        try:
            # Get all logs for the admin in the time period
            logs = self.audit_repo.get_admin_logs(
                admin_id=admin_id,
                start_date=start_date,
                end_date=end_date,
                limit=10000  # Large limit to get all logs for statistics
            )

            # Calculate statistics
            action_counts = {}
            resource_counts = {}
            for log in logs:
                action_type = log['action_type']
                resource_type = log.get('resource_type', 'unknown')
                action_counts[action_type] = action_counts.get(action_type, 0) + 1
                resource_counts[resource_type] = resource_counts.get(resource_type, 0) + 1

            return {
                'total_actions': len(logs),
                'action_breakdown': action_counts,
                'resource_breakdown': resource_counts,
                'first_action': logs[-1]['created_at'] if logs else None,
                'last_action': logs[0]['created_at'] if logs else None,
            }

        except Exception as e:
            logger.error(f"Failed to get admin statistics: {e}")
            raise ServiceError(f"Failed to get admin statistics: {e}") from e

    def _get_client_ip(self) -> Optional[str]:
        """
        Extract client IP address from request, handling proxies.

        Returns:
            Client IP address or None
        """
        # Check for proxy headers first
        if request.headers.get('X-Forwarded-For'):
            # X-Forwarded-For can contain multiple IPs, get the first one
            return request.headers.get('X-Forwarded-For').split(',')[0].strip()
        elif request.headers.get('X-Real-IP'):
            return request.headers.get('X-Real-IP')
        else:
            # Fallback to direct connection IP
            return request.remote_addr
