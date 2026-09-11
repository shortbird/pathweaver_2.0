"""Data access for `marketing_rebuilds` -- every ask to redeploy the www site.

The policy (debounce interval, coalescing, what an unset hook means) lives in
services/marketing_site.py. This module is rows only.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository

COLUMNS = 'id, reason, requested_at, fired_at, status, response, created_at'


class MarketingRebuildRepository(BaseRepository):
    table_name = 'marketing_rebuilds'

    def __init__(self, client: Any = None):
        # admin client justified: service-role-only bookkeeping table with no
        # user rows in it; written by publish, revoke, erasure and the cron.
        super().__init__(user_id=None, client=client)

    def create(self, reason: str, status: str = 'requested',
               requested_at: Optional[str] = None) -> Dict[str, Any]:
        row: Dict[str, Any] = {'reason': reason, 'status': status}
        if requested_at:
            row['requested_at'] = requested_at
        inserted = self.client.table(self.table_name).insert(row).execute().data
        return inserted[0] if inserted else row

    def last_fired_at(self) -> Optional[str]:
        rows = self.client.table(self.table_name).select('fired_at').eq(
            'status', 'fired').order('fired_at', desc=True).limit(1).execute().data
        return rows[0].get('fired_at') if rows else None

    def requested(self, limit: int = 200) -> List[Dict[str, Any]]:
        return self.client.table(self.table_name).select(COLUMNS).eq(
            'status', 'requested').order('requested_at').limit(limit).execute().data or []

    def patch(self, rebuild_id: str, changes: Dict[str, Any]) -> None:
        self.client.table(self.table_name).update(changes).eq('id', rebuild_id).execute()

    def mark_many(self, rebuild_ids: List[str], changes: Dict[str, Any]) -> None:
        ids = [r for r in (rebuild_ids or []) if r]
        if not ids:
            return
        self.client.table(self.table_name).update(changes).in_('id', ids).execute()
