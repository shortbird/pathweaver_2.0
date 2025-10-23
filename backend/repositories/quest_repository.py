"""
Quest Repository - Database operations for quests and quest tasks

Handles all quest-related database queries with RLS enforcement.
"""

import logging
from typing import Optional, Dict, List, Any
from backend.repositories.base_repository import BaseRepository, DatabaseError, NotFoundError
from postgrest.exceptions import APIError

logger = logging.getLogger(__name__)


class QuestRepository(BaseRepository):
    """Repository for quest database operations"""

    table_name = 'quests'
    id_column = 'id'

    def get_active_quests(
        self,
        pillar: Optional[str] = None,
        source: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get all active quests with optional filtering.

        Args:
            pillar: Filter by pillar (optional)
            source: Filter by source (optio/lms) (optional)
            limit: Maximum number of quests

        Returns:
            List of active quest records

        Raises:
            DatabaseError: If query fails
        """
        filters = {'is_active': True}
        if source:
            filters['source'] = source

        return self.find_all(filters=filters, order_by='-created_at', limit=limit)

    def get_quest_with_tasks(self, quest_id: str) -> Dict[str, Any]:
        """
        Get quest details with all associated tasks.

        Args:
            quest_id: Quest ID

        Returns:
            Quest record with 'tasks' array

        Raises:
            NotFoundError: If quest doesn't exist
            DatabaseError: If query fails
        """
        try:
            # Get quest details
            response = (
                self.client.table(self.table_name)
                .select('*, quest_tasks(*)')
                .eq('id', quest_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"Quest {quest_id} not found")

            quest = response.data[0]

            # Sort tasks by order_index
            if quest.get('quest_tasks'):
                quest['quest_tasks'] = sorted(
                    quest['quest_tasks'],
                    key=lambda t: t.get('order_index', 0)
                )

            return quest

        except APIError as e:
            logger.error(f"Error fetching quest with tasks {quest_id}: {e}")
            raise DatabaseError("Failed to fetch quest with tasks") from e

    def get_user_quest_progress(self, user_id: str, quest_id: str) -> Dict[str, Any]:
        """
        Get user's progress on a specific quest.

        Args:
            user_id: User ID
            quest_id: Quest ID

        Returns:
            Dictionary with quest, tasks, and completion status

        Raises:
            NotFoundError: If quest doesn't exist
            DatabaseError: If query fails
        """
        try:
            # Get quest with tasks
            quest = self.get_quest_with_tasks(quest_id)

            # Get user's task completions
            completions_response = (
                self.client.table('quest_task_completions')
                .select('*')
                .eq('user_id', user_id)
                .eq('quest_id', quest_id)
                .execute()
            )

            completions = completions_response.data or []
            completed_task_ids = {c['task_id'] for c in completions}

            # Add completion status to each task
            for task in quest.get('quest_tasks', []):
                task['completed'] = task['id'] in completed_task_ids

            # Calculate overall progress
            total_tasks = len(quest.get('quest_tasks', []))
            completed_tasks = len(completed_task_ids)

            quest['progress'] = {
                'total_tasks': total_tasks,
                'completed_tasks': completed_tasks,
                'percentage': (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0,
                'is_complete': completed_tasks == total_tasks and total_tasks > 0
            }

            return quest

        except NotFoundError:
            raise
        except APIError as e:
            logger.error(f"Error fetching user quest progress: {e}")
            raise DatabaseError("Failed to fetch quest progress") from e

    def get_user_active_quests(
        self,
        user_id: str,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Get all active quests for a user.

        Args:
            user_id: User ID
            limit: Maximum number of quests

        Returns:
            List of quest records with enrollment status

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table('user_quests')
                .select('quest_id, quests(*)')
                .eq('user_id', user_id)
                .eq('is_active', True)
                .limit(limit)
                .execute()
            )

            # Extract quest data from joined result
            quests = []
            for enrollment in response.data or []:
                if enrollment.get('quests'):
                    quests.append(enrollment['quests'])

            return quests

        except APIError as e:
            logger.error(f"Error fetching user active quests: {e}")
            raise DatabaseError("Failed to fetch user quests") from e

    def enroll_user(self, user_id: str, quest_id: str) -> Dict[str, Any]:
        """
        Enroll a user in a quest.

        Args:
            user_id: User ID
            quest_id: Quest ID

        Returns:
            Enrollment record (user_quests)

        Raises:
            DatabaseError: If enrollment fails
        """
        try:
            # Check if already enrolled
            existing = (
                self.client.table('user_quests')
                .select('*')
                .eq('user_id', user_id)
                .eq('quest_id', quest_id)
                .execute()
            )

            if existing.data:
                # Already enrolled, update to active if needed
                if not existing.data[0].get('is_active'):
                    response = (
                        self.client.table('user_quests')
                        .update({'is_active': True})
                        .eq('user_id', user_id)
                        .eq('quest_id', quest_id)
                        .execute()
                    )
                    return response.data[0]
                return existing.data[0]

            # Create new enrollment
            response = (
                self.client.table('user_quests')
                .insert({
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'is_active': True
                })
                .execute()
            )

            logger.info(f"Enrolled user {user_id} in quest {quest_id}")
            return response.data[0]

        except APIError as e:
            logger.error(f"Error enrolling user in quest: {e}")
            raise DatabaseError("Failed to enroll in quest") from e

    def abandon_quest(self, user_id: str, quest_id: str) -> bool:
        """
        Mark a quest as abandoned for a user.

        Args:
            user_id: User ID
            quest_id: Quest ID

        Returns:
            True if successful

        Raises:
            NotFoundError: If enrollment doesn't exist
            DatabaseError: If update fails
        """
        try:
            response = (
                self.client.table('user_quests')
                .update({'is_active': False})
                .eq('user_id', user_id)
                .eq('quest_id', quest_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError("Quest enrollment not found")

            logger.info(f"User {user_id} abandoned quest {quest_id}")
            return True

        except APIError as e:
            logger.error(f"Error abandoning quest: {e}")
            raise DatabaseError("Failed to abandon quest") from e

    def search_quests(
        self,
        search_term: str,
        pillar: Optional[str] = None,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Search quests by title or description.

        Args:
            search_term: Search term
            pillar: Filter by pillar (optional)
            limit: Maximum number of results

        Returns:
            List of matching quest records

        Raises:
            DatabaseError: If query fails
        """
        try:
            query = (
                self.client.table(self.table_name)
                .select('*')
                .eq('is_active', True)
                .or_(f'title.ilike.%{search_term}%,description.ilike.%{search_term}%')
                .limit(limit)
            )

            response = query.execute()
            return response.data or []

        except APIError as e:
            logger.error(f"Error searching quests: {e}")
            raise DatabaseError("Failed to search quests") from e


class QuestTaskRepository(BaseRepository):
    """Repository for quest task database operations"""

    table_name = 'quest_tasks'
    id_column = 'id'

    def get_tasks_for_quest(self, quest_id: str) -> List[Dict[str, Any]]:
        """
        Get all tasks for a quest, ordered by order_index.

        Args:
            quest_id: Quest ID

        Returns:
            List of task records

        Raises:
            DatabaseError: If query fails
        """
        return self.find_all(
            filters={'quest_id': quest_id},
            order_by='order_index'
        )

    def complete_task(
        self,
        user_id: str,
        quest_id: str,
        task_id: str,
        evidence_text: Optional[str] = None,
        evidence_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Mark a task as completed for a user.

        Args:
            user_id: User ID
            quest_id: Quest ID
            task_id: Task ID
            evidence_text: Text evidence (optional)
            evidence_url: URL evidence (optional)

        Returns:
            Completion record

        Raises:
            DatabaseError: If completion fails
        """
        try:
            # Get task details to calculate XP
            task = self.find_by_id(task_id)
            if not task:
                raise NotFoundError(f"Task {task_id} not found")

            xp_awarded = task.get('xp_value', 0)

            # Create completion record
            response = (
                self.client.table('quest_task_completions')
                .insert({
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'task_id': task_id,
                    'evidence_text': evidence_text,
                    'evidence_url': evidence_url,
                    'xp_awarded': xp_awarded
                })
                .execute()
            )

            logger.info(f"User {user_id} completed task {task_id} (Quest {quest_id}), awarded {xp_awarded} XP")
            return response.data[0]

        except APIError as e:
            logger.error(f"Error completing task: {e}")
            raise DatabaseError("Failed to complete task") from e
