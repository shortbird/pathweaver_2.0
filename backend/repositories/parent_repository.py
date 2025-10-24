"""
Parent Repository

Handles all database operations related to parent-student relationships and parent dashboard access.
"""

from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
from backend.repositories.base_repository import BaseRepository, NotFoundError, PermissionError
from utils.logger import get_logger

logger = get_logger(__name__)


class ParentRepository(BaseRepository):
    """Repository for parent-student relationship operations."""

    table_name = 'parent_student_links'

    def find_children(self, parent_id: str) -> List[Dict[str, Any]]:
        """
        Get all students linked to a parent.

        Args:
            parent_id: Parent user ID

        Returns:
            List of linked students with details
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*, student:student_id(id, display_name, avatar_url, first_name, last_name)')\
                .eq('parent_id', parent_id)\
                .order('linked_at', desc=True)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching children for parent {parent_id}: {e}")
            return []

    def find_parents(self, student_id: str) -> List[Dict[str, Any]]:
        """
        Get all parents linked to a student.

        Args:
            student_id: Student user ID

        Returns:
            List of linked parents with details
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*, parent:parent_id(id, display_name, avatar_url, first_name, last_name)')\
                .eq('student_id', student_id)\
                .order('linked_at', desc=True)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching parents for student {student_id}: {e}")
            return []

    def is_linked(self, parent_id: str, student_id: str) -> bool:
        """
        Check if a parent is linked to a student.

        Args:
            parent_id: Parent user ID
            student_id: Student user ID

        Returns:
            True if linked, False otherwise
        """
        try:
            result = self.client.table(self.table_name)\
                .select('id')\
                .eq('parent_id', parent_id)\
                .eq('student_id', student_id)\
                .execute()

            return bool(result.data)
        except Exception as e:
            logger.error(f"Error checking parent-student link: {e}")
            return False

    def create_invitation(self, student_id: str, parent_email: str) -> Dict[str, Any]:
        """
        Create a parent invitation (student sends invite to parent).

        Args:
            student_id: Student user ID
            parent_email: Parent's email address

        Returns:
            Created invitation record
        """
        try:
            # Check for existing pending invitation
            existing = self.client.table('parent_invitations')\
                .select('id')\
                .eq('student_id', student_id)\
                .eq('parent_email', parent_email)\
                .eq('status', 'pending')\
                .execute()

            if existing.data:
                raise ValueError("Pending invitation already exists")

            data = {
                'student_id': student_id,
                'parent_email': parent_email,
                'status': 'pending',
                'expires_at': (datetime.utcnow() + timedelta(hours=48)).isoformat(),
                'created_at': datetime.utcnow().isoformat()
            }

            result = self.client.table('parent_invitations')\
                .insert(data)\
                .execute()

            if not result.data:
                raise ValueError("Failed to create parent invitation")

            logger.info(f"Created parent invitation from student {student_id} to {parent_email}")
            return result.data[0]
        except Exception as e:
            logger.error(f"Error creating parent invitation: {e}")
            raise

    def get_pending_invitations(self, parent_email: str) -> List[Dict[str, Any]]:
        """
        Get all pending invitations for a parent email.

        Args:
            parent_email: Parent's email address

        Returns:
            List of pending invitations with student details
        """
        try:
            result = self.client.table('parent_invitations')\
                .select('*, student:student_id(id, display_name, first_name, last_name, avatar_url)')\
                .eq('parent_email', parent_email)\
                .eq('status', 'pending')\
                .gt('expires_at', datetime.utcnow().isoformat())\
                .order('created_at', desc=True)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching pending invitations for {parent_email}: {e}")
            return []

    def approve_invitation(self, invitation_id: str, parent_id: str) -> Dict[str, Any]:
        """
        Approve a parent invitation (parent accepts student's invite).

        Args:
            invitation_id: Invitation ID
            parent_id: Parent user ID

        Returns:
            Created parent-student link record
        """
        try:
            # Get invitation
            invitation = self.client.table('parent_invitations')\
                .select('*')\
                .eq('id', invitation_id)\
                .eq('status', 'pending')\
                .single()\
                .execute()

            if not invitation.data:
                raise NotFoundError("Invitation not found or already processed")

            invitation_data = invitation.data

            # Check expiration
            if datetime.fromisoformat(invitation_data['expires_at']) < datetime.utcnow():
                raise ValueError("Invitation has expired")

            # Create parent-student link
            link_data = {
                'parent_id': parent_id,
                'student_id': invitation_data['student_id'],
                'linked_at': datetime.utcnow().isoformat()
            }

            link_result = self.client.table(self.table_name)\
                .insert(link_data)\
                .execute()

            if not link_result.data:
                raise ValueError("Failed to create parent-student link")

            # Update invitation status
            self.client.table('parent_invitations')\
                .update({'status': 'approved'})\
                .eq('id', invitation_id)\
                .execute()

            logger.info(f"Approved parent invitation {invitation_id}, created link for parent {parent_id}")
            return link_result.data[0]
        except Exception as e:
            logger.error(f"Error approving parent invitation {invitation_id}: {e}")
            raise

    def decline_invitation(self, invitation_id: str) -> bool:
        """
        Decline a parent invitation.

        Args:
            invitation_id: Invitation ID

        Returns:
            True if declined successfully
        """
        try:
            result = self.client.table('parent_invitations')\
                .update({'status': 'declined'})\
                .eq('id', invitation_id)\
                .execute()

            logger.info(f"Declined parent invitation {invitation_id}")
            return True
        except Exception as e:
            logger.error(f"Error declining parent invitation {invitation_id}: {e}")
            raise

    def cancel_invitation(self, invitation_id: str, student_id: str) -> bool:
        """
        Cancel a parent invitation (student cancels before parent accepts).

        Args:
            invitation_id: Invitation ID
            student_id: Student user ID (for permission check)

        Returns:
            True if canceled successfully

        Raises:
            PermissionError: If user is not the student who sent the invitation
        """
        try:
            invitation = self.client.table('parent_invitations')\
                .select('*')\
                .eq('id', invitation_id)\
                .single()\
                .execute()

            if not invitation.data:
                raise NotFoundError("Invitation not found")

            if invitation.data['student_id'] != student_id:
                raise PermissionError("Only the student who sent the invitation can cancel it")

            result = self.client.table('parent_invitations')\
                .delete()\
                .eq('id', invitation_id)\
                .execute()

            logger.info(f"Canceled parent invitation {invitation_id}")
            return True
        except Exception as e:
            logger.error(f"Error canceling parent invitation {invitation_id}: {e}")
            raise

    def get_student_invitations(self, student_id: str) -> List[Dict[str, Any]]:
        """
        Get all invitations sent by a student.

        Args:
            student_id: Student user ID

        Returns:
            List of invitations
        """
        try:
            result = self.client.table('parent_invitations')\
                .select('*')\
                .eq('student_id', student_id)\
                .order('created_at', desc=True)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching invitations for student {student_id}: {e}")
            return []
