"""Reads and writes behind evidence a helper adds to a student's task.

A helper is anyone who is not the student: a parent or advisor through
/api/evidence/helper/*, or a teacher capturing work from the Students page
(services/staff_task_capture.py, ticket 77637c3a). Every caller has already
decided the helper may act for this student; nothing here checks access.
"""

from typing import Any, Dict, List, Optional

from utils.logger import get_logger
from utils.storage_urls import canonical_stored_url

logger = get_logger(__name__)


class HelperEvidenceRepository:
    def __init__(self, client):
        self.client = client

    def task_for_student(self, task_id: str, student_id: str) -> Optional[Dict[str, Any]]:
        """The student's own copy of a task, or None for another student's."""
        rows = (self.client.table('user_quest_tasks')
                .select('id, quest_id, title, pillar, xp_value, approval_status')
                .eq('id', task_id).eq('user_id', student_id).limit(1).execute()).data or []
        return rows[0] if rows else None

    def enrollments(self, student_id: str, quest_id: str) -> List[Dict[str, Any]]:
        return (self.client.table('user_quests').select('is_active, completed_at')
                .eq('user_id', student_id).eq('quest_id', quest_id).execute()).data or []

    def completion_for(self, student_id: str, task_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('quest_task_completions').select('id')
                .eq('user_id', student_id).eq('user_quest_task_id', task_id)
                .limit(1).execute()).data or []
        return rows[0] if rows else None

    def record_xp_failure(self, row: Dict[str, Any]) -> None:
        """For reconciliation, as the student's own completion records one."""
        self.client.table('xp_award_failures').insert(row).execute()

    def create_learning_event(self, student_id, uploader_id, uploader_role,
                              quest_id, task_id, task_title, block_type, content) -> None:
        """A journal entry for helper evidence, so it appears in the student's
        learning journal (grouped under the quest topic) and activity feed.

        `attached_task_id` is set so the observer feed's "skip task-attached
        learning_events" filter (feed.py -- `is_('attached_task_id', 'null')`)
        actually catches it. Without this, every helper-evidence upload would
        surface as TWO feed items: one from the evidence_document_blocks path,
        plus a duplicate from this learning_event.

        Moved from routes/helper_evidence.py (2026-10-15) so the staff capture
        service can write the same entry without importing a route module.
        """
        source_type = 'parent_captured' if uploader_role == 'parent' else 'advisor_captured'

        if block_type == 'text':
            description = content.get('text', 'Evidence uploaded')
        else:
            description = f"Evidence uploaded for task: {task_title}"

        event_response = self.client.table('learning_events').insert({
            'user_id': student_id,
            'captured_by_user_id': uploader_id,
            'description': description,
            'source_type': source_type,
            'quest_id': quest_id,
            'attached_task_id': task_id,
            'pillars': []
        }).execute()
        if not event_response.data:
            return

        event_id = event_response.data[0]['id']

        try:
            self.client.table('learning_event_topics').insert({
                'learning_event_id': event_id,
                'topic_type': 'quest',
                'topic_id': quest_id
            }).execute()
        except Exception:
            logger.debug("intentional swallow", exc_info=True)  # Duplicate or constraint error, non-fatal

        block_data = {
            'learning_event_id': event_id,
            'block_type': block_type,
            'content': content,
            'order_index': 0
        }
        # Callers reduce `content` to canonical pointers before this runs;
        # reduce again here so the mirrored column can never diverge from the
        # block it copies.
        if content.get('url') and block_type in ('image', 'document'):
            block_data['file_url'] = canonical_stored_url(content['url'])

        self.client.table('learning_event_evidence_blocks').insert(block_data).execute()

        logger.info(f"Created learning event {event_id} for helper evidence (quest={quest_id}, student={student_id})")
