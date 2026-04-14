"""
Moderation API.

User-facing endpoints to report content and block users. Required for
App Store Guideline 1.2 compliance (user-generated content).

Admin endpoints to review the report queue live under /api/admin/moderation.
"""

from flask import Blueprint, request, jsonify

from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('moderation', __name__, url_prefix='/api/moderation')

VALID_TARGET_TYPES = {'learning_event', 'task_completion', 'comment', 'user'}
VALID_REASONS = {'spam', 'harassment', 'inappropriate', 'self_harm', 'other'}


@bp.route('/report', methods=['POST'])
@require_auth
def report_content(user_id):
    """
    File a report against a feed item, comment, or user.

    Body:
        target_type (str): one of learning_event, task_completion, comment, user
        target_id (str): UUID of target
        reason (str): one of spam, harassment, inappropriate, self_harm, other
        notes (str, optional): free-text context (<=500 chars)
    """
    data = request.get_json() or {}

    target_type = data.get('target_type')
    target_id = data.get('target_id')
    reason = data.get('reason')
    notes = (data.get('notes') or '').strip()[:500] or None

    if target_type not in VALID_TARGET_TYPES:
        return jsonify({'error': f'target_type must be one of {sorted(VALID_TARGET_TYPES)}'}), 400
    if not target_id:
        return jsonify({'error': 'target_id is required'}), 400
    if reason not in VALID_REASONS:
        return jsonify({'error': f'reason must be one of {sorted(VALID_REASONS)}'}), 400

    # admin client justified: content_reports writes with reporter_id = @require_auth user_id; RLS would allow this but we write an audit trail even if reporter cannot select the target row under their RLS
    supabase = get_supabase_admin_client()

    try:
        existing = supabase.table('content_reports') \
            .select('id') \
            .eq('reporter_id', user_id) \
            .eq('target_type', target_type) \
            .eq('target_id', target_id) \
            .limit(1) \
            .execute()
        if existing.data:
            return jsonify({'success': True, 'message': 'Already reported', 'report_id': existing.data[0]['id']}), 200

        result = supabase.table('content_reports').insert({
            'reporter_id': user_id,
            'target_type': target_type,
            'target_id': target_id,
            'reason': reason,
            'notes': notes,
        }).execute()

        report_id = result.data[0]['id'] if result.data else None
        logger.info(f"Content report filed by {user_id[:8]} on {target_type}/{target_id[:8]}: {reason}")
        return jsonify({'success': True, 'report_id': report_id}), 201

    except Exception as e:
        logger.error(f"Error filing content report: {e}")
        return jsonify({'error': 'Failed to file report'}), 500


@bp.route('/block', methods=['POST'])
@require_auth
def block_user(user_id):
    """
    Block another user. Blocked users are hidden from the blocker's feed and
    cannot send them direct messages.

    Body:
        blocked_id (str): UUID of user to block
    """
    data = request.get_json() or {}
    blocked_id = data.get('blocked_id')

    if not blocked_id:
        return jsonify({'error': 'blocked_id is required'}), 400
    if blocked_id == user_id:
        return jsonify({'error': 'Cannot block yourself'}), 400

    # admin client justified: upsert into user_blocks with blocker_id = @require_auth user_id; ignore duplicate-row conflict via on_conflict so repeated taps are idempotent
    supabase = get_supabase_admin_client()
    try:
        supabase.table('user_blocks').upsert({
            'blocker_id': user_id,
            'blocked_id': blocked_id,
        }, on_conflict='blocker_id,blocked_id').execute()
        logger.info(f"User {user_id[:8]} blocked {blocked_id[:8]}")
        return jsonify({'success': True}), 201
    except Exception as e:
        logger.error(f"Error blocking user: {e}")
        return jsonify({'error': 'Failed to block user'}), 500


@bp.route('/block/<blocked_id>', methods=['DELETE'])
@require_auth
def unblock_user(user_id, blocked_id):
    """Remove a block."""
    # admin client justified: delete user_blocks row scoped to blocker_id = @require_auth user_id
    supabase = get_supabase_admin_client()
    try:
        supabase.table('user_blocks') \
            .delete() \
            .eq('blocker_id', user_id) \
            .eq('blocked_id', blocked_id) \
            .execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error unblocking user: {e}")
        return jsonify({'error': 'Failed to unblock user'}), 500


@bp.route('/blocks', methods=['GET'])
@require_auth
def list_blocks(user_id):
    """List users the caller has blocked."""
    # admin client justified: read user_blocks scoped to blocker_id = @require_auth user_id
    supabase = get_supabase_admin_client()
    try:
        result = supabase.table('user_blocks') \
            .select('blocked_id, created_at') \
            .eq('blocker_id', user_id) \
            .order('created_at', desc=True) \
            .execute()
        return jsonify({'blocks': result.data or []}), 200
    except Exception as e:
        logger.error(f"Error listing blocks: {e}")
        return jsonify({'error': 'Failed to list blocks'}), 500
