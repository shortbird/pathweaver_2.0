"""Data access for school setup links (school_onboarding_links).

A link is single-use: Optio staff make one, a school operator opens it, signs
up, and submits the setup form, which creates their organization. The row keeps
the form's answers for staff to read afterwards.

Authorization is the caller's: routes/school_onboarding.py gates every route
(superadmin to make and list links; a signed-in user holding an open token to
submit). Nothing here decides who may ask.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.timestamps import now_iso

LINK_COLUMNS = ('id, token, school_name_hint, contact_email, note, created_by, created_at, '
                'expires_at, revoked_at, used_at, used_by, organization_id, answers')


class SchoolOnboardingRepository(BaseRepository):
    table_name = 'school_onboarding_links'

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: school_onboarding_links is RLS deny-all
            # (service role only), and the submit creates an organization and
            # changes the submitter's own users row to org_admin of it, which
            # no user-scoped policy allows. The route gate decides who asks.
            client = get_supabase_admin_client()
        super().__init__(client=client)

    def create_link(self, row: Dict[str, Any]) -> Dict[str, Any]:
        result = self.client.table(self.table_name).insert(row).execute()
        return result.data[0]

    def by_token(self, token: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name).select(LINK_COLUMNS) \
            .eq('token', token).limit(1).execute().data or []
        return rows[0] if rows else None

    def by_id(self, link_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name).select(LINK_COLUMNS) \
            .eq('id', link_id).limit(1).execute().data or []
        return rows[0] if rows else None

    def recent(self, limit: int = 100) -> List[Dict[str, Any]]:
        """The newest links first. Capped: this is a staff list of recent
        invitations, not a report, and old used links stay on their org."""
        return self.client.table(self.table_name).select(LINK_COLUMNS) \
            .order('created_at', desc=True).limit(limit).execute().data or []

    def revoke(self, link_id: str) -> None:
        self.client.table(self.table_name).update({'revoked_at': now_iso()}) \
            .eq('id', link_id).execute()

    def claim(self, link_id: str, user_id: str) -> bool:
        """Mark the link used by `user_id`, only if nobody has yet. Returns
        False when another submit got there first (a double click, or the link
        forwarded to a colleague who submitted at the same moment)."""
        result = self.client.table(self.table_name) \
            .update({'used_at': now_iso(), 'used_by': user_id}) \
            .eq('id', link_id).is_('used_at', 'null').execute()
        return bool(result.data)

    def release(self, link_id: str) -> None:
        """Undo a claim whose org could not be created, so the operator can
        try again with the same link."""
        self.client.table(self.table_name) \
            .update({'used_at': None, 'used_by': None}).eq('id', link_id).execute()

    def finish(self, link_id: str, organization_id: str, answers: Dict[str, Any]) -> None:
        self.client.table(self.table_name) \
            .update({'organization_id': organization_id, 'answers': answers}) \
            .eq('id', link_id).execute()

    # --- the submitter ------------------------------------------------------

    def user(self, user_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table('users') \
            .select('id, email, first_name, last_name, role, org_role, org_roles, organization_id, '
                    'phone_number, phone_verified_at') \
            .eq('id', user_id).limit(1).execute().data or []
        return rows[0] if rows else None

    def make_org_admin(self, user_id: str, organization_id: str, org_roles: List[str]) -> None:
        """The org-member shape: role='org_managed', the real role in
        org_role/org_roles. users.is_org_admin is derived by a trigger."""
        self.client.table('users').update({
            'organization_id': organization_id,
            'role': 'org_managed',
            'org_role': 'org_admin',
            'org_roles': org_roles,
        }).eq('id', user_id).execute()

    def slug_taken(self, slug: str) -> bool:
        """Any org, archived ones included: a slug is a login URL, and an
        archived org can be restored."""
        rows = self.client.table('organizations').select('id') \
            .eq('slug', slug).limit(1).execute().data or []
        return bool(rows)
