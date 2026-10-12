"""
Platform Metrics Routes
=======================

Daily platform-health series for the superadmin home charts.

All routes require superadmin role.

Endpoints:
    GET /api/admin/platform-metrics/daily     - Daily metrics for the last N days
    GET /api/admin/platform-metrics/analytics - Google Analytics traffic for the last N days
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_superadmin
from database import get_supabase_admin_client
from services import google_analytics_service
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


@platform_metrics_bp.route('/platform-metrics/analytics', methods=['GET'])
@require_superadmin
def get_analytics_overview(user_id):
    """
    Website traffic from the GA4 property both the web platform and the
    marketing site tag into: daily visitors and sessions (zero-filled),
    sessions by acquisition channel and page views by path, each ranked, and
    the sign-up funnel (marketing-site visitors, sign-up page visitors, then
    accounts created from our own users table).

    Query params:
        - days: Number of days to look back (default: 30, max: 90)

    `{"configured": false}` when the service account or property id is not
    set; the page hides the section rather than showing empty charts. The
    GA4 Data API's own errors are logged in full and answered with a generic
    502 -- the body names the GCP project and grant, which is nobody else's.
    """
    if not google_analytics_service.is_configured():
        return jsonify({'configured': False})

    try:
        days = int(request.args.get('days', 30))
    except ValueError:
        return jsonify({'error': 'days must be a number'}), 400
    days = min(max(days, 1), google_analytics_service.MAX_DAYS)
    try:
        data = google_analytics_service.fetch_overview(days)
    except google_analytics_service.GoogleAnalyticsError as e:
        logger.error(f"Error fetching Google Analytics overview: {e}")
        return jsonify({'error': 'Google Analytics is unavailable'}), 502
    if isinstance(data.get('funnel'), dict):
        data = {**data, 'funnel': {**data['funnel'], **_accounts_created(days)}}
    return jsonify({'configured': True, **data})


def _accounts_created(days):
    """The funnel's last stage (activity_metrics_service.accounts_created). A
    failed count leaves the stage out rather than claiming zero."""
    from services import activity_metrics_service
    try:
        return activity_metrics_service.accounts_created(days)
    except Exception as e:  # noqa: BLE001 -- one stage, not the section
        logger.warning(f'Could not count new accounts for the funnel: {e}')
        return {}


@platform_metrics_bp.route('/platform-metrics/orgs', methods=['GET'])
@require_superadmin
def get_org_activity(user_id):
    """
    Activity per organization for the window, plus one row for platform users
    with no org: members, active users this window and the one before, tasks
    this window and the one before, evidence, messages sent, students gone
    quiet, open SIS alerts, last seen.

    Query params:
        - days: Number of days to look back (default: 30, max: 90)
    """
    from services import activity_metrics_service
    days = request.args.get('days', 30)
    rows = activity_metrics_service.org_activity(days)
    return jsonify({'orgs': rows, 'period_days': activity_metrics_service.clamp_days(days, 30)})


@platform_metrics_bp.route('/platform-metrics/pipelines', methods=['GET'])
@require_superadmin
def get_platform_pipelines(user_id):
    """
    The queues that move people forward: credit review (requested, waiting on
    a school, waiting on Optio, approved, sent back), the CRM (leads,
    conversions, email delivery), and tickets (open, aging, resolved).

    Query params:
        - days: Number of days to look back (default: 30, max: 90)
    """
    from services import activity_metrics_service
    days = request.args.get('days', 30)
    return jsonify({**activity_metrics_service.platform_pipelines(days),
                    'period_days': activity_metrics_service.clamp_days(days, 30)})


@platform_metrics_bp.route('/platform-metrics/sign-in-trouble', methods=['GET'])
@require_superadmin
def get_sign_in_trouble(user_id):
    """
    People whose recent sign-ins keep failing and who have not signed in
    since: name, school, failures, whether they are locked out now. Emails
    with no account are included -- a family retyping a misspelled address
    is a fix too.
    """
    from services import activity_metrics_service
    return jsonify({'people': activity_metrics_service.sign_in_trouble(),
                    'window_days': activity_metrics_service.SIGN_IN_WINDOW_DAYS})
