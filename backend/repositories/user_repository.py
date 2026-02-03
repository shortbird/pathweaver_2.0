"""
User Repository - Database operations for users table

Handles all user-related database queries with RLS enforcement.
"""

import logging
from typing import Optional, Dict, List, Any
from repositories.base_repository import BaseRepository, DatabaseError, NotFoundError
from postgrest.exceptions import APIError

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)


class UserRepository(BaseRepository):
    """Repository for user database operations"""

    table_name = 'users'
    id_column = 'id'

    def find_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """
        Find a user by email address.

        Args:
            email: Email address to search for

        Returns:
            User record or None if not found

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select('*')
                .eq('email', email)
                .execute()
            )

            if not response.data:
                return None

            return response.data[0]

        except APIError as e:
            logger.error(f"Error finding user by email {email}: {e}")
            raise DatabaseError("Failed to fetch user by email") from e

    def find_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        """
        Find a user by portfolio slug.

        Args:
            slug: Portfolio slug to search for

        Returns:
            User record or None if not found

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select('*')
                .eq('portfolio_slug', slug)
                .execute()
            )

            if not response.data:
                return None

            return response.data[0]

        except APIError as e:
            logger.error(f"Error finding user by slug {slug}: {e}")
            raise DatabaseError("Failed to fetch user by slug") from e

    def get_profile(self, user_id: str) -> Dict[str, Any]:
        """
        Get user profile with all details.

        Args:
            user_id: User ID

        Returns:
            User profile with all fields

        Raises:
            NotFoundError: If user doesn't exist
            DatabaseError: If query fails
        """
        user = self.find_by_id(user_id)
        if not user:
            raise NotFoundError(f"User {user_id} not found")
        return user

    def update_profile(
        self,
        user_id: str,
        display_name: Optional[str] = None,
        bio: Optional[str] = None,
        avatar_url: Optional[str] = None,
        portfolio_slug: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update user profile fields.

        Args:
            user_id: User ID
            display_name: New display name (optional)
            bio: New bio (optional)
            avatar_url: New avatar URL (optional)
            portfolio_slug: New portfolio slug (optional)

        Returns:
            Updated user record

        Raises:
            NotFoundError: If user doesn't exist
            DatabaseError: If update fails
        """
        data = {}
        if display_name is not None:
            data['display_name'] = display_name
        if bio is not None:
            data['bio'] = bio
        if avatar_url is not None:
            data['avatar_url'] = avatar_url
        if portfolio_slug is not None:
            data['portfolio_slug'] = portfolio_slug

        if not data:
            # Nothing to update
            return self.get_profile(user_id)

        return self.update(user_id, data)

    def update_xp(
        self,
        user_id: str,
        total_xp: int,
        level: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Update user XP and level.

        Args:
            user_id: User ID
            total_xp: New total XP
            level: New level (optional)

        Returns:
            Updated user record

        Raises:
            NotFoundError: If user doesn't exist
            DatabaseError: If update fails
        """
        data = {'total_xp': total_xp}
        if level is not None:
            data['level'] = level

        return self.update(user_id, data)

    def increment_achievements(self, user_id: str) -> Dict[str, Any]:
        """
        Increment user's achievement count.

        Args:
            user_id: User ID

        Returns:
            Updated user record

        Raises:
            NotFoundError: If user doesn't exist
            DatabaseError: If update fails
        """
        user = self.get_profile(user_id)
        current_count = user.get('achievements_count', 0)
        return self.update(user_id, {'achievements_count': current_count + 1})

    def update_streak(self, user_id: str, streak_days: int) -> Dict[str, Any]:
        """
        Update user's learning streak.

        Args:
            user_id: User ID
            streak_days: New streak count

        Returns:
            Updated user record

        Raises:
            NotFoundError: If user doesn't exist
            DatabaseError: If update fails
        """
        return self.update(user_id, {'streak_days': streak_days})

    def find_by_role(self, role: str, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Find all users with a specific role.

        Args:
            role: Role to filter by (student/parent/advisor/admin/observer)
            limit: Maximum number of users to return

        Returns:
            List of user records

        Raises:
            DatabaseError: If query fails
        """
        return self.find_all(filters={'role': role}, limit=limit)

    def search_by_display_name(
        self,
        search_term: str,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Search users by display name (case-insensitive).

        Args:
            search_term: Search term
            limit: Maximum number of results

        Returns:
            List of matching user records

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select('id, display_name, avatar_url, bio, portfolio_slug')
                .ilike('display_name', f'%{search_term}%')
                .limit(limit)
                .execute()
            )

            return response.data or []

        except APIError as e:
            logger.error(f"Error searching users by display name: {e}")
            raise DatabaseError("Failed to search users") from e

    def get_dashboard_stats(self, user_id: str) -> Dict[str, Any]:
        """
        Get user statistics for dashboard.

        Args:
            user_id: User ID

        Returns:
            Dictionary with stats (total_xp, level, achievements_count, streak_days)

        Raises:
            NotFoundError: If user doesn't exist
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select('total_xp, level, achievements_count, streak_days')
                .eq('id', user_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"User {user_id} not found")

            return response.data[0]

        except APIError as e:
            logger.error(f"Error fetching dashboard stats for user {user_id}: {e}")
            raise DatabaseError("Failed to fetch dashboard stats") from e

    def find_by_ids(
        self,
        user_ids: List[str],
        select_fields: str = '*'
    ) -> Dict[str, Dict[str, Any]]:
        """
        Fetch multiple users by IDs in a single query (prevents N+1 queries).

        Args:
            user_ids: List of user IDs to fetch
            select_fields: Comma-separated fields to select (default: '*')

        Returns:
            Dictionary mapping user_id -> user record

        Raises:
            DatabaseError: If query fails
        """
        if not user_ids:
            return {}

        try:
            response = (
                self.client.table(self.table_name)
                .select(select_fields)
                .in_('id', user_ids)
                .execute()
            )

            # Convert list to dictionary for easy lookup
            users_dict = {user['id']: user for user in (response.data or [])}
            return users_dict

        except APIError as e:
            logger.error(f"Error fetching users by IDs: {e}")
            raise DatabaseError("Failed to fetch users by IDs") from e

    def get_basic_profiles(
        self,
        user_ids: List[str]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Fetch basic profile info for multiple users (optimized for connections/friends lists).

        Args:
            user_ids: List of user IDs to fetch

        Returns:
            Dictionary mapping user_id -> basic profile (id, first_name, last_name, display_name, avatar_url, bio, role)

        Raises:
            DatabaseError: If query fails
        """
        return self.find_by_ids(
            user_ids,
            select_fields='id, first_name, last_name, display_name, avatar_url, bio, portfolio_slug, role'
        )

    def update_last_active(self, user_id: str) -> bool:
        """
        Update user's last active timestamp.

        Args:
            user_id: User ID

        Returns:
            True if successful

        Raises:
            DatabaseError: If update fails
        """
        try:
            self.update(user_id, {'last_active': 'now()'})
            return True

        except NotFoundError:
            logger.warning(f"User {user_id} not found when updating last_active")
            return False
        except DatabaseError:
            raise
