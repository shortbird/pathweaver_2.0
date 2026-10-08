"""
Reads and writes for the email lists at /admin/crm/lists
(services/crm_email_lists.py, routes/admin/crm_lists.py).

The directory reads span every org, so each goes through fetch_all_rows: the
user table alone is past PostgREST's 1,000-row cap. crm_email_lists is
service-role only (RLS on, no policies), so this runs on the admin client;
every caller is behind require_superadmin.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows
from utils.timestamps import now_iso

USER_COLUMNS = ('id, first_name, last_name, display_name, email, role, org_role, '
                'org_roles, organization_id, is_org_admin, last_active, '
                'created_at, deletion_status')


class CrmEmailListRepository(BaseRepository):
    table_name = 'crm_email_lists'
    id_column = 'id'

    # ------------------------------------------------------------ directory

    def all_users(self) -> List[Dict[str, Any]]:
        return fetch_all_rows(lambda: self.client.table('users').select(USER_COLUMNS))

    def active_enrollments(self) -> List[Dict[str, Any]]:
        return fetch_all_rows(
            lambda: self.client.table('class_enrollments')
            .select('id, class_id, student_id').eq('status', 'active'))

    def all_classes(self) -> List[Dict[str, Any]]:
        return fetch_all_rows(
            lambda: self.client.table('org_classes').select('id, name, organization_id, status'))

    def all_organizations(self) -> List[Dict[str, Any]]:
        return fetch_all_rows(lambda: self.client.table('organizations').select('id, name'))

    def suppressed_emails(self) -> set:
        rows = fetch_all_rows(lambda: self.client.table('crm_suppressions').select('id, email'))
        return {(r.get('email') or '').lower() for r in rows}

    # ---------------------------------------------------------- saved lists

    def list_all(self) -> List[Dict[str, Any]]:
        return (self.client.table(self.table_name).select('*')
                .order('name').execute()).data or []

    def create_list(self, fields: Dict[str, Any]) -> Dict[str, Any]:
        return (self.client.table(self.table_name).insert(fields).execute()).data[0]

    def update_list(self, list_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name)
                .update({**fields, 'updated_at': now_iso()})
                .eq('id', list_id).execute()).data or []
        return rows[0] if rows else None

    def delete_list(self, list_id: str) -> None:
        self.client.table(self.table_name).delete().eq('id', list_id).execute()
