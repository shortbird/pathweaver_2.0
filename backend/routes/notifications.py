"""
Notifications API endpoints.

Handles user notification retrieval, marking as read, and real-time updates.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from middleware.error_handler import ValidationError
from services.notification_service import NotificationService
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('notifications', __name__, url_prefix='/api/notifications')


@bp.route('', methods=['GET'])
@require_auth
def get_notifications(user_id: str):
    """
    Get notifications for the authenticated user.

    Query params:
        limit (int): Max notifications to return (default: 50)
        unread_only (bool): Only return unread notifications (default: false)

    Returns:
        200: List of notifications with unread count
    """
    try:
        supabase = get_supabase_admin_client()
        service = NotificationService(supabase)

        # Parse query params
        limit = request.args.get('limit', 50, type=int)
        unread_only = request.args.get('unread_only', 'false').lower() == 'true'

        # Validate limit
        if limit < 1 or limit > 100:
            return jsonify({'error': 'Limit must be between 1 and 100'}), 400

        # Get notifications
        notifications = service.get_user_notifications(
            user_id=user_id,
            limit=limit,
            unread_only=unread_only
        )

        # Get unread count
        unread_count = service.get_unread_count(user_id)

        return jsonify({
            'success': True,
            'notifications': notifications,
            'unread_count': unread_count
        }), 200

    except Exception as e:
        logger.error(f"Error fetching notifications: {str(e)}")
        return jsonify({'error': 'Failed to fetch notifications'}), 500


@bp.route('/unread-count', methods=['GET'])
@require_auth
def get_unread_count(user_id: str):
    """
    Get count of unread notifications for authenticated user.

    Returns:
        200: Unread count
    """
    try:
        supabase = get_supabase_admin_client()
        service = NotificationService(supabase)

        count = service.get_unread_count(user_id)

        return jsonify({
            'success': True,
            'unread_count': count
        }), 200

    except Exception as e:
        logger.error(f"Error fetching unread count: {str(e)}")
        return jsonify({'error': 'Failed to fetch unread count'}), 500


@bp.route('/<notification_id>/read', methods=['PUT'])
@require_auth
def mark_as_read(user_id: str, notification_id: str):
    """
    Mark a notification as read.

    Returns:
        200: Notification marked as read
        404: Notification not found
    """
    try:
        supabase = get_supabase_admin_client()
        service = NotificationService(supabase)

        service.mark_as_read(notification_id, user_id)

        return jsonify({
            'success': True,
            'message': 'Notification marked as read'
        }), 200

    except Exception as e:
        logger.error(f"Error marking notification as read: {str(e)}")
        return jsonify({'error': 'Failed to mark notification as read'}), 500


@bp.route('/mark-all-read', methods=['PUT'])
@require_auth
def mark_all_as_read(user_id: str):
    """
    Mark all notifications as read for authenticated user.

    Returns:
        200: All notifications marked as read
    """
    try:
        supabase = get_supabase_admin_client()
        service = NotificationService(supabase)

        count = service.mark_all_as_read(user_id)

        return jsonify({
            'success': True,
            'message': f'Marked {count} notifications as read'
        }), 200

    except Exception as e:
        logger.error(f"Error marking all notifications as read: {str(e)}")
        return jsonify({'error': 'Failed to mark all notifications as read'}), 500


@bp.route('/<notification_id>', methods=['DELETE'])
@require_auth
def delete_notification(user_id: str, notification_id: str):
    """
    Delete a notification.

    Returns:
        200: Notification deleted
        404: Notification not found
    """
    try:
        supabase = get_supabase_admin_client()
        service = NotificationService(supabase)

        service.delete_notification(notification_id, user_id)

        return jsonify({
            'success': True,
            'message': 'Notification deleted'
        }), 200

    except Exception as e:
        logger.error(f"Error deleting notification: {str(e)}")
        return jsonify({'error': 'Failed to delete notification'}), 500


@bp.route('/delete-all', methods=['DELETE'])
@require_auth
def delete_all_notifications(user_id: str):
    """
    Delete all notifications for authenticated user.

    Returns:
        200: All notifications deleted
    """
    try:
        supabase = get_supabase_admin_client()
        service = NotificationService(supabase)

        count = service.delete_all_notifications(user_id)

        return jsonify({
            'success': True,
            'message': f'Deleted {count} notifications'
        }), 200

    except Exception as e:
        logger.error(f"Error deleting all notifications: {str(e)}")
        return jsonify({'error': 'Failed to delete all notifications'}), 500


@bp.route('/send', methods=['POST'])
@require_auth
def send_notification(user_id: str):
    """
    Create a notification for a user.
    Only accessible by advisors, school admins, and superadmins.

    Body:
        target_user_id (str): User to send notification to
        notification_type (str): Type of notification
        title (str): Notification title
        message (str): Notification message
        link (str, optional): URL to navigate to
        metadata (dict, optional): Additional data

    Returns:
        201: Notification created
        403: Permission denied
        400: Validation error
    """
    try:
        supabase = get_supabase_admin_client()
        service = NotificationService(supabase)

        # Check permissions
        user = supabase.table('users')\
            .select('role, organization_id')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not user.data:
            return jsonify({'error': 'User not found'}), 404

        user_role = user.data.get('role')
        if user_role not in ['advisor', 'org_admin', 'superadmin']:
            return jsonify({'error': 'Only advisors and administrators can send notifications'}), 403

        # Get request data
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400

        target_user_id = data.get('target_user_id')
        notification_type = data.get('notification_type')
        title = data.get('title')
        message = data.get('message')
        link = data.get('link')
        metadata = data.get('metadata', {})

        # Validate required fields
        if not all([target_user_id, notification_type, title, message]):
            return jsonify({'error': 'target_user_id, notification_type, title, and message are required'}), 400

        # Create notification
        notification = service.create_notification(
            user_id=target_user_id,
            notification_type=notification_type,
            title=title,
            message=message,
            link=link,
            metadata=metadata,
            organization_id=user.data.get('organization_id')
        )

        return jsonify({
            'success': True,
            'notification': notification,
            'message': 'Notification sent'
        }), 201

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error sending notification: {str(e)}")
        return jsonify({'error': 'Failed to send notification'}), 500


@bp.route('/broadcast', methods=['POST'])
@require_auth
def broadcast_notification(user_id: str):
    """
    Broadcast a notification to multiple users in an organization.
    Only accessible by advisors, org admins, and superadmins.

    Body:
        title (str): Notification title
        message (str): Full message content (supports markdown)
        target_audience (list): Audiences to send to ['students', 'parents', 'advisors', 'all']

    Returns:
        201: Notifications sent
        403: Permission denied
        400: Validation error
    """
    try:
        supabase = get_supabase_admin_client()
        service = NotificationService(supabase)

        # Check permissions
        user = supabase.table('users')\
            .select('role, organization_id')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not user.data:
            return jsonify({'error': 'User not found'}), 404

        user_role = user.data.get('role')
        organization_id = user.data.get('organization_id')

        if user_role not in ['advisor', 'org_admin', 'superadmin']:
            return jsonify({'error': 'Only advisors and administrators can broadcast notifications'}), 403

        if not organization_id:
            return jsonify({'error': 'User must belong to an organization to broadcast notifications'}), 400

        # Get request data
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400

        title = data.get('title')
        message = data.get('message')
        target_audience = data.get('target_audience', ['all'])

        # Validate required fields
        if not title or not message:
            return jsonify({'error': 'title and message are required'}), 400

        # Validate target_audience
        valid_audiences = ['students', 'parents', 'advisors', 'all']
        if not isinstance(target_audience, list):
            target_audience = [target_audience]

        for audience in target_audience:
            if audience not in valid_audiences:
                return jsonify({'error': f'Invalid audience: {audience}. Valid options: {valid_audiences}'}), 400

        # Broadcast notification
        result = service.broadcast_notification(
            sender_id=user_id,
            organization_id=organization_id,
            title=title,
            message=message,
            target_audience=target_audience
        )

        return jsonify({
            'success': True,
            'notifications_sent': result['notifications_sent'],
            'target_audience': result['target_audience'],
            'message': f'Notification sent to {result["notifications_sent"]} users'
        }), 201

    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error broadcasting notification: {str(e)}")
        return jsonify({'error': 'Failed to broadcast notification'}), 500
