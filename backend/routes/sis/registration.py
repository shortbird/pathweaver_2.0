"""
SIS registration routes — multi-step, resumable, per-student enrollment.

NEW, additive (/api/sis), staff-gated, org-scoped. Staff create/complete on behalf
of families (spec §7.3); the same endpoints back the parent registration wizard.
Eligibility is soft (warnings, never blocks); admin completes with override.
"""

from flask import Blueprint, request, jsonify

from utils.auth.decorators import require_role
from utils.logger import get_logger
from services import sis_service
from services import sis_registration_service as regs
from services import sis_exception_service as exceptions

logger = get_logger(__name__)

bp = Blueprint('sis_registration', __name__, url_prefix='/api/sis')

STAFF_ROLES = ('org_admin', 'advisor', 'superadmin')


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


@bp.route('/registrations', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_registrations(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    status = request.args.get('status')
    if status and status not in regs.REGISTRATION_STATUSES:
        return jsonify({'success': False, 'error': f'Invalid status: {status}'}), 400
    return jsonify({'success': True, 'registrations': regs.list_registrations(org_id, status)})


@bp.route('/registrations', methods=['POST'])
@require_role(*STAFF_ROLES)
def create_registration(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    student_user_id = data.get('student_user_id')
    if not student_user_id:
        return jsonify({'success': False, 'error': 'student_user_id is required'}), 400
    reg = regs.create_registration(
        org_id, student_user_id,
        guardian_user_id=data.get('guardian_user_id'),
        household_id=data.get('household_id'),
    )
    return jsonify({'success': True, 'registration': reg}), 201


@bp.route('/registrations/<reg_id>', methods=['GET'])
@require_role(*STAFF_ROLES)
def get_registration(user_id, reg_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    reg = regs.get_registration(org_id, reg_id)
    if not reg:
        return jsonify({'success': False, 'error': 'Registration not found'}), 404
    return jsonify({'success': True, 'registration': reg})


@bp.route('/registrations/<reg_id>', methods=['PATCH'])
@require_role(*STAFF_ROLES)
def update_registration(user_id, reg_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    if data.get('status') and data['status'] not in regs.REGISTRATION_STATUSES:
        return jsonify({'success': False, 'error': 'Invalid status'}), 400
    if not regs.get_registration(org_id, reg_id):
        return jsonify({'success': False, 'error': 'Registration not found'}), 404
    return jsonify({'success': True, 'registration': regs.update_registration(org_id, reg_id, data)})


@bp.route('/registrations/<reg_id>/items', methods=['POST'])
@require_role(*STAFF_ROLES)
def add_item(user_id, reg_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    data = request.json or {}
    class_id = data.get('class_id')
    if not class_id:
        return jsonify({'success': False, 'error': 'class_id is required'}), 400
    result = regs.add_item(org_id, reg_id, class_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, **result}), 201


@bp.route('/registrations/<reg_id>/items/<item_id>', methods=['DELETE'])
@require_role(*STAFF_ROLES)
def remove_item(user_id, reg_id, item_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    if not regs.get_registration(org_id, reg_id):
        return jsonify({'success': False, 'error': 'Registration not found'}), 404
    regs.remove_item(reg_id, item_id)
    return jsonify({'success': True})


@bp.route('/registrations/<reg_id>/submit', methods=['POST'])
@require_role(*STAFF_ROLES)
def submit_registration(user_id, reg_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    reg = regs.get_registration(org_id, reg_id)
    if not reg:
        return jsonify({'success': False, 'error': 'Registration not found'}), 404
    if not reg.get('items'):
        return jsonify({'success': False, 'error': 'Add at least one class before submitting'}), 400
    return jsonify({'success': True, 'registration': regs.submit(org_id, reg_id)})


@bp.route('/registrations/<reg_id>/complete', methods=['POST'])
@require_role(*STAFF_ROLES)
def complete_registration(user_id, reg_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    result = regs.complete(org_id, reg_id, completed_by=user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, **result})


# ── Age-exception requests (family asks to join a class outside its age band) ─
@bp.route('/age-exception-requests', methods=['GET'])
@require_role(*STAFF_ROLES)
def list_age_exception_requests(user_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    status = request.args.get('status')
    if status and status not in exceptions.REQUEST_STATUSES:
        return jsonify({'success': False, 'error': f'Invalid status: {status}'}), 400
    return jsonify({'success': True, 'requests': exceptions.list_requests(org_id, status)})


@bp.route('/age-exception-requests/<request_id>/resolve', methods=['POST'])
@require_role(*STAFF_ROLES)
def resolve_age_exception_request(user_id, request_id):
    """Approve (enrolls the student right away — approving IS the age override)
    or decline a pending request."""
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    action = (request.json or {}).get('action')
    if action not in ('approve', 'decline'):
        return jsonify({'success': False, 'error': "action must be 'approve' or 'decline'"}), 400
    result = exceptions.resolve(org_id, request_id, action, resolved_by=user_id)
    if result.get('error'):
        code = 404 if result['error'] == 'Request not found' else 400
        return jsonify({'success': False, 'error': result['error']}), code
    return jsonify({'success': True, **result})


@bp.route('/classes/<class_id>/eligibility', methods=['GET'])
@require_role(*STAFF_ROLES)
def class_eligibility(user_id, class_id):
    org_id, err = _org_or_error(user_id)
    if err:
        return err
    student_user_id = request.args.get('student')
    if not student_user_id:
        return jsonify({'success': False, 'error': 'student query param is required'}), 400
    result = regs.evaluate_eligibility(org_id, class_id, student_user_id)
    if result.get('error'):
        return jsonify({'success': False, 'error': result['error']}), 404
    return jsonify({'success': True, 'eligibility': result})
