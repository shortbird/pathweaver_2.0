"""
Push Notification Service for Web Push API.

Handles sending push notifications to subscribed browser endpoints using
the Web Push protocol and pywebpush library.
"""

import json
from typing import Dict, List, Optional, Any
from pywebpush import webpush, WebPushException
from services.base_service import BaseService
from utils.logger import get_logger
from app_config import Config

logger = get_logger(__name__)


class PushNotificationService(BaseService):
    """Manages Web Push notification delivery."""

    def __init__(self, supabase=None):
        """Initialize with optional supabase client."""
        super().__init__()
        if supabase:
            self.supabase = supabase
        else:
            from database import get_supabase_admin_client
            self.supabase = get_supabase_admin_client()

        # VAPID configuration
        self.vapid_private_key = Config.VAPID_PRIVATE_KEY
        self.vapid_claims = {
            'sub': Config.VAPID_MAILTO
        }

    def is_configured(self) -> bool:
        """Check if VAPID keys are configured."""
        return bool(Config.VAPID_PUBLIC_KEY and Config.VAPID_PRIVATE_KEY)

    def send_push_notification(
        self,
        user_id: str,
        title: str,
        body: str,
        url: Optional[str] = None,
        data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Send a push notification to all subscribed devices for a user.

        Args:
            user_id: Target user ID
            title: Notification title
            body: Notification body text
            url: Optional URL to open when notification is clicked
            data: Optional additional data to include in the notification

        Returns:
            Dict with success count, failure count, and any errors
        """
        if not self.is_configured():
            logger.warning("Push notifications not configured - missing VAPID keys")
            return {
                'success': False,
                'sent': 0,
                'failed': 0,
                'error': 'Push notifications not configured'
            }

        try:
            # Get all push subscriptions for this user
            result = self.supabase.table('push_subscriptions')\
                .select('*')\
                .eq('user_id', user_id)\
                .execute()

            subscriptions = result.data or []

            if not subscriptions:
                logger.debug(f"No push subscriptions for user {user_id[:8]}")
                return {
                    'success': True,
                    'sent': 0,
                    'failed': 0,
                    'message': 'No subscriptions found'
                }

            # Build notification payload
            payload = {
                'title': title,
                'body': body,
                'icon': '/apple-touch-icon.png',
                'badge': '/favicon-192x192.png',
                'tag': 'optio-notification',
                'renotify': True,
                'requireInteraction': False
            }

            if url:
                payload['data'] = {'url': url}

            if data:
                payload['data'] = {**(payload.get('data', {})), **data}

            payload_str = json.dumps(payload)

            # Send to all subscriptions
            sent_count = 0
            failed_count = 0
            expired_endpoints = []

            for sub in subscriptions:
                try:
                    subscription_info = {
                        'endpoint': sub['endpoint'],
                        'keys': {
                            'p256dh': sub['p256dh'],
                            'auth': sub['auth']
                        }
                    }

                    webpush(
                        subscription_info=subscription_info,
                        data=payload_str,
                        vapid_private_key=self.vapid_private_key,
                        vapid_claims=self.vapid_claims
                    )

                    sent_count += 1

                    # Update last_used_at
                    self.supabase.table('push_subscriptions')\
                        .update({'last_used_at': 'now()'})\
                        .eq('id', sub['id'])\
                        .execute()

                except WebPushException as e:
                    failed_count += 1
                    logger.warning(f"Push failed for subscription {sub['id'][:8]}: {e}")

                    # If subscription is expired or invalid (410 Gone), mark for removal
                    if e.response and e.response.status_code == 410:
                        expired_endpoints.append(sub['id'])
                    elif e.response and e.response.status_code == 404:
                        expired_endpoints.append(sub['id'])

                except Exception as e:
                    failed_count += 1
                    logger.error(f"Unexpected error sending push to {sub['id'][:8]}: {e}")

            # Clean up expired subscriptions
            if expired_endpoints:
                self._cleanup_expired_subscriptions(expired_endpoints)

            logger.info(
                f"Push notifications for user {user_id[:8]}: "
                f"{sent_count} sent, {failed_count} failed"
            )

            return {
                'success': True,
                'sent': sent_count,
                'failed': failed_count,
                'cleaned_up': len(expired_endpoints)
            }

        except Exception as e:
            logger.error(f"Error sending push notifications: {str(e)}")
            return {
                'success': False,
                'sent': 0,
                'failed': 0,
                'error': str(e)
            }

    def _cleanup_expired_subscriptions(self, subscription_ids: List[str]) -> None:
        """Remove expired/invalid push subscriptions."""
        try:
            for sub_id in subscription_ids:
                self.supabase.table('push_subscriptions')\
                    .delete()\
                    .eq('id', sub_id)\
                    .execute()

            logger.info(f"Cleaned up {len(subscription_ids)} expired push subscriptions")

        except Exception as e:
            logger.error(f"Error cleaning up expired subscriptions: {str(e)}")

    def save_subscription(
        self,
        user_id: str,
        endpoint: str,
        p256dh: str,
        auth: str,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Save a new push subscription for a user.

        Args:
            user_id: User ID
            endpoint: Push service endpoint URL
            p256dh: Client public key
            auth: Auth secret
            user_agent: Optional user agent string

        Returns:
            Created subscription record
        """
        try:
            # Check if subscription already exists (by endpoint)
            existing = self.supabase.table('push_subscriptions')\
                .select('id')\
                .eq('endpoint', endpoint)\
                .execute()

            if existing.data:
                # Update existing subscription
                result = self.supabase.table('push_subscriptions')\
                    .update({
                        'user_id': user_id,
                        'p256dh': p256dh,
                        'auth': auth,
                        'user_agent': user_agent,
                        'last_used_at': 'now()'
                    })\
                    .eq('endpoint', endpoint)\
                    .execute()

                logger.info(f"Updated push subscription for user {user_id[:8]}")
            else:
                # Create new subscription
                result = self.supabase.table('push_subscriptions')\
                    .insert({
                        'user_id': user_id,
                        'endpoint': endpoint,
                        'p256dh': p256dh,
                        'auth': auth,
                        'user_agent': user_agent
                    })\
                    .execute()

                logger.info(f"Created push subscription for user {user_id[:8]}")

            return result.data[0] if result.data else {}

        except Exception as e:
            logger.error(f"Error saving push subscription: {str(e)}")
            raise

    def remove_subscription(self, user_id: str, endpoint: str) -> bool:
        """
        Remove a push subscription.

        Args:
            user_id: User ID (for verification)
            endpoint: Push service endpoint URL

        Returns:
            True if removed successfully
        """
        try:
            self.supabase.table('push_subscriptions')\
                .delete()\
                .eq('user_id', user_id)\
                .eq('endpoint', endpoint)\
                .execute()

            logger.info(f"Removed push subscription for user {user_id[:8]}")
            return True

        except Exception as e:
            logger.error(f"Error removing push subscription: {str(e)}")
            raise

    def get_user_subscriptions(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all push subscriptions for a user.

        Args:
            user_id: User ID

        Returns:
            List of subscription records
        """
        try:
            result = self.supabase.table('push_subscriptions')\
                .select('id, endpoint, user_agent, created_at, last_used_at')\
                .eq('user_id', user_id)\
                .order('created_at', desc=True)\
                .execute()

            return result.data or []

        except Exception as e:
            logger.error(f"Error fetching push subscriptions: {str(e)}")
            raise
