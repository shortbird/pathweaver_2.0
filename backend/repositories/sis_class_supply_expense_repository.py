"""Data access for a class's supply expense log (sis_class_supply_expenses).

Ticket e7a50b4b (iCreate, advisor): "I would like to see what I have spent on
each class supply budget already/how much I have left."

Authorization is the caller's: the routes in routes/sis/staff_portal.py gate on
STAFF_ROLES plus class scope, and sis_supply_expense_service decides who may
change which entry. Nothing here decides who may ask.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows


class SisClassSupplyExpenseRepository(BaseRepository):
    table_name = 'sis_class_supply_expenses'

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: the table is RLS-locked to the backend
            # (no policies); the route's role + class-scope gate and the
            # service's owner rule are the authorization.
            client = get_supabase_admin_client()
        super().__init__(client=client)

    def for_classes(self, org_id: str, class_ids: List[str]) -> List[Dict[str, Any]]:
        """Every entry for these classes, in id order. Paged: an org-wide
        budget listing would otherwise drop entries past 1,000 rows and
        under-count what was spent."""
        ids = sorted({c for c in class_ids or [] if c})
        if not ids:
            return []
        return fetch_all_rows(lambda: (
            self.client.table(self.table_name).select('*')
            .eq('organization_id', org_id).in_('class_id', ids)
        ))

    def entry(self, expense_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).select('*')
                .eq('id', expense_id).limit(1).execute()).data
        return rows[0] if rows else None

    def insert(self, row: Dict[str, Any]) -> Dict[str, Any]:
        rows = (self.client.table(self.table_name).insert(row).execute()).data or []
        return rows[0] if rows else row

    def update_entry(self, expense_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).update(fields)
                .eq('id', expense_id).execute()).data or []
        return rows[0] if rows else None

    def delete_entry(self, expense_id: str) -> None:
        self.client.table(self.table_name).delete().eq('id', expense_id).execute()
