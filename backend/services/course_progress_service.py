"""
Course Progress Service

Centralized XP and progress calculations for courses and quests.
Extracts complex progress logic from courses.py to enable reuse and caching.

Usage:
    from services.course_progress_service import CourseProgressService

    progress_service = CourseProgressService(supabase_client)

    # Calculate progress for a single course
    progress = progress_service.calculate_course_progress(user_id, course_id)

    # Calculate progress for multiple courses (bulk)
    progress_map = progress_service.calculate_bulk_progress(user_id, course_ids)

    # Calculate quest progress within a course
    quest_progress = progress_service.calculate_quest_progress(user_id, quest_id, lesson_ids)
"""

from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from services.base_service import BaseService
from utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class QuestProgress:
    """Progress data for a single quest."""
    quest_id: str
    earned_xp: int = 0
    total_xp: int = 0
    completed_tasks: int = 0
    total_tasks: int = 0
    percentage: float = 0.0
    is_completed: bool = False


@dataclass
class CourseProgress:
    """Progress data for a course."""
    course_id: str
    earned_xp: int = 0
    total_xp: int = 0
    completed_quests: int = 0
    total_quests: int = 0
    percentage: float = 0.0
    is_completed: bool = False
    quest_progress: Dict[str, QuestProgress] = field(default_factory=dict)


@dataclass
class LessonProgress:
    """Progress data for a single lesson."""
    lesson_id: str
    status: str = 'not_started'  # not_started, in_progress, completed
    progress_percentage: int = 0
    completed_steps: List[int] = field(default_factory=list)
    current_step_index: int = 0


