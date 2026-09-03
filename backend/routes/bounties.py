"""
Bounty Board API Routes - Community educational challenges.

Non-student roles post bounties with deliverables. Students claim, complete
deliverables, and submit for approval. Superadmin can moderate.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_role
from middleware.rate_limiter import rate_limit
from services.bounty_service import BountyService
from services.base_service import ValidationError
from repositories.base_repository import NotFoundError
from utils.logger import get_logger

logger = get_logger(__name__)

bounties_bp = Blueprint('bounties', __name__)


@bounties_bp.route('/api/bounties', methods=['POST', 'OPTIONS'])
@require_role('parent', 'advisor', 'org_admin', 'observer', 'superadmin')
@rate_limit(limit=30, per=3600, per_user=True)
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
        return jsonify({'error': 'Failed to create bounty', 'message': 'Something went wrong creating the bounty. Please try again.'}), 500


@bounties_bp.route('/api/bounties/ai-draft', methods=['POST', 'OPTIONS'])
@require_role('parent', 'advisor', 'org_admin', 'observer', 'superadmin')
@rate_limit(limit=20, per=3600, per_user=True)
def draft_bounty_ideas(user_id):
    """AI-draft bounty ideas from a poster's plain-language intent.

    Propose-only: returns ideas that prefill the create form. Writes nothing —
    POST /api/bounties remains the only creation path, so a human reviews
    every AI-written word before it can reach a student.
    """
    try:
        data = request.get_json() or {}
        prompt_text = (data.get('prompt') or '').strip()
        if not prompt_text:
            return jsonify({'error': 'Tell us what you want to happen first'}), 400

        # AI consent follows the STUDENT whose content this is for (see
        # utils/ai_access.py docstring). A parent drafting for a specific kid is
        # gated on that kid's settings; with no kid attached, on their own.
        from utils.ai_access import require_ai_access
        child_id = (data.get('child_id') or '').strip() or None
        denied = require_ai_access(child_id or user_id, 'task_generation')
        if denied is not None:
            return denied

        from services.bounty_ai_service import BountyAIService
        service = BountyAIService()
        result = service.draft_bounty_ideas(
            prompt_text=prompt_text,
            reward_hint=(data.get('reward_hint') or '').strip(),
            child_context=(data.get('child_context') or '').strip(),
        )
        if not result.get('success'):
            return jsonify({'error': result.get('error') or 'Could not build bounty ideas from that.'}), 422
        return jsonify({'success': True, 'ideas': result['ideas']}), 200

    except Exception as e:
        from services.base_ai_service import AIServiceOverloadedError, AIServiceError
        if isinstance(e, AIServiceOverloadedError):
            return jsonify({'error': 'The AI is busy right now. Please try again in a moment.'}), 503
        if isinstance(e, AIServiceError):
            return jsonify({'error': 'Could not build bounty ideas right now. Please try again.'}), 502
        logger.error(f"Error drafting bounty ideas: {e}")
        return jsonify({'error': 'Could not build bounty ideas right now. Please try again.'}), 500


@bounties_bp.route('/api/bounties', methods=['GET', 'OPTIONS'])
@require_role('student', 'parent', 'advisor', 'org_admin', 'observer', 'superadmin')
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
        return jsonify({'error': 'Failed to list bounties', 'message': 'Something went wrong loading bounties.'}), 500


@bounties_bp.route('/api/bounties/<bounty_id>', methods=['GET', 'OPTIONS'])
@require_role('student', 'parent', 'advisor', 'org_admin', 'observer', 'superadmin')
def get_bounty(user_id, bounty_id):
    """Get bounty details with claims (if poster). Visibility-checked: a
    bounty the viewer couldn't see on their board 404s here too."""
    try:
        service = BountyService()
        bounty = service.get_bounty_detail(bounty_id, user_id)
        return jsonify({'success': True, 'bounty': bounty}), 200

    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting bounty {bounty_id}: {e}")
        return jsonify({'error': 'Failed to get bounty', 'message': 'Something went wrong loading this bounty.'}), 500


@bounties_bp.route('/api/bounties/<bounty_id>', methods=['DELETE', 'OPTIONS'])
@require_role('parent', 'advisor', 'org_admin', 'observer', 'superadmin')
@rate_limit(limit=60, per=3600, per_user=True)
def delete_bounty(user_id, bounty_id):
    """Delete a bounty (poster or superadmin only). Students with live claims
    are notified."""
    try:
        service = BountyService()
        service.delete_bounty(bounty_id, user_id)
        return jsonify({'success': True}), 200

    except ValidationError as e:
        return jsonify({'error': str(e)}), 403
    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error deleting bounty {bounty_id}: {e}")
        return jsonify({'error': 'Failed to delete bounty', 'message': 'Something went wrong deleting this bounty.'}), 500


