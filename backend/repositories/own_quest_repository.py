"""Queries behind "Delete quest" on a quest a family made for itself.

Ticket bd1be541, Karen Boyd (parent, Optio Academy): "I created a couple of
quests that I ended up not wanting to use... I can't see how to delete old
quests." The rule lives in services/own_quest_delete.py; the reads and
deletes it needs live here.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class OwnQuestRepository(BaseRepository):
    table_name = 'quests'

    def quest(self, quest_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('quests')
                .select('id, title, created_by, is_public, organization_id, '
                        'quest_type, lms_platform, metadata')
                .eq('id', quest_id).limit(1).execute()).data or []
        return rows[0] if rows else None

    def is_on_a_course_or_class(self, quest_id: str) -> bool:
        """A project in a course, or a quest a class assigns, belongs to that
        course or class, whoever typed its title."""
        for table in ('course_quests', 'class_quests'):
            res = (self.client.table(table).select('quest_id', count='exact')
                   .eq('quest_id', quest_id).limit(1).execute())
            if res.count:
                return True
        return False

    def enrollment_ids(self, user_id: str, quest_id: str) -> List[str]:
        rows = (self.client.table('user_quests').select('id')
                .eq('user_id', user_id).eq('quest_id', quest_id)
                .execute()).data or []
        return [r['id'] for r in rows]

    def has_work(self, user_id: str, quest_id: str, enrollment_ids: List[str]) -> bool:
        """Any completed task, or any evidence block, on these enrollments.
        Bounded by one student on one quest. An evidence document with no
        blocks is an empty draft the workspace opened, not work."""
        if enrollment_ids:
            tasks = (self.client.table('user_quest_tasks').select('id')
                     .in_('user_quest_id', enrollment_ids).execute()).data or []
            task_ids = [t['id'] for t in tasks]
            if task_ids:
                done = (self.client.table('quest_task_completions')
                        .select('id', count='exact')
                        .in_('user_quest_task_id', task_ids).limit(1).execute())
                if done.count:
                    return True
        docs = (self.client.table('user_task_evidence_documents').select('id')
                .eq('user_id', user_id).eq('quest_id', quest_id)
                .execute()).data or []
        doc_ids = [d['id'] for d in docs]
        if doc_ids:
            blocks = (self.client.table('evidence_document_blocks')
                      .select('id', count='exact')
                      .in_('document_id', doc_ids).limit(1).execute())
            if blocks.count:
                return True
        return False

    def other_learner_count(self, quest_id: str, user_id: str) -> int:
        res = (self.client.table('user_quests').select('id', count='exact')
               .eq('quest_id', quest_id).neq('user_id', user_id)
               .limit(1).execute())
        return res.count or 0

    def delete_enrollments(self, enrollment_ids: List[str]) -> None:
        """Tasks, completions and evidence documents cascade from user_quests."""
        if enrollment_ids:
            (self.client.table('user_quests').delete()
             .in_('id', enrollment_ids).execute())

    def delete_quest(self, quest_id: str) -> None:
        """The quest row. Its sessions, sample tasks and links cascade; a
        partner offering built on it restricts, and the APIError reaches the
        caller."""
        self.client.table('quests').delete().eq('id', quest_id).execute()
