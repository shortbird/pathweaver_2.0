"""
Task Repository

Handles all database operations related to quest tasks, task completions, and user-specific tasks.
"""

from typing import List, Dict, Optional, Any
from datetime import datetime
from repositories.base_repository import BaseRepository, NotFoundError
from utils.logger import get_logger

logger = get_logger(__name__)


class TaskRepository(BaseRepository):
    """Repository for quest task and task completion operations."""

    table_name = 'user_quest_tasks'

    def find_by_quest(self, quest_id: str, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get all tasks for a quest.

        Args:
            quest_id: Quest ID
            user_id: Optional user ID to filter user-specific tasks

        Returns:
            List of tasks
        """
        try:
            query = self.client.table(self.table_name)\
                .select('*')\
                .eq('quest_id', quest_id)

            if user_id:
                query = query.eq('user_id', user_id)

            query = query.order('order_index', desc=False)

            result = query.execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching tasks for quest {quest_id}: {e}")
            return []

    def find_by_user_quest(self, user_quest_id: str) -> List[Dict[str, Any]]:
        """
        Get all tasks for a specific user quest enrollment.

        Args:
            user_quest_id: User quest enrollment ID

        Returns:
            List of tasks
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*')\
                .eq('user_quest_id', user_quest_id)\
                .order('order_index', desc=False)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching tasks for user_quest {user_quest_id}: {e}")
            return []

    def get_task_with_relations(self, task_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get task details with quest and user_quest relationships.

        Args:
            task_id: Task ID
            user_id: User ID (for RLS)

        Returns:
            Task with quest and user_quest data, or None if not found

        Raises:
            NotFoundError: If task not found or not owned by user
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*, quests(id, title), user_quests!user_quest_id(id, user_id)')\
                .eq('id', task_id)\
                .eq('user_id', user_id)\
                .single()\
                .execute()

            if not result.data:
                raise NotFoundError(f"Task {task_id} not found or not owned by user")

            return result.data
        except Exception as e:
            logger.error(f"Error fetching task {task_id} with relations: {e}")
            raise

    def create_task(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new task.

        Args:
            data: Task data

        Returns:
            Created task

        Raises:
            ValueError: If required fields are missing
        """
        required_fields = ['quest_id', 'user_id', 'title']

        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")

        try:
            result = self.client.table(self.table_name)\
                .insert(data)\
                .execute()

            if not result.data:
                raise ValueError("Failed to create task")

            logger.info(f"Created task '{data['title']}' for quest {data['quest_id']}")
            return result.data[0]
        except Exception as e:
            logger.error(f"Error creating task: {e}")
            raise

    def update_task(self, task_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update a task.

        Args:
            task_id: Task ID
            data: Updated task data

        Returns:
            Updated task

        Raises:
            NotFoundError: If task not found
        """
        try:
            result = self.client.table(self.table_name)\
                .update(data)\
                .eq('id', task_id)\
                .execute()

            if not result.data:
                raise NotFoundError(f"Task {task_id} not found")

            logger.info(f"Updated task {task_id}")
            return result.data[0]
        except Exception as e:
            logger.error(f"Error updating task {task_id}: {e}")
            raise

    def delete_task(self, task_id: str) -> bool:
        """
        Delete a task.

        Args:
            task_id: Task ID

        Returns:
            True if deleted successfully

        Raises:
            NotFoundError: If task not found
        """
        try:
            result = self.client.table(self.table_name)\
                .delete()\
                .eq('id', task_id)\
                .execute()

            logger.info(f"Deleted task {task_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting task {task_id}: {e}")
            raise


class TaskCompletionRepository(BaseRepository):
    """Repository for task completion operations."""

    table_name = 'quest_task_completions'

    def find_by_user_quest(self, user_id: str, quest_id: str) -> List[Dict[str, Any]]:
        """
        Get all task completions for a user's quest.

        Args:
            user_id: User ID
            quest_id: Quest ID

        Returns:
            List of task completions
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*')\
                .eq('user_id', user_id)\
                .eq('quest_id', quest_id)\
                .order('completed_at', desc=True)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching completions for user {user_id}, quest {quest_id}: {e}")
            return []

    def find_by_task(self, task_id: str, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get all completions for a specific task.

        Args:
            task_id: Task ID
            user_id: Optional user ID filter

        Returns:
            List of task completions
        """
        try:
            query = self.client.table(self.table_name)\
                .select('*')\
                .eq('user_quest_task_id', task_id)

            if user_id:
                query = query.eq('user_id', user_id)

            query = query.order('completed_at', desc=True)

            result = query.execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching completions for task {task_id}: {e}")
            return []

    def check_existing_completion(self, user_id: str, task_id: str) -> bool:
        """
        Check if a task completion already exists for a user.

        Args:
            user_id: User ID
            task_id: Task ID (user_quest_task_id)

        Returns:
            True if completion exists, False otherwise
        """
        try:
            result = self.client.table(self.table_name)\
                .select('id')\
                .eq('user_id', user_id)\
                .eq('user_quest_task_id', task_id)\
                .execute()

            return bool(result.data)
        except Exception as e:
            logger.error(f"Error checking existing completion for user {user_id}, task {task_id}: {e}")
            return False

    def create_completion(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a task completion record.

        Args:
            data: Completion data

        Returns:
            Created completion record

        Raises:
            ValueError: If required fields are missing or duplicate completion
        """
        required_fields = ['user_id', 'quest_id', 'user_quest_task_id']

        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")

        try:
            # Check for duplicate completion
            existing = self.client.table(self.table_name)\
                .select('id')\
                .eq('user_id', data['user_id'])\
                .eq('user_quest_task_id', data['user_quest_task_id'])\
                .execute()

            if existing.data:
                raise ValueError("Task already completed")

            # Add completion timestamp
            if 'completed_at' not in data:
                data['completed_at'] = datetime.utcnow().isoformat()

            result = self.client.table(self.table_name)\
                .insert(data)\
                .execute()

            if not result.data:
                raise ValueError("Failed to create task completion")

            logger.info(f"Created task completion for user {data['user_id']}, task {data['user_quest_task_id']}")
            return result.data[0]
        except Exception as e:
            logger.error(f"Error creating task completion: {e}")
            raise

    def get_completion_count(self, user_id: str, quest_id: Optional[str] = None) -> int:
        """
        Get count of completed tasks for a user.

        Args:
            user_id: User ID
            quest_id: Optional quest ID filter

        Returns:
            Count of completed tasks
        """
        try:
            query = self.client.table(self.table_name)\
                .select('id', count='exact')\
                .eq('user_id', user_id)

            if quest_id:
                query = query.eq('quest_id', quest_id)

            result = query.execute()
            return result.count or 0
        except Exception as e:
            logger.error(f"Error counting completions for user {user_id}: {e}")
            return 0

    def delete_completion(self, completion_id: str) -> bool:
        """
        Delete a task completion (for admin/undo purposes).

        Args:
            completion_id: Completion ID

        Returns:
            True if deleted successfully

        Raises:
            NotFoundError: If completion not found
        """
        try:
            result = self.client.table(self.table_name)\
                .delete()\
                .eq('id', completion_id)\
                .execute()

            logger.info(f"Deleted task completion {completion_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting completion {completion_id}: {e}")
            raise
