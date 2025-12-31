"""
Dependent Progress Service

Generates comprehensive progress reports for dependent children.
Used by parents to track their child's learning journey.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from services.base_service import BaseService
from database import get_supabase_admin_client
from middleware.error_handler import NotFoundError, ValidationError, AuthorizationError

from utils.logger import get_logger

logger = get_logger(__name__)


class DependentProgressService(BaseService):
    """Service for generating dependent progress reports."""

    def __init__(self):
        super().__init__()
        self.client = get_supabase_admin_client()

    def get_progress_report(
        self,
        dependent_id: str,
        parent_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate comprehensive progress report for a dependent.

        Args:
            dependent_id: Dependent user ID
            parent_id: Parent user ID (must match managed_by_parent_id)
            start_date: Optional start date (ISO format)
            end_date: Optional end date (ISO format)

        Returns:
            Comprehensive progress report

        Raises:
            NotFoundError: If dependent not found
            AuthorizationError: If parent doesn't own this dependent
        """
        try:
            # Verify dependent exists and belongs to parent
            dependent = self.client.table('users')\
                .select('id, display_name, managed_by_parent_id, date_of_birth, avatar_url, level, total_xp')\
                .eq('id', dependent_id)\
                .single()\
                .execute()

            if not dependent.data:
                raise NotFoundError(f"Dependent {dependent_id} not found")

            if dependent.data.get('managed_by_parent_id') != parent_id:
                raise AuthorizationError("This dependent does not belong to you")

            # Parse date range
            if not end_date:
                end_date = datetime.utcnow().isoformat()

            if not start_date:
                # Default to all time
                start_date = '2020-01-01T00:00:00Z'

            # Fetch progress data
            report = {
                'dependent': {
                    'id': dependent.data['id'],
                    'display_name': dependent.data['display_name'],
                    'avatar_url': dependent.data.get('avatar_url'),
                    'level': dependent.data.get('level', 1),
                    'total_xp': dependent.data.get('total_xp', 0),
                    'date_of_birth': dependent.data.get('date_of_birth')
                },
                'period': {
                    'start': start_date,
                    'end': end_date
                },
                'quests': self._get_quest_progress(dependent_id, start_date, end_date),
                'pillars': self._get_pillar_xp(dependent_id, start_date, end_date),
                'badges': self._get_badges_earned(dependent_id, start_date, end_date),
                'recent_activity': self._get_recent_activity(dependent_id, start_date, end_date),
                'completion_stats': self._get_completion_stats(dependent_id, start_date, end_date)
            }

            return report

        except Exception as e:
            logger.error(f"Error generating progress report: {e}")
            raise

    def _get_quest_progress(
        self,
        dependent_id: str,
        start_date: str,
        end_date: str
    ) -> Dict[str, Any]:
        """Get quest progress stats."""
        try:
            # Completed quests
            completed = self.client.table('user_quests')\
                .select('id, quest_id, quests(title, pillar), status, completed_at')\
                .eq('user_id', dependent_id)\
                .eq('status', 'completed')\
                .gte('completed_at', start_date)\
                .lte('completed_at', end_date)\
                .execute()

            # In progress quests
            in_progress = self.client.table('user_quests')\
                .select('id, quest_id, quests(title, pillar), status, started_at')\
                .eq('user_id', dependent_id)\
                .eq('status', 'in_progress')\
                .execute()

            return {
                'completed_count': len(completed.data or []),
                'in_progress_count': len(in_progress.data or []),
                'completed_quests': completed.data or [],
                'active_quests': in_progress.data or []
            }

        except Exception as e:
            logger.error(f"Error fetching quest progress: {e}")
            return {
                'completed_count': 0,
                'in_progress_count': 0,
                'completed_quests': [],
                'active_quests': []
            }

    def _get_pillar_xp(
        self,
        dependent_id: str,
        start_date: str,
        end_date: str
    ) -> Dict[str, Any]:
        """Get XP breakdown by pillar."""
        try:
            # Get all task completions in the date range
            completions = self.client.table('quest_task_completions')\
                .select('completed_at, user_quest_tasks(pillar, xp_value)')\
                .eq('user_id', dependent_id)\
                .gte('completed_at', start_date)\
                .lte('completed_at', end_date)\
                .execute()

            # Aggregate by pillar
            pillar_xp = {}
            for completion in (completions.data or []):
                task = completion.get('user_quest_tasks')
                if task and task.get('pillar'):
                    pillar = task['pillar']
                    xp = task.get('xp_value', 0) or 0

                    if pillar not in pillar_xp:
                        pillar_xp[pillar] = {'xp': 0, 'task_count': 0}

                    pillar_xp[pillar]['xp'] += xp
                    pillar_xp[pillar]['task_count'] += 1

            return pillar_xp

        except Exception as e:
            logger.error(f"Error fetching pillar XP: {e}")
            return {}

    def _get_badges_earned(
        self,
        dependent_id: str,
        start_date: str,
        end_date: str
    ) -> List[Dict[str, Any]]:
        """Get badges earned in date range."""
        try:
            badges = self.client.table('user_badges')\
                .select('*, badges(name, pillar_primary, image_url, description)')\
                .eq('user_id', dependent_id)\
                .gte('earned_at', start_date)\
                .lte('earned_at', end_date)\
                .execute()

            return badges.data or []

        except Exception as e:
            logger.error(f"Error fetching badges: {e}")
            return []

    def _get_recent_activity(
        self,
        dependent_id: str,
        start_date: str,
        end_date: str,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """Get recent activity timeline."""
        try:
            # Get recent task completions
            activities = self.client.table('quest_task_completions')\
                .select('completed_at, user_quest_tasks(title, pillar, xp_value)')\
                .eq('user_id', dependent_id)\
                .gte('completed_at', start_date)\
                .lte('completed_at', end_date)\
                .order('completed_at', desc=True)\
                .limit(limit)\
                .execute()

            timeline = []
            for activity in (activities.data or []):
                task = activity.get('user_quest_tasks')
                if task:
                    timeline.append({
                        'type': 'task_completed',
                        'title': task.get('title'),
                        'pillar': task.get('pillar'),
                        'xp': task.get('xp_value', 0) or 0,
                        'timestamp': activity.get('completed_at')
                    })

            return timeline

        except Exception as e:
            logger.error(f"Error fetching recent activity: {e}")
            return []

    def _get_completion_stats(
        self,
        dependent_id: str,
        start_date: str,
        end_date: str
    ) -> Dict[str, Any]:
        """Calculate completion rates and stats."""
        try:
            # Tasks completed
            completed = self.client.table('quest_task_completions')\
                .select('id')\
                .eq('user_id', dependent_id)\
                .gte('completed_at', start_date)\
                .lte('completed_at', end_date)\
                .execute()

            tasks_completed = len(completed.data or [])

            # Quests completed
            quests_completed = self.client.table('user_quests')\
                .select('id')\
                .eq('user_id', dependent_id)\
                .eq('status', 'completed')\
                .gte('completed_at', start_date)\
                .lte('completed_at', end_date)\
                .execute()

            quests_count = len(quests_completed.data or [])

            return {
                'tasks_completed': tasks_completed,
                'quests_completed': quests_count,
                'average_xp_per_task': (
                    sum(c.get('xp_awarded', 0) for c in (completed.data or []))
                    / tasks_completed
                ) if tasks_completed > 0 else 0
            }

        except Exception as e:
            logger.error(f"Error calculating completion stats: {e}")
            return {
                'tasks_completed': 0,
                'quests_completed': 0,
                'average_xp_per_task': 0
            }

    def get_date_range_preset(self, preset: str) -> tuple:
        """
        Get date range for common presets.

        Args:
            preset: 'week', 'month', 'all_time'

        Returns:
            Tuple of (start_date, end_date) as ISO strings
        """
        end_date = datetime.utcnow()
        start_date = None

        if preset == 'week':
            start_date = end_date - timedelta(days=7)
        elif preset == 'month':
            start_date = end_date - timedelta(days=30)
        elif preset == 'all_time':
            start_date = datetime(2020, 1, 1)
        else:
            start_date = end_date - timedelta(days=30)  # Default to month

        return (start_date.isoformat(), end_date.isoformat())
