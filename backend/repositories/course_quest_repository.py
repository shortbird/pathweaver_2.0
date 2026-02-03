"""
Course Quest Repository

Database operations for course_quests junction table and related queries.
Handles course-quest relationships, ordering, and enrollment lookups.

Usage:
    from repositories.course_quest_repository import CourseQuestRepository

    repo = CourseQuestRepository()

    # Get quests for a course with details
    quests = repo.get_quests_with_details(course_id)

    # Get user's enrollments for course quests
    enrollments = repo.get_quest_enrollments(user_id, quest_ids)
"""

from typing import Optional, Dict, List, Any
from repositories.base_repository import BaseRepository, NotFoundError, ValidationError
from utils.logger import get_logger

logger = get_logger(__name__)


class CourseQuestRepository(BaseRepository):
    """Repository for course_quests junction table operations."""

    table_name = 'course_quests'
    id_column = 'id'

    def get_quests_for_course(
        self,
        course_id: str,
        include_unpublished: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Get all quests in a course, ordered by sequence.

        Args:
            course_id: Course ID
            include_unpublished: Whether to include unpublished quests

        Returns:
            List of course_quests records with quest details
        """
        try:
            query = self.client.table(self.table_name)\
                .select('quest_id, sequence_order, xp_threshold, custom_title, is_required, is_published, quests(id, title, description, header_image_url)')\
                .eq('course_id', course_id)\
                .order('sequence_order')

            if not include_unpublished:
                query = query.neq('is_published', False)

            result = query.execute()
            return result.data or []

        except Exception as e:
            logger.error(f"Error fetching quests for course {course_id}: {e}")
            return []

    def get_quests_with_details(
        self,
        course_id: str,
        include_unpublished: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Get quests for a course with flattened quest details.

        Args:
            course_id: Course ID
            include_unpublished: Whether to include unpublished quests

        Returns:
            List of quest data with order_index and course_quest properties
        """
        try:
            raw_data = self.get_quests_for_course(course_id, include_unpublished)

            quests = []
            for cq in raw_data:
                quest_data = cq.get('quests', {}) or {}
                quest_id = quest_data.get('id') or cq.get('quest_id')

                if not quest_id:
                    continue

                quests.append({
                    'id': quest_id,
                    'title': cq.get('custom_title') or quest_data.get('title'),
                    'description': quest_data.get('description'),
                    'header_image_url': quest_data.get('header_image_url'),
                    'sequence_order': cq.get('sequence_order', 0),
                    'xp_threshold': cq.get('xp_threshold', 0),
                    'is_required': cq.get('is_required', True),
                    'is_published': cq.get('is_published', True)
                })

            return quests

        except Exception as e:
            logger.error(f"Error fetching quests with details for course {course_id}: {e}")
            return []

    def get_quest_ids_for_course(
        self,
        course_id: str,
        only_required: bool = False,
        only_published: bool = True
    ) -> List[str]:
        """
        Get just the quest IDs for a course.

        Args:
            course_id: Course ID
            only_required: Only return required quests
            only_published: Only return published quests

        Returns:
            List of quest IDs
        """
        try:
            query = self.client.table(self.table_name)\
                .select('quest_id, is_required, is_published')\
                .eq('course_id', course_id)

            result = query.execute()

            quest_ids = []
            for cq in (result.data or []):
                if only_published and cq.get('is_published') is False:
                    continue
                if only_required and not cq.get('is_required', True):
                    continue
                quest_ids.append(cq['quest_id'])

            return quest_ids

        except Exception as e:
            logger.error(f"Error fetching quest IDs for course {course_id}: {e}")
            return []

    def get_quest_enrollments(
        self,
        user_id: str,
        quest_ids: List[str]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get user's enrollments for multiple quests.

        Args:
            user_id: User ID
            quest_ids: List of quest IDs

        Returns:
            Dictionary mapping quest_id -> enrollment record
        """
        if not quest_ids:
            return {}

        try:
            result = self.client.table('user_quests')\
                .select('id, quest_id, is_active, completed_at, started_at')\
                .eq('user_id', user_id)\
                .in_('quest_id', quest_ids)\
                .execute()

            return {e['quest_id']: e for e in (result.data or [])}

        except Exception as e:
            logger.error(f"Error fetching quest enrollments: {e}")
            return {}

    def add_quest_to_course(
        self,
        course_id: str,
        quest_id: str,
        sequence_order: Optional[int] = None,
        xp_threshold: int = 0,
        is_required: bool = True,
        is_published: bool = True,
        custom_title: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Add a quest to a course.

        Args:
            course_id: Course ID
            quest_id: Quest ID
            sequence_order: Position in course (auto-calculated if not provided)
            xp_threshold: XP threshold for this quest in context of course
            is_required: Whether quest is required for course completion
            is_published: Whether quest is visible in course
            custom_title: Custom title for quest in this course

        Returns:
            Created course_quests record
        """
        try:
            # Get next sequence order if not provided
            if sequence_order is None:
                existing = self.client.table(self.table_name)\
                    .select('sequence_order')\
                    .eq('course_id', course_id)\
                    .order('sequence_order', desc=True)\
                    .limit(1)\
                    .execute()

                sequence_order = (existing.data[0]['sequence_order'] + 1) if existing.data else 0

            data = {
                'course_id': course_id,
                'quest_id': quest_id,
                'sequence_order': sequence_order,
                'xp_threshold': xp_threshold,
                'is_required': is_required,
                'is_published': is_published,
                'custom_title': custom_title
            }

            result = self.client.table(self.table_name).insert(data).execute()

            if not result.data:
                raise ValidationError("Failed to add quest to course")

            logger.info(f"Added quest {quest_id[:8]} to course {course_id[:8]} at position {sequence_order}")
            return result.data[0]

        except Exception as e:
            logger.error(f"Error adding quest to course: {e}")
            raise

    def remove_quest_from_course(
        self,
        course_id: str,
        quest_id: str
    ) -> bool:
        """
        Remove a quest from a course.

        Args:
            course_id: Course ID
            quest_id: Quest ID

        Returns:
            True if removed
        """
        try:
            result = self.client.table(self.table_name)\
                .delete()\
                .eq('course_id', course_id)\
                .eq('quest_id', quest_id)\
                .execute()

            if not result.data:
                raise NotFoundError(f"Quest {quest_id} not found in course {course_id}")

            logger.info(f"Removed quest {quest_id[:8]} from course {course_id[:8]}")
            return True

        except NotFoundError:
            raise
        except Exception as e:
            logger.error(f"Error removing quest from course: {e}")
            raise

    def update_course_quest(
        self,
        course_id: str,
        quest_id: str,
        updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update course_quest properties (xp_threshold, is_required, etc.).

        Args:
            course_id: Course ID
            quest_id: Quest ID
            updates: Fields to update

        Returns:
            Updated record
        """
        try:
            result = self.client.table(self.table_name)\
                .update(updates)\
                .eq('course_id', course_id)\
                .eq('quest_id', quest_id)\
                .execute()

            if not result.data:
                raise NotFoundError(f"Quest {quest_id} not found in course {course_id}")

            logger.info(f"Updated course quest {quest_id[:8]} in {course_id[:8]}")
            return result.data[0]

        except NotFoundError:
            raise
        except Exception as e:
            logger.error(f"Error updating course quest: {e}")
            raise

    def reorder_quests(
        self,
        course_id: str,
        quest_ids: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Reorder quests within a course.

        Uses two-phase update to avoid unique constraint issues.

        Args:
            course_id: Course ID
            quest_ids: List of quest IDs in new order

        Returns:
            Updated records
        """
        try:
            updated = []

            # Phase 1: Set negative sequence orders
            for i, quest_id in enumerate(quest_ids):
                self.client.table(self.table_name)\
                    .update({'sequence_order': -(i + 1)})\
                    .eq('course_id', course_id)\
                    .eq('quest_id', quest_id)\
                    .execute()

            # Phase 2: Set final positive sequence orders
            for i, quest_id in enumerate(quest_ids):
                result = self.client.table(self.table_name)\
                    .update({'sequence_order': i})\
                    .eq('course_id', course_id)\
                    .eq('quest_id', quest_id)\
                    .execute()

                if result.data:
                    updated.extend(result.data)

            logger.info(f"Reordered {len(updated)} quests in course {course_id[:8]}")
            return updated

        except Exception as e:
            logger.error(f"Error reordering course quests: {e}")
            raise

    def toggle_quest_published(
        self,
        course_id: str,
        quest_id: str,
        is_published: bool
    ) -> Dict[str, Any]:
        """
        Toggle whether a quest is published in a course.

        Args:
            course_id: Course ID
            quest_id: Quest ID
            is_published: New published state

        Returns:
            Updated record
        """
        return self.update_course_quest(course_id, quest_id, {'is_published': is_published})

    def get_courses_containing_quest(
        self,
        quest_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get all courses that contain a specific quest.

        Args:
            quest_id: Quest ID

        Returns:
            List of course_quests records with course info
        """
        try:
            result = self.client.table(self.table_name)\
                .select('course_id, sequence_order, courses(id, title, status)')\
                .eq('quest_id', quest_id)\
                .execute()

            return result.data or []

        except Exception as e:
            logger.error(f"Error fetching courses for quest {quest_id}: {e}")
            return []

    def count_quests_in_course(
        self,
        course_id: str,
        only_published: bool = True
    ) -> int:
        """
        Count quests in a course.

        Args:
            course_id: Course ID
            only_published: Only count published quests

        Returns:
            Number of quests
        """
        try:
            query = self.client.table(self.table_name)\
                .select('*', count='exact')\
                .eq('course_id', course_id)

            if only_published:
                query = query.neq('is_published', False)

            result = query.execute()
            return result.count or 0

        except Exception as e:
            logger.error(f"Error counting quests in course {course_id}: {e}")
            return 0
