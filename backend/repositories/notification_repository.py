"""Notifications: the rows behind the bell.

NotificationService owns a person's own rows -- create, list, mark read,
delete by id. This holds the one operation keyed by something other than a
row id and a recipient: a call for help an org member takes back, which has
to remove every recipient's copy at once (iCreate, 2026-09-15, b25bfa75).

It also holds what a group chat needs from the bell (2026-10-01). A chat keeps
ONE unread row per person and counts into it, and a member can mute a chat:

  * the unread rows of one chat, read for every recipient at once, and the
    in-place update that turns "New message in Art" into "3 new messages in
    Art";
  * the mute itself, which is a `notification_preferences` row keyed
    `chat_muted:<group id>` with enabled = false. That table already means
    "this person turned this alert off", its notification_type has no CHECK,
    and (user_id, notification_type) is unique, so a mute needed no schema.
"""

from __future__ import annotations

from datetime import datetime, timezone
from functools import partial
from typing import Any, Dict, Iterable, List, Optional, Set

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows

#: The notification_preferences key of a muted chat is this plus the group id.
CHAT_MUTED_PREFIX = 'chat_muted:'

#: Ids per `in_()` filter. A UUID is 36 characters and the filter rides in the
#: URL, so a 300-member staff group in one request would not fit.
_CHUNK = 100


def chat_muted_key(group_id: str) -> str:
    return f'{CHAT_MUTED_PREFIX}{group_id}'


def _chunks(items: Iterable[str], size: int = _CHUNK):
    # Deduplicated, order kept: a person listed twice is still one filter value.
    ids = [i for i in dict.fromkeys(items) if i]
    for start in range(0, len(ids), size):
        yield ids[start:start + size]


