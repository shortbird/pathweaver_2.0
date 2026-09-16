"""Class waitlists: sis_waitlist_entries.

services/sis_waitlist_service still reads the table directly for the
per-class list and the join/offer flow; new reads land here. The first is
the one behind a student's place in line, which several screens print for
several classes at once.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List

from repositories.base_repository import BaseRepository

LIVE_STATUSES = ('waiting', 'offered')


class SisWaitlistRepository(BaseRepository):
    table_name = 'sis_waitlist_entries'

    def live_entries_for_classes(self, organization_id: str,
                                 class_ids: Iterable[str]) -> List[Dict[str, Any]]:
        """Every entry still waiting or holding an offer, on these classes.

        Bounded by the classes named: a student sits on a handful of lists and
        each holds tens of live rows, so this stays far under the row cap.
        """
        ids = [c for c in dict.fromkeys(class_ids or []) if c]
        if not ids:
            return []
        return (self.client.table(self.table_name)
                .select('id, class_id, status, position')
                .eq('organization_id', organization_id).in_('class_id', ids)
                .in_('status', list(LIVE_STATUSES)).execute()).data or []
