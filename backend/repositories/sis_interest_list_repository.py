"""The interest list: sis_interest_list_entries, plus the one org_invitations
read its invite email needs (the school's standing registration link).

The rules live in services/sis_interest_list_service.py. Client-injected: the
service hands in the service-role client its callers justified (a public join
has no session; the staff list reads every family in the org). The table is
RLS-locked with no policies, so no other client could read it anyway.

Every write is scoped by organization_id as well as id, so an id from one
school can never touch another school's row.
"""

from typing import Any, Dict, List, Optional

from utils.db_fetch import fetch_all_rows

TABLE = 'sis_interest_list_entries'
LIVE_STATUSES = ('waiting', 'invited')


class SisInterestListRepository:

    def __init__(self, client: Any):
        # Required, not defaulted: the caller's justification for the
        # service-role client lives at the caller (sis_interest_list_service).
        self.client = client

    def live_entry_id(self, organization_id: str, email: str) -> Optional[str]:
        """The family's row still in line (waiting or invited), oldest first."""
        rows = (self.client.table(TABLE).select('id')
                .eq('organization_id', organization_id).eq('email', email)
                .in_('status', list(LIVE_STATUSES))
                .order('created_at').limit(1).execute()).data or []
        return rows[0]['id'] if rows else None

    def insert(self, row: Dict[str, Any]) -> Dict[str, Any]:
        inserted = self.client.table(TABLE).insert(row).execute().data or []
        return inserted[0] if inserted else row

    def update(self, organization_id: str, entry_id: str, patch: Dict[str, Any]) -> None:
        (self.client.table(TABLE).update(patch)
         .eq('id', entry_id).eq('organization_id', organization_id).execute())

    def get(self, organization_id: str, entry_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(TABLE).select('*')
                .eq('organization_id', organization_id).eq('id', entry_id)
                .limit(1).execute()).data or []
        return rows[0] if rows else None

    def list_for_org(self, organization_id: str) -> List[Dict[str, Any]]:
        """Every row for the school. Paged: a school's list only grows."""
        return fetch_all_rows(
            lambda: self.client.table(TABLE).select('*').eq('organization_id', organization_id))

    def close_live_by_email(self, organization_id: str, email: str,
                            patch: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Apply `patch` to every row of this email still in line; the rows changed."""
        return (self.client.table(TABLE).update(patch)
                .eq('organization_id', organization_id).eq('email', email)
                .in_('status', list(LIVE_STATUSES)).execute()).data or []

    def standing_parent_link_rows(self, organization_id: str) -> List[Dict[str, Any]]:
        """The school's pending parent link-invites, newest first (the caller
        picks the one with the link placeholder email)."""
        return (self.client.table('org_invitations')
                .select('invitation_code, email, role, status, created_at')
                .eq('organization_id', organization_id).eq('role', 'parent')
                .eq('status', 'pending').like('email', 'link-invite-%')
                .order('created_at', desc=True).limit(5).execute()).data or []
