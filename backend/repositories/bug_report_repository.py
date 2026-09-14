"""
Bug Report Repository - data access for the platform ticket tracker.

`bug_reports` is the one table every Optio platform report lands in: the
mobile app's shake-to-report sheet, the staff reporter on the web platform
and SIS console, and (since 2026-09-14) the open tickets imported from Perch.
Rows are written via the admin client, since Optio uses a custom JWT rather
than Supabase auth.uid(), and read by superadmin in /admin/tickets.
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple

from postgrest.exceptions import APIError

from repositories.base_repository import BaseRepository, DatabaseError, NotFoundError
from utils.logger import get_logger
from utils.validation.sanitizers import pgrst_pattern

logger = get_logger(__name__)

# The three statuses that mean "somebody still has to do something".
OPEN_STATUSES = ('new', 'triaged', 'fixing')

# Columns the list view needs. The diagnostics blobs (breadcrumbs, API log,
# console errors) are large and only the detail view reads them. The
# reporter's name rides along through the users FK; a Perch import has no
# user_id and falls back to user_email in the UI.
_REPORTER = 'users(first_name, last_name, display_name)'
LIST_COLUMNS = (
    'id, title, type, priority, status, source, platform, current_route, '
    'user_email, user_role, organization_id, created_at, updated_at, resolved_at, '
    f'organizations(name, slug), {_REPORTER}'
)
DETAIL_COLUMNS = f'*, organizations(name, slug), {_REPORTER}'


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
        reports, _ = self.list_filtered(limit=limit, status=status)
        return reports

    def list_filtered(
        self,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
        ticket_type: Optional[str] = None,
        organization_id: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """List reports newest first with the filters the tracker offers.

        Returns (rows, total) where total is the exact count for the filter,
        not len(rows): PostgREST truncates silently at 1,000 and the table is
        already a third of the way there.
        """
        try:
            query = (
                self.client.table(self.table_name)
                .select(LIST_COLUMNS, count='exact')
                .order('created_at', desc=True)
                .range(offset, offset + limit - 1)
            )
            if status == 'open':
                query = query.in_('status', list(OPEN_STATUSES))
            elif status:
                query = query.eq('status', status)
            if ticket_type:
                query = query.eq('type', ticket_type)
            if organization_id:
                query = query.eq('organization_id', organization_id)
            if search:
                # .or_() takes a raw PostgREST filter string, so the free text
                # goes through pgrst_pattern (tests/test_postgrest_filter_injection).
                needle = pgrst_pattern(search)
                if needle:
                    query = query.or_(
                        f'title.ilike.%{pgrst_pattern(needle)}%,message.ilike.%{pgrst_pattern(needle)}%'
                    )
            response = query.execute()
            total = response.count if response.count is not None else len(response.data or [])
            return response.data or [], total
        except APIError as e:
            logger.error(f"Error listing bug_reports: {e}")
            raise DatabaseError("Failed to list bug reports") from e

    def find_detail(self, report_id: str) -> Optional[Dict[str, Any]]:
        """One report with every column and its organization's name."""
        try:
            response = (
                self.client.table(self.table_name)
                .select(DETAIL_COLUMNS)
                .eq(self.id_column, report_id)
                .limit(1)
                .execute()
            )
            return response.data[0] if response.data else None
        except APIError as e:
            logger.error(f"Error reading bug_report {report_id}: {e}")
            raise DatabaseError("Failed to read bug report") from e

    def counts_by_status(self) -> Dict[str, int]:
        """How many tickets sit in each status, for the tracker's tabs.

        One exact-count query per status: five cheap HEAD-style requests
        against an indexed column, and no row is ever transferred.
        """
        counts: Dict[str, int] = {}
        for status in ('new', 'triaged', 'fixing', 'resolved', 'wont_fix'):
            try:
                response = (
                    self.client.table(self.table_name)
                    .select('id', count='exact')
                    .eq('status', status)
                    .limit(1)
                    .execute()
                )
                counts[status] = response.count or 0
            except APIError as e:
                logger.error(f"Error counting bug_reports status={status}: {e}")
                raise DatabaseError("Failed to count bug reports") from e
        return counts

    def update_fields(self, report_id: str, changes: Dict[str, Any]) -> Dict[str, Any]:
        """Apply a triage edit. Resolving stamps resolved_at; reopening clears it."""
        data = dict(changes)
        status = data.get('status')
        if status in ('resolved', 'wont_fix'):
            data['resolved_at'] = datetime.now(timezone.utc).isoformat()
        elif status in OPEN_STATUSES:
            data['resolved_at'] = None

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
        return self.update_fields(report_id, data)
