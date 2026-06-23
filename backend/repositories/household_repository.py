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
        # upsert so re-adding the same member just updates the relationship
        resp = (
            self.client.table('household_members')
            .upsert({
                'household_id': household_id,
                'user_id': user_id,
                'relationship': relationship,
                'is_primary_guardian': is_primary_guardian,
            }, on_conflict='household_id,user_id')
            .execute()
        )
        return resp.data[0] if resp.data else None

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
