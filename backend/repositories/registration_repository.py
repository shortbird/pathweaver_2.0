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

from typing import Any, Dict, Optional

from database import get_supabase_admin_client
from repositories.base_repository import BaseRepository

# The one place the physical table name lives.
REGISTRATIONS_TABLE = 'registrations'


class RegistrationRepository(BaseRepository):
    """Family registration-funnel records."""

    table_name = REGISTRATIONS_TABLE

    @property
    def admin_client(self):
        # admin client justified: funnel rows are written on families' behalf by
        # token-authorized funnel routes and finance-gated staff routes; every
        # caller authorizes before reaching the repository.
        return get_supabase_admin_client()

    def complete_registration(self, registration_id: str,
                              payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Apply a completion payload to one registration row."""
        response = self.admin_client.table(REGISTRATIONS_TABLE) \
            .update(payload).eq('id', registration_id).execute()
        return response.data[0] if response.data else None
