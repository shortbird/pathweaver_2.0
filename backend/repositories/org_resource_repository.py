"""The SIS document library's own rows in org_resources.

org_resources also holds training links (`is_training` set), which the
Training page owns and orders through PUT /api/sis/training/order. Every
write here filters `is_training = false`, so arranging the Documents tab can
never reorder a training row, and every write is pinned to one organization,
so an id from another school is skipped rather than written.
"""

from __future__ import annotations

from typing import Iterable, List

from repositories.base_repository import BaseRepository


class OrgResourceRepository(BaseRepository):
    table_name = 'org_resources'

    def owned_document_ids(self, organization_id: str, ids: Iterable[str]) -> set:
        """Which of these ids are this school's library documents (not
        training links). The ids come from the browser."""
        wanted = [str(i) for i in ids if i]
        if not wanted:
            return set()
        rows = (self.client.table(self.table_name).select('id')
                .eq('organization_id', organization_id).eq('is_training', False)
                .in_('id', wanted).execute()).data or []
        return {r['id'] for r in rows}

    def set_sort_order(self, organization_id: str, ids_in_order: List[str]) -> int:
        """Write each owned document's index in `ids_in_order` to sort_order.

        Index, not a relative swap: the admin's whole list is numbered, so rows
        that were never arranged (all 0, the column default) stop tying the
        first time anything moves. Returns how many rows were written.
        updated_at is left alone on purpose -- moving a document is not
        editing it.
        """
        owned = self.owned_document_ids(organization_id, ids_in_order)
        written = 0
        for index, resource_id in enumerate(ids_in_order):
            if resource_id not in owned:
                continue
            (self.client.table(self.table_name).update({'sort_order': index})
             .eq('id', resource_id).eq('organization_id', organization_id)
             .eq('is_training', False).execute())
            written += 1
        return written
