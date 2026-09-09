"""
Group Repository - reads behind the group-chat (class chat) unread badge.

Group messaging predates the repository pattern, so most of its data access
still sits inline in services/group_message_service.py. This repository is the
start of the other direction: the reads the Messages badge needs, owned one
layer down, so counting unread group mail does not add another direct
`.table()` call above repositories/ (backend/docs/REPOSITORY_PATTERN.md, and
the layer guard in tests/unit/test_direct_db_calls_do_not_grow.py).

Nothing here writes. Group mutation stays in the service until it is migrated
deliberately.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)


class GroupRepository(BaseRepository):
    table_name = 'group_conversations'

    def memberships_for_user(self, user_id: str) -> List[Dict[str, Any]]:
        """Every group this user belongs to, with their read marker.

        Paged: this is one row per person per group, and a teacher across a
        term's classes can pass the 1000-row response cap — where the tail
        would silently read as "not a member", quietly zeroing part of the
        badge (utils/db_fetch).
        """
        return fetch_all_rows(lambda: (
            self.client.table('group_members')
            .select('id, group_id, last_read_at')
            .eq('user_id', user_id)
        ))

    def active_groups(self, group_ids: List[str]) -> List[Dict[str, Any]]:
        """id + last_message_at for the still-active groups among `group_ids`.

        last_message_at is what lets a caller skip the per-group count query
        for a group with nothing newer than the reader's last_read_at.
        """
        if not group_ids:
            return []
        return fetch_all_rows(lambda: (
            self.client.table('group_conversations')
            .select('id, last_message_at')
            .in_('id', list(group_ids))
            .eq('is_active', True)
        ))

    def count_unread_messages(self, group_id: str, user_id: str,
                              since: Optional[str] = None) -> int:
        """Messages in `group_id` that are unread for `user_id`.

        Counted in Postgres (`count='exact'`), never by fetching rows and
        measuring the list — that is the read PostgREST truncates at 1000 with
        no signal, and a badge built on it would fall as a class got busier
        (CLAUDE.md, "Row Limits").

        `since` is the member's last_read_at; omit it for a group they have
        never opened, where everything from someone else counts.
        """
        query = self.client.table('group_messages').select(
            'id', count='exact'
        ).eq('group_id', group_id).neq(
            'sender_id', user_id
        ).eq('is_deleted', False)
        if since:
            query = query.gt('created_at', since)
        return query.execute().count or 0
