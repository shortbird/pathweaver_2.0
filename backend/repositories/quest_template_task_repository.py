"""
Quest Template Task Repository - Database operations for unified template tasks

Handles all template task operations for quests. Replaces the separate
quest_sample_tasks and course_quest_tasks tables with a unified approach.
"""

import logging
from typing import Optional, Dict, List, Any
from repositories.base_repository import BaseRepository, DatabaseError, NotFoundError
from postgrest.exceptions import APIError

from utils.logger import get_logger

logger = get_logger(__name__)


class QuestTemplateTaskRepository(BaseRepository):
    """Repository for quest template task operations"""

    table_name = 'quest_template_tasks'
    id_column = 'id'

    def get_template_tasks(
        self,
        quest_id: str,
        filter_type: str = 'all',
        randomize: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Get template tasks for a quest.

        Args:
            quest_id: Quest ID
            filter_type: 'all', 'required', or 'optional'
            randomize: If True, shuffle optional tasks (for variety in suggestions)

        Returns:
            List of template task records

        Raises:
            DatabaseError: If query fails
        """
        try:
            query = (
                self.client.table(self.table_name)
                .select('*')
                .eq('quest_id', quest_id)
            )

            # Apply filter
            if filter_type == 'required':
                query = query.eq('is_required', True)
            elif filter_type == 'optional':
                query = query.eq('is_required', False)

            # Order by order_index
            query = query.order('order_index')

            response = query.execute()
            tasks = response.data or []

            # Randomize optional tasks if requested
            if randomize and filter_type != 'required':
                import random
                # Separate required and optional for consistent ordering
                required = [t for t in tasks if t.get('is_required')]
                optional = [t for t in tasks if not t.get('is_required')]
                random.shuffle(optional)
                tasks = required + optional

            return tasks

        except APIError as e:
            logger.error(f"Error fetching template tasks for quest {quest_id}: {e}")
            raise DatabaseError("Failed to fetch template tasks") from e

    def get_required_tasks(self, quest_id: str) -> List[Dict[str, Any]]:
        """
        Get only required template tasks for a quest.
        These are auto-copied on enrollment.

        Args:
            quest_id: Quest ID

        Returns:
            List of required template task records
        """
        return self.get_template_tasks(quest_id, filter_type='required')

    def get_optional_tasks(self, quest_id: str, randomize: bool = True) -> List[Dict[str, Any]]:
        """
        Get optional template tasks (suggestions) for a quest.
        Shown in the wizard for students to optionally add.

        Args:
            quest_id: Quest ID
            randomize: If True, shuffle tasks for variety

        Returns:
            List of optional template task records
        """
        return self.get_template_tasks(quest_id, filter_type='optional', randomize=randomize)

    def create_template_task(
        self,
        quest_id: str,
        title: str,
        pillar: str,
        xp_value: int = 100,
        description: str = '',
        is_required: bool = False,
        order_index: int = 0,
        diploma_subjects: List[str] = None,
        subject_xp_distribution: Dict[str, int] = None
    ) -> Dict[str, Any]:
        """
        Create a new template task for a quest.

        Args:
            quest_id: Quest ID
            title: Task title
            pillar: Task pillar (stem, wellness, communication, civics, art)
            xp_value: XP value for the task
            description: Task description
            is_required: If True, auto-copied on enrollment
            order_index: Display order
            diploma_subjects: Subject tags for diploma tracking
            subject_xp_distribution: XP breakdown by subject

        Returns:
            Created template task record

        Raises:
            DatabaseError: If creation fails
        """
        try:
            task_data = {
                'quest_id': quest_id,
                'title': title,
                'description': description or '',
                'pillar': pillar,
                'xp_value': xp_value,
                'is_required': is_required,
                'order_index': order_index,
                'diploma_subjects': diploma_subjects or ['Electives'],
                'subject_xp_distribution': subject_xp_distribution or {}
            }

            response = (
                self.client.table(self.table_name)
                .insert(task_data)
                .execute()
            )

            if not response.data:
                raise DatabaseError("Failed to create template task - no data returned")

            logger.info(f"Created template task '{title}' for quest {quest_id[:8]}")
            return response.data[0]

        except APIError as e:
            logger.error(f"Error creating template task: {e}")
            raise DatabaseError("Failed to create template task") from e

    def update_template_task(
        self,
        task_id: str,
        updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update a template task.

        Args:
            task_id: Template task ID
            updates: Dictionary of fields to update

        Returns:
            Updated template task record

        Raises:
            NotFoundError: If task not found
            DatabaseError: If update fails
        """
        try:
            # Add updated_at timestamp
            from datetime import datetime, timezone
            updates['updated_at'] = datetime.now(timezone.utc).isoformat()

            response = (
                self.client.table(self.table_name)
                .update(updates)
                .eq('id', task_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"Template task {task_id} not found")

            return response.data[0]

        except APIError as e:
            logger.error(f"Error updating template task {task_id}: {e}")
            raise DatabaseError("Failed to update template task") from e

    def delete_template_task(self, task_id: str) -> bool:
        """
        Delete a template task.

        Args:
            task_id: Template task ID

        Returns:
            True if successful

        Raises:
            NotFoundError: If task not found
            DatabaseError: If deletion fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .delete()
                .eq('id', task_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"Template task {task_id} not found")

            logger.info(f"Deleted template task {task_id}")
            return True

        except APIError as e:
            logger.error(f"Error deleting template task {task_id}: {e}")
            raise DatabaseError("Failed to delete template task") from e

    def bulk_create_template_tasks(
        self,
        quest_id: str,
        tasks: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Create multiple template tasks at once.

        Args:
            quest_id: Quest ID
            tasks: List of task data dictionaries

        Returns:
            List of created template task records

        Raises:
            DatabaseError: If creation fails
        """
        try:
            # Prepare task data with quest_id and defaults
            tasks_data = []
            for i, task in enumerate(tasks):
                tasks_data.append({
                    'quest_id': quest_id,
                    'title': task.get('title', ''),
                    'description': task.get('description', ''),
                    'pillar': task.get('pillar', 'stem'),
                    'xp_value': task.get('xp_value', 100),
                    'is_required': task.get('is_required', False),
                    'order_index': task.get('order_index', i),
                    'diploma_subjects': task.get('diploma_subjects', ['Electives']),
                    'subject_xp_distribution': task.get('subject_xp_distribution', {})
                })

            response = (
                self.client.table(self.table_name)
                .insert(tasks_data)
                .execute()
            )

            logger.info(f"Created {len(tasks_data)} template tasks for quest {quest_id[:8]}")
            return response.data or []

        except APIError as e:
            logger.error(f"Error bulk creating template tasks: {e}")
            raise DatabaseError("Failed to create template tasks") from e

    def bulk_update_template_tasks(
        self,
        quest_id: str,
        tasks: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Replace all template tasks for a quest with new ones.
        Deletes existing and creates new (simpler than updating individual tasks).

        Args:
            quest_id: Quest ID
            tasks: List of new task data dictionaries

        Returns:
            List of created template task records

        Raises:
            DatabaseError: If operation fails
        """
        try:
            # Delete existing template tasks
            self.client.table(self.table_name)\
                .delete()\
                .eq('quest_id', quest_id)\
                .execute()

            # Create new ones
            if tasks:
                return self.bulk_create_template_tasks(quest_id, tasks)

            return []

        except APIError as e:
            logger.error(f"Error bulk updating template tasks for quest {quest_id}: {e}")
            raise DatabaseError("Failed to update template tasks") from e

    def increment_usage(self, task_id: str) -> None:
        """
        Increment the usage_count for a template task.
        Called when a student adds this task to their quest.

        Args:
            task_id: Template task ID
        """
        try:
            # Use RPC for atomic increment, or fallback to fetch-update
            self.client.rpc('increment_template_task_usage', {'task_id': task_id}).execute()
        except Exception:
            # Fallback: manual increment
            try:
                task = self.find_by_id(task_id)
                if task:
                    new_count = (task.get('usage_count') or 0) + 1
                    self.update_template_task(task_id, {'usage_count': new_count})
            except Exception as e:
                logger.warning(f"Failed to increment usage for task {task_id}: {e}")

    def flag_task(
        self,
        task_id: str,
        user_id: str,
        reason: str = ''
    ) -> Dict[str, Any]:
        """
        Flag a template task as inappropriate or low-quality.

        Args:
            task_id: Template task ID
            user_id: User who flagged
            reason: Reason for flagging

        Returns:
            Updated template task record

        Raises:
            DatabaseError: If flagging fails
        """
        try:
            # Create flag record
            self.client.table('quest_template_task_flags').insert({
                'template_task_id': task_id,
                'user_id': user_id,
                'flag_reason': reason
            }).execute()

            # Increment flag count and auto-flag if >= 3
            task = self.find_by_id(task_id)
            if task:
                new_flag_count = (task.get('flag_count') or 0) + 1
                updates = {
                    'flag_count': new_flag_count,
                    'is_flagged': new_flag_count >= 3
                }
                return self.update_template_task(task_id, updates)

            raise NotFoundError(f"Template task {task_id} not found")

        except APIError as e:
            logger.error(f"Error flagging template task {task_id}: {e}")
            raise DatabaseError("Failed to flag template task") from e

    def get_quest_task_summary(self, quest_id: str) -> Dict[str, Any]:
        """
        Get a summary of template tasks for a quest.

        Args:
            quest_id: Quest ID

        Returns:
            Dictionary with task counts and requirements info
        """
        try:
            tasks = self.get_template_tasks(quest_id)

            required = [t for t in tasks if t.get('is_required')]
            optional = [t for t in tasks if not t.get('is_required')]

            return {
                'total_tasks': len(tasks),
                'required_count': len(required),
                'optional_count': len(optional),
                'total_required_xp': sum(t.get('xp_value', 0) for t in required),
                'total_optional_xp': sum(t.get('xp_value', 0) for t in optional),
                'has_required': len(required) > 0,
                'has_optional': len(optional) > 0
            }

        except Exception as e:
            logger.error(f"Error getting task summary for quest {quest_id}: {e}")
            return {
                'total_tasks': 0,
                'required_count': 0,
                'optional_count': 0,
                'total_required_xp': 0,
                'total_optional_xp': 0,
                'has_required': False,
                'has_optional': False
            }
