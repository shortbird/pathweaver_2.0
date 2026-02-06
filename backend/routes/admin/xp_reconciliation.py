"""
XP Reconciliation Admin Endpoints

Provides tools for auditing and reconciling XP discrepancies between
completed tasks and user_skill_xp records.

Endpoints:
- GET /api/admin/xp/user/<id>/audit - Show expected vs actual XP for user
- POST /api/admin/xp/user/<id>/reconcile - Fix XP discrepancy for user
- GET /api/admin/xp/discrepancies - List all users with XP issues
- POST /api/admin/xp/batch-reconcile - Fix all XP discrepancies
- GET /api/admin/xp/failed-awards - List pending failed XP awards
- POST /api/admin/xp/retry-failed - Retry failed XP awards
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from utils.roles import get_effective_role
from utils.pillar_utils import normalize_pillar_name, PILLAR_KEYS
from services.xp_service import XPService
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('xp_reconciliation', __name__, url_prefix='/api/admin/xp')

xp_service = XPService()


def require_admin(user_id: str):
    """Check if user has admin access (superadmin or org_admin)."""
    supabase = get_supabase_admin_client()
    user_result = supabase.table('users')\
        .select('role, org_role, organization_id')\
        .eq('id', user_id)\
        .single()\
        .execute()

    if not user_result.data:
        return None, 'User not found'

    user = user_result.data
    effective_role = get_effective_role(user)

    if effective_role not in ('superadmin', 'org_admin'):
        return None, 'Admin access required'

    return user, None


def calculate_expected_xp(supabase, user_id: str) -> dict:
    """
    Calculate expected XP per pillar from completed tasks.

    Returns:
        Dict with pillar -> expected_xp
    """
    expected_xp = {pillar: 0 for pillar in PILLAR_KEYS}

    # Get all completed tasks with their XP values and pillars
    completed_tasks = supabase.table('quest_task_completions')\
        .select('user_quest_task_id, xp_awarded, user_quest_tasks(pillar, xp_value)')\
        .eq('user_id', user_id)\
        .execute()

    if not completed_tasks.data:
        return expected_xp

    for completion in completed_tasks.data:
        task = completion.get('user_quest_tasks') or {}
        raw_pillar = task.get('pillar', 'stem')

        # Use xp_awarded from completion if available, otherwise use task xp_value
        xp = completion.get('xp_awarded') or task.get('xp_value', 0) or 0

        try:
            pillar = normalize_pillar_name(raw_pillar)
        except ValueError:
            pillar = 'stem'

        if pillar in expected_xp:
            expected_xp[pillar] += xp

    return expected_xp


def get_actual_xp(supabase, user_id: str) -> dict:
    """
    Get actual XP per pillar from user_skill_xp table.

    Returns:
        Dict with pillar -> actual_xp
    """
    actual_xp = {pillar: 0 for pillar in PILLAR_KEYS}

    xp_records = supabase.table('user_skill_xp')\
        .select('pillar, xp_amount')\
        .eq('user_id', user_id)\
        .execute()

    if xp_records.data:
        for record in xp_records.data:
            raw_pillar = record.get('pillar')
            xp_amount = record.get('xp_amount', 0) or 0

            try:
                pillar = normalize_pillar_name(raw_pillar)
            except ValueError:
                continue

            if pillar in actual_xp:
                actual_xp[pillar] += xp_amount

    return actual_xp


@bp.route('/user/<user_id>/audit', methods=['GET'])
@require_auth
def audit_user_xp(auth_user_id: str, user_id: str):
    """
    Audit a user's XP to find discrepancies.

    Returns expected vs actual XP for each pillar.
    """
    user, error = require_admin(auth_user_id)
    if error:
        return jsonify({'success': False, 'error': error}), 403

    supabase = get_supabase_admin_client()

    # Get user info
    target_user = supabase.table('users')\
        .select('id, email, display_name, total_xp')\
        .eq('id', user_id)\
        .single()\
        .execute()

    if not target_user.data:
        return jsonify({'success': False, 'error': 'User not found'}), 404

    # Calculate expected and actual XP
    expected_xp = calculate_expected_xp(supabase, user_id)
    actual_xp = get_actual_xp(supabase, user_id)

    # Find discrepancies
    discrepancies = []
    for pillar in PILLAR_KEYS:
        expected = expected_xp.get(pillar, 0)
        actual = actual_xp.get(pillar, 0)
        if expected != actual:
            discrepancies.append({
                'pillar': pillar,
                'expected': expected,
                'actual': actual,
                'difference': expected - actual
            })

    total_expected = sum(expected_xp.values())
    total_actual = sum(actual_xp.values())

    return jsonify({
        'success': True,
        'user': {
            'id': target_user.data['id'],
            'email': target_user.data.get('email'),
            'display_name': target_user.data.get('display_name'),
            'stored_total_xp': target_user.data.get('total_xp', 0)
        },
        'expected_xp': expected_xp,
        'actual_xp': actual_xp,
        'total_expected': total_expected,
        'total_actual': total_actual,
        'discrepancies': discrepancies,
        'has_discrepancy': len(discrepancies) > 0
    })


@bp.route('/user/<user_id>/reconcile', methods=['POST'])
@require_auth
def reconcile_user_xp(auth_user_id: str, user_id: str):
    """
    Reconcile a user's XP by updating user_skill_xp to match expected values.
    """
    user, error = require_admin(auth_user_id)
    if error:
        return jsonify({'success': False, 'error': error}), 403

    supabase = get_supabase_admin_client()

    # Calculate expected XP
    expected_xp = calculate_expected_xp(supabase, user_id)
    actual_xp = get_actual_xp(supabase, user_id)

    changes_made = []

    for pillar in PILLAR_KEYS:
        expected = expected_xp.get(pillar, 0)
        actual = actual_xp.get(pillar, 0)

        if expected != actual:
            # Check if record exists
            existing = supabase.table('user_skill_xp')\
                .select('id')\
                .eq('user_id', user_id)\
                .eq('pillar', pillar)\
                .execute()

            if existing.data:
                # Update existing record
                supabase.table('user_skill_xp')\
                    .update({
                        'xp_amount': expected,
                        'updated_at': datetime.utcnow().isoformat()
                    })\
                    .eq('user_id', user_id)\
                    .eq('pillar', pillar)\
                    .execute()
            else:
                # Insert new record
                supabase.table('user_skill_xp')\
                    .insert({
                        'user_id': user_id,
                        'pillar': pillar,
                        'xp_amount': expected,
                        'updated_at': datetime.utcnow().isoformat()
                    })\
                    .execute()

            changes_made.append({
                'pillar': pillar,
                'old_value': actual,
                'new_value': expected
            })

    # Update user's total_xp in users table
    total_xp = sum(expected_xp.values())
    supabase.table('users')\
        .update({'total_xp': total_xp})\
        .eq('id', user_id)\
        .execute()

    logger.info(f"Admin {auth_user_id} reconciled XP for user {user_id}: {changes_made}")

    return jsonify({
        'success': True,
        'message': f'Reconciled {len(changes_made)} pillar(s)',
        'changes': changes_made,
        'new_total_xp': total_xp
    })


@bp.route('/discrepancies', methods=['GET'])
@require_auth
def list_discrepancies(auth_user_id: str):
    """
    List all users with XP discrepancies.

    Query params:
        limit: Max users to return (default 100)
        offset: Pagination offset (default 0)
    """
    user, error = require_admin(auth_user_id)
    if error:
        return jsonify({'success': False, 'error': error}), 403

    limit = min(int(request.args.get('limit', 100)), 500)
    offset = int(request.args.get('offset', 0))

    supabase = get_supabase_admin_client()

    # Get users with completed tasks
    # For org_admin, filter by organization
    effective_role = get_effective_role(user)

    if effective_role == 'superadmin':
        users_query = supabase.table('users')\
            .select('id, email, display_name, total_xp, organization_id')\
            .range(offset, offset + limit - 1)
    else:
        # Org admin - filter by organization
        org_id = user.get('organization_id')
        users_query = supabase.table('users')\
            .select('id, email, display_name, total_xp, organization_id')\
            .eq('organization_id', org_id)\
            .range(offset, offset + limit - 1)

    users_result = users_query.execute()

    if not users_result.data:
        return jsonify({
            'success': True,
            'users_with_discrepancies': [],
            'total_checked': 0
        })

    users_with_discrepancies = []

    for user_record in users_result.data:
        user_id = user_record['id']

        expected_xp = calculate_expected_xp(supabase, user_id)
        actual_xp = get_actual_xp(supabase, user_id)

        has_discrepancy = False
        discrepancies = []

        for pillar in PILLAR_KEYS:
            expected = expected_xp.get(pillar, 0)
            actual = actual_xp.get(pillar, 0)
            if expected != actual:
                has_discrepancy = True
                discrepancies.append({
                    'pillar': pillar,
                    'expected': expected,
                    'actual': actual,
                    'difference': expected - actual
                })

        if has_discrepancy:
            users_with_discrepancies.append({
                'user': {
                    'id': user_record['id'],
                    'email': user_record.get('email'),
                    'display_name': user_record.get('display_name')
                },
                'discrepancies': discrepancies,
                'total_expected': sum(expected_xp.values()),
                'total_actual': sum(actual_xp.values())
            })

    return jsonify({
        'success': True,
        'users_with_discrepancies': users_with_discrepancies,
        'total_checked': len(users_result.data),
        'discrepancy_count': len(users_with_discrepancies)
    })


@bp.route('/batch-reconcile', methods=['POST'])
@require_auth
def batch_reconcile(auth_user_id: str):
    """
    Reconcile XP for all users with discrepancies.

    Body params:
        user_ids: Optional list of specific user IDs to reconcile
        dry_run: If true, only report what would be changed (default false)
    """
    user, error = require_admin(auth_user_id)
    if error:
        return jsonify({'success': False, 'error': error}), 403

    # Only superadmin can do batch reconciliation
    effective_role = get_effective_role(user)
    if effective_role != 'superadmin':
        return jsonify({
            'success': False,
            'error': 'Batch reconciliation requires superadmin access'
        }), 403

    data = request.get_json() or {}
    user_ids = data.get('user_ids', [])
    dry_run = data.get('dry_run', False)

    supabase = get_supabase_admin_client()

    # Get users to process
    if user_ids:
        users_result = supabase.table('users')\
            .select('id')\
            .in_('id', user_ids)\
            .execute()
    else:
        # Get all users (limited to 1000 for safety)
        users_result = supabase.table('users')\
            .select('id')\
            .limit(1000)\
            .execute()

    if not users_result.data:
        return jsonify({
            'success': True,
            'message': 'No users to process',
            'reconciled_count': 0
        })

    reconciled_users = []

    for user_record in users_result.data:
        user_id = user_record['id']

        expected_xp = calculate_expected_xp(supabase, user_id)
        actual_xp = get_actual_xp(supabase, user_id)

        changes = []
        for pillar in PILLAR_KEYS:
            expected = expected_xp.get(pillar, 0)
            actual = actual_xp.get(pillar, 0)
            if expected != actual:
                changes.append({
                    'pillar': pillar,
                    'old_value': actual,
                    'new_value': expected
                })

        if changes:
            if not dry_run:
                # Apply changes
                for change in changes:
                    existing = supabase.table('user_skill_xp')\
                        .select('id')\
                        .eq('user_id', user_id)\
                        .eq('pillar', change['pillar'])\
                        .execute()

                    if existing.data:
                        supabase.table('user_skill_xp')\
                            .update({
                                'xp_amount': change['new_value'],
                                'updated_at': datetime.utcnow().isoformat()
                            })\
                            .eq('user_id', user_id)\
                            .eq('pillar', change['pillar'])\
                            .execute()
                    else:
                        supabase.table('user_skill_xp')\
                            .insert({
                                'user_id': user_id,
                                'pillar': change['pillar'],
                                'xp_amount': change['new_value'],
                                'updated_at': datetime.utcnow().isoformat()
                            })\
                            .execute()

                # Update total_xp
                total_xp = sum(expected_xp.values())
                supabase.table('users')\
                    .update({'total_xp': total_xp})\
                    .eq('id', user_id)\
                    .execute()

            reconciled_users.append({
                'user_id': user_id,
                'changes': changes
            })

    logger.info(f"Admin {auth_user_id} batch reconciled {len(reconciled_users)} users (dry_run={dry_run})")

    return jsonify({
        'success': True,
        'dry_run': dry_run,
        'reconciled_count': len(reconciled_users),
        'reconciled_users': reconciled_users
    })


@bp.route('/failed-awards', methods=['GET'])
@require_auth
def list_failed_awards(auth_user_id: str):
    """
    List pending failed XP awards that need to be retried.
    """
    user, error = require_admin(auth_user_id)
    if error:
        return jsonify({'success': False, 'error': error}), 403

    supabase = get_supabase_admin_client()

    # Get unprocessed failed awards
    failed_awards = supabase.table('xp_award_failures')\
        .select('*, users(email, display_name)')\
        .is_('processed_at', 'null')\
        .order('created_at', desc=True)\
        .limit(100)\
        .execute()

    return jsonify({
        'success': True,
        'failed_awards': failed_awards.data if failed_awards.data else [],
        'count': len(failed_awards.data) if failed_awards.data else 0
    })


@bp.route('/retry-failed', methods=['POST'])
@require_auth
def retry_failed_awards(auth_user_id: str):
    """
    Retry awarding XP for failed awards.

    Body params:
        award_ids: Optional list of specific award IDs to retry (retries all if empty)
    """
    user, error = require_admin(auth_user_id)
    if error:
        return jsonify({'success': False, 'error': error}), 403

    data = request.get_json() or {}
    award_ids = data.get('award_ids', [])

    supabase = get_supabase_admin_client()

    # Get failed awards to process
    if award_ids:
        query = supabase.table('xp_award_failures')\
            .select('*')\
            .in_('id', award_ids)\
            .is_('processed_at', 'null')
    else:
        query = supabase.table('xp_award_failures')\
            .select('*')\
            .is_('processed_at', 'null')\
            .limit(100)

    failed_awards = query.execute()

    if not failed_awards.data:
        return jsonify({
            'success': True,
            'message': 'No failed awards to process',
            'processed_count': 0
        })

    processed = []
    still_failed = []

    for award in failed_awards.data:
        user_id = award['user_id']
        pillar = award['pillar']
        xp_amount = award['xp_amount']

        # Try to award XP
        success = xp_service.award_xp(
            user_id,
            pillar,
            xp_amount,
            f"retry_failed_award:{award['id']}"
        )

        if success:
            # Mark as processed
            supabase.table('xp_award_failures')\
                .update({'processed_at': datetime.utcnow().isoformat()})\
                .eq('id', award['id'])\
                .execute()
            processed.append(award['id'])
        else:
            still_failed.append(award['id'])

    logger.info(f"Admin {auth_user_id} retried failed awards: {len(processed)} success, {len(still_failed)} still failed")

    return jsonify({
        'success': True,
        'processed_count': len(processed),
        'still_failed_count': len(still_failed),
        'processed_ids': processed,
        'still_failed_ids': still_failed
    })
