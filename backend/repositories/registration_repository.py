"""
Registration-funnel data access (blocks P4).

The funnel's table began iCreate-only and was renamed to `registrations` on
2026-08-25 (20260825160000 expand + 20260825160100 contract); the compatibility
view is gone, so `icreate_registrations` no longer resolves at all. This
repository owns the name in ONE constant so nothing new hardcodes it.

ARCHITECTURE_BLOCKS §7 deferred that rename; main did it anyway while this
branch was parked, and the branch's references were swept to match at the
2026-09-03 merge. backend/tests/test_registration_fk_hints.py guards the
regression, including the PostgREST FK embed hint, which moved with the
constraint names.
"""



# The one place the physical table name lives.
REGISTRATIONS_TABLE = 'registrations'


from typing import Any, Dict, List, Optional  # noqa: E402

from repositories.base_repository import BaseRepository  # noqa: E402


class RegistrationRepository(BaseRepository):
    """The funnel's rows. Added 2026-09-16 for the family's own funding-source
    edit on /family/billing, which rewrites the "Form of Payment" answer on
    the registration the office already reads it from."""
    table_name = REGISTRATIONS_TABLE

    def latest_for_parents(self, organization_id: str, parent_user_ids: List[str]) -> List[Dict[str, Any]]:
        """Every registration these parents made with this org, newest first.
        Bounded by one household's guardians, so no paging."""
        if not parent_user_ids:
            return []
        resp = (
            self.client.table(self.table_name)
            .select('id, parent_user_id, answers, created_at')
            .eq('organization_id', organization_id)
            .in_('parent_user_id', parent_user_ids)
            .order('created_at', desc=True)
            .execute()
        )
        return resp.data or []

    def update_answers(self, registration_id: str, answers: Dict[str, Any]) -> None:
        self.client.table(self.table_name).update({'answers': answers}).eq('id', registration_id).execute()

    # ------------------------------------------------- CRM recovery funnels

    def org_id_for_slug(self, slug: str) -> Optional[str]:
        rows = (self.client.table('organizations').select('id')
                .eq('slug', slug).limit(1).execute()).data
        return rows[0]['id'] if rows else None

    def stalled_parents(self, organization_id: str, statuses: List[str],
                        idle_before: str, touched_after: str) -> List[Dict[str, Any]]:
        """The parents (id, email, names) of this org's registrations that sit
        in one of `statuses` and were last touched inside the window. Bounded
        by one org's open registrations over a few weeks, so no paging."""
        regs = (self.client.table(self.table_name).select('parent_user_id')
                .eq('organization_id', organization_id)
                .in_('status', statuses)
                .lte('updated_at', idle_before)
                .gte('updated_at', touched_after)
                .execute()).data or []
        parent_ids = list({r['parent_user_id'] for r in regs if r.get('parent_user_id')})
        if not parent_ids:
            return []
        return (self.client.table('users').select('id, email, first_name, last_name')
                .in_('id', parent_ids).execute()).data or []

    def latest_status_for_email(self, organization_id: str, email: str) -> Optional[str]:
        """Status of the newest registration this address's account made with
        this org, or None when there is no such account or registration."""
        users = (self.client.table('users').select('id')
                 .ilike('email', email).limit(1).execute()).data
        if not users:
            return None
        regs = (self.client.table(self.table_name).select('status')
                .eq('organization_id', organization_id)
                .eq('parent_user_id', users[0]['id'])
                .order('created_at', desc=True).limit(1).execute()).data
        return regs[0].get('status') if regs else None
