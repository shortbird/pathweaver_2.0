"""
FCM Notification Service - Firebase Cloud Messaging for mobile push notifications.

Separate from the existing push_notification_service.py (which handles Web Push).
This service handles FCM token management and mobile push delivery.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime, timezone
from services.base_service import BaseService, ValidationError
from utils.logger import get_logger

logger = get_logger(__name__)

MAX_DAILY_NOTIFICATIONS = 5


class FCMNotificationService(BaseService):
    """Service for sending mobile push notifications via Firebase Cloud Messaging."""

    def __init__(self):
        super().__init__()
        self._firebase_app = None

    def _ensure_firebase(self):
        """Lazy-initialize Firebase Admin SDK."""
        if self._firebase_app is None:
            try:
                import firebase_admin
                from firebase_admin import credentials
                from app_config import Config

                cred = credentials.Certificate(Config.FIREBASE_SERVICE_ACCOUNT_PATH)
                self._firebase_app = firebase_admin.initialize_app(cred)
            except Exception as e:
                logger.error(f"Firebase initialization failed: {e}")
                raise

    def register_device_token(self, user_id: str, token: str, platform: str, device_name: Optional[str] = None) -> Dict[str, Any]:
        """Register or update a device token for push notifications."""
        if platform not in ('ios', 'android'):
            raise ValidationError(f"Invalid platform: {platform}. Must be 'ios' or 'android'")

        try:
            from database import get_supabase_admin_client
            supabase = get_supabase_admin_client()

            response = supabase.table('device_tokens').upsert({
                'user_id': user_id,
                'token': token,
                'platform': platform,
                'device_name': device_name,
                'is_active': True,
                'last_used_at': datetime.now(timezone.utc).isoformat(),
            }, on_conflict='user_id,token').execute()

            return response.data[0] if response.data else {}

        except Exception as e:
            logger.error(f"Error registering device token for user {user_id[:8]}: {e}")
            raise

    def deactivate_token(self, user_id: str, token: str):
        """Deactivate a device token (logout)."""
        try:
            from database import get_supabase_admin_client
            supabase = get_supabase_admin_client()
            supabase.table('device_tokens').update({
                'is_active': False,
            }).eq('user_id', user_id).eq('token', token).execute()
        except Exception as e:
            logger.error(f"Error deactivating token for user {user_id[:8]}: {e}")

    def send_notification(self, user_id: str, title: str, body: str, data: Optional[Dict] = None):
        """Send push notification to all active mobile devices for a user."""
        try:
            self._ensure_firebase()
            from firebase_admin import messaging
            from database import get_supabase_admin_client

            supabase = get_supabase_admin_client()
            tokens_response = (
                supabase.table('device_tokens')
                .select('token')
                .eq('user_id', user_id)
                .eq('is_active', True)
                .execute()
            )

            if not tokens_response.data:
                logger.debug(f"No active mobile tokens for user {user_id[:8]}")
                return

            tokens = [t['token'] for t in tokens_response.data]

            message = messaging.MulticastMessage(
                notification=messaging.Notification(title=title, body=body),
                data=data or {},
                tokens=tokens,
            )

            response = messaging.send_each_for_multicast(message)
            logger.info(f"FCM push sent to user {user_id[:8]}: {response.success_count}/{len(tokens)} delivered")

            # Deactivate failed tokens (invalid/expired)
            for idx, send_response in enumerate(response.responses):
                if send_response.exception:
                    self.deactivate_token(user_id, tokens[idx])

        except Exception as e:
            logger.error(f"Error sending FCM push to user {user_id[:8]}: {e}")
