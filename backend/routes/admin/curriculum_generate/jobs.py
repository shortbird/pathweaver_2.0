"""Async job queue and control endpoints.

Split from routes/admin/curriculum_generate.py on 2026-04-14 (Q1).
"""

"""
Admin Course Generation Routes
==============================

Multi-stage AI course generation wizard endpoints.
Creates hands-on, action-oriented courses through a 4-stage process.

Stages:
1. Outline - Generate course title and project outlines (3 alternatives)
2. Lessons - Generate lessons for each project
3. Tasks - Generate task suggestions for each lesson
4. Finalize - Publish the course

Endpoints:
- POST /api/admin/curriculum/generate/outline - Stage 1: Generate outline alternatives
- POST /api/admin/curriculum/generate/outline/select - Select outline and create draft
- GET /api/admin/curriculum/generate/<id> - Get current generation state
- POST /api/admin/curriculum/generate/<id>/lessons - Stage 2: Generate all lessons
- POST /api/admin/curriculum/generate/<id>/tasks - Stage 3: Generate all tasks
- POST /api/admin/curriculum/generate/<id>/finalize - Stage 4: Publish course
- POST /api/admin/curriculum/generate/<id>/regenerate-outline - Regenerate outline alternatives
- POST /api/admin/curriculum/generate/<id>/regenerate-lesson/<lesson_id> - Regenerate lesson
- POST /api/admin/curriculum/generate/<id>/regenerate-tasks/<lesson_id> - Regenerate tasks
- DELETE /api/admin/curriculum/generate/<id> - Delete draft course
"""

import threading
import time

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_role
from services.course_generation_service import CourseGenerationService
from services.course_generation_job_service import CourseGenerationJobService
from services.base_ai_service import AIGenerationError

from utils.logger import get_logger

logger = get_logger(__name__)

# Progress tracker for fix-images background job
_fix_images_progress = {
    'running': False,
    'total': 0,
    'completed': 0,
    'errors': 0,
    'logs': []
}



from routes.admin.curriculum_generate import bp


