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

    def delete_all_notifications(self, user_id: str) -> int:
        """
        Delete all notifications for a user.

        Args:
            user_id: User ID

        Returns:
            Number of notifications deleted
        """
        try:
            result = self.supabase.table('notifications')\
                .delete()\
                .eq('user_id', user_id)\
                .execute()

            count = len(result.data) if result.data else 0
            logger.info(f"Deleted {count} notifications for user {user_id[:8]}")
            return count

        except Exception as e:
            logger.error(f"Error deleting all notifications: {str(e)}")
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
        organization_id: Optional[str] = None,
        full_content: Optional[str] = None,
        author_name: Optional[str] = None
    ):
        """Send notification for new announcement."""
        metadata = {'announcement_id': announcement_id}
        if full_content:
            metadata['full_content'] = full_content
        if author_name:
            metadata['author_name'] = author_name

        return self.create_notification(
            user_id=user_id,
            notification_type='announcement',
            title='New Announcement',
            message=announcement_title,
            link='/notifications',
            metadata=metadata,
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

    def broadcast_notification(
        self,
        sender_id: str,
        organization_id: str,
        title: str,
        message: str,
        target_audience: List[str]
    ) -> Dict[str, Any]:
        """
        Broadcast a notification to multiple users based on audience filtering.

        Args:
            sender_id: ID of the user sending the notification
            organization_id: Organization to broadcast to
            title: Notification title
            message: Full message content (supports markdown)
            target_audience: List of audiences ['students', 'parents', 'advisors', 'all']

        Returns:
            Dict with count of notifications sent and sender info
        """
        try:
            # Get sender info for metadata
            sender_result = self.supabase.table('users')\
                .select('display_name, email')\
                .eq('id', sender_id)\
                .single()\
                .execute()

            sender_name = sender_result.data.get('display_name') or sender_result.data.get('email', 'Unknown')

            # Build query for target users
            query = self.supabase.table('users')\
                .select('id')\
                .eq('organization_id', organization_id)\
                .neq('id', sender_id)  # Don't notify sender

            # Filter by role based on target audience
            if 'all' not in target_audience:
                role_mapping = {
                    'students': 'student',
                    'parents': 'parent',
                    'advisors': 'advisor'
                }
                roles_to_include = [role_mapping[a] for a in target_audience if a in role_mapping]
                if roles_to_include:
                    query = query.in_('role', roles_to_include)

            result = query.execute()
            users = result.data or []

            # Create notifications for each user
            notifications_created = 0
            for user in users:
                try:
                    self.create_notification(
                        user_id=user['id'],
                        notification_type='announcement',
                        title=title,
                        message=message[:200] + '...' if len(message) > 200 else message,
                        link='/notifications',
                        metadata={
                            'full_content': message,
                            'target_audience': target_audience,
                            'author_id': sender_id,
                            'author_name': sender_name
                        },
                        organization_id=organization_id
                    )
                    notifications_created += 1
                except Exception as e:
                    logger.error(f"Failed to create notification for user {user['id']}: {str(e)}")
                    continue

            logger.info(f"Broadcast notification sent to {notifications_created} users in org {organization_id[:8]}")
            return {
                'success': True,
                'notifications_sent': notifications_created,
                'target_audience': target_audience
            }

        except Exception as e:
            logger.error(f"Error broadcasting notification: {str(e)}")
            raise
