"""
Quest Editor Repository - the reads and writes behind the one SIS quest form.

Behind routes/sis/quest_editor.py and services/sis_quest_editor.py (P6 of
docs/icreate/TASKS_MESSAGING_QUESTS_PLAN_2026-09-23.md). Every SIS surface that
makes or edits a quest -- the library, a class's Quests tab, a curriculum, the
training catalog -- opens the same editor over these rows.

A draft is an ordinary quests row with is_active false and
metadata.draft = {context, target_id, started_by}. Inactive is what every other
read already keys off (discovery, enrollment, the assign pickers), so nothing
else had to learn the word; the metadata key is what tells a draft apart from a
quest somebody retired, which is also inactive.

The client is the admin client, as for every SIS console read: the routes'
role, org and per-quest gates are the authorization (services/quest_edit_rules).
"""

from typing import Any, Dict, List, Optional

from postgrest.exceptions import APIError

from repositories.base_repository import BaseRepository, DatabaseError
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)

EDITOR_COLUMNS = ('id, title, description, big_idea, header_image_url, image_url, is_active, '
                  'is_public, organization_id, created_by, created_at, updated_at, metadata, '
                  'xp_threshold, allow_custom_tasks, teachers_may_change_xp, source_material')


class QuestEditorRepository(BaseRepository):
    """Repository for the quest form's own reads and writes."""

    table_name = 'quests'
    id_column = 'id'

    def get_quest(self, quest_id: str) -> Optional[Dict[str, Any]]:
        try:
            rows = (self.client.table(self.table_name).select(EDITOR_COLUMNS)
                    .eq('id', quest_id).limit(1).execute()).data
            return rows[0] if rows else None
        except APIError as e:
            logger.error(f"Error reading quest {quest_id}: {e}")
            raise DatabaseError("Failed to read the quest") from e

    def template_tasks(self, quest_id: str) -> List[Dict[str, Any]]:
        """The quest's preset tasks in order. Bounded by one quest (MAX_TASKS)."""
        try:
            return (self.client.table('quest_template_tasks').select('*')
                    .eq('quest_id', quest_id).order('order_index').execute()).data or []
        except APIError as e:
            logger.error(f"Error reading tasks for quest {quest_id}: {e}")
            raise DatabaseError("Failed to read the quest's tasks") from e

    def update_quest(self, quest_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            rows = (self.client.table(self.table_name).update(fields)
                    .eq('id', quest_id).execute()).data
            return rows[0] if rows else None
        except APIError as e:
            logger.error(f"Error updating quest {quest_id}: {e}")
            raise DatabaseError("Failed to save the quest") from e

    def list_drafts(self, org_id: str, *, context: Optional[str] = None,
                    target_id: Optional[str] = None,
                    created_by: Optional[str] = None) -> List[Dict[str, Any]]:
        """This school's drafts, newest edit first.

        Paged: drafts are never deleted automatically (owner, 2026-09-23), so
        the list only grows until somebody discards one.
        """
        def query():
            q = (self.client.table(self.table_name)
                 .select('id, title, description, created_by, created_at, updated_at, metadata')
                 .eq('organization_id', org_id).eq('is_active', False)
                 .is_('archived_at', 'null')
                 .not_.is_('metadata->draft', 'null'))
            if context:
                q = q.eq('metadata->draft->>context', context)
            if target_id:
                q = q.eq('metadata->draft->>target_id', target_id)
            if created_by:
                q = q.eq('created_by', created_by)
            return q
        try:
            rows = fetch_all_rows(query)
        except APIError as e:
            logger.error(f"Error listing drafts for {org_id}: {e}")
            raise DatabaseError("Failed to list drafts") from e
        # Paged by id (fetch_all_rows needs a unique key); the order people
        # want is the one they last touched.
        return sorted(rows, key=lambda r: r.get('updated_at') or r.get('created_at') or '',
                      reverse=True)

    def resource_count(self, quest_id: str) -> int:
        try:
            res = (self.client.table('quest_resources').select('id', count='exact')
                   .eq('quest_id', quest_id).limit(1).execute())
            return res.count or 0
        except APIError as e:
            logger.error(f"Error counting resources for quest {quest_id}: {e}")
            raise DatabaseError("Failed to read the quest's attachments") from e

    def delete_draft(self, quest_id: str) -> None:
        """Delete a draft and what hangs off it.

        Only ever called on a quest that is inactive and still marked a draft,
        which the service checks first; a draft has no class, curriculum or
        student rows, so the template tasks (and, by cascade, their
        resources) and a training catalog row are all there is.
        """
        try:
            self.client.table('sis_staff_training').delete().eq('quest_id', quest_id).execute()
            self.client.table('quest_resources').delete().eq('quest_id', quest_id).execute()
            self.client.table('quest_template_tasks').delete().eq('quest_id', quest_id).execute()
            (self.client.table(self.table_name).delete()
             .eq('id', quest_id).eq('is_active', False).execute())
        except APIError as e:
            logger.error(f"Error deleting draft {quest_id}: {e}")
            raise DatabaseError("Failed to discard the draft") from e

    def has_enrollments(self, quest_id: str) -> bool:
        try:
            rows = (self.client.table('user_quests').select('id')
                    .eq('quest_id', quest_id).limit(1).execute()).data
            return bool(rows)
        except APIError as e:
            logger.error(f"Error reading enrollments for quest {quest_id}: {e}")
            raise DatabaseError("Failed to read the quest's learners") from e

    def names(self, user_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        if not user_ids:
            return {}
        from utils.person_name import USER_NAME_FIELDS
        rows = fetch_all_rows(lambda: self.client.table('users')
                              .select(f'id, {USER_NAME_FIELDS}').in_('id', user_ids))
        return {r['id']: r for r in rows}

    def class_names(self, class_ids: List[str]) -> Dict[str, str]:
        if not class_ids:
            return {}
        rows = fetch_all_rows(lambda: self.client.table('org_classes')
                              .select('id, name').in_('id', class_ids))
        return {r['id']: r.get('name') or 'Class' for r in rows}

    def curriculum_names(self, curriculum_ids: List[str]) -> Dict[str, str]:
        if not curriculum_ids:
            return {}
        rows = fetch_all_rows(lambda: self.client.table('sis_curriculum')
                              .select('id, title').in_('id', curriculum_ids))
        return {r['id']: r.get('title') or 'Curriculum' for r in rows}

    def org_logo(self, org_id: str) -> Optional[str]:
        """The school's logo (usually a base64 data URI, which is how
        SisOrgSettings stores an upload), or None. Never raises: artwork is
        not worth failing a publish over."""
        try:
            rows = (self.client.table('organizations').select('branding_config')
                    .eq('id', org_id).limit(1).execute()).data
            return ((rows[0].get('branding_config') or {}).get('logo_url') or None) if rows else None
        except Exception as e:  # noqa: BLE001
            logger.warning(f'Could not read org logo for {org_id}: {e}')
            return None

    def find_class(self, class_id: str) -> Optional[Dict[str, Any]]:
        """The class and the ids that teach it, for the class moderator gate."""
        try:
            rows = (self.client.table('org_classes')
                    .select('id, organization_id, primary_instructor_id, assistant_instructor_ids')
                    .eq('id', class_id).limit(1).execute()).data
            return rows[0] if rows else None
        except APIError as e:
            logger.error(f"Error reading class {class_id}: {e}")
            raise DatabaseError("Failed to read the class") from e

    def training_row_for(self, quest_id: str, org_id: str) -> Optional[Dict[str, Any]]:
        try:
            rows = (self.client.table('sis_staff_training').select('id, audience, audiences')
                    .eq('quest_id', quest_id).eq('organization_id', org_id)
                    .limit(1).execute()).data
            return rows[0] if rows else None
        except APIError as e:
            logger.error(f"Error reading training row for quest {quest_id}: {e}")
            raise DatabaseError("Failed to read the training catalog") from e

    def insert_training_row(self, row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            rows = self.client.table('sis_staff_training').insert(row).execute().data
            return rows[0] if rows else None
        except APIError as e:
            logger.error(f"Error adding quest {row.get('quest_id')} to training: {e}")
            raise DatabaseError("Failed to add the quest to training") from e

    def last_training_order(self, org_id: str, audience: str) -> int:
        try:
            rows = (self.client.table('sis_staff_training').select('id, sequence_order')
                    .eq('organization_id', org_id).eq('audience', audience)
                    .order('sequence_order', desc=True).limit(1).execute()).data
            return ((rows[0].get('sequence_order') or 0) + 1) if rows else 0
        except APIError as e:
            logger.error(f"Error reading training order for {org_id}: {e}")
            raise DatabaseError("Failed to read the training catalog") from e
