"""
SIS points (/api/sis/points): staff give points for jobs and take them for
perks, and each student carries a balance. Built for Apogee Cache Valley's
ClassDojo (2026-10-08); the rules live in services/sis_points_service.

Staff endpoints are role-gated and org-scoped through sis_service.resolve_org_id.
Every staff member sees every student here: points are the school's, and a
coach at a microschool gives them to the whole school. A family reads its own
child's points through @require_relationship_to.

A student adds points for themselves through POST /mine (ticket 910668d8):
self-only, capped per day, and undone by staff like any entry.

Points helpers (ticket 0f401a62): the school's admins name students who may
give points to other students (GET/PUT /helpers). A helper, signed in as
themselves, reads GET /helper and gives through POST /helper/entries:
positive only, capped per entry, never to themselves. Everyone else is
refused by the service with a 403 and nothing is written.
"""

from flask import Blueprint, jsonify, request

from services import sis_service
from services.sis_points_service import PointsError, PointsService
from utils.auth.decorators import require_auth, require_role
from utils.auth.relationships import require_relationship_to
from utils.sis_roles import ADMIN_ROLES, STAFF_ROLES

bp = Blueprint('sis_points', __name__, url_prefix='/api/sis/points')


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
    """Every current student's balance, the school's buttons, recent entries."""
    org_id, error = _org_or_400(user_id)
    if error:
        return error
    return jsonify({'success': True, **PointsService().board(org_id)})


@bp.route('/entries', methods=['POST'])
@require_role(*STAFF_ROLES)
def add_entries(user_id):
    """Body: {student_ids: [...], amount, reason}. A negative amount takes
    points (a perk); it is refused if any student would go below zero."""
    org_id, error = _org_or_400(user_id)
    if error:
        return error
    try:
        data = PointsService().add(org_id, request.get_json(silent=True) or {}, user_id)
    except PointsError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except LookupError:
        return jsonify({'success': False, 'error': 'Student not found'}), 404
    return jsonify({'success': True, **data})


@bp.route('/entries/<entry_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def undo_entry(user_id, entry_id):
    """Undo one entry. The service checks it belongs to the caller's school."""
    org_id, error = _org_or_400(user_id)
    if error:
        return error
    try:
        data = PointsService().undo(org_id, entry_id)
    except LookupError:
        return jsonify({'success': False, 'error': 'Entry not found'}), 404
    return jsonify({'success': True, **data})


@bp.route('/buttons', methods=['PUT'])
@require_role(*STAFF_ROLES)
def save_buttons(user_id):
    """Body: {buttons: [{label, amount}]}. Replaces the school's quick buttons."""
    org_id, error = _org_or_400(user_id)
    if error:
        return error
    try:
        buttons = PointsService().save_buttons(org_id, (request.get_json(silent=True) or {}).get('buttons'))
    except PointsError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    return jsonify({'success': True, 'buttons': buttons})


@bp.route('/helpers', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_helpers(user_id):
    """The school's points helpers. Every staff member may read the list (it
    is shown on the Points page); can_edit says whether this caller saves it."""
    org_id, error = _org_or_400(user_id)
    if error:
        return error
    return jsonify({'success': True, 'helpers': PointsService().helpers(org_id),
                    'can_edit': sis_service.caller_is_admin(user_id)})


@bp.route('/helpers', methods=['PUT'])
@require_role(*ADMIN_ROLES)
def save_helpers(user_id):
    """Body: {student_ids: [...]}. Replaces the list; each id must be a
    current student of this school. An empty list means no helpers."""
    org_id, error = _org_or_400(user_id)
    if error:
        return error
    service = PointsService()
    try:
        wanted = service.clean_helper_ids(org_id, (request.get_json(silent=True) or {}).get('student_ids'))
    except PointsError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    from services.org_settings_service import FlagsRejected, patch_feature_flags
    from services.sis_points_service import POINT_HELPERS_KEY
    ctx = sis_service.get_user_org_context(user_id)
    try:
        patch_feature_flags(
            org_id,
            {'sis_settings': {POINT_HELPERS_KEY: wanted or None}},
            caller_id=user_id,
            sees_finance=sis_service.caller_sees_pay(user_id),
            is_superadmin=ctx.get('role') == 'superadmin',
        )
    except FlagsRejected as rejected:
        return jsonify({'success': False, 'error': rejected.body.get('error', 'Not saved')}), rejected.status
    return jsonify({'success': True, 'helpers': service.helpers(org_id), 'can_edit': True})


@bp.route('/helper', methods=['GET'])
# As for POST /mine: superadmin passes the door and is refused by the
# service unless acting as a student who is on the list.
@require_role('student', 'superadmin')
def helper_board(user_id):
    """A points helper's screen: the other students, the give buttons, the
    per-entry limit, and what this helper gave lately."""
    try:
        data = PointsService().helper_board(user_id)
    except PermissionError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    return jsonify({'success': True, **data})


@bp.route('/helper/entries', methods=['POST'])
@require_role('student', 'superadmin')
def helper_add(user_id):
    """Body: {student_ids, amount, reason}. A helper gives points to other
    students: positive only, capped per entry, never to themselves."""
    try:
        data = PointsService().add_as_helper(user_id, request.get_json(silent=True) or {})
    except PermissionError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    except PointsError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except LookupError:
        return jsonify({'success': False, 'error': 'Student not found'}), 404
    return jsonify({'success': True, **data})


@bp.route('/mine', methods=['GET'])
@require_auth
def mine(user_id):
    """A student's own points, or a parent's children's. Authorized by who the
    caller is: the service reads only the caller or children_of_parent."""
    return jsonify({'success': True, 'students': PointsService().mine(user_id)})


@bp.route('/mine', methods=['POST'])
# superadmin passes the door (every role list carries it) and is refused by
# the service unless acting as the student: the write is always the caller's.
@require_role('student', 'superadmin')
def add_mine(user_id):
    """Body: {amount, reason}. A student gives themselves points: positive
    only, a reason required, capped per day. Counts at once; staff see it
    marked as the student's and can undo it."""
    try:
        data = PointsService().add_own(user_id, request.get_json(silent=True) or {})
    except PointsError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except PermissionError as e:
        return jsonify({'success': False, 'error': str(e)}), 403
    return jsonify({'success': True, **data})


@bp.route('/students/<student_id>', methods=['GET'])
@require_auth
@require_relationship_to('student_id',
                         allow=('self', 'parent', 'household_guardian', 'org_staff'),
                         discloses='progress')
def student_history(user_id, student_id):
    """One student's balance and newest entries."""
    return jsonify({'success': True, **PointsService().history(student_id)})
