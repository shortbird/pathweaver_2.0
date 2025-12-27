"""
Webhook Service - Event-driven notifications for external integrations

Handles webhook delivery for LMS integrations (Canvas, Moodle, Blackboard).
Supports HMAC-SHA256 signature verification, retry logic, and delivery tracking.

Usage:
    from services.webhook_service import WebhookService

    webhook_service = WebhookService()
    webhook_service.emit_event(
        event_type='quest.completed',
        data={'user_id': '123', 'quest_id': '456', 'xp_awarded': 100},
        organization_id='org-789'
    )
"""

import hmac
import hashlib
import json
import secrets
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from uuid import UUID, uuid4

import requests
from flask import current_app

from backend.services.base_service import BaseService
from backend.utils.logger import get_logger

logger = get_logger(__name__)


class WebhookService(BaseService):
    """
    Service for managing and delivering webhooks to external systems.

    Responsibilities:
    - Emit events to registered webhook endpoints
    - Generate HMAC-SHA256 signatures for security
    - Track delivery status and retries
    - Implement exponential backoff for failed deliveries
    """

    def __init__(self, client=None):
        """
        Initialize webhook service.

        Args:
            client: Supabase client (admin client for webhook operations)
        """
        super().__init__(client)
        self.timeout = 10  # Webhook request timeout in seconds
        self.max_attempts = 5  # Maximum retry attempts
        self.base_retry_delay = 60  # Base delay in seconds (exponential backoff)

    def emit_event(
        self,
        event_type: str,
        data: Dict[str, Any],
        organization_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> None:
        """
        Emit event to all registered webhooks for this event type.

        Args:
            event_type: Type of event (e.g., 'quest.completed', 'badge.earned')
            data: Event data payload
            organization_id: Organization ID (for filtering subscriptions)
            user_id: User ID associated with event (for logging)

        Example:
            emit_event(
                event_type='quest.completed',
                data={'user_id': '123', 'quest_id': '456', 'xp_awarded': 100},
                organization_id='org-789'
            )
        """
        try:
            # Build webhook payload
            payload = {
                "event": event_type,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "data": data,
                "organization_id": organization_id
            }

            # Get active subscriptions for this event type and organization
            subscriptions = self._get_subscriptions(event_type, organization_id)

            if not subscriptions:
                logger.debug(
                    f"No webhook subscriptions found for event {event_type} "
                    f"(org: {organization_id})"
                )
                return

            logger.info(
                f"Emitting {event_type} event to {len(subscriptions)} webhook(s) "
                f"(org: {organization_id})"
            )

            # Send webhook to each subscription
            for subscription in subscriptions:
                self._queue_delivery(subscription, payload)

        except Exception as e:
            logger.error(f"Failed to emit webhook event {event_type}: {str(e)}")

    def _get_subscriptions(
        self,
        event_type: str,
        organization_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get active webhook subscriptions for event type and organization.

        Args:
            event_type: Type of event to filter by
            organization_id: Organization ID to filter by (None for all)

        Returns:
            List of webhook subscription dictionaries
        """
        try:
            query = (
                self.client.table('webhook_subscriptions')
                .select('*')
                .eq('event_type', event_type)
                .eq('is_active', True)
            )

            if organization_id:
                query = query.eq('organization_id', organization_id)

            result = query.execute()
            return result.data if result.data else []

        except Exception as e:
            logger.error(f"Failed to fetch webhook subscriptions: {str(e)}")
            return []

    def _queue_delivery(
        self,
        subscription: Dict[str, Any],
        payload: Dict[str, Any]
    ) -> None:
        """
        Queue webhook delivery (or send immediately if synchronous).

        Args:
            subscription: Webhook subscription record
            payload: Event payload to send
        """
        try:
            # Create delivery record
            delivery_id = str(uuid4())

            delivery_record = {
                'id': delivery_id,
                'subscription_id': subscription['id'],
                'event_type': payload['event'],
                'payload': payload,
                'status': 'pending',
                'attempts': 0,
                'created_at': datetime.utcnow().isoformat()
            }

            # Insert delivery record
            self.client.table('webhook_deliveries').insert(delivery_record).execute()

            # Attempt immediate delivery
            self._attempt_delivery(subscription, payload, delivery_id)

        except Exception as e:
            logger.error(f"Failed to queue webhook delivery: {str(e)}")

    def _attempt_delivery(
        self,
        subscription: Dict[str, Any],
        payload: Dict[str, Any],
        delivery_id: str
    ) -> bool:
        """
        Attempt to deliver webhook to target URL.

        Args:
            subscription: Webhook subscription record
            payload: Event payload to send
            delivery_id: Delivery tracking ID

        Returns:
            True if delivery successful, False otherwise
        """
        try:
            # Generate signature
            signature = self._generate_signature(payload, subscription['secret'])

            # Prepare headers
            headers = {
                'Content-Type': 'application/json',
                'X-Optio-Signature': signature,
                'X-Optio-Event': payload['event'],
                'X-Optio-Delivery': delivery_id,
                'User-Agent': 'Optio-Webhooks/1.0'
            }

            # Send webhook
            logger.info(f"Sending webhook to {subscription['target_url']}")
            response = requests.post(
                subscription['target_url'],
                json=payload,
                headers=headers,
                timeout=self.timeout
            )

            # Update delivery record
            self._update_delivery_status(
                delivery_id=delivery_id,
                status='delivered' if response.status_code < 400 else 'failed',
                response_code=response.status_code,
                response_body=response.text[:1000],  # Limit response body size
                attempts=1
            )

            if response.status_code < 400:
                logger.info(
                    f"Webhook delivered successfully to {subscription['target_url']} "
                    f"(status: {response.status_code})"
                )
                return True
            else:
                logger.warning(
                    f"Webhook delivery failed to {subscription['target_url']} "
                    f"(status: {response.status_code})"
                )
                self._schedule_retry(delivery_id, attempts=1)
                return False

        except requests.exceptions.Timeout:
            logger.warning(f"Webhook delivery timed out: {subscription['target_url']}")
            self._update_delivery_status(
                delivery_id=delivery_id,
                status='retrying',
                error_message='Request timeout',
                attempts=1
            )
            self._schedule_retry(delivery_id, attempts=1)
            return False

        except requests.exceptions.RequestException as e:
            logger.error(f"Webhook delivery failed: {str(e)}")
            self._update_delivery_status(
                delivery_id=delivery_id,
                status='retrying',
                error_message=str(e),
                attempts=1
            )
            self._schedule_retry(delivery_id, attempts=1)
            return False

        except Exception as e:
            logger.error(f"Unexpected error during webhook delivery: {str(e)}")
            self._update_delivery_status(
                delivery_id=delivery_id,
                status='failed',
                error_message=str(e),
                attempts=1
            )
            return False

    def _generate_signature(self, payload: Dict[str, Any], secret: str) -> str:
        """
        Generate HMAC-SHA256 signature for webhook payload.

        Args:
            payload: Webhook payload
            secret: Shared secret for signing

        Returns:
            Signature in format "sha256=<hex_digest>"
        """
        payload_bytes = json.dumps(payload, separators=(',', ':')).encode('utf-8')
        signature = hmac.new(
            secret.encode('utf-8'),
            payload_bytes,
            hashlib.sha256
        ).hexdigest()
        return f"sha256={signature}"

    def _update_delivery_status(
        self,
        delivery_id: str,
        status: str,
        response_code: Optional[int] = None,
        response_body: Optional[str] = None,
        error_message: Optional[str] = None,
        attempts: Optional[int] = None
    ) -> None:
        """
        Update webhook delivery status in database.

        Args:
            delivery_id: Delivery record ID
            status: New status ('pending', 'delivered', 'failed', 'retrying')
            response_code: HTTP response code
            response_body: Response body (truncated)
            error_message: Error message if failed
            attempts: Number of attempts made
        """
        try:
            update_data = {
                'status': status,
                'last_attempt_at': datetime.utcnow().isoformat()
            }

            if status == 'delivered':
                update_data['delivered_at'] = datetime.utcnow().isoformat()

            if response_code is not None:
                update_data['response_code'] = response_code

            if response_body is not None:
                update_data['response_body'] = response_body

            if error_message is not None:
                update_data['error_message'] = error_message

            if attempts is not None:
                update_data['attempts'] = attempts

            self.client.table('webhook_deliveries').update(update_data).eq('id', delivery_id).execute()

        except Exception as e:
            logger.error(f"Failed to update delivery status: {str(e)}")

    def _schedule_retry(self, delivery_id: str, attempts: int) -> None:
        """
        Schedule retry for failed webhook delivery using exponential backoff.

        Backoff schedule:
        - Attempt 1: 1 minute
        - Attempt 2: 2 minutes
        - Attempt 3: 4 minutes
        - Attempt 4: 8 minutes
        - Attempt 5: 16 minutes

        Args:
            delivery_id: Delivery record ID
            attempts: Current number of attempts
        """
        try:
            if attempts >= self.max_attempts:
                logger.warning(f"Max retry attempts reached for delivery {delivery_id}")
                self._update_delivery_status(delivery_id, status='failed')
                return

            # Calculate next retry time (exponential backoff)
            delay_seconds = self.base_retry_delay * (2 ** (attempts - 1))
            next_retry_at = datetime.utcnow() + timedelta(seconds=delay_seconds)

            self.client.table('webhook_deliveries').update({
                'next_retry_at': next_retry_at.isoformat(),
                'status': 'retrying'
            }).eq('id', delivery_id).execute()

            logger.info(
                f"Scheduled retry for delivery {delivery_id} "
                f"(attempt {attempts + 1}/{self.max_attempts}) "
                f"at {next_retry_at.isoformat()}"
            )

        except Exception as e:
            logger.error(f"Failed to schedule retry: {str(e)}")

    def process_retries(self) -> int:
        """
        Process pending webhook retries (should be called by background job).

        Returns:
            Number of retries processed
        """
        try:
            # Get deliveries ready for retry
            now = datetime.utcnow().isoformat()
            result = (
                self.client.table('webhook_deliveries')
                .select('*, webhook_subscriptions!inner(*)')
                .eq('status', 'retrying')
                .lte('next_retry_at', now)
                .limit(100)  # Process in batches
                .execute()
            )

            deliveries = result.data if result.data else []
            processed = 0

            for delivery in deliveries:
                subscription = delivery.get('webhook_subscriptions')
                if not subscription:
                    continue

                # Attempt delivery
                success = self._attempt_delivery(
                    subscription=subscription,
                    payload=delivery['payload'],
                    delivery_id=delivery['id']
                )

                processed += 1

            if processed > 0:
                logger.info(f"Processed {processed} webhook retries")

            return processed

        except Exception as e:
            logger.error(f"Failed to process webhook retries: {str(e)}")
            return 0

    @staticmethod
    def generate_webhook_secret() -> str:
        """
        Generate a secure random secret for webhook signature verification.

        Returns:
            64-character hex string (32 bytes)
        """
        return secrets.token_hex(32)

    @staticmethod
    def verify_webhook_signature(
        payload: str,
        signature: str,
        secret: str
    ) -> bool:
        """
        Verify webhook signature (for webhook receivers).

        Args:
            payload: Raw JSON payload string
            signature: Signature from X-Optio-Signature header
            secret: Shared secret

        Returns:
            True if signature is valid, False otherwise

        Example:
            payload = request.get_data(as_text=True)
            signature = request.headers.get('X-Optio-Signature')
            secret = 'your-webhook-secret'

            if not verify_webhook_signature(payload, signature, secret):
                abort(401, 'Invalid signature')
        """
        try:
            expected_signature = hmac.new(
                secret.encode('utf-8'),
                payload.encode('utf-8'),
                hashlib.sha256
            ).hexdigest()

            expected = f"sha256={expected_signature}"
            return hmac.compare_digest(expected, signature)

        except Exception:
            return False
