"""
SIS weekly goals (/api/sis/weekly-goals): a coach sets each student's goals on
Monday and checks in on Thursday. Built for Apogee Cache Valley's Master
Planner sheet (2026-10-01); the rules live in services/sis_weekly_goal_service.

Staff endpoints are role-gated and org-scoped through sis_service.resolve_org_id.
Every staff member sees every student here: a coach at a microschool coaches
the whole school, and the week is not a class record. A family reads its own
child's weeks through @require_relationship_to.

A student writes their own goal text for the current week through PUT
/mine/goals (ticket 910668d8): self-only, so there is no student id in the
URL to check a relationship against; the service writes the caller's row.
"""

from flask import Blueprint, jsonify, request

from services import sis_service
from services.sis_weekly_goal_service import WeeklyGoalError, WeeklyGoalLocked, WeeklyGoalService
from utils.auth.decorators import require_auth, require_role
from utils.auth.relationships import require_relationship_to
from utils.sis_roles import STAFF_ROLES

bp = Blueprint('sis_weekly_goals', __name__, url_prefix='/api/sis/weekly-goals')


def _org_or_400(user_id):
    org_id = sis_service.resolve_org_id(user_id, sis_service.requested_org_id())
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.',
        }), 400)
    return org_id, None


@bp.route('', methods=['GET'])
@require_role(*STAFF_ROLES)
def board(user_id):
    """Every current student's goals for one week. ?week_start= any date in
    the week (default this week)."""
    org_id, error = _org_or_400(user_id)
    if error:
        return error
    try:
        data = WeeklyGoalService().board(org_id, request.args.get('week_start'))
    except WeeklyGoalError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    return jsonify({'success': True, **data})


@bp.route('/students/<student_id>/weeks/<week_start>', methods=['PUT'])
@require_role(*STAFF_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
def save_week(user_id, student_id, week_start):
    """Body: {goals: [{subject, goal, completed}], complaints, valid_complaints,
    notes, check_in, base_goals?}. check_in=true is the Thursday check-in.
    base_goals is the goal text the form loaded: a subject the coach left
    unchanged keeps the stored text, which a student may have typed since."""
    org_id, error = _org_or_400(user_id)
    if error:
        return error
    try:
        row = WeeklyGoalService().save(org_id, student_id, week_start,
                                       request.get_json(silent=True) or {}, user_id)
    except WeeklyGoalError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except LookupError:
        return jsonify({'success': False, 'error': 'Student not found'}), 404
    return jsonify({'success': True, 'week': row})


@bp.route('/students/<student_id>/year', methods=['PUT'])
@require_role(*STAFF_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
def save_year(user_id, student_id):
    """Body: {subjects: [{subject, year_goal}]}. The year goals a student's
    weeks serve; the same write as the goals blueprint's, on this module's
    door (routes/sis/goals.save_year_goals)."""
    org_id, error = _org_or_400(user_id)
    if error:
        return error
    from routes.sis.goals import save_year_goals
    return save_year_goals(user_id, org_id, student_id, request.get_json(silent=True) or {})


@bp.route('/mine', methods=['GET'])
@require_auth
def mine(user_id):
    """A student's own weeks, or a parent's children's. Authorized by who the
    caller is: the service reads only the caller or children_of_parent."""
    return jsonify({'success': True, 'students': WeeklyGoalService().mine(user_id)})


@bp.route('/mine/goals', methods=['PUT'])
# superadmin passes the door (every role list carries it) and is refused by
# the service unless acting as the student: the write is always the caller's.
@require_role('student', 'superadmin')
def save_my_goals(user_id):
    """Body: {goals: [{subject, goal}], week_start?}. A student's own goal
    text for this week, until the Thursday check-in locks it. Ticks,
    complaints, notes and the check-in are the coach's and are ignored."""
    try:
        row = WeeklyGoalService().save_own_goals(user_id, request.get_json(silent=True) or {})
    except WeeklyGoalLocked as e:
        return jsonify({'success': False, 'error': str(e)}), 409
    except WeeklyGoalError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except PermissionError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    return jsonify({'success': True, 'week': row})


@bp.route('/students/<student_id>', methods=['GET'])
@require_auth
@require_relationship_to('student_id',
                         allow=('self', 'parent', 'household_guardian', 'org_staff'),
                         discloses='progress')
def student_history(user_id, student_id):
    """One student's weeks, newest first, and the freedom they carry now."""
    return jsonify({'success': True, **WeeklyGoalService().history(student_id)})
