"""Teacher feedback on a student's task, as the quest page and quest cards see it.

Horizon, ticket 4ea811d6 (2026-10-07): "Teacher feedback lands in chat or the
inbox with a small badge, and students miss it. A banner or pop-up attached to
the quest itself would make sure they see it."

The feedback itself is the credit thread (credit_review_messages, one thread
per quest_task_completions row, routes/credit_messages.py). What is "new" is
not stored on the message: when a teacher posts, the student gets one
`notifications` row of type message_received with metadata.completion_id, and
that row's is_read is the only read state there is. So "unread feedback" here
means exactly that: the student's own unread message_received rows whose
completion_id belongs to the quest. The student's own replies never write such
a row for the student (they notify staff), so they can never count.

Opening the thread marks those rows read, which also clears them from the
bell: one read state, two places to see it.

Client-injected, like QuestViewRepository: the routes already hold the
service-role client their own scope checks justified.
"""

from functools import partial
from typing import Any, Dict, Iterable, List, Optional

from utils.db_fetch import fetch_all_rows

#: The notification a teacher's post on the thread writes for the student.
FEEDBACK_NOTIFICATION_TYPE = 'message_received'

#: Ids per `in_()` filter; the filter rides in the URL.
_CHUNK = 100

#: author_role values written by the family's side of the thread. Everything
#: else (advisor, org_admin, campus_coordinator, superadmin, legacy
#: 'reviewer') is a teacher speaking.
FAMILY_ROLES = frozenset({'student', 'parent'})


def _chunks(items: Iterable[str], size: int = _CHUNK):
    ids = [i for i in dict.fromkeys(items) if i]
    for start in range(0, len(ids), size):
        yield ids[start:start + size]


class TaskFeedbackRepository:

    def __init__(self, client):
        self.client = client

    # -- unread ---------------------------------------------------------------

    def _unread_query(self, user_id: str, completion_ids: Optional[List[str]] = None) -> Any:
        q = (self.client.table('notifications')
             .select('id, completion_id:metadata->>completion_id')
             .eq('user_id', user_id)
             .eq('type', FEEDBACK_NOTIFICATION_TYPE)
             .eq('is_read', False))
        if completion_ids is None:
            return q.not_.is_('metadata->>completion_id', 'null')
        return q.in_('metadata->>completion_id', completion_ids)

    def unread_by_completion(self, user_id: str,
                             completion_ids: Iterable[str]) -> Dict[str, int]:
        """{completion_id: unread feedback notifications} for these completions.

        Only `user_id`'s own rows. A completion with nothing unread is absent.
        """
        counts: Dict[str, int] = {}
        for chunk in _chunks(completion_ids):
            for row in fetch_all_rows(partial(self._unread_query, user_id, chunk)):
                cid = row.get('completion_id')
                if cid:
                    counts[cid] = counts.get(cid, 0) + 1
        return counts

    def unread_by_quest(self, user_id: str) -> Dict[str, int]:
        """{quest_id: unread feedback notifications} across all of a user's work.

        Two reads whatever the number of quests: the unread rows that carry a
        completion id, then the quest of each of those completions (only the
        user's own completions, so a stray id cannot credit another quest).
        """
        per_completion: Dict[str, int] = {}
        for row in fetch_all_rows(partial(self._unread_query, user_id, None)):
            cid = row.get('completion_id')
            if cid:
                per_completion[cid] = per_completion.get(cid, 0) + 1
        if not per_completion:
            return {}
        counts: Dict[str, int] = {}
        for chunk in _chunks(per_completion):
            rows = (self.client.table('quest_task_completions')
                    .select('id, quest_id')
                    .eq('user_id', user_id)
                    .in_('id', chunk)
                    .execute()).data or []
            for r in rows:
                qid = r.get('quest_id')
                if qid:
                    counts[qid] = counts.get(qid, 0) + per_completion.get(r['id'], 0)
        return counts

    def completion_owner(self, completion_id: str) -> Optional[str]:
        """The student whose work a completion is, or None when it does not exist."""
        rows = (self.client.table('quest_task_completions')
                .select('id, user_id')
                .eq('id', completion_id)
                .limit(1)
                .execute()).data or []
        return rows[0].get('user_id') if rows else None

    def mark_read(self, user_id: str, completion_id: str) -> int:
        """Mark `user_id`'s unread feedback rows for one completion read.

        The user filter is the whole safety of this call: it can only ever
        touch the caller's own bell. Returns how many rows it marked.
        """
        rows = (self.client.table('notifications')
                .update({'is_read': True})
                .eq('user_id', user_id)
                .eq('type', FEEDBACK_NOTIFICATION_TYPE)
                .eq('is_read', False)
                .eq('metadata->>completion_id', completion_id)
                .execute()).data or []
        return len(rows)

    # -- the notes themselves -------------------------------------------------

    def teacher_messages(self, student_id: str,
                         completion_ids: Iterable[str]) -> List[Dict[str, Any]]:
        """Every teacher-written message on these completions, newest first.

        Bounded by one student's completions on one quest. The family's own
        side of the thread (the student, a parent replying for them) is left
        out by author and by role.
        """
        out: List[Dict[str, Any]] = []
        for chunk in _chunks(completion_ids):
            rows = (self.client.table('credit_review_messages')
                    .select('id, completion_id, author_id, author_role, body, created_at')
                    .in_('completion_id', chunk)
                    .execute()).data or []
            out.extend(r for r in rows
                       if r.get('author_id') != student_id
                       and (r.get('author_role') or '') not in FAMILY_ROLES)
        out.sort(key=lambda r: r.get('created_at') or '', reverse=True)
        return out
