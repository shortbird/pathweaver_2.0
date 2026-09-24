"""
Bug Report Repository - data access for the platform ticket tracker.

`bug_reports` is the one table every Optio platform report lands in: the
mobile app's shake-to-report sheet, the staff reporter on the web platform
and SIS console, (since 2026-09-14) the open tickets imported from Perch, and
(since 2026-09-15) Sentry issue alerts. Rows are written via the admin client,
since Optio uses a custom JWT rather than Supabase auth.uid(), and read by
superadmin in /admin/tickets and by the deploy sweep
(services/ticket_finalize_service.py).
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple

from postgrest.exceptions import APIError

from repositories.base_repository import BaseRepository, DatabaseError, NotFoundError
from utils.logger import get_logger
from utils.validation.sanitizers import pgrst_pattern

logger = get_logger(__name__)

# The statuses that mean the ticket is not finished. The first three need a
# person; `fixed` (committed, not yet live) needs a deploy, and the deploy
# sweep is what moves it on. It counts as open so the console keeps showing
# it and a repeat Sentry alert lands on it rather than opening a twin.
OPEN_STATUSES = ('new', 'triaged', 'fixing', 'fixed')
ALL_STATUSES = OPEN_STATUSES + ('resolved', 'wont_fix')

# Columns the list view needs. The diagnostics blobs (breadcrumbs, API log,
# console errors) are large and only the detail view reads them. The
# reporter's name rides along through the users FK; a Perch import has no
# user_id and falls back to user_email in the UI.
_REPORTER = 'users(first_name, last_name, display_name)'
LIST_COLUMNS = (
    'id, title, type, priority, status, source, platform, current_route, '
    'user_email, user_role, organization_id, created_at, updated_at, resolved_at, '
    'fix_commit, deployed_at, reporter_notified_at, notify_reporter, '
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

        One exact-count query per status: six cheap HEAD-style requests
        against an indexed column, and no row is ever transferred.
        """
        counts: Dict[str, int] = {}
        for status in ALL_STATUSES:
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
        """Apply a triage edit. Resolving stamps resolved_at; reopening clears it.

        Reopening also clears deployed_at and reporter_notified_at, so a ticket
        that comes back after its mail went out is mailed again when it is
        fixed again -- the reporter asked twice and should hear twice.
        """
        data = dict(changes)
        status = data.get('status')
        if status in ('resolved', 'wont_fix'):
            data.setdefault('resolved_at', datetime.now(timezone.utc).isoformat())
        elif status in OPEN_STATUSES:
            data['resolved_at'] = None
            if status != 'fixed':
                data['deployed_at'] = None
                data['reporter_notified_at'] = None

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

    # -- The deploy sweep's reads ------------------------------------------
    #
    # Both slices are small (a handful of rows against ~400 resolved), each
    # has a partial index (20260918160000), and neither can reach the
    # PostgREST row cap without something else having gone badly wrong. The
    # limit is there so a runaway is bounded, not because it is expected.

    SWEEP_COLUMNS = (
        'id, title, type, status, source, user_email, user_id, organization_id, '
        'fix_commit, resolution, verification, notify_reporter, '
        'resolved_at, deployed_at, reporter_notified_at, created_at, updated_at'
    )

    def list_fixed(self) -> List[Dict[str, Any]]:
        """Every ticket that is committed and waiting for production."""
        try:
            response = (
                self.client.table(self.table_name)
                .select(self.SWEEP_COLUMNS)
                .eq('status', 'fixed')
                .order('created_at')
                .limit(500)
                .execute()
            )
            return response.data or []
        except APIError as e:
            logger.error(f"Error listing fixed bug_reports: {e}")
            raise DatabaseError("Failed to list fixed bug reports") from e

    def list_awaiting_reporter_notice(self) -> List[Dict[str, Any]]:
        """Resolved tickets whose reporter has not been told yet.

        The rule that decides whether a given row SHOULD be mailed (a Sentry
        ticket never is, nor a row with no address) lives in the service;
        this returns what the flag and the stamp say is outstanding.
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select(self.SWEEP_COLUMNS)
                .eq('status', 'resolved')
                .eq('notify_reporter', True)
                .is_('reporter_notified_at', 'null')
                .order('resolved_at')
                .limit(500)
                .execute()
            )
            return response.data or []
        except APIError as e:
            logger.error(f"Error listing bug_reports awaiting notice: {e}")
            raise DatabaseError("Failed to list bug reports awaiting notice") from e

    def find_latest_by_sentry_issue(self, sentry_key: str) -> Optional[Dict[str, Any]]:
        """The newest ticket a Sentry issue has, open or closed, if any.

        `sentry_key` is `<project slug>:<issue id>`, stored by the webhook in
        extra.sentry_issue_id (indexed, see the 20260916140000 migration).
        The webhook decides what to do with the answer: note a repeat on an
        open ticket, or open a fresh one that names a closed one, because an
        issue that fires again after its fix is a regression, not the same bug.
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select('id, status, resolved_at, triage_notes')
                .eq('source', 'sentry')
                .eq('extra->>sentry_issue_id', sentry_key)
                .order('created_at', desc=True)
                .limit(1)
                .execute()
            )
            return response.data[0] if response.data else None
        except APIError as e:
            logger.error(f"Error looking up bug_report for sentry issue {sentry_key}: {e}")
            raise DatabaseError("Failed to look up bug report") from e

    def find_latest_by_canary_token(self, token: str) -> Optional[Dict[str, Any]]:
        """The newest ticket a canarytoken has filed, open or closed, if any.

        Same contract as find_latest_by_sentry_issue, keyed by the token
        stored in extra.canary_token. No index: a canary fires rarely, and a
        busy one is noted on its open ticket, not re-inserted.
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select('id, status, resolved_at, triage_notes')
                .eq('source', 'canary')
                .eq('extra->>canary_token', token)
                .order('created_at', desc=True)
                .limit(1)
                .execute()
            )
            return response.data[0] if response.data else None
        except APIError as e:
            logger.error(f"Error looking up bug_report for canary token: {e}")
            raise DatabaseError("Failed to look up bug report") from e

    def append_triage_note(self, report_id: str, note: str) -> Dict[str, Any]:
        """Add a line to triage_notes without touching what is already there.

        Read-then-write rather than a SQL concat: the tracker is edited by one
        superadmin and one webhook, and a lost line from a same-second race is
        a note about a repeat event, which the next repeat rewrites anyway.
        """
        try:
            current = (
                self.client.table(self.table_name)
                .select('triage_notes')
                .eq(self.id_column, report_id)
                .limit(1)
                .execute()
            )
        except APIError as e:
            logger.error(f"Error reading bug_report {report_id} notes: {e}")
            raise DatabaseError("Failed to read bug report") from e
        if not current.data:
            raise NotFoundError(f"bug_report {report_id} not found")
        existing = (current.data[0].get('triage_notes') or '').rstrip()
        combined = f"{existing}\n{note}" if existing else note
        return self.update_fields(report_id, {'triage_notes': combined})

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
