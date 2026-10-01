"""
SIS Bounties block (/api/sis/bounties): a school's staff see every bounty posted
to the school and every claim on it, in one place (Apogee Cache Valley,
2026-10-01: chores and perks, their ClassDojo).

Creating, editing and reviewing stay on /api/bounties (routes/bounties.py),
which students and families use too; with this block on, any staff member of
the school may manage a school bounty (bounty_service.can_manage). This
blueprint is only the school-wide read, so it carries the module gate.
"""

from flask import Blueprint, jsonify

from services import sis_service
from services.bounty_service import BountyService
from utils.auth.decorators import require_role
from utils.sis_roles import STAFF_ROLES

bp = Blueprint('sis_bounties', __name__, url_prefix='/api/sis/bounties')


@bp.route('', methods=['GET'])
@require_role(*STAFF_ROLES)
def org_bounties(user_id):
    """Every bounty posted to the caller's school, newest first, with claims."""
    org_id = sis_service.resolve_org_id(user_id, sis_service.requested_org_id())
    if not org_id:
        return jsonify({
            'success': False,
            'error': 'No organization in context. Superadmins must pass ?organization_id.',
        }), 400
    return jsonify({'success': True,
                    'bounties': BountyService().get_org_bounties_with_claims(org_id)})