class NotificationRepository(BaseRepository):
    table_name = 'notifications'

    def delete_help_call(self, organization_id: str, call_id: str) -> None:
        """Every bell entry one call for help produced, in one org.

        The call id was minted by the route that sent the call and nothing
        else writes `metadata.help_call_id`; the org filter is belt and
        braces so a guessed id can never reach another school's rows.
        """
        (self.client.table(self.table_name).delete()
         .eq('organization_id', organization_id)
         .contains('metadata', {'help_call_id': call_id})
         .execute())

    # ── Group chats: one unread row per chat per person ──────────────────────

    def unread_group_message_rows(self, group_id: str,
                                  user_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
        """Each recipient's newest unread bell row for one chat.

        Returns {user_id: {'id', 'count'}}; a person with nothing unread for
        the chat is absent. `count` is how many messages the row stands for --
        `metadata.count`, or 1 on a row written before rows counted.

        Only the id, the owner, the time and the count come back. The row's
        metadata carries the whole message (`full_content`), and until
        2026-10-01 a chat wrote one row per message, so a quiet member can
        hold hundreds of them for one chat: that is also why this pages
        (utils/db_fetch) rather than trusting one response to hold them all.

        One request for a chat of up to a hundred recipients. The user filter
        is what lets Postgres use idx_notifications_user_unread instead of
        walking every unread row in the table.
        """
        newest: Dict[str, Dict[str, Any]] = {}
        for chunk in _chunks(user_ids):
            rows = fetch_all_rows(partial(self._unread_group_rows_query, group_id, chunk))
            for row in rows:
                held = newest.get(row['user_id'])
                if held is None or (row.get('created_at') or '') > held['created_at']:
                    newest[row['user_id']] = {
                        'id': row['id'],
                        'count': _as_count(row.get('count')),
                        'created_at': row.get('created_at') or '',
                    }
        return {uid: {'id': r['id'], 'count': r['count']} for uid, r in newest.items()}

    def _unread_group_rows_query(self, group_id: str, user_ids: List[str]) -> Any:
        """A fresh builder per page: fetch_all_rows adds the order and range."""
        return (self.client.table(self.table_name)
                .select('id, user_id, created_at, count:metadata->count')
                .eq('type', 'message_received')
                .eq('is_read', False)
                .eq('metadata->>group_id', group_id)
                .in_('user_id', user_ids))

    def bump_group_message_rows(self, row_ids: List[str], *, title: str, message: str,
                                link: Optional[str],
                                metadata: Dict[str, Any]) -> Set[str]:
        """Rewrite unread rows in place for one more message; returns the ids written.

        `created_at` moves to now so the row sorts to the top of the bell,
        which orders by it -- the table has no updated_at.

        The `is_read = false` filter is the race guard: a person who opens the
        chat between the read above and this write has read their row, and it
        must stay read. Their id is then missing from the result, and the
        caller writes them a fresh row instead.
        """
        written: Set[str] = set()
        fields = {
            'title': title,
            'message': message,
            'link': link,
            'metadata': metadata,
            'created_at': datetime.now(timezone.utc).isoformat(),
        }
        for chunk in _chunks(row_ids):
            rows = (self.client.table(self.table_name).update(fields)
                    .in_('id', chunk)
                    .eq('is_read', False)
                    .execute()).data or []
            written.update(r['id'] for r in rows if r.get('id'))
        return written

    def mark_group_messages_read(self, user_id: str, group_id: str) -> int:
        """Mark one person's unread bell rows for one chat read; returns how many."""
        rows = (self.client.table(self.table_name)
                .update({'is_read': True})
                .eq('user_id', user_id)
                .eq('type', 'message_received')
                .eq('is_read', False)
                .eq('metadata->>group_id', group_id)
                .execute()).data
        return len(rows) if rows else 0

    # ── Group chats: mute ────────────────────────────────────────────────────

    def muted_member_ids(self, group_id: str, user_ids: Iterable[str]) -> Set[str]:
        """Who among `user_ids` has muted this chat."""
        muted: Set[str] = set()
        for chunk in _chunks(user_ids):
            rows = (self.client.table('notification_preferences')
                    .select('user_id')
                    .eq('notification_type', chat_muted_key(group_id))
                    .eq('enabled', False)
                    .in_('user_id', chunk)
                    .execute()).data or []
            muted.update(r['user_id'] for r in rows if r.get('user_id'))
        return muted

    def muted_group_ids(self, user_id: str, group_ids: Iterable[str]) -> Set[str]:
        """Which of `group_ids` this person has muted, in one request.

        Reads the person's mute rows by prefix and intersects here, rather
        than sending every group id up as a filter: a parent of three is in
        36 class chats and has muted a handful.
        """
        wanted = {g for g in group_ids if g}
        if not wanted:
            return set()
        rows = (self.client.table('notification_preferences')
                .select('notification_type')
                .eq('user_id', user_id)
                .eq('enabled', False)
                .like('notification_type', f'{CHAT_MUTED_PREFIX}%')
                .execute()).data or []
        muted = {(r.get('notification_type') or '')[len(CHAT_MUTED_PREFIX):] for r in rows}
        return muted & wanted

    def is_chat_muted(self, user_id: str, group_id: str) -> bool:
        rows = (self.client.table('notification_preferences')
                .select('enabled')
                .eq('user_id', user_id)
                .eq('notification_type', chat_muted_key(group_id))
                .limit(1)
                .execute()).data or []
        return bool(rows) and rows[0].get('enabled') is False

    def set_chat_muted(self, user_id: str, group_id: str, muted: bool) -> None:
        """Mute or unmute one chat for one person.

        Unmuting deletes the row rather than flipping it to enabled: absence
        already means "on" everywhere this table is read, and a row per chat a
        person once muted would otherwise sit in their preferences for good.
        """
        if muted:
            (self.client.table('notification_preferences').upsert(
                {'user_id': user_id,
                 'notification_type': chat_muted_key(group_id),
                 'enabled': False,
                 'updated_at': datetime.now(timezone.utc).isoformat()},
                on_conflict='user_id,notification_type').execute())
            return
        (self.client.table('notification_preferences').delete()
         .eq('user_id', user_id)
         .eq('notification_type', chat_muted_key(group_id))
         .execute())


def _as_count(value: Any) -> int:
    """`metadata.count` as a whole number of at least 1."""
    try:
        return max(int(value), 1)
    except (TypeError, ValueError):
        return 1
