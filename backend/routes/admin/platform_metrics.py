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


def _daily_series(supabase, days):
    """The daily series, with "who is Optio" handed to the database.

    The comment-loop columns split comments by author, and the designated
    Optio staff accounts are a Config list the database cannot see; passing
    them keeps "Optio" meaning the same thing on the chart as in the thread
    (utils.platform_staff). Superadmin qualifies by role regardless.

    Migrations are applied by hand and prod deploys on green tests, so for a
    window the backend can be ahead of the function. PostgREST answers a
    signature it does not have with PGRST202; fall back to the old one-arg
    form, and the chart shows no comment series until the migration lands
    rather than no charts at all.
    """
    from utils.platform_staff import _staff_emails
    emails = sorted({e.strip().lower() for e in _staff_emails() if e and e.strip()})
    try:
        return supabase.rpc('admin_platform_metrics_daily',
                            {'p_days': days, 'p_platform_emails': emails}).execute()
    except Exception as e:  # noqa: BLE001 -- the fallback is the point
        if 'PGRST202' not in str(e) and 'admin_platform_metrics_daily(p_days, p_platform_emails)' not in str(e):
            raise
        logger.warning('admin_platform_metrics_daily has no p_platform_emails yet; '
                       'the 20260914120000 migration has not been applied')
        return supabase.rpc('admin_platform_metrics_daily', {'p_days': days}).execute()


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
        result = _daily_series(supabase, days)

        return jsonify({
            'days': result.data or [],
            'period_days': days
        })

    except Exception as e:
        logger.error(f"Error fetching platform metrics: {e}")
        return jsonify({'error': 'Failed to fetch platform metrics'}), 500
