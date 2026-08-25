"""
Platform Metrics Routes
=======================

Daily platform-health series for the superadmin home charts.

All routes require superadmin role.

Endpoints:
    GET /api/admin/platform-metrics/daily - Daily metrics for the last N days
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_superadmin
from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)

platform_metrics_bp = Blueprint('platform_metrics', __name__)


@platform_metrics_bp.route('/platform-metrics/daily', methods=['GET'])
@require_superadmin
def get_daily_platform_metrics(user_id):
    """
    One row per UTC calendar day (zero-filled) with signups, DAU, learning
    activity, auth success/failure counts, and SIS payments collected.

    Query params:
        - days: Number of days to look back (default: 30, max: 90)

    Aggregation lives in the admin_platform_metrics_daily SQL function: the
    biggest source (user_activity_events) grows with the platform, so counting
    in Postgres is the only shape that can't truncate or slow down over time.
    """
    try:
        days = min(max(int(request.args.get('days', 30)), 1), 90)

        # admin client justified: superadmin-only route — needs RLS bypass for
        # platform-wide aggregation
        supabase = get_supabase_admin_client()
        result = supabase.rpc('admin_platform_metrics_daily', {'p_days': days}).execute()

        return jsonify({
            'days': result.data or [],
            'period_days': days
        })

    except Exception as e:
        logger.error(f"Error fetching platform metrics: {e}")
        return jsonify({'error': 'Failed to fetch platform metrics'}), 500
