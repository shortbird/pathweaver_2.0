"""
Analytics API routes for activity tracking and insights.

Endpoints:
- POST /api/activity/track - Manual event tracking from frontend
- GET /api/analytics/engagement/:userId - User engagement metrics (admin/parent)
- GET /api/analytics/at-risk-students - Dropout predictions (admin only)
- GET /api/analytics/page-views - Page analytics (admin only)
- GET /api/analytics/popular-quests - Quest popularity metrics (admin only)
- GET /api/analytics/journey/:userId - Learning journey summary (admin/parent)
- GET /api/analytics/errors - Error summary (admin only)
- GET /api/analytics/event-counts - Event counts by category (admin only)
"""

from flask import Blueprint, request, jsonify, g
from utils.auth.decorators import require_auth
from services.analytics_service import AnalyticsService
from datetime import datetime, timedelta
from utils.logger import get_logger
from middleware.activity_tracker import track_custom_event
from database import get_supabase_admin_client

logger = get_logger(__name__)

analytics_bp = Blueprint('analytics', __name__)
analytics_service = AnalyticsService()


@analytics_bp.route('/activity/track', methods=['POST'])
@require_auth
def track_activity():
    """
    Manual event tracking endpoint for frontend.

    Request body:
    {
        "event_type": "quest_started",
        "event_category": "quest",
        "event_data": {"quest_id": "123", "quest_title": "Learn Python"},
        "page_url": "/quests/123",
        "referrer_url": "/dashboard",
        "duration_ms": 5000
    }
    """
    try:
        data = request.get_json()

        if not data or 'event_type' not in data:
            return jsonify({'error': 'event_type is required'}), 400

        # Extract event details
        event_type = data.get('event_type')
        event_category = data.get('event_category', 'other')
        event_data = data.get('event_data', {})
        page_url = data.get('page_url')
        referrer_url = data.get('referrer_url')
        duration_ms = data.get('duration_ms')

        # Get session ID from cookie
        session_id = request.cookies.get('session_id')
        if not session_id:
            return jsonify({'error': 'session_id cookie missing'}), 400

        # Insert event
        supabase = get_supabase_admin_client()
        supabase.table('user_activity_events').insert({
            'user_id': g.user_id,
            'session_id': session_id,
            'event_type': event_type,
            'event_category': event_category,
            'event_data': event_data,
            'page_url': page_url,
            'referrer_url': referrer_url,
            'user_agent': request.headers.get('User-Agent'),
            'duration_ms': duration_ms
        }).execute()

        return jsonify({'success': True}), 200

    except Exception as e:
        logger.error(f"Error tracking activity: {str(e)}")
        return jsonify({'error': 'Failed to track activity'}), 500


@analytics_bp.route('/engagement/<user_id>', methods=['GET'])
@require_auth
def get_engagement_metrics(user_id):
    """
    Get user engagement metrics.

    Query params:
    - days: Number of days to analyze (default: 30)

    Access: Admin or parent of the user
    """
    try:
        # Check permissions: admin or parent of the user
        if not _can_view_user_analytics(g.user_id, user_id):
            return jsonify({'error': 'Unauthorized'}), 403

        days = request.args.get('days', 30, type=int)

        metrics = analytics_service.get_user_engagement_metrics(user_id, days)

        return jsonify(metrics), 200

    except Exception as e:
        logger.error(f"Error fetching engagement metrics: {str(e)}")
        return jsonify({'error': 'Failed to fetch engagement metrics'}), 500


@analytics_bp.route('/at-risk-students', methods=['GET'])
@require_auth
def get_at_risk_students():
    """
    Get list of students at risk of dropping out.

    Query params:
    - days: Number of days to analyze (default: 30)
    - threshold: Risk score threshold (default: 0.7)

    Access: Admin only
    """
    try:
        # Check if user is admin
        if not _is_admin(g.user_id):
            return jsonify({'error': 'Admin access required'}), 403

        days = request.args.get('days', 30, type=int)
        threshold = request.args.get('threshold', 0.7, type=float)

        at_risk = analytics_service.get_at_risk_students(days, threshold)

        return jsonify({'at_risk_students': at_risk}), 200

    except Exception as e:
        logger.error(f"Error fetching at-risk students: {str(e)}")
        return jsonify({'error': 'Failed to fetch at-risk students'}), 500


@analytics_bp.route('/page-views', methods=['GET'])
@require_auth
def get_page_views():
    """
    Get page view analytics.

    Query params:
    - start_date: Start date (ISO format, default: 30 days ago)
    - end_date: End date (ISO format, default: today)
    - page_path: Optional filter for specific page

    Access: Admin only
    """
    try:
        # Check if user is admin
        if not _is_admin(g.user_id):
            return jsonify({'error': 'Admin access required'}), 403

        # Parse dates
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=30)

        if request.args.get('start_date'):
            start_date = datetime.fromisoformat(request.args.get('start_date'))
        if request.args.get('end_date'):
            end_date = datetime.fromisoformat(request.args.get('end_date'))

        page_path = request.args.get('page_path')

        analytics = analytics_service.get_page_analytics(start_date, end_date, page_path)

        return jsonify({'page_analytics': analytics}), 200

    except Exception as e:
        logger.error(f"Error fetching page analytics: {str(e)}")
        return jsonify({'error': 'Failed to fetch page analytics'}), 500


