"""GET /api/family/children -- the one child list for a guardian.

Any signed-in user may ask; the answer is [] for anyone who is nobody's
guardian. That is deliberate: the two endpoints this replaces refused
non-parents with a 403, and every client had to treat that 403 as "no
children", which also swallowed the 403 a phone-verification hold raises
(mobile stores/holdStore.ts). An empty list is not an error.

See services/family_children_service for what a child row carries and why
this list is the only one.
"""

from flask import Blueprint, jsonify

from services import family_children_service
from utils.auth.decorators import require_auth
from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('family_children', __name__, url_prefix='/api/family')


@bp.route('/children', methods=['GET'])
@require_auth
def my_children(user_id):
    try:
        children = family_children_service.children_of(user_id)
    except Exception as e:  # noqa: BLE001
        logger.error(f'family children failed for {user_id[:8]}: {e}', exc_info=True)
        return jsonify({'success': False, 'error': 'Failed to fetch children'}), 500
    return jsonify({'success': True, 'children': children, 'count': len(children)}), 200
