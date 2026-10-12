"""The SIS People page's "+ Add" wizard: a new family, and a roster spreadsheet.

Adding one staff member is POST /api/sis/staff and adding one child to a family
that exists is POST /api/sis/households/<id>/children (routes/sis/__init__.py);
the wizard calls those as they are. This blueprint holds the two jobs that had
no SIS door:

  POST /api/sis/families                 a household with its parents and
                                         children (services/sis_family_create_service.py)
  POST /api/sis/roster-import/preview    what a pasted roster would create
  POST /api/sis/roster-import/commit     create it

The roster import lived at /api/admin/roster-import, superadmin-only, until
2026-10-12. Its docstring said why: it makes accounts for people who never
agreed to anything and emails them, so it stayed with the person who took the
school's call. Tanner moved it to the school's own admins and coordinators,
with three guards in its place:
  - the preview is the same planner the commit runs, and a single invalid row
    blocks the commit;
  - setup emails are off unless the admin turns them on (the wizard's default
    for a bulk add), so fifty families are not mailed before the school is ready;
  - a school cannot see another school's name or adopt a platform account
    (roster_import_service.build_plan(superadmin=False)).

The org comes from sis_service.org_or_error, so a superadmin imports into the
org their console picker names.
"""

from flask import Blueprint, jsonify, request

from middleware.rate_limiter import rate_limit
from services import roster_import_service, sis_family_create_service, sis_service
from utils.auth.decorators import require_role
# admin client justified: the roster planner reads accounts by email across the
# platform, and the commit creates auth users for people with no session; both
# routes are staff-gated to the caller's own org (sis_service.org_or_error).
from utils.admin_client import admin_client
from utils.logger import get_logger
from utils.sis_roles import ADMIN_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_people_add', __name__, url_prefix='/api/sis')


@bp.route('/families', methods=['POST'])
@require_role(*ADMIN_ROLES)
@rate_limit(max_requests=30, window_seconds=300)
def create_family(user_id):
    """A new family: the household, its parents, its children."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    result = sis_family_create_service.create_family(org_id, user_id, request.get_json() or {})
    status = result.pop('status', 201)
    if result.get('error'):
        return jsonify({'success': False, **result}), status
    return jsonify({'success': True, **result}), 201


def _is_superadmin(user_id):
    return sis_service.get_user_org_context(user_id).get('role') == 'superadmin'


def _plan_or_error(user_id, org_id):
    """Shared by both roster endpoints so the commit plans from exactly what
    the preview showed -- one parser, one planner, no second interpretation."""
    data = request.get_json(silent=True) or {}
    rows, parse_error = roster_import_service.parse_roster_csv(data.get('csv'))
    if parse_error:
        return None, (jsonify({'success': False, 'error': parse_error}), 400)
    # admin client justified: the planner reads accounts by email across the
    # platform to report which roster addresses already exist; the response
    # never names another school to a school (build_plan superadmin=False).
    plan = roster_import_service.build_plan(rows, org_id, admin_client(),
                                            superadmin=_is_superadmin(user_id))
    return plan, None


@bp.route('/roster-import/preview', methods=['POST'])
@require_role(*ADMIN_ROLES)
@rate_limit(max_requests=30, window_seconds=300)
def preview_roster(user_id):
    """Report what importing this roster would create, without creating it."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    plan, error = _plan_or_error(user_id, org_id)
    if error:
        return error
    return jsonify({'success': True, 'can_import': not plan['row_errors'], **plan}), 200


@bp.route('/roster-import/commit', methods=['POST'])
@require_role(*ADMIN_ROLES)
@rate_limit(max_requests=5, window_seconds=300)
def commit_roster(user_id):
    """Create the accounts and families, link students to parents, and send
    the setup emails when asked to."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    plan, error = _plan_or_error(user_id, org_id)
    if error:
        return error
    if plan['row_errors']:
        # Half a roster is worse than none: the admin fixes the sheet and
        # re-pastes, and the rows that already landed are skipped as existing.
        return jsonify({'success': False, 'error': 'Fix the invalid rows before importing',
                        'row_errors': plan['row_errors']}), 400

    body = request.get_json(silent=True) or {}
    # Off unless asked: the bulk default (see the module docstring).
    send_emails = body.get('send_emails') is True
    # admin client justified: creates auth users and profiles for people who
    # have no session of their own; the route is staff-gated to this org.
    admin = admin_client()
    outcome = roster_import_service.execute_plan(
        plan, org_id, sis_service._org_name(org_id) or '', admin, send_emails=send_emails)
    try:
        admin.table('admin_audit_logs').insert(
            roster_import_service.audit_entry(user_id, org_id, outcome['counts'], send_emails)
        ).execute()
    except Exception as e:  # noqa: BLE001 -- an audit failure must not undo the import
        logger.warning(f'roster_import: audit log failed: {e}')
    logger.info(f"roster_import: org {org_id} -> {outcome['counts']}")
    return jsonify({'success': True, **outcome}), 200
