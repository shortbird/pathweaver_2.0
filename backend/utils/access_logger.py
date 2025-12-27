"""
FERPA Compliance: Student Data Access Logger
Tracks all access to student educational records for regulatory compliance
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from flask import request, has_request_context
from database import get_supabase_admin_singleton
from utils.logger import get_logger

logger = get_logger(__name__)


class AccessLogger:
    """
    Utility for logging access to student educational records.
    Required for FERPA compliance and disclosure reporting.
    """

    @staticmethod
    def log_student_data_access(
        student_id: str,
        accessor_id: Optional[str],
        data_type: str,
        purpose: Optional[str] = None,
        fields: Optional[List[str]] = None,
        endpoint: Optional[str] = None
    ) -> bool:
        """
        Log access to student educational records.

        Args:
            student_id: UUID of the student whose data was accessed
            accessor_id: UUID of the user accessing the data (None for public/system access)
            data_type: Type of data accessed ('grades', 'portfolio', 'evidence', 'profile', 'activity', 'quests', 'tasks')
            purpose: FERPA-compliant purpose ('legitimate_educational_interest', 'parent_request', 'directory_info', 'admin_review', 'observer_view')
            fields: List of specific fields/columns accessed
            endpoint: API endpoint used for access (e.g., '/api/portfolio/john-doe')

        Returns:
            bool: True if logged successfully, False otherwise
        """
        try:
            # Build data_accessed JSON
            data_accessed = {
                'type': data_type,
                'fields': fields or [],
                'endpoint': endpoint or (request.path if has_request_context() else None)
            }

            # Get request metadata if available
            ip_address = None
            user_agent = None
            accessor_role = None

            if has_request_context():
                ip_address = request.remote_addr
                user_agent = request.headers.get('User-Agent', '')

                # Get accessor role from request context if available
                if hasattr(request, 'user_role'):
                    accessor_role = request.user_role
                elif accessor_id:
                    # Fetch role from database if not in context
                    admin_client = get_supabase_admin_singleton()
                    accessor = admin_client.table('users').select('role').eq('id', accessor_id).single().execute()
                    if accessor.data:
                        accessor_role = accessor.data.get('role', 'unknown')
                else:
                    accessor_role = 'public'
            else:
                accessor_role = 'system'

            # Insert log entry
            admin_client = get_supabase_admin_singleton()
            result = admin_client.table('student_access_logs').insert({
                'student_id': student_id,
                'accessor_id': accessor_id,
                'accessor_role': accessor_role,
                'data_accessed': data_accessed,
                'purpose': purpose,
                'ip_address': ip_address,
                'user_agent': user_agent
            }).execute()

            logger.info(
                f"[AccessLogger] Logged access to student {student_id} data",
                extra={
                    'extra_fields': {
                        'student_id': student_id,
                        'accessor_id': accessor_id,
                        'accessor_role': accessor_role,
                        'data_type': data_type,
                        'purpose': purpose
                    }
                }
            )

            return True

        except Exception as e:
            logger.error(
                f"[AccessLogger] Failed to log student data access: {str(e)}",
                extra={
                    'extra_fields': {
                        'student_id': student_id,
                        'accessor_id': accessor_id,
                        'data_type': data_type,
                        'error': str(e)
                    }
                }
            )
            # Don't raise - logging failure shouldn't break the main operation
            return False

    @staticmethod
    def get_student_access_history(
        student_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Retrieve access history for a student.

        Args:
            student_id: UUID of the student
            start_date: Start of date range (None = no lower bound)
            end_date: End of date range (None = no upper bound)
            limit: Maximum number of records to return (default: 100)

        Returns:
            List of access log entries, sorted by most recent first
        """
        try:
            admin_client = get_supabase_admin_singleton()

            # Build query
            query = admin_client.table('student_access_logs').select('*').eq('student_id', student_id)

            # Apply date filters if provided
            if start_date:
                query = query.gte('access_timestamp', start_date.isoformat())
            if end_date:
                query = query.lte('access_timestamp', end_date.isoformat())

            # Order by most recent and limit
            query = query.order('access_timestamp', desc=True).limit(limit)

            result = query.execute()

            logger.info(
                f"[AccessLogger] Retrieved {len(result.data)} access log entries for student {student_id}",
                extra={
                    'extra_fields': {
                        'student_id': student_id,
                        'record_count': len(result.data)
                    }
                }
            )

            return result.data

        except Exception as e:
            logger.error(
                f"[AccessLogger] Failed to retrieve student access history: {str(e)}",
                extra={
                    'extra_fields': {
                        'student_id': student_id,
                        'error': str(e)
                    }
                }
            )
            return []

    @staticmethod
    def get_access_summary_by_accessor(
        student_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Get summary of who has accessed a student's data.
        Useful for FERPA disclosure reports.

        Args:
            student_id: UUID of the student
            start_date: Start of date range (None = no lower bound)
            end_date: End of date range (None = no upper bound)

        Returns:
            List of summaries grouped by accessor with access counts
        """
        try:
            admin_client = get_supabase_admin_singleton()

            # Get all access logs in date range
            logs = AccessLogger.get_student_access_history(
                student_id=student_id,
                start_date=start_date,
                end_date=end_date,
                limit=1000  # Higher limit for summary
            )

            # Group by accessor
            summary = {}
            for log in logs:
                accessor_id = log.get('accessor_id') or 'public'
                if accessor_id not in summary:
                    summary[accessor_id] = {
                        'accessor_id': accessor_id,
                        'accessor_role': log.get('accessor_role'),
                        'access_count': 0,
                        'first_access': log.get('access_timestamp'),
                        'last_access': log.get('access_timestamp'),
                        'data_types': set(),
                        'purposes': set()
                    }

                summary[accessor_id]['access_count'] += 1
                summary[accessor_id]['data_types'].add(log['data_accessed'].get('type'))
                if log.get('purpose'):
                    summary[accessor_id]['purposes'].add(log.get('purpose'))

                # Update timestamps
                log_time = log.get('access_timestamp')
                if log_time > summary[accessor_id]['last_access']:
                    summary[accessor_id]['last_access'] = log_time
                if log_time < summary[accessor_id]['first_access']:
                    summary[accessor_id]['first_access'] = log_time

            # Convert sets to lists for JSON serialization
            result = []
            for accessor_summary in summary.values():
                accessor_summary['data_types'] = list(accessor_summary['data_types'])
                accessor_summary['purposes'] = list(accessor_summary['purposes'])
                result.append(accessor_summary)

            # Sort by access count descending
            result.sort(key=lambda x: x['access_count'], reverse=True)

            return result

        except Exception as e:
            logger.error(
                f"[AccessLogger] Failed to get access summary: {str(e)}",
                extra={
                    'extra_fields': {
                        'student_id': student_id,
                        'error': str(e)
                    }
                }
            )
            return []


# Convenience function for simple logging
def log_student_access(
    student_id: str,
    data_type: str,
    accessor_id: Optional[str] = None,
    purpose: Optional[str] = None,
    fields: Optional[List[str]] = None
) -> bool:
    """
    Convenience function to log student data access.

    Args:
        student_id: UUID of the student
        data_type: Type of data accessed
        accessor_id: UUID of accessor (None = get from request context)
        purpose: FERPA-compliant purpose
        fields: List of fields accessed

    Returns:
        bool: True if logged successfully
    """
    # Try to get accessor_id from request context if not provided
    if accessor_id is None and has_request_context():
        accessor_id = getattr(request, 'user_id', None)

    return AccessLogger.log_student_data_access(
        student_id=student_id,
        accessor_id=accessor_id,
        data_type=data_type,
        purpose=purpose,
        fields=fields
    )
