"""
Push Subscriptions API Routes.

Handles Web Push subscription management for browser push notifications.
"""

from flask import Blueprint, jsonify, request
from utils.auth.decorators import require_auth
from services.push_notification_service import PushNotificationService
from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('push_subscriptions', __name__, url_prefix='/api/push')


@bp.route('/vapid-public-key', methods=['GET'])
def get_vapid_public_key():
    """
    Get the VAPID public key for push subscription.

    This endpoint is public as the key is needed before authentication
    to subscribe to push notifications.

    Returns:
        JSON with VAPID public key or error if not configured
    """
    vapid_key = Config.VAPID_PUBLIC_KEY

    if not vapid_key:
        logger.warning("VAPID public key requested but not configured")
        return jsonify({
            'error': 'Push notifications not configured',
            'configured': False
        }), 503

    return jsonify({
        'vapid_public_key': vapid_key,
        'configured': True
    }), 200


@bp.route('/subscribe', methods=['POST'])
@require_auth
def subscribe(user_id: str):
    """
    Save a push notification subscription for the current user.

    Request body:
        subscription: {
            endpoint: Push service endpoint URL
            keys: {
                p256dh: Client public key (base64)
                auth: Auth secret (base64)
            }
        }

    Returns:
        JSON with subscription status
    """
    data = request.get_json()

    if not data or 'subscription' not in data:
        return jsonify({'error': 'Missing subscription data'}), 400

    subscription = data['subscription']

    # Validate required fields
    if not subscription.get('endpoint'):
        return jsonify({'error': 'Missing endpoint'}), 400

    keys = subscription.get('keys', {})
    if not keys.get('p256dh') or not keys.get('auth'):
        return jsonify({'error': 'Missing subscription keys'}), 400

    try:
        push_service = PushNotificationService()

        # Check if push notifications are configured
        if not push_service.is_configured():
            return jsonify({
                'error': 'Push notifications not configured on server',
                'success': False
            }), 503

        # Save the subscription
        result = push_service.save_subscription(
            user_id=user_id,
            endpoint=subscription['endpoint'],
            p256dh=keys['p256dh'],
            auth=keys['auth'],
            user_agent=request.headers.get('User-Agent')
        )

        logger.info(f"Push subscription saved for user {user_id[:8]}")

        return jsonify({
            'success': True,
            'message': 'Push subscription saved',
            'subscription_id': result.get('id')
        }), 201

    except Exception as e:
        logger.error(f"Error saving push subscription: {str(e)}")
        return jsonify({
            'error': 'Failed to save subscription',
            'details': str(e)
        }), 500


@bp.route('/unsubscribe', methods=['POST'])
@require_auth
def unsubscribe(user_id: str):
    """
    Remove a push notification subscription for the current user.

    Request body:
        endpoint: Push service endpoint URL to remove

    Returns:
        JSON with unsubscription status
    """
    data = request.get_json()

    if not data or not data.get('endpoint'):
        return jsonify({'error': 'Missing endpoint'}), 400

    try:
        push_service = PushNotificationService()

        push_service.remove_subscription(
            user_id=user_id,
            endpoint=data['endpoint']
        )

        logger.info(f"Push subscription removed for user {user_id[:8]}")

        return jsonify({
            'success': True,
            'message': 'Push subscription removed'
        }), 200

    except Exception as e:
        logger.error(f"Error removing push subscription: {str(e)}")
        return jsonify({
            'error': 'Failed to remove subscription',
            'details': str(e)
        }), 500


@bp.route('/subscriptions', methods=['GET'])
@require_auth
def list_subscriptions(user_id: str):
    """
    List all push subscriptions for the current user.

    Returns:
        JSON with list of subscriptions (endpoint masked for security)
    """
    try:
        push_service = PushNotificationService()
        subscriptions = push_service.get_user_subscriptions(user_id)

        # Mask endpoint URLs for security (only show domain)
        masked_subscriptions = []
        for sub in subscriptions:
            try:
                from urllib.parse import urlparse
                parsed = urlparse(sub['endpoint'])
                masked_endpoint = f"{parsed.scheme}://{parsed.netloc}/..."
            except Exception:
                masked_endpoint = "..."

            masked_subscriptions.append({
                'id': sub['id'],
                'endpoint_domain': masked_endpoint,
                'user_agent': sub.get('user_agent'),
                'created_at': sub['created_at'],
                'last_used_at': sub['last_used_at']
            })

        return jsonify({
            'subscriptions': masked_subscriptions,
            'count': len(masked_subscriptions)
        }), 200

    except Exception as e:
        logger.error(f"Error listing push subscriptions: {str(e)}")
        return jsonify({
            'error': 'Failed to list subscriptions',
            'details': str(e)
        }), 500


@bp.route('/test', methods=['POST'])
@require_auth
def test_push(user_id: str):
    """
    Send a test push notification to the current user.

    Useful for verifying push notifications are working correctly.

    Returns:
        JSON with test notification status
    """
    try:
        push_service = PushNotificationService()

        if not push_service.is_configured():
            return jsonify({
                'error': 'Push notifications not configured',
                'success': False
            }), 503

        result = push_service.send_push_notification(
            user_id=user_id,
            title='Test Notification',
            body='Push notifications are working!',
            url='/communication'
        )

        if result['sent'] > 0:
            return jsonify({
                'success': True,
                'message': f"Test notification sent to {result['sent']} device(s)",
                'details': result
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'No active push subscriptions found',
                'details': result
            }), 200

    except Exception as e:
        logger.error(f"Error sending test push: {str(e)}")
        return jsonify({
            'error': 'Failed to send test notification',
            'details': str(e)
        }), 500
