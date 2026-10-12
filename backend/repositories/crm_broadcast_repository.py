"""
Reads and writes for the mail-merge sends at /admin/crm/lists
(services/crm_broadcast_service.py, routes/admin/crm_broadcasts.py).

crm_broadcasts and crm_broadcast_recipients are service-role only (RLS on, no
policies), so this runs on the admin client; every caller is behind
require_superadmin. The recipient rows of one send are bounded by the list
size, which can pass 1,000, so they are read through fetch_all_rows.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows
from utils.timestamps import now_iso

BROADCAST_COLUMNS = ('id, subject, body, list_id, list_name, sender_name, reply_to, '
                     'billing_month, sheet, status, recipient_count, sent_count, '
                     'failed_count, skipped_count, created_by, created_at, finished_at')
RECIPIENT_COLUMNS = ('id, broadcast_id, user_id, email, name, status, reason, '
                     'subject, created_at, sent_at')


class CrmBroadcastRepository(BaseRepository):
    table_name = 'crm_broadcasts'
    id_column = 'id'

    def create(self, fields: Dict[str, Any]) -> Dict[str, Any]:
        return (self.client.table(self.table_name).insert(fields).execute()).data[0]

    def get(self, broadcast_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).select(BROADCAST_COLUMNS)
                .eq('id', broadcast_id).limit(1).execute()).data or []
        return rows[0] if rows else None

    def recent(self, limit: int = 50) -> List[Dict[str, Any]]:
        return (self.client.table(self.table_name).select(BROADCAST_COLUMNS)
                .order('created_at', desc=True).limit(limit).execute()).data or []

    def set_fields(self, broadcast_id: str, fields: Dict[str, Any]) -> None:
        self.client.table(self.table_name).update(fields).eq('id', broadcast_id).execute()

    def finish(self, broadcast_id: str, counts: Dict[str, int], status: str) -> None:
        self.set_fields(broadcast_id, {**counts, 'status': status, 'finished_at': now_iso()})

    # ------------------------------------------------------------ recipients

    def add_recipients(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not rows:
            return []
        out: List[Dict[str, Any]] = []
        for i in range(0, len(rows), 500):
            out.extend((self.client.table('crm_broadcast_recipients')
                        .insert(rows[i:i + 500]).execute()).data or [])
        return out

    def recipients(self, broadcast_id: str) -> List[Dict[str, Any]]:
        return fetch_all_rows(
            lambda: self.client.table('crm_broadcast_recipients').select(RECIPIENT_COLUMNS)
            .eq('broadcast_id', broadcast_id).order('name'))

    def mark_recipient(self, recipient_id: str, fields: Dict[str, Any]) -> None:
        self.client.table('crm_broadcast_recipients').update(fields).eq('id', recipient_id).execute()
