"""
Analytics service for querying and analyzing user activity data.

Simplified to focus on:
- Event counts by category
- Popular quests based on activity
"""

from services.base_service import BaseService
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from utils.logger import get_logger

logger = get_logger(__name__)


class AnalyticsService(BaseService):
    """Provides simplified analytics focused on activity tracking."""

    @property
    def supabase(self):
        """PERF-M1 fix: BaseService no longer exposes ``self.supabase`` (DB
        access moved to repositories in Dec 2025), so every method here raised
        AttributeError -> the analytics endpoints returned 500.

        This is a LAZY property (not set in __init__) because AnalyticsService is
        instantiated at module import time (routes/analytics.py), while
        get_supabase_admin_client() reads Flask's request-scoped ``g`` — eagerly
        fetching it at import raised "Working outside of application context".
        Resolving it on access means it only runs inside a request handler
        (route is @require_admin-gated; analytics aggregates cross-user data).
        """
        from database import get_supabase_admin_client
        # admin client justified: platform analytics aggregates cross-user activity; route is admin-gated
        return get_supabase_admin_client()

    def get_event_counts_by_category(
        self,
        start_date: datetime,
        end_date: datetime,
        user_id: Optional[str] = None
    ) -> Dict[str, int]:
        """
        Get event counts grouped by category.

        Args:
            start_date: Start date for analysis
            end_date: End date for analysis
            user_id: Optional filter for specific user

        Returns:
            Dictionary with category names as keys and counts as values
        """
        try:
            # Counted in Postgres. Reading the rows to tally them here returned
            # at most 1000 of them (PostgREST's silent row cap) against a table
            # holding 106k, so every category count was quietly short.
            response = self.supabase.rpc('analytics_event_counts_by_category', {
                'p_start': start_date.isoformat(),
                'p_end': end_date.isoformat(),
                'p_user_id': user_id,
            }).execute()

            category_counts = {
                row['event_category']: row['event_count']
                for row in (response.data or [])
            }

            return category_counts

        except Exception as e:
            logger.error(f"Error fetching event counts by category: {str(e)}")
            raise

    def get_popular_quests(self, days: int = 30, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get most popular quests based on starts and completions.

        Args:
            days: Number of days to analyze
            limit: Maximum number of quests to return

        Returns:
            List of quest data with popularity metrics
        """
        try:
            start_date = datetime.utcnow() - timedelta(days=days)

            # Grouped in Postgres: one row per quest instead of one row per
            # event. Tallying the events here read 1000 of them at most, so the
            # rankings were computed from about a third of a 30-day window and
            # far less over longer ones. The aggregate also drops non-UUID
            # quest ids left by the old activity tracker, which used to log
            # collection routes ("similar", "topics") as quests.
            response = self.supabase.rpc('analytics_quest_event_counts', {
                'p_since': start_date.isoformat(),
            }).execute()

            quest_stats = {
                row['quest_id']: {
                    'quest_id': row['quest_id'],
                    'views': row['views'] or 0,
                    'starts': row['starts'] or 0,
                    'completions': row['completions'] or 0,
                }
                for row in (response.data or [])
            }

            # Calculate popularity score (weighted)
            for quest_id in quest_stats:
                stats = quest_stats[quest_id]
                stats['completion_rate'] = (
                    (stats['completions'] / stats['starts'] * 100)
                    if stats['starts'] > 0 else 0
                )
                # Popularity score: views + (starts * 2) + (completions * 5)
                stats['popularity_score'] = (
                    stats['views'] +
                    (stats['starts'] * 2) +
                    (stats['completions'] * 5)
                )

            # Get quest details
            quest_ids = list(quest_stats.keys())
            if quest_ids:
                quests_response = self.supabase.table('quests').select(
                    'id, title, description, image_url'
                ).in_('id', quest_ids).execute()

                quests = quests_response.data or []

                # Merge quest data with stats
                for quest in quests:
                    if quest['id'] in quest_stats:
                        quest_stats[quest['id']].update({
                            'title': quest['title'],
                            'description': quest['description'],
                            'image_url': quest['image_url']
                        })

            # Sort by popularity score and return top N
            popular_quests = sorted(
                quest_stats.values(),
                key=lambda x: x['popularity_score'],
                reverse=True
            )[:limit]

            return popular_quests

        except Exception as e:
            logger.error(f"Error fetching popular quests: {str(e)}")
            raise
