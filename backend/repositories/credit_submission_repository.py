"""Data access for a credit submission as it stands, before it is submitted.

The student's credit precheck (services/credit_ai_review/precheck.py) judges
the work a student is about to send: their completion, the task and quest it
belongs to, the evidence as it is right now, and any earlier review rounds.
Every one of those reads is here, so the service holds only the policy.

The client is the service role. The evidence blocks point into the private
`quest-evidence` bucket, and the one caller has already resolved the student
through @student_scope before any of this runs.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository


class CreditSubmissionRepository(BaseRepository):
    table_name = 'quest_task_completions'

    def __init__(self, client: Any = None):
        # admin client justified: reads one student's own submission for the
        # precheck, whose route resolves that student with @student_scope; the
        # evidence it names lives in a service-role-only bucket.
        super().__init__(user_id=None, client=client)

    def completion_for_task(self, student_id: str, task_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.table_name).select(
            'id, quest_id, diploma_status'
        ).eq('user_quest_task_id', task_id).eq('user_id', student_id).limit(1).execute().data
        row = rows[0] if rows else None
        return row if isinstance(row, dict) else None

    def task(self, task_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table('user_quest_tasks').select(
            'id, title, description, success_criteria, pillar, xp_value, '
            'diploma_subjects, subject_xp_distribution'
        ).eq('id', task_id).limit(1).execute().data
        row = rows[0] if rows else None
        return row if isinstance(row, dict) else None

    def quest(self, quest_id: str) -> Dict[str, Any]:
        rows = self.client.table('quests').select('id, title, description').eq(
            'id', quest_id).limit(1).execute().data
        row = rows[0] if rows else None
        return row if isinstance(row, dict) else {}

    def evidence_blocks(self, student_id: str, task_id: str) -> List[Dict[str, Any]]:
        """The blocks request-credit would snapshot if it ran now, in order."""
        docs = self.client.table('user_task_evidence_documents').select('id').eq(
            'task_id', task_id).eq('user_id', student_id).limit(1).execute().data
        if not docs:
            return []
        blocks = self.client.table('evidence_document_blocks').select('*').eq(
            'document_id', docs[0]['id']).order('order_index').execute().data
        return [b for b in (blocks or []) if isinstance(b, dict)]

    def review_rounds(self, completion_id: str) -> List[Dict[str, Any]]:
        """Earlier rounds, bounded by one completion, oldest first."""
        rows = self.client.table('diploma_review_rounds').select(
            'id, round_number, evidence_snapshot, '
            'reviewer_action, reviewer_feedback, org_reviewer_action, org_reviewer_feedback'
        ).eq('completion_id', completion_id).order('round_number').execute().data
        return [r for r in (rows or []) if isinstance(r, dict)]
