"""Queries for an account's place in a school: its sign-in and its membership.

Two services decide; this module only reads and writes:

  services/student_sign_in_service.py   staff give a parent-managed child
                                        profile a username (ticket cd61587c)
  services/org_membership_service.py    an existing account joins a school,
                                        directly (superadmin add) or through a
                                        connect request the owner accepts
                                        (ticket af8469aa)

Built with the admin client the caller passes in: both touch accounts the
caller cannot read under RLS (a child with no session, a platform account
outside the caller's school). Every entry point is gated before it gets here.
"""

from typing import Any, Dict, Iterable, List, Optional, Set

from repositories.base_repository import BaseRepository

CONNECT_TYPE = 'connect'


class OrgAccountRepository(BaseRepository):
    table_name = 'users'

    # -- people ------------------------------------------------------------

    def user(self, user_id: str, columns: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('users').select(columns)
                .eq('id', user_id).limit(1).execute()).data or []
        return rows[0] if rows else None

    def users(self, user_ids: Iterable[str], columns: str) -> List[Dict[str, Any]]:
        ids = [i for i in user_ids if i]
        if not ids:
            return []
        return (self.client.table('users').select(columns).in_('id', ids).execute()).data or []

    def by_email(self, email: str, columns: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('users').select(columns)
                .eq('email', email).limit(1).execute()).data or []
        return rows[0] if rows else None

    def approved_parent_ids(self, student_id: str) -> List[str]:
        rows = (self.client.table('parent_student_links').select('parent_user_id')
                .eq('student_user_id', student_id).eq('status', 'approved').execute()).data or []
        return [r['parent_user_id'] for r in rows]

    def update_user(self, user_id: str, fields: Dict[str, Any]) -> List[Dict[str, Any]]:
        return (self.client.table('users').update(fields).eq('id', user_id).execute()).data or []

    # -- sign-in -----------------------------------------------------------

    def org_usernames(self, org_id: str) -> Set[str]:
        """Every username already used in the school, lowercased. Paged: it is
        every account in the school."""
        from utils.db_fetch import fetch_all_rows
        rows = fetch_all_rows(lambda: (
            self.client.table('users').select('id, username')
            .eq('organization_id', org_id)
            .not_.is_('username', 'null')
        ))
        return {(r.get('username') or '').lower() for r in rows if r.get('username')}

    def claim_username(self, user_id: str, org_id: str, username: str) -> bool:
        """Set the username only while the account has none, so two staff
        clicking at once cannot both set it up."""
        rows = (self.client.table('users').update({'username': username})
                .eq('id', user_id).eq('organization_id', org_id)
                .is_('username', 'null').execute()).data
        return bool(rows)

    def release_username(self, user_id: str) -> None:
        self.client.table('users').update({'username': None}).eq('id', user_id).execute()

    def org(self, org_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('organizations').select('id, name, slug')
                .eq('id', org_id).limit(1).execute()).data or []
        return rows[0] if rows else None

    # -- connect requests (rows in org_invitations) ------------------------

    def insert_invitation(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return (self.client.table('org_invitations').insert(row).execute()).data[0]

    def pending_invitations_for(self, org_id: str, email: str) -> List[Dict[str, Any]]:
        return (self.client.table('org_invitations').select('id, metadata')
                .eq('organization_id', org_id).eq('email', email)
                .eq('status', 'pending').execute()).data or []

    def invitation_by_code(self, code: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('org_invitations').select('*')
                .eq('invitation_code', code).limit(1).execute()).data or []
        return rows[0] if rows else None

    def set_invitation_status(self, invitation_id: str, fields: Dict[str, Any],
                              only_if_status: Optional[str] = None) -> bool:
        query = self.client.table('org_invitations').update(fields).eq('id', invitation_id)
        if only_if_status:
            query = query.eq('status', only_if_status)
        return bool((query.execute()).data)
