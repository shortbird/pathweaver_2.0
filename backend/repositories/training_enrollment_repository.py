"""Enrollments behind a training quest, for taking one off the catalog.

A training quest reaches people as ordinary user_quests rows (see
utils/quest_assignment.assign_quest_to_users). Removing the catalog row used to
leave every one of them active, so the quest sat in the learning app long after
the school deleted it (ticket bd853b5d). These are the reads and the one write
sis_training_service.retire_unstarted_enrollments needs to end the enrollments
nobody has started.

Every read that grows with the size of a school is paged (fetch_all_rows) and
chunked on its id list: an auto-assigned quest can be on every account.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows

_CHUNK = 200


def _chunks(values: Iterable[str]):
    values = list(values)
    for i in range(0, len(values), _CHUNK):
        yield values[i:i + _CHUNK]


class TrainingEnrollmentRepository(BaseRepository):
    table_name = 'user_quests'

    def quest_still_listed(self, organization_id: str, quest_id: str) -> bool:
        """Does another catalog row in this school still offer the quest?"""
        return bool((self.client.table('sis_staff_training').select('id')
                     .eq('organization_id', organization_id).eq('quest_id', quest_id)
                     .limit(1).execute()).data)

    def active_enrollments(self, quest_id: str) -> List[Dict[str, Any]]:
        """Every active enrollment in the quest, in any school."""
        return fetch_all_rows(lambda: (
            self.client.table(self.table_name).select('id, user_id, completed_at')
            .eq('quest_id', quest_id).eq('is_active', True)))

    def members(self, organization_id: str, user_ids: Iterable[str]) -> set:
        """Which of these people belong to this school."""
        return {r['id'] for r in self._paged_in(
            'users', 'id', 'id', user_ids, organization_id=organization_id)}

    def users_with_completions(self, quest_id: str, user_ids: Iterable[str]) -> set:
        """Which of these people have completed at least one task of the quest."""
        return {r['user_id'] for r in self._paged_in(
            'quest_task_completions', 'id, user_id', 'user_id', user_ids, quest_id=quest_id)}

    def _paged_in(self, table: str, columns: str, key: str, values: Iterable[str],
                  **eq: str) -> List[Dict[str, Any]]:
        """Every `table` row whose `key` is in `values` and which matches each
        `eq` filter -- chunked on the id list, paged within each chunk."""
        out: List[Dict[str, Any]] = []
        for part in _chunks(values):
            def build(p: List[str] = part) -> Any:
                q = self.client.table(table).select(columns)
                for field, value in eq.items():
                    q = q.eq(field, value)
                return q.in_(key, p)
            out.extend(fetch_all_rows(build))
        return out

    def set_down(self, enrollment_ids: Iterable[str], now: str) -> None:
        """End these enrollments the way ending a quest does elsewhere --
        inactive, with the set-down time -- without marking them complete."""
        for part in _chunks(enrollment_ids):
            (self.client.table(self.table_name)
             .update({'is_active': False, 'last_set_down_at': now})
             .in_('id', part).execute())
