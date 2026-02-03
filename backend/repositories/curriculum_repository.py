"""
Curriculum Repository

Handles database operations for quest curriculum content, attachments, and user progress.
Manages curriculum content stored as JSONB in quests table and related attachments.
"""

from typing import List, Dict, Optional, Any
from datetime import datetime
from repositories.base_repository import BaseRepository, NotFoundError, ValidationError
from utils.logger import get_logger

logger = get_logger(__name__)


class CurriculumRepository(BaseRepository):
    """Repository for quest curriculum operations."""

    table_name = 'quests'

    def get_lessons_by_quest(self, quest_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Get curriculum lessons/content for a quest.

        Args:
            quest_id: Quest ID
            user_id: Optional user ID for RLS (if checking permissions)

        Returns:
            Quest with curriculum_content, or None if not found
        """
        try:
            result = self.client.table(self.table_name)\
                .select('id, title, curriculum_content, curriculum_version, curriculum_last_edited_at')\
                .eq('id', quest_id)\
                .single()\
                .execute()

            if not result.data:
                return None

            return result.data
        except Exception as e:
            logger.error(f"Error fetching lessons for quest {quest_id}: {e}")
            return None

    def get_lesson_with_progress(
        self,
        quest_id: str,
        user_id: str,
        lesson_index: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Get curriculum lesson with user's progress.

        Args:
            quest_id: Quest ID
            user_id: User ID
            lesson_index: Optional specific lesson index within curriculum_content blocks

        Returns:
            Lesson data with progress information

        Raises:
            NotFoundError: If quest not found
        """
        try:
            # Get quest curriculum
            quest = self.client.table(self.table_name)\
                .select('id, title, curriculum_content, curriculum_version')\
                .eq('id', quest_id)\
                .single()\
                .execute()

            if not quest.data:
                raise NotFoundError(f"Quest {quest_id} not found")

            # Get user's quest enrollment for progress
            enrollment = self.client.table('user_quests')\
                .select('id, status, progress_percentage, started_at, completed_at')\
                .eq('quest_id', quest_id)\
                .eq('user_id', user_id)\
                .execute()

            curriculum_content = quest.data.get('curriculum_content') or {'blocks': []}

            result = {
                'quest_id': quest.data['id'],
                'quest_title': quest.data['title'],
                'curriculum_content': curriculum_content,
                'curriculum_version': quest.data.get('curriculum_version', 1),
                'enrollment': enrollment.data[0] if enrollment.data else None,
                'lesson_index': lesson_index
            }

            # If specific lesson requested, extract it
            if lesson_index is not None and curriculum_content.get('blocks'):
                blocks = curriculum_content.get('blocks', [])
                if 0 <= lesson_index < len(blocks):
                    result['current_lesson'] = blocks[lesson_index]
                else:
                    result['current_lesson'] = None

            return result
        except NotFoundError:
            raise
        except Exception as e:
            logger.error(f"Error fetching lesson with progress for quest {quest_id}, user {user_id}: {e}")
            raise

    def reorder_lessons(self, quest_id: str, new_order: List[int], user_id: str) -> Dict[str, Any]:
        """
        Reorder curriculum lessons/blocks within a quest.

        Args:
            quest_id: Quest ID
            new_order: List of block indices in new order
            user_id: User making the change (for audit)

        Returns:
            Updated quest curriculum data

        Raises:
            NotFoundError: If quest not found
            ValidationError: If new_order is invalid
        """
        try:
            # Get current curriculum
            quest = self.client.table(self.table_name)\
                .select('curriculum_content, curriculum_version')\
                .eq('id', quest_id)\
                .single()\
                .execute()

            if not quest.data:
                raise NotFoundError(f"Quest {quest_id} not found")

            curriculum_content = quest.data.get('curriculum_content') or {'blocks': []}
            current_blocks = curriculum_content.get('blocks', [])

            # Validate new_order
            if len(new_order) != len(current_blocks):
                raise ValidationError("New order must contain all existing blocks")

            if set(new_order) != set(range(len(current_blocks))):
                raise ValidationError("New order contains invalid indices")

            # Reorder blocks
            reordered_blocks = [current_blocks[i] for i in new_order]
            updated_content = {**curriculum_content, 'blocks': reordered_blocks}

            # Update in database
            result = self.client.table(self.table_name)\
                .update({
                    'curriculum_content': updated_content,
                    'curriculum_version': quest.data.get('curriculum_version', 1) + 1,
                    'curriculum_last_edited_by': user_id,
                    'curriculum_last_edited_at': datetime.utcnow().isoformat()
                })\
                .eq('id', quest_id)\
                .execute()

            if not result.data:
                raise NotFoundError(f"Quest {quest_id} not found")

            logger.info(f"Reordered lessons for quest {quest_id} by user {user_id[:8]}")
            return result.data[0]
        except (NotFoundError, ValidationError):
            raise
        except Exception as e:
            logger.error(f"Error reordering lessons for quest {quest_id}: {e}")
            raise

    def get_settings(self, quest_id: str) -> Optional[Dict[str, Any]]:
        """
        Get curriculum settings for a quest.

        Args:
            quest_id: Quest ID

        Returns:
            Curriculum settings including version, last edited info, etc.
        """
        try:
            result = self.client.table(self.table_name)\
                .select('curriculum_version, curriculum_last_edited_by, curriculum_last_edited_at')\
                .eq('id', quest_id)\
                .single()\
                .execute()

            return result.data if result.data else None
        except Exception as e:
            logger.error(f"Error fetching curriculum settings for quest {quest_id}: {e}")
            return None

    def update_settings(self, quest_id: str, settings: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """
        Update curriculum settings for a quest.

        Args:
            quest_id: Quest ID
            settings: Settings to update (can include metadata, display options, etc.)
            user_id: User making the change

        Returns:
            Updated quest data

        Raises:
            NotFoundError: If quest not found
        """
        try:
            # Prepare update data - only allow specific curriculum-related fields
            update_data = {
                'curriculum_last_edited_by': user_id,
                'curriculum_last_edited_at': datetime.utcnow().isoformat()
            }

            # If settings contains curriculum_content updates, include them
            if 'curriculum_content' in settings:
                update_data['curriculum_content'] = settings['curriculum_content']

                # Get current version to increment it
                current = self.client.table(self.table_name)\
                    .select('curriculum_version')\
                    .eq('id', quest_id)\
                    .single()\
                    .execute()

                if current.data:
                    update_data['curriculum_version'] = current.data.get('curriculum_version', 1) + 1

            result = self.client.table(self.table_name)\
                .update(update_data)\
                .eq('id', quest_id)\
                .execute()

            if not result.data:
                raise NotFoundError(f"Quest {quest_id} not found")

            logger.info(f"Updated curriculum settings for quest {quest_id} by user {user_id[:8]}")
            return result.data[0]
        except NotFoundError:
            raise
        except Exception as e:
            logger.error(f"Error updating curriculum settings for quest {quest_id}: {e}")
            raise

    def search_lessons(
        self,
        search_term: str,
        organization_id: Optional[str] = None,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Search curriculum lessons across quests.

        Args:
            search_term: Text to search for in curriculum content
            organization_id: Optional organization filter
            limit: Maximum results to return

        Returns:
            List of quests with matching curriculum content
        """
        try:
            # Build query
            query = self.client.table(self.table_name)\
                .select('id, title, curriculum_content, organization_id')\
                .not_.is_('curriculum_content', 'null')

            # Filter by organization if provided
            if organization_id:
                query = query.eq('organization_id', organization_id)

            # Execute query
            result = query.limit(limit).execute()

            if not result.data:
                return []

            # Filter results by search term in curriculum content
            # Note: This is client-side filtering. For production, consider PostgreSQL full-text search
            matches = []
            search_lower = search_term.lower()

            for quest in result.data:
                curriculum = quest.get('curriculum_content', {})
                blocks = curriculum.get('blocks', [])

                # Search within blocks
                for block in blocks:
                    content = str(block.get('content', '')).lower()
                    if search_lower in content:
                        matches.append(quest)
                        break  # Found match in this quest, move to next

            logger.info(f"Search for '{search_term}' returned {len(matches)} results")
            return matches[:limit]
        except Exception as e:
            logger.error(f"Error searching lessons: {e}")
            return []


class CurriculumAttachmentRepository(BaseRepository):
    """Repository for curriculum attachment operations."""

    table_name = 'curriculum_attachments'

    def find_by_quest(self, quest_id: str) -> List[Dict[str, Any]]:
        """
        Get all attachments for a quest.

        Args:
            quest_id: Quest ID

        Returns:
            List of attachments
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*')\
                .eq('quest_id', quest_id)\
                .eq('is_deleted', False)\
                .order('created_at', desc=False)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching attachments for quest {quest_id}: {e}")
            return []

    def create_attachment(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a curriculum attachment record.

        Args:
            data: Attachment data (quest_id, file_url, file_name, file_type, etc.)

        Returns:
            Created attachment

        Raises:
            ValidationError: If required fields missing
        """
        required_fields = ['quest_id', 'file_url', 'file_name', 'file_type', 'uploaded_by', 'organization_id']
        missing = [f for f in required_fields if f not in data]

        if missing:
            raise ValidationError(f"Missing required fields: {', '.join(missing)}")

        try:
            result = self.client.table(self.table_name)\
                .insert(data)\
                .execute()

            if not result.data:
                raise ValidationError("Failed to create attachment")

            logger.info(f"Created attachment {data['file_name']} for quest {data['quest_id']}")
            return result.data[0]
        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"Error creating attachment: {e}")
            raise

    def soft_delete(self, attachment_id: str, user_id: str) -> bool:
        """
        Soft delete an attachment (preserves audit trail).

        Args:
            attachment_id: Attachment ID
            user_id: User performing deletion

        Returns:
            True if deleted successfully

        Raises:
            NotFoundError: If attachment not found
        """
        try:
            result = self.client.table(self.table_name)\
                .update({
                    'is_deleted': True,
                    'deleted_at': datetime.utcnow().isoformat(),
                    'deleted_by': user_id
                })\
                .eq('id', attachment_id)\
                .execute()

            if not result.data:
                raise NotFoundError(f"Attachment {attachment_id} not found")

            logger.info(f"Soft deleted attachment {attachment_id} by user {user_id[:8]}")
            return True
        except Exception as e:
            logger.error(f"Error soft deleting attachment {attachment_id}: {e}")
            raise

    def get_by_id(self, attachment_id: str) -> Optional[Dict[str, Any]]:
        """
        Get attachment by ID.

        Args:
            attachment_id: Attachment ID

        Returns:
            Attachment data or None if not found
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*')\
                .eq('id', attachment_id)\
                .single()\
                .execute()

            return result.data if result.data else None
        except Exception as e:
            logger.error(f"Error fetching attachment {attachment_id}: {e}")
            return None
