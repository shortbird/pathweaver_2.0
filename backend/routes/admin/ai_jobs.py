"""
Admin AI Jobs Routes
Endpoints for managing AI content generation and quality monitoring jobs.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_admin
from jobs.scheduler import JobScheduler
from jobs.quality_monitor import QualityMonitor
from services.ai_quest_maintenance_service import AIQuestMaintenanceService
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

ai_jobs_bp = Blueprint('ai_jobs', __name__)


@ai_jobs_bp.route('/jobs/schedule', methods=['POST'])
@require_admin
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
@require_admin
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
@require_admin
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


@ai_jobs_bp.route('/content/generate', methods=['POST'])
@require_admin
def trigger_content_generation(user_id):
    """Trigger content generation immediately."""
    try:
        data = request.get_json()
        generation_type = data.get('generation_type')
        config = data.get('config', {})

        if not generation_type:
            return jsonify({'error': 'generation_type is required'}), 400

        job_data = {
            'generation_type': generation_type,
            **config
        }

        job_id = JobScheduler.schedule_job(
            job_type=JobScheduler.JOB_TYPE_CONTENT_GENERATION,
            job_data=job_data,
            priority=9
        )

        result = JobScheduler.run_pending_jobs(max_jobs=1)

        return jsonify({
            'message': 'Content generation triggered',
            'job_id': job_id,
            'result': result
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@ai_jobs_bp.route('/quality/audit', methods=['POST'])
@require_admin
def trigger_quality_audit(user_id):
    """Trigger quality audit immediately."""
    try:
        data = request.get_json() or {}
        check_type = data.get('check_type', 'daily_audit')
        config = data.get('config', {})

        job_data = {
            'check_type': check_type,
            **config
        }

        job_id = JobScheduler.schedule_job(
            job_type=JobScheduler.JOB_TYPE_QUALITY_MONITOR,
            job_data=job_data,
            priority=9
        )

        result = JobScheduler.run_pending_jobs(max_jobs=1)

        return jsonify({
            'message': 'Quality audit triggered',
            'job_id': job_id,
            'result': result
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@ai_jobs_bp.route('/quality/report', methods=['GET'])
@require_admin
def get_quality_report(user_id):
    """Get quality report for time period."""
    try:
        days = int(request.args.get('days', 30))
        report = QualityMonitor.get_quality_report(days=days)
        return jsonify(report), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@ai_jobs_bp.route('/quests/performance/<quest_id>', methods=['GET'])
@require_admin
def analyze_quest_performance(user_id, quest_id):
    """Analyze performance of a specific quest."""
    try:
        analysis = AIQuestMaintenanceService.analyze_quest_performance(quest_id)
        return jsonify(analysis), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@ai_jobs_bp.route('/quests/analyze-all', methods=['GET'])
@require_admin
def analyze_all_quests(user_id):
    """Analyze performance of all active quests."""
    try:
        analysis = AIQuestMaintenanceService.analyze_all_quests()
        return jsonify(analysis), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@ai_jobs_bp.route('/quests/suggestions/<quest_id>', methods=['GET'])
@require_admin
def get_improvement_suggestions(user_id, quest_id):
    """Get AI-powered improvement suggestions for a quest."""
    try:
        suggestions = AIQuestMaintenanceService.get_content_improvement_suggestions(quest_id)
        return jsonify(suggestions), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@ai_jobs_bp.route('/metrics/update', methods=['POST'])
@require_admin
def update_metrics(user_id):
    """Update AI content metrics immediately."""
    try:
        count = AIQuestMaintenanceService.update_ai_content_metrics()

        return jsonify({
            'message': 'Metrics updated',
            'updated_count': count
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@ai_jobs_bp.route('/reports/monthly', methods=['GET'])
@require_admin
def generate_monthly_report(user_id):
    """Generate comprehensive monthly report."""
    try:
        report = AIQuestMaintenanceService.generate_monthly_report()
        return jsonify(report), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@ai_jobs_bp.route('/jobs/cleanup', methods=['POST'])
@require_admin
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
@require_admin
def setup_recurring_jobs(user_id):
    """Schedule recurring jobs (daily, weekly, monthly tasks)."""
    try:
        JobScheduler.schedule_recurring_jobs()

        return jsonify({
            'message': 'Recurring jobs scheduled successfully'
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
