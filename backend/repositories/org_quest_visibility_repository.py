"""
Org Quest Visibility Repository - which Optio-library quests a school may use.

An organization's quest_visibility_policy decides how much of the shared Optio
library (quests with organization_id NULL, is_public, is_active) its people
see and its staff may assign:

  all_optio     the whole library (the column default)
  curated       only the quests granted in organization_quest_access
  private_only  none of it; the school's own quests only

Behind services/org_quest_visibility.py, which every assign door asks. The
client is the admin client: the policy row and the grants are read for a
school whose gate the caller already passed (role + org), and the Optio
library is read across every school.
"""

from typing import Any, Dict, List, Optional, Tuple

from postgrest.exceptions import APIError

from repositories.base_repository import BaseRepository, DatabaseError
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)

_LIBRARY_COLUMNS = 'id, title, description, quest_type, image_url, header_image_url, created_at'


class OrgQuestVisibilityRepository(BaseRepository):
    """Reads and writes for one school's view of the Optio library."""

    table_name = 'organization_quest_access'
    id_column = 'id'

    def policy(self, org_id: str) -> Optional[str]:
        """The org's quest_visibility_policy, or None when the org is not found."""
        try:
            rows = (self.client.table('organizations').select('quest_visibility_policy')
                    .eq('id', org_id).limit(1).execute()).data
        except APIError as e:
            logger.error(f"Error reading quest policy for org {org_id}: {e}")
            raise DatabaseError("Failed to read the quest policy") from e
        if not rows:
            return None
        return rows[0].get('quest_visibility_policy')

    def set_policy(self, org_id: str, policy: str) -> None:
        self.client.table('organizations').update(
            {'quest_visibility_policy': policy}).eq('id', org_id).execute()

    def granted_quest_ids(self, org_id: str) -> List[str]:
        """Every quest granted to this org. Paged: a curated school holds 165."""
        rows = fetch_all_rows(lambda: self.client.table(self.table_name)
                              .select('id, quest_id').eq('organization_id', org_id))
        return [r['quest_id'] for r in rows if r.get('quest_id')]

    def library_quest_ids(self, quest_ids: List[str]) -> List[str]:
        """Which of these ids are live, public Optio-library quests."""
        if not quest_ids:
            return []
        rows = (self.client.table('quests').select('id')
                .in_('id', quest_ids).is_('organization_id', 'null')
                .eq('is_public', True).eq('is_active', True).execute()).data or []
        return [r['id'] for r in rows]

    def grant(self, org_id: str, quest_ids: List[str], granted_by: str) -> None:
        """Grant these quests; ids already granted are left as they are."""
        if not quest_ids:
            return
        held = set(self.granted_quest_ids(org_id))
        new = [q for q in quest_ids if q not in held]
        if new:
            self.client.table(self.table_name).insert([
                {'organization_id': org_id, 'quest_id': q, 'granted_by': granted_by} for q in new
            ]).execute()

    def revoke(self, org_id: str, quest_ids: List[str]) -> None:
        if not quest_ids:
            return
        (self.client.table(self.table_name).delete()
         .eq('organization_id', org_id).in_('quest_id', quest_ids).execute())

    def picker_quests(self, *, only_ids: Optional[List[str]], search: Optional[str],
                      limit: int) -> List[Dict[str, Any]]:
        """Live public Optio quests for an assign picker. `only_ids` None is
        the whole library; a list narrows to those quests."""
        query = (self.client.table('quests')
                 .select('id, title, description, quest_type, organization_id, created_by')
                 .is_('organization_id', 'null').eq('is_active', True).eq('is_public', True))
        if only_ids is not None:
            query = query.in_('id', only_ids)
        if search:
            query = query.ilike('title', f'%{search}%')
        return query.limit(limit).execute().data or []

    def library_page(self, *, search: Optional[str], quest_type: Optional[str],
                     only_ids: Optional[List[str]], exclude_ids: Optional[List[str]],
                     offset: int, limit: int) -> Tuple[List[Dict[str, Any]], int]:
        """(rows, total) for one page of the live public Optio library.

        `only_ids` narrows to those quests (the granted ones); `exclude_ids`
        leaves them out (the ones not granted). count='exact' so the total is
        right past the PostgREST cap.
        """
        query = (self.client.table('quests').select(_LIBRARY_COLUMNS, count='exact')
                 .is_('organization_id', 'null').eq('is_public', True).eq('is_active', True)
                 .is_('archived_at', 'null'))
        if search:
            query = query.ilike('title', f'%{search}%')
        if quest_type:
            query = query.eq('quest_type', quest_type)
        if only_ids is not None:
            if not only_ids:
                return [], 0
            query = query.in_('id', only_ids)
        if exclude_ids:
            query = query.not_.in_('id', exclude_ids)
        try:
            res = query.order('title').range(offset, offset + limit - 1).execute()
        except APIError as e:
            logger.error(f"Error listing the Optio library: {e}")
            raise DatabaseError("Failed to list the Optio library") from e
        return res.data or [], res.count or 0
