"""
SIS Parent self-service routes — guardians register their own children.

NEW, additive (/api/sis/parent). Unlike the rest of /api/sis (staff-gated), these
use @require_auth and authorize by family relationship inside sis_parent_service
(the user must be a guardian of the student, in a SIS-enabled org). Self-service
stops at 'submitted'; staff invoice and full payment auto-enrolls.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_auth
from utils.logger import get_logger
from services import sis_parent_service as parent

logger = get_logger(__name__)

bp = Blueprint('sis_parent', __name__, url_prefix='/api/sis/parent')


def _org(req):
    body = req.get_json(silent=True) or {}
    return req.args.get('organization_id') or body.get('organization_id')


@bp.route('/context', methods=['GET'])
@require_auth
def get_context(user_id):
    """Orgs + children this guardian can register. Empty if they're not a SIS guardian."""
    return jsonify({'success': True, **parent.context(user_id)})


@bp.route('/classes', methods=['GET'])
@require_auth
def open_classes(user_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    classes = parent.open_classes(user_id, org_id)
    if classes is None:
        return jsonify({'success': False, 'error': 'Not authorized for this organization'}), 403
    return jsonify({'success': True, 'classes': classes})


@bp.route('/registrations', methods=['GET'])
@require_auth
def list_registrations(user_id):
    return jsonify({'success': True, 'registrations': parent.list_my_registrations(user_id)})


@bp.route('/registrations', methods=['POST'])
@require_auth
def create_registration(user_id):
    data = request.json or {}
    org_id = _org(request)
    student_user_id = data.get('student_user_id')
    if not org_id or not student_user_id:
        return jsonify({'success': False, 'error': 'organization_id and student_user_id are required'}), 400
    result = parent.create_registration(user_id, org_id, student_user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 403
    return jsonify({'success': True, 'registration': result['registration']}), 201


@bp.route('/registrations/<reg_id>', methods=['GET'])
@require_auth
def get_registration(user_id, reg_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    reg = parent.get_registration(user_id, org_id, reg_id)
    if not reg:
        return jsonify({'success': False, 'error': 'Registration not found'}), 404
    return jsonify({'success': True, 'registration': reg})


@bp.route('/registrations/<reg_id>/items', methods=['POST'])
@require_auth
def add_item(user_id, reg_id):
    data = request.json or {}
    org_id = _org(request)
    class_id = data.get('class_id')
    if not org_id or not class_id:
        return jsonify({'success': False, 'error': 'organization_id and class_id are required'}), 400
    result = parent.add_item(user_id, org_id, reg_id, class_id)
    if result.get('error'):
        code = 404 if result['error'] == 'Registration not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result}), 201


@bp.route('/registrations/<reg_id>/items/<item_id>', methods=['DELETE'])
@require_auth
def remove_item(user_id, reg_id, item_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.remove_item(user_id, org_id, reg_id, item_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True})


@bp.route('/registrations/<reg_id>/quote', methods=['GET'])
@require_auth
def quote(user_id, reg_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.quote(user_id, org_id, reg_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, 'quote': result})


@bp.route('/registrations/<reg_id>/submit', methods=['POST'])
@require_auth
def submit(user_id, reg_id):
    org_id = _org(request)
    if not org_id:
        return jsonify({'success': False, 'error': 'organization_id is required'}), 400
    result = parent.submit(user_id, org_id, reg_id)
    if result.get('error'):
        code = 404 if result['error'] == 'Registration not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, 'registration': result['registration']})
