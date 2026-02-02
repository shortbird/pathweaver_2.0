"""
Course Enrollment Service

Centralized service for course enrollment operations.
Supports both individual and bulk enrollment/unenrollment.

Usage:
    from services.course_enrollment_service import CourseEnrollmentService

    service = CourseEnrollmentService(supabase_client)

    # Enroll a single user
    result = service.enroll_user(user_id, course_id)

    # Bulk enroll multiple users
    results = service.bulk_enroll(user_ids, course_id)

    # Get enrollments with progress
    enrollments = service.get_enrollments_with_progress(course_id, page=1, per_page=25)
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
from services.base_service import BaseService
from services.course_progress_service import CourseProgressService
from utils.logger import get_logger

logger = get_logger(__name__)


class CourseEnrollmentService(BaseService):
    """
    Service for managing course enrollments.

    Extracts and centralizes enrollment logic from courses.py
    to enable bulk operations and reuse.
    """

    def __init__(self, supabase_client):
        """
        Initialize with Supabase client.

        Args:
            supabase_client: Supabase admin client for queries
        """
        super().__init__()
        self.client = supabase_client
        self.progress_service = CourseProgressService(supabase_client)

    def enroll_user(self, user_id: str, course_id: str) -> Dict[str, Any]:
        """
        Enroll a single user in a course.

        Auto-enrolls the user in all quests associated with the course,
        skipping the AI personalization wizard.
        Copies lesson-linked tasks to user_quest_tasks.

        Args:
            user_id: User ID to enroll
            course_id: Course ID to enroll in

        Returns:
            Dict with enrollment result:
            {
                'success': bool,
                'enrollment': enrollment record,
                'quests_enrolled': int,
                'status': 'enrolled' | 'already_enrolled' | 'reactivated' | 'failed',
                'error': optional error message
            }
        """
        try:
            # Get course
            course_result = self.client.table('courses').select('id, title').eq('id', course_id).execute()
            if not course_result.data:
                return {
                    'success': False,
                    'status': 'failed',
                    'error': 'Course not found'
                }

            # Get all quests for the course (ordered by sequence)
            course_quests = self.client.table('course_quests').select('quest_id').eq(
                'course_id', course_id
            ).order('sequence_order').execute()

            first_quest_id = course_quests.data[0]['quest_id'] if course_quests.data else None

            # Check if already enrolled
            existing = self.client.table('course_enrollments').select('*').eq(
                'course_id', course_id
            ).eq('user_id', user_id).execute()

            enrollment = None
            status = 'enrolled'

            if existing.data:
                existing_enrollment = existing.data[0]
                # If already active, return early
                if existing_enrollment.get('status') == 'active':
                    return {
                        'success': True,
                        'enrollment': existing_enrollment,
                        'quests_enrolled': 0,
                        'status': 'already_enrolled'
                    }

                # Reactivate completed enrollment
                logger.info(f"Reactivating completed course enrollment for user {user_id} in course {course_id}")
                self.client.table('course_enrollments').update({
                    'status': 'active',
                    'completed_at': None
                }).eq('id', existing_enrollment['id']).execute()

                result = self.client.table('course_enrollments').select('*').eq(
                    'id', existing_enrollment['id']
                ).execute()
                enrollment = result.data[0] if result.data else None
                status = 'reactivated'
            else:
                # Create new course enrollment
                enrollment_data = {
                    'course_id': course_id,
                    'user_id': user_id,
                    'status': 'active',
                    'current_quest_id': first_quest_id
                }

                result = self.client.table('course_enrollments').insert(enrollment_data).execute()
                enrollment = result.data[0] if result.data else None

            if not enrollment:
                return {
                    'success': False,
                    'status': 'failed',
                    'error': 'Failed to create enrollment'
                }

            # Auto-enroll in all course quests
            quest_enrollments_created = self._enroll_in_course_quests(user_id, course_quests.data or [])

            logger.info(f"User {user_id} enrolled in course {course_id}, auto-enrolled in {quest_enrollments_created} quests")

            return {
                'success': True,
                'enrollment': enrollment,
                'quests_enrolled': quest_enrollments_created,
                'status': status
            }

        except Exception as e:
            logger.error(f"Error enrolling user {user_id} in course {course_id}: {str(e)}")
            return {
                'success': False,
                'status': 'failed',
                'error': str(e)
            }

    def _enroll_in_course_quests(self, user_id: str, course_quests: List[Dict]) -> int:
        """
        Auto-enroll user in all course quests and copy lesson-linked tasks.

        Args:
            user_id: User ID
            course_quests: List of course_quest records with quest_id

        Returns:
            Number of quests enrolled in
        """
        quest_enrollments_created = 0

        for course_quest in course_quests:
            quest_id = course_quest['quest_id']

            try:
                # Check if already enrolled in this quest
                existing_quest_enrollment = self.client.table('user_quests').select('id, is_active').eq(
                    'user_id', user_id
                ).eq('quest_id', quest_id).execute()

                if existing_quest_enrollment.data:
                    existing_quest = existing_quest_enrollment.data[0]
                    # If inactive, reactivate it for the course
                    if not existing_quest.get('is_active'):
                        self.client.table('user_quests').update({
                            'is_active': True,
                            'completed_at': None,
                            'last_picked_up_at': datetime.utcnow().isoformat()
                        }).eq('id', existing_quest['id']).execute()
                        logger.info(f"Reactivated quest enrollment {existing_quest['id']} for course enrollment")
                        quest_enrollments_created += 1
                    continue

                # Create quest enrollment with personalization_completed=True (skip wizard)
                quest_enrollment_data = {
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'status': 'picked_up',
                    'is_active': True,
                    'times_picked_up': 1,
                    'last_picked_up_at': datetime.utcnow().isoformat(),
                    'started_at': datetime.utcnow().isoformat(),
                    'personalization_completed': True
                }

                quest_result = self.client.table('user_quests').insert(quest_enrollment_data).execute()
                if quest_result.data:
                    quest_enrollments_created += 1
                    logger.info(f"Auto-enrolled user {user_id} in quest {quest_id} (course enrollment)")

                    # Note: Tasks are NOT auto-copied. Students activate tasks manually
                    # by clicking on them in the lesson view. This gives students agency
                    # over which optional tasks they want to pursue.

            except Exception as quest_err:
                logger.warning(f"Failed to auto-enroll in quest {quest_id}: {quest_err}")

        return quest_enrollments_created

    def _copy_lesson_linked_tasks(self, user_id: str, quest_id: str, user_quest_id: str) -> int:
        """
        Copy lesson-linked tasks to user_quest_tasks for a quest enrollment.

        Args:
            user_id: User ID
            quest_id: Quest ID
            user_quest_id: User quest enrollment ID

        Returns:
            Number of tasks copied
        """
        try:
            # Get all task IDs linked to lessons for this quest
            linked_tasks_result = self.client.table('curriculum_lesson_tasks')\
                .select('task_id')\
                .eq('quest_id', quest_id)\
                .execute()

            if not linked_tasks_result.data:
                return 0

            task_ids = list(set([lt['task_id'] for lt in linked_tasks_result.data]))

            # Check for existing tasks with same source_task_id (avoid duplicates)
            existing_tasks = self.client.table('user_quest_tasks')\
                .select('source_task_id')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .in_('source_task_id', task_ids)\
                .execute()
            existing_source_ids = set(t['source_task_id'] for t in (existing_tasks.data or []) if t.get('source_task_id'))

            # Filter out tasks that already exist
            task_ids_to_copy = [tid for tid in task_ids if tid not in existing_source_ids]

            if not task_ids_to_copy:
                return 0

            # Fetch the source task data
            source_tasks_result = self.client.table('user_quest_tasks')\
                .select('id, title, description, pillar, xp_value, order_index, is_required, diploma_subjects, subject_xp_distribution')\
                .in_('id', task_ids_to_copy)\
                .execute()

            if not source_tasks_result.data:
                return 0

            tasks_to_insert = []
            for task in source_tasks_result.data:
                tasks_to_insert.append({
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'user_quest_id': user_quest_id,
                    'title': task['title'],
                    'description': task.get('description', ''),
                    'pillar': task['pillar'],
                    'xp_value': task.get('xp_value', 100),
                    'order_index': task.get('order_index', 0),
                    'is_required': task.get('is_required', False),
                    'is_manual': False,
                    'approval_status': 'approved',
                    'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                    'subject_xp_distribution': task.get('subject_xp_distribution'),
                    'source_task_id': task['id']
                })

            if tasks_to_insert:
                self.client.table('user_quest_tasks').insert(tasks_to_insert).execute()
                logger.info(f"Copied {len(tasks_to_insert)} lesson-linked tasks for user {user_id} in quest {quest_id}")
                return len(tasks_to_insert)

            return 0

        except Exception as task_err:
            logger.warning(f"Failed to copy tasks for quest {quest_id}: {task_err}")
            return 0

    def bulk_enroll(self, user_ids: List[str], course_id: str) -> Dict[str, Any]:
        """
        Bulk enroll multiple users in a course.

        Args:
            user_ids: List of user IDs to enroll (max 50)
            course_id: Course ID to enroll in

        Returns:
            Dict with bulk enrollment results:
            {
                'success': bool,
                'enrolled': int,
                'failed': int,
                'skipped': int,
                'results': [
                    {'user_id': str, 'status': str, 'quests_enrolled': int, 'error': optional str}
                ]
            }
        """
        if len(user_ids) > 50:
            return {
                'success': False,
                'error': 'Maximum 50 users per bulk enrollment',
                'enrolled': 0,
                'failed': 0,
                'skipped': 0,
                'results': []
            }

        results = []
        enrolled = 0
        failed = 0
        skipped = 0

        for user_id in user_ids:
            result = self.enroll_user(user_id, course_id)

            if result['success']:
                if result['status'] == 'already_enrolled':
                    skipped += 1
                else:
                    enrolled += 1
                results.append({
                    'user_id': user_id,
                    'status': result['status'],
                    'quests_enrolled': result.get('quests_enrolled', 0)
                })
            else:
                failed += 1
                results.append({
                    'user_id': user_id,
                    'status': 'failed',
                    'error': result.get('error', 'Unknown error')
                })

        return {
            'success': failed == 0,
            'enrolled': enrolled,
            'failed': failed,
            'skipped': skipped,
            'results': results
        }

    def unenroll_user(self, user_id: str, course_id: str) -> Dict[str, Any]:
        """
        Unenroll a user from a course.

        This will:
        1. Delete the course_enrollments record
        2. Deactivate all user_quests records for quests in this course
        3. Delete user_quest_tasks for those quests

        Args:
            user_id: User ID to unenroll
            course_id: Course ID to unenroll from

        Returns:
            Dict with unenrollment result
        """
        try:
            # Get course quests first
            course_quests = self.client.table('course_quests')\
                .select('quest_id')\
                .eq('course_id', course_id)\
                .execute()

            quest_ids = [cq['quest_id'] for cq in (course_quests.data or [])]

            # Delete course enrollment
            self.client.table('course_enrollments')\
                .delete()\
                .eq('course_id', course_id)\
                .eq('user_id', user_id)\
                .execute()

            logger.info(f"Deleted course enrollment for user {user_id} from course {course_id}")

            # Deactivate quest enrollments and delete tasks
            quests_unenrolled = 0
            tasks_deleted = 0

            for quest_id in quest_ids:
                # Get user_quest record
                user_quest = self.client.table('user_quests')\
                    .select('id')\
                    .eq('user_id', user_id)\
                    .eq('quest_id', quest_id)\
                    .execute()

                if user_quest.data:
                    user_quest_id = user_quest.data[0]['id']

                    # Delete user_quest_tasks for this enrollment
                    deleted_tasks = self.client.table('user_quest_tasks')\
                        .delete()\
                        .eq('user_quest_id', user_quest_id)\
                        .execute()
                    tasks_deleted += len(deleted_tasks.data or [])

                    # Delete the user_quest record
                    self.client.table('user_quests')\
                        .delete()\
                        .eq('id', user_quest_id)\
                        .execute()
                    quests_unenrolled += 1

            logger.info(f"User {user_id} unenrolled from course {course_id}: {quests_unenrolled} quests, {tasks_deleted} tasks deleted")

            return {
                'success': True,
                'status': 'unenrolled',
                'quests_unenrolled': quests_unenrolled,
                'tasks_deleted': tasks_deleted
            }

        except Exception as e:
            logger.error(f"Error unenrolling user {user_id} from course {course_id}: {str(e)}")
            return {
                'success': False,
                'status': 'failed',
                'error': str(e)
            }

    def bulk_unenroll(self, user_ids: List[str], course_id: str) -> Dict[str, Any]:
        """
        Bulk unenroll multiple users from a course.

        Args:
            user_ids: List of user IDs to unenroll
            course_id: Course ID to unenroll from

        Returns:
            Dict with bulk unenrollment results
        """
        results = []
        unenrolled = 0
        failed = 0

        for user_id in user_ids:
            result = self.unenroll_user(user_id, course_id)

            if result['success']:
                unenrolled += 1
                results.append({
                    'user_id': user_id,
                    'status': 'unenrolled'
                })
            else:
                failed += 1
                results.append({
                    'user_id': user_id,
                    'status': 'failed',
                    'error': result.get('error', 'Unknown error')
                })

        return {
            'success': failed == 0,
            'unenrolled': unenrolled,
            'failed': failed,
            'results': results
        }

    def get_enrollments_with_progress(
        self,
        course_id: str,
        page: int = 1,
        per_page: int = 25,
        search: Optional[str] = None,
        status: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get all enrollments for a course with progress data.

        Args:
            course_id: Course ID
            page: Page number (1-indexed)
            per_page: Enrollments per page (max 50)
            search: Optional search term for user email/name
            status: Optional filter by enrollment status

        Returns:
            Dict with enrollments and pagination:
            {
                'enrollments': [...],
                'total': int,
                'page': int,
                'per_page': int,
                'total_pages': int
            }
        """
        try:
            per_page = min(per_page, 50)
            offset = (page - 1) * per_page

            # Build base query for enrollments
            query = self.client.table('course_enrollments')\
                .select('*, users(id, email, display_name, first_name, last_name)', count='exact')\
                .eq('course_id', course_id)

            if status:
                query = query.eq('status', status)

            # Get enrollments with user data
            result = query.order('enrolled_at', desc=True)\
                .range(offset, offset + per_page - 1)\
                .execute()

            enrollments = result.data or []
            total = result.count or 0

            # Filter by search term if provided (client-side for simplicity)
            if search and enrollments:
                search_lower = search.lower()
                enrollments = [
                    e for e in enrollments
                    if e.get('users') and (
                        search_lower in (e['users'].get('email', '') or '').lower() or
                        search_lower in (e['users'].get('display_name', '') or '').lower() or
                        search_lower in (e['users'].get('first_name', '') or '').lower() or
                        search_lower in (e['users'].get('last_name', '') or '').lower()
                    )
                ]
                total = len(enrollments)

            # Calculate progress for each enrolled user
            user_ids = [e['user_id'] for e in enrollments]
            progress_map = {}

            if user_ids:
                for user_id in user_ids:
                    progress = self.progress_service.calculate_course_progress(user_id, course_id)
                    progress_map[user_id] = self.progress_service.to_dict(progress)

            # Combine enrollment data with progress
            enriched_enrollments = []
            for enrollment in enrollments:
                user_data = enrollment.pop('users', {}) or {}
                enriched_enrollments.append({
                    'id': enrollment['id'],
                    'user_id': enrollment['user_id'],
                    'user': {
                        'email': user_data.get('email'),
                        'display_name': user_data.get('display_name'),
                        'first_name': user_data.get('first_name'),
                        'last_name': user_data.get('last_name')
                    },
                    'status': enrollment['status'],
                    'enrolled_at': enrollment.get('enrolled_at'),
                    'completed_at': enrollment.get('completed_at'),
                    'current_quest_id': enrollment.get('current_quest_id'),
                    'progress': progress_map.get(enrollment['user_id'], {})
                })

            total_pages = (total + per_page - 1) // per_page if total > 0 else 1

            return {
                'enrollments': enriched_enrollments,
                'total': total,
                'page': page,
                'per_page': per_page,
                'total_pages': total_pages
            }

        except Exception as e:
            logger.error(f"Error getting enrollments for course {course_id}: {str(e)}")
            return {
                'enrollments': [],
                'total': 0,
                'page': page,
                'per_page': per_page,
                'total_pages': 1,
                'error': str(e)
            }

    def get_enrollable_users(
        self,
        course_id: str,
        organization_id: Optional[str] = None,
        is_superadmin: bool = False,
        page: int = 1,
        per_page: int = 25,
        search: Optional[str] = None,
        role: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get users eligible for enrollment in a course.

        For superadmin: Returns platform users (organization_id IS NULL)
        For org_admin: Returns their organization's users only

        Args:
            course_id: Course ID
            organization_id: Organization ID (for org_admin)
            is_superadmin: Whether the requester is a superadmin
            page: Page number (1-indexed)
            per_page: Users per page (max 50)
            search: Optional search term
            role: Optional role filter

        Returns:
            Dict with users and pagination
        """
        try:
            per_page = min(per_page, 50)
            offset = (page - 1) * per_page

            # Build base query
            query = self.client.table('users')\
                .select('id, email, display_name, first_name, last_name, role, org_role, total_xp', count='exact')

            if is_superadmin:
                # Superadmin: get platform users (no organization)
                query = query.is_('organization_id', 'null')\
                    .neq('role', 'superadmin')
            else:
                # Org admin: get their organization's users
                query = query.eq('organization_id', organization_id)

            if role:
                # Filter by role (handles both role and org_role)
                if is_superadmin:
                    query = query.eq('role', role)
                else:
                    query = query.eq('org_role', role)

            # Apply search filter
            if search:
                # Use ilike for case-insensitive search on email
                query = query.or_(
                    f"email.ilike.%{search}%,"
                    f"display_name.ilike.%{search}%,"
                    f"first_name.ilike.%{search}%,"
                    f"last_name.ilike.%{search}%"
                )

            # Get paginated results
            result = query.order('email')\
                .range(offset, offset + per_page - 1)\
                .execute()

            users = result.data or []
            total = result.count or 0

            # Get already enrolled user IDs
            enrolled_result = self.client.table('course_enrollments')\
                .select('user_id')\
                .eq('course_id', course_id)\
                .execute()
            enrolled_user_ids = set(e['user_id'] for e in (enrolled_result.data or []))

            # Mark users as enrolled or not
            for user in users:
                user['is_enrolled'] = user['id'] in enrolled_user_ids

            total_pages = (total + per_page - 1) // per_page if total > 0 else 1

            return {
                'users': users,
                'total': total,
                'page': page,
                'per_page': per_page,
                'total_pages': total_pages
            }

        except Exception as e:
            logger.error(f"Error getting enrollable users for course {course_id}: {str(e)}")
            return {
                'users': [],
                'total': 0,
                'page': page,
                'per_page': per_page,
                'total_pages': 1,
                'error': str(e)
            }
