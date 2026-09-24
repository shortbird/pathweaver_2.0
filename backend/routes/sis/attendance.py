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
from services import sis_class_session_service as sessions
from repositories.sis_class_repository import SisClassRepository
from database import get_supabase_admin_client
from utils.sis_roles import STAFF_ROLES, ADMIN_ROLES

logger = get_logger(__name__)

bp = Blueprint('sis_attendance', __name__, url_prefix='/api/sis')


def _class_in_org(org_id, class_id):
    # admin client justified: org_classes ownership check used as the org-scoping gate by every staff-gated attendance route
    cls = SisClassRepository(client=get_supabase_admin_client()).find_by_id(class_id)
    return bool(cls and cls.get('organization_id') == org_id)


@bp.route('/classes/<class_id>/attendance', methods=['GET'])
@require_role(*STAFF_ROLES)
def get_attendance(user_id, class_id):
    """The roster with each student's status for ?date=, plus the class
    session for that date (who took the roll and when, and any substitute).

    Scoped by date: a substitute the office marked for this class on this
    date passes; the same person on any other date does not (P7).
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    on_date = request.args.get('date')
    if not on_date:
        return jsonify({'success': False, 'error': 'date query param is required (YYYY-MM-DD)'}), 400
    scope = sis_service.class_scope(user_id, org_id, on_date=on_date)
    if scope is not None and class_id not in scope:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    if not _class_in_org(org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    return jsonify({'success': True,
                    'roster': attendance.get_for_date(org_id, class_id, on_date),
                    'session': sessions.session_for(org_id, class_id, on_date)})


@bp.route('/classes/<class_id>/attendance', methods=['POST'])
@require_role(*STAFF_ROLES)
def record_attendance(user_id, class_id):
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    on_date = data.get('date')
    entries = data.get('entries')
    if not on_date:
        return jsonify({'success': False, 'error': 'date is required'}), 400
    # Scoped by the roll's date, so a planned substitute can save this class's
    # roll on the day they cover it and on no other day (P7).
    scope = sis_service.class_scope(user_id, org_id, on_date=on_date)
    if scope is not None and class_id not in scope:
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    if not isinstance(entries, list) or not entries:
        return jsonify({'success': False, 'error': 'entries (list) is required'}), 400
    if not _class_in_org(org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    result = attendance.record(org_id, class_id, on_date, entries, recorded_by=user_id)
    return jsonify({'success': True, **result,
                    'session': sessions.session_for(org_id, class_id, on_date)})


@bp.route('/classes/<class_id>/substitute', methods=['PUT'])
@require_role(*ADMIN_ROLES)
def plan_substitute(user_id, class_id):
    """Mark who covers a class on a date: {date, substitute_id}; a null
    substitute_id clears it.

    The substitute gets this class's roster and attendance for that date only
    (sis_service.class_scope with on_date) and the start-of-class "take
    attendance" reminder. No class membership is created (P7, iCreate
    2026-09-23).
    """
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    if not _class_in_org(org_id, class_id):
        return jsonify({'success': False, 'error': 'Class not found'}), 404
    data = request.get_json(silent=True) or {}
    if not data.get('date'):
        return jsonify({'success': False, 'error': 'date is required'}), 400
    result = sessions.plan_substitute(org_id, class_id, data['date'],
                                      data.get('substitute_id') or None, actor_id=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})


@bp.route('/attendance/sessions/<session_id>/resolve', methods=['POST'])
@require_role(*ADMIN_ROLES)
def resolve_session(user_id, session_id):
    """A coordinator's answer to a flagged roll: {outcome, note}, outcome one
    of sis_class_session_service.RESOLUTIONS ('other' needs a note)."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    result = sessions.resolve(org_id, session_id, data.get('outcome'),
                              data.get('note'), actor_id=user_id)
    if result.get('error'):
        status = 404 if result['error'] == 'Session not found' else 400
        return jsonify({'success': False, 'error': result['error']}), status
    return jsonify({'success': True, **result})


@bp.route('/students/<student_id>/attendance', methods=['GET'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('student_id', allow=('org_staff',), discloses='attendance')
def student_attendance(user_id, student_id):
    org_id, err = sis_service.org_or_error(user_id)
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
    org_id, err = sis_service.org_or_error(user_id)
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
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    from services import sis_planned_absence_service as planned
    return jsonify({'success': True, 'absences': planned.list_upcoming(org_id)})


@bp.route('/attendance/alerts', methods=['GET'])
@require_role(*ADMIN_ROLES)
def attendance_alerts(user_id):
    """Open student-accountability alerts ("not accounted for"), optionally for
    one date (?date=YYYY-MM-DD). The coordinator dashboard's safety board."""
    org_id, err = sis_service.org_or_error(user_id)
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
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    result = attendance.resolve_alert(org_id, alert_id, data.get('resolution'),
                                      data.get('note'), actor_id=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify({'success': True, **result})
