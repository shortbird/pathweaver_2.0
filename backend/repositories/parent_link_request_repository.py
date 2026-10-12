"""Queries for parent link requests (services/parent_link_request_service.py).

The service decides; this module only reads and writes. It is built with the
admin client the service passes in, because a request joins a student and an
adult who cannot yet read each other's rows.
"""

from typing import Any, Dict, Iterable, List, Optional

from repositories.base_repository import BaseRepository

OPEN_STATUSES = ('invited', 'accepted')


class ParentLinkRequestRepository(BaseRepository):
    table_name = 'parent_link_requests'

    # -- people ------------------------------------------------------------

    def user(self, user_id: str, columns: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table('users').select(columns).eq('id', user_id).limit(1).execute().data
        return rows[0] if rows else None

    def users(self, user_ids: Iterable[str], columns: str) -> List[Dict[str, Any]]:
        ids = list(user_ids)
        if not ids:
            return []
        return self.client.table('users').select(columns).in_('id', ids).execute().data or []

    def superadmin_ids(self) -> List[str]:
        rows = self.client.table('users').select('id').eq('role', 'superadmin').execute().data or []
        return [r['id'] for r in rows]

    def approved_parent_ids(self, student_id: str) -> List[str]:
        rows = self.client.table('parent_student_links').select('parent_user_id') \
            .eq('student_user_id', student_id).eq('status', 'approved').execute().data or []
        return [r['parent_user_id'] for r in rows]

    def create_verified_link(self, parent_id: str, student_id: str, admin_id: str, notes: str) -> Any:
        return self.client.rpc('create_verified_parent_link', {
            'p_parent_id': parent_id,
            'p_student_id': student_id,
            'p_admin_id': admin_id,
            'p_notes': notes,
        }).execute().data

    # -- requests ----------------------------------------------------------

    def open_for_student(self, student_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name) \
            .select('id, parent_email, status, expires_at, created_at, accepted_at') \
            .eq('student_id', student_id).in_('status', list(OPEN_STATUSES)) \
            .limit(1).execute().data or []
        return rows[0] if rows else None

    def cancel_open(self, student_id: str) -> None:
        self.client.table(self.table_name).update({'status': 'cancelled'}) \
            .eq('student_id', student_id).in_('status', list(OPEN_STATUSES)).execute()

    def insert(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return self.client.table(self.table_name).insert(row).execute().data[0]

    def by_hash(self, code_hash: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name).select('*') \
            .eq('code_hash', code_hash).limit(1).execute().data or []
        return rows[0] if rows else None

    def by_id(self, request_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name).select('*') \
            .eq('id', request_id).limit(1).execute().data or []
        return rows[0] if rows else None

    def update_request(self, request_id: str, fields: Dict[str, Any], only_if_status: Optional[str] = None) -> List[Dict[str, Any]]:
        """Update one request. With only_if_status, the write happens only
        while the row still has that status, so two racing callers cannot
        both win; the returned list is empty for the loser."""
        query = self.client.table(self.table_name).update(fields).eq('id', request_id)
        if only_if_status:
            query = query.eq('status', only_if_status)
        return query.execute().data or []

    def waiting(self) -> List[Dict[str, Any]]:
        return self.client.table(self.table_name).select('*').eq('status', 'accepted').execute().data or []

    def created_since(self, since_iso: str) -> List[Dict[str, Any]]:
        return self.client.table(self.table_name).select('*') \
            .gte('created_at', since_iso).order('created_at', desc=True).execute().data or []
