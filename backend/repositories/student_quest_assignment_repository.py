"""
Quests a teacher gave one student outside any class (student_quest_assignments),
and the reads a teacher's one-student page is built from.

Client-injected, like ClassQuestAudienceRepository: every caller already holds
the service-role client its org_staff gate justified, and tests hand in a fake.

Every read is bounded by one student, one org's assignment rows, or id lists
the caller already holds, and id lists are chunked so nothing crosses
PostgREST's 1000-row cap silently (CLAUDE.md, Row Limits). The org-wide read,
org_pairs, pages with fetch_all_rows: it grows with every assignment a school
ever makes.
"""

from typing import Any, Dict, Iterable, List, Optional

from utils.db_fetch import fetch_all_rows

_CHUNK = 200

TABLE = 'student_quest_assignments'
FIELDS = 'id, organization_id, student_id, quest_id, assigned_by, due_date, created_at'


def _chunks(seq: Iterable, size: int = _CHUNK):
    seq = list(seq)
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


class StudentQuestAssignmentRepository:

    def __init__(self, client):
        self.client = client

    # ── the assignment rows ──────────────────────────────────────────────────

    def find(self, student_id: str, quest_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(TABLE).select(FIELDS)
                .eq('student_id', student_id).eq('quest_id', quest_id)
                .limit(1).execute()).data or []
        return rows[0] if rows else None

    def for_student(self, student_id: str) -> List[Dict[str, Any]]:
        """One student's individual assignments. Bounded by one student."""
        return (self.client.table(TABLE).select(FIELDS)
                .eq('student_id', student_id).execute()).data or []

    def upsert(self, org_id: str, student_id: str, quest_id: str,
               assigned_by: str, due_date: Optional[str]) -> Dict[str, Any]:
        """Create the assignment, or refresh who gave it and when it is due.

        One row per (student, quest): assigning a quest the student already
        has individually is a re-assignment, not a second row.
        """
        rows = (self.client.table(TABLE).upsert({
            'organization_id': org_id,
            'student_id': student_id,
            'quest_id': quest_id,
            'assigned_by': assigned_by,
            'due_date': due_date,
        }, on_conflict='student_id,quest_id').execute()).data or []
        return rows[0] if rows else {}

    def set_due_date(self, assignment_id: str, due_date: Optional[str], now_iso: str) -> None:
        self.client.table(TABLE).update({'due_date': due_date, 'updated_at': now_iso}) \
            .eq('id', assignment_id).execute()

    def delete(self, assignment_id: str) -> None:
        self.client.table(TABLE).delete().eq('id', assignment_id).execute()

    def gave_quest_to(self, assigned_by: str, student_id: str) -> bool:
        """Has this person given this student any quest by name?"""
        rows = (self.client.table(TABLE).select('id')
                .eq('assigned_by', assigned_by).eq('student_id', student_id)
                .limit(1).execute()).data or []
        return len(rows) > 0

    def org_pairs(self, org_id: str, assigned_by: Optional[str] = None) -> List[Dict[str, Any]]:
        """Every (student_id, quest_id) assigned individually in the org, or
        only the ones `assigned_by` gave. Paged: grows with the school."""
        def build():
            q = (self.client.table(TABLE).select('id, student_id, quest_id')
                 .eq('organization_id', org_id))
            if assigned_by:
                q = q.eq('assigned_by', assigned_by)
            return q
        return fetch_all_rows(build)

    def counts_by_student(self, org_id: str) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for r in self.org_pairs(org_id):
            counts[r['student_id']] = counts.get(r['student_id'], 0) + 1
        return counts

    # ── one student's quests and tasks ───────────────────────────────────────

    def student_enrollments(self, student_id: str) -> List[Dict[str, Any]]:
        """Every user_quests row of one student, any state."""
        return (self.client.table('user_quests')
                .select('id, quest_id, is_active, status, started_at, completed_at, '
                        'created_at, last_picked_up_at')
                .eq('user_id', student_id).execute()).data or []

    def quests(self, quest_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        out: Dict[str, Dict[str, Any]] = {}
        for chunk in _chunks(quest_ids):
            rows = (self.client.table('quests')
                    .select('id, title, description, organization_id, is_public, '
                            'is_active, created_by, xp_threshold, image_url')
                    .in_('id', chunk).execute()).data or []
            out.update({q['id']: q for q in rows})
        return out

    def tasks(self, user_quest_ids: List[str]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for chunk in _chunks(user_quest_ids):
            out.extend((self.client.table('user_quest_tasks')
                        .select('id, user_quest_id, quest_id, title, description, xp_value, '
                                'order_index, is_manual, created_by_user_id')
                        .in_('user_quest_id', chunk).order('order_index')
                        .execute()).data or [])
        return out

    def task(self, task_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('user_quest_tasks')
                .select('id, user_id, quest_id, user_quest_id, title, created_by_user_id')
                .eq('id', task_id).limit(1).execute()).data or []
        return rows[0] if rows else None

    def completions(self, task_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """{task_id: completion} for the tasks that have one."""
        out: Dict[str, Dict[str, Any]] = {}
        for chunk in _chunks(task_ids):
            rows = (self.client.table('quest_task_completions')
                    .select('id, task_id, completed_at')
                    .in_('task_id', chunk).execute()).data or []
            out.update({r['task_id']: r for r in rows if r.get('task_id')})
        return out

    def delete_task(self, task_id: str) -> None:
        self.client.table('user_quest_tasks').delete().eq('id', task_id).execute()

    def stamp_enrolled_by(self, user_quest_ids: List[str], assigned_by: str) -> None:
        """Record who put the quest in the student's account, on enrollments
        that do not say yet. Guardian attribution uses the same column
        (20260915120000_guardian_attribution_columns)."""
        for chunk in _chunks(user_quest_ids):
            self.client.table('user_quests').update({'enrolled_by_user_id': assigned_by}) \
                .in_('id', chunk).is_('enrolled_by_user_id', 'null').execute()
