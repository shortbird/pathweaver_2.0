"""
Bounty Board API Routes - Community educational challenges.

Students browse/claim/submit. Parents/advisors/orgs post bounties.
Superadmin can moderate.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_role
from services.bounty_service import BountyService
from services.base_service import ValidationError
from repositories.base_repository import NotFoundError
from utils.logger import get_logger

logger = get_logger(__name__)

bounties_bp = Blueprint('bounties', __name__)


@bounties_bp.route('/api/bounties', methods=['POST', 'OPTIONS'])
@require_role('student', 'parent', 'advisor', 'org_admin', 'superadmin')
def create_bounty(user_id):
    """Create a new bounty."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400

        service = BountyService()
        bounty = service.create_bounty(user_id, data)

        return jsonify({'success': True, 'bounty': bounty}), 201

    except ValidationError as e:
        return jsonify({'error': 'Validation error', 'message': str(e)}), 400
    except Exception as e:
        logger.error(f"Error creating bounty: {e}")
        return jsonify({'error': 'Failed to create bounty', 'message': str(e)}), 500


@bounties_bp.route('/api/bounties', methods=['GET', 'OPTIONS'])
@require_role('student', 'parent', 'advisor', 'org_admin', 'superadmin')
def list_bounties(user_id):
    """List active bounties with optional filters."""
    try:
        pillar = request.args.get('pillar')
        bounty_type = request.args.get('type')

        service = BountyService()
        bounties = service.list_bounties(pillar=pillar, bounty_type=bounty_type)

        return jsonify({'success': True, 'bounties': bounties}), 200

    except Exception as e:
        logger.error(f"Error listing bounties: {e}")
        return jsonify({'error': 'Failed to list bounties', 'message': str(e)}), 500


@bounties_bp.route('/api/bounties/<bounty_id>', methods=['GET', 'OPTIONS'])
@require_role('student', 'parent', 'advisor', 'org_admin', 'superadmin')
def get_bounty(user_id, bounty_id):
    """Get bounty details."""
    try:
        service = BountyService()
        bounty = service.get_bounty(bounty_id)

        return jsonify({'success': True, 'bounty': bounty}), 200

    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting bounty {bounty_id}: {e}")
        return jsonify({'error': 'Failed to get bounty', 'message': str(e)}), 500


@bounties_bp.route('/api/bounties/<bounty_id>/claim', methods=['POST', 'OPTIONS'])
@require_role('student', 'superadmin')
def claim_bounty(user_id, bounty_id):
    """Claim a bounty."""
    try:
        service = BountyService()
        claim = service.claim_bounty(bounty_id, user_id)

        return jsonify({'success': True, 'claim': claim}), 201

    except ValidationError as e:
        return jsonify({'error': 'Validation error', 'message': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error claiming bounty {bounty_id}: {e}")
        return jsonify({'error': 'Failed to claim bounty', 'message': str(e)}), 500


@bounties_bp.route('/api/bounties/<bounty_id>/submit', methods=['POST', 'OPTIONS'])
@require_role('student', 'superadmin')
def submit_evidence(user_id, bounty_id):
    """Submit evidence for a claimed bounty."""
    try:
        data = request.get_json()
        if not data or 'claim_id' not in data or 'evidence' not in data:
            return jsonify({'error': 'Missing required fields: claim_id, evidence'}), 400

        service = BountyService()
        claim = service.submit_evidence(data['claim_id'], user_id, data['evidence'])

        return jsonify({'success': True, 'claim': claim}), 200

    except ValidationError as e:
        return jsonify({'error': 'Validation error', 'message': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error submitting evidence: {e}")
        return jsonify({'error': 'Failed to submit evidence', 'message': str(e)}), 500


@bounties_bp.route('/api/bounties/<bounty_id>/review/<claim_id>', methods=['POST', 'OPTIONS'])
@require_role('parent', 'advisor', 'org_admin', 'superadmin')
def review_submission(user_id, bounty_id, claim_id):
    """Review a bounty submission."""
    try:
        data = request.get_json()
        if not data or 'decision' not in data:
            return jsonify({'error': 'Missing required field: decision'}), 400

        service = BountyService()
        claim = service.review_submission(
            claim_id=claim_id,
            reviewer_id=user_id,
            decision=data['decision'],
            feedback=data.get('feedback'),
        )

        return jsonify({'success': True, 'claim': claim}), 200

    except ValidationError as e:
        return jsonify({'error': 'Validation error', 'message': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error reviewing claim {claim_id}: {e}")
        return jsonify({'error': 'Failed to review submission', 'message': str(e)}), 500


@bounties_bp.route('/api/bounties/my-posted', methods=['GET', 'OPTIONS'])
@require_role('student', 'parent', 'advisor', 'org_admin', 'superadmin')
def get_my_posted(user_id):
    """Get bounties posted by current user."""
    try:
        service = BountyService()
        bounties = service.get_my_posted(user_id)

        return jsonify({'success': True, 'bounties': bounties}), 200

    except Exception as e:
        logger.error(f"Error getting posted bounties: {e}")
        return jsonify({'error': 'Failed to get posted bounties', 'message': str(e)}), 500


@bounties_bp.route('/api/bounties/my-claims', methods=['GET', 'OPTIONS'])
@require_role('student', 'superadmin')
def get_my_claims(user_id):
    """Get bounties claimed by current user."""
    try:
        service = BountyService()
        claims = service.get_my_claims(user_id)

        return jsonify({'success': True, 'claims': claims}), 200

    except Exception as e:
        logger.error(f"Error getting claims: {e}")
        return jsonify({'error': 'Failed to get claims', 'message': str(e)}), 500


@bounties_bp.route('/api/bounties/<bounty_id>/moderate', methods=['PUT', 'OPTIONS'])
@require_role('superadmin')
def moderate_bounty(user_id, bounty_id):
    """Admin: approve/reject a bounty."""
    try:
        data = request.get_json()
        if not data or 'moderation_status' not in data:
            return jsonify({'error': 'Missing required field: moderation_status'}), 400

        service = BountyService()
        bounty = service.moderate_bounty(
            bounty_id=bounty_id,
            moderation_status=data['moderation_status'],
            notes=data.get('notes'),
        )

        return jsonify({'success': True, 'bounty': bounty}), 200

    except ValidationError as e:
        return jsonify({'error': 'Validation error', 'message': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error moderating bounty {bounty_id}: {e}")
        return jsonify({'error': 'Failed to moderate bounty', 'message': str(e)}), 500