@bp.route('/<course_id>/queue', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def queue_generation(user_id, course_id):
    """
    Queue a course for background generation.

    After outline is approved, this endpoint queues the course for
    automatic lesson and task generation in the background.
    The job starts processing immediately in a background thread.

    Request body:
    {
        "auto_publish": true  // Optional: auto-publish when complete
    }

    Returns:
    {
        "success": true,
        "job_id": "uuid"
    }
    """
    try:
        import threading
        from services.course_generation_job_service import CourseGenerationJobService

        data = request.get_json() or {}
        auto_publish = data.get('auto_publish', False)

        organization_id = get_organization_id(user_id)
        job_service = CourseGenerationJobService()

        job_id = job_service.create_job(
            course_id=course_id,
            user_id=user_id,
            organization_id=organization_id,
            auto_publish=auto_publish
        )

        # Start processing immediately in a background thread
        from flask import current_app
        app = current_app._get_current_object()

        def process_in_background(jid, flask_app):
            with flask_app.app_context():
                try:
                    svc = CourseGenerationJobService()
                    # Process the requested job first
                    svc.process_job(jid)

                    # Then process any other pending jobs in the queue
                    while True:
                        pending = svc.get_pending_jobs(limit=1)
                        if not pending:
                            break
                        next_job_id = pending[0]['id']
                        logger.info(f"Processing next pending job: {next_job_id}")
                        svc.process_job(next_job_id)
                except Exception as e:
                    logger.error(f"Background job {jid} failed: {str(e)}")

        thread = threading.Thread(target=process_in_background, args=(job_id, app))
        thread.daemon = True
        thread.start()

        return jsonify({
            'success': True,
            'job_id': job_id
        }), 200

    except Exception as e:
        logger.error(f"Queue generation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@bp.route('/jobs', methods=['GET'])
@require_role('superadmin', 'org_admin', 'advisor')
def get_generation_jobs(user_id):
    """
    Get all generation jobs for the current user.

    Query params:
    - status: 'active' (pending/running), or specific status
    - limit: Max number of jobs (default 20)

    Returns:
    {
        "success": true,
        "jobs": [...]
    }
    """
    try:
        from services.course_generation_job_service import CourseGenerationJobService

        status = request.args.get('status')
        limit = int(request.args.get('limit', 20))

        job_service = CourseGenerationJobService()
        jobs = job_service.get_user_jobs(user_id, status=status, limit=limit)

        return jsonify({
            'success': True,
            'jobs': jobs
        }), 200

    except Exception as e:
        logger.error(f"Get jobs error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/jobs/<job_id>', methods=['GET'])
@require_role('superadmin', 'org_admin', 'advisor')
def get_job_status(user_id, job_id):
    """
    Get detailed status for a specific job including logs.

    Returns:
    {
        "success": true,
        "job": {
            "id": "uuid",
            "course_id": "uuid",
            "course_title": "...",
            "status": "generating_lessons",
            "current_step": "lessons",
            "current_item": "Project Name",
            "items_completed": 3,
            "items_total": 5,
            "logs": [...],
            ...
        }
    }
    """
    try:
        from services.course_generation_job_service import CourseGenerationJobService

        job_service = CourseGenerationJobService()
        job = job_service.get_job_status(job_id)

        if not job:
            return jsonify({
                'success': False,
                'error': 'Job not found'
            }), 404

        # Verify ownership
        # admin client justified: admin-only route (@require_admin/@require_superadmin) — needs RLS bypass for cross-tenant administration
        supabase = get_supabase_admin_client()
        job_record = supabase.table('course_generation_jobs').select('user_id').eq('id', job_id).execute()

        if job_record.data and job_record.data[0]['user_id'] != user_id:
            return jsonify({
                'success': False,
                'error': 'Not authorized'
            }), 403

        return jsonify({
            'success': True,
            'job': job
        }), 200

    except Exception as e:
        logger.error(f"Get job status error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/jobs/<job_id>/start', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def start_job(user_id, job_id):
    """
    Start a pending job that wasn't auto-started.

    Returns:
    {
        "success": true
    }
    """
    try:
        import threading
        from services.course_generation_job_service import CourseGenerationJobService

        job_service = CourseGenerationJobService()

        # Verify job exists and is pending
        job = job_service.get_job_status(job_id)
        if not job:
            return jsonify({
                'success': False,
                'error': 'Job not found'
            }), 404

        if job['status'] != 'pending':
            return jsonify({
                'success': False,
                'error': 'Job is not pending'
            }), 400

        # Start processing in background thread
        from flask import current_app
        app = current_app._get_current_object()

        def process_in_background(jid, flask_app):
            with flask_app.app_context():
                try:
                    svc = CourseGenerationJobService()
                    # Process the requested job first
                    svc.process_job(jid)

                    # Then process any other pending jobs in the queue
                    while True:
                        pending = svc.get_pending_jobs(limit=1)
                        if not pending:
                            break
                        next_job_id = pending[0]['id']
                        logger.info(f"Processing next pending job: {next_job_id}")
                        svc.process_job(next_job_id)
                except Exception as e:
                    logger.error(f"Background job {jid} failed: {str(e)}")

        thread = threading.Thread(target=process_in_background, args=(job_id, app))
        thread.daemon = True
        thread.start()

        return jsonify({
            'success': True
        }), 200

    except Exception as e:
        logger.error(f"Start job error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@bp.route('/jobs/<job_id>/cancel', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def cancel_job(user_id, job_id):
    """
    Cancel a pending or running job.

    Returns:
    {
        "success": true
    }
    """
    try:
        from services.course_generation_job_service import CourseGenerationJobService

        job_service = CourseGenerationJobService()
        job_service.cancel_job(job_id, user_id)

        return jsonify({
            'success': True
        }), 200

    except Exception as e:
        logger.error(f"Cancel job error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@bp.route('/jobs/<job_id>/retry', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def retry_job(user_id, job_id):
    """
    Retry a failed job by creating a new one.

    Returns:
    {
        "success": true,
        "job_id": "uuid"  // New job ID
    }
    """
    try:
        from services.course_generation_job_service import CourseGenerationJobService

        job_service = CourseGenerationJobService()
        new_job_id = job_service.retry_job(job_id, user_id)

        return jsonify({
            'success': True,
            'job_id': new_job_id
        }), 200

    except Exception as e:
        logger.error(f"Retry job error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@bp.route('/jobs/process', methods=['POST'])
@require_role('superadmin', 'org_admin', 'advisor')
def process_next_job(user_id):
    """
    Process the next pending job.

    This endpoint can be called manually or by a cron job to
    process queued generation jobs.

    Returns:
    {
        "success": true,
        "result": {
            "job_id": "uuid",
            "status": "success" | "failed"
        }
    }
    """
    try:
        from services.course_generation_job_service import CourseGenerationJobService

        job_service = CourseGenerationJobService()
        result = job_service.run_next_job()

        if result is None:
            return jsonify({
                'success': True,
                'result': None,
                'message': 'No pending jobs'
            }), 200

        return jsonify({
            'success': True,
            'result': result
        }), 200

    except Exception as e:
        logger.error(f"Process job error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# =============================================================================
# BULK GENERATION
# =============================================================================

