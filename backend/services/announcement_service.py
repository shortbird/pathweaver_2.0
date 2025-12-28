"""
Announcement Service - Manages announcement-specific functionality
Handles announcement creation, distribution, and notification logic
"""

import sys
from datetime import datetime
from typing import Dict, List, Optional, Any
from services.base_service import BaseService
from database import get_supabase_admin_client
from repositories.announcement_repository import AnnouncementRepository
from repositories.user_repository import UserRepository

from utils.logger import get_logger

logger = get_logger(__name__)


class AnnouncementService(BaseService):
    """Service for announcement-specific operations"""

    MAX_PINNED_ANNOUNCEMENTS = 3

    def __init__(self):
        super().__init__()
        self.supabase = get_supabase_admin_client()
        self.announcement_repo = AnnouncementRepository()
        self.user_repo = UserRepository()

    # ==================== Announcement CRUD ====================

    def create_announcement(
        self,
        author_id: str,
        organization_id: str,
        title: str,
        message: str,
        target_audience: List[str],
        pinned: bool = False,
        send_notifications: bool = True
    ) -> Dict[str, Any]:
        """
        Create a new announcement.

        Args:
            author_id: UUID of the author (advisor, admin, or superadmin)
            organization_id: UUID of the organization
            title: Announcement title
            message: Announcement message (markdown supported)
            target_audience: List of audience types (e.g., ['students', 'all'])
            pinned: Whether to pin the announcement
            send_notifications: Whether to send email/in-app notifications

        Returns:
            Created announcement record

        Raises:
            ValueError: If validation fails (e.g., too many pinned announcements)
        """
        try:
            # Validate pinned count
            if pinned:
                pinned_count = self.announcement_repo.get_pinned_count(organization_id)
                if pinned_count >= self.MAX_PINNED_ANNOUNCEMENTS:
                    raise ValueError(
                        f"Maximum {self.MAX_PINNED_ANNOUNCEMENTS} pinned announcements allowed. "
                        "Please unpin an existing announcement first."
                    )

            # Create announcement
            announcement_data = {
                'author_id': author_id,
                'organization_id': organization_id,
                'title': title,
                'message': message,
                'target_audience': target_audience,
                'pinned': pinned
            }

            announcement = self.announcement_repo.create_announcement(announcement_data)

            # Send notifications if requested
            if send_notifications:
                self._send_announcement_notifications(announcement, organization_id, target_audience)

            logger.info(f"Announcement created: {announcement['id']} by {author_id}")

            return announcement

        except Exception as e:
            import traceback
            print(f"Error creating announcement: {str(e)}", file=sys.stderr, flush=True)
            print(f"Traceback: {traceback.format_exc()}", file=sys.stderr, flush=True)
            raise

    def get_announcement(self, announcement_id: str) -> Optional[Dict[str, Any]]:
        """
        Get an announcement by ID.

        Args:
            announcement_id: UUID of the announcement

        Returns:
            Announcement record or None if not found
        """
        try:
            return self.announcement_repo.get_announcement_by_id(announcement_id)
        except Exception as e:
            import traceback
            print(f"Error fetching announcement: {str(e)}", file=sys.stderr, flush=True)
            print(f"Traceback: {traceback.format_exc()}", file=sys.stderr, flush=True)
            raise

    def list_announcements(
        self,
        organization_id: str,
        user_role: Optional[str] = None,
        pinned_only: bool = False,
        limit: int = 20,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        List announcements for an organization filtered by user role.

        Args:
            organization_id: UUID of the organization
            user_role: Role of the requesting user (filters target_audience)
            pinned_only: Only return pinned announcements
            limit: Maximum number of results
            offset: Offset for pagination

        Returns:
            List of announcement records
        """
        try:
            # Map role to target_audience
            audience_filter = None
            if user_role == 'student':
                audience_filter = 'students'
            elif user_role in ['advisor', 'school_admin', 'superadmin']:
                # Admins/advisors see all announcements
                audience_filter = None
            elif user_role == 'parent':
                audience_filter = 'parents'

            announcements = self.announcement_repo.list_announcements(
                organization_id=organization_id,
                target_audience=audience_filter,
                pinned_only=pinned_only,
                limit=limit,
                offset=offset
            )

            return announcements

        except Exception as e:
            import traceback
            print(f"Error listing announcements: {str(e)}", file=sys.stderr, flush=True)
            print(f"Traceback: {traceback.format_exc()}", file=sys.stderr, flush=True)
            raise

    def update_announcement(
        self,
        announcement_id: str,
        author_id: str,
        updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update an announcement (only author can update).

        Args:
            announcement_id: UUID of the announcement
            author_id: UUID of the requesting user
            updates: Dictionary of fields to update

        Returns:
            Updated announcement record

        Raises:
            PermissionError: If user is not the author
        """
        try:
            # Verify author
            announcement = self.announcement_repo.get_announcement_by_id(announcement_id)
            if not announcement:
                raise ValueError("Announcement not found")

            if announcement['author_id'] != author_id:
                raise PermissionError("Only the author can update this announcement")

            # Validate pinned count if pinning
            if updates.get('pinned') and not announcement['pinned']:
                pinned_count = self.announcement_repo.get_pinned_count(announcement['organization_id'])
                if pinned_count >= self.MAX_PINNED_ANNOUNCEMENTS:
                    raise ValueError(
                        f"Maximum {self.MAX_PINNED_ANNOUNCEMENTS} pinned announcements allowed. "
                        "Please unpin an existing announcement first."
                    )

            return self.announcement_repo.update_announcement(announcement_id, updates)

        except Exception as e:
            import traceback
            print(f"Error updating announcement: {str(e)}", file=sys.stderr, flush=True)
            print(f"Traceback: {traceback.format_exc()}", file=sys.stderr, flush=True)
            raise

    def delete_announcement(self, announcement_id: str, user_id: str, user_role: str) -> bool:
        """
        Delete an announcement.

        Args:
            announcement_id: UUID of the announcement
            user_id: UUID of the requesting user
            user_role: Role of the requesting user

        Returns:
            True if deleted successfully

        Raises:
            PermissionError: If user lacks permission
        """
        try:
            # Verify author or admin
            announcement = self.announcement_repo.get_announcement_by_id(announcement_id)
            if not announcement:
                raise ValueError("Announcement not found")

            # Only author or superadmin/school_admin can delete
            is_author = announcement['author_id'] == user_id
            is_admin = user_role in ['school_admin', 'superadmin']

            if not (is_author or is_admin):
                raise PermissionError("You do not have permission to delete this announcement")

            return self.announcement_repo.delete_announcement(announcement_id)

        except Exception as e:
            import traceback
            print(f"Error deleting announcement: {str(e)}", file=sys.stderr, flush=True)
            print(f"Traceback: {traceback.format_exc()}", file=sys.stderr, flush=True)
            raise

    # ==================== Helper Methods ====================

    def _send_announcement_notifications(
        self,
        announcement: Dict[str, Any],
        organization_id: str,
        target_audience: List[str]
    ) -> None:
        """
        Send notifications for a new announcement.

        Args:
            announcement: Announcement record
            organization_id: UUID of the organization
            target_audience: List of audience types
        """
        try:
            # Get recipients based on target audience
            recipients = self._get_announcement_recipients(organization_id, target_audience)

            # TODO: Implement actual notification sending via email service
            # For now, just log
            logger.info(
                f"Would send announcement notification to {len(recipients)} users "
                f"for announcement {announcement['id']}"
            )

            # In production, integrate with email service:
            # from services.email_service import EmailService
            # email_service = EmailService()
            # for recipient in recipients:
            #     email_service.send_templated_email(
            #         template_name='announcement_notification',
            #         to_email=recipient['email'],
            #         context={
            #             'title': announcement['title'],
            #             'message': announcement['message'],
            #             'author_name': announcement.get('author', {}).get('display_name'),
            #             'announcement_url': f"{frontend_url}/communication"
            #         }
            #     )

        except Exception as e:
            # Don't fail announcement creation if notifications fail
            logger.error(f"Error sending announcement notifications: {e}")

    def _get_announcement_recipients(
        self,
        organization_id: str,
        target_audience: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Get list of users who should receive this announcement.

        Args:
            organization_id: UUID of the organization
            target_audience: List of audience types

        Returns:
            List of user records
        """
        try:
            # Build role filter
            roles = []
            if 'all' in target_audience:
                roles = ['student', 'advisor', 'parent', 'school_admin']
            else:
                if 'students' in target_audience:
                    roles.append('student')
                if 'advisors' in target_audience:
                    roles.append('advisor')
                if 'parents' in target_audience:
                    roles.append('parent')

            # Query users
            response = (
                self.supabase.table('users')
                .select('id, email, display_name, role')
                .eq('organization_id', organization_id)
                .in_('role', roles)
                .execute()
            )

            return response.data or []

        except Exception as e:
            logger.error(f"Error fetching announcement recipients: {e}")
            return []
