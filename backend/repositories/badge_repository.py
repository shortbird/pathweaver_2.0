"""
Badge Repository - Database operations for badges

Handles all badge-related database queries with RLS enforcement.
"""

import logging
from typing import Optional, Dict, List, Any
from repositories.base_repository import BaseRepository, DatabaseError, NotFoundError
from postgrest.exceptions import APIError

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)


class BadgeRepository(BaseRepository):
    """Repository for badge database operations"""

    table_name = 'badges'
    id_column = 'id'

    def get_active_badges(
        self,
        pillar: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get all active badges with optional filtering.

        Args:
            pillar: Filter by primary pillar (optional)
            limit: Maximum number of badges

        Returns:
            List of active badge records

        Raises:
            DatabaseError: If query fails
        """
        filters = {'is_active': True}
        if pillar:
            filters['pillar_primary'] = pillar

        return self.find_all(filters=filters, order_by='name', limit=limit)

    def get_badge_with_progress(
        self,
        badge_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """
        Get badge details with user's progress toward earning it.

        Args:
            badge_id: Badge ID
            user_id: User ID

        Returns:
            Badge record with progress information

        Raises:
            NotFoundError: If badge doesn't exist
            DatabaseError: If query fails
        """
        try:
            # Get badge details
            badge = self.find_by_id(badge_id)
            if not badge:
                raise NotFoundError(f"Badge {badge_id} not found")

            pillar = badge.get('pillar_primary')

            # Get user's XP in this pillar
            xp_response = (
                self.client.table('user_skill_xp')
                .select('xp_amount')
                .eq('user_id', user_id)
                .eq('pillar', pillar)
                .execute()
            )

            current_xp = xp_response.data[0]['xp_amount'] if xp_response.data else 0

            # Count completed quests in this pillar
            # Note: This requires joining quest_task_completions -> quest_tasks -> quests
            # Simplified version - get total quest completions
            quests_response = (
                self.client.table('user_quests')
                .select('quest_id, quests(pillar_primary)', count='exact')
                .eq('user_id', user_id)
                .eq('is_active', False)  # Completed quests
                .execute()
            )

            total_quests = quests_response.count or 0

            # Calculate progress
            min_xp = badge.get('min_xp', 0)
            min_quests = badge.get('min_quests', 0)

            xp_progress = (current_xp / min_xp * 100) if min_xp > 0 else 100
            quest_progress = (total_quests / min_quests * 100) if min_quests > 0 else 100

            badge['progress'] = {
                'current_xp': current_xp,
                'required_xp': min_xp,
                'xp_percentage': min(xp_progress, 100),
                'current_quests': total_quests,
                'required_quests': min_quests,
                'quest_percentage': min(quest_progress, 100),
                'is_earned': current_xp >= min_xp and total_quests >= min_quests,
                'requirements_met': {
                    'xp': current_xp >= min_xp,
                    'quests': total_quests >= min_quests
                }
            }

            return badge

        except NotFoundError:
            raise
        except APIError as e:
            logger.error(f"Error fetching badge progress: {e}")
            raise DatabaseError("Failed to fetch badge progress") from e

    def get_user_earned_badges(
        self,
        user_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get all badges earned by a user.

        Args:
            user_id: User ID
            limit: Maximum number of badges

        Returns:
            List of badge records

        Raises:
            DatabaseError: If query fails
        """
        try:
            # Get user's skill XP
            xp_response = (
                self.client.table('user_skill_xp')
                .select('pillar, xp_amount')
                .eq('user_id', user_id)
                .execute()
            )

            user_xp = {row['pillar']: row['xp_amount'] for row in xp_response.data or []}

            # Get all active badges
            badges = self.get_active_badges(limit=limit)

            # Filter to earned badges
            earned_badges = []
            for badge in badges:
                pillar = badge.get('pillar_primary')
                current_xp = user_xp.get(pillar, 0)
                min_xp = badge.get('min_xp', 0)

                if current_xp >= min_xp:
                    badge['earned_at'] = None  # TODO: Track actual earn date
                    badge['progress_xp'] = current_xp
                    earned_badges.append(badge)

            return earned_badges

        except APIError as e:
            logger.error(f"Error fetching user earned badges: {e}")
            raise DatabaseError("Failed to fetch earned badges") from e

    def get_recommended_badges(
        self,
        user_id: str,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Get recommended badges for user based on their progress.

        Args:
            user_id: User ID
            limit: Maximum number of recommendations

        Returns:
            List of badge records sorted by progress

        Raises:
            DatabaseError: If query fails
        """
        try:
            # Get user's skill XP
            xp_response = (
                self.client.table('user_skill_xp')
                .select('pillar, xp_amount')
                .eq('user_id', user_id)
                .execute()
            )

            user_xp = {row['pillar']: row['xp_amount'] for row in xp_response.data or []}

            # Get all active badges
            badges = self.get_active_badges(limit=100)

            # Calculate progress for each badge
            badge_progress = []
            for badge in badges:
                pillar = badge.get('pillar_primary')
                current_xp = user_xp.get(pillar, 0)
                min_xp = badge.get('min_xp', 0)

                # Only recommend badges not yet earned
                if current_xp < min_xp:
                    progress_pct = (current_xp / min_xp * 100) if min_xp > 0 else 0
                    badge['progress_percentage'] = progress_pct
                    badge['xp_remaining'] = min_xp - current_xp
                    badge_progress.append(badge)

            # Sort by progress (closest to completion first)
            badge_progress.sort(key=lambda b: b['progress_percentage'], reverse=True)

            return badge_progress[:limit]

        except APIError as e:
            logger.error(f"Error fetching recommended badges: {e}")
            raise DatabaseError("Failed to fetch recommended badges") from e

    def refresh_badge_image(
        self,
        badge_id: str,
        image_url: str
    ) -> Dict[str, Any]:
        """
        Update badge image URL.

        Args:
            badge_id: Badge ID
            image_url: New image URL

        Returns:
            Updated badge record

        Raises:
            NotFoundError: If badge doesn't exist
            DatabaseError: If update fails
        """
        return self.update(badge_id, {
            'image_url': image_url,
            'image_generation_status': 'generated'
        })

    def search_badges(
        self,
        search_term: str,
        pillar: Optional[str] = None,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Search badges by name or description.

        Args:
            search_term: Search term
            pillar: Filter by pillar (optional)
            limit: Maximum number of results

        Returns:
            List of matching badge records

        Raises:
            DatabaseError: If query fails
        """
        try:
            query = (
                self.client.table(self.table_name)
                .select('*')
                .eq('is_active', True)
                .or_(f'name.ilike.%{search_term}%,description.ilike.%{search_term}%')
            )

            if pillar:
                query = query.eq('pillar_primary', pillar)

            response = query.limit(limit).execute()
            return response.data or []

        except APIError as e:
            logger.error(f"Error searching badges: {e}")
            raise DatabaseError("Failed to search badges") from e
