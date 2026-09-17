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
