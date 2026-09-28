"""The reads and writes behind Courses and Credits (services/courses_and_credits_service.py).

Client-injected: every caller already holds the service-role client its own
gate justified (@student_scope resolved the student, or an admin transcript
route). With no client it takes the admin client itself.

Every read is bounded by one student's own rows -- their subject XP, their
enrollments, the tasks on their own courses. The one that can pass
PostgREST's 1,000-row cap over a long enrollment, a student's approved
completions, is paged; id lists are chunked.
"""

from typing import Any, Dict, Iterable, List, Optional

from utils.class_credits import CLASS_CREDIT_VALUE, is_own_curriculum
from utils.db_fetch import fetch_all_rows

_CHUNK = 200


def _chunks(seq: Iterable, size: int = _CHUNK):
    seq = list(seq)
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


class CoursesAndCreditsRepository:

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: every caller has already resolved which
            # student this is about (@student_scope, or an admin transcript
            # gate) and every query below is scoped to that student.
            client = get_supabase_admin_client()
        self.client = client

    # -- writes --------------------------------------------------------------

    def insert_quest(self, row: Dict[str, Any]) -> str:
        data = self.client.table('quests').insert(row).execute().data
        if not data:
            raise RuntimeError('Quest insert returned no row')
        return data[0]['id']

    def mark_personalized(self, user_quest_id: str) -> None:
        """The check-ins are the whole task list, so nothing should offer to
        generate one (the personalization wizard keys off this flag)."""
        self.client.table('user_quests').update(
            {'personalization_completed': True}).eq('id', user_quest_id).execute()

    def insert_tasks(self, rows: List[Dict[str, Any]]) -> None:
        self.client.table('user_quest_tasks').insert(rows).execute()

    # -- reads ---------------------------------------------------------------

    def subject_xp(self, student_id: str) -> List[Dict[str, Any]]:
        return self.client.table('user_subject_xp').select(
            'school_subject, xp_amount, pending_xp'
        ).eq('user_id', student_id).execute().data or []

    def class_enrollments(self, student_id: str) -> List[Dict[str, Any]]:
        """The student's active class quests (quest_type='class' with a
        subject), one row per quest."""
        rows = self.client.table('user_quests').select(
            'quest_id, quests(id, title, description, quest_type, transcript_subject, '
            'class_review_status, is_active, metadata)'
        ).eq('user_id', student_id).execute().data or []
        quests, seen = [], set()
        for r in rows:
            q = r.get('quests') or {}
            if not q.get('id') or q['id'] in seen:
                continue
            if q.get('quest_type') != 'class' or not q.get('is_active') or not q.get('transcript_subject'):
                continue
            seen.add(q['id'])
            quests.append(q)
        return quests

    def course_tasks(self, student_id: str, quest_ids: List[str]) -> List[Dict[str, Any]]:
        if not quest_ids:
            return []
        return self.client.table('user_quest_tasks').select(
            'id, quest_id, title, xp_value, order_index, is_required'
        ).eq('user_id', student_id).in_('quest_id', quest_ids).execute().data or []

    def completions_for_tasks(self, student_id: str, task_ids: List[str]) -> List[Dict[str, Any]]:
        if not task_ids:
            return []
        return self.client.table('quest_task_completions').select(
            'id, user_quest_task_id, diploma_status'
        ).eq('user_id', student_id).in_('user_quest_task_id', task_ids).execute().data or []

    def latest_feedback(self, completion_ids: List[str]) -> Dict[str, Optional[str]]:
        """Latest reviewer feedback per completion id."""
        if not completion_ids:
            return {}
        rounds = self.client.table('diploma_review_rounds').select(
            'completion_id, reviewer_feedback, round_number'
        ).in_('completion_id', completion_ids).order('round_number', desc=True).execute().data or []
        latest: Dict[str, Optional[str]] = {}
        for r in rounds:
            latest.setdefault(r['completion_id'], r.get('reviewer_feedback'))
        return latest

    def transfer_credits(self, student_id: str) -> List[Dict[str, Any]]:
        return self.client.table('transfer_credits').select(
            'school_name, course_names, subject_xp'
        ).eq('user_id', student_id).execute().data or []

    # -- where credited XP came from ----------------------------------------

    def credited_completions(self, student_id: str) -> List[Dict[str, Any]]:
        """Every completion a reviewer approved (diploma_status 'finalized').
        Paged: a student's approved tasks can pass 1,000 over a few years."""
        return fetch_all_rows(lambda: self.client.table('quest_task_completions').select(
            'id, quest_id, user_quest_task_id'
        ).eq('user_id', student_id).eq('diploma_status', 'finalized'))

    def approved_subjects(self, completion_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """The subject split the reviewer approved, per completion (latest
        approved round). It can differ from the task's own split, and it is
        what finalize_subject_xp actually deposited."""
        found: Dict[str, Dict[str, Any]] = {}
        for ids in _chunks(completion_ids):
            rows = self.client.table('diploma_review_rounds').select(
                'completion_id, approved_subjects, round_number'
            ).in_('completion_id', ids).eq('reviewer_action', 'approved').order(
                'round_number', desc=True).execute().data or []
            for r in rows:
                if isinstance(r.get('approved_subjects'), dict):
                    found.setdefault(r['completion_id'], r['approved_subjects'])
        return found

    def task_subject_splits(self, task_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        splits: Dict[str, Dict[str, Any]] = {}
        for ids in _chunks(task_ids):
            rows = self.client.table('user_quest_tasks').select(
                'id, subject_xp_distribution'
            ).in_('id', ids).execute().data or []
            for r in rows:
                if isinstance(r.get('subject_xp_distribution'), dict):
                    splits[r['id']] = r['subject_xp_distribution']
        return splits

    def task_titles(self, task_ids: List[str]) -> Dict[str, str]:
        """Title per task id, for the approved tasks listed under a quest."""
        titles: Dict[str, str] = {}
        for ids in _chunks(task_ids):
            rows = self.client.table('user_quest_tasks').select(
                'id, title'
            ).in_('id', ids).execute().data or []
            for r in rows:
                titles[r['id']] = r.get('title')
        return titles

    def quest_kinds(self, quest_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """title, quest_type and metadata per quest id."""
        kinds: Dict[str, Dict[str, Any]] = {}
        for ids in _chunks(quest_ids):
            rows = self.client.table('quests').select(
                'id, title, quest_type, metadata'
            ).in_('id', ids).execute().data or []
            for r in rows:
                kinds[r['id']] = r
        return kinds

    def awarded_class_credits(self, student_id: str) -> List[Dict[str, Any]]:
        """The student's awarded class credits, oldest first. See
        utils/class_credits.py for which classes are left out and why.

        Each row: quest_id, school_subject, course_name, credits, grade,
        awarded_at.
        """
        classes = self.client.table('quests').select(
            'id, title, transcript_subject, class_review_submitted_at, metadata'
        ).eq('created_by', student_id).eq('quest_type', 'class').eq(
            'class_review_status', 'credit_awarded'
        ).order('class_review_submitted_at', desc=False).execute().data or []
        if not classes:
            return []

        poe_rows = self.client.table('poe_participants').select(
            'class_quest_id'
        ).eq('user_id', student_id).not_.is_(
            'credit_awarded_at', 'null'
        ).execute().data or []
        poe_quest_ids = {p['class_quest_id'] for p in poe_rows if p.get('class_quest_id')}

        return [
            {
                'quest_id': cq['id'],
                'school_subject': cq.get('transcript_subject') or 'electives',
                'course_name': cq.get('title'),
                'credits': CLASS_CREDIT_VALUE,
                'grade': 'A',
                'awarded_at': cq.get('class_review_submitted_at'),
            }
            for cq in classes
            if cq['id'] not in poe_quest_ids and not is_own_curriculum(cq)
        ]
