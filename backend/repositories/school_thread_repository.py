"""
School thread repository - who else may open a school-inbox thread, and who did.

Two small tables from the messaging rework (iCreate, 2026-09-23):

  school_thread_grants  A thread handed to a staff member with a task ("Make a
                        task" in the school inbox, tickets bf8b754d / d93b24d2).
                        The grant is the access; the task is the assignment.
  school_thread_reads   Which staff member opened a school thread, and when.
                        direct_messages.read_at on the school's messages only
                        says that SOMEBODY in the office did (9b46c748).

Plus the two reads the family's "<Teacher> for <School>" label needs, kept here
so messaging_extras_service does not grow a direct `.table()` call
(tests/unit/test_direct_db_calls_do_not_grow.py).

Service-role only (RLS on, no policies): callers pass the admin client after
their own role and org check.
"""

from typing import Any, Dict, Iterable, List, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger
from utils.timestamps import now_iso

logger = get_logger(__name__)

_CHUNK = 100


def _chunks(items: List[str], size: int = _CHUNK):
    for i in range(0, len(items), size):
        yield items[i:i + size]


class SchoolThreadRepository(BaseRepository):
    table_name = 'school_thread_grants'

    # ── Grants ────────────────────────────────────────────────────────────

    def create_grant(self, *, organization_id: str, user_id: str,
                     task_id: Optional[str], granted_by: Optional[str],
                     conversation_id: Optional[str] = None,
                     group_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        row = (self.client.table('school_thread_grants').insert({
            'organization_id': organization_id,
            'conversation_id': conversation_id,
            'group_id': group_id,
            'user_id': user_id,
            'task_id': task_id,
            'granted_by': granted_by,
        }).execute()).data
        return row[0] if row else None

    def unrevoked_grants(self, user_id: str, *, conversation_id: Optional[str] = None,
                         group_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """This person's not-yet-revoked grants, for one thread or (with
        neither id) every thread. Whether the task behind each is still open
        is the caller's second question (task_statuses)."""
        query = (self.client.table('school_thread_grants')
                 .select('id, organization_id, conversation_id, group_id, user_id, '
                         'task_id, granted_by, created_at')
                 .eq('user_id', user_id).is_('revoked_at', 'null'))
        if conversation_id:
            query = query.eq('conversation_id', conversation_id)
        if group_id:
            query = query.eq('group_id', group_id)
        return (query.order('created_at', desc=True).limit(200).execute()).data or []

    def task_statuses(self, task_ids: Iterable[str]) -> Dict[str, str]:
        """{task_id: status} for the tasks that still exist."""
        ids = [t for t in dict.fromkeys(task_ids) if t]
        out: Dict[str, str] = {}
        for chunk in _chunks(ids):
            rows = (self.client.table('sis_onboarding_assignments')
                    .select('id, status').in_('id', chunk).execute()).data or []
            out.update({r['id']: r.get('status') for r in rows})
        return out

    def revoke(self, grant_ids: Iterable[str]) -> int:
        ids = [g for g in dict.fromkeys(grant_ids) if g]
        if not ids:
            return 0
        revoked = 0
        for chunk in _chunks(ids):
            rows = (self.client.table('school_thread_grants')
                    .update({'revoked_at': now_iso()})
                    .in_('id', chunk).is_('revoked_at', 'null')
                    .execute()).data or []
            revoked += len(rows)
        return revoked

    def revoke_for_task(self, task_id: str) -> int:
        if not task_id:
            return 0
        rows = (self.client.table('school_thread_grants')
                .update({'revoked_at': now_iso()})
                .eq('task_id', task_id).is_('revoked_at', 'null')
                .execute()).data or []
        return len(rows)

    def grant_holders(self, org_id: str, conversation_id: str) -> List[Dict[str, Any]]:
        """The unrevoked grants on one conversation (bounded by one thread)."""
        return (self.client.table('school_thread_grants')
                .select('user_id, task_id').eq('conversation_id', conversation_id)
                .eq('organization_id', org_id).is_('revoked_at', 'null')
                .execute()).data or []

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

    def conversations(self, conversation_ids: Iterable[str]) -> List[Dict[str, Any]]:
        ids = [c for c in dict.fromkeys(conversation_ids) if c]
        out: List[Dict[str, Any]] = []
        for chunk in _chunks(ids):
            out.extend((self.client.table('message_conversations').select('*')
                        .in_('id', chunk).execute()).data or [])
        return out

    def conversation_between(self, user_a: str, user_b: str) -> Optional[Dict[str, Any]]:
        """The DM row between two people, whichever way round it was created."""
        from utils.validation.sanitizers import pgrst_uuid
        rows = (self.client.table('message_conversations').select('*')
                .or_(f'and(participant_1_id.eq.{pgrst_uuid(user_a)},participant_2_id.eq.{pgrst_uuid(user_b)}),'
                     f'and(participant_1_id.eq.{pgrst_uuid(user_b)},participant_2_id.eq.{pgrst_uuid(user_a)})')
                .limit(1).execute()).data or []
        return rows[0] if rows else None

    def groups(self, group_ids: Iterable[str]) -> List[Dict[str, Any]]:
        ids = [g for g in dict.fromkeys(group_ids) if g]
        if not ids:
            return []
        return fetch_all_rows(lambda: (
            self.client.table('group_conversations')
            .select('id, name, organization_id, created_by, is_active, audience, '
                    'last_message_at, last_message_preview, created_at')
            .in_('id', ids)
        ))

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
