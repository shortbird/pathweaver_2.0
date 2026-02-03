"""
Quest Invitation Repository

Handles all database operations for quest invitations sent from advisors/admins to students.
"""

from typing import List, Dict, Optional, Any
from datetime import datetime
from repositories.base_repository import BaseRepository, NotFoundError, ValidationError
from utils.logger import get_logger

logger = get_logger(__name__)


class QuestInvitationRepository(BaseRepository):
    """Repository for quest invitation operations."""

    table_name = 'quest_invitations'
    id_column = 'id'

    def create_invitation(
        self,
        organization_id: str,
        quest_id: str,
        user_id: str,
        invited_by: str,
        expires_at: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a quest invitation.

        Args:
            organization_id: Organization ID
            quest_id: Quest ID
            user_id: Student user ID
            invited_by: Advisor/admin user ID
            expires_at: Optional expiration datetime (ISO format)

        Returns:
            Created invitation record

        Raises:
            ValidationError: If invitation already exists
        """
        try:
            # Check if invitation already exists
            # DB uses student_id column, not user_id
            existing = self.client.table(self.table_name)\
                .select('id, status')\
                .eq('organization_id', organization_id)\
                .eq('quest_id', quest_id)\
                .eq('student_id', user_id)\
                .execute()

            if existing.data and len(existing.data) > 0:
                # If pending invitation exists, return it
                if existing.data[0]['status'] == 'pending':
                    logger.info(f"Pending invitation already exists for student {user_id} to quest {quest_id}")
                    return self.find_by_id(existing.data[0]['id'])

                # If declined/expired, allow creating new one
                # Delete the old one first
                self.client.table(self.table_name)\
                    .delete()\
                    .eq('id', existing.data[0]['id'])\
                    .execute()

            # DB columns: student_id, advisor_id (not user_id, invited_by)
            data = {
                'organization_id': organization_id,
                'quest_id': quest_id,
                'student_id': user_id,
                'advisor_id': invited_by,
                'status': 'pending'
            }

            if expires_at:
                data['expires_at'] = expires_at

            return self.create(data)

        except Exception as e:
            logger.error(f"Error creating invitation: {e}")
            raise

    def get_pending_for_user(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all pending invitations for a user.

        Args:
            user_id: Student user ID

        Returns:
            List of pending invitations with quest details
        """
        try:
            # DB uses student_id column
            result = self.client.table(self.table_name)\
                .select('*, quests(id, title, big_idea, header_image_url, quest_type)')\
                .eq('student_id', user_id)\
                .eq('status', 'pending')\
                .order('created_at', desc=True)\
                .execute()

            return result.data or []

        except Exception as e:
            logger.error(f"Error fetching pending invitations for student {user_id}: {e}")
            return []

    def get_invitations_by_organization(
        self,
        organization_id: str,
        status: Optional[str] = None,
        quest_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get invitations for an organization with optional filters.

        Args:
            organization_id: Organization ID
            status: Optional status filter
            quest_id: Optional quest ID filter

        Returns:
            List of invitations
        """
        try:
            # DB uses student_id FK to users
            query = self.client.table(self.table_name)\
                .select('*, quests(title), users!quest_invitations_student_id_fkey(email, display_name)')\
                .eq('organization_id', organization_id)

            if status:
                query = query.eq('status', status)

            if quest_id:
                query = query.eq('quest_id', quest_id)

            result = query.order('created_at', desc=True).execute()

            return result.data or []

        except Exception as e:
            logger.error(f"Error fetching invitations for org {organization_id}: {e}")
            return []

    def accept_invitation(self, invitation_id: str, user_id: str) -> Dict[str, Any]:
        """
        Accept a quest invitation.

        Args:
            invitation_id: Invitation ID
            user_id: User ID (must match invitation student_id)

        Returns:
            Updated invitation

        Raises:
            NotFoundError: If invitation not found
            ValidationError: If user_id doesn't match
        """
        try:
            # Verify invitation belongs to user
            invitation = self.find_by_id(invitation_id)

            if not invitation:
                raise NotFoundError(f"Invitation {invitation_id} not found")

            # DB uses student_id column
            if invitation['student_id'] != user_id:
                raise ValidationError("Invitation does not belong to this user")

            if invitation['status'] != 'pending':
                raise ValidationError(f"Invitation already {invitation['status']}")

            # Update status (responded_at is set by trigger)
            data = {
                'status': 'accepted'
            }

            return self.update(invitation_id, data)

        except Exception as e:
            logger.error(f"Error accepting invitation {invitation_id}: {e}")
            raise

    def decline_invitation(self, invitation_id: str, user_id: str) -> Dict[str, Any]:
        """
        Decline a quest invitation.

        Args:
            invitation_id: Invitation ID
            user_id: User ID (must match invitation student_id)

        Returns:
            Updated invitation

        Raises:
            NotFoundError: If invitation not found
            ValidationError: If user_id doesn't match
        """
        try:
            # Verify invitation belongs to user
            invitation = self.find_by_id(invitation_id)

            if not invitation:
                raise NotFoundError(f"Invitation {invitation_id} not found")

            # DB uses student_id column
            if invitation['student_id'] != user_id:
                raise ValidationError("Invitation does not belong to this user")

            if invitation['status'] != 'pending':
                raise ValidationError(f"Invitation already {invitation['status']}")

            # Update status (responded_at is set by trigger)
            data = {'status': 'declined'}

            return self.update(invitation_id, data)

        except Exception as e:
            logger.error(f"Error declining invitation {invitation_id}: {e}")
            raise
