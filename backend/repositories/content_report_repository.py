"""Data access for content_reports -- what users flag, and what the moderation
queue reads back. The queue (routes/admin/moderation_queue.py) still writes
status directly; this owns the reads the takedown needs.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class ContentReportRepository(BaseRepository):
    table_name = 'content_reports'

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: reports are read across every reporter
            # by the moderation queue, which is @require_admin-only.
            client = get_supabase_admin_client()
        super().__init__(client=client)

    def get(self, report_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name).select('*') \
            .eq('id', report_id).limit(1).execute().data or []
        return rows[0] if rows else None

    def count_pending(self) -> int:
        """Reports nobody has looked at. count='exact', never len(): the
        queue is unbounded and PostgREST caps a page at 1,000."""
        res = self.client.table(self.table_name).select('id', count='exact') \
            .eq('status', 'pending').limit(1).execute()
        return int(res.count or 0)

    def peer_comment_texts(self, ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """{comment_id: {text, author_id, hidden_at}} for the queue's preview."""
        if not ids:
            return {}
        rows = self.client.table('peer_comments') \
            .select('id, comment_text, author_id, hidden_at') \
            .in_('id', ids).execute().data or []
        return {r['id']: {'text': r.get('comment_text'), 'author_id': r.get('author_id'),
                          'hidden_at': r.get('hidden_at')} for r in rows}

    def message_texts(self, ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """{message_id: {text, author_id, hidden_at}} for the queue's preview.
        A soft-deleted message reads as hidden."""
        if not ids:
            return {}
        rows = self.client.table('direct_messages') \
            .select('id, message_content, sender_id, is_deleted') \
            .in_('id', ids).execute().data or []
        return {r['id']: {'text': r.get('message_content'), 'author_id': r.get('sender_id'),
                          'hidden_at': True if r.get('is_deleted') else None} for r in rows}
