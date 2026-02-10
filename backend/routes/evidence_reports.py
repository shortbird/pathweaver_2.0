"""
Evidence Reports API Routes

Endpoints for creating, managing, and viewing shareable evidence reports.
Students can create reports to share selected quest/course evidence with
anyone via a public URL. Includes PDF download functionality.

Routes:
- POST /api/evidence-reports - Create new report
- GET /api/evidence-reports - List user's reports
- GET /api/evidence-reports/:id - Get report details (owner only)
- PATCH /api/evidence-reports/:id - Update report
- DELETE /api/evidence-reports/:id - Deactivate report
- GET /api/public/report/:token - Public report view
- GET /api/public/report/:token/pdf - Download PDF
- POST /api/evidence-reports/:id/approve - Parent approves report
- POST /api/evidence-reports/:id/deny - Parent denies report
- GET /api/evidence-reports/pending-approvals - Parent's pending approvals
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth, validate_uuid_param
from utils.api_response_v1 import success_response, error_response
from middleware.rate_limiter import rate_limit
from services.evidence_report_service import EvidenceReportService
from services.base_service import ValidationError, NotFoundError, PermissionError
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('evidence_reports', __name__)


# =============================================================================
# Authenticated Routes (Student)
# =============================================================================

@bp.route('/api/evidence-reports', methods=['POST'])
@require_auth
@rate_limit(limit=20, per=3600)  # 20 reports per hour
def create_evidence_report(user_id: str):
    """
    Create a new evidence report.

    Request Body:
        title: str - Report title (optional, defaults to 'Evidence Report')
        description: str - Report description (optional)
        included_quest_ids: list[str] - Quest UUIDs to include
        included_course_ids: list[str] - Course UUIDs to include
        include_learning_events: bool - Include learning events (default: false)
        include_xp_summary: bool - Include XP summary (default: true)
        include_skills_breakdown: bool - Include skills breakdown (default: true)

    Returns:
        201: Created report with access_token and shareable URL
        400: Validation error
        500: Server error
    """
    try:
        data = request.json or {}

        service = EvidenceReportService()
        report = service.create_report(
            user_id=user_id,
            title=data.get('title', 'Evidence Report'),
            description=data.get('description'),
            included_quest_ids=data.get('included_quest_ids', []),
            included_course_ids=data.get('included_course_ids', []),
            include_learning_events=data.get('include_learning_events', False),
            include_xp_summary=data.get('include_xp_summary', True),
            include_skills_breakdown=data.get('include_skills_breakdown', True)
        )

        # Build shareable URL
        from app_config import Config
        frontend_url = Config.FRONTEND_URL
        share_url = f"{frontend_url}/report/{report['access_token']}"

        return success_response(
            data={
                'report': report,
                'share_url': share_url
            },
            status=201
        )

    except ValidationError as e:
        return error_response(
            code='VALIDATION_ERROR',
            message=str(e),
            status=400
        )
    except Exception as e:
        logger.error(f"Error creating evidence report: {str(e)}")
        return error_response(
            code='CREATE_REPORT_ERROR',
            message='Failed to create evidence report',
            status=500
        )


@bp.route('/api/evidence-reports', methods=['GET'])
@require_auth
def list_evidence_reports(user_id: str):
    """
    List all evidence reports created by the user.

    Returns:
        200: List of reports with analytics
    """
    try:
        service = EvidenceReportService()
        reports = service.get_user_reports(user_id)

        # Add shareable URLs
        from app_config import Config
        frontend_url = Config.FRONTEND_URL

        for report in reports:
            report['share_url'] = f"{frontend_url}/report/{report['access_token']}"

        return success_response(data={'reports': reports})

    except Exception as e:
        logger.error(f"Error listing evidence reports: {str(e)}")
        return error_response(
            code='LIST_REPORTS_ERROR',
            message='Failed to fetch reports',
            status=500
        )


@bp.route('/api/evidence-reports/<report_id>', methods=['GET'])
@require_auth
@validate_uuid_param('report_id')
def get_evidence_report(user_id: str, report_id: str):
    """
    Get a specific report by ID (owner only).

    Returns:
        200: Report details with analytics
        403: Not owner
        404: Report not found
    """
    try:
        service = EvidenceReportService()
        report = service.get_report_by_id(report_id, user_id)

        from app_config import Config
        frontend_url = Config.FRONTEND_URL
        report['share_url'] = f"{frontend_url}/report/{report['access_token']}"

        return success_response(data={'report': report})

    except NotFoundError:
        return error_response(
            code='REPORT_NOT_FOUND',
            message='Report not found',
            status=404
        )
    except PermissionError:
        return error_response(
            code='PERMISSION_DENIED',
            message='You do not have permission to view this report',
            status=403
        )
    except Exception as e:
        logger.error(f"Error fetching evidence report: {str(e)}")
        return error_response(
            code='GET_REPORT_ERROR',
            message='Failed to fetch report',
            status=500
        )


@bp.route('/api/evidence-reports/<report_id>', methods=['PATCH'])
@require_auth
@validate_uuid_param('report_id')
def update_evidence_report(user_id: str, report_id: str):
    """
    Update a report configuration.

    Request Body (all optional):
        title: str - New title
        description: str - New description
        included_quest_ids: list[str] - New quest list
        included_course_ids: list[str] - New course list
        include_learning_events: bool
        include_xp_summary: bool
        include_skills_breakdown: bool

    Returns:
        200: Updated report
        403: Not owner
        404: Report not found
    """
    try:
        data = request.json or {}

        service = EvidenceReportService()
        report = service.update_report(report_id, user_id, **data)

        return success_response(data={'report': report})

    except NotFoundError:
        return error_response(
            code='REPORT_NOT_FOUND',
            message='Report not found',
            status=404
        )
    except PermissionError:
        return error_response(
            code='PERMISSION_DENIED',
            message='You do not have permission to update this report',
            status=403
        )
    except Exception as e:
        logger.error(f"Error updating evidence report: {str(e)}")
        return error_response(
            code='UPDATE_REPORT_ERROR',
            message='Failed to update report',
            status=500
        )


@bp.route('/api/evidence-reports/<report_id>', methods=['DELETE'])
@require_auth
@validate_uuid_param('report_id')
def delete_evidence_report(user_id: str, report_id: str):
    """
    Deactivate (soft delete) a report.

    Returns:
        200: Success
        403: Not owner
        404: Report not found
    """
    try:
        service = EvidenceReportService()
        service.deactivate_report(report_id, user_id)

        return success_response(data={'message': 'Report deactivated'})

    except NotFoundError:
        return error_response(
            code='REPORT_NOT_FOUND',
            message='Report not found',
            status=404
        )
    except PermissionError:
        return error_response(
            code='PERMISSION_DENIED',
            message='You do not have permission to delete this report',
            status=403
        )
    except Exception as e:
        logger.error(f"Error deleting evidence report: {str(e)}")
        return error_response(
            code='DELETE_REPORT_ERROR',
            message='Failed to delete report',
            status=500
        )


# =============================================================================
# Public Routes (No Auth)
# =============================================================================

@bp.route('/api/public/report/<access_token>', methods=['GET'])
def get_public_report(access_token: str):
    """
    Get public report data for viewing.

    No authentication required - uses access token for authorization.

    Returns:
        200: Report data with evidence
        403: Pending parent approval
        404: Report not found or inactive
    """
    try:
        logger.info(f"[PUBLIC REPORT] Fetching report with token: {access_token[:16]}...")
        service = EvidenceReportService()
        report_data = service.get_public_report(access_token)
        logger.info(f"[PUBLIC REPORT] Successfully fetched report")

        return success_response(data=report_data)

    except NotFoundError:
        return error_response(
            code='REPORT_NOT_FOUND',
            message='Report not found or no longer available',
            status=404
        )
    except PermissionError as e:
        return error_response(
            code='PERMISSION_DENIED',
            message=str(e),
            status=403
        )
    except Exception as e:
        logger.error(f"Error fetching public report: {str(e)}")
        return error_response(
            code='GET_REPORT_ERROR',
            message='Failed to fetch report',
            status=500
        )


# =============================================================================
# Parent Approval Routes
# =============================================================================

@bp.route('/api/evidence-reports/<report_id>/approve', methods=['POST'])
@require_auth
@validate_uuid_param('report_id')
def approve_evidence_report(user_id: str, report_id: str):
    """
    Parent approves a minor's evidence report.

    Returns:
        200: Success
        404: Approval request not found
    """
    try:
        service = EvidenceReportService()
        service.approve_report(report_id, user_id)

        return success_response(data={'message': 'Report approved'})

    except NotFoundError:
        return error_response(
            code='APPROVAL_NOT_FOUND',
            message='Approval request not found or already processed',
            status=404
        )
    except Exception as e:
        logger.error(f"Error approving evidence report: {str(e)}")
        return error_response(
            code='APPROVE_ERROR',
            message='Failed to approve report',
            status=500
        )


@bp.route('/api/evidence-reports/<report_id>/deny', methods=['POST'])
@require_auth
@validate_uuid_param('report_id')
def deny_evidence_report(user_id: str, report_id: str):
    """
    Parent denies a minor's evidence report.

    Request Body (optional):
        reason: str - Denial reason

    Returns:
        200: Success
        404: Approval request not found
    """
    try:
        data = request.json or {}
        reason = data.get('reason')

        service = EvidenceReportService()
        service.deny_report(report_id, user_id, reason)

        return success_response(data={'message': 'Report denied'})

    except NotFoundError:
        return error_response(
            code='APPROVAL_NOT_FOUND',
            message='Approval request not found or already processed',
            status=404
        )
    except Exception as e:
        logger.error(f"Error denying evidence report: {str(e)}")
        return error_response(
            code='DENY_ERROR',
            message='Failed to deny report',
            status=500
        )


@bp.route('/api/evidence-reports/pending-approvals', methods=['GET'])
@require_auth
def get_pending_approvals(user_id: str):
    """
    Get pending approval requests for a parent.

    Returns:
        200: List of pending approvals
    """
    try:
        service = EvidenceReportService()
        approvals = service.get_pending_approvals(user_id)

        return success_response(data={'approvals': approvals})

    except Exception as e:
        logger.error(f"Error fetching pending approvals: {str(e)}")
        return error_response(
            code='GET_APPROVALS_ERROR',
            message='Failed to fetch pending approvals',
            status=500
        )


# =============================================================================
# Helper endpoint to get available quests/courses for report
# =============================================================================

@bp.route('/api/evidence-reports/available-content', methods=['GET'])
@require_auth
def get_available_content(user_id: str):
    """
    Get quests and courses available for the user to include in a report.

    Returns quests with approved tasks and courses the user is enrolled in.

    Returns:
        200: Lists of available quests and courses
    """
    try:
        from database import get_supabase_admin_client
        supabase = get_supabase_admin_client()

        # Get user's quests with approved tasks
        user_quests = supabase.table('user_quests')\
            .select('''
                id,
                quest_id,
                completed_at,
                quests!inner(id, title, description)
            ''')\
            .eq('user_id', user_id)\
            .execute()

        quests = []
        for uq in (user_quests.data or []):
            quest = uq.get('quests')
            if quest:
                # Count approved tasks for this quest
                task_count = supabase.table('user_quest_tasks')\
                    .select('id', count='exact')\
                    .eq('user_id', user_id)\
                    .eq('quest_id', quest['id'])\
                    .eq('approval_status', 'approved')\
                    .execute()

                if task_count.count and task_count.count > 0:
                    quests.append({
                        'id': quest['id'],
                        'title': quest['title'],
                        'description': quest.get('description'),
                        'completed_at': uq.get('completed_at'),
                        'approved_task_count': task_count.count
                    })

        # Get user's course enrollments
        enrollments = supabase.table('course_enrollments')\
            .select('''
                id,
                course_id,
                courses!inner(id, title, description)
            ''')\
            .eq('user_id', user_id)\
            .execute()

        courses = []
        for enrollment in (enrollments.data or []):
            course = enrollment.get('courses')
            if course:
                courses.append({
                    'id': course['id'],
                    'title': course['title'],
                    'description': course.get('description')
                })

        return success_response(data={
            'quests': quests,
            'courses': courses
        })

    except Exception as e:
        logger.error(f"Error fetching available content: {str(e)}")
        return error_response(
            code='GET_CONTENT_ERROR',
            message='Failed to fetch available content',
            status=500
        )
