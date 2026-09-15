"""
Admin Moderation Queue.

Superadmin and org_admin review of user-filed content reports.
"""

from flask import Blueprint, request, jsonify
from datetime import datetime, timezone

from database import get_supabase_admin_client
from utils.auth.decorators import require_admin
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_moderation', __name__, url_prefix='/api/admin/moderation')

VALID_STATUSES = {'pending', 'reviewed', 'dismissed', 'actioned'}


@bp.route('/reports', methods=['GET'])
@require_admin
def list_reports(user_id):
    """
    List content reports for admin review.

    Query params:
        status (str, optional): filter by status. Default 'pending'.
        limit (int, optional): max rows. Default 50, max 200.
    """
    status = request.args.get('status', 'pending')
    if status != 'all' and status not in VALID_STATUSES:
        return jsonify({'error': f'status must be one of {sorted(VALID_STATUSES)} or "all"'}), 400

    try:
        limit = min(int(request.args.get('limit', 50)), 200)
    except ValueError:
        return jsonify({'error': 'limit must be an integer'}), 400

    # admin client justified: moderation queue is only reachable under @require_admin; reads content_reports across all users
    supabase = get_supabase_admin_client()
    try:
        query = supabase.table('content_reports').select('*')
        if status != 'all':
            query = query.eq('status', status)
        result = query.order('created_at', desc=True).limit(limit).execute()
        from services.content_takedown_service import with_previews
        return jsonify({'reports': with_previews(result.data or [])}), 200
    except Exception as e:
        logger.error(f"Error listing reports: {e}")
        return jsonify({'error': 'Failed to list reports'}), 500


@bp.route('/reports/<report_id>', methods=['PATCH'])
@require_admin
def update_report(user_id, report_id):
    """
    Update report status (reviewed, dismissed, actioned).

    Body:
        status (str): new status
    """
    data = request.get_json() or {}
    new_status = data.get('status')
    if new_status not in VALID_STATUSES:
        return jsonify({'error': f'status must be one of {sorted(VALID_STATUSES)}'}), 400

    # admin client justified: @require_admin-only endpoint updates content_reports status + reviewer audit fields across users
    supabase = get_supabase_admin_client()
    try:
        supabase.table('content_reports').update({
            'status': new_status,
            'reviewed_by': user_id,
            'reviewed_at': datetime.now(timezone.utc).isoformat(),
        }).eq('id', report_id).execute()
        logger.info(f"Admin {user_id[:8]} marked report {report_id[:8]} as {new_status}")

        # 'actioned' has a consequence for a peer comment or a message: it is
        # taken down (Friends phase 3). For every other target the status is
        # still the whole record, as it was before.
        takedown = None
        if new_status == 'actioned':
            from repositories.content_report_repository import ContentReportRepository
            from services.content_takedown_service import take_down
            report = ContentReportRepository().get(report_id)
            if report:
                takedown = take_down(report, user_id)
        return jsonify({'success': True, 'takedown': takedown}), 200
    except Exception as e:
        logger.error(f"Error updating report: {e}")
        return jsonify({'error': 'Failed to update report'}), 500


@bp.route('/internal/text-screen-sweep', methods=['POST'])
def text_screen_sweep():
    """Cron entrypoint: re-screen peer text that posted while the model was
    unavailable (Friends phase 3; see peer_text_screen_service.rescreen_pending).

    Runs inline, unlike the credit review sweep: each item is one short text
    and one small model call, and the per-tick limit keeps a tick well under
    the dispatcher's 120 seconds.

    Auth via X-Cron-Secret, or a signed-in superadmin for manual triggering --
    the same dual gate as the other sweeps.
    """
    from app_config import Config
    from utils.cron_auth import is_valid_cron_secret

    if not is_valid_cron_secret(request.headers.get('X-Cron-Secret')):
        from utils.session_manager import session_manager
        from utils.roles import get_effective_role
        uid = session_manager.get_effective_user_id()
        # admin client justified: one users row to confirm the caller is a superadmin before running the sweep by hand
        row = None
        if uid:
            row = get_supabase_admin_client().table('users').select('role') \
                .eq('id', uid).limit(1).execute().data
        if not (row and get_effective_role(row[0]) == 'superadmin'):
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401

    from services.peer_text_screen_service import rescreen_pending
    limit = request.args.get('limit', type=int) or Config.PEER_TEXT_SCREEN_SWEEP_LIMIT
    return jsonify({'success': True, **rescreen_pending(limit)}), 200
