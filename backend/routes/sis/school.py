"""
SIS School routes — the school's own surface, for everyone who is in it.

Separate from /api/sis/parent on purpose. Those routes answer "what may this
GUARDIAN do for their family" and return nothing to a student or a teacher who
guards nobody; these answer "which school am I in", which every member has an
answer to. Keeping them apart means widening the hub can never quietly widen a
guardian action — /api/sis/parent still authorizes by family relationship.

@require_auth only; the org itself is resolved from the caller, never taken
from the request.
"""

from flask import Blueprint, jsonify

from utils.auth.decorators import require_auth
from utils.logger import get_logger
from services import sis_parent_service as parent

logger = get_logger(__name__)

bp = Blueprint('sis_school', __name__, url_prefix='/api/sis/school')


@bp.route('/context', methods=['GET'])
@require_auth
def get_school_context(user_id):
    """The schools this user belongs to, and whether they guard a child in each.

    Drives the school hub: which cards to render, and which org the school-wide
    reads (calendar, resources, directory) are for. Empty orgs means no school,
    which the hub treats as "you have no school page" rather than an error.
    """
    return jsonify({'success': True, **parent.school_context(user_id)})
