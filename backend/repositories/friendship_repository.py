"""
Friendship Repository

Handles all database operations related to connections/friendships between users.
"""

from typing import List, Dict, Optional, Any
from datetime import datetime
from backend.repositories.base_repository import BaseRepository, NotFoundError
from utils.logger import get_logger

logger = get_logger(__name__)


class FriendshipRepository(BaseRepository):
    """Repository for friendship/connection operations."""

    table_name = 'friendships'

    def find_by_user(self, user_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get all friendships for a user (both as requester and addressee).

        Args:
            user_id: User ID
            status: Optional status filter (pending/accepted/rejected)

        Returns:
            List of friendships
        """
        try:
            # Don't use nested select - just get the friendship records
            # User data will be fetched separately in the route handler
            query = self.client.table(self.table_name).select('*')

            # User is either requester or addressee
            if status:
                query = query.or_(f'requester_id.eq.{user_id},addressee_id.eq.{user_id}')\
                    .eq('status', status)
            else:
                query = query.or_(f'requester_id.eq.{user_id},addressee_id.eq.{user_id}')

            query = query.order('created_at', desc=True)

            result = query.execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching friendships for user {user_id}: {e}")
            return []

    def find_accepted_connections(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all accepted connections for a user.

        Args:
            user_id: User ID

        Returns:
            List of accepted friendships with user details
        """
        return self.find_by_user(user_id, status='accepted')

    def find_pending_requests(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all pending connection requests received by a user.

        Args:
            user_id: User ID (addressee)

        Returns:
            List of pending friendships
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*')\
                .eq('addressee_id', user_id)\
                .eq('status', 'pending')\
                .order('created_at', desc=True)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching pending requests for user {user_id}: {e}")
            return []

    def find_sent_requests(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all pending connection requests sent by a user.

        Args:
            user_id: User ID (requester)

        Returns:
            List of sent pending friendships
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*')\
                .eq('requester_id', user_id)\
                .eq('status', 'pending')\
                .order('created_at', desc=True)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching sent requests for user {user_id}: {e}")
            return []

    def create_request(self, requester_id: str, addressee_id: str) -> Dict[str, Any]:
        """
        Create a new connection request.

        Args:
            requester_id: User sending the request
            addressee_id: User receiving the request

        Returns:
            Created friendship record

        Raises:
            ValueError: If request already exists or users are the same
        """
        if requester_id == addressee_id:
            raise ValueError("Cannot send connection request to yourself")

        # Check if friendship already exists (in either direction)
        existing = self.client.table(self.table_name)\
            .select('id, status')\
            .or_(
                f'and(requester_id.eq.{requester_id},addressee_id.eq.{addressee_id}),'
                f'and(requester_id.eq.{addressee_id},addressee_id.eq.{requester_id})'
            )\
            .execute()

        if existing.data:
            raise ValueError("Connection request already exists")

        try:
            data = {
                'requester_id': requester_id,
                'addressee_id': addressee_id,
                'status': 'pending',
                'created_at': datetime.utcnow().isoformat()
            }

            result = self.client.table(self.table_name)\
                .insert(data)\
                .execute()

            if not result.data:
                raise ValueError("Failed to create connection request")

            logger.info(f"Created connection request from {requester_id} to {addressee_id}")
            return result.data[0]
        except Exception as e:
            logger.error(f"Error creating connection request: {e}")
            raise

    def accept_request(self, friendship_id: str, user_id: str) -> Dict[str, Any]:
        """
        Accept a connection request.

        Args:
            friendship_id: Friendship ID
            user_id: User accepting (must be addressee)

        Returns:
            Updated friendship record

        Raises:
            NotFoundError: If friendship not found
            PermissionError: If user is not the addressee
        """
        friendship = self.find_by_id(friendship_id)
        if not friendship:
            raise NotFoundError(f"Connection request {friendship_id} not found")

        if friendship['addressee_id'] != user_id:
            raise PermissionError("Only the addressee can accept this request")

        try:
            # Use bypass function to avoid timestamp trigger issues
            result = self.client.rpc('bypass_friendship_update', {
                'friendship_id': friendship_id,
                'new_status': 'accepted'
            }).execute()

            logger.info(f"Accepted connection request {friendship_id}")
            return result.data
        except Exception as e:
            logger.error(f"Error accepting connection request {friendship_id}: {e}")
            raise

    def reject_request(self, friendship_id: str, user_id: str) -> bool:
        """
        Reject a connection request.

        Args:
            friendship_id: Friendship ID
            user_id: User rejecting (must be addressee)

        Returns:
            True if rejected successfully

        Raises:
            NotFoundError: If friendship not found
            PermissionError: If user is not the addressee
        """
        friendship = self.find_by_id(friendship_id)
        if not friendship:
            raise NotFoundError(f"Connection request {friendship_id} not found")

        if friendship['addressee_id'] != user_id:
            raise PermissionError("Only the addressee can reject this request")

        try:
            result = self.client.table(self.table_name)\
                .delete()\
                .eq('id', friendship_id)\
                .execute()

            logger.info(f"Rejected/deleted connection request {friendship_id}")
            return True
        except Exception as e:
            logger.error(f"Error rejecting connection request {friendship_id}: {e}")
            raise

    def cancel_request(self, friendship_id: str, user_id: str) -> bool:
        """
        Cancel a sent connection request.

        Args:
            friendship_id: Friendship ID
            user_id: User canceling (must be requester)

        Returns:
            True if canceled successfully

        Raises:
            NotFoundError: If friendship not found
            PermissionError: If user is not the requester
        """
        friendship = self.find_by_id(friendship_id)
        if not friendship:
            raise NotFoundError(f"Connection request {friendship_id} not found")

        if friendship['requester_id'] != user_id:
            raise PermissionError("Only the requester can cancel this request")

        try:
            result = self.client.table(self.table_name)\
                .delete()\
                .eq('id', friendship_id)\
                .execute()

            logger.info(f"Canceled connection request {friendship_id}")
            return True
        except Exception as e:
            logger.error(f"Error canceling connection request {friendship_id}: {e}")
            raise
