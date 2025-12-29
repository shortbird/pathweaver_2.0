"""
Analytics API routes for activity tracking and insights.

Simplified endpoints:
- GET /api/analytics/popular-quests - Quest popularity metrics (admin only)
- GET /api/analytics/event-counts - Event counts by category (admin only)

REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Already uses AnalyticsService (service layer pattern) - best practice
- Only direct DB call is _is_admin helper (simple role check)
- Helper could use UserRepository, but query is trivial and acceptable
"""

from flask import Blueprint, request, jsonify, g
from utils.auth.decorators import require_auth
from services.analytics_service import AnalyticsService
from datetime import datetime, timedelta
from utils.logger import get_logger
from database import get_supabase_admin_client

logger = get_logger(__name__)

analytics_bp = Blueprint('analytics', __name__)
analytics_service = AnalyticsService()


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

        # Admin only (no user viewing their own data)
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

        return user_response.data.get('role') in ['admin', 'superadmin'] if user_response.data else False

    except Exception as e:
        logger.error(f"Error checking admin status: {str(e)}")
        return False
