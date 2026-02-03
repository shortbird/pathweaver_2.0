"""
Analytics Repository

Handles all database operations related to admin analytics and reporting.
"""

from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
from repositories.base_repository import BaseRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class AnalyticsRepository(BaseRepository):
    """Repository for admin analytics operations."""

    table_name = 'users'  # Base table, but queries span multiple tables

    def get_user_stats(self) -> Dict[str, Any]:
        """
        Get user statistics (total users, active users, by role).

        Returns:
            Dictionary with user statistics
        """
        try:
            # Total users
            total_result = self.client.table('users')\
                .select('id', count='exact')\
                .execute()
            total_users = total_result.count or 0

            # Active users (logged in within last 30 days)
            thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()
            active_result = self.client.table('users')\
                .select('id', count='exact')\
                .gte('last_active', thirty_days_ago)\
                .execute()
            active_users = active_result.count or 0

            # Users by role
            all_users = self.client.table('users')\
                .select('role')\
                .execute()

            role_counts = {}
            for user in (all_users.data or []):
                role = user.get('role', 'student')
                role_counts[role] = role_counts.get(role, 0) + 1

            return {
                'total_users': total_users,
                'active_users': active_users,
                'users_by_role': role_counts
            }
        except Exception as e:
            logger.error(f"Error fetching user stats: {e}")
            return {
                'total_users': 0,
                'active_users': 0,
                'users_by_role': {}
            }

    def get_quest_stats(self) -> Dict[str, Any]:
        """
        Get quest statistics (total quests, active quests, completions).

        Returns:
            Dictionary with quest statistics
        """
        try:
            # Total quests
            total_result = self.client.table('quests')\
                .select('id', count='exact')\
                .execute()
            total_quests = total_result.count or 0

            # Active quests
            active_result = self.client.table('quests')\
                .select('id', count='exact')\
                .eq('is_active', True)\
                .execute()
            active_quests = active_result.count or 0

            # Quest enrollments
            enrollments_result = self.client.table('user_quests')\
                .select('id', count='exact')\
                .execute()
            total_enrollments = enrollments_result.count or 0

            # Completed quests
            completed_result = self.client.table('user_quests')\
                .select('id', count='exact')\
                .not_.is_('completed_at', 'null')\
                .execute()
            total_completions = completed_result.count or 0

            # Completion rate
            completion_rate = (total_completions / total_enrollments * 100) if total_enrollments > 0 else 0

            return {
                'total_quests': total_quests,
                'active_quests': active_quests,
                'total_enrollments': total_enrollments,
                'total_completions': total_completions,
                'completion_rate': round(completion_rate, 2)
            }
        except Exception as e:
            logger.error(f"Error fetching quest stats: {e}")
            return {
                'total_quests': 0,
                'active_quests': 0,
                'total_enrollments': 0,
                'total_completions': 0,
                'completion_rate': 0
            }

    def get_xp_stats(self) -> Dict[str, Any]:
        """
        Get XP statistics (total XP awarded, by pillar).

        Returns:
            Dictionary with XP statistics
        """
        try:
            # Total XP by pillar
            xp_result = self.client.table('user_skill_xp')\
                .select('pillar, xp_amount')\
                .execute()

            pillar_xp = {}
            total_xp = 0

            for record in (xp_result.data or []):
                pillar = record.get('pillar', 'unknown')
                xp = record.get('xp_amount', 0)
                pillar_xp[pillar] = pillar_xp.get(pillar, 0) + xp
                total_xp += xp

            return {
                'total_xp': total_xp,
                'xp_by_pillar': pillar_xp
            }
        except Exception as e:
            logger.error(f"Error fetching XP stats: {e}")
            return {
                'total_xp': 0,
                'xp_by_pillar': {}
            }

    def get_badge_stats(self) -> Dict[str, Any]:
        """
        Get badge statistics (total badges, active badges).

        Returns:
            Dictionary with badge statistics
        """
        try:
            # Total badges
            total_result = self.client.table('badges')\
                .select('id', count='exact')\
                .execute()
            total_badges = total_result.count or 0

            # Active badges
            active_result = self.client.table('badges')\
                .select('id', count='exact')\
                .eq('is_active', True)\
                .execute()
            active_badges = active_result.count or 0

            return {
                'total_badges': total_badges,
                'active_badges': active_badges
            }
        except Exception as e:
            logger.error(f"Error fetching badge stats: {e}")
            return {
                'total_badges': 0,
                'active_badges': 0
            }

    def get_activity_stats(self, days: int = 7) -> Dict[str, Any]:
        """
        Get activity statistics for recent period.

        Args:
            days: Number of days to look back

        Returns:
            Dictionary with activity statistics
        """
        try:
            since = (datetime.utcnow() - timedelta(days=days)).isoformat()

            # New users
            new_users_result = self.client.table('users')\
                .select('id', count='exact')\
                .gte('created_at', since)\
                .execute()
            new_users = new_users_result.count or 0

            # Quest enrollments
            new_enrollments_result = self.client.table('user_quests')\
                .select('id', count='exact')\
                .gte('started_at', since)\
                .execute()
            new_enrollments = new_enrollments_result.count or 0

            # Task completions
            task_completions_result = self.client.table('quest_task_completions')\
                .select('id', count='exact')\
                .gte('completed_at', since)\
                .execute()
            task_completions = task_completions_result.count or 0

            # Quest completions
            quest_completions_result = self.client.table('user_quests')\
                .select('id', count='exact')\
                .gte('completed_at', since)\
                .execute()
            quest_completions = quest_completions_result.count or 0

            return {
                'period_days': days,
                'new_users': new_users,
                'new_enrollments': new_enrollments,
                'task_completions': task_completions,
                'quest_completions': quest_completions
            }
        except Exception as e:
            logger.error(f"Error fetching activity stats: {e}")
            return {
                'period_days': days,
                'new_users': 0,
                'new_enrollments': 0,
                'task_completions': 0,
                'quest_completions': 0
            }

    def get_top_users(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get top users by total XP.

        Args:
            limit: Number of users to return

        Returns:
            List of top users with XP details
        """
        try:
            # Get all user XP totals
            xp_result = self.client.table('user_skill_xp')\
                .select('user_id, xp_amount')\
                .execute()

            # Aggregate by user
            user_totals = {}
            for record in (xp_result.data or []):
                user_id = record.get('user_id')
                xp = record.get('xp_amount', 0)
                user_totals[user_id] = user_totals.get(user_id, 0) + xp

            # Sort and get top users
            sorted_users = sorted(user_totals.items(), key=lambda x: x[1], reverse=True)[:limit]

            # Get user details
            user_ids = [user_id for user_id, _ in sorted_users]
            users_result = self.client.table('users')\
                .select('id, display_name, avatar_url')\
                .in_('id', user_ids)\
                .execute()

            users_by_id = {user['id']: user for user in (users_result.data or [])}

            # Combine data
            top_users = []
            for user_id, total_xp in sorted_users:
                user = users_by_id.get(user_id, {'display_name': 'Unknown'})
                top_users.append({
                    'user_id': user_id,
                    'display_name': user.get('display_name'),
                    'avatar_url': user.get('avatar_url'),
                    'total_xp': total_xp
                })

            return top_users
        except Exception as e:
            logger.error(f"Error fetching top users: {e}")
            return []

    def get_popular_quests(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get most popular quests by enrollment count.

        Args:
            limit: Number of quests to return

        Returns:
            List of popular quests with enrollment counts
        """
        try:
            # Get enrollment counts
            enrollments = self.client.table('user_quests')\
                .select('quest_id')\
                .execute()

            quest_counts = {}
            for record in (enrollments.data or []):
                quest_id = record.get('quest_id')
                quest_counts[quest_id] = quest_counts.get(quest_id, 0) + 1

            # Sort and get top quests
            sorted_quests = sorted(quest_counts.items(), key=lambda x: x[1], reverse=True)[:limit]

            # Get quest details
            quest_ids = [quest_id for quest_id, _ in sorted_quests]
            quests_result = self.client.table('quests')\
                .select('id, title, image_url')\
                .in_('id', quest_ids)\
                .execute()

            quests_by_id = {quest['id']: quest for quest in (quests_result.data or [])}

            # Combine data
            popular_quests = []
            for quest_id, enrollment_count in sorted_quests:
                quest = quests_by_id.get(quest_id, {'title': 'Unknown'})
                popular_quests.append({
                    'quest_id': quest_id,
                    'title': quest.get('title'),
                    'image_url': quest.get('image_url'),
                    'enrollment_count': enrollment_count
                })

            return popular_quests
        except Exception as e:
            logger.error(f"Error fetching popular quests: {e}")
            return []
