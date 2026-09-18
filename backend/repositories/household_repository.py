"""
Household Repository - SIS family/household unit data access.

Households group existing users (students + guardians) into a family unit within
a school. Writes go through this repository (new SIS code uses the repository
pattern per CLAUDE.md); cross-table roster aggregation lives in SisService.
"""

from typing import Optional, Dict, List, Any

from repositories.base_repository import BaseRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class HouseholdRepository(BaseRepository):
    table_name = 'households'

    def list_for_org(self, organization_id: str) -> List[Dict[str, Any]]:
        resp = (
            self.client.table(self.table_name)
            .select('*')
            .eq('organization_id', organization_id)
            .order('name')
            .execute()
        )
        return resp.data or []

    def create(self, organization_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
        payload = {'organization_id': organization_id, **fields}
        resp = self.client.table(self.table_name).insert(payload).execute()
        return resp.data[0] if resp.data else None

    def update(self, household_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        resp = (
            self.client.table(self.table_name)
            .update(fields)
            .eq('id', household_id)
            .execute()
        )
        return resp.data[0] if resp.data else None

    def add_member(self, household_id: str, user_id: str,
                   relationship: str = 'student',
                   is_primary_guardian: bool = False) -> Dict[str, Any]:
        rows = self.add_members([{
            'household_id': household_id,
            'user_id': user_id,
            'relationship': relationship,
            'is_primary_guardian': is_primary_guardian,
        }])
        return rows[0] if rows else None

    def add_members(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Put people in a family: the one household_members write (M16).
        Upsert on (household_id, user_id), so re-adding somebody just updates
        their relationship and a family reused by a re-registration never
        collides on an existing membership."""
        if not rows:
            return []
        resp = (
            self.client.table('household_members')
            .upsert(rows, on_conflict='household_id,user_id')
            .execute()
        )
        return resp.data or []

    def remove_member(self, household_id: str, user_id: str) -> None:
        (
            self.client.table('household_members')
            .delete()
            .eq('household_id', household_id)
            .eq('user_id', user_id)
            .execute()
        )

    def members_for_households(self, household_ids: List[str]) -> List[Dict[str, Any]]:
        if not household_ids:
            return []
        resp = (
            self.client.table('household_members')
            .select('*')
            .in_('household_id', household_ids)
            .execute()
        )
        return resp.data or []

    def for_guardian(self, user_id: str, organization_id: str) -> Optional[str]:
        """The household this adult guards at one school, if any.

        Asked by every path that creates a child outside the registration
        funnel: the family already exists, and the new child belongs in it
        rather than on the People page as a student without a family. A
        guardian membership answers it; the primary-contact pointer is the
        fallback for a household staff created and never added themselves to.

        The funnel asks the same question inline
        (routes/registration_funnel._existing_household_for_parent) so a
        returning parent never spawns a second '<Last> Family'. That copy is
        left where it is -- it runs under the funnel's own client and its tests
        pin the shape -- and this is the answer for every other caller.
        """
        rows = (
            self.client.table('household_members')
            .select('household_id, households!inner(id, organization_id)')
            .eq('user_id', user_id)
            .neq('relationship', 'student')
            .execute()
        ).data or []
        for row in rows:
            if (row.get('households') or {}).get('organization_id') == organization_id:
                return row['household_id']
        owned = (
            self.client.table(self.table_name)
            .select('id')
            .eq('organization_id', organization_id)
            .eq('primary_contact_user_id', user_id)
            .limit(1)
            .execute()
        ).data or []
        return owned[0]['id'] if owned else None
