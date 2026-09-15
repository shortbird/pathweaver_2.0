"""Data access for peer_reactions -- a friend's encouragement on one item.

Authorization is the caller's (peer_connection_service checks is_peer_of and
the owner's friends_can before reaching here). This owns the reads and writes
and nothing else. Counts are per reaction KEY, never a total: the palette is
encouragement, not a score (core_philosophy.md).
"""

from typing import Any, Dict, Iterable, List, Optional

from repositories.base_repository import BaseRepository
from utils.logger import get_logger
from utils.timestamps import now_iso
from utils.validation.sanitizers import pgrst_uuid

logger = get_logger(__name__)

TARGET_COLUMNS = ('task_completion_id', 'learning_event_id', 'quest_id')


class PeerReactionRepository(BaseRepository):
    table_name = 'peer_reactions'

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: a reaction is one student's row about
            # another student's work, and the feed reads every friend's
            # reactions on a page of items -- neither is the caller's own
            # scope under RLS. The peer gate in the service decides.
            client = get_supabase_admin_client()
        super().__init__(client=client)

    @staticmethod
    def _target(target: Dict[str, Optional[str]]) -> Dict[str, Optional[str]]:
        """The three target columns, exactly one set."""
        return {col: target.get(col) for col in TARGET_COLUMNS}

    def set(self, author_id: str, student_id: str, reaction: str,
            target: Dict[str, Optional[str]]) -> Dict[str, Any]:
        """Upsert this author's reaction on one item (replaces a different key)."""
        row = {
            'author_id': author_id,
            'student_id': student_id,
            'reaction': reaction,
            'updated_at': now_iso(),
            **self._target(target),
        }
        data = self.client.table(self.table_name) \
            .upsert(row, on_conflict='author_id,target_key').execute().data
        return data[0] if data else row

    def clear(self, author_id: str, target: Dict[str, Optional[str]]) -> None:
        query = self.client.table(self.table_name).delete().eq('author_id', author_id)
        for col, value in self._target(target).items():
            if value:
                query = query.eq(col, value)
        query.execute()

    def for_targets(self, completion_ids: Iterable[str], learning_event_ids: Iterable[str],
                    viewer_id: Optional[str]) -> Dict[str, Dict[str, Any]]:
        """{target_id: {'by_key': {key: count}, 'mine': key | None}} for a page of
        feed items. Bounded by the page, so no truncation concern."""
        out: Dict[str, Dict[str, Any]] = {}
        for col, ids in (('task_completion_id', list(completion_ids or [])),
                         ('learning_event_id', list(learning_event_ids or []))):
            ids = [i for i in ids if i]
            if not ids:
                continue
            rows = self.client.table(self.table_name) \
                .select(f'{col}, reaction, author_id') \
                .in_(col, ids).execute().data or []
            for r in rows:
                target_id = r.get(col)
                if not target_id:
                    continue
                slot = out.setdefault(target_id, {'by_key': {}, 'mine': None})
                key = r.get('reaction')
                slot['by_key'][key] = slot['by_key'].get(key, 0) + 1
                if viewer_id and r.get('author_id') == viewer_id:
                    slot['mine'] = key
        return out

    def involving(self, student_id: str, since_iso: str) -> List[Dict[str, Any]]:
        """Reactions this student gave or received since `since_iso`, for the
        parent's activity view."""
        return self.client.table(self.table_name) \
            .select('id, author_id, student_id, reaction, created_at, '
                    'task_completion_id, learning_event_id, quest_id') \
            .or_(f'author_id.eq.{pgrst_uuid(student_id, "student_id")},'
                 f'student_id.eq.{pgrst_uuid(student_id, "student_id")}') \
            .gte('created_at', since_iso) \
            .order('created_at', desc=True).execute().data or []
