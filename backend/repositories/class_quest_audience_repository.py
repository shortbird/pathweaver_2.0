"""
Who a class quest is for, and the enrollments that follow from it.

The data access behind services/class_quest_enrollment's audience half:
reading a class's quest links with their `student_ids`, changing that column,
and the four tables consulted before a quest is taken back out of a student's
account (their enrollment, its tasks, and whether any task has a completion or
an evidence document behind it).

Client-injected rather than self-acquiring, like SisClassRepository: every
caller already holds the service-role client that the moderator gate above it
justified, and the enrollment service's tests hand in a fake.

Every list read here is bounded by ids the caller already holds and is chunked
so a large class never crosses PostgREST's 1000-row cap silently (CLAUDE.md,
Row Limits). The one org-wide read, due_links, is bounded by the small number
of scheduled quests whose time has come.
"""

from typing import Any, Dict, Iterable, List, Optional, Set

from utils.validation.sanitizers import pgrst_timestamp

_CHUNK = 200

LINK_FIELDS = 'id, quest_id, publish_at, student_ids'


def _chunks(seq: Iterable, size: int = _CHUNK):
    seq = list(seq)
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


class ClassQuestAudienceRepository:

    def __init__(self, client):
        self.client = client

    # ── class_quests ─────────────────────────────────────────────────────────

    def link(self, class_id: str, quest_id: str) -> Optional[Dict[str, Any]]:
        """One class quest link, or None when the quest is not on the class."""
        rows = (self.client.table('class_quests').select(LINK_FIELDS)
                .eq('class_id', class_id).eq('quest_id', quest_id)
                .limit(1).execute()).data or []
        return rows[0] if rows else None

    def links(self, class_id: str, published_only: bool, now_iso: str) -> List[Dict[str, Any]]:
        """A class's quest links in sequence order.

        published_only keeps the ones students may see now: publish_at NULL or
        already passed. Bounded by one class, so a single read is safe.
        """
        query = (self.client.table('class_quests').select(LINK_FIELDS)
                 .eq('class_id', class_id))
        if published_only:
            query = query.or_(
                f'publish_at.is.null,publish_at.lte.{pgrst_timestamp(now_iso, "publish_at")}')
        return query.order('sequence_order').execute().data or []

    def due_links(self, now_iso: str) -> List[Dict[str, Any]]:
        """Every scheduled class quest whose release time has arrived, org-wide."""
        return (self.client.table('class_quests').select('class_id, quest_id, student_ids')
                .not_.is_('publish_at', 'null')
                .lte('publish_at', pgrst_timestamp(now_iso, 'publish_at'))
                .execute()).data or []

    def set_student_ids(self, link_id: str, student_ids: Optional[List[str]]) -> None:
        """NULL = every active student in the class; a list = those students."""
        self.client.table('class_quests').update({'student_ids': student_ids}) \
            .eq('id', link_id).execute()

    # ── the students ─────────────────────────────────────────────────────────

    def named_users(self, user_ids: List[str]) -> List[Dict[str, Any]]:
        """The name columns for these users (utils.person_name renders them)."""
        from utils import person_name
        out: List[Dict[str, Any]] = []
        for chunk in _chunks(user_ids):
            out.extend((self.client.table('users')
                        .select('id, ' + person_name.USER_NAME_FIELDS)
                        .in_('id', chunk).execute()).data or [])
        return out

    # ── user_quests and what sits behind them ────────────────────────────────

    def enrollments(self, student_ids: List[str], quest_id: str) -> List[Dict[str, Any]]:
        """These students' enrollments in one quest, in any state."""
        out: List[Dict[str, Any]] = []
        for chunk in _chunks(student_ids):
            out.extend((self.client.table('user_quests')
                        .select('id, user_id, quest_id, completed_at, is_active')
                        .in_('user_id', chunk).eq('quest_id', quest_id)
                        .execute()).data or [])
        return out

    def tasks_for_enrollments(self, user_quest_ids: List[str]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for chunk in _chunks(user_quest_ids):
            out.extend((self.client.table('user_quest_tasks')
                        .select('id, user_quest_id, is_manual')
                        .in_('user_quest_id', chunk).execute()).data or [])
        return out

    def touched_task_ids(self, task_ids: List[str]) -> Set[str]:
        """Tasks with a completion or an evidence document behind them."""
        touched: Set[str] = set()
        for chunk in _chunks(task_ids):
            rows = (self.client.table('quest_task_completions').select('task_id')
                    .in_('task_id', chunk).execute()).data or []
            touched.update(r['task_id'] for r in rows if r.get('task_id'))
            rows = (self.client.table('user_task_evidence_documents').select('task_id')
                    .in_('task_id', chunk).execute()).data or []
            touched.update(r['task_id'] for r in rows if r.get('task_id'))
        return touched

    def delete_enrollments(self, user_quest_ids: List[str]) -> None:
        """user_quest_tasks cascades; callers pass only untouched enrollments."""
        for chunk in _chunks(user_quest_ids):
            self.client.table('user_quests').delete().in_('id', chunk).execute()

    def set_down(self, user_quest_ids: List[str], now_iso: str) -> None:
        """The same write quest_lifecycle_service.set_down_quest makes."""
        for chunk in _chunks(user_quest_ids):
            self.client.table('user_quests').update({
                'status': 'set_down', 'is_active': False, 'last_set_down_at': now_iso,
            }).in_('id', chunk).execute()

    def pick_up(self, user_quest_ids: List[str], now_iso: str) -> None:
        for chunk in _chunks(user_quest_ids):
            self.client.table('user_quests').update({
                'status': 'picked_up', 'is_active': True, 'last_picked_up_at': now_iso,
            }).in_('id', chunk).execute()
