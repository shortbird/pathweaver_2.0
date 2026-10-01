"""
School thread repository - who on staff opened a school-inbox thread.

  school_thread_reads   Which staff member opened a school thread, and when.
                        direct_messages.read_at on the school's messages only
                        says that SOMEBODY in the office did (9b46c748).

Plus the two reads the family's "<Teacher> for <School>" label needs, kept here
so messaging_extras_service does not grow a direct `.table()` call
(tests/unit/test_direct_db_calls_do_not_grow.py).

school_thread_grants (a thread handed to a teacher with a task, 2026-09-23)
was read and written here until 2026-10-01. No grant was ever created and the
feature was removed; the empty table is still in the database.

Service-role only (RLS on, no policies): callers pass the admin client after
their own role and org check.
"""

from typing import Any, Dict, Iterable, List, Optional

from repositories.base_repository import BaseRepository
from utils.logger import get_logger
from utils.timestamps import now_iso

logger = get_logger(__name__)

_CHUNK = 100


def _chunks(items: List[str], size: int = _CHUNK):
    for i in range(0, len(items), size):
        yield items[i:i + size]


class SchoolThreadRepository(BaseRepository):
    table_name = 'school_thread_reads'

    # ── Who opened a school thread ────────────────────────────────────────

    def record_read(self, *, organization_id: str, user_id: str,
                    conversation_id: Optional[str] = None,
                    group_id: Optional[str] = None) -> None:
        """Upsert this person's row for the thread: first_read_at stays,
        last_read_at moves (the column default fills first_read_at on insert
        and the upsert payload does not name it)."""
        key = 'conversation_id' if conversation_id else 'group_id'
        (self.client.table('school_thread_reads').upsert({
            'organization_id': organization_id,
            'conversation_id': conversation_id,
            'group_id': group_id,
            'user_id': user_id,
            'last_read_at': now_iso(),
        }, on_conflict=f'{key},user_id').execute())

    def readers(self, *, conversation_id: Optional[str] = None,
                group_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Everyone on staff who has opened this thread, most recent first.
        Bounded by one thread, so a plain read is the whole answer."""
        query = self.client.table('school_thread_reads').select(
            'user_id, first_read_at, last_read_at')
        query = (query.eq('conversation_id', conversation_id) if conversation_id
                 else query.eq('group_id', group_id))
        return (query.order('last_read_at', desc=True).execute()).data or []

    # ── Names ─────────────────────────────────────────────────────────────

    def user_names(self, user_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
        from utils.person_name import USER_NAME_FIELDS
        ids = [u for u in dict.fromkeys(user_ids) if u]
        out: Dict[str, Dict[str, Any]] = {}
        for chunk in _chunks(ids):
            rows = (self.client.table('users').select(f'id, {USER_NAME_FIELDS}')
                    .in_('id', chunk).execute()).data or []
            out.update({r['id']: r for r in rows})
        return out

    def orgs_by_inbox_user(self, inbox_user_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
        ids = [u for u in dict.fromkeys(inbox_user_ids) if u]
        if not ids:
            return {}
        rows = (self.client.table('organizations').select('id, name, inbox_user_id')
                .in_('inbox_user_id', ids).execute()).data or []
        return {r['inbox_user_id']: r for r in rows}

    def conversation_between(self, user_a: str, user_b: str) -> Optional[Dict[str, Any]]:
        """The DM row between two people, whichever way round it was created."""
        from utils.validation.sanitizers import pgrst_uuid
        rows = (self.client.table('message_conversations').select('*')
                .or_(f'and(participant_1_id.eq.{pgrst_uuid(user_a)},participant_2_id.eq.{pgrst_uuid(user_b)}),'
                     f'and(participant_1_id.eq.{pgrst_uuid(user_b)},participant_2_id.eq.{pgrst_uuid(user_a)})')
                .limit(1).execute()).data or []
        return rows[0] if rows else None

    def message_in_thread(self, message_id: str, *, conversation_id: Optional[str] = None,
                          group_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """One message, only if it belongs to the named thread."""
        if conversation_id:
            rows = (self.client.table('direct_messages')
                    .select('id, sender_id, sent_by_user_id, message_content, created_at')
                    .eq('id', message_id).eq('conversation_id', conversation_id)
                    .limit(1).execute()).data or []
        else:
            rows = (self.client.table('group_messages')
                    .select('id, sender_id, message_content, created_at')
                    .eq('id', message_id).eq('group_id', group_id)
                    .limit(1).execute()).data or []
        return rows[0] if rows else None
