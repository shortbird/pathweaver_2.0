"""Quest Resource Repository — data access for quest_resources.

Files, links and videos attached to a quest (task_id NULL) or to one of its
template tasks. The table is deny-all RLS: every read and write here runs on the
service-role client, behind the per-quest gate in
routes/sis/quest_resources.py and services/quest_resource_service.py.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.logger import get_logger

logger = get_logger(__name__)

#: The columns a reader needs. `file_path` is deliberately absent: it is the
#: storage key, only ever used internally by a delete.
READ_COLUMNS = 'id, task_id, kind, title, url, sort_order, created_at'


class QuestResourceRepository(BaseRepository):
    """Repository for quest resource operations."""

    table_name = 'quest_resources'
    id_column = 'id'

    def _scoped(self, quest_id: str, task_id: Optional[str], select: str):
        """A query narrowed to one quest, and to one task when given.

        `task_id=None` means the quest's OWN resources, which is a different
        question from "any task's" — hence `.is_('task_id', 'null')` rather than
        no filter at all.
        """
        query = self.client.table(self.table_name).select(select).eq('quest_id', quest_id)
        return query.is_('task_id', 'null') if task_id is None else query.eq('task_id', task_id)

    def list_for_quest(self, quest_id: str) -> List[Dict[str, Any]]:
        """Every resource on this quest, in display order. [] on failure —
        a quest that cannot load its attachments still has to load."""
        try:
            return (self.client.table(self.table_name).select(READ_COLUMNS)
                    .eq('quest_id', quest_id).order('sort_order').execute()).data or []
        except Exception as e:  # noqa: BLE001
            logger.warning(f'quest resources: read failed for {quest_id}: {e}')
            return []

    def list_for_copy(self, quest_id: str) -> List[Dict[str, Any]]:
        """The fields a duplicate needs to carry over."""
        try:
            return (self.client.table(self.table_name)
                    .select('task_id, kind, title, url, sort_order')
                    .eq('quest_id', quest_id).order('sort_order').execute()).data or []
        except Exception as e:  # noqa: BLE001
            logger.warning(f'quest resources: copy read failed for {quest_id}: {e}')
            return []

    def next_sort_order(self, quest_id: str, task_id: Optional[str]) -> int:
        rows = (self._scoped(quest_id, task_id, 'sort_order')
                .order('sort_order', desc=True).limit(1).execute()).data
        return ((rows[0].get('sort_order') or 0) + 1) if rows else 0

    def ids_in_scope(self, quest_id: str, task_id: Optional[str]) -> set:
        """Which resources a reorder is allowed to touch — so a posted id from
        another quest or another task cannot be moved by naming it."""
        rows = (self._scoped(quest_id, task_id, 'id').execute()).data or []
        return {r['id'] for r in rows}

    def task_belongs_to_quest(self, quest_id: str, task_id: str) -> bool:
        rows = (self.client.table('quest_template_tasks').select('id')
                .eq('id', task_id).eq('quest_id', quest_id).limit(1).execute()).data
        return bool(rows)

    def create(self, row: Dict[str, Any]) -> Dict[str, Any]:
        created = (self.client.table(self.table_name).insert(row).execute()).data
        return created[0] if created else row

    def create_many(self, rows: List[Dict[str, Any]]) -> int:
        if not rows:
            return 0
        self.client.table(self.table_name).insert(rows).execute()
        return len(rows)

    def find_in_quest(self, quest_id: str, resource_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).select('id, file_path')
                .eq('id', resource_id).eq('quest_id', quest_id).limit(1).execute()).data
        return rows[0] if rows else None

    def delete_by_id(self, resource_id: str) -> None:
        self.client.table(self.table_name).delete().eq('id', resource_id).execute()

    def set_sort_order(self, resource_id: str, position: int) -> None:
        (self.client.table(self.table_name).update({'sort_order': position})
         .eq('id', resource_id).execute())
