"""
Course Service
Handles course management, enrollment, progress tracking, and course-badge relationships.
"""

from typing import List, Dict, Optional
from datetime import datetime
from services.base_service import BaseService, ValidationError, NotFoundError, PermissionError
from database import get_supabase_admin_client, get_user_client
from flask import current_app

from utils.logger import get_logger

logger = get_logger(__name__)


class CourseService(BaseService):
    """Core service for course management and student enrollment."""

    def __init__(self, course_repo=None):
        """
        Initialize CourseService with repository.

        Args:
            course_repo: CourseRepository instance (injected)
        """
        super().__init__()
        self.course_repo = course_repo

    @staticmethod
    def create_course(
        user_id: str,
        org_id: str,
        title: str,
        description: str,
        intro_content: Optional[str] = None
    ) -> Dict:
        """
        Create a new course.

        Args:
            user_id: Creator user ID
            org_id: Organization ID
            title: Course title
            description: Course description
            intro_content: Optional introductory content

        Returns:
            Created course record

        Raises:
            ValidationError: If required fields missing
        """
        # Validate required fields
        if not all([user_id, org_id, title, description]):
            raise ValidationError("user_id, org_id, title, and description are required")

        supabase = get_supabase_admin_client()

        course_data = {
            'created_by': user_id,
            'organization_id': org_id,
            'title': title,
            'description': description,
            'intro_content': intro_content or '',
            'is_published': False,
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }

        try:
            result = supabase.table('courses').insert(course_data).execute()
            if not result.data:
                raise ValueError("Failed to create course")

            logger.info(f"Course created: {result.data[0]['id']} by user {user_id}")
            return result.data[0]

        except Exception as e:
            logger.error(f"Error creating course: {str(e)}")
            raise ValueError(f"Failed to create course: {str(e)}")

    @staticmethod
    def publish_course(course_id: str, user_id: str) -> Dict:
        """
        Publish a course. Auto-creates completion badge and populates badge_quests.

        When a course is published:
        1. Creates a badge with badge_type='course_completion'
        2. Calculates min_quests and min_xp from course quests
        3. Populates badge_quests table with all course quests

        Args:
            course_id: Course ID to publish
            user_id: User ID performing the action

        Returns:
            Published course record with badge_id

        Raises:
            NotFoundError: If course doesn't exist
            PermissionError: If user doesn't have permission
            ValidationError: If course has no quests
        """
        supabase = get_supabase_admin_client()

        # Get course with quests
        course_result = supabase.table('courses')\
            .select('*, course_quests(quest_id, quests(id, title, pillar_primary))')\
            .eq('id', course_id)\
            .single()\
            .execute()

        if not course_result.data:
            raise NotFoundError(f"Course {course_id} not found")

        course = course_result.data

        # Check permission (user must be creator or admin)
        if course['created_by'] != user_id:
            # TODO: Add admin role check
            raise PermissionError("Only course creator can publish")

        # Validate course has quests
        course_quests = course.get('course_quests', [])
        if not course_quests:
            raise ValidationError("Course must have at least one quest before publishing")

        # Calculate min_quests and min_xp from course quests
        min_quests = len(course_quests)

        # Get total XP from all quest tasks
        quest_ids = [cq['quest_id'] for cq in course_quests]
        xp_result = supabase.table('user_quest_tasks')\
            .select('xp_value')\
            .in_('quest_id', quest_ids)\
            .execute()

        min_xp = sum(task['xp_value'] or 0 for task in xp_result.data) if xp_result.data else 0

        # Get primary pillar from first quest (or most common pillar)
        primary_pillar = None
        if course_quests and course_quests[0].get('quests'):
            primary_pillar = course_quests[0]['quests'].get('pillar_primary')

        # Create completion badge
        badge_data = {
            'name': f"{course['title']} - Completion",
            'badge_type': 'course_completion',
            'pillar_primary': primary_pillar or 'knowledge',
            'min_quests': min_quests,
            'min_xp': min_xp,
            'description': f"Complete all quests in {course['title']}",
            'status': 'active',
            'organization_id': course['organization_id'],
            'created_at': datetime.utcnow().isoformat()
        }

        try:
            badge_result = supabase.table('badges').insert(badge_data).execute()
            if not badge_result.data:
                raise ValueError("Failed to create completion badge")

            badge_id = badge_result.data[0]['id']

            # Populate badge_quests junction table
            badge_quests = [
                {
                    'badge_id': badge_id,
                    'quest_id': cq['quest_id'],
                    'is_required': True,
                    'quest_source': 'custom',
                    'created_at': datetime.utcnow().isoformat()
                }
                for cq in course_quests
            ]

            supabase.table('badge_quests').insert(badge_quests).execute()

            # Update course to published with badge reference
            update_result = supabase.table('courses')\
                .update({
                    'is_published': True,
                    'completion_badge_id': badge_id,
                    'updated_at': datetime.utcnow().isoformat()
                })\
                .eq('id', course_id)\
                .execute()

            logger.info(f"Course {course_id} published with badge {badge_id}")
            return update_result.data[0] if update_result.data else course

        except Exception as e:
            logger.error(f"Error publishing course: {str(e)}")
            raise ValueError(f"Failed to publish course: {str(e)}")

    @staticmethod
    def enroll_student(course_id: str, user_id: str) -> Dict:
        """
        Enroll a student in a course.

        Creates enrollment record and auto-enrolls student in all course quests.

        Args:
            course_id: Course ID
            user_id: Student user ID

        Returns:
            Enrollment record

        Raises:
            NotFoundError: If course doesn't exist
            ValidationError: If course not published or already enrolled
        """
        supabase = get_supabase_admin_client()

        # Get course with quests
        course_result = supabase.table('courses')\
            .select('*, course_quests(quest_id)')\
            .eq('id', course_id)\
            .single()\
            .execute()

        if not course_result.data:
            raise NotFoundError(f"Course {course_id} not found")

        course = course_result.data

        # Check if course is published
        if not course.get('is_published'):
            raise ValidationError("Cannot enroll in unpublished course")

        # Check if already enrolled
        existing = supabase.table('course_enrollments')\
            .select('id')\
            .eq('course_id', course_id)\
            .eq('user_id', user_id)\
            .execute()

        if existing.data:
            raise ValidationError("User already enrolled in this course")

        # Create enrollment
        enrollment_data = {
            'course_id': course_id,
            'user_id': user_id,
            'enrolled_at': datetime.utcnow().isoformat(),
            'status': 'active'
        }

        try:
            enrollment_result = supabase.table('course_enrollments').insert(enrollment_data).execute()
            if not enrollment_result.data:
                raise ValueError("Failed to create enrollment")

            enrollment = enrollment_result.data[0]

            # Auto-enroll in all course quests
            course_quests = course.get('course_quests', [])
            if course_quests:
                quest_enrollments = [
                    {
                        'user_id': user_id,
                        'quest_id': cq['quest_id'],
                        'status': 'not_started',
                        'is_active': True,
                        'started_at': datetime.utcnow().isoformat()
                    }
                    for cq in course_quests
                ]

                # Use upsert to handle existing enrollments
                supabase.table('user_quests').upsert(
                    quest_enrollments,
                    on_conflict='user_id,quest_id'
                ).execute()

            logger.info(f"User {user_id} enrolled in course {course_id} with {len(course_quests)} quests")
            return enrollment

        except Exception as e:
            logger.error(f"Error enrolling student: {str(e)}")
            raise ValueError(f"Failed to enroll student: {str(e)}")

    @staticmethod
    def get_student_progress(course_id: str, user_id: str) -> Dict:
        """
        Calculate student's progress in a course.

        Returns XP earned / total XP from course quests.

        Args:
            course_id: Course ID
            user_id: Student user ID

        Returns:
            Progress dict with xp_earned, total_xp, quests_completed, total_quests, percentage

        Raises:
            NotFoundError: If course or enrollment doesn't exist
        """
        supabase = get_supabase_admin_client()

        # Verify enrollment
        enrollment = supabase.table('course_enrollments')\
            .select('id')\
            .eq('course_id', course_id)\
            .eq('user_id', user_id)\
            .execute()

        if not enrollment.data:
            raise NotFoundError(f"User {user_id} not enrolled in course {course_id}")

        # Get course quests
        course_result = supabase.table('course_quests')\
            .select('quest_id')\
            .eq('course_id', course_id)\
            .execute()

        quest_ids = [cq['quest_id'] for cq in course_result.data] if course_result.data else []

        if not quest_ids:
            return {
                'xp_earned': 0,
                'total_xp': 0,
                'quests_completed': 0,
                'total_quests': 0,
                'percentage': 0
            }

        # Get total XP available
        all_tasks = supabase.table('user_quest_tasks')\
            .select('xp_value')\
            .in_('quest_id', quest_ids)\
            .execute()

        total_xp = sum(task['xp_value'] or 0 for task in all_tasks.data) if all_tasks.data else 0

        # Get XP earned by user
        completions = supabase.table('quest_task_completions')\
            .select('xp_awarded')\
            .eq('user_id', user_id)\
            .in_('quest_id', quest_ids)\
            .execute()

        xp_earned = sum(c['xp_awarded'] or 0 for c in completions.data) if completions.data else 0

        # Count completed quests
        user_quests = supabase.table('user_quests')\
            .select('quest_id, status')\
            .eq('user_id', user_id)\
            .in_('quest_id', quest_ids)\
            .execute()

        quests_completed = sum(
            1 for uq in user_quests.data
            if uq.get('status') in ['set_down', 'completed']
        ) if user_quests.data else 0

        percentage = (xp_earned / total_xp * 100) if total_xp > 0 else 0

        return {
            'xp_earned': xp_earned,
            'total_xp': total_xp,
            'quests_completed': quests_completed,
            'total_quests': len(quest_ids),
            'percentage': round(percentage, 2)
        }

    @staticmethod
    def add_quest_to_course(course_id: str, quest_id: str, order: Optional[int] = None) -> Dict:
        """
        Add a quest to a course.

        Args:
            course_id: Course ID
            quest_id: Quest ID to add
            order: Optional display order

        Returns:
            Created course_quest record

        Raises:
            ValidationError: If quest already in course
        """
        supabase = get_supabase_admin_client()

        # Check if already exists
        existing = supabase.table('course_quests')\
            .select('id')\
            .eq('course_id', course_id)\
            .eq('quest_id', quest_id)\
            .execute()

        if existing.data:
            raise ValidationError("Quest already in course")

        # Get max order if not provided
        if order is None:
            max_order = supabase.table('course_quests')\
                .select('display_order')\
                .eq('course_id', course_id)\
                .order('display_order', desc=True)\
                .limit(1)\
                .execute()

            order = (max_order.data[0]['display_order'] + 1) if max_order.data else 0

        course_quest_data = {
            'course_id': course_id,
            'quest_id': quest_id,
            'display_order': order,
            'created_at': datetime.utcnow().isoformat()
        }

        try:
            result = supabase.table('course_quests').insert(course_quest_data).execute()
            logger.info(f"Quest {quest_id} added to course {course_id}")
            return result.data[0] if result.data else course_quest_data

        except Exception as e:
            logger.error(f"Error adding quest to course: {str(e)}")
            raise ValueError(f"Failed to add quest: {str(e)}")

    @staticmethod
    def remove_quest_from_course(course_id: str, quest_id: str) -> bool:
        """
        Remove a quest from a course.

        Args:
            course_id: Course ID
            quest_id: Quest ID to remove

        Returns:
            True if removed

        Raises:
            ValidationError: If course is published
        """
        supabase = get_supabase_admin_client()

        # Check if course is published
        course = supabase.table('courses')\
            .select('is_published')\
            .eq('id', course_id)\
            .single()\
            .execute()

        if course.data and course.data.get('is_published'):
            raise ValidationError("Cannot remove quests from published course")

        try:
            supabase.table('course_quests')\
                .delete()\
                .eq('course_id', course_id)\
                .eq('quest_id', quest_id)\
                .execute()

            logger.info(f"Quest {quest_id} removed from course {course_id}")
            return True

        except Exception as e:
            logger.error(f"Error removing quest from course: {str(e)}")
            raise ValueError(f"Failed to remove quest: {str(e)}")

    @staticmethod
    def reorder_quests(course_id: str, quest_order: List[str]) -> bool:
        """
        Reorder quests in a course.

        Args:
            course_id: Course ID
            quest_order: List of quest IDs in desired order

        Returns:
            True if reordered successfully
        """
        supabase = get_supabase_admin_client()

        try:
            # Update display_order for each quest
            for idx, quest_id in enumerate(quest_order):
                supabase.table('course_quests')\
                    .update({'display_order': idx})\
                    .eq('course_id', course_id)\
                    .eq('quest_id', quest_id)\
                    .execute()

            logger.info(f"Reordered {len(quest_order)} quests in course {course_id}")
            return True

        except Exception as e:
            logger.error(f"Error reordering quests: {str(e)}")
            raise ValueError(f"Failed to reorder quests: {str(e)}")