@analytics_bp.route('/popular-quests', methods=['GET'])
@require_auth
def get_popular_quests():
    """
    Get most popular quests based on engagement.

    Query params:
    - days: Number of days to analyze (default: 30)
    - limit: Max number of quests (default: 10)

    Access: Admin only
    """
    try:
        # Check if user is admin
        if not _is_admin(g.user_id):
            return jsonify({'error': 'Admin access required'}), 403

        days = request.args.get('days', 30, type=int)
        limit = request.args.get('limit', 10, type=int)

        popular = analytics_service.get_popular_quests(days, limit)

        return jsonify({'popular_quests': popular}), 200

    except Exception as e:
        logger.error(f"Error fetching popular quests: {str(e)}")
        return jsonify({'error': 'Failed to fetch popular quests'}), 500


@analytics_bp.route('/journey/<user_id>', methods=['GET'])
@require_auth
def get_learning_journey(user_id):
    """
    Get learning journey summary for parent dashboard.

    Access: Admin or parent of the user
    """
    try:
        # Check permissions
        if not _can_view_user_analytics(g.user_id, user_id):
            return jsonify({'error': 'Unauthorized'}), 403

        journey = analytics_service.get_learning_journey_summary(user_id)

        return jsonify(journey), 200

    except Exception as e:
        logger.error(f"Error fetching learning journey: {str(e)}")
        return jsonify({'error': 'Failed to fetch learning journey'}), 500


@analytics_bp.route('/errors', methods=['GET'])
@require_auth
def get_error_summary():
    """
    Get error summary for debugging.

    Query params:
    - days: Number of days to analyze (default: 7)

    Access: Admin only
    """
    try:
        # Check if user is admin
        if not _is_admin(g.user_id):
            return jsonify({'error': 'Admin access required'}), 403

        days = request.args.get('days', 7, type=int)

        errors = analytics_service.get_error_summary(days)

        return jsonify(errors), 200

    except Exception as e:
        logger.error(f"Error fetching error summary: {str(e)}")
        return jsonify({'error': 'Failed to fetch error summary'}), 500


@analytics_bp.route('/event-counts', methods=['GET'])
@require_auth
def get_event_counts():
    """
    Get event counts by category.

    Query params:
    - start_date: Start date (ISO format, default: 30 days ago)
    - end_date: End date (ISO format, default: today)
    - user_id: Optional filter for specific user

    Access: Admin only (or own data for non-admins)
    """
    try:
        # Parse dates
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=30)

        if request.args.get('start_date'):
            start_date = datetime.fromisoformat(request.args.get('start_date'))
        if request.args.get('end_date'):
            end_date = datetime.fromisoformat(request.args.get('end_date'))

        user_id = request.args.get('user_id')

        # If user_id specified, check permissions
        if user_id:
            if not _can_view_user_analytics(g.user_id, user_id):
                return jsonify({'error': 'Unauthorized'}), 403
        else:
            # Admin only for global stats
            if not _is_admin(g.user_id):
                return jsonify({'error': 'Admin access required'}), 403

        counts = analytics_service.get_event_counts_by_category(start_date, end_date, user_id)

        return jsonify({'event_counts': counts}), 200

    except Exception as e:
        logger.error(f"Error fetching event counts: {str(e)}")
        return jsonify({'error': 'Failed to fetch event counts'}), 500


# Helper functions
def _is_admin(user_id: str) -> bool:
    """Check if user is admin."""
    try:
        supabase = get_supabase_admin_client()
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()

        return user_response.data.get('role') == 'admin' if user_response.data else False

    except Exception as e:
        logger.error(f"Error checking admin status: {str(e)}")
        return False


def _can_view_user_analytics(viewer_id: str, target_user_id: str) -> bool:
    """
    Check if viewer can view target user's analytics.
    Allowed if:
    - Viewer is admin
    - Viewer is viewing their own data
    - Viewer is parent of target user
    """
    try:
        # Allow viewing own data
        if viewer_id == target_user_id:
            return True

        # Check if admin
        if _is_admin(viewer_id):
            return True

        # Check if parent of target user
        supabase = get_supabase_admin_client()
        parent_link_response = supabase.table('parent_student_links').select('id').eq(
            'parent_id', viewer_id
        ).eq('student_id', target_user_id).execute()

        return len(parent_link_response.data) > 0 if parent_link_response.data else False

    except Exception as e:
        logger.error(f"Error checking analytics permissions: {str(e)}")
        return False
