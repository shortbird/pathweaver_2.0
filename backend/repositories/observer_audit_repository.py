"""
Observer Audit Repository - COPPA/FERPA compliance audit logging

Tracks all observer access to student data for compliance and security.
"""

import logging
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta
from postgrest.exceptions import APIError

from repositories.base_repository import BaseRepository, DatabaseError
from utils.logger import get_logger

logger = get_logger(__name__)


class ObserverAuditRepository(BaseRepository):
    """
    Repository for observer access audit logs.

    Handles logging and querying of observer access to student data
    for COPPA/FERPA compliance.
    """

    table_name = 'observer_access_audit'

    def log_access(
        self,
        observer_id: str,
        student_id: str,
        action_type: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        request_path: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Log an observer access event.

        Args:
            observer_id: UUID of the observer
            student_id: UUID of the student being observed
            action_type: Type of action (e.g., 'view_portfolio', 'view_quest')
            resource_type: Type of resource (e.g., 'quest', 'task', 'badge')
            resource_id: UUID of the resource being accessed
            ip_address: IP address of the observer
            user_agent: Browser/device info
            request_path: API endpoint or page URL
            metadata: Additional context (quest title, task title, etc.)

        Returns:
            Created audit log record

        Raises:
            DatabaseError: If logging fails
        """
        try:
            audit_data = {
                'observer_id': observer_id,
                'student_id': student_id,
                'action_type': action_type,
            }

            # Add optional fields if provided
            if resource_type:
                audit_data['resource_type'] = resource_type
            if resource_id:
                audit_data['resource_id'] = resource_id
            if ip_address:
                audit_data['ip_address'] = ip_address
            if user_agent:
                audit_data['user_agent'] = user_agent
            if request_path:
                audit_data['request_path'] = request_path
            if metadata:
                audit_data['metadata'] = metadata

            # Use admin client to bypass RLS (observers can't insert their own logs)
            record = self.create(audit_data)

            logger.info(
                f"Logged observer access: observer={observer_id[:8]} "
                f"student={student_id[:8]} action={action_type}"
            )

            return record

        except Exception as e:
            logger.error(
                f"Failed to log observer access: observer={observer_id[:8]} "
                f"student={student_id[:8]} action={action_type} error={e}"
            )
            raise DatabaseError(f"Failed to log observer access: {e}") from e

    def get_observer_logs(
        self,
        observer_id: str,
        limit: int = 100,
        offset: int = 0,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all audit logs for a specific observer.

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
            query = (
                self.client.table(self.table_name)
                .select('*')
                .eq('observer_id', observer_id)
                .order('created_at', desc=True)
            )

            if start_date:
                query = query.gte('created_at', start_date.isoformat())
            if end_date:
                query = query.lte('created_at', end_date.isoformat())

            if limit:
                query = query.limit(limit)
            if offset:
                query = query.offset(offset)

            response = query.execute()
            return response.data or []

        except APIError as e:
            logger.error(f"Error fetching observer logs for {observer_id}: {e}")
            raise DatabaseError(f"Failed to fetch observer logs") from e

    def get_student_logs(
        self,
        student_id: str,
        limit: int = 100,
        offset: int = 0,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all audit logs for a specific student (who accessed their data).

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
            query = (
                self.client.table(self.table_name)
                .select('*')
                .eq('student_id', student_id)
                .order('created_at', desc=True)
            )

            if start_date:
                query = query.gte('created_at', start_date.isoformat())
            if end_date:
                query = query.lte('created_at', end_date.isoformat())

            if limit:
                query = query.limit(limit)
            if offset:
                query = query.offset(offset)

            response = query.execute()
            return response.data or []

        except APIError as e:
            logger.error(f"Error fetching student logs for {student_id}: {e}")
            raise DatabaseError(f"Failed to fetch student logs") from e

    def get_logs_by_action(
        self,
        action_type: str,
        limit: int = 100,
        offset: int = 0,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Get audit logs filtered by action type.

        Args:
            action_type: Type of action to filter by
            limit: Maximum number of logs to return
            offset: Number of logs to skip
            start_date: Filter logs after this date
            end_date: Filter logs before this date

        Returns:
            List of audit log records
        """
        try:
            query = (
                self.client.table(self.table_name)
                .select('*')
                .eq('action_type', action_type)
                .order('created_at', desc=True)
            )

            if start_date:
                query = query.gte('created_at', start_date.isoformat())
            if end_date:
                query = query.lte('created_at', end_date.isoformat())

            if limit:
                query = query.limit(limit)
            if offset:
                query = query.offset(offset)

            response = query.execute()
            return response.data or []

        except APIError as e:
            logger.error(f"Error fetching logs by action {action_type}: {e}")
            raise DatabaseError(f"Failed to fetch logs by action") from e

    def get_recent_logs(
        self,
        hours: int = 24,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get recent audit logs within the specified time window.

        Args:
            hours: Number of hours to look back
            limit: Maximum number of logs to return
            offset: Number of logs to skip

        Returns:
            List of audit log records
        """
        try:
            start_date = datetime.utcnow() - timedelta(hours=hours)

            query = (
                self.client.table(self.table_name)
                .select('*')
                .gte('created_at', start_date.isoformat())
                .order('created_at', desc=True)
            )

            if limit:
                query = query.limit(limit)
            if offset:
                query = query.offset(offset)

            response = query.execute()
            return response.data or []

        except APIError as e:
            logger.error(f"Error fetching recent logs: {e}")
            raise DatabaseError(f"Failed to fetch recent logs") from e

    def count_observer_access(
        self,
        observer_id: str,
        student_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> int:
        """
        Count the number of times an observer accessed student data.

        Args:
            observer_id: UUID of the observer
            student_id: Optional UUID of specific student
            start_date: Filter logs after this date
            end_date: Filter logs before this date

        Returns:
            Number of access events
        """
        try:
            query = (
                self.client.table(self.table_name)
                .select('*', count='exact')
                .eq('observer_id', observer_id)
            )

            if student_id:
                query = query.eq('student_id', student_id)
            if start_date:
                query = query.gte('created_at', start_date.isoformat())
            if end_date:
                query = query.lte('created_at', end_date.isoformat())

            response = query.execute()
            return response.count or 0

        except APIError as e:
            logger.error(f"Error counting observer access for {observer_id}: {e}")
            raise DatabaseError(f"Failed to count observer access") from e

    def get_all_logs_paginated(
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
            # Build query
            query = self.client.table(self.table_name).select('*', count='exact')

            # Apply filters
            if filters:
                for key, value in filters.items():
                    if value:
                        query = query.eq(key, value)

            # Order by most recent first
            query = query.order('created_at', desc=True)

            # Apply pagination
            query = query.limit(limit).offset(offset)

            response = query.execute()

            return {
                'logs': response.data or [],
                'total': response.count or 0
            }

        except APIError as e:
            logger.error(f"Error fetching paginated logs: {e}")
            raise DatabaseError(f"Failed to fetch paginated logs") from e
