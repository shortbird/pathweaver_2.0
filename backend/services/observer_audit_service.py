"""
Observer Audit Service - COPPA/FERPA compliance logging

Business logic for observer access audit trails.
"""

from typing import Optional, Dict, List, Any
from datetime import datetime
from flask import request

from services.base_service import BaseService, ServiceError
from repositories.observer_audit_repository import ObserverAuditRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class ObserverAuditService(BaseService):
    """
    Service for managing observer access audit logs.

    Provides business logic for:
    - Logging observer access events
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
        self.audit_repo = ObserverAuditRepository(user_id=user_id)

    def log_observer_access(
        self,
        observer_id: str,
        student_id: str,
        action_type: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Log an observer access event with request context.

        Automatically extracts IP address, user agent, and request path from Flask request.

        Args:
            observer_id: UUID of the observer
            student_id: UUID of the student being observed
            action_type: Type of action (e.g., 'view_portfolio', 'view_quest')
            resource_type: Type of resource (e.g., 'quest', 'task', 'badge')
            resource_id: UUID of the resource being accessed
            metadata: Additional context (quest title, task title, etc.)

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

            # Log the access
            audit_log = self.audit_repo.log_access(
                observer_id=observer_id,
                student_id=student_id,
                action_type=action_type,
                resource_type=resource_type,
                resource_id=resource_id,
                ip_address=ip_address,
                user_agent=user_agent,
                request_path=request_path,
                metadata=metadata
            )

            logger.info(
                f"Observer access logged: {action_type} - "
                f"observer={observer_id[:8]} student={student_id[:8]} "
                f"resource={resource_type}/{resource_id[:8] if resource_id else 'N/A'}"
            )

            return audit_log

        except Exception as e:
            logger.error(f"Failed to log observer access: {e}")
            raise ServiceError(f"Failed to log observer access: {e}") from e

    def get_observer_activity(
        self,
        observer_id: str,
        limit: int = 100,
        offset: int = 0,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all activity for a specific observer.

        Args:
            observer_id: UUID of the observer
            limit: Maximum number of logs to return
            offset: Number of logs to skip
            start_date: Filter logs after this date
            end_date: Filter logs before this date

        Returns:
            List of audit log records
        """
        try:
            return self.audit_repo.get_observer_logs(
                observer_id=observer_id,
                limit=limit,
                offset=offset,
                start_date=start_date,
                end_date=end_date
            )
        except Exception as e:
            logger.error(f"Failed to fetch observer activity: {e}")
            raise ServiceError(f"Failed to fetch observer activity: {e}") from e

    def get_student_access_history(
        self,
        student_id: str,
        limit: int = 100,
        offset: int = 0,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all access history for a specific student (who accessed their data).

        Args:
            student_id: UUID of the student
            limit: Maximum number of logs to return
            offset: Number of logs to skip
            start_date: Filter logs after this date
            end_date: Filter logs before this date

        Returns:
            List of audit log records
        """
        try:
            return self.audit_repo.get_student_logs(
                student_id=student_id,
                limit=limit,
                offset=offset,
                start_date=start_date,
                end_date=end_date
            )
        except Exception as e:
            logger.error(f"Failed to fetch student access history: {e}")
            raise ServiceError(f"Failed to fetch student access history: {e}") from e

    def get_recent_activity(
        self,
        hours: int = 24,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get recent observer activity across the platform.

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
            filters: Optional filters (observer_id, student_id, action_type)

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

    def get_observer_statistics(
        self,
        observer_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Get statistics about an observer's activity.

        Args:
            observer_id: UUID of the observer
            start_date: Filter logs after this date
            end_date: Filter logs before this date

        Returns:
            Dictionary with statistics (total_accesses, unique_students, etc.)
        """
        try:
            # Get all logs for the observer in the time period
            logs = self.audit_repo.get_observer_logs(
                observer_id=observer_id,
                start_date=start_date,
                end_date=end_date,
                limit=10000  # Large limit to get all logs for statistics
            )

            # Calculate statistics
            unique_students = set(log['student_id'] for log in logs)
            action_counts = {}
            for log in logs:
                action_type = log['action_type']
                action_counts[action_type] = action_counts.get(action_type, 0) + 1

            return {
                'total_accesses': len(logs),
                'unique_students': len(unique_students),
                'action_breakdown': action_counts,
                'first_access': logs[-1]['created_at'] if logs else None,
                'last_access': logs[0]['created_at'] if logs else None,
            }

        except Exception as e:
            logger.error(f"Failed to get observer statistics: {e}")
            raise ServiceError(f"Failed to get observer statistics: {e}") from e

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
