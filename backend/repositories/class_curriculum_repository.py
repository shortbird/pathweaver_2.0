"""
A class's curricula and the class_quests rows they feed.

The data access behind services/class_curriculum_assign: which curricula are
attached to a class (in the order they were attached), which quests each one
saves, and the class's own quest links that a curriculum is copied onto.

Client-injected, like ClassQuestAudienceRepository: every caller already holds
the service-role client that the class moderator gate above it justified.

Every read is bounded by one class: its handful of attached curricula, their
saved quest sets, and its own class_quests rows.
"""

from typing import Any, Dict, List


class ClassCurriculumRepository:

    def __init__(self, client):
        self.client = client

    def attached_curricula(self, class_id: str) -> List[Dict[str, Any]]:
        """The ACTIVE curricula attached to this class, as {id, title}, in the
        order they were attached (sis_curriculum_classes.created_at)."""
        links = (self.client.table('sis_curriculum_classes')
                 .select('curriculum_id, created_at')
                 .eq('class_id', class_id).order('created_at').execute()).data or []
        ids = list(dict.fromkeys(l['curriculum_id'] for l in links if l.get('curriculum_id')))
        if not ids:
            return []
        rows = (self.client.table('sis_curriculum').select('id, title, is_active')
                .in_('id', ids).eq('is_active', True).execute()).data or []
        by_id = {r['id']: r for r in rows}
        return [{'id': cid, 'title': by_id[cid].get('title')} for cid in ids if cid in by_id]

    def saved_quests(self, curriculum_ids: List[str]) -> List[Dict[str, Any]]:
        """sis_curriculum_quests rows for these curricula, in saved order."""
        if not curriculum_ids:
            return []
        return (self.client.table('sis_curriculum_quests')
                .select('curriculum_id, quest_id, sequence_order')
                .in_('curriculum_id', list(curriculum_ids))
                .order('sequence_order').execute()).data or []

    def class_links(self, class_id: str) -> List[Dict[str, Any]]:
        """This class's quest links: id, quest_id, sequence_order, student_ids."""
        return (self.client.table('class_quests')
                .select('id, quest_id, sequence_order, student_ids')
                .eq('class_id', class_id).execute()).data or []

    def add_links(self, rows: List[Dict[str, Any]]) -> None:
        if rows:
            self.client.table('class_quests').upsert(
                rows, on_conflict='class_id,quest_id').execute()

    def remove_link(self, class_id: str, quest_id: str) -> None:
        """Take one quest off ONE class. Other classes' links are not touched."""
        self.client.table('class_quests').delete() \
            .eq('class_id', class_id).eq('quest_id', quest_id).execute()
