"""Data access for the nightly conversation review (conversation_reviews),
and the reads it needs across message_conversations, group_conversations,
direct_messages, group_messages and users. The service decides what to
review and what a verdict means; this owns the queries.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class ConversationReviewRepository(BaseRepository):
    table_name = 'conversation_reviews'

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: the review runs from cron with no user
            # and reads threads that belong to other people by design.
            client = get_supabase_admin_client()
        super().__init__(client=client)

    # -- which threads ---------------------------------------------------------

    def dm_threads_since(self, since_iso: str, limit: int) -> List[Dict[str, Any]]:
        rows = self.client.table('message_conversations') \
            .select('id, participant_1_id, participant_2_id, last_message_at') \
            .gte('last_message_at', since_iso) \
            .order('last_message_at', desc=True).limit(limit).execute().data or []
        return [{'kind': 'dm', 'id': r['id'],
                 'participant_ids': [r['participant_1_id'], r['participant_2_id']],
                 'last_message_at': r.get('last_message_at')} for r in rows]

    def group_threads_since(self, since_iso: str, limit: int) -> List[Dict[str, Any]]:
        rows = self.client.table('group_conversations') \
            .select('id, name, audience, last_message_at') \
            .eq('audience', 'student').eq('is_active', True) \
            .gte('last_message_at', since_iso) \
            .order('last_message_at', desc=True).limit(limit).execute().data or []
        return [{'kind': 'group', 'id': r['id'], 'name': r.get('name'),
                 'audience': r.get('audience'), 'participant_ids': [],
                 'last_message_at': r.get('last_message_at')} for r in rows]

    def roles_for(self, user_ids: List[str]) -> Dict[str, str]:
        from utils.roles import get_effective_role
        ids = [u for u in set(user_ids) if u]
        if not ids:
            return {}
        rows = self.client.table('users').select('id, role, org_role') \
            .in_('id', ids).execute().data or []
        return {r['id']: get_effective_role(r) for r in rows}

    def names_for(self, user_ids: List[str]) -> Dict[str, str]:
        ids = [u for u in set(user_ids) if u]
        if not ids:
            return {}
        rows = self.client.table('users').select('id, first_name, display_name') \
            .in_('id', ids).execute().data or []
        return {r['id']: (r.get('first_name') or r.get('display_name') or 'someone') for r in rows}

    def is_parent_of(self, adult_id: str, student_id: str) -> bool:
        from utils import portfolio_access as pa
        try:
            return pa.is_parent_of(adult_id, student_id)
        except Exception as e:  # noqa: BLE001
            logger.warning('[conversation-review] parent check failed (reviewing): %s', e)
            return False

    # -- what was already done -------------------------------------------------

    def reviewed_through(self, kind: str, thread_id: str, last_message_at: Optional[str]) -> bool:
        """A review whose window already covers the thread's latest message."""
        if not last_message_at:
            return False
        rows = self.client.table(self.table_name).select('id') \
            .eq('thread_kind', kind).eq('thread_id', thread_id) \
            .gte('window_end', last_message_at).limit(1).execute().data or []
        return bool(rows)

    def flagged_recently(self, kind: str, thread_id: str, since_iso: str) -> bool:
        rows = self.client.table(self.table_name).select('id') \
            .eq('thread_kind', kind).eq('thread_id', thread_id) \
            .eq('verdict', 'flagged').eq('reported', True) \
            .gte('created_at', since_iso).limit(1).execute().data or []
        return bool(rows)

    # -- the transcript --------------------------------------------------------

    def messages(self, kind: str, thread_id: str, limit: int) -> List[Dict[str, Any]]:
        """The latest `limit` messages, oldest first."""
        if kind == 'group':
            rows = self.client.table('group_messages') \
                .select('id, sender_id, message_content, attachments, created_at') \
                .eq('group_id', thread_id).eq('is_deleted', False) \
                .order('created_at', desc=True).limit(limit).execute().data or []
        else:
            rows = self.client.table('direct_messages') \
                .select('id, sender_id, message_content, attachments, created_at') \
                .eq('conversation_id', thread_id).eq('is_deleted', False) \
                .order('created_at', desc=True).limit(limit).execute().data or []
        return list(reversed(rows))

    # -- the outcome -----------------------------------------------------------

    def record(self, *, kind: str, thread_id: str, window_end: Optional[str],
               message_count: int, verdict: str, risk: str, reasons: List[str],
               model: Optional[str], reported: bool) -> Optional[str]:
        data = self.client.table(self.table_name).insert({
            'thread_kind': kind, 'thread_id': thread_id, 'window_end': window_end,
            'message_count': message_count, 'verdict': verdict, 'risk': risk,
            'reasons': list(reasons or []), 'model': model, 'reported': reported,
        }).execute().data
        return data[0]['id'] if data else None

    def file_report(self, *, target_type: str, target_id: str, notes: str) -> Optional[str]:
        """A pending report with no reporter: the review is the reporter."""
        data = self.client.table('content_reports').insert({
            'reporter_id': None, 'target_type': target_type, 'target_id': target_id,
            'reason': 'safety_review', 'notes': notes, 'status': 'pending',
        }).execute().data
        return data[0]['id'] if data else None

    def stats_since(self, since_iso: str) -> Dict[str, int]:
        """{reviewed, flagged} for the tracker."""
        total = self.client.table(self.table_name).select('id', count='exact') \
            .gte('created_at', since_iso).limit(1).execute()
        flagged = self.client.table(self.table_name).select('id', count='exact') \
            .gte('created_at', since_iso).eq('verdict', 'flagged').eq('reported', True) \
            .limit(1).execute()
        return {'reviewed': int(total.count or 0), 'flagged': int(flagged.count or 0)}