@bounties_bp.route('/api/bounties/<bounty_id>', methods=['PUT', 'OPTIONS'])
@require_role('parent', 'advisor', 'org_admin', 'observer', 'superadmin')
@rate_limit(limit=60, per=3600, per_user=True)
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
        return jsonify({'error': 'Failed to update bounty', 'message': 'Something went wrong updating this bounty.'}), 500


@bounties_bp.route('/api/bounties/<bounty_id>/claim', methods=['POST', 'OPTIONS'])
@require_role('student', 'advisor', 'org_admin', 'superadmin')
@rate_limit(limit=60, per=3600, per_user=True)
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
        return jsonify({'error': 'Failed to claim bounty', 'message': 'Something went wrong claiming this bounty.'}), 500


@bounties_bp.route('/api/bounties/<bounty_id>/claims/<claim_id>/deliverables', methods=['PUT', 'OPTIONS'])
@require_role('student', 'advisor', 'org_admin', 'superadmin')
@rate_limit(limit=240, per=3600, per_user=True)
def toggle_deliverable(user_id, bounty_id, claim_id):
    """Toggle a deliverable as completed/uncompleted with evidence. The student
    still turns the bounty in explicitly."""
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
        return jsonify({'error': 'Failed to update deliverable', 'message': 'Something went wrong saving your progress.'}), 500


@bounties_bp.route('/api/bounties/<bounty_id>/claims/<claim_id>/turn-in', methods=['POST', 'OPTIONS'])
@require_role('student', 'advisor', 'org_admin', 'superadmin')
@rate_limit(limit=60, per=3600, per_user=True)
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
        return jsonify({'error': 'Failed to turn in bounty', 'message': 'Something went wrong turning in this bounty.'}), 500


@bounties_bp.route('/api/bounties/<bounty_id>/claims/<claim_id>', methods=['DELETE', 'OPTIONS'])
@require_role('student', 'advisor', 'org_admin', 'superadmin')
@rate_limit(limit=60, per=3600, per_user=True)
def abandon_claim(user_id, bounty_id, claim_id):
    """Student drops a bounty they claimed (before turning it in)."""
    try:
        service = BountyService()
        service.abandon_claim(claim_id=claim_id, student_id=user_id, bounty_id=bounty_id)
        return jsonify({'success': True}), 200
    except ValidationError as e:
        return jsonify({'error': 'Validation error', 'message': str(e)}), 400
    except NotFoundError as e:
        return jsonify({'error': 'Not found', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"Error dropping bounty claim {claim_id}: {e}")
        return jsonify({'error': 'Failed to drop bounty', 'message': 'Something went wrong dropping this bounty.'}), 500


@bounties_bp.route('/api/bounties/<bounty_id>/claims/<claim_id>/evidence/<deliverable_id>/<int:evidence_index>', methods=['DELETE', 'OPTIONS'])
@require_role('student', 'advisor', 'org_admin', 'superadmin')
@rate_limit(limit=120, per=3600, per_user=True)
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
        return jsonify({'error': 'Failed to delete evidence', 'message': 'Something went wrong deleting that evidence.'}), 500


@bounties_bp.route('/api/bounties/<bounty_id>/review/<claim_id>', methods=['POST', 'OPTIONS'])
@require_role('parent', 'advisor', 'org_admin', 'observer', 'superadmin')
@rate_limit(limit=60, per=3600, per_user=True)
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
        return jsonify({'error': 'Failed to review submission', 'message': 'Something went wrong saving your review.'}), 500


@bounties_bp.route('/api/bounties/my-posted', methods=['GET', 'OPTIONS'])
@require_role('parent', 'advisor', 'org_admin', 'observer', 'superadmin')
def get_my_posted(user_id):
    """Get bounties posted by the current user, with claims.

    Note: superadmins get only what they actually posted here too. The parent
    "Posted by you" surface is a personal review queue, not a moderation view;
    a moderation endpoint (`/api/bounties/<id>/moderate`) already exists for
    superadmin oversight.
    """
    try:
        service = BountyService()
        bounties = service.get_my_posted_with_claims(user_id)
        return jsonify({'success': True, 'bounties': bounties}), 200

    except Exception as e:
        logger.error(f"Error getting posted bounties: {e}")
        return jsonify({'error': 'Failed to get posted bounties', 'message': 'Something went wrong loading your bounties.'}), 500


@bounties_bp.route('/api/bounties/my-claims', methods=['GET', 'OPTIONS'])
@require_role('student', 'advisor', 'org_admin', 'superadmin')
def get_my_claims(user_id):
    """Get bounties claimed by current user, enriched with bounty data."""
    try:
        service = BountyService()
        claims = service.get_my_claims_with_bounties(user_id)

        return jsonify({'success': True, 'claims': claims}), 200

    except Exception as e:
        logger.error(f"Error getting claims: {e}")
        return jsonify({'error': 'Failed to get claims', 'message': 'Something went wrong loading your claims.'}), 500


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
        return jsonify({'error': 'Failed to moderate bounty', 'message': 'Something went wrong moderating this bounty.'}), 500
