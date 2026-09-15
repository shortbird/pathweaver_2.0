"""Data access for the per-child Friends policy and its consent record.

Two tables, one owner: `peer_policies` (the policy) and the `peer_friends` rows
of `parental_consent_log` (the consent that backs an enabled policy). Every
read here is cross-user by nature -- a parent reading a child's row, a service
resolving a stranger's policy before letting a request through -- so the
client is the admin client, and the AUTHORIZATION lives in the caller
(services/peer_policy_service decides who may set what; the routes declare
the relationship). Nothing here decides anything.
"""

from typing import Any, Dict, Iterable, Optional

from repositories.base_repository import BaseRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class PeerPolicyRepository(BaseRepository):
    table_name = 'peer_policies'
    id_column = 'student_id'

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: a child's policy is read on behalf of other
            # students (is this stranger open to requests?) and written by a
            # parent about a child; neither is the caller's own row under RLS.
            # The relationship checks that authorize each call live in the
            # service, before the repository is reached.
            client = get_supabase_admin_client()
        super().__init__(client=client)

    # -- policies ------------------------------------------------------------

    def get(self, student_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name).select('*') \
            .eq('student_id', student_id).limit(1).execute().data or []
        return rows[0] if rows else None

    def get_many(self, student_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
        """{student_id: row} for the ids that have a row. Bounded by the
        caller's list, so no truncation concern here."""
        ids = [s for s in set(student_ids or []) if s]
        if not ids:
            return {}
        rows = self.client.table(self.table_name).select('*') \
            .in_('student_id', ids).execute().data or []
        return {r['student_id']: r for r in rows}

    def upsert(self, row: Dict[str, Any]) -> Dict[str, Any]:
        data = self.client.table(self.table_name) \
            .upsert(row, on_conflict='student_id').execute().data
        return data[0] if data else row

    # -- the consent record --------------------------------------------------

    def write_consent(self, row: Dict[str, Any]) -> Optional[str]:
        """Insert one parental_consent_log row; returns its id."""
        data = self.client.table('parental_consent_log').insert(row).execute().data
        return data[0]['id'] if data else None

    # -- the people a policy is about ---------------------------------------

    def user_row(self, user_id: str, columns: str) -> Optional[Dict[str, Any]]:
        if not user_id:
            return None
        rows = self.client.table('users').select(columns) \
            .eq('id', user_id).limit(1).execute().data or []
        return rows[0] if rows else None

    def users_by_ids(self, user_ids: Iterable[str], columns: str) -> Dict[str, Dict[str, Any]]:
        ids = [u for u in set(user_ids or []) if u]
        if not ids:
            return {}
        rows = self.client.table('users').select(columns) \
            .in_('id', ids).execute().data or []
        return {r['id']: r for r in rows}
