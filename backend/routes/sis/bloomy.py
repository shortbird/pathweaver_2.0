"""
SIS Bloomy connection (/api/sis/bloomy): the school's Bloomy Data API key, which
Bloomy student is which Optio student, and a "Sync now" for the nightly sweep.
Built for Apogee Cache Valley (2026-10-05); the rules live in
services/bloomy_sync_service.

Admin-only: the key is a school credential and a link decides whose record a
child's work lands on. Nothing here ever returns the key itself.
"""

from flask import Blueprint, jsonify, request

from services import bloomy_sync_service as bloomy
from services import sis_service
from utils.auth.decorators import require_role
from utils.sis_roles import ADMIN_ROLES

bp = Blueprint('sis_bloomy', __name__, url_prefix='/api/sis/bloomy')


def _org_or_400(user_id):
    org_id = sis_service.resolve_org_id(user_id, sis_service.requested_org_id())
    if not org_id:
        return None, (jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.',
        }), 400)
    return org_id, None


@bp.route('', methods=['GET'])
@require_role(*ADMIN_ROLES)
def overview(user_id):
    """Connected or not, Bloomy's roster with each student's link and a
    suggested match, and the school's Optio students to pick from.
    ?refresh=1 reads Bloomy again instead of the few-minute copy."""
    org_id, error = _org_or_400(user_id)
    if error:
        return error
    refresh = request.args.get('refresh') == '1'
    return jsonify({'success': True, **bloomy.overview(org_id, refresh=refresh)})


@bp.route('/student', methods=['GET'])
@require_role(*ADMIN_ROLES)
def student_detail(user_id):
    """?bloomy_student_id= : one Bloomy student's recent skills and test
    attempts. The id is Bloomy's, not an Optio user id; the school's key
    limits Bloomy's answer to its own students."""
    org_id, error = _org_or_400(user_id)
    if error:
        return error
    sid = (request.args.get('bloomy_student_id') or '').strip()
    if not sid:
        return jsonify({'success': False, 'error': 'bloomy_student_id is required'}), 400
    try:
        data = bloomy.student_detail(org_id, sid)
    except bloomy.BloomySetupError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    return jsonify({'success': True, **data})


@bp.route('/key', methods=['PUT'])
@require_role(*ADMIN_ROLES)
def save_key(user_id):
    """Body: {api_key}. Checked against Bloomy before it is stored; an empty
    key disconnects."""
    org_id, error = _org_or_400(user_id)
    if error:
        return error
    body = request.get_json(silent=True) or {}
    try:
        count = bloomy.save_key(org_id, body.get('api_key') or '', user_id)
    except bloomy.BloomySetupError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    return jsonify({'success': True, 'connected': bool(count) or bool(body.get('api_key')),
                    'bloomy_students': count})


@bp.route('/links', methods=['PUT'])
@require_role(*ADMIN_ROLES)
def set_link(user_id):
    """Body: {bloomy_student_id, user_id}. user_id null unlinks. The student
    is checked to belong to the caller's school in the service."""
    org_id, error = _org_or_400(user_id)
    if error:
        return error
    body = request.get_json(silent=True) or {}
    try:
        bloomy.set_link(org_id, body.get('bloomy_student_id'), body.get('user_id') or None)
    except bloomy.BloomySetupError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    return jsonify({'success': True})


@bp.route('/sync', methods=['POST'])
@require_role(*ADMIN_ROLES)
def sync_now(user_id):
    """Run the nightly sync for this school now. Safe to repeat: a day already
    read writes nothing."""
    org_id, error = _org_or_400(user_id)
    if error:
        return error
    try:
        summary = bloomy.sync_org(org_id)
    except bloomy.BloomySetupError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    return jsonify({'success': True, **summary})
