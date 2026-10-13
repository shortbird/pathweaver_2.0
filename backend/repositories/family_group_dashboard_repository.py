"""
Reads and writes for a family group's dashboard (services/family_group_dashboard.py).

The tables are service-role only or belong to a school the manager is not a
member of, so this runs on the admin client; the service's require_manager is
the authorization. Reads bounded by a group's families page past PostgREST's
1,000-row cap anyway, since a group grows with the school.
"""
from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows
from utils.timestamps import now_iso


class FamilyGroupDashboardRepository(BaseRepository):
    table_name = 'family_group_managers'
    id_column = 'id'

    # ── access ──────────────────────────────────────────────────────────────

    def user_role(self, user_id: str) -> Optional[str]:
        rows = (self.client.table('users').select('role').eq('id', user_id)
                .limit(1).execute()).data or []
        return rows[0].get('role') if rows else None

    def group(self, group_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('family_groups')
                .select('id, organization_id, name, funding_source, academy_pathway')
                .eq('id', group_id).limit(1).execute()).data or []
        return rows[0] if rows else None

    def org_name(self, org_id: str) -> str:
        rows = (self.client.table('organizations').select('name').eq('id', org_id)
                .limit(1).execute()).data or []
        return (rows[0].get('name') if rows else None) or ''

    def granted_group_ids(self, user_id: str) -> List[str]:
        rows = (self.client.table(self.table_name).select('group_id')
                .eq('user_id', user_id).execute()).data or []
        return [r['group_id'] for r in rows]

    def is_granted(self, group_id: str, user_id: str) -> bool:
        return bool((self.client.table(self.table_name).select('id')
                     .eq('group_id', group_id).eq('user_id', user_id)
                     .limit(1).execute()).data)

    # ── families ────────────────────────────────────────────────────────────

    def group_household_ids(self, group_id: str) -> List[str]:
        rows = fetch_all_rows(lambda: self.client.table('household_family_groups')
                              .select('id, household_id').eq('group_id', group_id))
        return [r['household_id'] for r in rows]

    def memberships_of_users(self, user_ids: List[str]) -> List[Dict[str, Any]]:
        return fetch_all_rows(lambda: self.client.table('household_members')
                              .select('id, household_id, user_id').in_('user_id', user_ids))

    def members_of_households(self, household_ids: List[str]) -> List[Dict[str, Any]]:
        return fetch_all_rows(lambda: self.client.table('household_members')
                              .select('id, household_id, user_id, relationship')
                              .in_('household_id', household_ids))

    def users(self, user_ids: List[str]) -> List[Dict[str, Any]]:
        return fetch_all_rows(lambda: self.client.table('users')
                              .select('id, first_name, last_name, email, role, org_role, '
                                      'org_roles, organization_id, managed_by_parent_id, '
                                      'last_active, created_at')
                              .in_('id', user_ids))

    def school_standing(self, org_id: str, user_ids: List[str]) -> Dict[str, str]:
        rows = fetch_all_rows(lambda: self.client.table('school_enrollments')
                              .select('id, student_user_id, status')
                              .eq('organization_id', org_id).in_('student_user_id', user_ids))
        return {r['student_user_id']: r['status'] for r in rows}

    def academy_enrollments(self, user_ids: List[str]) -> List[Dict[str, Any]]:
        return fetch_all_rows(lambda: self.client.table('academy_enrollments')
                              .select('id, user_id, status, enrolled_at, withdrawn_at')
                              .in_('user_id', user_ids))

    # ── writes ──────────────────────────────────────────────────────────────

    def file_household(self, household_id: str, group_id: str, actor_id: str) -> None:
        self.client.table('household_family_groups').upsert(
            {'household_id': household_id, 'group_id': group_id, 'added_by': actor_id},
            on_conflict='household_id,group_id', ignore_duplicates=True).execute()

    def set_funding_source(self, household_id: str, org_id: str, funding_source: str) -> None:
        self.client.table('households').update({'funding_source': funding_source}) \
            .eq('id', household_id).eq('organization_id', org_id).execute()

    def withdraw_academy(self, user_id: str) -> None:
        self.client.table('academy_enrollments').update(
            {'status': 'withdrawn', 'withdrawn_at': now_iso(), 'updated_at': now_iso()}) \
            .eq('user_id', user_id).eq('status', 'active').execute()

    def audit(self, row: Dict[str, Any]) -> None:
        self.client.table('admin_audit_logs').insert(row).execute()
