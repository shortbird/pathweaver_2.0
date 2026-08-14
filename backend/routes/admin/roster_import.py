"""Superadmin roster import: paste a school's student/parent spreadsheet.

Two endpoints, deliberately split. /preview reads and reports; /commit writes.
The superadmin pastes once, reads what the import is about to do to real
families, and only then commits the same text.

Superadmin-only rather than org-admin: this creates accounts for people who
never agreed to anything and emails all of them, on behalf of a school that
handed us a spreadsheet out of band. It stays with the person who took that
call. The business logic lives in services/roster_import_service.py.
"""

from flask import Blueprint, jsonify, request

from database import get_supabase_admin_client
from middleware.rate_limiter import rate_limit
from services import roster_import_service
from utils.auth.decorators import require_superadmin
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_roster_import', __name__, url_prefix='/api/admin/roster-import')


def _org_or_error(admin, org_id):
    if not org_id:
        return None, (jsonify({'error': 'organization_id is required'}), 400)
    try:
        res = (admin.table('organizations').select('id, name, slug')
               .eq('id', org_id).maybe_single().execute())
    except Exception as e:  # noqa: BLE001
        logger.error(f'roster_import: org lookup failed for {org_id}: {e}')
        return None, (jsonify({'error': 'Failed to look up the organization'}), 500)
    # maybe_single() hands back None rather than a response when nothing matched.
    org = res.data if res else None
    if not org:
        return None, (jsonify({'error': 'Organization not found'}), 404)
    return org, None


def _plan_or_error(admin, org_id):
    """Shared by both endpoints so the commit plans from exactly what the
    preview showed -- one parser, one planner, no second interpretation."""
    data = request.get_json(silent=True) or {}
    rows, parse_error = roster_import_service.parse_roster_csv(data.get('csv'))
    if parse_error:
        return None, (jsonify({'error': parse_error}), 400)
    try:
        return roster_import_service.build_plan(rows, org_id, admin), None
    except Exception as e:  # noqa: BLE001
        logger.error(f'roster_import: planning failed: {e}')
        return None, (jsonify({'error': 'Failed to check the roster against existing accounts'}), 500)


@bp.route('/preview', methods=['POST'])
@require_superadmin
@rate_limit(max_requests=30, window_seconds=300)
def preview_roster(user_id):
    """Report what importing this roster would create, without creating it."""
    # admin client justified: superadmin-only route -- reads accounts across
    # every org to tell the importer which roster emails already exist
    admin = get_supabase_admin_client()

    org_id = (request.get_json(silent=True) or {}).get('organization_id')
    org, error = _org_or_error(admin, org_id)
    if error:
        return error

    plan, error = _plan_or_error(admin, org_id)
    if error:
        return error

    return jsonify({
        'success': True,
        'organization': {'id': org['id'], 'name': org.get('name')},
        'can_import': not plan['row_errors'],
        **plan,
    }), 200


@bp.route('/commit', methods=['POST'])
@require_superadmin
@rate_limit(max_requests=5, window_seconds=300)
def commit_roster(user_id):
    """Create the accounts, link students to parents, send the invites."""
    # admin client justified: superadmin-only route -- creates auth users and
    # profiles for people who have no session of their own
    admin = get_supabase_admin_client()

    body = request.get_json(silent=True) or {}
    org_id = body.get('organization_id')
    org, error = _org_or_error(admin, org_id)
    if error:
        return error

    plan, error = _plan_or_error(admin, org_id)
    if error:
        return error

    if plan['row_errors']:
        # Half a roster is worse than none: the superadmin fixes the sheet and
        # re-pastes, and the rows that already landed are skipped as existing.
        return jsonify({
            'success': False,
            'error': 'Fix the invalid rows before importing',
            'row_errors': plan['row_errors'],
        }), 400

    send_emails = body.get('send_emails', True) is not False
    outcome = roster_import_service.execute_plan(
        plan, org_id, org.get('name') or '', admin, send_emails=send_emails)

    try:
        admin.table('admin_audit_logs').insert(
            roster_import_service.audit_entry(user_id, org_id, outcome['counts'], send_emails)
        ).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f'roster_import: audit log failed: {e}')

    logger.info(f"roster_import: org {org_id} -> {outcome['counts']}")
    return jsonify({'success': True, 'organization': {'id': org['id'], 'name': org.get('name')},
                    **outcome}), 200
