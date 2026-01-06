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

        # Get XP earned by user (xp_value stored in user_quest_tasks, not completions)
        completions = supabase.table('quest_task_completions')\
            .select('task_id, user_quest_tasks(xp_value)')\
            .eq('user_id', user_id)\
            .in_('quest_id', quest_ids)\
            .execute()

        xp_earned = sum(
            (c.get('user_quest_tasks', {}) or {}).get('xp_value', 0) or 0
            for c in completions.data
        ) if completions.data else 0

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

    @staticmethod
    def get_course_homepage_data(course_id: str, user_id: str) -> Dict:
        """
        Get comprehensive course data for the student homepage view.

        Aggregates:
        - Course details
        - Quests with lessons and linked tasks
        - User's enrollment and progress
        - Lesson progress for each quest

        This method consolidates the logic from courses.py get_course_homepage()
        into a reusable service method.

        Args:
            course_id: Course ID
            user_id: Current user ID

        Returns:
            Dict with course, quests, enrollment, and progress data

        Raises:
            NotFoundError: If course doesn't exist
        """
        supabase = get_supabase_admin_client()

        # Get course details
        course_result = supabase.table('courses').select('*').eq('id', course_id).execute()
        if not course_result.data:
            raise NotFoundError(f"Course {course_id} not found")

        course = course_result.data[0]

        # Get course quests with quest details
        course_quests_result = supabase.table('course_quests').select(
            'quest_id, sequence_order, xp_threshold, custom_title, is_required, is_published, quests(id, title, description, header_image_url)'
        ).eq('course_id', course_id).order('sequence_order').execute()

        quests_with_data = []
        for cq in (course_quests_result.data or []):
            # Skip unpublished projects
            if cq.get('is_published') is False:
                continue

            quest_data = cq.get('quests', {}) or {}
            quest_id = quest_data.get('id') or cq.get('quest_id')

            if not quest_id:
                continue

            # Get lessons for this quest
            lessons_result = supabase.table('curriculum_lessons')\
                .select('id, title, sequence_order, estimated_duration_minutes, content, description, xp_threshold, is_published')\
                .eq('quest_id', quest_id)\
                .order('sequence_order')\
                .execute()

            # All lessons in a published project are visible (visibility inherits from project)
            lessons = lessons_result.data or []

            # Fetch linked task IDs for lessons
            if lessons:
                lesson_ids = [lesson['id'] for lesson in lessons]
                links_result = supabase.table('curriculum_lesson_tasks')\
                    .select('lesson_id, task_id')\
                    .eq('quest_id', quest_id)\
                    .execute()

                # Build mapping of lesson_id -> list of task_ids
                lesson_tasks_map = {}
                for link in (links_result.data or []):
                    lesson_id = link['lesson_id']
                    if lesson_id not in lesson_tasks_map:
                        lesson_tasks_map[lesson_id] = []
                    lesson_tasks_map[lesson_id].append(link['task_id'])

                # Add linked_task_ids to each lesson
                for lesson in lessons:
                    lesson['linked_task_ids'] = lesson_tasks_map.get(lesson['id'], [])

            # Get user's quest enrollment
            user_quest_result = supabase.table('user_quests')\
                .select('id, is_active, completed_at, started_at')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            quest_enrollment = user_quest_result.data[0] if user_quest_result.data else None

            # Calculate XP progress from curriculum lessons
            total_xp = sum(l.get('xp_threshold', 0) or 0 for l in lessons)
            earned_xp = 0
            completed_tasks = 0
            total_tasks = 0

            # Get all linked task IDs from lessons
            all_linked_task_ids = []
            for lesson in lessons:
                all_linked_task_ids.extend(lesson.get('linked_task_ids', []))

            if all_linked_task_ids and quest_enrollment:
                enrollment_id = quest_enrollment['id']
                user_tasks_result = supabase.table('user_quest_tasks')\
                    .select('id, xp_value')\
                    .eq('user_quest_id', enrollment_id)\
                    .in_('id', all_linked_task_ids)\
                    .execute()

                user_tasks = user_tasks_result.data or []
                total_tasks = len(all_linked_task_ids)

                if user_tasks:
                    task_ids = [t['id'] for t in user_tasks]
                    task_xp_map = {t['id']: t.get('xp_value', 0) or 0 for t in user_tasks}

                    completions_result = supabase.table('quest_task_completions')\
                        .select('user_quest_task_id')\
                        .eq('user_id', user_id)\
                        .in_('user_quest_task_id', task_ids)\
                        .execute()

                    completions = completions_result.data or []
                    completed_tasks = len(completions)
                    earned_xp = sum(task_xp_map.get(c['user_quest_task_id'], 0) for c in completions)

            # Get lesson progress for this quest
            lesson_progress_map = {}
            try:
                lesson_progress_result = supabase.table('curriculum_lesson_progress')\
                    .select('lesson_id, status, progress_percentage')\
                    .eq('user_id', user_id)\
                    .eq('quest_id', quest_id)\
                    .execute()

                for lp in (lesson_progress_result.data or []):
                    lesson_progress_map[lp['lesson_id']] = {
                        'status': lp['status'],
                        'progress_percentage': lp['progress_percentage']
                    }
            except Exception as progress_err:
                logger.warning(f"Could not fetch lesson progress: {progress_err}")

            # Add progress to each lesson
            for lesson in lessons:
                progress = lesson_progress_map.get(lesson['id'], {})
                lesson['progress'] = {
                    'status': progress.get('status', 'not_started'),
                    'percentage': progress.get('progress_percentage', 0)
                }

            quests_with_data.append({
                'id': quest_id,
                'title': cq.get('custom_title') or quest_data.get('title'),
                'description': quest_data.get('description'),
                'header_image_url': quest_data.get('header_image_url'),
                'sequence_order': cq.get('sequence_order', 0),
                'xp_threshold': cq.get('xp_threshold', 0),
                'is_required': cq.get('is_required', True),
                'lessons': lessons,
                'enrollment': quest_enrollment,
                'progress': {
                    'completed_tasks': completed_tasks,
                    'total_tasks': total_tasks,
                    'earned_xp': earned_xp,
                    'total_xp': total_xp,
                    'percentage': min(100, round((earned_xp / total_xp * 100), 1)) if total_xp > 0 else 0,
                    'is_completed': (quest_enrollment.get('completed_at') is not None and not quest_enrollment.get('is_active')) if quest_enrollment else False
                }
            })

        # Get course enrollment status
        enrollment_result = supabase.table('course_enrollments')\
            .select('*')\
            .eq('course_id', course_id)\
            .eq('user_id', user_id)\
            .execute()

        enrollment = enrollment_result.data[0] if enrollment_result.data else None

        # Creator is always considered enrolled
        is_creator = course['created_by'] == user_id
        if is_creator and not enrollment:
            enrollment = {
                'id': None,
                'course_id': course_id,
                'user_id': user_id,
                'status': 'active',
                'enrolled_at': course.get('created_at'),
                'is_creator': True
            }

        # Calculate overall course progress
        total_required_quests = len([q for q in quests_with_data if q.get('is_required', True)])
        completed_quests = len([q for q in quests_with_data if q['progress']['is_completed'] and q.get('is_required', True)])

        # Sum XP across all required quests
        course_earned_xp = sum(q['progress']['earned_xp'] for q in quests_with_data if q.get('is_required', True))
        course_total_xp = sum(q['progress']['total_xp'] for q in quests_with_data if q.get('is_required', True))
        course_progress = min(100, round((course_earned_xp / course_total_xp * 100), 1)) if course_total_xp > 0 else 0

        return {
            'course': {
                'id': course['id'],
                'title': course['title'],
                'description': course.get('description'),
                'cover_image_url': course.get('cover_image_url'),
                'navigation_mode': course.get('navigation_mode', 'sequential'),
                'status': course.get('status', 'draft')
            },
            'quests': quests_with_data,
            'enrollment': enrollment,
            'progress': {
                'completed_quests': completed_quests,
                'total_quests': total_required_quests,
                'earned_xp': course_earned_xp,
                'total_xp': course_total_xp,
                'percentage': course_progress
            }
        }

    @staticmethod
    def enroll_user_in_course(
        course_id: str,
        user_id: str,
        enrolled_by: Optional[str] = None,
        skip_personalization: bool = True
    ) -> Dict:
        """
        Full course enrollment with quest auto-enrollment.

        Enhanced version of enroll_student that:
        - Creates course enrollment
        - Auto-enrolls user in all published course quests
        - Skips AI personalization for course quests
        - Handles existing enrollments gracefully

        Args:
            course_id: Course ID
            user_id: User ID to enroll
            enrolled_by: ID of user performing enrollment (for admin enrollments)
            skip_personalization: Skip AI task personalization (default True for courses)

        Returns:
            Dict with enrollment record and list of quest enrollments

        Raises:
            NotFoundError: If course doesn't exist
        """
        supabase = get_supabase_admin_client()

        # Get course with quests
        course_result = supabase.table('courses')\
            .select('*, course_quests(quest_id, is_published)')\
            .eq('id', course_id)\
            .execute()

        if not course_result.data:
            raise NotFoundError(f"Course {course_id} not found")

        course = course_result.data[0]

        # Check for existing enrollment
        existing = supabase.table('course_enrollments')\
            .select('*')\
            .eq('course_id', course_id)\
            .eq('user_id', user_id)\
            .execute()

        if existing.data:
            # Reactivate if inactive
            enrollment = existing.data[0]
            if enrollment.get('status') != 'active':
                supabase.table('course_enrollments')\
                    .update({'status': 'active'})\
                    .eq('id', enrollment['id'])\
                    .execute()
                enrollment['status'] = 'active'
        else:
            # Create new enrollment
            enrollment_data = {
                'course_id': course_id,
                'user_id': user_id,
                'enrolled_at': datetime.utcnow().isoformat(),
                'status': 'active'
            }
            if enrolled_by:
                enrollment_data['enrolled_by'] = enrolled_by

            result = supabase.table('course_enrollments').insert(enrollment_data).execute()
            enrollment = result.data[0] if result.data else enrollment_data

        # Auto-enroll in course quests (only published ones)
        quest_enrollments = []
        course_quests = [cq for cq in (course.get('course_quests') or []) if cq.get('is_published') is not False]

        for cq in course_quests:
            quest_id = cq['quest_id']

            # Check for existing quest enrollment
            existing_quest = supabase.table('user_quests')\
                .select('id')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            if not existing_quest.data:
                # Create quest enrollment
                quest_enrollment = supabase.table('user_quests').insert({
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'started_at': datetime.utcnow().isoformat(),
                    'is_active': True,
                    'personalization_completed': skip_personalization
                }).execute()

                if quest_enrollment.data:
                    quest_enrollments.append(quest_enrollment.data[0])

        logger.info(f"User {user_id[:8]} enrolled in course {course_id[:8]} with {len(quest_enrollments)} new quest enrollments")

        return {
            'enrollment': enrollment,
            'quest_enrollments': quest_enrollments,
            'total_quests': len(course_quests)
        }
