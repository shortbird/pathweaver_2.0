"""
Reads and writes for family groups (services/sis_family_groups.py).

family_groups and household_family_groups are service-role only (RLS on, no
policies), so this runs on the admin client; every caller is behind
ADMIN_ROLES with an org check, or require_superadmin. Membership grows with a
school's families, so the org-wide reads page past PostgREST's 1,000-row cap.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows


class FamilyGroupRepository(BaseRepository):
    table_name = 'family_groups'
    id_column = 'id'

    def for_org(self, organization_id: str) -> List[Dict[str, Any]]:
        return (self.client.table(self.table_name).select('id, organization_id, name, created_at')
                .eq('organization_id', organization_id).order('name').execute()).data or []

    def all_groups(self) -> List[Dict[str, Any]]:
        return fetch_all_rows(
            lambda: self.client.table(self.table_name).select('id, organization_id, name'))

    def get(self, group_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).select('id, organization_id, name')
                .eq('id', group_id).limit(1).execute()).data or []
        return rows[0] if rows else None

    def insert(self, fields: Dict[str, Any]) -> Dict[str, Any]:
        return (self.client.table(self.table_name).insert(fields).execute()).data[0]

    def rename(self, group_id: str, name: str) -> None:
        self.client.table(self.table_name).update({'name': name}).eq('id', group_id).execute()

    def remove(self, group_id: str) -> None:
        self.client.table(self.table_name).delete().eq('id', group_id).execute()

    # ------------------------------------------------------------ membership

    def memberships(self, group_ids: List[str]) -> List[Dict[str, Any]]:
        if not group_ids:
            return []
        return fetch_all_rows(
            lambda: self.client.table('household_family_groups')
            .select('id, household_id, group_id').in_('group_id', group_ids))

    def all_memberships(self) -> List[Dict[str, Any]]:
        return fetch_all_rows(
            lambda: self.client.table('household_family_groups').select('id, household_id, group_id'))

    def household_group_ids(self, household_id: str) -> List[str]:
        rows = (self.client.table('household_family_groups').select('group_id')
                .eq('household_id', household_id).execute()).data or []
        return [r['group_id'] for r in rows]

    def add(self, rows: List[Dict[str, Any]]) -> None:
        """The caller passes only groups the family is not in yet."""
        if rows:
            self.client.table('household_family_groups').insert(rows).execute()

    def drop(self, household_id: str, group_ids: List[str]) -> None:
        if group_ids:
            (self.client.table('household_family_groups').delete()
             .eq('household_id', household_id).in_('group_id', group_ids).execute())
