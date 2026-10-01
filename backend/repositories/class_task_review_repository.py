"""The reads and writes behind per-task review inside a class
(services/class_task_review_service.py).

A class task keeps diploma_status='none' for its whole life. Its review lives
entirely in diploma_review_rounds: one round per class submission, the same
evidence snapshot the AI reads, and reviewer_action 'approved' or 'grow_this'.
Nothing here touches quest_task_completions.diploma_status or user_subject_xp,
because the class's own half credit is the only award the work earns.

Client-injected: the only caller is the superadmin class review route, which
already holds the service-role client its @require_admin gate justified. Every
read is bounded by one student's completions on one class quest.
"""

from typing import Any, Dict, List, Optional


class ClassTaskReviewRepository:

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: the class review route is @require_admin
            # and every query below is pinned to one student's class quest.
            client = get_supabase_admin_client()
        self.client = client

    # -- reads ---------------------------------------------------------------

    def quest(self, quest_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table('quests').select(
            'id, title, quest_type, transcript_subject, class_review_status, '
            'class_review_submitted_at, created_by'
        ).eq('id', quest_id).limit(1).execute().data
        return rows[0] if rows else None

    def completions(self, quest_id: str, student_id: str) -> List[Dict[str, Any]]:
        return self.client.table('quest_task_completions').select(
            'id, user_id, quest_id, user_quest_task_id, diploma_status'
        ).eq('quest_id', quest_id).eq('user_id', student_id).execute().data or []

    def completion(self, completion_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table('quest_task_completions').select(
            'id, user_id, quest_id, user_quest_task_id, diploma_status'
        ).eq('id', completion_id).limit(1).execute().data
        return rows[0] if rows else None

    def rounds(self, completion_ids: List[str]) -> List[Dict[str, Any]]:
        if not completion_ids:
            return []
        return self.client.table('diploma_review_rounds').select(
            'id, completion_id, round_number, submitted_at, reviewer_id, '
            'reviewer_action, reviewer_feedback, reviewed_at'
        ).in_('completion_id', completion_ids).order('round_number').execute().data or []

    def evidence_snapshot(self, student_id: str, task_id: str) -> List[Dict[str, Any]]:
        """The student's evidence blocks for one task, in order -- the same
        snapshot a regular credit request stores (routes/tasks/credit.py)."""
        docs = self.client.table('user_task_evidence_documents').select('id').eq(
            'task_id', task_id).eq('user_id', student_id).limit(1).execute().data
        if not docs:
            return []
        return self.client.table('evidence_document_blocks').select('*').eq(
            'document_id', docs[0]['id']).order('order_index').execute().data or []

    def user_email(self, user_id: str) -> Optional[str]:
        rows = self.client.table('users').select('email').eq('id', user_id).limit(1).execute().data
        return rows[0].get('email') if rows else None

    # -- writes --------------------------------------------------------------

    def insert_round(self, row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        data = self.client.table('diploma_review_rounds').insert(row).execute().data
        return data[0] if data else None

    def decide_round(self, round_id: str, update: Dict[str, Any]) -> None:
        self.client.table('diploma_review_rounds').update(update).eq('id', round_id).execute()

    def set_quest_review(self, quest_id: str, status: str, notes: Optional[str]) -> None:
        self.client.table('quests').update({
            'class_review_status': status,
            'class_review_notes': notes,
        }).eq('id', quest_id).execute()

    def set_task_feedback(self, task_id: str, feedback: str, at: str) -> None:
        self.client.table('user_quest_tasks').update({
            'latest_feedback': feedback,
            'feedback_at': at,
        }).eq('id', task_id).execute()
