"""The reads and writes behind moving a quest's credit between subjects.

Used by services/subject_credit_move_service.py. Client-injected: the routes
hand in the service-role client their own gate justified (@student_scope for a
family, superadmin for a reviewer), and a script hands in its own. With no
client it takes the admin client itself.

Every read is bounded by one student and one quest -- their completions on
that quest, its review rounds, its tasks -- except the reviewer's queue of
pending requests, which is paged.
"""

from typing import Any, Dict, List, Optional

from utils.db_fetch import fetch_all_rows
from utils.timestamps import now_iso

REQUESTS = 'subject_credit_move_requests'
MOVES = 'subject_credit_moves'

REQUEST_COLUMNS = ('id, student_id, quest_id, from_subject, to_subject, xp_snapshot, '
                   'requested_by, reason, status, decided_by, decided_at, decision_note, created_at')


class SubjectCreditMoveRepository:

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: every caller has already decided whose
            # credit this is (a family scope gate, a superadmin gate, or a
            # superadmin-run script), and every query below is scoped to one
            # student's rows.
            client = get_supabase_admin_client()
        self.client = client

    # -- the quest and its records ------------------------------------------

    def quest(self, quest_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table('quests').select(
            'id, title, quest_type, transcript_subject, created_by, metadata'
        ).eq('id', quest_id).limit(1).execute().data or []
        return rows[0] if rows else None

    def other_enrollment_count(self, quest_id: str, student_id: str) -> int:
        """How many OTHER students are enrolled in this quest."""
        rows = self.client.table('user_quests').select('user_id').eq(
            'quest_id', quest_id).neq('user_id', student_id).limit(1).execute().data or []
        return len(rows)

    def completions(self, student_id: str, quest_id: str) -> List[Dict[str, Any]]:
        return self.client.table('quest_task_completions').select(
            'id, user_quest_task_id, diploma_status'
        ).eq('user_id', student_id).eq('quest_id', quest_id).execute().data or []

    def rounds(self, completion_ids: List[str]) -> List[Dict[str, Any]]:
        """Every review round on these completions, newest first."""
        if not completion_ids:
            return []
        return self.client.table('diploma_review_rounds').select(
            'id, completion_id, round_number, reviewer_action, approved_subjects, subject_suggestion'
        ).in_('completion_id', completion_ids).order('round_number', desc=True).execute().data or []

    def tasks(self, student_id: str, quest_id: str) -> List[Dict[str, Any]]:
        return self.client.table('user_quest_tasks').select(
            'id, xp_value, subject_xp_distribution, diploma_subjects'
        ).eq('user_id', student_id).eq('quest_id', quest_id).execute().data or []

    def update_round(self, round_id: str, fields: Dict[str, Any]) -> None:
        self.client.table('diploma_review_rounds').update(fields).eq('id', round_id).execute()

    def update_task(self, task_id: str, fields: Dict[str, Any]) -> None:
        self.client.table('user_quest_tasks').update(fields).eq('id', task_id).execute()

    def set_transcript_subject(self, quest_id: str, subject: str) -> None:
        self.client.table('quests').update({'transcript_subject': subject}).eq('id', quest_id).execute()

    # -- the ledger -----------------------------------------------------------

    def subject_rows(self, student_id: str) -> List[Dict[str, Any]]:
        return self.client.table('user_subject_xp').select(
            'id, school_subject, xp_amount, pending_xp'
        ).eq('user_id', student_id).execute().data or []

    def update_subject_row(self, row_id: str, xp_amount: int, pending_xp: int) -> None:
        self.client.table('user_subject_xp').update({
            'xp_amount': xp_amount, 'pending_xp': pending_xp, 'updated_at': now_iso(),
        }).eq('id', row_id).execute()

    def insert_subject_row(self, student_id: str, subject: str, xp_amount: int, pending_xp: int) -> None:
        self.client.table('user_subject_xp').insert({
            'user_id': student_id, 'school_subject': subject,
            'xp_amount': xp_amount, 'pending_xp': pending_xp, 'updated_at': now_iso(),
        }).execute()

    # -- audit ----------------------------------------------------------------

    def insert_move(self, row: Dict[str, Any]) -> None:
        self.client.table(MOVES).insert(row).execute()

    # -- requests -------------------------------------------------------------

    def insert_request(self, row: Dict[str, Any]) -> Dict[str, Any]:
        data = self.client.table(REQUESTS).insert(row).execute().data or []
        if not data:
            raise RuntimeError('Move request insert returned no row')
        return data[0]

    def request(self, request_id: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(REQUESTS).select(REQUEST_COLUMNS).eq(
            'id', request_id).limit(1).execute().data or []
        return rows[0] if rows else None

    def pending_for_student(self, student_id: str) -> List[Dict[str, Any]]:
        return self.client.table(REQUESTS).select(REQUEST_COLUMNS).eq(
            'student_id', student_id).eq('status', 'pending').execute().data or []

    def pending_for_quest(self, student_id: str, quest_id: str, from_subject: str) -> Optional[Dict[str, Any]]:
        rows = self.client.table(REQUESTS).select(REQUEST_COLUMNS).eq(
            'student_id', student_id).eq('quest_id', quest_id).eq(
            'from_subject', from_subject).eq('status', 'pending').limit(1).execute().data or []
        return rows[0] if rows else None

    def requests_with_status(self, status: str) -> List[Dict[str, Any]]:
        """The reviewer's queue. Paged: nothing bounds it by one student."""
        rows = fetch_all_rows(lambda: self.client.table(REQUESTS).select(REQUEST_COLUMNS).eq(
            'status', status))
        return sorted(rows, key=lambda r: str(r.get('created_at') or ''))

    def decide(self, request_id: str, from_status: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Move a request out of `from_status`. Returns the updated row, or None
        if it was no longer in that status (someone else decided it first)."""
        rows = self.client.table(REQUESTS).update(fields).eq('id', request_id).eq(
            'status', from_status).execute().data or []
        return rows[0] if rows else None

    # -- names for the reviewer's queue --------------------------------------

    def users(self, user_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        if not user_ids:
            return {}
        rows = self.client.table('users').select(
            'id, first_name, last_name, display_name, email'
        ).in_('id', user_ids).execute().data or []
        return {r['id']: r for r in rows}

    def quest_titles(self, quest_ids: List[str]) -> Dict[str, str]:
        if not quest_ids:
            return {}
        rows = self.client.table('quests').select('id, title').in_('id', quest_ids).execute().data or []
        return {r['id']: r.get('title') for r in rows}
