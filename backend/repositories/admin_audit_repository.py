"""
Admin Audit Repository - Administrative action logging

Tracks all administrative actions for security and compliance.
Retention: 90+ days for compliance and audit trails.
"""

from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta

from repositories.base_repository import BaseRepository, DatabaseError
from utils.logger import get_logger

logger = get_logger(__name__)


class AdminAuditRepository(BaseRepository):
    """
    Repository for administrative action audit logs.

    Handles logging and querying of admin actions including:
    - Organization management (visibility policies, settings)
    - User role changes
    - Quest/curriculum modifications
    - System configuration changes
    """

    table_name = 'admin_audit_logs'

    def log_action(
        self,
        admin_id: str,
        action_type: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        organization_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        request_path: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Log an administrative action.

        Args:
            admin_id: UUID of the admin performing the action
            action_type: Type of action (e.g., 'change_user_role', 'update_org_policy')
            resource_type: Type of resource (e.g., 'user', 'organization', 'quest')
            resource_id: UUID of the resource being modified
            organization_id: UUID of the organization (if applicable)
            ip_address: IP address of the admin
            user_agent: Browser/device info
            request_path: API endpoint
            metadata: Additional context (old/new values, affected users, etc.)

        Returns:
            Created audit log record

        Raises:
            DatabaseError: If logging fails
        """
        try:
            audit_data = {
                'admin_id': admin_id,
                'action_type': action_type,
            }

            # Add optional fields if provided
            if resource_type:
                audit_data['resource_type'] = resource_type
            if resource_id:
                audit_data['resource_id'] = resource_id
            if organization_id:
                audit_data['organization_id'] = organization_id
            if ip_address:
                audit_data['ip_address'] = ip_address
            if user_agent:
                audit_data['user_agent'] = user_agent
            if request_path:
                audit_data['request_path'] = request_path
            if metadata:
                audit_data['metadata'] = metadata

            # Use admin client to bypass RLS
            record = self.create(audit_data)

            logger.info(
                f"Logged admin action: admin={admin_id[:8]} "
                f"action={action_type} resource={resource_type}/{resource_id[:8] if resource_id else 'N/A'}"
            )

            return record

        except Exception as e:
            logger.error(
                f"Failed to log admin action: admin={admin_id[:8]} "
                f"action={action_type} error={e}"
            )
            raise DatabaseError(f"Failed to log admin action: {e}") from e

    def get_admin_logs(
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
            query = self.query().select('*').eq('admin_id', admin_id)

            if start_date:
                query = query.gte('created_at', start_date.isoformat())
            if end_date:
                query = query.lte('created_at', end_date.isoformat())

            query = query.order('created_at', desc=True).limit(limit).offset(offset)

            response = query.execute()
            return response.data if response.data else []

        except Exception as e:
            logger.error(f"Failed to fetch admin logs for admin {admin_id[:8]}: {e}")
            raise DatabaseError(f"Failed to fetch admin logs: {e}") from e

    def get_resource_logs(
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
            response = self.query()\
                .select('*, users!admin_id(first_name, last_name, email)')\
                .eq('resource_type', resource_type)\
                .eq('resource_id', resource_id)\
                .order('created_at', desc=True)\
                .limit(limit)\
                .offset(offset)\
                .execute()

            return response.data if response.data else []

        except Exception as e:
            logger.error(
                f"Failed to fetch resource logs for {resource_type}/{resource_id[:8]}: {e}"
            )
            raise DatabaseError(f"Failed to fetch resource logs: {e}") from e

    def get_organization_logs(
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
            query = self.query()\
                .select('*, users!admin_id(first_name, last_name, email)')\
                .eq('organization_id', organization_id)

            if start_date:
                query = query.gte('created_at', start_date.isoformat())
            if end_date:
                query = query.lte('created_at', end_date.isoformat())

            query = query.order('created_at', desc=True).limit(limit).offset(offset)

            response = query.execute()
            return response.data if response.data else []

        except Exception as e:
            logger.error(f"Failed to fetch org logs for org {organization_id[:8]}: {e}")
            raise DatabaseError(f"Failed to fetch organization logs: {e}") from e

    def get_all_logs_paginated(
        self,
        limit: int = 50,
        offset: int = 0,
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Get paginated audit logs with optional filtering.

        Args:
            limit: Maximum number of logs to return
            offset: Number of logs to skip
            filters: Optional filters (admin_id, action_type, resource_type, organization_id)

        Returns:
            Dictionary with 'logs' and 'total' count
        """
        try:
            query = self.query().select('*, users!admin_id(first_name, last_name, email)', count='exact')

            # Apply filters if provided
            if filters:
                if filters.get('admin_id'):
                    query = query.eq('admin_id', filters['admin_id'])
                if filters.get('action_type'):
                    query = query.eq('action_type', filters['action_type'])
                if filters.get('resource_type'):
                    query = query.eq('resource_type', filters['resource_type'])
                if filters.get('organization_id'):
                    query = query.eq('organization_id', filters['organization_id'])
                if filters.get('start_date'):
                    query = query.gte('created_at', filters['start_date'])
                if filters.get('end_date'):
                    query = query.lte('created_at', filters['end_date'])

            query = query.order('created_at', desc=True).limit(limit).offset(offset)

            response = query.execute()

            return {
                'logs': response.data if response.data else [],
                'total': response.count if response.count else 0
            }

        except Exception as e:
            logger.error(f"Failed to fetch paginated audit logs: {e}")
            raise DatabaseError(f"Failed to fetch paginated audit logs: {e}") from e

    def get_recent_logs(
        self,
        hours: int = 24,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get recent administrative actions.

        Args:
            hours: Number of hours to look back
            limit: Maximum number of logs to return
            offset: Number of logs to skip

        Returns:
            List of audit log records
        """
        try:
            since = datetime.utcnow() - timedelta(hours=hours)

            response = self.query()\
                .select('*, users!admin_id(first_name, last_name, email)')\
                .gte('created_at', since.isoformat())\
                .order('created_at', desc=True)\
                .limit(limit)\
                .offset(offset)\
                .execute()

            return response.data if response.data else []

        except Exception as e:
            logger.error(f"Failed to fetch recent logs: {e}")
            raise DatabaseError(f"Failed to fetch recent logs: {e}") from e
