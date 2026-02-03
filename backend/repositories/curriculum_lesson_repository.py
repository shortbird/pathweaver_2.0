"""
Curriculum Lesson Repository

Database operations for curriculum_lessons and curriculum_lesson_tasks tables.
Provides optimized batch queries for lesson and task management.

Usage:
    from repositories.curriculum_lesson_repository import CurriculumLessonRepository

    repo = CurriculumLessonRepository()  # Uses admin client

    # Get lessons for multiple quests at once
    lessons_map = repo.get_lessons_by_quest_ids(quest_ids)

    # Get linked task IDs for lessons
    task_map = repo.get_lesson_tasks_map(lesson_ids)

    # Get lesson progress for a user
    progress_map = repo.get_lesson_progress_map(user_id, quest_ids)
"""

from typing import Optional, Dict, List, Any
from datetime import datetime
from repositories.base_repository import BaseRepository, NotFoundError, ValidationError
from utils.logger import get_logger

logger = get_logger(__name__)


class CurriculumLessonRepository(BaseRepository):
    """Repository for curriculum lesson database operations."""

    table_name = 'curriculum_lessons'
    id_column = 'id'

    def get_lessons_by_quest(
        self,
        quest_id: str,
        include_unpublished: bool = False,
        include_content: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Get all lessons for a quest.

        Args:
            quest_id: Quest ID
            include_unpublished: Whether to include unpublished lessons
            include_content: Whether to include lesson content (larger payload)

        Returns:
            List of lesson records ordered by sequence_order
        """
        try:
            # Select fields based on include_content
            if include_content:
                fields = 'id, title, description, sequence_order, estimated_duration_minutes, xp_threshold, is_published, content, organization_id, created_by'
            else:
                fields = 'id, title, description, sequence_order, estimated_duration_minutes, xp_threshold, is_published, organization_id, created_by'

            query = self.client.table(self.table_name)\
                .select(fields)\
                .eq('quest_id', quest_id)\
                .order('sequence_order')

            if not include_unpublished:
                query = query.neq('is_published', False)

            result = query.execute()
            return result.data or []

        except Exception as e:
            logger.error(f"Error fetching lessons for quest {quest_id}: {e}")
            return []

    def get_lessons_by_quest_ids(
        self,
        quest_ids: List[str],
        include_unpublished: bool = False
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get lessons for multiple quests in a single query (prevents N+1).

        Args:
            quest_ids: List of quest IDs
            include_unpublished: Whether to include unpublished lessons

        Returns:
            Dictionary mapping quest_id -> list of lessons
        """
        if not quest_ids:
            return {}

        try:
            query = self.client.table(self.table_name)\
                .select('id, quest_id, title, description, sequence_order, estimated_duration_minutes, xp_threshold, is_published')\
                .in_('quest_id', quest_ids)\
                .order('sequence_order')

            if not include_unpublished:
                query = query.neq('is_published', False)

            result = query.execute()

            # Group by quest_id
            lessons_by_quest: Dict[str, List[Dict]] = {qid: [] for qid in quest_ids}
            for lesson in (result.data or []):
                qid = lesson['quest_id']
                if qid in lessons_by_quest:
                    lessons_by_quest[qid].append(lesson)

            return lessons_by_quest

        except Exception as e:
            logger.error(f"Error fetching lessons for quests: {e}")
            return {qid: [] for qid in quest_ids}

    def get_lesson_by_id(
        self,
        lesson_id: str,
        include_content: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Get a single lesson by ID.

        Args:
            lesson_id: Lesson ID
            include_content: Whether to include lesson content

        Returns:
            Lesson record or None if not found
        """
        try:
            fields = '*' if include_content else 'id, quest_id, title, description, sequence_order, estimated_duration_minutes, xp_threshold, is_published, organization_id, created_by'

            result = self.client.table(self.table_name)\
                .select(fields)\
                .eq('id', lesson_id)\
                .execute()

            return result.data[0] if result.data else None

        except Exception as e:
            logger.error(f"Error fetching lesson {lesson_id}: {e}")
            return None

    def get_lesson_tasks_map(
        self,
        quest_ids: List[str]
    ) -> Dict[str, List[str]]:
        """
        Get linked task IDs for all lessons in specified quests.

        Args:
            quest_ids: List of quest IDs

        Returns:
            Dictionary mapping lesson_id -> list of task_ids
        """
        if not quest_ids:
            return {}

        try:
            result = self.client.table('curriculum_lesson_tasks')\
                .select('lesson_id, task_id')\
                .in_('quest_id', quest_ids)\
                .execute()

            # Build mapping
            task_map: Dict[str, List[str]] = {}
            for link in (result.data or []):
                lesson_id = link['lesson_id']
                if lesson_id not in task_map:
                    task_map[lesson_id] = []
                task_map[lesson_id].append(link['task_id'])

            return task_map

        except Exception as e:
            logger.error(f"Error fetching lesson tasks map: {e}")
            return {}

    def get_lesson_progress_map(
        self,
        user_id: str,
        quest_ids: List[str]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get lesson progress for a user across multiple quests.

        Args:
            user_id: User ID
            quest_ids: List of quest IDs

        Returns:
            Dictionary mapping lesson_id -> progress data
        """
        if not quest_ids:
            return {}

        try:
            result = self.client.table('curriculum_lesson_progress')\
                .select('lesson_id, status, progress_percentage, completed_steps, current_step_index')\
                .eq('user_id', user_id)\
                .in_('quest_id', quest_ids)\
                .execute()

            progress_map = {}
            for lp in (result.data or []):
                progress_map[lp['lesson_id']] = {
                    'status': lp.get('status', 'not_started'),
                    'progress_percentage': lp.get('progress_percentage', 0),
                    'completed_steps': lp.get('completed_steps', []),
                    'current_step_index': lp.get('current_step_index', 0)
                }

            return progress_map

        except Exception as e:
            logger.warning(f"Could not fetch lesson progress: {e}")
            return {}

    def create_lesson(
        self,
        quest_id: str,
        title: str,
        organization_id: str,
        created_by: str,
        description: Optional[str] = None,
        content: Optional[Dict] = None,
        xp_threshold: int = 0,
        estimated_duration_minutes: Optional[int] = None,
        is_published: bool = True
    ) -> Dict[str, Any]:
        """
        Create a new lesson.

        Args:
            quest_id: Quest ID
            title: Lesson title
            organization_id: Organization ID
            created_by: Creator user ID
            description: Lesson description
            content: Lesson content (JSON)
            xp_threshold: XP required to complete lesson
            estimated_duration_minutes: Estimated duration
            is_published: Whether lesson is visible

        Returns:
            Created lesson record
        """
        try:
            # Get next sequence order
            existing = self.client.table(self.table_name)\
                .select('sequence_order')\
                .eq('quest_id', quest_id)\
                .order('sequence_order', desc=True)\
                .limit(1)\
                .execute()

            next_order = (existing.data[0]['sequence_order'] + 1) if existing.data else 0

            data = {
                'quest_id': quest_id,
                'title': title,
                'description': description,
                'content': content or {'version': 2, 'steps': []},
                'sequence_order': next_order,
                'xp_threshold': xp_threshold,
                'estimated_duration_minutes': estimated_duration_minutes,
                'is_published': is_published,
                'organization_id': organization_id,
                'created_by': created_by
            }

            result = self.client.table(self.table_name).insert(data).execute()

            if not result.data:
                raise ValidationError("Failed to create lesson")

            logger.info(f"Created lesson '{title}' for quest {quest_id[:8]}")
            return result.data[0]

        except Exception as e:
            logger.error(f"Error creating lesson: {e}")
            raise

    def update_lesson(
        self,
        lesson_id: str,
        updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update a lesson.

        Args:
            lesson_id: Lesson ID
            updates: Fields to update

        Returns:
            Updated lesson record
        """
        try:
            result = self.client.table(self.table_name)\
                .update(updates)\
                .eq('id', lesson_id)\
                .execute()

            if not result.data:
                raise NotFoundError(f"Lesson {lesson_id} not found")

            logger.info(f"Updated lesson {lesson_id[:8]}")
            return result.data[0]

        except NotFoundError:
            raise
        except Exception as e:
            logger.error(f"Error updating lesson {lesson_id}: {e}")
            raise

    def delete_lesson(self, lesson_id: str) -> bool:
        """
        Delete a lesson.

        Args:
            lesson_id: Lesson ID

        Returns:
            True if deleted
        """
        try:
            # First delete linked tasks
            self.client.table('curriculum_lesson_tasks')\
                .delete()\
                .eq('lesson_id', lesson_id)\
                .execute()

            # Delete lesson progress
            self.client.table('curriculum_lesson_progress')\
                .delete()\
                .eq('lesson_id', lesson_id)\
                .execute()

            # Delete lesson
            result = self.client.table(self.table_name)\
                .delete()\
                .eq('id', lesson_id)\
                .execute()

            if not result.data:
                raise NotFoundError(f"Lesson {lesson_id} not found")

            logger.info(f"Deleted lesson {lesson_id[:8]}")
            return True

        except NotFoundError:
            raise
        except Exception as e:
            logger.error(f"Error deleting lesson {lesson_id}: {e}")
            raise

    def reorder_lessons(
        self,
        quest_id: str,
        lesson_ids: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Reorder lessons within a quest.

        Uses two-phase update (negative then positive) to avoid unique constraint issues.

        Args:
            quest_id: Quest ID
            lesson_ids: List of lesson IDs in new order

        Returns:
            Updated lesson records
        """
        try:
            updated = []

            # Phase 1: Set negative sequence orders to avoid conflicts
            for i, lesson_id in enumerate(lesson_ids):
                self.client.table(self.table_name)\
                    .update({'sequence_order': -(i + 1)})\
                    .eq('id', lesson_id)\
                    .eq('quest_id', quest_id)\
                    .execute()

            # Phase 2: Set final positive sequence orders
            for i, lesson_id in enumerate(lesson_ids):
                result = self.client.table(self.table_name)\
                    .update({'sequence_order': i})\
                    .eq('id', lesson_id)\
                    .eq('quest_id', quest_id)\
                    .execute()

                if result.data:
                    updated.extend(result.data)

            logger.info(f"Reordered {len(updated)} lessons in quest {quest_id[:8]}")
            return updated

        except Exception as e:
            logger.error(f"Error reordering lessons: {e}")
            raise

    def link_task_to_lesson(
        self,
        lesson_id: str,
        task_id: str,
        quest_id: str
    ) -> Dict[str, Any]:
        """
        Link a task to a lesson.

        Args:
            lesson_id: Lesson ID
            task_id: Task ID (user_quest_tasks.id)
            quest_id: Quest ID

        Returns:
            Created link record
        """
        try:
            result = self.client.table('curriculum_lesson_tasks')\
                .insert({
                    'lesson_id': lesson_id,
                    'task_id': task_id,
                    'quest_id': quest_id
                })\
                .execute()

            if not result.data:
                raise ValidationError("Failed to link task to lesson")

            logger.info(f"Linked task {task_id[:8]} to lesson {lesson_id[:8]}")
            return result.data[0]

        except Exception as e:
            logger.error(f"Error linking task to lesson: {e}")
            raise

    def unlink_task_from_lesson(
        self,
        lesson_id: str,
        task_id: str
    ) -> bool:
        """
        Unlink a task from a lesson.

        Args:
            lesson_id: Lesson ID
            task_id: Task ID

        Returns:
            True if unlinked
        """
        try:
            result = self.client.table('curriculum_lesson_tasks')\
                .delete()\
                .eq('lesson_id', lesson_id)\
                .eq('task_id', task_id)\
                .execute()

            if not result.data:
                raise NotFoundError("Task link not found")

            logger.info(f"Unlinked task {task_id[:8]} from lesson {lesson_id[:8]}")
            return True

        except NotFoundError:
            raise
        except Exception as e:
            logger.error(f"Error unlinking task from lesson: {e}")
            raise

    def get_linked_tasks_for_lesson(
        self,
        lesson_id: str
    ) -> List[str]:
        """
        Get all task IDs linked to a lesson.

        Args:
            lesson_id: Lesson ID

        Returns:
            List of task IDs
        """
        try:
            result = self.client.table('curriculum_lesson_tasks')\
                .select('task_id')\
                .eq('lesson_id', lesson_id)\
                .execute()

            return [link['task_id'] for link in (result.data or [])]

        except Exception as e:
            logger.error(f"Error fetching linked tasks for lesson {lesson_id}: {e}")
            return []
