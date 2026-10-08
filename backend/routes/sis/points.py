"""
SIS points (/api/sis/points): staff give points for jobs and take them for
perks, and each student carries a balance. Built for Apogee Cache Valley's
ClassDojo (2026-10-08); the rules live in services/sis_points_service.

Staff endpoints are role-gated and org-scoped through sis_service.resolve_org_id.
Every staff member sees every student here: points are the school's, and a
coach at a microschool gives them to the whole school. A family reads its own
child's points through @require_relationship_to.
"""

from flask import Blueprint, jsonify, request

from services import sis_service
from services.sis_points_service import PointsError, PointsService
from utils.auth.decorators import require_auth, require_role
from utils.auth.relationships import require_relationship_to
from utils.sis_roles import STAFF_ROLES

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


@bp.route('/mine', methods=['GET'])
@require_auth
def mine(user_id):
    """A student's own points, or a parent's children's. Authorized by who the
    caller is: the service reads only the caller or children_of_parent."""
    return jsonify({'success': True, 'students': PointsService().mine(user_id)})


@bp.route('/students/<student_id>', methods=['GET'])
@require_auth
@require_relationship_to('student_id',
                         allow=('self', 'parent', 'household_guardian', 'org_staff'),
                         discloses='progress')
def student_history(user_id, student_id):
    """One student's balance and newest entries."""
    return jsonify({'success': True, **PointsService().history(student_id)})
