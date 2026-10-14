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


# ── Daily roll (ticket 0680d03c) ─────────────────────────────────────────────
# One whole-school roll a day, for a school that does not take attendance by
# class. STAFF_ROLES: at Apogee the coaches (advisors) take it on their
# phones. The blueprint's module_guard already holds every route here behind
# the attendance module; these also answer 404 while the school's daily_roll
# setting is off, so a school that never turned it on cannot write a NULL-class
# row by hand.

def _daily_gate(user_id, need_checkout=False):
    """(org_id, settings, None) or (None, None, error response)."""
    org_id, err = sis_service.org_or_error(user_id)
    if err:
        return None, None, err
    settings = attendance.attendance_settings(org_id)
    if not settings['daily_roll']:
        return None, None, (jsonify({'success': False,
                                     'error': 'The daily roll is not turned on for this school'}), 404)
    if need_checkout and not settings['checkout']:
        return None, None, (jsonify({'success': False,
                                     'error': 'Pickup check-out is not turned on for this school'}), 404)
    return org_id, settings, None


def _iso_date(raw):
    from datetime import date as _date
    try:
        return _date.fromisoformat(str(raw)[:10]).isoformat() if raw else None
    except ValueError:
        return None


def _org_today(org_id):
    from services.sis_attendance_sweep_service import org_today
    return org_today(org_id).isoformat()


@bp.route('/attendance/daily', methods=['GET'])
@require_role(*STAFF_ROLES)
def get_daily_roll(user_id):
    """Every current student with their daily mark for ?date=YYYY-MM-DD, plus
    the school's attendance settings and its own today (pickup is today only)."""
    org_id, settings, err = _daily_gate(user_id)
    if err:
        return err
    on_date = _iso_date(request.args.get('date'))
    if not on_date:
        return jsonify({'success': False, 'error': 'date query param is required (YYYY-MM-DD)'}), 400
    return jsonify({'success': True, 'date': on_date, 'today': _org_today(org_id),
                    'settings': settings,
                    'roster': attendance.get_daily(org_id, on_date,
                                                   student_days=settings.get('student_days'))})


@bp.route('/attendance/daily', methods=['POST'])
@require_role(*STAFF_ROLES)
def record_daily_roll(user_id):
    """{date, entries: [{student_user_id, status, note?}]}. One tap is one
    entry; a whole-roster save works the same way."""
    org_id, settings, err = _daily_gate(user_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    on_date = _iso_date(data.get('date'))
    entries = data.get('entries')
    if not on_date:
        return jsonify({'success': False, 'error': 'date is required (YYYY-MM-DD)'}), 400
    if not isinstance(entries, list) or not entries:
        return jsonify({'success': False, 'error': 'entries (list) is required'}), 400
    result = attendance.record_daily(org_id, on_date, entries, recorded_by=user_id,
                                     statuses=settings['statuses'],
                                     student_days=settings.get('student_days'))
    return jsonify({'success': True, **result})


@bp.route('/attendance/daily/<student_id>/days', methods=['PUT'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('student_id', allow=('org_staff',), discloses='attendance')
def set_daily_student_days(user_id, student_id):
    """{days: [ISO weekdays] | null}. The weekdays this student attends
    (ticket 54b29e8a, Apogee Cache Valley: "we have a few students that only
    come 2 days per week"). null, [] or all seven clears it: the student
    attends every school day again.

    ADMIN_ROLES, the Settings page's tier: it writes the school's settings
    blob. Stored in sis_settings.attendance.student_days through the same
    patch_feature_flags the settings PATCH uses, as the whole attendance
    object (merge_patch replaces it whole), so the other attendance keys are
    written back exactly as they were read. The service refuses a student who
    is not a current student of this school."""
    org_id, _settings, err = _daily_gate(user_id)
    if err:
        return err
    body = request.get_json(silent=True) or {}
    if 'days' not in body:
        return jsonify({'success': False, 'error': 'days is required (a list of weekdays, or null)'}), 400
    blob, problem = attendance.student_days_blob(org_id, student_id, body.get('days'))
    if problem:
        return jsonify({'success': False, 'error': problem}), 400
    from services.org_settings_service import FlagsRejected, patch_feature_flags
    ctx = sis_service.get_user_org_context(user_id)
    try:
        patch_feature_flags(
            org_id, {'sis_settings': {attendance.SETTINGS_KEY: blob}},
            caller_id=user_id,
            sees_finance=sis_service.caller_sees_pay(user_id),
            is_superadmin=ctx.get('role') == 'superadmin',
        )
    except FlagsRejected as rejected:
        return jsonify({'success': False, 'error': rejected.body.get('error', 'Not saved')}), rejected.status
    days = (blob.get(attendance.STUDENT_DAYS_KEY) or {}).get(student_id)
    return jsonify({'success': True, 'student_user_id': student_id, 'days': days})


@bp.route('/attendance/daily/<student_id>/checkout', methods=['POST', 'DELETE'])
@require_role(*STAFF_ROLES)
@require_relationship_to('student_id', allow=('org_staff',), discloses='attendance')
def daily_checkout(user_id, student_id):
    """POST: the student was picked up, now. DELETE: take it back.
    {date} in the body (POST) or ?date= (either). Pickup is recorded for the
    school's today only: the time is the moment of the tap, so a pickup on
    another date would carry a time that never happened."""
    org_id, _settings, err = _daily_gate(user_id, need_checkout=True)
    if err:
        return err
    body = request.get_json(silent=True) or {}
    on_date = _iso_date(body.get('date') or request.args.get('date'))
    if not on_date:
        return jsonify({'success': False, 'error': 'date is required (YYYY-MM-DD)'}), 400
    if request.method == 'POST':
        if on_date != _org_today(org_id):
            return jsonify({'success': False,
                            'error': 'A pickup can only be recorded on the day it happens'}), 400
        result = attendance.checkout_daily(org_id, on_date, student_id, actor_id=user_id)
    else:
        result = attendance.undo_checkout_daily(org_id, on_date, student_id, actor_id=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), result.get('status', 400)
    return jsonify({'success': True, 'record': result['record']})
