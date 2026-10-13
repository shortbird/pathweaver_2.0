"""Data access for group photos: one capture written into several students'
journals (learning_events + learning_event_evidence_blocks), and the reads the
capture and its parent notes need.

Authorization is the caller's. The SIS route gates on STAFF_ROLES, the
resolved org and the group_photos module; the Treehouse route on its
facilitator check. Both hand services/group_photo_service only students it has
already confirmed are in the org. Nothing here decides who may ask.
"""

from typing import Any, Dict, Iterable, List, Optional

from repositories.base_repository import BaseRepository
from utils.logger import get_logger

logger = get_logger(__name__)

_CHUNK = 100   # keeps .in_() URLs short

USER_COLUMNS = ('id, first_name, last_name, display_name, email, organization_id, '
                'role, org_role, org_roles, managed_by_parent_id')


def _chunks(ids: Iterable[str]):
    ids = [i for i in dict.fromkeys(ids) if i]
    for i in range(0, len(ids), _CHUNK):
        yield ids[i:i + _CHUNK]


class GroupPhotoRepository(BaseRepository):
    table_name = 'learning_events'

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: a staff member writes into OTHER people's
            # journals (each tagged student's learning_events) and reads their
            # guardians to notify them; none of that is the caller's own scope
            # under RLS. The route gate and the service's same-org check decide.
            client = get_supabase_admin_client()
        super().__init__(client=client)

    # -- people ---------------------------------------------------------------

    def users(self, user_ids: Iterable[str]) -> List[Dict[str, Any]]:
        """User rows by id. Bounded by the ids asked for, so no paging."""
        out: List[Dict[str, Any]] = []
        for chunk in _chunks(user_ids):
            out.extend((self.client.table('users').select(USER_COLUMNS)
                        .in_('id', chunk).execute()).data or [])
        return out

    def org_name(self, org_id: str) -> Optional[str]:
        rows = (self.client.table('organizations').select('name')
                .eq('id', org_id).limit(1).execute()).data or []
        return rows[0].get('name') if rows else None

    def disabled_for(self, user_ids: Iterable[str], notification_type: str) -> set:
        """Which of these users switched `notification_type` off. Absence of a
        row means on, as in NotificationService._is_type_enabled."""
        off = set()
        for chunk in _chunks(user_ids):
            rows = (self.client.table('notification_preferences').select('user_id, enabled')
                    .in_('user_id', chunk).eq('notification_type', notification_type)
                    .execute()).data or []
            off |= {r['user_id'] for r in rows if r.get('enabled') is False}
        return off

    def task_belongs_to(self, task_id: str, user_id: str) -> bool:
        rows = (self.client.table('user_quest_tasks').select('id')
                .eq('id', task_id).eq('user_id', user_id).limit(1).execute()).data
        return bool(rows)

    # -- the journal rows -----------------------------------------------------

    def insert_event(self, row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('learning_events').insert(row).execute()).data
        return rows[0] if rows else None

    def insert_blocks(self, rows: List[Dict[str, Any]]) -> None:
        if rows:
            self.client.table('learning_event_evidence_blocks').insert(rows).execute()

    def recent_staff_captures(self, student_ids: Iterable[str], limit: int) -> List[Dict[str, Any]]:
        """The newest staff-captured journal rows for these students. Each
        chunk is capped at `limit`, so the merged list holds the newest
        `limit` overall whatever the roster size."""
        out: List[Dict[str, Any]] = []
        for chunk in _chunks(student_ids):
            out.extend((self.client.table('learning_events')
                        .select('id, user_id, captured_by_user_id, description, event_date, created_at')
                        .in_('user_id', chunk).eq('source_type', 'advisor_captured')
                        .order('created_at', desc=True).limit(limit).execute()).data or [])
        out.sort(key=lambda r: r.get('created_at') or '', reverse=True)
        return out[:limit]

    def blocks_for(self, event_ids: Iterable[str]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for chunk in _chunks(event_ids):
            out.extend((self.client.table('learning_event_evidence_blocks')
                        .select('learning_event_id, block_type, file_url, order_index')
                        .in_('learning_event_id', chunk).order('order_index').execute()).data or [])
        return out

    # -- shared storage objects ------------------------------------------------

    def object_referenced_elsewhere(self, urls: Iterable[str], event_id: str) -> bool:
        """Whether any other evidence row still points at this storage object.

        A group photo is ONE object that every tagged student's journal block
        points at, so deleting one student's moment must not remove the file
        from under the others. Task evidence can name the same object too
        (the journal mirror of a task, routes/evidence_documents.py). `urls`
        is every spelling of the pointer worth matching (the canonical one and
        whatever the row held). Bounded: limit 1 per query.
        """
        for url in {u for u in urls if u}:
            others = (self.client.table('learning_event_evidence_blocks').select('id')
                      .eq('file_url', url).neq('learning_event_id', event_id)
                      .limit(1).execute()).data
            if others:
                return True
            docs = (self.client.table('evidence_document_blocks').select('id')
                    .eq('content->>url', url).limit(1).execute()).data
            if docs:
                return True
        return False
