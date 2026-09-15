"""Data access for the peer text screen: the screen_status columns on
peer_comments and direct_messages, the hidden_* columns a takedown writes, and
peer_text_holds.

Authorization is the caller's. Two callers: peer_text_screen_service (the
screen and its sweep) and the takedown paths (a parent hiding a comment on
their child's work, a moderator actioning a report). This owns the queries and
nothing else.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.logger import get_logger
from utils.timestamps import now_iso

logger = get_logger(__name__)

#: Why a peer comment is hidden. Read by the parent view and the feed.
HIDDEN_BY_PARENT = 'parent'
HIDDEN_BY_REPORT = 'report'
HIDDEN_BY_SCREEN = 'screen'


class PeerTextScreenRepository(BaseRepository):
    table_name = 'peer_text_holds'

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: the sweep runs from cron with no user,
            # a takedown edits another user's row, and a hold is written on
            # the author's behalf after their text was refused. None of these
            # is the caller's own scope under RLS; the services decide.
            client = get_supabase_admin_client()
        super().__init__(client=client)

    # -- holds ---------------------------------------------------------------

    def record_hold(self, *, author_id: str, recipient_id: str, surface: str,
                    text: str, reasons: List[str], stage: str,
                    source_id: Optional[str] = None,
                    model: Optional[str] = None) -> Optional[str]:
        row = {
            'author_id': author_id,
            'recipient_id': recipient_id,
            'surface': surface,
            'stage': stage,
            'source_id': source_id,
            'text': text,
            'reasons': list(reasons or []),
            'model': model,
        }
        data = self.client.table(self.table_name).insert(row).execute().data
        return data[0]['id'] if data else None

    def holds_by_author(self, author_id: str, since_iso: str) -> List[Dict[str, Any]]:
        """What this student wrote that was held, newest first. The parent
        view reads it; the author's own surfaces never do."""
        return self.client.table(self.table_name) \
            .select('id, recipient_id, surface, stage, text, reasons, created_at') \
            .eq('author_id', author_id).gte('created_at', since_iso) \
            .order('created_at', desc=True).execute().data or []

    def recent_holds(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Every hold, newest first, for the moderation queue's Holds tab --
        the place a false positive is found."""
        return self.client.table(self.table_name) \
            .select('id, author_id, recipient_id, surface, stage, text, reasons, model, created_at') \
            .order('created_at', desc=True).limit(limit).execute().data or []

    def holds_since(self, since_iso: str) -> int:
        """How many holds since `since_iso`, for the daily digest."""
        res = self.client.table(self.table_name).select('id', count='exact') \
            .gte('created_at', since_iso).limit(1).execute()
        return int(res.count or 0)

    # -- the pending backlog ---------------------------------------------------

    def pending_comments(self, limit: int) -> List[Dict[str, Any]]:
        return self.client.table('peer_comments') \
            .select('id, author_id, student_id, comment_text, created_at') \
            .eq('screen_status', 'pending') \
            .order('created_at').limit(limit).execute().data or []

    def pending_messages(self, limit: int) -> List[Dict[str, Any]]:
        return self.client.table('direct_messages') \
            .select('id, sender_id, recipient_id, message_content, conversation_id, created_at') \
            .eq('screen_status', 'pending').eq('is_deleted', False) \
            .order('created_at').limit(limit).execute().data or []

    def settle_comment(self, comment_id: str, status: str) -> None:
        self.client.table('peer_comments').update({
            'screen_status': status, 'screened_at': now_iso(),
        }).eq('id', comment_id).execute()

    def settle_message(self, message_id: str, status: str) -> None:
        self.client.table('direct_messages').update({
            'screen_status': status, 'screened_at': now_iso(),
        }).eq('id', message_id).execute()

    # -- takedowns -------------------------------------------------------------

    def comment(self, comment_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table('peer_comments') \
            .select('id, author_id, student_id, comment_text, hidden_at, hidden_by, hidden_reason') \
            .eq('id', comment_id).limit(1).execute().data or []
        return rows[0] if rows else None

    def hide_comment(self, comment_id: str, *, hidden_by: Optional[str],
                     reason: str) -> None:
        """Hide, never delete: the parent view keeps showing what was said and
        by whom, with the takedown on it. Idempotent; a second hide keeps the
        first one's reason."""
        self.client.table('peer_comments').update({
            'hidden_at': now_iso(), 'hidden_by': hidden_by, 'hidden_reason': reason,
        }).eq('id', comment_id).is_('hidden_at', 'null').execute()

    def message(self, message_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table('direct_messages') \
            .select('id, sender_id, recipient_id, conversation_id, message_content, is_deleted') \
            .eq('id', message_id).limit(1).execute().data or []
        return rows[0] if rows else None

    def hide_message(self, message_id: str) -> None:
        """A taken-down message reads as deleted, the same way the sender's own
        delete does. The row and its screen_status stay for the audit trail."""
        self.client.table('direct_messages').update({'is_deleted': True}) \
            .eq('id', message_id).execute()
