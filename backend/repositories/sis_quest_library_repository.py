"""
SIS Quest Library Repository - the school's quests and where each one is in use.

Behind routes/sis/quest_library.py (the Quests page under Operations) and the
one shared writer for "this quest is on this curriculum"
(services.sis_curriculum_sync.attach_quest_to_curriculum). Reads span quests,
quest_template_tasks, sis_curriculum_quests, class_quests, sis_curriculum and
org_classes for one organisation; the route's role+org gate is the authorization
and the client is the admin client, as for every SIS console read.

Every many-row read goes through utils.db_fetch.fetch_all_rows: a school's
class_quests alone can pass the PostgREST cap, and a truncated read would show
a quest as unused when it is on forty sections.
"""

from typing import Any, Dict, List, Optional

from postgrest.exceptions import APIError

from repositories.base_repository import BaseRepository, DatabaseError
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger
from utils.person_name import USER_NAME_FIELDS

logger = get_logger(__name__)

_QUEST_COLUMNS = ('id, title, description, quest_type, is_public, created_at, updated_at, '
                  'created_by, xp_threshold')


class SisQuestLibraryRepository(BaseRepository):
    """Repository for the quest library's reads and its one write."""

    table_name = 'quests'
    id_column = 'id'

    # -- the list ---------------------------------------------------------

    def list_org_quests(self, org_id: str, search: Optional[str] = None,
                        limit: int = 500) -> List[Dict[str, Any]]:
        """The org's own active, unarchived quests, most recently edited first."""
        try:
            query = (self.client.table(self.table_name)
                     .select(_QUEST_COLUMNS)
                     .eq('organization_id', org_id).eq('is_active', True).is_('archived_at', 'null')
                     .order('updated_at', desc=True).limit(limit))
            if search:
                query = query.ilike('title', f'%{search}%')
            return query.execute().data or []
        except APIError as e:
            logger.error(f"Error listing org quests for {org_id}: {e}")
            raise DatabaseError("Failed to list quests") from e

    def task_rows(self, quest_ids: List[str]) -> List[Dict[str, Any]]:
        """Every template task (id, quest_id, title, order_index) for these quests.

        The title and order ride along so the library can open a quest's
        attachments per task without a second request (ticket 5a20862f).
        """
        return fetch_all_rows(lambda: self.client.table('quest_template_tasks')
                              .select('id, quest_id, title, order_index').in_('quest_id', quest_ids))

    def creators(self, user_ids: List[str]) -> List[Dict[str, Any]]:
        """Name and org role for the people who wrote these quests.

        `org_role` is what separates the office's library from a teacher's
        own work (ticket 4579be68): an advisor's quest is teacher-made,
        anyone else's is the school's.
        """
        if not user_ids:
            return []
        return fetch_all_rows(lambda: self.client.table('users')
                              .select(f'id, org_role, role, {USER_NAME_FIELDS}').in_('id', user_ids))

    def curriculum_links(self, quest_ids: List[str]) -> List[Dict[str, Any]]:
        return fetch_all_rows(lambda: self.client.table('sis_curriculum_quests')
                              .select('id, quest_id, curriculum_id').in_('quest_id', quest_ids))

    def class_links(self, quest_ids: List[str]) -> List[Dict[str, Any]]:
        return fetch_all_rows(lambda: self.client.table('class_quests')
                              .select('id, quest_id, class_id, publish_at, due_date')
                              .in_('quest_id', quest_ids))

    def org_curricula(self, org_id: str) -> List[Dict[str, Any]]:
        try:
            return fetch_all_rows(
                lambda: self.client.table('sis_curriculum').select('id, title')
                .eq('organization_id', org_id).eq('is_active', True),
                order_by='title',
            )
        except APIError as e:
            logger.error(f"Error listing curricula for {org_id}: {e}")
            raise DatabaseError("Failed to list curricula") from e

    def org_classes(self, org_id: str) -> List[Dict[str, Any]]:
        """The org's classes (org_classes), active or archived, by name.

        Paged, like every other many-row read in this module. These two were
        the exceptions -- a bare select, silently capped at the PostgREST
        limit -- and a school past the cap would have had classes missing from
        the assign picker with nothing to say so. iCreate is at 158 and was
        never truncated here; the picker's own 50-row ceiling is what hid its
        classes (2026-09-22). Fixing that one and leaving this would only have
        moved the trapdoor further down the corridor.
        """
        try:
            return fetch_all_rows(
                lambda: self.client.table('org_classes').select('id, name, status')
                .eq('organization_id', org_id),
                order_by='name',
            )
        except APIError as e:
            logger.error(f"Error listing classes for {org_id}: {e}")
            raise DatabaseError("Failed to list classes") from e

    # -- the attach -------------------------------------------------------

    def find_curriculum(self, curriculum_id: str) -> Optional[Dict[str, Any]]:
        try:
            rows = (self.client.table('sis_curriculum').select('id, organization_id, title')
                    .eq('id', curriculum_id).limit(1).execute()).data
            return rows[0] if rows else None
        except APIError as e:
            logger.error(f"Error reading curriculum {curriculum_id}: {e}")
            raise DatabaseError("Failed to read curriculum") from e

    def students_of_org(self, org_id: str, user_ids: List[str]) -> List[str]:
        """Which of these ids are accounts at this school. Bounded by the
        caller's list, so no row cap applies."""
        if not user_ids:
            return []
        try:
            rows = (self.client.table('users').select('id, organization_id')
                    .in_('id', user_ids).eq('organization_id', org_id).execute()).data or []
            return [r['id'] for r in rows]
        except APIError as e:
            logger.error(f"Error reading students for org {org_id}: {e}")
            raise DatabaseError("Failed to read students") from e

    def find_quest_for_assign(self, quest_id: str) -> Optional[Dict[str, Any]]:
        """The columns the assign rule needs: whose it is, and whether it is live."""
        try:
            rows = (self.client.table(self.table_name).select('id, organization_id, is_public, is_active')
                    .eq('id', quest_id).limit(1).execute()).data
            return rows[0] if rows else None
        except APIError as e:
            logger.error(f"Error reading quest {quest_id}: {e}")
            raise DatabaseError("Failed to read quest") from e

    def curriculum_has_quest(self, curriculum_id: str, quest_id: str) -> bool:
        try:
            rows = (self.client.table('sis_curriculum_quests').select('id')
                    .eq('curriculum_id', curriculum_id).eq('quest_id', quest_id)
                    .limit(1).execute()).data
            return bool(rows)
        except APIError as e:
            logger.error(f"Error checking curriculum {curriculum_id} for quest {quest_id}: {e}")
            raise DatabaseError("Failed to read curriculum quests") from e

    def next_sequence_order(self, curriculum_id: str) -> int:
        try:
            rows = (self.client.table('sis_curriculum_quests').select('id, sequence_order')
                    .eq('curriculum_id', curriculum_id)
                    .order('sequence_order', desc=True).limit(1).execute()).data
            return ((rows[0].get('sequence_order') or 0) + 1) if rows else 0
        except APIError as e:
            logger.error(f"Error reading order for curriculum {curriculum_id}: {e}")
            raise DatabaseError("Failed to read curriculum quests") from e

    def add_curriculum_quest(self, curriculum_id: str, quest_id: str, sequence_order: int,
                             user_id: str) -> None:
        try:
            self.client.table('sis_curriculum_quests').insert({
                'curriculum_id': curriculum_id, 'quest_id': quest_id,
                'sequence_order': sequence_order, 'added_by': user_id,
            }).execute()
        except APIError as e:
            logger.error(f"Error adding quest {quest_id} to curriculum {curriculum_id}: {e}")
            raise DatabaseError("Failed to add the quest to the curriculum") from e
