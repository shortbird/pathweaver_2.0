"""
Message email relay repository - the reads and writes behind "Email this to me".

  message_email_relays
      One row per (superadmin, other party) pair. The token is the local part
      of the reply+<token>@INBOUND_EMAIL_DOMAIN address on the emailed copy; a
      reply to it is posted back into the Optio thread
      (services/message_email_relay_service.py).

  users / direct_messages
      The three reads POST /api/messages/<id>/email-to-me makes to authorize a
      send: the caller's role and email, the message, and the far side of the
      thread.

Service-role only. A relay token is a write capability into a superadmin's
messages, and the inbound webhook runs with no user session at all.

Removed with the feature on 2026-10-01 and restored on 2026-10-05 (ticket
fc21a562). The queries moved here from the route and the service on the way
back, so the restore did not raise the routes/ + services/ ceiling.
"""

from typing import Any, Dict, Optional

from repositories.base_repository import BaseRepository


class MessageEmailRelayRepository(BaseRepository):
    table_name = 'message_email_relays'

    # ── Relays ────────────────────────────────────────────────────────────

    def find_for_pair(self, owner_id: str, recipient_id: str,
                      organization_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """The relay for this pair. `organization_id` set is the school inbox
        relay that speaks for that school; None is the personal one."""
        query = (self.client.table('message_email_relays')
                 .select('*')
                 .eq('owner_id', owner_id)
                 .eq('recipient_id', recipient_id))
        query = (query.eq('organization_id', organization_id) if organization_id
                 else query.is_('organization_id', 'null'))
        rows = query.limit(1).execute().data
        return rows[0] if rows else None

    def find_by_token(self, token: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('message_email_relays')
                .select('*').eq('token', token).limit(1).execute()).data
        return rows[0] if rows else None

    def insert_relay(self, fields: Dict[str, Any]) -> Dict[str, Any]:
        return (self.client.table('message_email_relays')
                .insert(fields).execute()).data[0]

    def update_relay(self, relay_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('message_email_relays')
                .update(fields).eq('id', relay_id).execute()).data
        return rows[0] if rows else None

    # ── Reads that authorize an email-to-me send ──────────────────────────

    def get_caller(self, user_id: str) -> Optional[Dict[str, Any]]:
        """The caller's role columns and email, for the superadmin check."""
        return (self.client.table('users')
                .select('id, email, role, org_role, organization_id')
                .eq('id', user_id).single().execute()).data

    def get_message(self, message_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('direct_messages').select('*')
                .eq('id', message_id).limit(1).execute()).data
        return rows[0] if rows else None

    def get_person(self, user_id: str) -> Optional[Dict[str, Any]]:
        """The name columns of the far side of the thread."""
        rows = (self.client.table('users')
                .select('id, display_name, first_name, last_name')
                .eq('id', user_id).limit(1).execute()).data
        return rows[0] if rows else None

    def get_people_with_email(self, user_ids) -> list:
        """Names and email of each id, for the school inbox alert emails."""
        ids = [i for i in dict.fromkeys(user_ids) if i]
        if not ids:
            return []
        return (self.client.table('users')
                .select('id, email, display_name, first_name, last_name')
                .in_('id', ids).execute()).data or []
