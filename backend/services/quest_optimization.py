"""
Quest optimization service to fix N+1 query problems.

This service provides optimized quest listing with batch queries
to eliminate the N+1 problem identified in quest_v3.py.
"""

from typing import Dict, List, Optional, Set, Any
from database import get_supabase_client


class QuestOptimizationService:
    """Service to optimize quest queries and eliminate N+1 problems"""

    def __init__(self):
        self.supabase = get_supabase_client()

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
            print(f"Error getting user enrollments batch: {e}")
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
            # Single query to get all task completions
            completions = self.supabase.table('user_quest_tasks')\
                .select('user_quest_id, quest_task_id')\
                .in_('user_quest_id', enrollment_ids)\
                .execute()

            # Group by enrollment_id
            completion_map = {}
            for completion in completions.data or []:
                enrollment_id = completion['user_quest_id']
                task_id = completion['quest_task_id']

                if enrollment_id not in completion_map:
                    completion_map[enrollment_id] = set()
                completion_map[enrollment_id].add(task_id)

            return completion_map

        except Exception as e:
            print(f"Error getting task completions batch: {e}")
            return {}

    def get_quest_task_ids_batch(self, quest_ids: List[str]) -> Dict[str, List[str]]:
        """
        Get all task IDs for multiple quests in a single query.

        Args:
            quest_ids: List of quest IDs

        Returns:
            Dict mapping quest_id to list of task IDs
        """
        if not quest_ids:
            return {}

        try:
            # Single query to get all task IDs
            tasks = self.supabase.table('quest_tasks')\
                .select('id, quest_id')\
                .in_('quest_id', quest_ids)\
                .execute()

            # Group by quest_id
            task_map = {}
            for task in tasks.data or []:
                quest_id = task['quest_id']
                if quest_id not in task_map:
                    task_map[quest_id] = []
                task_map[quest_id].append(task['id'])

            return task_map

        except Exception as e:
            print(f"Error getting quest task IDs batch: {e}")
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
        print(f"[OPTIMIZATION] Getting enrollments for {len(quest_ids)} quests in 1 query")
        enrollments_map = self.get_user_enrollments_batch(user_id, quest_ids)

        # Collect enrollment IDs for batch query 2
        enrollment_ids = []
        for quest_data in enrollments_map.values():
            if quest_data.get('active'):
                enrollment_ids.append(quest_data['active']['id'])
            if quest_data.get('completed'):
                enrollment_ids.append(quest_data['completed']['id'])

        # Batch query 2: Get all task completions
        if enrollment_ids:
            print(f"[OPTIMIZATION] Getting task completions for {len(enrollment_ids)} enrollments in 1 query")
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

                # Get completed task IDs
                enrollment_id = completed_enrollment['id']
                completed_task_ids = completions_map.get(enrollment_id, set())

                # Calculate progress
                total_tasks = len(quest.get('quest_tasks', []))
                quest['progress'] = {
                    'completed_tasks': len(completed_task_ids),
                    'total_tasks': total_tasks,
                    'percentage': 100
                }

                # Mark tasks as completed
                for task in quest.get('quest_tasks', []):
                    task['is_completed'] = task['id'] in completed_task_ids

            # Handle active quest (only if no completed enrollment)
            elif active_enrollment:
                quest['user_enrollment'] = active_enrollment

                # Get completed task IDs
                enrollment_id = active_enrollment['id']
                completed_task_ids = completions_map.get(enrollment_id, set())

                # Calculate progress
                total_tasks = len(quest.get('quest_tasks', []))
                completed_count = len(completed_task_ids)

                quest['progress'] = {
                    'completed_tasks': completed_count,
                    'total_tasks': total_tasks,
                    'percentage': (completed_count / total_tasks * 100) if total_tasks > 0 else 0
                }

                # Mark tasks as completed
                for task in quest.get('quest_tasks', []):
                    task['is_completed'] = task['id'] in completed_task_ids

        print(f"[OPTIMIZATION] Enriched {len(quests)} quests with {len(enrollment_ids)} enrollments using 3 total queries instead of {len(quests) * 2}")
        return quests

    def get_quest_filtering_optimization(self, pillar_filter: str = None, subject_filter: str = None) -> Optional[Set[str]]:
        """
        Optimize quest filtering by pre-filtering quest IDs based on task criteria.

        Args:
            pillar_filter: Pillar to filter by
            subject_filter: Subject to filter by

        Returns:
            Set of quest IDs that match the filters, or None if no filtering needed
        """
        filtered_quest_ids = None

        # Apply pillar filter
        if pillar_filter and pillar_filter != 'all':
            try:
                pillar_quests = self.supabase.table('quest_tasks')\
                    .select('quest_id')\
                    .eq('pillar', pillar_filter)\
                    .execute()

                if pillar_quests.data:
                    filtered_quest_ids = set(task['quest_id'] for task in pillar_quests.data)
                else:
                    return set()  # No quests match pillar filter

            except Exception as e:
                print(f"Error filtering by pillar: {e}")
                return None

        # Apply subject filter
        if subject_filter and subject_filter != 'all':
            try:
                if subject_filter == 'electives':
                    # For electives, find tasks with no school_subjects or empty array
                    subject_quests1 = self.supabase.table('quest_tasks')\
                        .select('quest_id')\
                        .is_('school_subjects', 'null')\
                        .execute()

                    subject_quests2 = self.supabase.table('quest_tasks')\
                        .select('quest_id')\
                        .eq('school_subjects', [])\
                        .execute()

                    subject_quest_ids = set()
                    if subject_quests1.data:
                        subject_quest_ids.update(task['quest_id'] for task in subject_quests1.data)
                    if subject_quests2.data:
                        subject_quest_ids.update(task['quest_id'] for task in subject_quests2.data)
                else:
                    # For other subjects
                    subject_quests = self.supabase.table('quest_tasks')\
                        .select('quest_id')\
                        .contains('school_subjects', [subject_filter])\
                        .execute()

                    subject_quest_ids = set(task['quest_id'] for task in subject_quests.data) if subject_quests.data else set()

                if not subject_quest_ids:
                    return set()  # No quests match subject filter

                # Intersect with pillar filter if both are applied
                if filtered_quest_ids is not None:
                    filtered_quest_ids = filtered_quest_ids.intersection(subject_quest_ids)
                    if not filtered_quest_ids:
                        return set()
                else:
                    filtered_quest_ids = subject_quest_ids

            except Exception as e:
                print(f"Error filtering by subject: {e}")
                return None

        return filtered_quest_ids


# Global service instance
quest_optimization_service = QuestOptimizationService()