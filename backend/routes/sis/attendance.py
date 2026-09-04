"""
SIS attendance routes — teacher quick-entry + parent/admin read (spec §4.8, §6.2).

NEW, additive (/api/sis), staff-gated, org-scoped.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.auth.relationships import require_relationship_to
from utils.logger import get_logger
from services import sis_service
from services import sis_attendance_service as attendance
from services import sis_attendance_sweep_service as sweep
from repositories.sis_class_repository import SisClassRepository
from database import get_supabase_admin_client
from utils.sis_roles import STAFF_ROLES, ADMIN_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_attendance', __name__, url_prefix='/api/sis')


def _org_or_error(user_id):
    body = request.get_json(silent=True) or {}
    requested = request.args.get('organization_id') or body.get('organization_id')
    org_id = sis_service.resolve_org_id(user_id, requested)
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.'
        }), 400)
    return org_id, None


def _class_in_org(org_id, class_id):
    # admin client justified: org_classes ownership check used as the org-scoping gate by every staff-gated attendance route
    cls = SisClassRepository(client=get_supabase_admin_client()).find_by_id(class_id)
    return bool(cls and cls.get('organization_id') == org_id)


@bp.route('/classes/<class_id>/attendance', methods=['GET'])
@require_role(*STAFF_ROLES)
def get_attendance(user_id, class_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    scope = sis_service.class_scope(user_id, org_id)
    if scope is not None and class_id not in scope:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    on_date = request.args.get('date')
    if not on_date:
        return jsonify({'success': False, 'error': 'date query param is required (YYYY-MM-DD)'}), 400
    if not _class_in_org(org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    return jsonify({'success': True, 'roster': attendance.get_for_date(org_id, class_id, on_date)})


@bp.route('/classes/<class_id>/attendance', methods=['POST'])
@require_role(*STAFF_ROLES)
def record_attendance(user_id, class_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    scope = sis_service.class_scope(user_id, org_id)
    if scope is not None and class_id not in scope:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    data = request.json or {}
    on_date = data.get('date')
    entries = data.get('entries')
    if not on_date:
        return jsonify({'success': False, 'error': 'date is required'}), 400
    if not isinstance(entries, list) or not entries:
        return jsonify({'success': False, 'error': 'entries (list) is required'}), 400
    if not _class_in_org(org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    result = attendance.record(org_id, class_id, on_date, entries, recorded_by=user_id)
    return jsonify({'success': True, **result})


@bp.route('/students/<student_id>/attendance', methods=['GET'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('student_id', allow=('org_staff',), discloses='attendance')
def student_attendance(user_id, student_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True, **attendance.student_history(org_id, student_id)})


@bp.route('/students/<student_id>/attendance/day', methods=['GET'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('student_id', allow=('org_staff',), discloses='attendance')
def student_attendance_day(user_id, student_id):
    """One student's whole day (?date=YYYY-MM-DD): every class they meet that
    day and the status the roll recorded for each.

    Answers "were they in their other classes?" from an accountability alert
    without opening each class's roster in turn (iCreate, 2026-09-01).
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    on_date = request.args.get('date')
    if not on_date:
        return jsonify({'success': False, 'error': 'date query param is required (YYYY-MM-DD)'}), 400
    result = attendance.student_day(org_id, student_id, on_date)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


@bp.route('/attendance/absences', methods=['GET'])
@require_role(*ADMIN_ROLES)
def upcoming_absences(user_id):
    """Guardian-reported absences from today forward, org-wide.

    The 'Absence reported' notification deep-links to /attendance; without this
    the page could only surface an absence once the right class and the right
    date were picked, so the link answered nothing for a future report.
    """
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    from services import sis_planned_absence_service as planned
    return jsonify({'success': True, 'absences': planned.list_upcoming(org_id)})


@bp.route('/attendance/alerts', methods=['GET'])
@require_role(*ADMIN_ROLES)
def attendance_alerts(user_id):
    """Open student-accountability alerts ("not accounted for"), optionally for
    one date (?date=YYYY-MM-DD). The coordinator dashboard's safety board."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    return jsonify({'success': True,
                    'alerts': attendance.open_alerts(org_id, request.args.get('date')),
                    'resolutions': list(attendance.ALERT_RESOLUTIONS)})


@bp.route('/attendance/alerts/<alert_id>/resolve', methods=['POST'])
@require_role(*ADMIN_ROLES)
def resolve_attendance_alert(user_id, alert_id):
    """Close an alert with what happened. 'late' and 'mismarked' also correct
    the roll — see sis_attendance_service.resolve_alert."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    result = attendance.resolve_alert(org_id, alert_id, data.get('resolution'),
                                      data.get('note'), actor_id=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


@bp.route('/internal/attendance-sweep', methods=['POST'])
def attendance_sweep():
    """Cron entrypoint: start-of-class reminders + attendance-gap alerts.
    Auth via X-Cron-Secret, or a signed-in superadmin for manual triggering."""
    secret = request.headers.get('X-Cron-Secret')
    from utils.cron_auth import is_valid_cron_secret
    is_cron = is_valid_cron_secret(secret)
    if not is_cron:
        from utils.session_manager import session_manager
        uid = session_manager.get_effective_user_id()
        is_super = False
        if uid:
            # admin client justified: resolves the CALLER's own role to make the access
            #   decision; under RLS the row the check depends on may be invisible, so the
            #   check could not run
            row = (
                get_supabase_admin_client().table('users').select('role')
                .eq('id', uid).limit(1).execute()
            ).data
            is_super = bool(row and row[0].get('role') == 'superadmin')
        if not is_super:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    return jsonify({'success': True, **sweep.run_sweep()})
