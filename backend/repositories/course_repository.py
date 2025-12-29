"""
Course Repository - Database operations for courses and enrollments

Handles all course-related database queries with RLS enforcement.
"""

import logging
from typing import Optional, Dict, List, Any
from repositories.base_repository import BaseRepository, DatabaseError, NotFoundError
from postgrest.exceptions import APIError
from datetime import datetime, timezone

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)


class CourseRepository(BaseRepository):
    """Repository for course database operations"""

    table_name = 'courses'
    id_column = 'id'

    def create_course(
        self,
        title: str,
        description: Optional[str] = None,
        organization_id: Optional[str] = None,
        created_by: Optional[str] = None,
        is_active: bool = True,
        is_public: bool = True
    ) -> Dict[str, Any]:
        """
        Create a new course.

        Args:
            title: Course title
            description: Course description (optional)
            organization_id: Organization ID (optional)
            created_by: Creator user ID (optional)
            is_active: Whether course is active (default: True)
            is_public: Whether course is public (default: True)

        Returns:
            Created course record

        Raises:
            DatabaseError: If creation fails
        """
        try:
            course_data = {
                'title': title,
                'description': description,
                'organization_id': organization_id,
                'created_by': created_by,
                'is_active': is_active,
                'is_public': is_public
            }

            response = (
                self.client.table(self.table_name)
                .insert(course_data)
                .execute()
            )

            if not response.data:
                raise DatabaseError("Failed to create course - no data returned")

            logger.info(f"Created course: {title} (ID: {response.data[0]['id'][:8]})")
            return response.data[0]

        except APIError as e:
            logger.error(f"Error creating course: {e}")
            raise DatabaseError(f"Failed to create course: {str(e)}") from e

    def get_course_by_id(self, course_id: str) -> Dict[str, Any]:
        """
        Get course details by ID.

        Args:
            course_id: Course ID

        Returns:
            Course record

        Raises:
            NotFoundError: If course doesn't exist
            DatabaseError: If query fails
        """
        course = self.find_by_id(course_id)
        if not course:
            raise NotFoundError(f"Course {course_id} not found")
        return course

    def get_courses_by_organization(
        self,
        organization_id: str,
        is_active: Optional[bool] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get all courses for an organization.

        Args:
            organization_id: Organization ID
            is_active: Filter by active status (optional)
            limit: Maximum number of courses

        Returns:
            List of course records

        Raises:
            DatabaseError: If query fails
        """
        filters = {'organization_id': organization_id}
        if is_active is not None:
            filters['is_active'] = is_active

        return self.find_all(filters=filters, order_by='-created_at', limit=limit)

    def update_course(
        self,
        course_id: str,
        updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update course details.

        Args:
            course_id: Course ID
            updates: Dictionary of fields to update

        Returns:
            Updated course record

        Raises:
            NotFoundError: If course doesn't exist
            DatabaseError: If update fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .update(updates)
                .eq(self.id_column, course_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"Course {course_id} not found")

            logger.info(f"Updated course {course_id[:8]}")
            return response.data[0]

        except APIError as e:
            logger.error(f"Error updating course {course_id}: {e}")
            raise DatabaseError("Failed to update course") from e

    def delete_course(self, course_id: str) -> bool:
        """
        Soft delete a course (mark as inactive).

        Args:
            course_id: Course ID

        Returns:
            True if successful

        Raises:
            NotFoundError: If course doesn't exist
            DatabaseError: If deletion fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .update({'is_active': False})
                .eq(self.id_column, course_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"Course {course_id} not found")

            logger.info(f"Deleted (deactivated) course {course_id[:8]}")
            return True

        except APIError as e:
            logger.error(f"Error deleting course {course_id}: {e}")
            raise DatabaseError("Failed to delete course") from e

    def add_quest_to_course(
        self,
        course_id: str,
        quest_id: str,
        order_index: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Add a quest to a course.

        Args:
            course_id: Course ID
            quest_id: Quest ID
            order_index: Position in course (optional, auto-calculated if not provided)

        Returns:
            Created course_quests record

        Raises:
            DatabaseError: If addition fails
        """
        try:
            # If order_index not provided, get the max and add 1
            if order_index is None:
                existing = (
                    self.client.table('course_quests')
                    .select('order_index')
                    .eq('course_id', course_id)
                    .order('order_index', desc=True)
                    .limit(1)
                    .execute()
                )
                order_index = (existing.data[0]['order_index'] + 1) if existing.data else 0

            response = (
                self.client.table('course_quests')
                .insert({
                    'course_id': course_id,
                    'quest_id': quest_id,
                    'order_index': order_index
                })
                .execute()
            )

            if not response.data:
                raise DatabaseError("Failed to add quest to course - no data returned")

            logger.info(f"Added quest {quest_id[:8]} to course {course_id[:8]} at position {order_index}")
            return response.data[0]

        except APIError as e:
            logger.error(f"Error adding quest to course: {e}")
            raise DatabaseError(f"Failed to add quest to course: {str(e)}") from e

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
            True if successful

        Raises:
            NotFoundError: If course-quest relationship doesn't exist
            DatabaseError: If removal fails
        """
        try:
            response = (
                self.client.table('course_quests')
                .delete()
                .eq('course_id', course_id)
                .eq('quest_id', quest_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"Quest {quest_id} not found in course {course_id}")

            logger.info(f"Removed quest {quest_id[:8]} from course {course_id[:8]}")
            return True

        except APIError as e:
            logger.error(f"Error removing quest from course: {e}")
            raise DatabaseError("Failed to remove quest from course") from e

    def reorder_course_quests(
        self,
        course_id: str,
        quest_orders: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Reorder quests in a course.

        Args:
            course_id: Course ID
            quest_orders: List of dicts with 'quest_id' and 'order_index'

        Returns:
            List of updated course_quests records

        Raises:
            DatabaseError: If reordering fails
        """
        try:
            updated_records = []

            for item in quest_orders:
                quest_id = item.get('quest_id')
                order_index = item.get('order_index')

                if quest_id is None or order_index is None:
                    continue

                response = (
                    self.client.table('course_quests')
                    .update({'order_index': order_index})
                    .eq('course_id', course_id)
                    .eq('quest_id', quest_id)
                    .execute()
                )

                if response.data:
                    updated_records.extend(response.data)

            logger.info(f"Reordered {len(updated_records)} quests in course {course_id[:8]}")
            return updated_records

        except APIError as e:
            logger.error(f"Error reordering course quests: {e}")
            raise DatabaseError("Failed to reorder course quests") from e

    def get_course_quests(self, course_id: str) -> List[Dict[str, Any]]:
        """
        Get all quests in a course, ordered by position.

        Args:
            course_id: Course ID

        Returns:
            List of quest records with order_index

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table('course_quests')
                .select('quest_id, order_index, quests(*)')
                .eq('course_id', course_id)
                .order('order_index')
                .execute()
            )

            # Extract quest data with order_index
            quests = []
            for item in response.data or []:
                if item.get('quests'):
                    quest = item['quests']
                    quest['order_index'] = item['order_index']
                    quests.append(quest)

            return quests

        except APIError as e:
            logger.error(f"Error fetching course quests for {course_id}: {e}")
            raise DatabaseError("Failed to fetch course quests") from e

    def create_enrollment(
        self,
        user_id: str,
        course_id: str
    ) -> Dict[str, Any]:
        """
        Enroll a user in a course.

        Args:
            user_id: User ID
            course_id: Course ID

        Returns:
            Enrollment record (course_enrollments)

        Raises:
            DatabaseError: If enrollment fails
        """
        try:
            # Use admin client for enrollment operations to bypass RLS
            from database import get_supabase_admin_client
            admin_client = get_supabase_admin_client()

            # Check if already enrolled
            existing = (
                admin_client.table('course_enrollments')
                .select('*')
                .eq('user_id', user_id)
                .eq('course_id', course_id)
                .execute()
            )

            if existing.data:
                # Already enrolled, update to active if needed
                if not existing.data[0].get('is_active'):
                    response = (
                        admin_client.table('course_enrollments')
                        .update({
                            'is_active': True,
                            'enrolled_at': datetime.now(timezone.utc).isoformat()
                        })
                        .eq('user_id', user_id)
                        .eq('course_id', course_id)
                        .execute()
                    )
                    if not response.data:
                        raise DatabaseError("Failed to reactivate enrollment - no data returned")
                    logger.info(f"Reactivated enrollment for user {user_id[:8]} in course {course_id[:8]}")
                    return response.data[0]
                return existing.data[0]

            # Create new enrollment
            logger.info(f"Creating new enrollment for user {user_id[:8]} in course {course_id[:8]}")
            response = (
                admin_client.table('course_enrollments')
                .insert({
                    'user_id': user_id,
                    'course_id': course_id,
                    'is_active': True,
                    'enrolled_at': datetime.now(timezone.utc).isoformat()
                })
                .execute()
            )

            if not response.data:
                raise DatabaseError("Failed to create enrollment - no data returned")

            logger.info(f"✓ Successfully enrolled user {user_id[:8]} in course {course_id[:8]}")
            return response.data[0]

        except APIError as e:
            logger.error(f"APIError enrolling user {user_id[:8]} in course {course_id[:8]}: {e}", exc_info=True)
            raise DatabaseError(f"Failed to enroll in course: {str(e)}") from e

    def get_enrollment(
        self,
        user_id: str,
        course_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get a specific user's enrollment in a course.

        Args:
            user_id: User ID
            course_id: Course ID

        Returns:
            Enrollment record or None if not enrolled

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table('course_enrollments')
                .select('*')
                .eq('user_id', user_id)
                .eq('course_id', course_id)
                .execute()
            )

            if not response.data:
                return None

            return response.data[0]

        except APIError as e:
            logger.error(f"Error fetching enrollment for user {user_id}, course {course_id}: {e}")
            raise DatabaseError("Failed to fetch enrollment") from e

    def get_enrollments_by_course(
        self,
        course_id: str,
        is_active: Optional[bool] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get all enrollments for a course.

        Args:
            course_id: Course ID
            is_active: Filter by active status (optional)
            limit: Maximum number of enrollments

        Returns:
            List of enrollment records

        Raises:
            DatabaseError: If query fails
        """
        try:
            query = (
                self.client.table('course_enrollments')
                .select('*')
                .eq('course_id', course_id)
                .limit(limit)
            )

            if is_active is not None:
                query = query.eq('is_active', is_active)

            response = query.execute()
            return response.data or []

        except APIError as e:
            logger.error(f"Error fetching enrollments for course {course_id}: {e}")
            raise DatabaseError("Failed to fetch course enrollments") from e

    def get_enrollments_by_user(
        self,
        user_id: str,
        is_active: Optional[bool] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get all course enrollments for a user with course details.

        Args:
            user_id: User ID
            is_active: Filter by active status (optional)
            limit: Maximum number of enrollments

        Returns:
            List of enrollment records with course data

        Raises:
            DatabaseError: If query fails
        """
        try:
            query = (
                self.client.table('course_enrollments')
                .select('*, courses(*)')
                .eq('user_id', user_id)
                .limit(limit)
            )

            if is_active is not None:
                query = query.eq('is_active', is_active)

            response = query.execute()
            return response.data or []

        except APIError as e:
            logger.error(f"Error fetching enrollments for user {user_id}: {e}")
            raise DatabaseError("Failed to fetch user enrollments") from e

    def update_enrollment_status(
        self,
        user_id: str,
        course_id: str,
        is_active: bool,
        progress: Optional[float] = None,
        completed_at: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update enrollment status and progress.

        Args:
            user_id: User ID
            course_id: Course ID
            is_active: Whether enrollment is active
            progress: Progress percentage (0-100) (optional)
            completed_at: Completion timestamp (optional)

        Returns:
            Updated enrollment record

        Raises:
            NotFoundError: If enrollment doesn't exist
            DatabaseError: If update fails
        """
        try:
            updates = {'is_active': is_active}

            if progress is not None:
                updates['progress'] = progress

            if completed_at is not None:
                updates['completed_at'] = completed_at

            response = (
                self.client.table('course_enrollments')
                .update(updates)
                .eq('user_id', user_id)
                .eq('course_id', course_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"Enrollment not found for user {user_id}, course {course_id}")

            logger.info(f"Updated enrollment status for user {user_id[:8]} in course {course_id[:8]}")
            return response.data[0]

        except APIError as e:
            logger.error(f"Error updating enrollment status: {e}")
            raise DatabaseError("Failed to update enrollment status") from e
