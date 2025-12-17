"""
Quest optimization service to fix N+1 query problems.

This service provides optimized quest listing with batch queries
to eliminate the N+1 problem identified in quest_v3.py.
"""

from typing import Dict, List, Optional, Set, Any
from services.base_service import BaseService
from utils.pillar_mapping import normalize_pillar_name

from utils.logger import get_logger

logger = get_logger(__name__)


class QuestOptimizationService(BaseService):
    """Service to optimize quest queries and eliminate N+1 problems"""

    def __init__(self, user_id: Optional[str] = None):
        super().__init__(user_id)

    def get_user_enrollments_batch(self, user_id: str, quest_ids: List[str]) -> Dict[str, Dict]:
        """
        Get all user enrollments for multiple quests in a single query.

        Args:
            user_id: User ID to get enrollments for
            quest_ids: List of quest IDs to check enrollment for

        Returns:
            Dict mapping quest_id to enrollment data
        """
        if not quest_ids:
            return {}

        try:
            # Single query to get all enrollments for the user and quest list
            enrollments = self.supabase.table('user_quests')\
                .select('*')\
                .eq('user_id', user_id)\
                .in_('quest_id', quest_ids)\
                .execute()

            # Group by quest_id
            enrollment_map = {}
            for enrollment in enrollments.data or []:
                quest_id = enrollment['quest_id']
                if quest_id not in enrollment_map:
                    enrollment_map[quest_id] = []
                enrollment_map[quest_id].append(enrollment)

            # Process to find active/completed enrollments per quest
            result = {}
            for quest_id, enrollments in enrollment_map.items():
                active_enrollment = None
                completed_enrollment = None

                for enr in enrollments:
                    if enr.get('completed_at'):
                        completed_enrollment = enr
                    elif enr.get('is_active') is not False:
                        active_enrollment = enr

                result[quest_id] = {
                    'active': active_enrollment,
                    'completed': completed_enrollment
                }

            return result

        except Exception as e:
            logger.error(f"Error getting user enrollments batch: {e}")
            return {}

    def get_user_task_completions_batch(self, user_id: str, enrollment_ids: List[str]) -> Dict[str, Set[str]]:
        """
        Get all task completions for multiple enrollments in a single query.

        Args:
            user_id: User ID
            enrollment_ids: List of user_quest enrollment IDs

        Returns:
            Dict mapping enrollment_id to set of completed task IDs
        """
        if not enrollment_ids:
            return {}

        try:
            # OPTIMIZATION: Avoid recursive joins that cause stack depth errors
            # Instead of joining with user_quest_tasks, we'll fetch tasks separately
            # and build the mapping in memory (much more efficient for PostgreSQL)

            # Step 1: Get all user_quest_tasks for the enrollments we care about
            tasks = self.supabase.table('user_quest_tasks')\
                .select('id, user_quest_id')\
                .in_('user_quest_id', enrollment_ids)\
                .execute()

            # Build a map of task_id -> enrollment_id
            task_to_enrollment = {}
            for task in tasks.data or []:
                task_to_enrollment[task['id']] = task['user_quest_id']

            # Step 2: Get all completions for this user
            completions = self.supabase.table('quest_task_completions')\
                .select('user_quest_task_id')\
                .eq('user_id', user_id)\
                .in_('user_quest_task_id', list(task_to_enrollment.keys()) if task_to_enrollment else ['__none__'])\
                .execute()

            # Step 3: Build the completion map using our in-memory task mapping
            completion_map = {}
            for completion in completions.data or []:
                task_id = completion['user_quest_task_id']
                enrollment_id = task_to_enrollment.get(task_id)

                if enrollment_id:
                    if enrollment_id not in completion_map:
                        completion_map[enrollment_id] = set()
                    completion_map[enrollment_id].add(task_id)

            return completion_map

        except Exception as e:
            logger.error(f"Error getting task completions batch: {e}")
            return {}

    def get_user_quest_tasks_batch(self, enrollment_ids: List[str]) -> Dict[str, List[Dict]]:
        """
        Get all user-specific tasks for multiple enrollments in a single query.

        Args:
            enrollment_ids: List of user_quest enrollment IDs

        Returns:
            Dict mapping enrollment_id to list of task data (including pillar, xp_value)
        """
        if not enrollment_ids:
            return {}

        try:
            # Single query to get all user tasks
            tasks = self.supabase.table('user_quest_tasks')\
                .select('id, user_quest_id, pillar, xp_value')\
                .in_('user_quest_id', enrollment_ids)\
                .eq('approval_status', 'approved')\
                .execute()

            # Group by enrollment_id
            task_map = {}
            for task in tasks.data or []:
                enrollment_id = task['user_quest_id']
                if enrollment_id not in task_map:
                    task_map[enrollment_id] = []
                task_map[enrollment_id].append(task)

            return task_map

        except Exception as e:
            logger.error(f"Error getting user quest tasks batch: {e}")
            return {}

    def enrich_quests_with_user_data(self, quests: List[Dict], user_id: str) -> List[Dict]:
        """
        Enrich quests with user enrollment and progress data using optimized batch queries.

        This replaces the N+1 query pattern with 3 batch queries total:
        1. Get all user enrollments for all quests
        2. Get all task completions for all enrollments
        3. Calculate progress for all quests

        Args:
            quests: List of quest objects with quest_tasks
            user_id: User ID to get data for

        Returns:
            Enriched quest list with user enrollment and progress data
        """
        if not quests or not user_id:
            return quests

        # Extract quest IDs
        quest_ids = [quest['id'] for quest in quests]

        # Batch query 1: Get all enrollments for user
        logger.info(f"[OPTIMIZATION] Getting enrollments for {len(quest_ids)} quests in 1 query")
        enrollments_map = self.get_user_enrollments_batch(user_id, quest_ids)

        # Collect enrollment IDs for batch query 2
        enrollment_ids = []
        for quest_data in enrollments_map.values():
            if quest_data.get('active'):
                enrollment_ids.append(quest_data['active']['id'])
            if quest_data.get('completed'):
                enrollment_ids.append(quest_data['completed']['id'])

        # Batch query 2: Get all user tasks (personalized)
        if enrollment_ids:
            logger.info(f"[OPTIMIZATION] Getting user tasks for {len(enrollment_ids)} enrollments in 1 query")
            user_tasks_map = self.get_user_quest_tasks_batch(enrollment_ids)
        else:
            user_tasks_map = {}

        # Batch query 3: Get all task completions
        if enrollment_ids:
            logger.info(f"[OPTIMIZATION] Getting task completions for {len(enrollment_ids)} enrollments in 1 query")
            completions_map = self.get_user_task_completions_batch(user_id, enrollment_ids)
        else:
            completions_map = {}

        # Enrich each quest with user data
        for quest in quests:
            quest_id = quest['id']
            quest_enrollments = enrollments_map.get(quest_id)

            if not quest_enrollments:
                continue

            completed_enrollment = quest_enrollments.get('completed')
            active_enrollment = quest_enrollments.get('active')

            # Handle completed quest
            if completed_enrollment:
                quest['completed_enrollment'] = completed_enrollment
                enrollment_id = completed_enrollment['id']

                # Get user's personalized tasks for this enrollment
                user_tasks = user_tasks_map.get(enrollment_id, [])
                completed_task_ids = completions_map.get(enrollment_id, set())

                # Calculate progress from user tasks
                total_tasks = len(user_tasks)
                quest['progress'] = {
                    'completed_tasks': len(completed_task_ids),
                    'total_tasks': total_tasks,
                    'percentage': 100
                }

                # Calculate pillar breakdown from user's tasks
                pillar_breakdown = {}
                logger.debug(f"[PILLAR DEBUG] Processing completed quest {quest_id[:8]}, {len(user_tasks)} tasks")
                for task in user_tasks:
                    db_pillar = task.get('pillar', 'art')
                    # Normalize pillar name (handles legacy values, new values already normalized)
                    try:
                        pillar = normalize_pillar_name(db_pillar)
                    except ValueError:
                        pillar = 'art'  # Default fallback
                    xp = task.get('xp_value', 0)
                    logger.debug(f"[PILLAR DEBUG]   Task: db_pillar={db_pillar}, normalized={pillar}, xp={xp}")
                    pillar_breakdown[pillar] = pillar_breakdown.get(pillar, 0) + xp
                quest['pillar_breakdown'] = pillar_breakdown
                logger.debug(f"[PILLAR DEBUG] Final breakdown for quest {quest_id[:8]}: {pillar_breakdown}")

            # Handle active quest (only if no completed enrollment)
            elif active_enrollment:
                quest['user_enrollment'] = active_enrollment
                enrollment_id = active_enrollment['id']

                # Get user's personalized tasks for this enrollment
                user_tasks = user_tasks_map.get(enrollment_id, [])
                completed_task_ids = completions_map.get(enrollment_id, set())

                # Calculate progress from user tasks
                total_tasks = len(user_tasks)
                completed_count = len(completed_task_ids)

                quest['progress'] = {
                    'completed_tasks': completed_count,
                    'total_tasks': total_tasks,
                    'percentage': (completed_count / total_tasks * 100) if total_tasks > 0 else 0
                }

                # Calculate pillar breakdown from user's tasks
                pillar_breakdown = {}
                logger.debug(f"[PILLAR DEBUG] Processing active quest {quest_id[:8]}, {len(user_tasks)} tasks")
                for task in user_tasks:
                    db_pillar = task.get('pillar', 'art')
                    # Normalize pillar name (handles legacy values, new values already normalized)
                    try:
                        pillar = normalize_pillar_name(db_pillar)
                    except ValueError:
                        pillar = 'art'  # Default fallback
                    xp = task.get('xp_value', 0)
                    logger.debug(f"[PILLAR DEBUG]   Task: db_pillar={db_pillar}, normalized={pillar}, xp={xp}")
                    pillar_breakdown[pillar] = pillar_breakdown.get(pillar, 0) + xp
                quest['pillar_breakdown'] = pillar_breakdown
                logger.debug(f"[PILLAR DEBUG] Final breakdown for quest {quest_id[:8]}: {pillar_breakdown}")

        logger.info(f"[OPTIMIZATION] Enriched {len(quests)} quests with {len(enrollment_ids)} enrollments using 4 total queries instead of {len(quests) * 2}")
        return quests

    def get_quest_filtering_optimization(self, pillar_filter: str = None, subject_filter: str = None) -> Optional[Set[str]]:
        """
        Optimize quest filtering by pre-filtering quest IDs based on task criteria.

        Note: In personalized quest system, filtering by pillar/subject doesn't work
        since tasks are user-specific. Return None to disable filtering.

        Args:
            pillar_filter: Pillar to filter by (ignored in V3)
            subject_filter: Subject to filter by (ignored in V3)

        Returns:
            None (filtering disabled in personalized system)
        """
        # In V3 personalized system, we can't filter quests by task criteria
        # because tasks are created when users enroll, not at quest template level
        # Return None to indicate no filtering should be applied
        return None



# Global service instance
quest_optimization_service = QuestOptimizationService()