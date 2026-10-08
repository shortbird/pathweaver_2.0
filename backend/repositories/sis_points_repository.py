"""Data access for school points: the sis_point_entries ledger, the
sis_point_balances view over it, and the school's quick buttons
(sis_point_buttons).

Authorization is the caller's: staff reads and writes are gated by
@require_role(STAFF_ROLES) plus the resolved org on routes/sis/points.py, a
family read by @require_relationship_to, and a bounty award by the bounty
review it follows. Nothing here decides who may ask.
"""

from typing import Any, Dict, Iterable, List, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)


class SisPointsRepository(BaseRepository):
    table_name = 'sis_point_entries'

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: a coach writes another person's (a
            # student's) points, a parent reads their child's, and a bounty
            # review awards the claimant's; none is the caller's own scope
            # under RLS. The route gate decides; this reads and writes only the
            # rows it is handed ids for.
            client = get_supabase_admin_client()
        super().__init__(client=client)

    # -- ledger ---------------------------------------------------------------

    def insert_entries(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not rows:
            return []
        return (self.client.table(self.table_name).insert(rows).execute()).data or []

    def entry(self, entry_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).select('*')
                .eq('id', entry_id).limit(1).execute()).data
        return rows[0] if rows else None

    def delete_entry(self, entry_id: str) -> None:
        self.client.table(self.table_name).delete().eq('id', entry_id).execute()

    def student_entries(self, org_id: str, student_id: str, limit: int) -> List[Dict[str, Any]]:
        """One student's newest entries. The balance comes from the view, so a
        short page here never makes the total wrong."""
        return (self.client.table(self.table_name).select('*')
                .eq('organization_id', org_id)
                .eq('student_user_id', student_id)
                .order('created_at', desc=True)
                .limit(limit).execute()).data or []

    def recent_entries(self, org_id: str, limit: int) -> List[Dict[str, Any]]:
        """The school's newest entries, for the undo list."""
        return (self.client.table(self.table_name).select('*')
                .eq('organization_id', org_id)
                .order('created_at', desc=True)
                .limit(limit).execute()).data or []

    def given_since(self, org_id: str, since_iso: str) -> List[Dict[str, Any]]:
        """The amounts of every award (amount > 0) since a date. Grows with
        the school's daily awards, so it pages."""
        return fetch_all_rows(lambda: (
            self.client.table(self.table_name).select('id, amount')
            .eq('organization_id', org_id)
            .gt('amount', 0)
            .gte('created_at', since_iso)
        ))

    def balances(self, org_id: str, student_ids: Optional[Iterable[str]] = None) -> List[Dict[str, Any]]:
        """{student_user_id, balance, earned, spent} per student with any entry.
        One row per student, so bounded by the roster; paged anyway because the
        roster is not bounded by anything we control."""
        ids = list(student_ids) if student_ids is not None else None
        if ids is not None and not ids:
            return []

        def query():
            q = (self.client.table('sis_point_balances').select('*')
                 .eq('organization_id', org_id))
            return q.in_('student_user_id', ids) if ids is not None else q
        # The view has no id; one row per student in an org, so the student
        # is the unique column to page by.
        return fetch_all_rows(query, order_by='student_user_id')

    # -- quick buttons --------------------------------------------------------

    def buttons(self, org_id: str) -> List[Dict[str, Any]]:
        """A school has a handful of buttons; the form caps them."""
        return (self.client.table('sis_point_buttons').select('*')
                .eq('organization_id', org_id)
                .order('sort_order').order('created_at')
                .execute()).data or []

    def replace_buttons(self, org_id: str, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """The form saves the whole list at once: delete, then insert."""
        self.client.table('sis_point_buttons').delete().eq('organization_id', org_id).execute()
        if not rows:
            return []
        return (self.client.table('sis_point_buttons').insert(rows).execute()).data or []

    # -- what an entry is checked against -------------------------------------

    def users(self, user_ids: Iterable[str]) -> List[Dict[str, Any]]:
        ids = list(user_ids)
        if not ids:
            return []
        return fetch_all_rows(lambda: (
            self.client.table('users')
            .select('id, first_name, last_name, display_name, preferred_name, username, '
                    'email, organization_id, role, org_role, org_roles')
            .in_('id', ids)
        ))
