"""
Admin Advisor Summary Routes
Endpoints for triggering daily advisor summary emails.
"""

from flask import Blueprint, request, jsonify
import os

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('advisor_summary', __name__, url_prefix='/api/admin/advisor-summary')


@bp.route('/trigger', methods=['POST'])
def trigger_advisor_summary():
    """
    Trigger the daily advisor summary job.
    Authenticated via X-Cron-Secret header (called by Render cron job).
    """
    cron_secret = os.getenv('CRON_SECRET')
    if not cron_secret:
        logger.error("CRON_SECRET not configured on backend")
        return jsonify({'error': 'Server misconfigured'}), 500

    provided_secret = request.headers.get('X-Cron-Secret')
    if not provided_secret or provided_secret != cron_secret:
        logger.warning("Unauthorized advisor summary trigger attempt")
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        from jobs.daily_advisor_summary import DailyAdvisorSummaryJob

        job_data = request.get_json(silent=True) or {}
        result = DailyAdvisorSummaryJob.execute(job_data)

        logger.info(f"Advisor summary triggered successfully: {result}")
        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Advisor summary trigger failed: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@bp.route('/test', methods=['POST'])
def test_advisor_summary():
    """
    Test endpoint for advisor summary (superadmin only, no cron secret needed).
    Sends a test summary to the requesting user.
    """
    from utils.auth.decorators import require_role
    from functools import wraps

    # Inline auth check since we can't stack decorators easily here
    from middleware.session_manager import get_session
    session = get_session()
    if not session or not session.get('user_id'):
        return jsonify({'error': 'Unauthorized'}), 401

    user_id = session['user_id']
    role = session.get('role', '')
    if role != 'superadmin':
        return jsonify({'error': 'Forbidden'}), 403

    try:
        from jobs.daily_advisor_summary import DailyAdvisorSummaryJob

        job_data = {
            'advisor_ids': [user_id],
            'is_test': True
        }
        result = DailyAdvisorSummaryJob.execute(job_data)

        logger.info(f"Test advisor summary triggered by {user_id}: {result}")
        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Test advisor summary failed: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
