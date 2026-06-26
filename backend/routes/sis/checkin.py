"""
SIS check-in routes — guardian/staff daily check-in/out + the cron sweep endpoint.

Check-in actions are authorized by relationship (a student's guardian) OR org staff
(see sis_checkin_service.can_manage_checkin) — so they use @require_auth, not the
staff-only gate. The day board is staff-only. The sweep endpoint is cron-secured
(X-Cron-Secret) with a superadmin fallback, mirroring the advisor-summary job.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth, require_role
from utils.logger import get_logger
from app_config import Config
from services import sis_service
from services import sis_checkin_service as checkin
from services import sis_checkin_sweep_service as sweep
from database import get_supabase_admin_client

logger = get_logger(__name__)

bp = Blueprint('sis_checkin', __name__, url_prefix='/api/sis')

STAFF_ROLES = ('org_admin', 'advisor', 'superadmin')


def _load_user(user_id):
    rows = (
        get_supabase_admin_client().table('users')
        .select('id, role, org_role, org_roles, organization_id')
        .eq('id', user_id).limit(1).execute()
    ).data
    return rows[0] if rows else None


def _authorize(user_id, student_id):
    """Return (org_id, user, error_response)."""
    user = _load_user(user_id)
    if not checkin.can_manage_checkin(user, student_id):
        return None, None, (jsonify({'success': False, 'error': 'Not authorized for this student'}), 403)
    org = checkin.student_org(student_id)
    if not org:
        return None, None, (jsonify({'success': False, 'error': 'Student has no organization'}), 400)
    return org, user, None


@bp.route('/checkin/<student_id>/check-in', methods=['POST'])
@require_auth
def do_check_in(user_id, student_id):
    org, user, err = _authorize(user_id, student_id)
    if err:
        return err
    note = (request.json or {}).get('note')
    return jsonify({'success': True, 'checkin': checkin.check_in(org, student_id, by=user_id, note=note)})


@bp.route('/checkin/<student_id>/check-out', methods=['POST'])
@require_auth
def do_check_out(user_id, student_id):
    org, user, err = _authorize(user_id, student_id)
    if err:
        return err
    return jsonify({'success': True, 'checkin': checkin.check_out(org, student_id, by=user_id)})


@bp.route('/checkin/<student_id>/absence', methods=['POST'])
@require_auth
def do_absence(user_id, student_id):
    org, user, err = _authorize(user_id, student_id)
    if err:
        return err
    note = (request.json or {}).get('note')
    return jsonify({'success': True, 'checkin': checkin.report_absence(org, student_id, by=user_id, note=note)})


@bp.route('/checkin/<student_id>/today', methods=['GET'])
@require_auth
def get_today(user_id, student_id):
    """Today's check-in for a student. Reports `applicable=false` (and no error)
    when the student isn't in an SIS-enabled org, so the parent dashboard can hide
    the check-in card for non-SIS families."""
    user = _load_user(user_id)
    if not checkin.can_manage_checkin(user, student_id):
        return jsonify({'success': False, 'error': 'Not authorized for this student'}), 403
    org = checkin.student_org(student_id)
    from utils.org_features import org_has_feature
    if not org or not org_has_feature(org, 'sis_enabled'):
        return jsonify({'success': True, 'applicable': False, 'checkin': None})
    return jsonify({'success': True, 'applicable': True, 'checkin': checkin.get_today(org, student_id)})


@bp.route('/checkin/day', methods=['GET'])
@require_role(*STAFF_ROLES)
def day_board(user_id):
    requested = request.args.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return jsonify({'success': False, 'error': 'No organization in context.'}), 400
    return jsonify({'success': True, 'board': checkin.get_day_board(org_id, request.args.get('date'))})


@bp.route('/internal/attendance-sweep', methods=['POST'])
def attendance_sweep():
    """Cron entrypoint: run check-in reminders + gap alerts. X-Cron-Secret or superadmin."""
    secret = request.headers.get('X-Cron-Secret')
    is_cron = bool(secret and Config.CRON_SECRET and secret == Config.CRON_SECRET)
    if not is_cron:
        # Fallback: allow a signed-in superadmin to trigger manually.
        from utils.session_manager import session_manager
        uid = session_manager.get_effective_user_id()
        is_super = False
        if uid:
            row = (
                get_supabase_admin_client().table('users').select('role')
                .eq('id', uid).limit(1).execute()
            ).data
            is_super = bool(row and row[0].get('role') == 'superadmin')
        if not is_super:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    return jsonify({'success': True, **sweep.run_sweep()})
