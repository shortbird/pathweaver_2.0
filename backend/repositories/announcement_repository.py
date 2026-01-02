"""
Announcement Repository - Database operations for announcements table

Handles all announcement-related database queries with RLS enforcement.
"""

import logging
from typing import Optional, Dict, List, Any
from repositories.base_repository import BaseRepository, DatabaseError, NotFoundError
from postgrest.exceptions import APIError

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)


class AnnouncementRepository(BaseRepository):
    """Repository for announcement database operations"""

    table_name = 'announcements'
    id_column = 'id'

    def create_announcement(self, announcement_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new announcement.

        Args:
            announcement_data: Dictionary containing:
                - author_id: UUID of the author
                - organization_id: UUID of the organization
                - title: Announcement title
                - message: Announcement message (markdown supported)
                - target_audience: Who can see this announcement
                - pinned: Whether to pin the announcement

        Returns:
            Created announcement record

        Raises:
            DatabaseError: If creation fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .insert(announcement_data)
                .execute()
            )

            if not response.data:
                raise DatabaseError("Failed to create announcement")

            return response.data[0]

        except APIError as e:
            logger.error(f"Error creating announcement: {e}")
            raise DatabaseError("Failed to create announcement") from e

    def get_announcement_by_id(self, announcement_id: str) -> Optional[Dict[str, Any]]:
        """
        Get an announcement by ID.

        Args:
            announcement_id: UUID of the announcement

        Returns:
            Announcement record with author info or None if not found

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select('*, author:users!author_id(id, display_name, first_name, last_name, avatar_url, role)')
                .eq('id', announcement_id)
                .execute()
            )

            if not response.data:
                return None

            return response.data[0]

        except APIError as e:
            logger.error(f"Error fetching announcement {announcement_id}: {e}")
            raise DatabaseError("Failed to fetch announcement") from e

    def list_announcements(
        self,
        organization_id: str,
        target_audience: Optional[str] = None,
        pinned_only: bool = False,
        limit: int = 20,
        offset: int = 0,
        user_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        List announcements for an organization.

        Args:
            organization_id: UUID of the organization
            target_audience: Filter by audience (students, parents, advisors, all)
            pinned_only: Only return pinned announcements
            limit: Maximum number of results
            offset: Offset for pagination
            user_id: Optional user ID to check read status

        Returns:
            List of announcement records with author info and is_read flag

        Raises:
            DatabaseError: If query fails
        """
        try:
            query = (
                self.client.table(self.table_name)
                .select('*, author:users!author_id(id, display_name, first_name, last_name, avatar_url, role)')
                .eq('organization_id', organization_id)
                .order('pinned', desc=True)
                .order('created_at', desc=True)
                .range(offset, offset + limit - 1)
            )

            if target_audience and target_audience != 'all':
                query = query.contains('target_audience', [target_audience])

            if pinned_only:
                query = query.eq('pinned', True)

            response = query.execute()
            announcements = response.data or []

            # Add read status if user_id provided
            if user_id and announcements:
                from database import get_supabase_admin_client
                admin_client = get_supabase_admin_client()

                announcement_ids = [a['id'] for a in announcements]
                read_response = (
                    admin_client.table('announcement_reads')
                    .select('announcement_id')
                    .eq('user_id', user_id)
                    .in_('announcement_id', announcement_ids)
                    .execute()
                )
                read_ids = {r['announcement_id'] for r in (read_response.data or [])}

                for announcement in announcements:
                    announcement['is_read'] = announcement['id'] in read_ids
            else:
                for announcement in announcements:
                    announcement['is_read'] = False

            return announcements

        except APIError as e:
            logger.error(f"Error listing announcements for org {organization_id}: {e}")
            raise DatabaseError("Failed to list announcements") from e

    def update_announcement(self, announcement_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update an announcement.

        Args:
            announcement_id: UUID of the announcement
            updates: Dictionary of fields to update

        Returns:
            Updated announcement record

        Raises:
            DatabaseError: If update fails
            NotFoundError: If announcement not found
        """
        try:
            response = (
                self.client.table(self.table_name)
                .update(updates)
                .eq('id', announcement_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"Announcement {announcement_id} not found")

            return response.data[0]

        except APIError as e:
            logger.error(f"Error updating announcement {announcement_id}: {e}")
            raise DatabaseError("Failed to update announcement") from e

    def delete_announcement(self, announcement_id: str) -> bool:
        """
        Delete an announcement.

        Args:
            announcement_id: UUID of the announcement

        Returns:
            True if deleted successfully

        Raises:
            DatabaseError: If deletion fails
            NotFoundError: If announcement not found
        """
        try:
            response = (
                self.client.table(self.table_name)
                .delete()
                .eq('id', announcement_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"Announcement {announcement_id} not found")

            return True

        except APIError as e:
            logger.error(f"Error deleting announcement {announcement_id}: {e}")
            raise DatabaseError("Failed to delete announcement") from e

    def get_pinned_count(self, organization_id: str) -> int:
        """
        Get count of pinned announcements for an organization.

        Args:
            organization_id: UUID of the organization

        Returns:
            Count of pinned announcements

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select('id', count='exact')
                .eq('organization_id', organization_id)
                .eq('pinned', True)
                .execute()
            )

            return response.count or 0

        except APIError as e:
            logger.error(f"Error counting pinned announcements: {e}")
            raise DatabaseError("Failed to count pinned announcements") from e

    def mark_as_read(self, announcement_id: str, user_id: str) -> bool:
        """
        Mark an announcement as read by a user.

        Args:
            announcement_id: UUID of the announcement
            user_id: UUID of the user

        Returns:
            True if marked successfully

        Raises:
            DatabaseError: If operation fails
        """
        try:
            from database import get_supabase_admin_client
            admin_client = get_supabase_admin_client()

            # Use upsert to avoid duplicates (admin client bypasses RLS)
            response = (
                admin_client.table('announcement_reads')
                .upsert({
                    'announcement_id': announcement_id,
                    'user_id': user_id
                }, on_conflict='announcement_id,user_id')
                .execute()
            )

            return True

        except APIError as e:
            logger.error(f"Error marking announcement as read: {e}")
            raise DatabaseError("Failed to mark announcement as read") from e

    def get_unread_count(self, organization_id: str, user_id: str) -> int:
        """
        Get count of unread announcements for a user.

        Args:
            organization_id: UUID of the organization
            user_id: UUID of the user

        Returns:
            Count of unread announcements

        Raises:
            DatabaseError: If query fails
        """
        try:
            from database import get_supabase_admin_client
            admin_client = get_supabase_admin_client()

            # Get all announcement IDs for the org
            announcements = (
                admin_client.table(self.table_name)
                .select('id')
                .eq('organization_id', organization_id)
                .execute()
            )

            announcement_ids = [a['id'] for a in announcements.data] if announcements.data else []

            if not announcement_ids:
                return 0

            # Get read announcement IDs for this user (use admin client to bypass RLS)
            read_announcements = (
                admin_client.table('announcement_reads')
                .select('announcement_id')
                .eq('user_id', user_id)
                .in_('announcement_id', announcement_ids)
                .execute()
            )

            read_ids = {r['announcement_id'] for r in read_announcements.data} if read_announcements.data else set()

            # Calculate unread count
            return len(announcement_ids) - len(read_ids)

        except APIError as e:
            logger.error(f"Error counting unread announcements: {e}")
            raise DatabaseError("Failed to count unread announcements") from e
