"""
Bug Report Repository - data access for beta bug reports.

Backs the in-app shake-to-report flow. Reports are written by authenticated
mobile users (via the admin client, since Optio uses a custom JWT rather than
Supabase auth.uid()) and triaged by superadmin.
"""

from typing import Optional, List, Dict, Any

from postgrest.exceptions import APIError

from repositories.base_repository import BaseRepository, DatabaseError, NotFoundError
from utils.logger import get_logger

logger = get_logger(__name__)


class BugReportRepository(BaseRepository):
    """Repository for the bug_reports table."""

    table_name = 'bug_reports'
    id_column = 'id'

    def list_recent(
        self,
        limit: int = 50,
        status: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List recent reports, newest first, optionally filtered by status."""
        try:
            query = (
                self.client.table(self.table_name)
                .select('*')
                .order('created_at', desc=True)
                .limit(limit)
            )
            if status:
                query = query.eq('status', status)
            response = query.execute()
            return response.data or []
        except APIError as e:
            logger.error(f"Error listing bug_reports: {e}")
            raise DatabaseError("Failed to list bug reports") from e

    def update_status(
        self,
        report_id: str,
        status: str,
        triage_notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Update a report's triage status (and optional notes)."""
        data: Dict[str, Any] = {'status': status}
        if triage_notes is not None:
            data['triage_notes'] = triage_notes
        if status == 'resolved':
            from datetime import datetime
            data['resolved_at'] = datetime.utcnow().isoformat()

        try:
            response = (
                self.client.table(self.table_name)
                .update(data)
                .eq(self.id_column, report_id)
                .execute()
            )
            if not response.data:
                raise NotFoundError(f"bug_report {report_id} not found")
            return response.data[0]
        except APIError as e:
            logger.error(f"Error updating bug_report {report_id}: {e}")
            raise DatabaseError("Failed to update bug report") from e
