"""
The reads behind the SIS Submissions inbox and the feedback thread's
reply routing.

Client-injected, like ClassQuestAudienceRepository: every caller already holds
the service-role client its own gate justified (the STAFF_ROLES inbox routes,
and the credit thread's _can_access), and the tests hand in a fake.

The org-wide and class-wide list reads page through fetch_all_rows. They grow
with every task a school's students hand in, and PostgREST cuts a response at
1,000 rows without a word (CLAUDE.md, "Never count rows in Python"). iCreate
crossed that line on the Submissions inbox, whose unpaged, oldest-first read
dropped the NEWEST work (found 2026-09-23 with ticket 0e6cb0fc).
"""

from typing import Any, Dict, Iterable, List, Optional, Set

from utils.db_fetch import fetch_all_rows


def _like_pattern(needle: str) -> str:
    """`needle` as a literal ilike substring: % and _ are wildcards and a
    backslash is the escape, and a teacher who types "100%" means the
    character."""
    escaped = needle.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    return f'%{escaped}%'


#: The completion columns the inbox reads. The verification three let a school
#: leave out work an outside platform already verified (Bloomy, ticket
#: bc68a12e; services.external_learning_verification.verified_by_platform).
INBOX_COMPLETION_COLUMNS = ('id, user_id, quest_id, user_quest_task_id, completed_at, '
                            'subject_verified_at, verified_by_advisor_id, verification_notes')


class SisSubmissionRepository:

    def __init__(self, client):
        self.client = client

    # ── the inbox ────────────────────────────────────────────────────────────

    def completions_for(self, student_ids: Iterable[str],
                        quest_ids: Iterable[str]) -> List[Dict[str, Any]]:
        """Every completion by these students on these quests, in id order.
        The caller sets the queue order."""
        students, quests = list(student_ids), list(quest_ids)
        return fetch_all_rows(lambda: (
            self.client.table('quest_task_completions')
            .select(INBOX_COMPLETION_COLUMNS)
            .in_('user_id', students)
            .in_('quest_id', quests)
        ))

    def completions_by(self, student_ids: Iterable[str]) -> List[Dict[str, Any]]:
        """Every completion by these students on any quest, in id order: the
        inbox of a school that reviews all of its students' work."""
        students = list(student_ids)
        return fetch_all_rows(lambda: (
            self.client.table('quest_task_completions')
            .select(INBOX_COMPLETION_COLUMNS)
            .in_('user_id', students)
        ))

    def org_reviews(self, org_id: str) -> List[Dict[str, Any]]:
        """Every SIS review row in the org (one per reviewed submission)."""
        return fetch_all_rows(lambda: (
            self.client.table('sis_submission_reviews')
            .select('id, completion_id, reviewed_by, action, reviewed_at')
            .eq('organization_id', org_id)
        ))

    # ── review writes (accept, grow this, bulk accept) ───────────────────────

    def completions_by_ids(self, completion_ids: Iterable[str]) -> List[Dict[str, Any]]:
        """These completions, for a scope check. Bounded by the caller's
        selection (the bulk route caps it)."""
        ids = [i for i in dict.fromkeys(completion_ids) if i]
        if not ids:
            return []
        return (self.client.table('quest_task_completions')
                .select('id, user_id, quest_id, user_quest_task_id, completed_at')
                .in_('id', ids).execute()).data or []

    def reviews_for(self, completion_ids: Iterable[str]) -> List[Dict[str, Any]]:
        """The review rows of these completions (completion_id is UNIQUE)."""
        ids = [i for i in dict.fromkeys(completion_ids) if i]
        if not ids:
            return []
        return (self.client.table('sis_submission_reviews')
                .select('completion_id, action')
                .in_('completion_id', ids).execute()).data or []

    def save_reviews(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Upsert review rows on completion_id; returns what was written."""
        if not rows:
            return []
        return (self.client.table('sis_submission_reviews')
                .upsert(rows, on_conflict='completion_id').execute()).data or []

    def post_thread_note(self, completion_id: str, author_id: str, author_role: str,
                         body: str) -> Optional[Dict[str, Any]]:
        """A teacher's note on the task's feedback thread (credit_review_messages,
        the thread CreditFeedbackThread shows the student and the reviewer)."""
        rows = (self.client.table('credit_review_messages').insert({
            'completion_id': completion_id,
            'author_id': author_id,
            'author_role': author_role,
            'body': body,
        }).execute()).data or []
        return rows[0] if rows else None

    # ── search (ticket 0e6cb0fc) ─────────────────────────────────────────────

    def people(self, user_ids: Iterable[str]) -> List[Dict[str, Any]]:
        """Name fields for these users. Bounded by the classes in scope."""
        ids = list(user_ids)
        return fetch_all_rows(lambda: (
            self.client.table('users')
            .select('id, display_name, first_name, last_name, email')
            .in_('id', ids)
        ))

    def quest_titles(self, quest_ids: Iterable[str]) -> List[Dict[str, Any]]:
        ids = list(quest_ids)
        return fetch_all_rows(lambda: (
            self.client.table('quests').select('id, title').in_('id', ids)
        ))

    def task_ids_titled_like(self, student_ids: Iterable[str], quest_ids: Iterable[str],
                             needle: str) -> Set[str]:
        """Ids of these students' tasks on these quests whose title contains
        `needle`. Every submission has its own user_quest_tasks row, so the
        match runs in the database and only matching ids come back."""
        students, quests = list(student_ids), list(quest_ids)
        pattern = _like_pattern(needle)
        rows = fetch_all_rows(lambda: (
            self.client.table('user_quest_tasks').select('id')
            .in_('user_id', students)
            .in_('quest_id', quests)
            .ilike('title', pattern)
        ))
        return {r['id'] for r in rows}

    # ── reply routing (ticket 41474658) ──────────────────────────────────────

    def reviewer_of(self, completion_id: str) -> Optional[str]:
        """Who reviewed this submission in the SIS, or None (completion_id is
        UNIQUE on sis_submission_reviews)."""
        rows = (self.client.table('sis_submission_reviews').select('reviewed_by')
                .eq('completion_id', completion_id).limit(1).execute()).data or []
        return rows[0].get('reviewed_by') if rows else None

    def classes_holding_quest(self, quest_id: str, class_ids: Iterable[str]) -> Set[str]:
        """Which of `class_ids` have this quest attached. Bounded by one
        student's classes."""
        ids = list(class_ids)
        if not ids or not quest_id:
            return set()
        rows = (self.client.table('class_quests').select('class_id')
                .eq('quest_id', quest_id).in_('class_id', ids).execute()).data or []
        return {r['class_id'] for r in rows if r.get('class_id')}
