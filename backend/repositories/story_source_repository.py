"""Read-only access to everything a story is drafted FROM.

A story pools a submission (or a whole quest's worth of them), the review
rounds, the task's Definition of Done, the quest, the student's reflections and
-- for the scrubber -- the names that must never appear: the student's own,
every linked parent's, and the organization's. Nothing here is written back.

Column names are verified against production on 2026-09-11. `is_confidential`,
`merged_into` and `diploma_status` on the completion are the three gates the
orchestrator reads before a single byte of evidence is loaded.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository

COMPLETION_COLUMNS = (
    'id, user_id, quest_id, task_id, user_quest_task_id, completed_at, is_confidential, '
    'diploma_status, revision_number, finalized_at, merged_into, in_portfolio, '
    'credit_requested_at'
)
ROUND_COLUMNS = (
    'id, completion_id, round_number, evidence_snapshot, submitted_at, reviewer_action, '
    'reviewer_feedback, approved_subjects, reviewed_at, org_reviewer_action, '
    'org_reviewer_feedback, org_reviewed_at'
)
TASK_COLUMNS = (
    'id, user_id, quest_id, user_quest_id, title, description, pillar, xp_value, '
    'order_index, is_required, diploma_subjects, subject_xp_distribution, '
    'success_criteria, source_moment_id'
)
QUEST_COLUMNS = (
    'id, title, description, big_idea, header_image_url, image_url, organization_id, '
    'transcript_subject'
)
USER_QUEST_COLUMNS = (
    'id, user_id, quest_id, started_at, completed_at, is_active, status, '
    'reflection_notes, archived_at'
)
STUDENT_COLUMNS = (
    'id, first_name, last_name, display_name, preferred_name, role, org_role, '
    'organization_id, date_of_birth, is_dependent, managed_by_parent_id'
)
NAME_COLUMNS = 'id, first_name, last_name, display_name, preferred_name'


class StorySourceRepository(BaseRepository):
    # BaseRepository wants a table; this repository reads eight. The attribute is
    # the one a bare CRUD call would use, and nothing here makes one.
    table_name = 'quest_task_completions'

    def __init__(self, client: Any = None):
        # admin client justified: the story worker runs on a background thread
        # with no request user, reading one student's finalized submission,
        # its rounds and the family names the scrubber must remove. The
        # superadmin who clicked Publish is the authorization; RLS has no view
        # for "a job acting on that click".
        super().__init__(user_id=None, client=client)

    # ── the submission ───────────────────────────────────────────────────────

    def completion(self, completion_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table('quest_task_completions').select(COMPLETION_COLUMNS).eq(
            'id', completion_id).limit(1).execute().data
        return rows[0] if rows else None

    def rounds_for_completion(self, completion_id: str) -> List[Dict[str, Any]]:
        return self.client.table('diploma_review_rounds').select(ROUND_COLUMNS).eq(
            'completion_id', completion_id).order('round_number').execute().data or []

    def task(self, task_id: str) -> Optional[Dict[str, Any]]:
        if not task_id:
            return None
        rows = self.client.table('user_quest_tasks').select(TASK_COLUMNS).eq(
            'id', task_id).limit(1).execute().data
        return rows[0] if rows else None

    def quest(self, quest_id: str) -> Optional[Dict[str, Any]]:
        if not quest_id:
            return None
        rows = self.client.table('quests').select(QUEST_COLUMNS).eq(
            'id', quest_id).limit(1).execute().data
        return rows[0] if rows else None

    # ── the whole quest ──────────────────────────────────────────────────────

    def user_quest(self, user_quest_id: str) -> Optional[Dict[str, Any]]:
        if not user_quest_id:
            return None
        rows = self.client.table('user_quests').select(USER_QUEST_COLUMNS).eq(
            'id', user_quest_id).limit(1).execute().data
        return rows[0] if rows else None

    def tasks_for_user_quest(self, user_quest_id: str) -> List[Dict[str, Any]]:
        return self.client.table('user_quest_tasks').select(TASK_COLUMNS).eq(
            'user_quest_id', user_quest_id).order('order_index').execute().data or []

    def finalized_completions_for_tasks(self, task_ids: List[str]) -> List[Dict[str, Any]]:
        """Only what a human finalized. Pending, returned and merged-away
        completions are not part of a story about earned credit."""
        ids = [t for t in (task_ids or []) if t]
        if not ids:
            return []
        rows = self.client.table('quest_task_completions').select(COMPLETION_COLUMNS).in_(
            'user_quest_task_id', ids).eq('diploma_status', 'finalized').execute().data or []
        return [r for r in rows if not r.get('merged_into')]

    # ── the student, and the names that must not appear ──────────────────────

    def student(self, user_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table('users').select(STUDENT_COLUMNS).eq(
            'id', user_id).limit(1).execute().data
        return rows[0] if rows else None

    def parent_rows(self, student: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Every linked guardian, through all three link types, as name rows.

        The relationship itself is answered by utils.class_membership (the one
        definition, see tests/unit/test_one_definition_of_parent.py); this only
        fetches the names of the people it returns, so the scrubber can remove
        them. A guardian the household funnel created is family too.
        """
        from utils.class_membership import guardians_by_student

        guardian_ids = sorted(guardians_by_student([student['id']]).get(student['id'], set()))
        if not guardian_ids:
            return []
        return self.client.table('users').select(NAME_COLUMNS).in_(
            'id', guardian_ids).execute().data or []

    def org_name(self, org_id: Optional[str]) -> Optional[str]:
        if not org_id:
            return None
        rows = self.client.table('organizations').select('id, name').eq(
            'id', org_id).limit(1).execute().data
        return (rows[0].get('name') if rows else None) or None

    def active_academy_enrollment(self, user_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table('academy_enrollments').select(
            'id, user_id, status, grade_level, enrolled_at').eq(
            'user_id', user_id).eq('status', 'active').limit(1).execute().data
        return rows[0] if rows else None
