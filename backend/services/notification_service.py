"""
Notification service for managing user notifications.

Handles notification creation, retrieval, and marking as read.
"""

from services.base_service import BaseService
from typing import Dict, List, Optional, Any
from utils.logger import get_logger

logger = get_logger(__name__)


class NotificationService(BaseService):
    """Manages user notifications."""

    def __init__(self, supabase=None):
        """Initialize with optional supabase client."""
        super().__init__()
        if supabase:
            self.supabase = supabase
        else:
            from database import get_supabase_admin_client
            self.supabase = get_supabase_admin_client()

    def create_notification(
        self,
        user_id: str,
        notification_type: str,
        title: str,
        message: str,
        link: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        organization_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a notification for a user.

        Args:
            user_id: Target user ID
            notification_type: Type of notification
            title: Notification title
            message: Notification message
            link: Optional URL to navigate to
            metadata: Optional additional data
            organization_id: Optional organization ID

        Returns:
            Created notification record
        """
        try:
            notification_data = {
                'user_id': user_id,
                'type': notification_type,
                'title': title,
                'message': message,
                'is_read': False
            }

            if link:
                notification_data['link'] = link

            if metadata:
                notification_data['metadata'] = metadata

            if organization_id:
                notification_data['organization_id'] = organization_id

            result = self.supabase.table('notifications')\
                .insert(notification_data)\
                .execute()

            logger.info(f"Created notification for user {user_id[:8]}: {notification_type}")
            return result.data[0] if result.data else {}

        except Exception as e:
            logger.error(f"Error creating notification: {str(e)}")
            raise

    def get_user_notifications(
        self,
        user_id: str,
        limit: int = 50,
        unread_only: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Get notifications for a user.

        Args:
            user_id: User ID
            limit: Maximum notifications to return
            unread_only: Only return unread notifications

        Returns:
            List of notification records
        """
        try:
            query = self.supabase.table('notifications')\
                .select('*')\
                .eq('user_id', user_id)

            if unread_only:
                query = query.eq('is_read', False)

            query = query.order('created_at', desc=True)\
                .limit(limit)

            result = query.execute()
            return result.data or []

        except Exception as e:
            logger.error(f"Error fetching notifications: {str(e)}")
            raise

    def get_unread_count(self, user_id: str) -> int:
        """
        Get count of unread notifications for a user.

        Args:
            user_id: User ID

        Returns:
            Number of unread notifications
        """
        try:
            result = self.supabase.table('notifications')\
                .select('id', count='exact')\
                .eq('user_id', user_id)\
                .eq('is_read', False)\
                .execute()

            return result.count or 0

        except Exception as e:
            logger.error(f"Error fetching unread count: {str(e)}")
            raise

    def mark_as_read(self, notification_id: str, user_id: str) -> bool:
        """
        Mark a notification as read.

        Args:
            notification_id: Notification ID
            user_id: User ID (for verification)

        Returns:
            True if successful
        """
        try:
            result = self.supabase.table('notifications')\
                .update({'is_read': True})\
                .eq('id', notification_id)\
                .eq('user_id', user_id)\
                .execute()

            logger.info(f"Marked notification {notification_id[:8]} as read")
            return True

        except Exception as e:
            logger.error(f"Error marking notification as read: {str(e)}")
            raise

    def mark_all_as_read(self, user_id: str) -> int:
        """
        Mark all notifications as read for a user.

        Args:
            user_id: User ID

        Returns:
            Number of notifications updated
        """
        try:
            result = self.supabase.table('notifications')\
                .update({'is_read': True})\
                .eq('user_id', user_id)\
                .eq('is_read', False)\
                .execute()

            count = len(result.data) if result.data else 0
            logger.info(f"Marked {count} notifications as read for user {user_id[:8]}")
            return count

        except Exception as e:
            logger.error(f"Error marking all notifications as read: {str(e)}")
            raise

    def delete_notification(self, notification_id: str, user_id: str) -> bool:
        """
        Delete a notification.

        Args:
            notification_id: Notification ID
            user_id: User ID (for verification)

        Returns:
            True if successful
        """
        try:
            self.supabase.table('notifications')\
                .delete()\
                .eq('id', notification_id)\
                .eq('user_id', user_id)\
                .execute()

            logger.info(f"Deleted notification {notification_id[:8]}")
            return True

        except Exception as e:
            logger.error(f"Error deleting notification: {str(e)}")
            raise

    # Notification trigger helpers
    def notify_quest_invitation(
        self,
        user_id: str,
        quest_title: str,
        advisor_name: str,
        quest_id: str,
        organization_id: Optional[str] = None
    ):
        """Send notification when user is invited to a quest."""
        return self.create_notification(
            user_id=user_id,
            notification_type='quest_invitation',
            title='Quest Invitation',
            message=f'{advisor_name} invited you to "{quest_title}"',
            link=f'/invitations',
            metadata={'quest_id': quest_id, 'advisor_name': advisor_name},
            organization_id=organization_id
        )

    def notify_task_approved(
        self,
        user_id: str,
        task_title: str,
        xp_awarded: int,
        task_id: str,
        organization_id: Optional[str] = None
    ):
        """Send notification when task is approved."""
        return self.create_notification(
            user_id=user_id,
            notification_type='task_approved',
            title='Task Approved!',
            message=f'Your task "{task_title}" was approved! +{xp_awarded} XP',
            link=f'/quests',
            metadata={'task_id': task_id, 'xp_awarded': xp_awarded},
            organization_id=organization_id
        )

    def notify_task_revision_requested(
        self,
        user_id: str,
        task_title: str,
        task_id: str,
        organization_id: Optional[str] = None
    ):
        """Send notification when task revision is requested."""
        return self.create_notification(
            user_id=user_id,
            notification_type='task_revision_requested',
            title='Revision Requested',
            message=f'Your advisor requested revisions on "{task_title}"',
            link=f'/quests',
            metadata={'task_id': task_id},
            organization_id=organization_id
        )

    def notify_announcement(
        self,
        user_id: str,
        announcement_title: str,
        announcement_id: str,
        organization_id: Optional[str] = None
    ):
        """Send notification for new announcement."""
        return self.create_notification(
            user_id=user_id,
            notification_type='announcement',
            title='New Announcement',
            message=announcement_title,
            link=f'/announcements',
            metadata={'announcement_id': announcement_id},
            organization_id=organization_id
        )

    def notify_observer_comment(
        self,
        user_id: str,
        observer_name: str,
        comment_preview: str,
        organization_id: Optional[str] = None
    ):
        """Send notification for observer comment."""
        return self.create_notification(
            user_id=user_id,
            notification_type='observer_comment',
            title=f'Comment from {observer_name}',
            message=comment_preview[:100],
            link=f'/connections',
            organization_id=organization_id
        )

    def notify_badge_earned(
        self,
        user_id: str,
        badge_name: str,
        badge_id: str,
        organization_id: Optional[str] = None
    ):
        """Send notification when badge is earned."""
        return self.create_notification(
            user_id=user_id,
            notification_type='badge_earned',
            title='Badge Earned!',
            message=f'You earned the "{badge_name}" badge!',
            link=f'/badges',
            metadata={'badge_id': badge_id},
            organization_id=organization_id
        )

    def notify_parent_approval_required(
        self,
        parent_user_id: str,
        student_name: str,
        student_id: str,
        organization_id: Optional[str] = None
    ):
        """Send notification when child requests public portfolio visibility (FERPA compliance)."""
        return self.create_notification(
            user_id=parent_user_id,
            notification_type='parent_approval_required',
            title='Portfolio Approval Requested',
            message=f'{student_name} wants to make their portfolio public and needs your approval.',
            link='/parent-dashboard',
            metadata={'student_id': student_id},
            organization_id=organization_id
        )
