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
        return jsonify({'reports': result.data or []}), 200
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
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error updating report: {e}")
        return jsonify({'error': 'Failed to update report'}), 500
