"""Removing several people from a school in one request.

The one-at-a-time route is DELETE /api/sis/people/<target_id> in
routes/sis/__init__.py. This is the same act over a list, for the moment right
after a family record is deleted: the accounts it grouped are still at the
school, the office has just been told so, and the answer used to be a walk to
People > Everyone for each of them (iCreate, 2026-09-14, 75037697).

Its own blueprint rather than a route in __init__.py so it can carry its own
module tag; registered from routes/__init__.py alongside the rest.

The ids arrive in the body, so no relationship decorator applies (the
per-person org check happens in sis_person_service._user for each id).
"""

from flask import Blueprint, request, jsonify

from modules.gate import require_module
from services import sis_service, sis_person_service
from utils.auth.decorators import require_role
from utils.logger import get_logger
from utils.sis_roles import ADMIN_ROLES
from utils.validation import validate_uuid

logger = get_logger(__name__)

bp = Blueprint('sis_people_removal', __name__, url_prefix='/api/sis')

MAX_BATCH = 20


@bp.route('/people/remove', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_module('sis')
def remove_people(user_id):
    """{"user_ids": [...]} -> each deleted outright, or archived when records
    depend on it. See sis_person_service.remove_people."""
    body = request.get_json(silent=True) or {}
    org_id = sis_service.resolve_org_id(user_id, request.args.get('organization_id')
                                        or body.get('organization_id'))
    if not org_id:
        return jsonify({'success': False, 'error': 'No organization in context.'}), 400
    ids = body.get('user_ids') or []
    if not isinstance(ids, list) or not ids:
        return jsonify({'success': False, 'error': 'user_ids is required.'}), 400
    if len(ids) > MAX_BATCH:
        return jsonify({'success': False,
                        'error': f'At most {MAX_BATCH} people at a time.'}), 400
    if any(not isinstance(i, str) or not validate_uuid(i)[0] for i in ids):
        return jsonify({'success': False, 'error': 'Invalid user id.'}), 400
    if user_id in ids:
        return jsonify({'success': False, 'error': "You can't remove your own account."}), 400
    result = sis_person_service.remove_people(org_id, list(dict.fromkeys(ids)), actor_id=user_id)
    return jsonify({'success': True, **result})
