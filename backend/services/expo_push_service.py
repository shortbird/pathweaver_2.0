"""
Expo Push Notification Service.

Sends push notifications to mobile devices via the Expo Push API.
Uses the device_tokens table (shared with FCM service) to store Expo push tokens.
"""

import requests
from typing import Dict, List, Optional, Any
from services.base_service import BaseService
from utils.logger import get_logger

logger = get_logger(__name__)

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'


class ExpoPushService(BaseService):
    """Sends push notifications via Expo's push service."""

    def __init__(self, supabase=None):
        super().__init__()
        if supabase:
            self.supabase = supabase
        else:
            from database import get_supabase_admin_client
            self.supabase = get_supabase_admin_client()

    def send_notification(
        self,
        user_id: str,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Send push notification to all active Expo tokens for a user.

        Args:
            user_id: Target user ID
            title: Notification title
            body: Notification body text
            data: Optional data payload (e.g., {'url': '/quests'})

        Returns:
            Dict with sent/failed counts
        """
        try:
            # Get active Expo tokens (platform is ios/android from Expo registration)
            result = self.supabase.table('device_tokens')\
                .select('id, token')\
                .eq('user_id', user_id)\
                .eq('is_active', True)\
                .execute()

            tokens = result.data or []

            # Filter to Expo push tokens (start with ExponentPushToken)
            expo_tokens = [t for t in tokens if t['token'].startswith('ExponentPushToken')]

            if not expo_tokens:
                return {'sent': 0, 'failed': 0}

            # Build messages
            messages = []
            for t in expo_tokens:
                msg = {
                    'to': t['token'],
                    'sound': 'default',
                    'title': title,
                    'body': body,
                    'channelId': 'default',
                }
                if data:
                    msg['data'] = data
                messages.append(msg)

            # Send via Expo Push API
            response = requests.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                timeout=10,
            )

            sent = 0
            failed = 0
            expired_ids = []

            if response.status_code == 200:
                resp_data = response.json().get('data', [])
                for idx, ticket in enumerate(resp_data):
                    if ticket.get('status') == 'ok':
                        sent += 1
                    else:
                        failed += 1
                        # If token is invalid, mark for deactivation
                        details = ticket.get('details', {})
                        if details.get('error') in ('DeviceNotRegistered', 'InvalidCredentials'):
                            expired_ids.append(expo_tokens[idx]['id'])
            else:
                logger.warning(f"Expo Push API returned {response.status_code}: {response.text[:200]}")
                failed = len(expo_tokens)

            # Deactivate expired tokens
            if expired_ids:
                for token_id in expired_ids:
                    try:
                        self.supabase.table('device_tokens')\
                            .update({'is_active': False})\
                            .eq('id', token_id)\
                            .execute()
                    except Exception:
                        pass
                logger.info(f"Deactivated {len(expired_ids)} expired Expo tokens")

            logger.info(f"Expo push to user {user_id[:8]}: {sent} sent, {failed} failed")
            return {'sent': sent, 'failed': failed}

        except requests.exceptions.Timeout:
            logger.warning(f"Expo Push API timeout for user {user_id[:8]}")
            return {'sent': 0, 'failed': 0, 'error': 'timeout'}
        except Exception as e:
            logger.error(f"Error sending Expo push to user {user_id[:8]}: {e}")
            return {'sent': 0, 'failed': 0, 'error': str(e)}
