"""
Group Repository - reads behind the group-chat unread badge and school-owned groups.

Group messaging predates the repository pattern, so most of its data access
still sits inline in services/group_message_service.py. This repository is the
start of the other direction: the reads the Messages badge needs, owned one
layer down, so counting unread group mail does not add another direct
`.table()` call above repositories/ (backend/docs/REPOSITORY_PATTERN.md, and
the layer guard in tests/unit/test_direct_db_calls_do_not_grow.py).

Nothing here writes except the rename of a class's chats
(rename_generated_chat), which the class-rename path needs, and a staff
member's admin membership of a class chat (ensure_admin_member). Other group
mutation stays in the service until it is migrated deliberately.
"""

from typing import Any, Dict, List, Optional, Tuple

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
        """id + last_message_at + created_by for the still-active groups among
        `group_ids`.

        last_message_at is what lets a caller skip the per-group count query
        for a group with nothing newer than the reader's last_read_at;
        created_by is what tells a school-owned group (get_school_groups).
        """
        if not group_ids:
            return []
        return fetch_all_rows(lambda: (
            self.client.table('group_conversations')
            .select('id, last_message_at, created_by')
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

    def group_owner_row(self, group_id: str) -> Optional[Dict[str, Any]]:
        """The fields that say who owns a group: creator, org, whether live.

        Read by school_inbox_service.school_group_access to decide whether the
        school inbox (and so the front office) may read a group as the school.
        """
        rows = (self.client.table('group_conversations')
                .select('id, name, created_by, organization_id, is_active, audience')
                .eq('id', group_id).limit(1).execute()).data or []
        return rows[0] if rows else None

    def chats_for_class(self, class_id: str) -> List[Dict[str, Any]]:
        """The class's parent and student chats (bounded by one class)."""
        return (self.client.table(self.table_name)
                .select('id, name, description, audience')
                .eq('source_class_id', class_id).execute()).data or []

    def rename_generated_chat(self, group_id: str, fields: Dict[str, Any]) -> None:
        """Write a new name/description on one class chat."""
        self.client.table(self.table_name).update(fields).eq('id', group_id).execute()

    def class_chats_page(self, organization_id: str, *, or_filter: Optional[str] = None,
                         offset: int = 0, limit: int = 50) -> Tuple[List[Dict[str, Any]], int]:
        """One page of the org's live class chats (source_class_id set), most
        recent activity first, and the total counted in Postgres
        (count='exact'), never by measuring a list (CLAUDE.md, row limits)."""
        query = (self.client.table(self.table_name)
                 .select('id, name, audience, source_class_id, last_message_at, '
                         'last_message_preview, created_at', count='exact')
                 .eq('organization_id', organization_id)
                 .eq('is_active', True)
                 .not_.is_('source_class_id', 'null'))
        if or_filter:
            query = query.or_(or_filter)
        resp = (query.order('last_message_at', desc=True, nullsfirst=False)
                .order('id').range(offset, offset + limit - 1).execute())
        rows = resp.data or []
        return rows, (resp.count if resp.count is not None else len(rows))

    def class_chat(self, group_id: str) -> Optional[Dict[str, Any]]:
        """One group with the fields a class chat opens with."""
        rows = (self.client.table(self.table_name)
                .select('id, name, audience, source_class_id, announcement_only, last_message_at')
                .eq('id', group_id).limit(1).execute()).data or []
        return rows[0] if rows else None

    def ensure_admin_member(self, group_id: str, user_id: str) -> None:
        """Insert `user_id` into the group as an admin, or promote a plain
        membership. The one write behind "staff who reach a class administer
        its chats" (class_group_sync_service.ensure_admin_member)."""
        me = (self.client.table('group_members').select('id, role')
              .eq('group_id', group_id).eq('user_id', user_id).limit(1).execute()).data
        if not me:
            self.client.table('group_members').insert({
                'group_id': group_id, 'user_id': user_id,
                'role': 'admin', 'added_by': user_id,
            }).execute()
        elif me[0].get('role') != 'admin':
            self.client.table('group_members').update({'role': 'admin'}).eq('id', me[0]['id']).execute()
