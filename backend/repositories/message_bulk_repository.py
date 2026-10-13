"""
Message bulk repository - many DMs or group messages changed at once.

A Compose send to a whole school is one DM per person (334 at iCreate on
2026-10-13). Editing or deleting it for everyone has to read and write those
copies in chunks, not one request per copy. messaging_extras_service.bulk_edit
and bulk_soft_delete own the rules; this owns the queries.

Service-role only; the caller has already checked that the actor wrote the send.
"""

from typing import Any, Dict, List

from repositories.base_repository import BaseRepository

_CHUNK = 100

_TABLES = {
    'dm': ('direct_messages', 'message_conversations', 'conversation_id'),
    'group': ('group_messages', 'group_conversations', 'group_id'),
}


def _chunks(items: List[str]):
    for i in range(0, len(items), _CHUNK):
        yield items[i:i + _CHUNK]


class MessageBulkRepository(BaseRepository):
    table_name = 'direct_messages'

    def live_rows(self, message_type: str, message_ids: List[str]) -> List[Dict[str, Any]]:
        """The messages among `message_ids` that are not deleted."""
        table, _conv, scope = _TABLES[message_type]
        out: List[Dict[str, Any]] = []
        for part in _chunks([m for m in dict.fromkeys(message_ids) if m]):
            out.extend((self.client.table(table)
                        .select(f'id, {scope}, created_at, attachments, sender_id')
                        .in_('id', part).eq('is_deleted', False)
                        .execute()).data or [])
        return out

    def update_messages(self, message_type: str, ids: List[str], fields: Dict[str, Any]) -> None:
        table, _conv, _scope = _TABLES[message_type]
        for part in _chunks(ids):
            self.client.table(table).update(fields).in_('id', part).execute()

    def thread_last_message_at(self, message_type: str, thread_ids: List[str]) -> Dict[str, Any]:
        """{thread_id: last_message_at} for these conversations or groups."""
        _table, conv, _scope = _TABLES[message_type]
        out: Dict[str, Any] = {}
        for part in _chunks(thread_ids):
            for c in (self.client.table(conv).select('id, last_message_at')
                      .in_('id', part).execute()).data or []:
                out[c['id']] = c.get('last_message_at')
        return out

    def unpin(self, group_ids: List[str], message_ids: List[str]) -> None:
        """Clear a group's pin when it points at one of these messages."""
        for gid in group_ids:
            self.client.table('group_conversations').update({'pinned_message_id': None}) \
                .eq('id', gid).in_('pinned_message_id', message_ids).execute()
