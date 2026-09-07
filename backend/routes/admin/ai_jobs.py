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

    except Exception:
        raise


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

    except Exception:
        raise


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

    except Exception:
        raise


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

    except Exception:
        raise