class CourseProgressService(BaseService):
    """
    Service for calculating course and quest progress.

    Consolidates progress calculation logic from:
    - courses.py list_courses() (lines 94-169)
    - courses.py get_course_homepage() (lines 1233-1346)
    """

    def __init__(self, supabase_client):
        """
        Initialize with Supabase client.

        Args:
            supabase_client: Supabase admin client for queries
        """
        super().__init__()
        self.client = supabase_client

    def calculate_quest_progress(
        self,
        user_id: str,
        quest_id: str,
        enrollment_id: Optional[str] = None,
        linked_task_ids: Optional[List[str]] = None,
        lesson_xp_thresholds: Optional[List[int]] = None
    ) -> QuestProgress:
        """
        Calculate XP progress for a single quest.

        Args:
            user_id: User ID
            quest_id: Quest ID
            enrollment_id: User quest enrollment ID (fetched if not provided)
            linked_task_ids: List of task IDs linked to lessons (fetched if not provided)
            lesson_xp_thresholds: List of XP thresholds from lessons (fetched if not provided)

        Returns:
            QuestProgress with earned/total XP and completion status
        """
        try:
            progress = QuestProgress(quest_id=quest_id)

            # Get enrollment if not provided
            if enrollment_id is None:
                enrollment_result = self.client.table('user_quests')\
                    .select('id, completed_at, is_active')\
                    .eq('user_id', user_id)\
                    .eq('quest_id', quest_id)\
                    .execute()

                if not enrollment_result.data:
                    return progress  # Not enrolled
                enrollment = enrollment_result.data[0]
                enrollment_id = enrollment['id']
                progress.is_completed = (
                    enrollment.get('completed_at') is not None and
                    not enrollment.get('is_active', True)
                )

            # Get lessons and linked tasks if not provided
            if linked_task_ids is None or lesson_xp_thresholds is None:
                lessons_result = self.client.table('curriculum_lessons')\
                    .select('id, xp_threshold, is_published')\
                    .eq('quest_id', quest_id)\
                    .execute()

                lessons = [l for l in (lessons_result.data or []) if l.get('is_published') is not False]

                if lesson_xp_thresholds is None:
                    lesson_xp_thresholds = [l.get('xp_threshold', 0) or 0 for l in lessons]

                if linked_task_ids is None:
                    lesson_ids = [l['id'] for l in lessons]
                    if lesson_ids:
                        links_result = self.client.table('curriculum_lesson_tasks')\
                            .select('task_id')\
                            .eq('quest_id', quest_id)\
                            .execute()
                        linked_task_ids = [link['task_id'] for link in (links_result.data or [])]

            # Calculate total XP from lesson thresholds
            progress.total_xp = sum(lesson_xp_thresholds) if lesson_xp_thresholds else 0
            progress.total_tasks = len(linked_task_ids) if linked_task_ids else 0

            # Get completed tasks and earned XP
            if linked_task_ids and enrollment_id:
                user_tasks_result = self.client.table('user_quest_tasks')\
                    .select('id, xp_value')\
                    .eq('user_quest_id', enrollment_id)\
                    .in_('id', linked_task_ids)\
                    .execute()

                user_tasks = user_tasks_result.data or []
                if user_tasks:
                    task_ids = [t['id'] for t in user_tasks]
                    task_xp_map = {t['id']: t.get('xp_value', 0) or 0 for t in user_tasks}

                    completions_result = self.client.table('quest_task_completions')\
                        .select('user_quest_task_id')\
                        .eq('user_id', user_id)\
                        .in_('user_quest_task_id', task_ids)\
                        .execute()

                    completions = completions_result.data or []
                    progress.completed_tasks = len(completions)
                    progress.earned_xp = sum(
                        task_xp_map.get(c['user_quest_task_id'], 0)
                        for c in completions
                    )

            # Calculate percentage
            if progress.total_xp > 0:
                progress.percentage = min(100, round((progress.earned_xp / progress.total_xp * 100), 1))

            return progress

        except Exception as e:
            logger.error(f"Error calculating quest progress for {quest_id}: {str(e)}", exc_info=True)
            return QuestProgress(quest_id=quest_id)

    def calculate_course_progress(
        self,
        user_id: str,
        course_id: str,
        include_quest_details: bool = False
    ) -> CourseProgress:
        """
        Calculate XP progress for a course.

        Args:
            user_id: User ID
            course_id: Course ID
            include_quest_details: Whether to include per-quest progress

        Returns:
            CourseProgress with earned/total XP and completion status
        """
        try:
            progress = CourseProgress(course_id=course_id)

            # Get course quests (only published and required)
            course_quests_result = self.client.table('course_quests')\
                .select('quest_id, is_required, is_published')\
                .eq('course_id', course_id)\
                .execute()

            # Filter to published, required quests
            published_quests = [
                q for q in (course_quests_result.data or [])
                if q.get('is_published') is not False
            ]
            required_quests = [
                q for q in published_quests
                if q.get('is_required', True)
            ]

            progress.total_quests = len(required_quests)

            if not required_quests:
                return progress

            quest_ids = [q['quest_id'] for q in required_quests]

            # Get lessons for all quests at once (batched query)
            lessons_result = self.client.table('curriculum_lessons')\
                .select('id, quest_id, xp_threshold, is_published')\
                .in_('quest_id', quest_ids)\
                .execute()

            # Build lesson map by quest
            lessons_by_quest: Dict[str, List[Dict]] = {qid: [] for qid in quest_ids}
            for lesson in (lessons_result.data or []):
                if lesson.get('is_published') is not False:
                    qid = lesson['quest_id']
                    if qid in lessons_by_quest:
                        lessons_by_quest[qid].append(lesson)

            # Calculate total XP from lessons
            for lessons in lessons_by_quest.values():
                progress.total_xp += sum(l.get('xp_threshold', 0) or 0 for l in lessons)

            # Get all lesson IDs for task link lookup
            all_lesson_ids = []
            for lessons in lessons_by_quest.values():
                all_lesson_ids.extend(l['id'] for l in lessons)

            # Get linked tasks for all lessons at once
            linked_tasks_map: Dict[str, List[str]] = {qid: [] for qid in quest_ids}
            if all_lesson_ids:
                links_result = self.client.table('curriculum_lesson_tasks')\
                    .select('lesson_id, task_id, quest_id')\
                    .in_('lesson_id', all_lesson_ids)\
                    .execute()

                for link in (links_result.data or []):
                    qid = link.get('quest_id')
                    if qid in linked_tasks_map:
                        linked_tasks_map[qid].append(link['task_id'])

            # Get user's quest enrollments
            enrollments_result = self.client.table('user_quests')\
                .select('id, quest_id, completed_at, is_active')\
                .eq('user_id', user_id)\
                .in_('quest_id', quest_ids)\
                .execute()

            enrollment_map = {e['quest_id']: e for e in (enrollments_result.data or [])}

            # Get all task IDs for completion lookup
            all_task_ids = []
            for tasks in linked_tasks_map.values():
                all_task_ids.extend(tasks)

            # Get user's tasks with XP values
            task_xp_map: Dict[str, int] = {}
            enrollment_ids = [e['id'] for e in enrollment_map.values()]
            if all_task_ids and enrollment_ids:
                user_tasks_result = self.client.table('user_quest_tasks')\
                    .select('id, xp_value')\
                    .in_('user_quest_id', enrollment_ids)\
                    .in_('id', all_task_ids)\
                    .execute()

                task_xp_map = {
                    t['id']: t.get('xp_value', 0) or 0
                    for t in (user_tasks_result.data or [])
                }

            # Get completions for all tasks
            completed_task_ids = set()
            if task_xp_map:
                completions_result = self.client.table('quest_task_completions')\
                    .select('user_quest_task_id')\
                    .eq('user_id', user_id)\
                    .in_('user_quest_task_id', list(task_xp_map.keys()))\
                    .execute()

                completed_task_ids = {c['user_quest_task_id'] for c in (completions_result.data or [])}

            # Calculate earned XP and quest completions
            for quest_id in quest_ids:
                enrollment = enrollment_map.get(quest_id)
                linked_tasks = linked_tasks_map.get(quest_id, [])

                quest_earned_xp = sum(
                    task_xp_map.get(task_id, 0)
                    for task_id in linked_tasks
                    if task_id in completed_task_ids
                )
                progress.earned_xp += quest_earned_xp

                # Check if quest is completed
                is_quest_completed = (
                    enrollment and
                    enrollment.get('completed_at') is not None and
                    not enrollment.get('is_active', True)
                )
                if is_quest_completed:
                    progress.completed_quests += 1

                # Store per-quest progress if requested
                if include_quest_details:
                    quest_total_xp = sum(
                        l.get('xp_threshold', 0) or 0
                        for l in lessons_by_quest.get(quest_id, [])
                    )
                    quest_completed_tasks = len([
                        t for t in linked_tasks if t in completed_task_ids
                    ])
                    progress.quest_progress[quest_id] = QuestProgress(
                        quest_id=quest_id,
                        earned_xp=quest_earned_xp,
                        total_xp=quest_total_xp,
                        completed_tasks=quest_completed_tasks,
                        total_tasks=len(linked_tasks),
                        percentage=min(100, round((quest_earned_xp / quest_total_xp * 100), 1)) if quest_total_xp > 0 else 0,
                        is_completed=is_quest_completed
                    )

            # Calculate percentage
            if progress.total_xp > 0:
                progress.percentage = min(100, round((progress.earned_xp / progress.total_xp * 100), 1))

            progress.is_completed = progress.percentage >= 100

            return progress

        except Exception as e:
            logger.error(f"Error calculating course progress for {course_id}: {str(e)}", exc_info=True)
            return CourseProgress(course_id=course_id)

    def calculate_bulk_progress(
        self,
        user_id: str,
        course_ids: List[str]
    ) -> Dict[str, CourseProgress]:
        """
        Calculate progress for multiple courses efficiently.

        Args:
            user_id: User ID
            course_ids: List of course IDs

        Returns:
            Dictionary mapping course_id -> CourseProgress
        """
        result = {}

        for course_id in course_ids:
            result[course_id] = self.calculate_course_progress(user_id, course_id)

        return result

    def get_lesson_progress_map(
        self,
        user_id: str,
        quest_id: str
    ) -> Dict[str, LessonProgress]:
        """
        Get progress data for all lessons in a quest.

        Args:
            user_id: User ID
            quest_id: Quest ID

        Returns:
            Dictionary mapping lesson_id -> LessonProgress
        """
        try:
            result = self.client.table('curriculum_lesson_progress')\
                .select('lesson_id, status, progress_percentage, completed_steps, current_step_index')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            progress_map = {}
            for lp in (result.data or []):
                progress_map[lp['lesson_id']] = LessonProgress(
                    lesson_id=lp['lesson_id'],
                    status=lp.get('status', 'not_started'),
                    progress_percentage=lp.get('progress_percentage', 0),
                    completed_steps=lp.get('completed_steps', []),
                    current_step_index=lp.get('current_step_index', 0)
                )

            return progress_map

        except Exception as e:
            logger.warning(f"Could not fetch lesson progress: {e}")
            return {}

    def to_dict(self, progress: CourseProgress) -> Dict[str, Any]:
        """Convert CourseProgress to dictionary for JSON serialization."""
        return {
            'course_id': progress.course_id,
            'earned_xp': progress.earned_xp,
            'total_xp': progress.total_xp,
            'completed_quests': progress.completed_quests,
            'total_quests': progress.total_quests,
            'percentage': progress.percentage,
            'is_completed': progress.is_completed
        }

    def quest_progress_to_dict(self, progress: QuestProgress) -> Dict[str, Any]:
        """Convert QuestProgress to dictionary for JSON serialization."""
        return {
            'quest_id': progress.quest_id,
            'earned_xp': progress.earned_xp,
            'total_xp': progress.total_xp,
            'completed_tasks': progress.completed_tasks,
            'total_tasks': progress.total_tasks,
            'percentage': progress.percentage,
            'is_completed': progress.is_completed
        }

    def check_quest_completion_eligibility(
        self,
        user_id: str,
        quest_id: str,
        course_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Check if a quest within a course meets completion criteria.

        For course projects, completion requires BOTH:
        1. XP threshold met (if set on course_quests)
        2. ALL required tasks completed across all lessons

        Args:
            user_id: User ID
            quest_id: Quest ID
            course_id: Optional course ID (if known)

        Returns:
            Dictionary with:
            - can_complete: bool - Whether the quest can be completed
            - is_course_quest: bool - Whether this quest is part of a course
            - xp_met: bool - Whether XP threshold is met
            - required_tasks_met: bool - Whether all required tasks are completed
            - earned_xp: int - XP earned so far
            - required_xp: int - XP threshold required (0 if no threshold)
            - completed_required: int - Number of completed required tasks
            - total_required: int - Total number of required tasks
            - incomplete_lessons: list - Lessons with incomplete required tasks
        """
        try:
            result = {
                'can_complete': True,
                'is_course_quest': False,
                'xp_met': True,
                'required_tasks_met': True,
                'earned_xp': 0,
                'required_xp': 0,
                'completed_required': 0,
                'total_required': 0,
                'incomplete_lessons': []
            }

            # Check if quest is part of a course
            course_quest_query = self.client.table('course_quests')\
                .select('course_id, xp_threshold, is_required, is_published')\
                .eq('quest_id', quest_id)

            if course_id:
                course_quest_query = course_quest_query.eq('course_id', course_id)

            course_quest_result = course_quest_query.execute()

            if not course_quest_result.data:
                # Not a course quest - standalone quests can be ended anytime
                return result

            course_quest = course_quest_result.data[0]
            result['is_course_quest'] = True
            result['required_xp'] = course_quest.get('xp_threshold', 0) or 0

            # Get user's quest enrollment
            enrollment_result = self.client.table('user_quests')\
                .select('id')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .execute()

            if not enrollment_result.data:
                result['can_complete'] = False
                return result

            user_quest_id = enrollment_result.data[0]['id']

            # Get all lessons for this quest
            lessons_result = self.client.table('curriculum_lessons')\
                .select('id, title, is_published')\
                .eq('quest_id', quest_id)\
                .order('sequence_order')\
                .execute()

            lessons = [l for l in (lessons_result.data or []) if l.get('is_published') is not False]
            lesson_ids = [l['id'] for l in lessons]

            if not lesson_ids:
                # No lessons - check if there's an XP threshold
                if result['required_xp'] > 0:
                    result['xp_met'] = False
                    result['can_complete'] = False
                return result

            # Get all linked tasks for these lessons
            linked_tasks_result = self.client.table('curriculum_lesson_tasks')\
                .select('task_id, lesson_id')\
                .eq('quest_id', quest_id)\
                .in_('lesson_id', lesson_ids)\
                .execute()

            linked_task_ids = [lt['task_id'] for lt in (linked_tasks_result.data or [])]
            task_to_lesson_map = {lt['task_id']: lt['lesson_id'] for lt in (linked_tasks_result.data or [])}

            if not linked_task_ids:
                # No linked tasks - check XP threshold only
                if result['required_xp'] > 0:
                    result['xp_met'] = False
                    result['can_complete'] = False
                return result

            # Get user's tasks for this quest with their details
            user_tasks_result = self.client.table('user_quest_tasks')\
                .select('id, xp_value, is_required, source_task_id')\
                .eq('user_quest_id', user_quest_id)\
                .execute()

            user_tasks = user_tasks_result.data or []

            # Build map of source_task_id -> user_task for tracking
            source_to_user_task = {}
            for ut in user_tasks:
                if ut.get('source_task_id'):
                    source_to_user_task[ut['source_task_id']] = ut

            # Get completed tasks
            user_task_ids = [ut['id'] for ut in user_tasks]
            completed_task_ids = set()
            if user_task_ids:
                completions_result = self.client.table('quest_task_completions')\
                    .select('user_quest_task_id')\
                    .eq('user_id', user_id)\
                    .in_('user_quest_task_id', user_task_ids)\
                    .execute()
                completed_task_ids = {c['user_quest_task_id'] for c in (completions_result.data or [])}

            # Calculate earned XP from linked tasks
            earned_xp = 0
            for ut in user_tasks:
                if ut['id'] in completed_task_ids:
                    earned_xp += ut.get('xp_value', 0) or 0

            result['earned_xp'] = earned_xp

            # Check XP threshold
            if result['required_xp'] > 0 and earned_xp < result['required_xp']:
                result['xp_met'] = False

            # Get required tasks from the source (template) tasks
            # We need to check which linked tasks are marked as required
            required_source_tasks_result = self.client.table('user_quest_tasks')\
                .select('id, is_required, title')\
                .in_('id', linked_task_ids)\
                .eq('is_required', True)\
                .execute()

            required_source_tasks = required_source_tasks_result.data or []

            # Track incomplete required tasks by lesson
            incomplete_by_lesson: Dict[str, List[str]] = {}
            total_required = 0
            completed_required = 0

            for required_task in required_source_tasks:
                total_required += 1
                source_task_id = required_task['id']
                lesson_id = task_to_lesson_map.get(source_task_id)

                # Find the user's version of this task
                user_task = source_to_user_task.get(source_task_id)

                if user_task and user_task['id'] in completed_task_ids:
                    completed_required += 1
                else:
                    # Track incomplete
                    if lesson_id:
                        if lesson_id not in incomplete_by_lesson:
                            incomplete_by_lesson[lesson_id] = []
                        incomplete_by_lesson[lesson_id].append(required_task.get('title', 'Unknown Task'))

            result['total_required'] = total_required
            result['completed_required'] = completed_required

            if completed_required < total_required:
                result['required_tasks_met'] = False

                # Build incomplete lessons list
                lesson_map = {l['id']: l['title'] for l in lessons}
                for lesson_id, task_titles in incomplete_by_lesson.items():
                    result['incomplete_lessons'].append({
                        'id': lesson_id,
                        'title': lesson_map.get(lesson_id, 'Unknown Lesson'),
                        'incomplete_count': len(task_titles),
                        'incomplete_tasks': task_titles
                    })

            # Final eligibility check
            result['can_complete'] = result['xp_met'] and result['required_tasks_met']

            return result

        except Exception as e:
            logger.error(f"Error checking quest completion eligibility for {quest_id}: {str(e)}", exc_info=True)
            # On error, allow completion (fail open)
            return {
                'can_complete': True,
                'is_course_quest': False,
                'xp_met': True,
                'required_tasks_met': True,
                'earned_xp': 0,
                'required_xp': 0,
                'completed_required': 0,
                'total_required': 0,
                'incomplete_lessons': [],
                'error': str(e)
            }
