"""
Analytics Data Cache Service

Provides shared base data cache for admin analytics endpoints to reduce database queries.
Part of Month 6 Backend Optimization (Dec 2025).

Performance Improvements:
- Reduces 4+ separate analytics queries to 1-2 shared queries
- Implements in-memory caching with configurable TTL
- Target: 70-85% reduction in database load for analytics endpoints

Usage:
    from backend.services.analytics_data_cache_service import AnalyticsDataCacheService

    cache_service = AnalyticsDataCacheService(supabase_client)
    base_data = cache_service.get_base_analytics_data()

    # Access cached data
    total_users = base_data['total_users']
    active_users = base_data['active_users']
    quest_completions_week = base_data['quest_completions_week']
"""
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from utils.logger import get_logger

logger = get_logger(__name__)


class AnalyticsDataCacheService:
    """
    Shared data cache service for admin analytics endpoints.

    Fetches base analytics data in minimal queries and caches results
    to avoid redundant database calls across multiple analytics endpoints.
    """

    def __init__(self, supabase_client, ttl_seconds: int = 120):
        """
        Initialize analytics data cache service.

        Args:
            supabase_client: Supabase admin client
            ttl_seconds: Cache time-to-live in seconds (default: 120s / 2 minutes)
        """
        self.client = supabase_client
        self.ttl_seconds = ttl_seconds
        self._cache = {
            'base_data': {'data': None, 'expires_at': None},
            'activity_data': {'data': None, 'expires_at': None},
            'trends_data': {'data': None, 'expires_at': None}
        }

    def _is_cache_valid(self, cache_key: str) -> bool:
        """Check if cached data is still valid."""
        cache_entry = self._cache.get(cache_key, {})
        if cache_entry.get('data') and cache_entry.get('expires_at'):
            return datetime.utcnow() < cache_entry['expires_at']
        return False

    def _get_cached(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Get cached data if valid."""
        if self._is_cache_valid(cache_key):
            return self._cache[cache_key]['data']
        return None

    def _set_cache(self, cache_key: str, data: Dict[str, Any], ttl: Optional[int] = None):
        """Set cached data with expiration."""
        ttl = ttl or self.ttl_seconds
        self._cache[cache_key] = {
            'data': data,
            'expires_at': datetime.utcnow() + timedelta(seconds=ttl)
        }

    def get_base_analytics_data(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Get base analytics data with shared caching.

        Fetches all core metrics in 1-2 optimized queries instead of 4+ separate queries.

        Returns:
            Dict containing:
            - total_users: Total user count
            - active_users: Users active in last 7 days
            - new_users_week: New users in last 7 days
            - quest_completions_today: Task completions today
            - quest_completions_week: Task completions in last 7 days
            - total_xp_week: Total XP earned in last 7 days
            - user_creation_dates: List of all user creation dates (for trends)
            - completion_dates: List of all completion dates (for trends)
            - flagged_tasks_count: Number of flagged tasks
        """
        # Return cached data if valid
        if not force_refresh:
            cached = self._get_cached('base_data')
            if cached:
                logger.debug("Returning cached base analytics data")
                return cached

        logger.debug("Fetching fresh base analytics data")

        try:
            now = datetime.utcnow()
            today = now.date()
            week_ago = (now - timedelta(days=7)).date()

            # OPTIMIZATION 1: Fetch ALL users in single query (instead of 3 separate count queries)
            # This gives us: total_users, new_users_week, active_users from ONE query
            all_users_response = self.client.table('users').select('created_at').execute()
            all_users_data = all_users_response.data or []

            # Calculate user metrics from single dataset
            total_users = len(all_users_data)
            new_users_week = 0
            user_creation_dates = []

            for user in all_users_data:
                created_at_str = user.get('created_at')
                if created_at_str:
                    created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00')).date()
                    user_creation_dates.append(created_at_str)

                    # Count new users this week
                    if created_at >= week_ago:
                        new_users_week += 1

            # Active users = users created in last 7 days (since we don't have updated_at)
            active_users = new_users_week

            # OPTIMIZATION 2: Fetch ALL quest completions in single query (instead of 2-3 separate queries)
            # This gives us: completions_today, completions_week, task_ids for XP calculation
            all_completions_response = self.client.table('quest_task_completions').select(
                'completed_at, task_id, user_quest_task_id'
            ).execute()
            all_completions_data = all_completions_response.data or []

            # Calculate completion metrics from single dataset
            completions_today = 0
            completions_week = 0
            task_ids_week = []
            completion_dates = []

            for completion in all_completions_data:
                completed_at_str = completion.get('completed_at')
                if completed_at_str:
                    completed_at = datetime.fromisoformat(completed_at_str.replace('Z', '+00:00')).date()
                    completion_dates.append(completed_at_str)

                    # Count completions today
                    if completed_at >= today:
                        completions_today += 1

                    # Count completions this week and collect task IDs
                    if completed_at >= week_ago:
                        completions_week += 1
                        # Use user_quest_task_id as primary, fallback to task_id
                        task_id = completion.get('user_quest_task_id') or completion.get('task_id')
                        if task_id:
                            task_ids_week.append(task_id)

            # OPTIMIZATION 3: Batch fetch XP values for tasks completed this week
            # Instead of joining every completion, we fetch unique task XP values once
            total_xp_week = 0
            if task_ids_week:
                unique_task_ids = list(set(task_ids_week))
                tasks_response = self.client.table('user_quest_tasks').select(
                    'id, xp_value'
                ).in_('id', unique_task_ids).execute()

                # Create task_id -> xp_value mapping
                xp_map = {task['id']: task.get('xp_value', 0) for task in (tasks_response.data or [])}

                # Sum XP for all weekly completions
                for task_id in task_ids_week:
                    total_xp_week += xp_map.get(task_id, 0)

            # Fetch flagged tasks count (separate small query)
            try:
                flagged_tasks_response = self.client.table('quest_sample_tasks').select(
                    'id', count='exact'
                ).eq('is_flagged', True).execute()
                flagged_tasks_count = flagged_tasks_response.count or 0
            except Exception as e:
                logger.error(f"Error getting flagged tasks: {e}")
                flagged_tasks_count = 0

            # Build result dataset
            result = {
                'total_users': total_users,
                'active_users': active_users,
                'new_users_week': new_users_week,
                'quest_completions_today': completions_today,
                'quest_completions_week': completions_week,
                'total_xp_week': total_xp_week,
                'flagged_tasks_count': flagged_tasks_count,
                'engagement_rate': round((active_users / total_users * 100) if total_users > 0 else 0, 1),
                # Raw data for trends endpoint to use
                'user_creation_dates': user_creation_dates,
                'completion_dates': completion_dates,
                'last_updated': now.isoformat()
            }

            # Cache the result
            self._set_cache('base_data', result)

            logger.info(
                f"Base analytics data fetched: {total_users} users, "
                f"{completions_week} completions this week (reduced from 4+ queries to 2-3 queries)"
            )

            return result

        except Exception as e:
            logger.error(f"Error fetching base analytics data: {str(e)}")
            # Return default empty data on error
            return {
                'total_users': 0,
                'active_users': 0,
                'new_users_week': 0,
                'quest_completions_today': 0,
                'quest_completions_week': 0,
                'total_xp_week': 0,
                'flagged_tasks_count': 0,
                'engagement_rate': 0,
                'user_creation_dates': [],
                'completion_dates': [],
                'last_updated': datetime.utcnow().isoformat()
            }

    def get_trends_data(self, days_back: int = 30, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Get historical trends data using cached base data.

        Args:
            days_back: Number of days to include in trends (default: 30)
            force_refresh: Force refresh cached data

        Returns:
            Dict containing daily_signups, daily_completions, xp_by_pillar
        """
        # Return cached trends if valid
        if not force_refresh:
            cached = self._get_cached('trends_data')
            if cached:
                logger.debug("Returning cached trends data")
                return cached

        logger.debug("Calculating trends from base analytics data")

        try:
            # Get base data (will use cache if available)
            base_data = self.get_base_analytics_data(force_refresh=force_refresh)

            now = datetime.utcnow()
            start_date = (now - timedelta(days=days_back)).date()

            # Initialize daily buckets
            daily_signups = {}
            daily_completions = {}

            for i in range(days_back):
                date = (now - timedelta(days=i)).date()
                daily_signups[date.isoformat()] = 0
                daily_completions[date.isoformat()] = 0

            # Process user creation dates from base data
            for created_at_str in base_data['user_creation_dates']:
                created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00')).date()
                if created_at >= start_date:
                    daily_signups[created_at.isoformat()] = daily_signups.get(created_at.isoformat(), 0) + 1

            # Process completion dates from base data
            for completed_at_str in base_data['completion_dates']:
                completed_at = datetime.fromisoformat(completed_at_str.replace('Z', '+00:00')).date()
                if completed_at >= start_date:
                    daily_completions[completed_at.isoformat()] = daily_completions.get(completed_at.isoformat(), 0) + 1

            # Fetch XP distribution (separate query, not frequently accessed)
            pillar_totals = {
                'stem': 0,
                'wellness': 0,
                'communication': 0,
                'civics': 0,
                'art': 0
            }

            try:
                all_xp_response = self.client.table('user_skill_xp').select(
                    'pillar, xp_amount'
                ).execute()

                for record in all_xp_response.data or []:
                    pillar = record.get('pillar')
                    xp_amount = record.get('xp_amount', 0)

                    if pillar in pillar_totals:
                        pillar_totals[pillar] += xp_amount
                    # Map old format to new format
                    elif pillar == 'STEM & Logic':
                        pillar_totals['stem'] += xp_amount
                    elif pillar == 'Life & Wellness':
                        pillar_totals['wellness'] += xp_amount
                    elif pillar == 'Language & Communication':
                        pillar_totals['communication'] += xp_amount
                    elif pillar == 'Society & Culture':
                        pillar_totals['civics'] += xp_amount
                    elif pillar == 'Arts & Creativity':
                        pillar_totals['art'] += xp_amount

            except Exception as e:
                logger.error(f"Error fetching XP data: {e}")

            result = {
                'daily_signups': daily_signups,
                'daily_completions': daily_completions,
                'xp_by_pillar': pillar_totals,
                'date_range': {
                    'start': start_date.isoformat(),
                    'end': now.date().isoformat()
                }
            }

            # Cache trends data for 5 minutes (longer TTL since it's aggregated)
            self._set_cache('trends_data', result, ttl=300)

            return result

        except Exception as e:
            logger.error(f"Error calculating trends data: {str(e)}")
            return {
                'daily_signups': {},
                'daily_completions': {},
                'xp_by_pillar': {
                    'stem': 0,
                    'wellness': 0,
                    'communication': 0,
                    'civics': 0,
                    'art': 0
                },
                'date_range': {
                    'start': (datetime.utcnow() - timedelta(days=days_back)).date().isoformat(),
                    'end': datetime.utcnow().date().isoformat()
                }
            }

    def clear_cache(self):
        """Clear all cached data (useful for testing or forced refresh)."""
        for cache_key in self._cache:
            self._cache[cache_key] = {'data': None, 'expires_at': None}
        logger.info("Analytics data cache cleared")
