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
            query = self.supabase.table('user_activity_events').select('event_category').gte(
                'created_at', start_date.isoformat()
            ).lte('created_at', end_date.isoformat())

            if user_id:
                query = query.eq('user_id', user_id)

            response = query.execute()
            events = response.data or []

            # Count events by category
            category_counts = {}
            for event in events:
                category = event.get('event_category', 'other')
                category_counts[category] = category_counts.get(category, 0) + 1

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

            # Get quest events
            quest_events_response = self.supabase.table('user_activity_events').select(
                'event_type, event_data'
            ).in_(
                'event_type', ['quest_started', 'quest_completed', 'quest_viewed']
            ).gte('created_at', start_date.isoformat()).execute()

            quest_events = quest_events_response.data or []

            # Count events per quest
            quest_stats = {}
            for event in quest_events:
                quest_id = event.get('event_data', {}).get('quest_id')
                if not quest_id:
                    continue

                if quest_id not in quest_stats:
                    quest_stats[quest_id] = {
                        'quest_id': quest_id,
                        'views': 0,
                        'starts': 0,
                        'completions': 0
                    }

                event_type = event['event_type']
                if event_type == 'quest_viewed':
                    quest_stats[quest_id]['views'] += 1
                elif event_type == 'quest_started':
                    quest_stats[quest_id]['starts'] += 1
                elif event_type == 'quest_completed':
                    quest_stats[quest_id]['completions'] += 1

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
