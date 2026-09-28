"""
Due dates on the tasks of a class quest (class_quest_task_due_dates).

iCreate, ticket 26c91e25 (Karina, 2026-09): "it isn't possible to create a
Quest like 'Out of the Dust' and then have different due dates for each week's
reading assignment. Is there a way to have a running due date list of
homework?" class_quests.due_date dates the whole quest; a row here dates one of
its steps.

One date per template task PER CLASS: every student in the class is held to the
same date, and two classes sharing a quest keep their own. The key is the
TEMPLATE task (quest_template_tasks.id), because a student's copy is rewritten
by resync while the template id is stable across edits; a student's copy finds
its date through user_quest_tasks.source_template_task_id.

Client-injected, like ClassQuestAudienceRepository: every caller already holds
the service-role client its own gate justified (the SIS moderator gate for
writes, the student's own enrollments for reads). With no client it takes the
admin client itself. The table is RLS-on with no policies, so the service role
is the only way to it.

Every read is bounded by ids the caller already holds (one class, or one
student's classes and quests), so a single request stays well under
PostgREST's 1000-row cap; the ids are chunked all the same.
"""

from typing import Any, Dict, Iterable, List, Optional

from utils.timestamps import now_iso

TABLE = 'class_quest_task_due_dates'
_CHUNK = 200
FIELDS = 'class_id, quest_id, template_task_id, due_date'


def _chunks(seq: Iterable, size: int = _CHUNK):
    seq = list(seq)
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


class ClassTaskDueDateRepository:

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: class_quest_task_due_dates is RLS-on with
            # no policies (service role only); every caller authorizes first --
            # the SIS moderator gate for writes, the student's own active
            # enrollments for reads.
            client = get_supabase_admin_client()
        self.client = client

    def template_task_on_quest(self, template_task_id: str, quest_id: str) -> bool:
        """Is this a preset task of this quest? A date keyed on another quest's
        task would reach that quest's students through a class that never
        assigned it."""
        rows = (self.client.table('quest_template_tasks').select('id')
                .eq('id', template_task_id).eq('quest_id', quest_id)
                .limit(1).execute()).data or []
        return bool(rows)

    def for_class_quest(self, class_id: str, quest_id: str) -> Dict[str, str]:
        """{template_task_id: due_date} for one quest on one class."""
        rows = (self.client.table(TABLE).select('template_task_id, due_date')
                .eq('class_id', class_id).eq('quest_id', quest_id)
                .execute()).data or []
        return {r['template_task_id']: r['due_date'] for r in rows if r.get('due_date')}

    def for_classes(self, class_ids: List[str],
                    quest_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Every dated task on these classes (optionally only these quests).

        Bounded by one student's classes: a handful of classes, each with a
        term's worth of dated tasks.
        """
        out: List[Dict[str, Any]] = []
        for chunk in _chunks(class_ids):
            query = self.client.table(TABLE).select(FIELDS).in_('class_id', chunk)
            if quest_ids is not None:
                if not quest_ids:
                    return []
                query = query.in_('quest_id', list(quest_ids))
            out.extend(query.order('due_date').execute().data or [])
        return out

    def soonest_for_student_quest(self, student_id: str, quest_id: str) -> Dict[str, str]:
        """{template_task_id: due_date} for one student's copy of one quest.

        The dates come from the student's active classes that carry the quest,
        published and meant for them (the same reading as
        utils/class_assignments). A quest on two of their classes can carry two
        dates for one task; the soonest wins, because that is the one they are
        held to -- the rule student_class_assignments applies to the quest's
        own date.
        """
        from utils.class_assignments import (
            assigned_to, published_filter, student_active_class_ids)

        class_ids = student_active_class_ids(self.client, student_id)
        if not class_ids:
            return {}
        links = (self.client.table('class_quests').select('class_id, student_ids')
                 .in_('class_id', class_ids).eq('quest_id', quest_id)
                 .or_(published_filter()).execute()).data or []
        carrying = [r['class_id'] for r in links if assigned_to(r, student_id)]
        if not carrying:
            return {}
        rows = (self.client.table(TABLE).select('template_task_id, due_date')
                .in_('class_id', carrying).eq('quest_id', quest_id)
                .execute()).data or []
        out: Dict[str, str] = {}
        for r in rows:
            tid, due = r.get('template_task_id'), r.get('due_date')
            if tid and due and (tid not in out or due < out[tid]):
                out[tid] = due
        return out

    def set(self, class_id: str, quest_id: str, template_task_id: str,
            due_date: str, set_by: Optional[str]) -> Optional[Dict[str, Any]]:
        """Set (insert or replace) one task's date on one class."""
        rows = (self.client.table(TABLE).upsert({
            'class_id': class_id,
            'quest_id': quest_id,
            'template_task_id': template_task_id,
            'due_date': due_date,
            'set_by': set_by,
            'updated_at': now_iso(),
        }, on_conflict='class_id,template_task_id').execute()).data or []
        return rows[0] if rows else None

    def clear(self, class_id: str, template_task_id: str) -> None:
        """Remove one task's date on one class. Clearing an undated task is a no-op."""
        (self.client.table(TABLE).delete()
         .eq('class_id', class_id).eq('template_task_id', template_task_id)
         .execute())
