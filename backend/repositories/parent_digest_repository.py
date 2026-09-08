"""Every read and write behind the weekly parent digest.

The digest asks one question of eight tables — roster, guardians, this week's
completions, the evidence behind them, learning moments, and the class quests
whose due date has passed — for a whole school at a time. All of that query
mechanics lives here so services/parent_weekly_digest_service holds only the
rules: what counts as late, what counts as this week, and who may be told.

Two things are deliberate and load-bearing:

**Everything org-wide is paged** (`fetch_all_rows`). A single PostgREST response
stops at 1000 rows and says nothing about it, so a school that outgrows the cap
would get a digest built from a truncated week — see the enrollment-count
postmortem in CLAUDE.md.

**Ids are chunked at 100 per `in_()`**, because a URL-encoded filter over a whole
school's students is how a query silently becomes a 414.
"""

from typing import Any, Dict, Iterable, List, Optional, Tuple

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)

_CHUNK = 100


def _chunks(items: List[Any], size: int = _CHUNK) -> Iterable[List[Any]]:
    for start in range(0, len(items), size):
        yield items[start:start + size]


def _clean(ids: Optional[List[str]]) -> List[str]:
    return sorted({i for i in (ids or []) if i})


class ParentDigestRepository(BaseRepository):
    # The table this repository owns outright; the reads below span the tables
    # the digest reports ON.
    table_name = 'parent_digest_sends'

    # ── Schools ──────────────────────────────────────────────────────────────

    def organizations(self, org_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Every org's digest settings, or one org's."""
        query = self.client.table('organizations').select('id, name, timezone, feature_flags')
        if org_id:
            query = query.eq('id', org_id)
        return (query.execute()).data or []

    def classes_for_org(self, org_id: str) -> Dict[str, str]:
        rows = fetch_all_rows(lambda: (
            self.client.table('org_classes').select('id, name').eq('organization_id', org_id)
        ))
        return {r['id']: r.get('name') or 'Class' for r in rows}

    def active_enrollments(self, class_ids: List[str]) -> Dict[str, List[str]]:
        """{student_id: [class_id]} — the school's current roster.

        An active class enrollment is the platform's only honest answer to "is
        this child still at this school": `users` carries no enrolled/withdrawn
        status at all.
        """
        out: Dict[str, List[str]] = {}
        for chunk in _chunks(_clean(class_ids)):
            rows = fetch_all_rows(lambda c=chunk: (
                self.client.table('class_enrollments').select('student_id, class_id')
                .in_('class_id', c).eq('status', 'active')
            ))
            for r in rows:
                if r.get('student_id'):
                    out.setdefault(r['student_id'], []).append(r['class_id'])
        return out

    # ── People ───────────────────────────────────────────────────────────────

    def users_by_ids(self, user_ids: List[str], fields: str) -> Dict[str, Dict[str, Any]]:
        out: Dict[str, Dict[str, Any]] = {}
        for chunk in _chunks(_clean(user_ids)):
            rows = (self.client.table('users').select(fields)
                    .in_('id', chunk).execute()).data or []
            for r in rows:
                out[r['id']] = r
        return out

    def managing_parents(self, student_ids: List[str]) -> List[Tuple[str, str]]:
        """(student_id, parent_id) from users.managed_by_parent_id — under 13."""
        pairs = []
        for chunk in _chunks(_clean(student_ids)):
            rows = (self.client.table('users').select('id, managed_by_parent_id')
                    .in_('id', chunk).execute()).data or []
            pairs += [(r['id'], r['managed_by_parent_id'])
                      for r in rows if r.get('managed_by_parent_id')]
        return pairs

    def approved_links(self, student_ids: List[str]) -> List[Tuple[str, str]]:
        """(student_id, parent_id) from parent_student_links — 13 and over."""
        pairs = []
        for chunk in _chunks(_clean(student_ids)):
            rows = fetch_all_rows(lambda c=chunk: (
                self.client.table('parent_student_links')
                .select('parent_user_id, student_user_id')
                .in_('student_user_id', c).eq('status', 'approved')
            ))
            pairs += [(r['student_user_id'], r['parent_user_id']) for r in rows
                      if r.get('student_user_id') and r.get('parent_user_id')]
        return pairs

    def opted_out(self, parent_ids: List[str], notification_type: str) -> set:
        out = set()
        for chunk in _chunks(_clean(parent_ids)):
            rows = (self.client.table('notification_preferences')
                    .select('user_id, enabled').in_('user_id', chunk)
                    .eq('notification_type', notification_type).execute()).data or []
            out.update(r['user_id'] for r in rows if r.get('enabled') is False)
        return out

    def set_preference(self, user_id: str, notification_type: str, enabled: bool) -> None:
        (self.client.table('notification_preferences').upsert(
            {'user_id': user_id, 'notification_type': notification_type,
             'enabled': bool(enabled)},
            on_conflict='user_id,notification_type').execute())

    def role_of(self, user_id: str) -> Optional[str]:
        rows = (self.client.table('users').select('role')
                .eq('id', user_id).limit(1).execute()).data or []
        return rows[0].get('role') if rows else None

    # ── The week ─────────────────────────────────────────────────────────────

    def completions_since(self, student_ids: List[str], since_iso: str) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for chunk in _chunks(_clean(student_ids)):
            rows += fetch_all_rows(lambda c=chunk: (
                self.client.table('quest_task_completions')
                .select('id, user_id, task_id, quest_id, evidence_url, evidence_text, '
                        'completed_at, is_confidential')
                .in_('user_id', c).gte('completed_at', since_iso)
            ))
        return rows

    def tasks_by_ids(self, task_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        out: Dict[str, Dict[str, Any]] = {}
        for chunk in _chunks(_clean(task_ids)):
            rows = (self.client.table('user_quest_tasks')
                    .select('id, title, pillar, xp_value').in_('id', chunk).execute()).data or []
            out.update({r['id']: r for r in rows})
        return out

    def quest_titles(self, quest_ids: List[str]) -> Dict[str, str]:
        out: Dict[str, str] = {}
        for chunk in _chunks(_clean(quest_ids)):
            rows = (self.client.table('quests').select('id, title')
                    .in_('id', chunk).execute()).data or []
            out.update({r['id']: r.get('title') for r in rows})
        return out

    def evidence_documents(self, task_ids: List[str]) -> List[Dict[str, Any]]:
        """The multi-format evidence documents for these tasks.

        Keyed on the task alone: a user_quest_tasks row belongs to exactly one
        student, so these ids are already scoped to the school being swept.
        """
        rows: List[Dict[str, Any]] = []
        for chunk in _chunks(_clean(task_ids)):
            rows += fetch_all_rows(lambda c=chunk: (
                self.client.table('user_task_evidence_documents')
                .select('id, user_id, task_id, is_confidential').in_('task_id', c)
            ))
        return rows

    def evidence_blocks(self, document_ids: List[str]) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for chunk in _chunks(_clean(document_ids)):
            rows += fetch_all_rows(lambda c=chunk: (
                self.client.table('evidence_document_blocks')
                .select('document_id, block_type, is_private').in_('document_id', c)
            ))
        return rows

    def learning_events_since(self, student_ids: List[str],
                              since_date: str) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for chunk in _chunks(_clean(student_ids)):
            rows += fetch_all_rows(lambda c=chunk: (
                self.client.table('learning_events')
                .select('user_id, title, event_date, is_confidential')
                .in_('user_id', c).gte('event_date', since_date)
            ))
        return rows

    # ── Work with a due date ─────────────────────────────────────────────────

    def dated_class_quests(self, class_ids: List[str]) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for chunk in _chunks(_clean(class_ids)):
            rows += fetch_all_rows(lambda c=chunk: (
                self.client.table('class_quests')
                .select('class_id, quest_id, due_date, publish_at')
                .in_('class_id', c).not_.is_('due_date', 'null')
            ))
        return rows

    def user_quests(self, student_ids: List[str],
                    quest_ids: List[str]) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for students in _chunks(_clean(student_ids)):
            for quests in _chunks(_clean(quest_ids)):
                rows += fetch_all_rows(lambda s=students, q=quests: (
                    self.client.table('user_quests')
                    .select('id, user_id, quest_id, completed_at')
                    .in_('user_id', s).in_('quest_id', q)
                ))
        return rows

    def tasks_for_user_quests(self, user_quest_ids: List[str]) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for chunk in _chunks(_clean(user_quest_ids)):
            rows += fetch_all_rows(lambda c=chunk: (
                self.client.table('user_quest_tasks').select('id, user_quest_id')
                .in_('user_quest_id', c)
            ))
        return rows

    def completed_task_ids(self, task_ids: List[str]) -> set:
        done = set()
        for chunk in _chunks(_clean(task_ids), 200):
            rows = fetch_all_rows(lambda c=chunk: (
                self.client.table('quest_task_completions').select('task_id').in_('task_id', c)
            ))
            done.update(r['task_id'] for r in rows if r.get('task_id'))
        return done

    # ── Send bookkeeping ─────────────────────────────────────────────────────

    def claim_week(self, org_id: str, parent_user_id: str, week_date: str,
                   child_count: int, task_count: int, late_count: int) -> bool:
        """Take this week's slot for one parent, or report it already taken.

        The unique constraint is the guard, and losing the race is the NORMAL
        path: the cron ticks roughly six times inside the send hour.
        """
        try:
            (self.client.table(self.table_name).insert({
                'organization_id': org_id,
                'parent_user_id': parent_user_id,
                'week_date': week_date,
                'child_count': child_count,
                'task_count': task_count,
                'late_count': late_count,
            }).execute())
            return True
        except Exception as e:  # noqa: BLE001 — a duplicate key is expected
            logger.debug(f'digest slot for {parent_user_id[:8]} already taken: {e}')
            return False

    def mark_undelivered(self, org_id: str, parent_user_id: str, week_date: str) -> None:
        try:
            (self.client.table(self.table_name).update({'delivered': False})
             .eq('organization_id', org_id).eq('parent_user_id', parent_user_id)
             .eq('week_date', week_date).execute())
        except Exception as e:  # noqa: BLE001 — bookkeeping must not raise into the sweep
            logger.warning(f'could not mark digest send failed: {e}')
