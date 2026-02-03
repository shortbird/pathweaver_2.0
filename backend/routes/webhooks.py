"""
Webhook Management Routes

Endpoints for managing webhook subscriptions (LMS integrations).
Requires organization admin or superadmin role.

Routes:
    POST /api/webhooks/subscriptions - Create webhook subscription
    GET /api/webhooks/subscriptions - List webhook subscriptions
    GET /api/webhooks/subscriptions/:id - Get webhook subscription details
    PUT /api/webhooks/subscriptions/:id - Update webhook subscription
    DELETE /api/webhooks/subscriptions/:id - Delete webhook subscription
    GET /api/webhooks/deliveries - List webhook deliveries (logs)
    POST /api/webhooks/test - Test webhook endpoint
"""

from flask import Blueprint, request, jsonify
from datetime import datetime

from utils.auth.decorators import require_admin
from database import get_supabase_admin_client
from services.webhook_service import WebhookService
from utils.logger import get_logger

webhooks_bp = Blueprint('webhooks', __name__)
logger = get_logger(__name__)


@webhooks_bp.route('/subscriptions', methods=['POST'])
@require_admin
def create_subscription(user_id: str):
    """
    Create a new webhook subscription.

    Required role: org_admin or admin
    Required fields:
        - organization_id (UUID)
        - event_type (string) - One of: quest.completed, task.completed, badge.earned, etc.
        - target_url (string) - HTTPS URL for webhook delivery

    Returns:
        201: Subscription created
        400: Invalid request
        403: Insufficient permissions
    """
    try:
        admin_client = get_supabase_admin_client()

        # Get user's organization (for org-scoped access control)
        user_result = admin_client.table('users').select('role, organization_id').eq('id', user_id).single().execute()
        user = user_result.data

        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Validate request data
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400

        organization_id = data.get('organization_id')
        event_type = data.get('event_type')
        target_url = data.get('target_url')

        if not all([organization_id, event_type, target_url]):
            return jsonify({
                'error': 'Missing required fields',
                'required': ['organization_id', 'event_type', 'target_url']
            }), 400

        # Verify user has access to this organization
        if user['role'] not in ['org_admin', 'superadmin'] and user['organization_id'] != organization_id:
            return jsonify({'error': 'Cannot create webhooks for other organizations'}), 403

        # Validate event type
        valid_events = [
            'quest.completed', 'task.completed', 'task.submitted',
            'badge.earned', 'user.registered', 'grade.updated',
            'quest.started', 'evidence.uploaded'
        ]
        if event_type not in valid_events:
            return jsonify({
                'error': 'Invalid event type',
                'valid_events': valid_events
            }), 400

        # Validate URL
        if not target_url.startswith(('http://', 'https://')):
            return jsonify({'error': 'target_url must be a valid HTTP(S) URL'}), 400

        # Generate webhook secret
        webhook_service = WebhookService(admin_client)
        secret = webhook_service.generate_webhook_secret()

        # Create subscription
        subscription_data = {
            'organization_id': organization_id,
            'event_type': event_type,
            'target_url': target_url,
            'secret': secret,
            'is_active': True,
            'created_by': user_id,
            'created_at': datetime.utcnow().isoformat()
        }

        result = admin_client.table('webhook_subscriptions').insert(subscription_data).execute()

        if not result.data:
            return jsonify({'error': 'Failed to create subscription'}), 500

        subscription = result.data[0]

        logger.info(
            f"Webhook subscription created: {subscription['id']} "
            f"for {event_type} by user {user_id}"
        )

        return jsonify({
            'message': 'Webhook subscription created',
            'subscription': {
                'id': subscription['id'],
                'organization_id': subscription['organization_id'],
                'event_type': subscription['event_type'],
                'target_url': subscription['target_url'],
                'secret': subscription['secret'],  # Return once for client to store
                'is_active': subscription['is_active'],
                'created_at': subscription['created_at']
            }
        }), 201

    except Exception as e:
        logger.error(f"Failed to create webhook subscription: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@webhooks_bp.route('/subscriptions', methods=['GET'])
@require_admin
def list_subscriptions(user_id: str):
    """
    List webhook subscriptions for user's organization.

    Query params:
        - organization_id (optional) - Filter by organization (admin only)
        - event_type (optional) - Filter by event type
        - is_active (optional) - Filter by active status

    Returns:
        200: List of subscriptions
        403: Insufficient permissions
    """
    try:
        admin_client = get_supabase_admin_client()

        # Get user info
        user_result = admin_client.table('users').select('role, organization_id').eq('id', user_id).single().execute()
        user = user_result.data

        if not user:
            return jsonify({'error': 'User not found'}), 404


        # Build query
        query = admin_client.table('webhook_subscriptions').select('*')

        # Filter by organization
        org_id_param = request.args.get('organization_id')
        if org_id_param:
            # Only admins can view other orgs
            if user['role'] not in ['org_admin', 'superadmin'] and user['organization_id'] != org_id_param:
                return jsonify({'error': 'Cannot view webhooks for other organizations'}), 403
            query = query.eq('organization_id', org_id_param)
        else:
            # Non-admins can only see their own org
            if user['role'] not in ['org_admin', 'superadmin']:
                query = query.eq('organization_id', user['organization_id'])

        # Filter by event type
        event_type = request.args.get('event_type')
        if event_type:
            query = query.eq('event_type', event_type)

        # Filter by active status
        is_active = request.args.get('is_active')
        if is_active is not None:
            query = query.eq('is_active', is_active.lower() == 'true')

        # Execute query
        result = query.order('created_at', desc=True).execute()

        subscriptions = result.data if result.data else []

        # Don't expose secrets in list view
        for sub in subscriptions:
            sub['secret'] = '***REDACTED***'

        return jsonify({
            'subscriptions': subscriptions,
            'count': len(subscriptions)
        }), 200

    except Exception as e:
        logger.error(f"Failed to list webhook subscriptions: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@webhooks_bp.route('/subscriptions/<subscription_id>', methods=['GET'])
@require_admin
def get_subscription(user_id: str, subscription_id: str):
    """
    Get webhook subscription details.

    Returns:
        200: Subscription details
        403: Insufficient permissions
        404: Subscription not found
    """
    try:
        admin_client = get_supabase_admin_client()

        # Get user info
        user_result = admin_client.table('users').select('role, organization_id').eq('id', user_id).single().execute()
        user = user_result.data

        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Get subscription
        result = admin_client.table('webhook_subscriptions').select('*').eq('id', subscription_id).single().execute()

        if not result.data:
            return jsonify({'error': 'Subscription not found'}), 404

        subscription = result.data

        # Check permissions
        if user['role'] not in ['org_admin', 'superadmin'] and user['organization_id'] != subscription['organization_id']:
            return jsonify({'error': 'Insufficient permissions'}), 403

        # Redact secret (users should store it when created)
        subscription['secret'] = '***REDACTED***'

        return jsonify({'subscription': subscription}), 200

    except Exception as e:
        logger.error(f"Failed to get webhook subscription: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@webhooks_bp.route('/subscriptions/<subscription_id>', methods=['PUT'])
@require_admin
def update_subscription(user_id: str, subscription_id: str):
    """
    Update webhook subscription.

    Allowed updates:
        - target_url
        - is_active

    Returns:
        200: Subscription updated
        400: Invalid request
        403: Insufficient permissions
        404: Subscription not found
    """
    try:
        admin_client = get_supabase_admin_client()

        # Get user info
        user_result = admin_client.table('users').select('role, organization_id').eq('id', user_id).single().execute()
        user = user_result.data

        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Get subscription
        sub_result = admin_client.table('webhook_subscriptions').select('*').eq('id', subscription_id).single().execute()

        if not sub_result.data:
            return jsonify({'error': 'Subscription not found'}), 404

        subscription = sub_result.data

        # Check permissions
        if user['role'] not in ['org_admin', 'superadmin'] and user['organization_id'] != subscription['organization_id']:
            return jsonify({'error': 'Insufficient permissions'}), 403

        # Validate request data
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400

        # Build update data
        update_data = {}

        if 'target_url' in data:
            target_url = data['target_url']
            if not target_url.startswith(('http://', 'https://')):
                return jsonify({'error': 'target_url must be a valid HTTP(S) URL'}), 400
            update_data['target_url'] = target_url

        if 'is_active' in data:
            update_data['is_active'] = bool(data['is_active'])

        if not update_data:
            return jsonify({'error': 'No valid fields to update'}), 400

        # Update subscription
        update_data['updated_at'] = datetime.utcnow().isoformat()
        result = admin_client.table('webhook_subscriptions').update(update_data).eq('id', subscription_id).execute()

        if not result.data:
            return jsonify({'error': 'Failed to update subscription'}), 500

        updated_sub = result.data[0]
        updated_sub['secret'] = '***REDACTED***'

        logger.info(f"Webhook subscription updated: {subscription_id} by user {user_id}")

        return jsonify({
            'message': 'Webhook subscription updated',
            'subscription': updated_sub
        }), 200

    except Exception as e:
        logger.error(f"Failed to update webhook subscription: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@webhooks_bp.route('/subscriptions/<subscription_id>', methods=['DELETE'])
@require_admin
def delete_subscription(user_id: str, subscription_id: str):
    """
    Delete webhook subscription.

    Returns:
        200: Subscription deleted
        403: Insufficient permissions
        404: Subscription not found
    """
    try:
        admin_client = get_supabase_admin_client()

        # Get user info
        user_result = admin_client.table('users').select('role, organization_id').eq('id', user_id).single().execute()
        user = user_result.data

        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Get subscription
        sub_result = admin_client.table('webhook_subscriptions').select('*').eq('id', subscription_id).single().execute()

        if not sub_result.data:
            return jsonify({'error': 'Subscription not found'}), 404

        subscription = sub_result.data

        # Check permissions
        if user['role'] not in ['org_admin', 'superadmin'] and user['organization_id'] != subscription['organization_id']:
            return jsonify({'error': 'Insufficient permissions'}), 403

        # Delete subscription (deliveries will be cascade deleted)
        admin_client.table('webhook_subscriptions').delete().eq('id', subscription_id).execute()

        logger.info(f"Webhook subscription deleted: {subscription_id} by user {user_id}")

        return jsonify({'message': 'Webhook subscription deleted'}), 200

    except Exception as e:
        logger.error(f"Failed to delete webhook subscription: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@webhooks_bp.route('/deliveries', methods=['GET'])
@require_admin
def list_deliveries(user_id: str):
    """
    List webhook delivery logs for user's organization.

    Query params:
        - subscription_id (optional) - Filter by subscription
        - status (optional) - Filter by status (pending, delivered, failed, retrying)
        - limit (optional, default 50) - Number of results

    Returns:
        200: List of deliveries
        403: Insufficient permissions
    """
    try:
        admin_client = get_supabase_admin_client()

        # Get user info
        user_result = admin_client.table('users').select('role, organization_id').eq('id', user_id).single().execute()
        user = user_result.data

        if not user:
            return jsonify({'error': 'User not found'}), 404


        # Build query
        query = (
            admin_client.table('webhook_deliveries')
            .select('*, webhook_subscriptions!inner(organization_id, event_type, target_url)')
        )

        # Filter by organization (non-admins can only see their org)
        if user['role'] not in ['org_admin', 'superadmin']:
            query = query.eq('webhook_subscriptions.organization_id', user['organization_id'])

        # Filter by subscription
        subscription_id = request.args.get('subscription_id')
        if subscription_id:
            query = query.eq('subscription_id', subscription_id)

        # Filter by status
        status = request.args.get('status')
        if status:
            query = query.eq('status', status)

        # Limit results
        limit = int(request.args.get('limit', 50))
        limit = min(limit, 200)  # Max 200 results

        # Execute query
        result = query.order('created_at', desc=True).limit(limit).execute()

        deliveries = result.data if result.data else []

        return jsonify({
            'deliveries': deliveries,
            'count': len(deliveries)
        }), 200

    except Exception as e:
        logger.error(f"Failed to list webhook deliveries: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@webhooks_bp.route('/test', methods=['POST'])
@require_admin
def test_webhook(user_id: str):
    """
    Test webhook endpoint by sending a sample event.

    Required fields:
        - subscription_id (UUID)

    Returns:
        200: Test webhook sent
        400: Invalid request
        403: Insufficient permissions
        404: Subscription not found
    """
    try:
        admin_client = get_supabase_admin_client()

        # Get user info
        user_result = admin_client.table('users').select('role, organization_id').eq('id', user_id).single().execute()
        user = user_result.data

        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Validate request data
        data = request.get_json()
        if not data or not data.get('subscription_id'):
            return jsonify({'error': 'subscription_id required'}), 400

        subscription_id = data['subscription_id']

        # Get subscription
        sub_result = admin_client.table('webhook_subscriptions').select('*').eq('id', subscription_id).single().execute()

        if not sub_result.data:
            return jsonify({'error': 'Subscription not found'}), 404

        subscription = sub_result.data

        # Check permissions
        if user['role'] not in ['org_admin', 'superadmin'] and user['organization_id'] != subscription['organization_id']:
            return jsonify({'error': 'Insufficient permissions'}), 403

        # Send test webhook
        webhook_service = WebhookService(admin_client)
        test_payload = {
            'event': 'webhook.test',
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'data': {
                'message': 'This is a test webhook from Optio',
                'subscription_id': subscription_id
            },
            'organization_id': subscription['organization_id']
        }

        # Queue test delivery
        webhook_service._queue_delivery(subscription, test_payload)

        logger.info(f"Test webhook sent to subscription {subscription_id} by user {user_id}")

        return jsonify({
            'message': 'Test webhook sent',
            'note': 'Check the deliveries endpoint for delivery status'
        }), 200

    except Exception as e:
        logger.error(f"Failed to send test webhook: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500
