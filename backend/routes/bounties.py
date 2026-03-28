"""
Bounty Board API Routes - Community educational challenges.

Non-student roles post bounties with deliverables. Students claim, complete
deliverables, and submit for approval. Superadmin can moderate.
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
@require_role('parent', 'advisor', 'org_admin', 'superadmin')
def create_bounty(user_id):
    """Create a new bounty with deliverables."""
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
        bounties = service.list_bounties(user_id=user_id, pillar=pillar, bounty_type=bounty_type)

        return jsonify({'success': True, 'bounties': bounties}), 200

    except Exception as e:
        logger.error(f"Error listing bounties: {e}")
        return jsonify({'error': 'Failed to list bounties', 'message': str(e)}), 500


@bounties_bp.route('/api/bounties/<bounty_id>', methods=['GET', 'OPTIONS'])
@require_role('student', 'parent', 'advisor', 'org_admin', 'superadmin')
def get_bounty(user_id, bounty_id):
    """Get bounty details with claims (if poster)."""
    try:
        service = BountyService()
        bounty = service.get_bounty(bounty_id)

        # Include claims with student info if the requester is the poster or superadmin
        is_superadmin = service.is_superadmin(user_id)
        if bounty['poster_id'] == user_id or is_superadmin:
            claims = service.repository.get_bounty_claims(bounty_id)
            # Enrich claims with student display info
            student_ids = list({c['student_id'] for c in claims if c.get('student_id')})
            student_map = {}
            if student_ids:
                students = service.repository.client.table('users')\
                    .select('id, display_name, first_name, last_name')\
                    .in_('id', student_ids).execute()
                for s in (students.data or []):
                    student_map[s['id']] = {
                        'display_name': s.get('display_name') or f"{s.get('first_name', '')} {s.get('last_name', '')}".strip() or 'Student',
                        'first_name': s.get('first_name', ''),
                        'last_name': s.get('last_name', ''),
                    }
            for claim in claims:
                claim['student'] = student_map.get(claim.get('student_id'), {})
            bounty['claims'] = claims

        return jsonify({'success': True, 'bounty': bounty}), 200

    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting bounty {bounty_id}: {e}")
        return jsonify({'error': 'Failed to get bounty', 'message': str(e)}), 500


@bounties_bp.route('/api/bounties/<bounty_id>', methods=['DELETE', 'OPTIONS'])
@require_role('parent', 'advisor', 'org_admin', 'superadmin')
def delete_bounty(user_id, bounty_id):
    """Delete a bounty (poster or superadmin only)."""
    try:
        service = BountyService()
        bounty = service.get_bounty(bounty_id)

        if bounty['poster_id'] != user_id:
            # Check if superadmin
            supabase = service.repository.client
            user_result = supabase.table('users').select('role').eq('id', user_id).execute()
            if not user_result.data or user_result.data[0].get('role') != 'superadmin':
                return jsonify({'error': 'Only the poster or superadmin can delete this bounty'}), 403

        service.repository.delete_bounty(bounty_id)
        return jsonify({'success': True}), 200

    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error deleting bounty {bounty_id}: {e}")
        return jsonify({'error': 'Failed to delete bounty', 'message': str(e)}), 500


@bounties_bp.route('/api/bounties/<bounty_id>', methods=['PUT', 'OPTIONS'])
@require_role('parent', 'advisor', 'org_admin', 'superadmin')
def update_bounty(user_id, bounty_id):
    """Update a bounty (poster only)."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400

        service = BountyService()
        bounty = service.update_bounty(bounty_id, user_id, data)

        return jsonify({'success': True, 'bounty': bounty}), 200

    except ValidationError as e:
        return jsonify({'error': 'Validation error', 'message': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error updating bounty {bounty_id}: {e}")
        return jsonify({'error': 'Failed to update bounty', 'message': str(e)}), 500


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


@bounties_bp.route('/api/bounties/<bounty_id>/claims/<claim_id>/deliverables', methods=['PUT', 'OPTIONS'])
@require_role('student', 'superadmin')
def toggle_deliverable(user_id, bounty_id, claim_id):
    """Toggle a deliverable as completed/uncompleted. Auto-submits when all done."""
    try:
        data = request.get_json()
        if not data or 'deliverable_id' not in data:
            return jsonify({'error': 'deliverable_id is required'}), 400

        service = BountyService()
        claim = service.toggle_deliverable(
            claim_id=claim_id,
            student_id=user_id,
            bounty_id=bounty_id,
            deliverable_id=data['deliverable_id'],
            completed=data.get('completed', True),
            deliverable_evidence=data.get('evidence'),
        )

        return jsonify({'success': True, 'claim': claim}), 200

    except ValidationError as e:
        return jsonify({'error': 'Validation error', 'message': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error toggling deliverable: {e}")
        return jsonify({'error': 'Failed to update deliverable', 'message': str(e)}), 500


@bounties_bp.route('/api/bounties/<bounty_id>/claims/<claim_id>/turn-in', methods=['POST', 'OPTIONS'])
@require_role('student', 'superadmin')
def turn_in_bounty(user_id, bounty_id, claim_id):
    """Student turns in a bounty for review."""
    try:
        service = BountyService()
        claim = service.turn_in_bounty(
            claim_id=claim_id,
            student_id=user_id,
            bounty_id=bounty_id,
        )

        return jsonify({'success': True, 'claim': claim}), 200

    except ValidationError as e:
        return jsonify({'error': 'Validation error', 'message': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error turning in bounty: {e}")
        return jsonify({'error': 'Failed to turn in bounty', 'message': str(e)}), 500


@bounties_bp.route('/api/bounties/<bounty_id>/claims/<claim_id>/evidence/<deliverable_id>/<int:evidence_index>', methods=['DELETE', 'OPTIONS'])
@require_role('student', 'superadmin')
def delete_deliverable_evidence(user_id, bounty_id, claim_id, deliverable_id, evidence_index):
    """Delete a specific evidence item from a deliverable."""
    try:
        service = BountyService()
        claim = service.delete_evidence_item(
            claim_id=claim_id,
            student_id=user_id,
            deliverable_id=deliverable_id,
            evidence_index=evidence_index,
        )

        return jsonify({'success': True, 'claim': claim}), 200

    except ValidationError as e:
        return jsonify({'error': 'Validation error', 'message': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error deleting evidence: {e}")
        return jsonify({'error': 'Failed to delete evidence', 'message': str(e)}), 500


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
@require_role('parent', 'advisor', 'org_admin', 'superadmin')
def get_my_posted(user_id):
    """Get bounties posted by current user (or all bounties for superadmin), with claims."""
    try:
        service = BountyService()
        if service.is_superadmin(user_id):
            bounties = service.get_all_bounties_with_claims()
        else:
            bounties = service.get_my_posted_with_claims(user_id)

        return jsonify({'success': True, 'bounties': bounties}), 200

    except Exception as e:
        logger.error(f"Error getting posted bounties: {e}")
        return jsonify({'error': 'Failed to get posted bounties', 'message': str(e)}), 500


@bounties_bp.route('/api/bounties/my-claims', methods=['GET', 'OPTIONS'])
@require_role('student', 'superadmin')
def get_my_claims(user_id):
    """Get bounties claimed by current user, enriched with bounty data."""
    try:
        service = BountyService()
        claims = service.get_my_claims_with_bounties(user_id)

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
