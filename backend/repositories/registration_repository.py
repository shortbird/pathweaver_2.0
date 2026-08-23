"""
Registration-funnel data access (blocks P4).

The funnel's table is still physically named `icreate_registrations` — it began
iCreate-only, and renaming a live table with an active funnel, RLS policies
and FKs buys nothing (ARCHITECTURE_BLOCKS §7). This repository owns the name
in ONE constant so nothing new hardcodes it; the ~38 legacy references migrate
here opportunistically as their call sites get touched.
"""

from typing import Any, Dict, Optional

from database import get_supabase_admin_client
from repositories.base_repository import BaseRepository

# The one place the physical table name lives.
REGISTRATIONS_TABLE = 'icreate_registrations'


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
