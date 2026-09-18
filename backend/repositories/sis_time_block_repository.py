"""
SIS Time Block Repository - the school day's blocks, one row each.

`sis_time_blocks` replaced the JSON list in feature_flags.sis_settings on
2026-09-18 (consolidation move M8b): a block has an id now, so a class
meeting can say which block it fills (class_meetings.block_id) and renaming
or retiming a block is an edit to one row rather than a renumbering of every
roster. sis_catalog_service.time_blocks is the one reader; the Settings card
writes through save_blocks below.
"""

from typing import Any, Dict, List

from repositories.base_repository import BaseRepository


def _hm(value: Any) -> str:
    """'09:30:00' -> '09:30', the shape the JSON list always carried and every
    reader compares on."""
    return str(value or '')[:5]


class SisTimeBlockRepository(BaseRepository):
    table_name = 'sis_time_blocks'

    def list_for_org(self, organization_id: str) -> List[Dict[str, Any]]:
        """Blocks in school-day order: [{id, label, start, end, sort}]."""
        rows = (
            self.client.table(self.table_name)
            .select('id, label, start_time, end_time, sort_order')
            .eq('organization_id', organization_id)
            .order('sort_order').order('start_time')
            .execute()
        ).data or []
        return [{
            'id': r['id'],
            'label': r.get('label') or '',
            'start': _hm(r.get('start_time')),
            'end': _hm(r.get('end_time')),
            'sort': r.get('sort_order') or 0,
        } for r in rows]

    def save_blocks(self, organization_id: str, blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Make the org's blocks equal to `blocks` ([{id?, label, start, end}],
        already validated and in order), keeping ids where the caller sent
        them or where a block's times match an existing row -- so a rename or
        a reorder is an update, and the meetings pointing at the block keep
        pointing at it. Rows not in the list are deleted (their meetings'
        block_id goes NULL by the foreign key)."""
        existing = self.list_for_org(organization_id)
        by_id = {b['id']: b for b in existing}
        by_times = {(b['start'], b['end']): b for b in existing}
        keep: List[str] = []
        for i, b in enumerate(blocks):
            match = by_id.get(b.get('id')) or by_times.get((b['start'], b['end']))
            payload = {
                'organization_id': organization_id,
                'label': b.get('label') or '',
                'start_time': b['start'],
                'end_time': b['end'],
                'sort_order': i,
            }
            if match and match['id'] not in keep:
                self.client.table(self.table_name).update(payload).eq('id', match['id']).execute()
                keep.append(match['id'])
            else:
                row = (self.client.table(self.table_name).insert(payload).execute()).data or []
                if row:
                    keep.append(row[0]['id'])
        gone = [b['id'] for b in existing if b['id'] not in keep]
        if gone:
            self.client.table(self.table_name).delete().in_('id', gone).execute()
        return self.list_for_org(organization_id)
