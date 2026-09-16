"""Notifications: the rows behind the bell.

NotificationService owns a person's own rows -- create, list, mark read,
delete by id. This holds the one operation keyed by something other than a
row id and a recipient: a call for help an org member takes back, which has
to remove every recipient's copy at once (iCreate, 2026-09-15, b25bfa75).
"""

from __future__ import annotations

from repositories.base_repository import BaseRepository


class NotificationRepository(BaseRepository):
    table_name = 'notifications'

    def delete_help_call(self, organization_id: str, call_id: str) -> None:
        """Every bell entry one call for help produced, in one org.

        The call id was minted by the route that sent the call and nothing
        else writes `metadata.help_call_id`; the org filter is belt and
        braces so a guessed id can never reach another school's rows.
        """
        (self.client.table(self.table_name).delete()
         .eq('organization_id', organization_id)
         .contains('metadata', {'help_call_id': call_id})
         .execute())
