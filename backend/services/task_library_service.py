"""
Task Library Service
Manages the quest_sample_tasks library where all AI-generated tasks are stored
and reused across users. Handles usage tracking and flagging system.
"""

from typing import List, Dict, Optional
from uuid import UUID
from datetime import datetime
import logging
from database import get_supabase_admin_client
from services.base_service import BaseService


class TaskLibraryService(BaseService):
    """Service for managing the task library and flagging system"""

    def __init__(self):
        super().__init__()
        # supabase client is available via self.supabase property from BaseService
        self.logger = logging.getLogger(__name__)

    def get_library_tasks(self, quest_id: str, user_id: str = None, limit: int = 20) -> List[Dict]:
        """
        Get top library tasks for a quest.
        Returns up to 20 most-used tasks, excluding flagged ones and tasks user already has.
        If insufficient tasks, returns 5 most recent per pillar.

        Args:
            quest_id: The quest ID to get tasks for
            user_id: User ID to exclude their existing tasks (optional)
            limit: Maximum number of tasks to return (default 20)

        Returns:
            List of task dictionaries with all fields
        """
        try:
            self.logger.info(f"Getting library tasks for quest {quest_id}, user {user_id}")

            # Get user's existing task titles to filter out
            existing_titles = set()
            if user_id:
                user_tasks_response = self.supabase.table('user_quest_tasks') \
                    .select('title') \
                    .eq('user_id', user_id) \
                    .eq('quest_id', quest_id) \
                    .execute()

                if user_tasks_response.data:
                    existing_titles = {task['title'] for task in user_tasks_response.data}
                    self.logger.info(f"User has {len(existing_titles)} existing tasks, will filter those out")

            # First, try to get most-used tasks
            response = self.supabase.table('quest_sample_tasks') \
                .select('*') \
                .eq('quest_id', quest_id) \
                .eq('is_flagged', False) \
                .order('usage_count', desc=True) \
                .order('created_at', desc=True) \
                .limit(limit * 2) \
                .execute()

            # Filter out tasks user already has
            tasks = [task for task in (response.data or []) if task['title'] not in existing_titles]

            # If we have enough tasks (>= limit), return them
            if len(tasks) >= limit:
                result = tasks[:limit]
                self.logger.info(f"Found {len(result)} library tasks (by usage)")
                return result

            # If not enough tasks, fall back to 5 most recent per pillar
            self.logger.info(f"Only found {len(tasks)} tasks by usage, falling back to recent per pillar")

            pillars = ['stem', 'wellness', 'communication', 'civics', 'art']
            all_tasks = []
            seen_ids = set(task['id'] for task in tasks)  # Avoid duplicates

            for pillar in pillars:
                pillar_response = self.supabase.table('quest_sample_tasks') \
                    .select('*') \
                    .eq('quest_id', quest_id) \
                    .eq('pillar', pillar) \
                    .eq('is_flagged', False) \
                    .order('created_at', desc=True) \
                    .limit(10) \
                    .execute()

                pillar_tasks = pillar_response.data if pillar_response.data else []

                # Add tasks that aren't already in our list and user doesn't have
                for task in pillar_tasks:
                    if task['id'] not in seen_ids and task['title'] not in existing_titles:
                        all_tasks.append(task)
                        seen_ids.add(task['id'])

            # Combine usage-based and pillar-based tasks, remove duplicates
            combined_tasks = tasks + all_tasks

            # Sort by usage_count descending, then created_at descending
            combined_tasks.sort(key=lambda x: (-x.get('usage_count', 0), -(datetime.fromisoformat(x.get('created_at', '1970-01-01T00:00:00+00:00').replace('Z', '+00:00')).timestamp())))

            # Return up to limit tasks
            result = combined_tasks[:limit]
            self.logger.info(f"Returning {len(result)} total library tasks (filtered)")
            return result

        except Exception as e:
            self.logger.error(f"Error getting library tasks: {str(e)}")
            return []

    def get_library_count(self, quest_id: str) -> int:
        """
        Get count of non-flagged library tasks for a quest.
        Used to determine if quest has any tasks available.

        Args:
            quest_id: The quest ID to check

        Returns:
            Count of available library tasks
        """
        try:
            self.logger.info(f"Getting library count for quest {quest_id}")

            response = self.supabase.table('quest_sample_tasks') \
                .select('id', count='exact') \
                .eq('quest_id', quest_id) \
                .eq('is_flagged', False) \
                .execute()

            count = response.count if response.count is not None else 0
            self.logger.info(f"Quest {quest_id} has {count} library tasks")
            return count

        except Exception as e:
            self.logger.error(f"Error getting library count: {str(e)}")
            return 0

    def add_library_task(self, quest_id: str, task_data: Dict) -> Optional[str]:
        """
        Save a generated task to the library.

        Args:
            quest_id: The quest ID this task belongs to
            task_data: Dictionary with title, description, pillar, xp_value, etc.

        Returns:
            Task ID if successful, None otherwise
        """
        try:
            self.logger.info(f"Adding task to library for quest {quest_id}: {task_data.get('title', 'Unknown')}")

            # Prepare task data for insertion
            insert_data = {
                'quest_id': quest_id,
                'title': task_data.get('title'),
                'description': task_data.get('description'),
                'pillar': task_data.get('pillar'),
                'xp_value': task_data.get('xp_value'),
                'diploma_subjects': task_data.get('diploma_subjects'),
                'subject_xp_distribution': task_data.get('subject_xp_distribution'),
                'order_index': task_data.get('order_index'),
                'ai_generated': task_data.get('ai_generated', True),
                'usage_count': 0,
                'flag_count': 0,
                'is_flagged': False
            }

            response = self.supabase.table('quest_sample_tasks') \
                .insert(insert_data) \
                .execute()

            if response.data and len(response.data) > 0:
                task_id = response.data[0]['id']
                self.logger.info(f"Successfully added task {task_id} to library")
                return task_id
            else:
                self.logger.error("No data returned from insert")
                return None

        except Exception as e:
            self.logger.error(f"Error adding task to library: {str(e)}")
            return None

    def increment_usage(self, sample_task_id: str) -> bool:
        """
        Increment the usage_count for a library task.
        Called when a user selects this task for their quest.

        Args:
            sample_task_id: The ID of the quest_sample_tasks record

        Returns:
            True if successful, False otherwise
        """
        try:
            self.logger.info(f"Incrementing usage count for task {sample_task_id}")

            # Use RPC function for atomic increment
            response = self.supabase.rpc(
                'increment_task_usage',
                {'task_id': sample_task_id}
            ).execute()

            if response.data is not None:
                self.logger.info(f"Successfully incremented usage for task {sample_task_id}")
                return True
            else:
                # Fallback: manual increment if RPC doesn't exist yet
                self.logger.warning("RPC function not found, using manual increment")

                # Get current count
                current = self.supabase.table('quest_sample_tasks') \
                    .select('usage_count') \
                    .eq('id', sample_task_id) \
                    .single() \
                    .execute()

                if current.data:
                    new_count = (current.data.get('usage_count', 0) or 0) + 1

                    # Update with new count
                    self.supabase.table('quest_sample_tasks') \
                        .update({'usage_count': new_count}) \
                        .eq('id', sample_task_id) \
                        .execute()

                    self.logger.info(f"Manually incremented usage to {new_count}")
                    return True

                return False

        except Exception as e:
            self.logger.error(f"Error incrementing usage: {str(e)}")
            return False

    def flag_task(self, sample_task_id: str, user_id: str, reason: Optional[str] = None) -> bool:
        """
        Flag a task as inappropriate or low-quality.
        Records the flag and auto-flags task for review if flag_count >= 3.

        Args:
            sample_task_id: The ID of the quest_sample_tasks record
            user_id: The ID of the user flagging the task
            reason: Optional reason for flagging

        Returns:
            True if successful, False otherwise
        """
        try:
            self.logger.info(f"User {user_id} flagging task {sample_task_id}")

            # Insert flag record
            flag_data = {
                'sample_task_id': sample_task_id,
                'user_id': user_id,
                'flag_reason': reason
            }

            self.supabase.table('quest_task_flags') \
                .insert(flag_data) \
                .execute()

            # Get current task data
            task_response = self.supabase.table('quest_sample_tasks') \
                .select('flag_count') \
                .eq('id', sample_task_id) \
                .single() \
                .execute()

            if task_response.data:
                current_flags = task_response.data.get('flag_count', 0) or 0
                new_flag_count = current_flags + 1

                # Update flag count and potentially set is_flagged
                update_data = {'flag_count': new_flag_count}

                if new_flag_count >= 3:
                    update_data['is_flagged'] = True
                    self.logger.warning(f"Task {sample_task_id} auto-flagged for admin review (3+ flags)")

                self.supabase.table('quest_sample_tasks') \
                    .update(update_data) \
                    .eq('id', sample_task_id) \
                    .execute()

                self.logger.info(f"Task flagged successfully. Total flags: {new_flag_count}")
                return True
            else:
                self.logger.error(f"Task {sample_task_id} not found")
                return False

        except Exception as e:
            self.logger.error(f"Error flagging task: {str(e)}")
            return False

    def get_flagged_tasks(self, limit: int = 50, offset: int = 0) -> List[Dict]:
        """
        Get all tasks flagged for admin review.

        Args:
            limit: Maximum number of tasks to return
            offset: Pagination offset

        Returns:
            List of flagged task dictionaries
        """
        try:
            self.logger.info(f"Getting flagged tasks (limit={limit}, offset={offset})")

            response = self.supabase.table('quest_sample_tasks') \
                .select('*, quests(title)') \
                .eq('is_flagged', True) \
                .order('flag_count', desc=True) \
                .order('updated_at', desc=True) \
                .range(offset, offset + limit - 1) \
                .execute()

            tasks = response.data if response.data else []
            self.logger.info(f"Found {len(tasks)} flagged tasks")
            return tasks

        except Exception as e:
            self.logger.error(f"Error getting flagged tasks: {str(e)}")
            return []

    def get_task_flags(self, sample_task_id: str) -> List[Dict]:
        """
        Get all flag reports for a specific task.

        Args:
            sample_task_id: The ID of the quest_sample_tasks record

        Returns:
            List of flag report dictionaries
        """
        try:
            self.logger.info(f"Getting flag reports for task {sample_task_id}")

            response = self.supabase.table('quest_task_flags') \
                .select('*, users(display_name, email)') \
                .eq('sample_task_id', sample_task_id) \
                .order('created_at', desc=True) \
                .execute()

            flags = response.data if response.data else []
            self.logger.info(f"Found {len(flags)} flag reports")
            return flags

        except Exception as e:
            self.logger.error(f"Error getting task flags: {str(e)}")
            return []

    def approve_task(self, sample_task_id: str) -> bool:
        """
        Admin approval: Clear flags and make task visible again.
        Resets flag_count and is_flagged to allow task to be used.

        Args:
            sample_task_id: The ID of the quest_sample_tasks record

        Returns:
            True if successful, False otherwise
        """
        try:
            self.logger.info(f"Admin approving task {sample_task_id}")

            response = self.supabase.table('quest_sample_tasks') \
                .update({
                    'flag_count': 0,
                    'is_flagged': False
                }) \
                .eq('id', sample_task_id) \
                .execute()

            if response.data:
                self.logger.info(f"Task {sample_task_id} approved and unflagged")
                return True
            else:
                self.logger.error("No data returned from approval update")
                return False

        except Exception as e:
            self.logger.error(f"Error approving task: {str(e)}")
            return False

    def delete_task(self, sample_task_id: str) -> bool:
        """
        Admin deletion: Permanently remove task from library.
        Use for truly inappropriate content.

        Args:
            sample_task_id: The ID of the quest_sample_tasks record

        Returns:
            True if successful, False otherwise
        """
        try:
            self.logger.info(f"Admin deleting task {sample_task_id}")

            response = self.supabase.table('quest_sample_tasks') \
                .delete() \
                .eq('id', sample_task_id) \
                .execute()

            if response.data is not None:
                self.logger.info(f"Task {sample_task_id} permanently deleted")
                return True
            else:
                self.logger.error("No data returned from deletion")
                return False

        except Exception as e:
            self.logger.error(f"Error deleting task: {str(e)}")
            return False
