"""
Notification service for managing user notifications.

Handles notification creation, retrieval, marking as read, and real-time delivery
via Supabase Realtime Broadcast and Web Push notifications.
"""

import requests
from services.base_service import BaseService
from typing import Dict, List, Optional, Any
from utils.logger import get_logger
from app_config import Config

logger = get_logger(__name__)

# Notification types that should trigger push notifications
PUSH_NOTIFICATION_TYPES = {'message_received'}


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

        # Setup Realtime broadcast endpoint
        self._realtime_url = f"{Config.SUPABASE_URL}/realtime/v1/api/broadcast"
        self._realtime_headers = {
            'apikey': Config.SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
        }

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

            notification = result.data[0] if result.data else {}

            # Broadcast via Supabase Realtime for instant delivery
            if notification:
                self._broadcast_realtime(user_id, notification)

            # Send push notification for supported types (message_received, etc.)
            if notification and notification_type in PUSH_NOTIFICATION_TYPES:
                self._send_push_notification(
                    user_id=user_id,
                    title=title,
                    message=message,
                    url=link
                )

            logger.info(f"Created notification for user {user_id[:8]}: {notification_type}")
            return notification

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

    def _send_push_notification(
        self,
        user_id: str,
        title: str,
        message: str,
        url: Optional[str] = None
    ) -> bool:
        """
        Send a Web Push notification for supported notification types.

        This is used for message_received notifications to alert users
        even when the app is backgrounded or closed.

        Args:
            user_id: Target user ID
            title: Notification title
            message: Notification body
            url: Optional URL to open when clicked

        Returns:
            True if any push was sent successfully, False otherwise
        """
        try:
            from services.push_notification_service import PushNotificationService

            push_service = PushNotificationService(supabase=self.supabase)

            if not push_service.is_configured():
                logger.debug("Push notifications not configured, skipping")
                return False

            result = push_service.send_push_notification(
                user_id=user_id,
                title=title,
                body=message,
                url=url
            )

            return result.get('sent', 0) > 0

        except ImportError:
            logger.debug("Push notification service not available")
            return False
        except Exception as e:
            # Don't fail notification creation if push fails
            logger.warning(f"Push notification failed for user {user_id[:8]}: {str(e)}")
            return False

    def _broadcast_realtime(self, user_id: str, notification: Dict[str, Any]) -> bool:
        """
        Broadcast a notification via Supabase Realtime for instant delivery.

        Uses Supabase Realtime Broadcast API to push notifications to connected
        frontend clients. Each user has their own channel: 'notifications:{user_id}'

        Args:
            user_id: Target user ID
            notification: The notification data to broadcast

        Returns:
            True if broadcast succeeded, False otherwise
        """
        try:
            # Channel name format: notifications:{user_id}
            channel_topic = f"notifications:{user_id}"

            payload = {
                'messages': [{
                    'topic': channel_topic,
                    'event': 'new_notification',
                    'payload': notification
                }]
            }

            response = requests.post(
                self._realtime_url,
                json=payload,
                headers=self._realtime_headers,
                timeout=5  # Don't block for too long
            )

            if response.status_code == 202:
                logger.debug(f"Broadcast notification to channel {channel_topic}")
                return True
            else:
                logger.warning(
                    f"Realtime broadcast returned status {response.status_code}: {response.text}"
                )
                return False

        except requests.exceptions.Timeout:
            logger.warning(f"Realtime broadcast timed out for user {user_id[:8]}")
            return False
        except Exception as e:
            # Don't fail the notification creation if broadcast fails
            logger.warning(f"Realtime broadcast failed for user {user_id[:8]}: {str(e)}")
            return False

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
