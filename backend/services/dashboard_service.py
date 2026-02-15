"""
Dashboard service for aggregating user dashboard data.

Orchestrates multiple tables for dashboard-related operations including:
- Active quests and enrolled courses
- XP statistics and progress tracking
- Task completion status
"""

from typing import Dict, Any, List, Set, Tuple, Optional
from datetime import datetime, timezone
import logging

from database import get_supabase_admin_client

logger = logging.getLogger(__name__)


class DashboardService:
    """
    Service for dashboard data operations.
    Uses admin client since this aggregates data across multiple tables.
    """

    def __init__(self, client=None):
        self.client = client or get_supabase_admin_client()

    # =========================================================================
    # SUBJECT XP
    # =========================================================================

    def get_user_subject_xp(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get user's XP by school subject for diploma credits.
        Returns both finalized (xp_amount) and pending XP for draft feedback system.

        Args:
            user_id: User ID

        Returns:
            List of {school_subject, xp_amount, pending_xp} dicts
        """
        # Try user_subject_xp table first
        response = self.client.table('user_subject_xp')\
            .select('school_subject, xp_amount, pending_xp')\
            .eq('user_id', user_id)\
            .execute()

        subject_xp = response.data or []

        # Ensure pending_xp is present (for backward compatibility)
        for record in subject_xp:
            if 'pending_xp' not in record:
                record['pending_xp'] = 0

        # If no data, calculate from completed tasks
        if not subject_xp:
            subject_xp = self._calculate_subject_xp_from_completions(user_id)

        return subject_xp

    def _calculate_subject_xp_from_completions(
        self, user_id: str
    ) -> List[Dict[str, Any]]:
        """Calculate subject XP from completed tasks' diploma_subjects."""
        completed_tasks = self.client.table('quest_task_completions')\
            .select('user_quest_task_id, user_quest_tasks(xp_value, diploma_subjects)')\
            .eq('user_id', user_id)\
            .execute()

        if not completed_tasks.data:
            return []

        subject_xp_map = {}
        for completion in completed_tasks.data:
            task_info = completion.get('user_quest_tasks')
            if not task_info:
                continue

            # Handle both dict and list formats
            if isinstance(task_info, list) and task_info:
                task_info = task_info[0]

            diploma_subjects = task_info.get('diploma_subjects')
            task_xp = task_info.get('xp_value', 0) or 0

            if diploma_subjects and isinstance(diploma_subjects, dict):
                for subject, percentage in diploma_subjects.items():
                    # Normalize subject name
                    normalized = subject.lower().replace(' ', '_').replace('&', 'and')
                    subject_xp = int(task_xp * percentage / 100)
                    subject_xp_map[normalized] = subject_xp_map.get(normalized, 0) + subject_xp

        return [
            {'school_subject': subject, 'xp_amount': xp}
            for subject, xp in subject_xp_map.items()
        ]

    # =========================================================================
    # ENROLLED COURSES
    # =========================================================================

    def get_enrolled_courses(self, user_id: str) -> Tuple[List[Dict], Set[str]]:
        """
        Get user's enrolled courses with progress data and quest details.

        Args:
            user_id: User ID

        Returns:
            Tuple of (courses_list, course_quest_ids set)
        """
        try:
            logger.info(f"Fetching enrolled courses for user {user_id[:8]}...")

            # Fetch active course enrollments
            enrollments = self.client.table('course_enrollments')\
                .select('*, courses(*)')\
                .eq('user_id', user_id)\
                .eq('status', 'active')\
                .execute()

            logger.info(f"Found {len(enrollments.data or [])} active enrollments")

            if not enrollments.data:
                return [], set()

            courses_with_progress = []
            all_course_quest_ids = set()

            for enrollment in enrollments.data:
                course = enrollment.get('courses', {})
                if not course:
                    continue

                course_id = course.get('id')
                course_data = self._process_course_enrollment(
                    course_id, course, enrollment, user_id
                )

                if course_data:
                    courses_with_progress.append(course_data)
                    all_course_quest_ids.update(course_data.get('quest_ids', []))

            logger.info(f"Total course quest IDs to exclude: {len(all_course_quest_ids)}")
            return courses_with_progress, all_course_quest_ids

        except Exception as e:
            logger.error(f"Error fetching enrolled courses: {str(e)}")
            return [], set()

    def _process_course_enrollment(
        self,
        course_id: str,
        course: Dict,
        enrollment: Dict,
        user_id: str
    ) -> Optional[Dict[str, Any]]:
        """Process a single course enrollment with quest progress."""
        # Get quests in this course
        course_quests = self.client.table('course_quests')\
            .select('quest_id, sequence_order, quests(id, title, description, image_url, header_image_url)')\
            .eq('course_id', course_id)\
            .order('sequence_order')\
            .execute()

        quest_ids = [cq['quest_id'] for cq in (course_quests.data or [])]

        if not quest_ids:
            return None

        # Get user's enrollment status for each quest
        user_quest_enrollments = self._get_user_quest_enrollments(user_id, quest_ids)

        # Batch fetch task data
        user_quest_ids = [uq['id'] for uq in user_quest_enrollments.values() if uq.get('id')]
        task_counts, completion_counts = self._get_task_progress_batch(user_id, user_quest_ids)

        # Build quest details with progress
        quests_with_progress = []
        completed_count = 0

        for cq in (course_quests.data or []):
            quest_id = cq['quest_id']
            quest_info = cq.get('quests', {}) or {}
            user_quest = user_quest_enrollments.get(quest_id, {})

            is_completed = user_quest.get('completed_at') and not user_quest.get('is_active')
            is_enrolled = bool(user_quest.get('id'))

            if is_completed:
                completed_count += 1

            # Get task progress
            completed_tasks = 0
            total_tasks = 0
            if user_quest.get('id'):
                uq_id = user_quest['id']
                total_tasks = task_counts.get(uq_id, 0)
                completed_tasks = completion_counts.get(uq_id, 0)

            quests_with_progress.append({
                'id': quest_id,
                'title': quest_info.get('title', 'Untitled Quest'),
                'description': quest_info.get('description'),
                'image_url': quest_info.get('image_url'),
                'header_image_url': quest_info.get('header_image_url'),
                'sequence_order': cq.get('sequence_order', 0),
                'is_enrolled': is_enrolled,
                'is_completed': is_completed,
                'progress': {
                    'completed_tasks': completed_tasks,
                    'total_tasks': total_tasks,
                    'percentage': round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0
                }
            })

        total_count = len(quest_ids)

        return {
            'id': course_id,
            'title': course.get('title'),
            'description': course.get('description'),
            'cover_image_url': course.get('cover_image_url'),
            'status': enrollment.get('status'),
            'enrolled_at': enrollment.get('enrolled_at'),
            'current_quest_id': enrollment.get('current_quest_id'),
            'progress': {
                'completed_quests': completed_count,
                'total_quests': total_count,
                'percentage': round((completed_count / total_count * 100), 1) if total_count > 0 else 0
            },
            'quests': quests_with_progress,
            'quest_ids': quest_ids
        }

    def _get_user_quest_enrollments(
        self, user_id: str, quest_ids: List[str]
    ) -> Dict[str, Dict]:
        """Get user's quest enrollment status for a list of quest IDs."""
        if not quest_ids:
            return {}

        uq_response = self.client.table('user_quests')\
            .select('id, quest_id, is_active, completed_at')\
            .eq('user_id', user_id)\
            .in_('quest_id', quest_ids)\
            .execute()

        return {uq['quest_id']: uq for uq in (uq_response.data or [])}

    def _get_task_progress_batch(
        self, user_id: str, user_quest_ids: List[str]
    ) -> Tuple[Dict[str, int], Dict[str, int]]:
        """
        Batch fetch task counts and completion counts for multiple user quests.

        Returns:
            Tuple of (task_counts dict, completion_counts dict)
        """
        task_counts = {}
        completion_counts = {}
        task_id_to_user_quest = {}

        if not user_quest_ids:
            return task_counts, completion_counts

        # Fetch all approved tasks
        all_tasks = self.client.table('user_quest_tasks')\
            .select('id, user_quest_id')\
            .in_('user_quest_id', user_quest_ids)\
            .eq('approval_status', 'approved')\
            .execute()

        for task in (all_tasks.data or []):
            uq_id = task['user_quest_id']
            task_counts[uq_id] = task_counts.get(uq_id, 0) + 1
            task_id_to_user_quest[task['id']] = uq_id

        # Fetch all completions
        all_task_ids = list(task_id_to_user_quest.keys())
        if all_task_ids:
            completions = self.client.table('quest_task_completions')\
                .select('user_quest_task_id')\
                .eq('user_id', user_id)\
                .in_('user_quest_task_id', all_task_ids)\
                .execute()

            for completion in (completions.data or []):
                task_id = completion['user_quest_task_id']
                uq_id = task_id_to_user_quest.get(task_id)
                if uq_id:
                    completion_counts[uq_id] = completion_counts.get(uq_id, 0) + 1

        return task_counts, completion_counts

    # =========================================================================
    # ACTIVE QUESTS
    # =========================================================================

    def get_active_quests(
        self,
        user_id: str,
        exclude_quest_ids: Set[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get user's active quests with details.

        Args:
            user_id: User ID
            exclude_quest_ids: Optional set of quest IDs to exclude

        Returns:
            List of active quest enrollment records with quest details
        """
        try:
            # Get active enrollments
            query = self.client.table('user_quests')\
                .select('*, quests(*)')\
                .eq('user_id', user_id)\
                .eq('is_active', True)

            active_quests = query.execute()

            # Filter out course quests
            if exclude_quest_ids and active_quests.data:
                original_count = len(active_quests.data)
                active_quests.data = [
                    q for q in active_quests.data
                    if q.get('quest_id') not in exclude_quest_ids
                ]
                filtered_count = original_count - len(active_quests.data)
                logger.info(f"Excluded {filtered_count} course quests from {original_count} active quests")

            if not active_quests.data:
                return []

            # Filter out stale completed quests
            active_only = self._filter_stale_quests(active_quests.data)

            # Enrich with task data
            return self._enrich_active_quests(user_id, active_only)

        except Exception as e:
            logger.error(f"Error fetching active quests: {str(e)}")
            return self._get_active_quests_fallback(user_id, exclude_quest_ids)

    def _filter_stale_quests(self, quests: List[Dict]) -> List[Dict]:
        """Filter out stale completed quests that were never properly ended."""
        active_only = []

        for quest in quests:
            completed_at = quest.get('completed_at')
            last_picked_up_at = quest.get('last_picked_up_at')

            # If no completed_at, it's truly active
            if not completed_at:
                active_only.append(quest)
                continue

            # Check if this is a legitimate restart
            try:
                completed_dt = datetime.fromisoformat(completed_at.replace('Z', '+00:00'))

                if last_picked_up_at:
                    picked_up_dt = datetime.fromisoformat(last_picked_up_at.replace('Z', '+00:00'))
                    if picked_up_dt > completed_dt:
                        active_only.append(quest)
                        continue

                logger.info(f"Filtering out stale completed quest {quest.get('id', '')[:8]}")

            except (ValueError, AttributeError) as e:
                logger.warning(f"Could not parse timestamps for quest {quest.get('id')}: {e}")
                active_only.append(quest)

        filtered_count = len(quests) - len(active_only)
        if filtered_count > 0:
            logger.info(f"Filtered out {filtered_count} stale completed quest(s)")

        return active_only

    def _enrich_active_quests(
        self, user_id: str, quests: List[Dict]
    ) -> List[Dict[str, Any]]:
        """Enrich active quests with task data and progress."""
        user_quest_ids = [e.get('id') for e in quests if e.get('id')]

        if not user_quest_ids:
            return quests

        # Batch fetch tasks
        tasks_by_enrollment = {}
        all_task_ids = []

        all_tasks = self.client.table('user_quest_tasks')\
            .select('*')\
            .in_('user_quest_id', user_quest_ids)\
            .eq('approval_status', 'approved')\
            .order('order_index')\
            .execute()

        for task in (all_tasks.data or []):
            uq_id = task.get('user_quest_id')
            if uq_id not in tasks_by_enrollment:
                tasks_by_enrollment[uq_id] = []
            tasks_by_enrollment[uq_id].append(task)
            all_task_ids.append(task['id'])

        # Batch fetch completions
        completed_task_ids = set()
        if all_task_ids:
            completions = self.client.table('quest_task_completions')\
                .select('user_quest_task_id')\
                .eq('user_id', user_id)\
                .in_('user_quest_task_id', all_task_ids)\
                .execute()

            completed_task_ids = {t['user_quest_task_id'] for t in (completions.data or [])}

        # Process each quest
        for enrollment in quests:
            enrollment_id = enrollment.get('id')
            tasks = tasks_by_enrollment.get(enrollment_id, [])

            # Calculate XP and pillar breakdown
            total_xp = 0
            pillar_breakdown = {}

            for task in tasks:
                xp_amount = task.get('xp_value', 0)
                pillar = task.get('pillar', 'creativity')
                total_xp += xp_amount
                pillar_breakdown[pillar] = pillar_breakdown.get(pillar, 0) + xp_amount

            # Update quest info
            quest_info = enrollment.get('quests', {})
            quest_info['total_xp'] = total_xp
            quest_info['task_count'] = len(tasks)
            quest_info['pillar_breakdown'] = pillar_breakdown

            # Mark task completion status
            completed_count = 0
            for task in tasks:
                is_completed = task['id'] in completed_task_ids
                task['is_completed'] = is_completed
                if is_completed:
                    completed_count += 1

            enrollment['completed_tasks'] = completed_count
            quest_info['quest_tasks'] = tasks

        return quests

    def _get_active_quests_fallback(
        self, user_id: str, exclude_quest_ids: Set[str] = None
    ) -> List[Dict]:
        """Fallback method for getting active quests without nested relations."""
        try:
            query = self.client.table('user_quests')\
                .select('*')\
                .eq('user_id', user_id)\
                .eq('is_active', True)

            if exclude_quest_ids:
                query = query.not_.in_('quest_id', list(exclude_quest_ids))

            active_quests = query.execute()

            if not active_quests.data:
                return []

            active_only = self._filter_stale_quests(active_quests.data)

            # Fetch quest details separately
            quest_ids = [e.get('quest_id') for e in active_only if e.get('quest_id')]
            quests_by_id = {}

            if quest_ids:
                quests_response = self.client.table('quests')\
                    .select('*')\
                    .in_('id', quest_ids)\
                    .execute()
                quests_by_id = {q['id']: q for q in (quests_response.data or [])}

            # Attach quest data
            for enrollment in active_only:
                enrollment['quests'] = quests_by_id.get(enrollment.get('quest_id'), {})

            return self._enrich_active_quests(user_id, active_only)

        except Exception as e:
            logger.error(f"Fallback query also failed: {str(e)}")
            return []

    # =========================================================================
    # COMPLETED QUESTS
    # =========================================================================

    def get_completed_quests_count(self, user_id: str) -> int:
        """Get count of completed quests for a user."""
        response = self.client.table('user_quests')\
            .select('id', count='exact')\
            .eq('user_id', user_id)\
            .eq('is_active', False)\
            .not_.is_('completed_at', 'null')\
            .execute()

        return response.count or 0

    def get_recent_completed_quests(
        self, user_id: str, limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Get recent completed quests with details."""
        response = self.client.table('user_quests')\
            .select('id, quest_id, completed_at, quests(id, title, description, image_url, header_image_url)')\
            .eq('user_id', user_id)\
            .eq('is_active', False)\
            .not_.is_('completed_at', 'null')\
            .order('completed_at', desc=True)\
            .limit(limit)\
            .execute()

        return response.data or []

    def get_completed_tasks_count(self, user_id: str) -> int:
        """Get total count of completed tasks for a user."""
        response = self.client.table('quest_task_completions')\
            .select('*', count='exact')\
            .eq('user_id', user_id)\
            .execute()

        if response.count is not None:
            return response.count
        return len(response.data or [])

    # =========================================================================
    # ALL COURSE QUEST IDS
    # =========================================================================

    def get_all_course_quest_ids(self) -> Set[str]:
        """Get all quest IDs that are part of any course."""
        response = self.client.table('course_quests')\
            .select('quest_id')\
            .execute()

        return {cq['quest_id'] for cq in (response.data or [])}

    # =========================================================================
    # DASHBOARD SUMMARY
    # =========================================================================

    def get_dashboard_summary(self, user_id: str) -> Dict[str, Any]:
        """
        Get complete dashboard data for a user.

        Args:
            user_id: User ID

        Returns:
            Dict with user data, stats, quests, courses
        """
        # Get user data
        user = self.client.table('users')\
            .select('*')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not user.data:
            return {'error': 'User not found'}

        # Get enrolled courses and course quest IDs
        enrolled_courses, _ = self.get_enrolled_courses(user_id)

        # Get ALL course quest IDs for exclusion
        all_course_quest_ids = self.get_all_course_quest_ids()

        # Get active standalone quests
        active_quests = self.get_active_quests(user_id, exclude_quest_ids=all_course_quest_ids)

        # Get completion stats
        completed_quests_count = self.get_completed_quests_count(user_id)
        completed_tasks_count = self.get_completed_tasks_count(user_id)
        recent_completed_quests = self.get_recent_completed_quests(user_id)

        # Get XP stats (using helper functions from dashboard helpers)
        from routes.users.helpers import calculate_user_xp, get_user_level, format_skill_data
        total_xp, skill_breakdown = calculate_user_xp(self.client, user_id)
        level_info = get_user_level(total_xp)
        skill_data = format_skill_data(skill_breakdown)

        return {
            'user': user.data,
            'stats': {
                'total_xp': total_xp,
                'level': level_info,
                'completed_quests_count': completed_quests_count,
                'completed_tasks_count': completed_tasks_count
            },
            'xp_by_category': skill_breakdown,
            'skill_xp_data': skill_data,
            'active_quests': active_quests,
            'enrolled_courses': enrolled_courses,
            'recent_completed_quests': recent_completed_quests
        }
