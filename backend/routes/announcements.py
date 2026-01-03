"""
Announcement API Routes
=======================

Handles announcement CRUD operations.
Advisors and admins can create/edit/delete announcements.
All users can view announcements for their organization.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from datetime import datetime
from services.announcement_service import AnnouncementService
from repositories.announcement_repository import AnnouncementRepository, DatabaseError, NotFoundError

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('announcements', __name__, url_prefix='/api/announcements')


def get_announcement_service():
    """Get announcement service instance (lazy initialization)."""
    return AnnouncementService()


@bp.route('', methods=['POST'])
@require_auth
def create_announcement(user_id):
    """
    Create a new announcement.

    Request body:
    {
        "title": "Announcement title",
        "message": "Announcement message (markdown supported)",
        "target_audience": ["students", "advisors", "parents", "all"],
        "pinned": false,
        "send_notifications": true
    }

    Returns:
        201: Announcement created
        400: Invalid request
        403: Forbidden (must be advisor/admin)
    """
    try:
        supabase = get_supabase_admin_client()

        # Get user info to verify role and org
        user = supabase.table('users')\
            .select('id, role, organization_id, is_org_admin')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not user.data:
            return jsonify({'error': 'User not found'}), 404

        user_role = user.data.get('role')
        organization_id = user.data.get('organization_id')
        is_org_admin = user.data.get('is_org_admin', False)

        # Only advisors and admins can create announcements
        if user_role not in ['advisor', 'org_admin', 'superadmin'] and not is_org_admin:
            return jsonify({'error': 'Only advisors and admins can create announcements'}), 403

        # Validate request
        data = request.json
        if not data.get('title') or not data.get('message'):
            return jsonify({'error': 'title and message are required'}), 400

        if not data.get('target_audience'):
            return jsonify({'error': 'target_audience is required'}), 400

        # Create announcement
        announcement = get_announcement_service().create_announcement(
            author_id=user_id,
            organization_id=organization_id,
            title=data['title'],
            message=data['message'],
            target_audience=data['target_audience'],
            pinned=data.get('pinned', False),
            send_notifications=data.get('send_notifications', True)
        )

        return jsonify({
            'success': True,
            'announcement': announcement
        }), 201

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error creating announcement: {e}")
        return jsonify({'error': 'Failed to create announcement'}), 500


@bp.route('', methods=['GET'])
@require_auth
def list_announcements(user_id):
    """
    List announcements for the user's organization.

    Query params:
        pinned_only: boolean (default: false)
        limit: int (default: 20)
        offset: int (default: 0)

    Returns:
        200: List of announcements
    """
    try:
        supabase = get_supabase_admin_client()

        # Get user info
        user = supabase.table('users')\
            .select('id, role, organization_id, is_org_admin')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not user.data:
            return jsonify({'error': 'User not found'}), 404

        user_role = user.data.get('role')
        organization_id = user.data.get('organization_id')
        is_org_admin = user.data.get('is_org_admin', False)

        if not organization_id:
            return jsonify({'error': 'User is not part of an organization'}), 400

        # Get query params
        pinned_only = request.args.get('pinned_only', 'false').lower() == 'true'
        limit = int(request.args.get('limit', 20))
        offset = int(request.args.get('offset', 0))

        # List announcements
        print(f"[ROUTE DEBUG] list_announcements called: user_id={user_id}, role={user_role}, org={organization_id}, is_org_admin={is_org_admin}", flush=True)

        announcements = get_announcement_service().list_announcements(
            organization_id=organization_id,
            user_id=user_id,
            user_role=user_role,
            is_org_admin=is_org_admin,
            pinned_only=pinned_only,
            limit=limit,
            offset=offset
        )

        print(f"[ROUTE DEBUG] Got {len(announcements)} announcements", file=sys.stderr, flush=True)

        return jsonify({
            'success': True,
            'announcements': announcements
        }), 200

    except Exception as e:
        logger.error(f"Error listing announcements: {e}")
        return jsonify({'error': 'Failed to list announcements'}), 500


@bp.route('/<announcement_id>', methods=['GET'])
@require_auth
def get_announcement(user_id, announcement_id):
    """
    Get a single announcement by ID.

    Returns:
        200: Announcement data
        404: Announcement not found
    """
    try:
        announcement = get_announcement_service().get_announcement(announcement_id)

        if not announcement:
            return jsonify({'error': 'Announcement not found'}), 404

        # Mark as read
        repo = AnnouncementRepository(user_id=user_id)
        repo.mark_as_read(announcement_id, user_id)

        return jsonify({
            'success': True,
            'announcement': announcement
        }), 200

    except Exception as e:
        logger.error(f"Error fetching announcement: {e}")
        return jsonify({'error': 'Failed to fetch announcement'}), 500


@bp.route('/<announcement_id>', methods=['PATCH'])
@require_auth
def update_announcement(user_id, announcement_id):
    """
    Update an announcement (author only).

    Request body:
    {
        "title": "Updated title",
        "message": "Updated message",
        "target_audience": ["students"],
        "pinned": true
    }

    Returns:
        200: Announcement updated
        403: Forbidden (not author)
        404: Announcement not found
    """
    try:
        data = request.json

        # Filter allowed updates
        allowed_fields = ['title', 'message', 'target_audience', 'pinned']
        updates = {k: v for k, v in data.items() if k in allowed_fields}

        if not updates:
            return jsonify({'error': 'No valid fields to update'}), 400

        # Update announcement
        announcement = get_announcement_service().update_announcement(
            announcement_id=announcement_id,
            author_id=user_id,
            updates=updates
        )

        return jsonify({
            'success': True,
            'announcement': announcement
        }), 200

    except PermissionError as e:
        return jsonify({'error': str(e)}), 403
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except NotFoundError:
        return jsonify({'error': 'Announcement not found'}), 404
    except Exception as e:
        logger.error(f"Error updating announcement: {e}")
        return jsonify({'error': 'Failed to update announcement'}), 500


@bp.route('/<announcement_id>', methods=['DELETE'])
@require_auth
def delete_announcement(user_id, announcement_id):
    """
    Delete an announcement (author or admin).

    Returns:
        200: Announcement deleted
        403: Forbidden
        404: Announcement not found
    """
    try:
        supabase = get_supabase_admin_client()

        # Get user role
        user = supabase.table('users')\
            .select('role, is_org_admin')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not user.data:
            return jsonify({'error': 'User not found'}), 404

        user_role = user.data.get('role')
        is_org_admin = user.data.get('is_org_admin', False)

        # Delete announcement
        get_announcement_service().delete_announcement(
            announcement_id=announcement_id,
            user_id=user_id,
            user_role=user_role,
            is_org_admin=is_org_admin
        )

        return jsonify({
            'success': True,
            'message': 'Announcement deleted successfully'
        }), 200

    except PermissionError as e:
        return jsonify({'error': str(e)}), 403
    except ValueError as e:
        return jsonify({'error': str(e)}), 404
    except NotFoundError:
        return jsonify({'error': 'Announcement not found'}), 404
    except Exception as e:
        logger.error(f"Error deleting announcement: {e}")
        return jsonify({'error': 'Failed to delete announcement'}), 500


@bp.route('/unread-count', methods=['GET'])
@require_auth
def get_unread_count(user_id):
    """
    Get count of unread announcements for the current user.

    Returns:
        200: Unread count
    """
    try:
        supabase = get_supabase_admin_client()

        # Get user org and role
        user = supabase.table('users')\
            .select('organization_id, role, is_org_admin')\
            .eq('id', user_id)\
            .single()\
            .execute()

        if not user.data or not user.data.get('organization_id'):
            return jsonify({'unread_count': 0}), 200

        organization_id = user.data['organization_id']
        user_role = user.data.get('role')
        is_org_admin = user.data.get('is_org_admin', False)

        # Map role to target_audience filter (same logic as list_announcements)
        audience_filter = None
        if user_role in ['advisor', 'org_admin', 'superadmin'] or is_org_admin:
            audience_filter = None  # Admins/advisors see all
        elif user_role == 'student':
            audience_filter = 'students'
        elif user_role == 'parent':
            audience_filter = 'parents'

        # Get unread count
        repo = AnnouncementRepository(user_id=user_id)
        unread_count = repo.get_unread_count(organization_id, user_id, audience_filter)

        return jsonify({
            'success': True,
            'unread_count': unread_count
        }), 200

    except Exception as e:
        logger.error(f"Error getting unread count: {e}")
        return jsonify({'error': 'Failed to get unread count'}), 500


@bp.route('/<announcement_id>/read', methods=['POST'])
@require_auth
def mark_announcement_read(user_id, announcement_id):
    """
    Mark an announcement as read.

    Returns:
        200: Marked as read
    """
    try:
        repo = AnnouncementRepository(user_id=user_id)
        repo.mark_as_read(announcement_id, user_id)

        return jsonify({
            'success': True,
            'message': 'Announcement marked as read'
        }), 200

    except Exception as e:
        logger.error(f"Error marking announcement as read: {e}")
        return jsonify({'error': 'Failed to mark announcement as read'}), 500
