"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Uses JobScheduler (service layer), QualityMonitor and AIQuestMaintenanceService lazy-imported
- Job management functionality (scheduling, monitoring, execution)
- Service layer essential for complex job orchestration
- No direct database calls for business logic - delegated to services

Admin AI Jobs Routes
Endpoints for managing AI content generation and quality monitoring jobs.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_role
from app_config import Config
from jobs.scheduler import JobScheduler
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

ai_jobs_bp = Blueprint('ai_jobs', __name__)


@ai_jobs_bp.route('/jobs/schedule', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def schedule_job(user_id):
    """Schedule a new AI job."""
    try:
        data = request.get_json()
        job_type = data.get('job_type')
        job_data = data.get('job_data', {})
        scheduled_for_str = data.get('scheduled_for')
        priority = data.get('priority', 5)

        if not job_type:
            return jsonify({'error': 'job_type is required'}), 400

        scheduled_for = None
        if scheduled_for_str:
            scheduled_for = datetime.fromisoformat(scheduled_for_str.replace('Z', '+00:00'))

        job_id = JobScheduler.schedule_job(
            job_type=job_type,
            job_data=job_data,
            scheduled_for=scheduled_for,
            priority=priority
        )

        return jsonify({
            'message': 'Job scheduled successfully',
            'job_id': job_id,
            'job_type': job_type,
            'scheduled_for': scheduled_for.isoformat() if scheduled_for else datetime.utcnow().isoformat()
        }), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@ai_jobs_bp.route('/jobs/run', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def run_jobs(user_id):
    """Execute pending jobs immediately."""
    try:
        data = request.get_json() or {}
        max_jobs = data.get('max_jobs', 10)

        result = JobScheduler.run_pending_jobs(max_jobs=max_jobs)

        return jsonify({
            'message': 'Jobs executed',
            'summary': result
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@ai_jobs_bp.route('/jobs/history', methods=['GET'])
@require_role('superadmin', 'org_admin', 'advisor')
def get_job_history(user_id):
    """Get job execution history."""
    try:
        job_type = request.args.get('job_type')
        status = request.args.get('status')
        limit = int(request.args.get('limit', 50))

        history = JobScheduler.get_job_history(
            job_type=job_type,
            status=status,
            limit=limit
        )

        return jsonify({
            'total': len(history),
            'jobs': history
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Removed 2026-04-13 (M1 cleanup): /content/generate, /quality/audit,
# /quality/report, /quests/performance/<id>, /quests/analyze-all,
# /quests/suggestions/<id>, /metrics/update, /reports/monthly. All depended on
# services.ai_quest_maintenance_service or jobs.quality_monitor (both deleted
# in earlier audits). Endpoints had been silently 500-ing for months.


@ai_jobs_bp.route('/jobs/cleanup', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def cleanup_old_jobs(user_id):
    """Clean up old completed/failed jobs."""
    try:
        data = request.get_json() or {}
        days_old = data.get('days_old', 30)

        deleted_count = JobScheduler.cleanup_old_jobs(days_old=days_old)

        return jsonify({
            'message': 'Old jobs cleaned up',
            'deleted_count': deleted_count
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@ai_jobs_bp.route('/recurring/setup', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def setup_recurring_jobs(user_id):
    """Schedule recurring jobs (daily, weekly, monthly tasks)."""
    try:
        JobScheduler.schedule_recurring_jobs()

        return jsonify({
            'message': 'Recurring jobs scheduled successfully'
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@ai_jobs_bp.route('/advisor-summary/test', methods=['POST'])
@require_role('superadmin')
def test_advisor_summary(user_id):
    """
    Test the daily advisor summary email.

    Superadmin-only endpoint for testing the daily advisor summary feature.
    Can send a test email for any advisor or preview the summary data.

    Request body (all optional):
        - advisor_id: UUID of advisor to generate summary for (defaults to current user)
        - summary_date: ISO date string (defaults to yesterday)
        - send_email: Boolean, whether to actually send the email (default: true)
        - preview_only: Boolean, just return the summary data without sending (default: false)

    Examples:
        POST /api/admin/jobs/advisor-summary/test
        {}  # Sends summary for current user (superadmin) for yesterday

        POST /api/admin/jobs/advisor-summary/test
        {"preview_only": true}  # Just returns summary data

        POST /api/admin/jobs/advisor-summary/test
        {"advisor_id": "uuid-here", "summary_date": "2026-02-14"}
    """
    try:
        from services.daily_summary_service import DailySummaryService
        from jobs.daily_advisor_summary import DailyAdvisorSummaryJob
        from services.email_service import email_service
        from datetime import timedelta

        data = request.get_json() or {}
        advisor_id = data.get('advisor_id', user_id)  # Default to current user
        summary_date_str = data.get('summary_date')
        preview_only = data.get('preview_only', False)
        send_email = data.get('send_email', True)

        # Parse summary date
        if summary_date_str:
            summary_date = datetime.fromisoformat(summary_date_str).date()
        else:
            summary_date = (datetime.utcnow() - timedelta(days=1)).date()

        # Generate summary
        summary_service = DailySummaryService()
        summary = summary_service.get_advisor_daily_summary(
            advisor_id=advisor_id,
            summary_date=summary_date
        )

        # If preview only, return the data
        if preview_only:
            return jsonify({
                'message': 'Preview generated (no email sent)',
                'summary': summary
            }), 200

        # Build and send email
        if send_email:
            advisor_info = summary['advisor']
            advisor_email = advisor_info.get('email')
            advisor_name = advisor_info.get('display_name', 'Advisor')

            if not advisor_email:
                return jsonify({
                    'error': 'Advisor has no email address',
                    'summary': summary
                }), 400

            formatted_date = summary_date.strftime('%B %d, %Y')
            frontend_url = Config.FRONTEND_URL

            # Build the student sections HTML (marked safe for Jinja2)
            from markupsafe import Markup
            students_html = Markup(DailyAdvisorSummaryJob._build_students_html(summary))

            # Send using templated email system for consistent branding
            success = email_service.send_templated_email(
                to_email=advisor_email,
                subject=f"[TEST] Morning Briefing: Your Students' Progress - {formatted_date}",
                template_name='daily_advisor_summary',
                context={
                    'advisor_name': advisor_name,
                    'summary_date': formatted_date,
                    'subject_prefix': '[TEST] ',
                    'active_students': summary['totals']['active_students'],
                    'total_tasks': summary['totals']['total_tasks'],
                    'total_xp': summary['totals']['total_xp'],
                    'closing_html': students_html,
                    'dashboard_url': f"{frontend_url}/advisor"
                }
            )

            if success:
                return jsonify({
                    'message': f'Test email sent to {advisor_email}',
                    'advisor_id': advisor_id,
                    'summary_date': summary_date.isoformat(),
                    'summary': summary
                }), 200
            else:
                return jsonify({
                    'error': 'Failed to send email',
                    'summary': summary
                }), 500

        return jsonify({
            'message': 'Summary generated',
            'summary': summary
        }), 200

    except Exception as e:
        logger.error(f"Error testing advisor summary: {e}")
        return jsonify({'error': str(e)}), 500


@ai_jobs_bp.route('/advisor-summary/trigger', methods=['POST'])
def trigger_advisor_summary_job():
    """
    Trigger the full daily advisor summary job.

    Runs the complete job that sends summaries to ALL advisors with students.
    This is the same job that runs automatically at 5 AM.

    Authentication: Either superadmin session OR X-Cron-Secret header.

    Request body (optional):
        - summary_date: ISO date string (defaults to yesterday)
        - advisor_ids: List of specific advisor UUIDs to process (defaults to all)
    """
    # Check for cron secret OR superadmin auth
    cron_secret = request.headers.get('X-Cron-Secret')
    expected_secret = Config.CRON_SECRET

    if cron_secret and expected_secret and cron_secret == expected_secret:
        # Valid cron request
        logger.info("Advisor summary triggered via cron")
    else:
        # Fall back to requiring superadmin auth
        from utils.auth.decorators import get_current_user, get_effective_role
        user = get_current_user()
        if not user or get_effective_role(user) != 'superadmin':
            return jsonify({'error': 'Unauthorized'}), 401

    try:
        from jobs.daily_advisor_summary import DailyAdvisorSummaryJob

        data = request.get_json() or {}

        job_data = {}
        if data.get('summary_date'):
            job_data['summary_date'] = data['summary_date']
        if data.get('advisor_ids'):
            job_data['advisor_ids'] = data['advisor_ids']

        # Execute directly instead of via scheduler to avoid
        # running stale pending jobs of other types
        result = DailyAdvisorSummaryJob.execute(job_data)

        return jsonify({
            'message': 'Daily advisor summary job triggered',
            'result': result
        }), 200

    except Exception as e:
        logger.error(f"Error triggering advisor summary job: {e}")
        return jsonify({'error': str(e)}), 500
