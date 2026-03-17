"""
Bounty Service - Business logic for Bounty Board system.

Handles bounty lifecycle: creation, claiming, submission, review, and XP rewards.
Uses BountyRepository for all database access.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime, timezone

from services.base_service import BaseService, ValidationError
from repositories.base_repository import NotFoundError
from repositories.bounty_repository import BountyRepository
from repositories.yeti_repository import YetiRepository
from utils.logger import get_logger

logger = get_logger(__name__)

VALID_PILLARS = ('stem', 'art', 'communication', 'civics', 'wellness')
VALID_BOUNTY_TYPES = ('open', 'challenge', 'family', 'org', 'sponsored')
MIN_XP_REWARD = 25
MAX_XP_REWARD = 500


class BountyService(BaseService):
    """Service for bounty management and lifecycle."""

    def __init__(self):
        super().__init__()
        self.repository = BountyRepository()
        self.yeti_repository = YetiRepository()

    def create_bounty(self, poster_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new bounty. Starts in draft status."""
        self.validate_required(
            poster_id=poster_id,
            title=data.get('title'),
            description=data.get('description'),
            requirements=data.get('requirements'),
            pillar=data.get('pillar'),
            bounty_type=data.get('bounty_type'),
            deadline=data.get('deadline'),
        )

        pillar = data['pillar']
        if pillar not in VALID_PILLARS:
            raise ValidationError(f"Invalid pillar: {pillar}. Must be one of: {VALID_PILLARS}")

        bounty_type = data['bounty_type']
        if bounty_type not in VALID_BOUNTY_TYPES:
            raise ValidationError(f"Invalid bounty type: {bounty_type}")

        xp_reward = data.get('xp_reward', MIN_XP_REWARD)
        if not isinstance(xp_reward, int) or xp_reward < MIN_XP_REWARD or xp_reward > MAX_XP_REWARD:
            raise ValidationError(f"XP reward must be between {MIN_XP_REWARD} and {MAX_XP_REWARD}")

        bounty_data = {
            'poster_id': poster_id,
            'title': data['title'].strip(),
            'description': data['description'].strip(),
            'requirements': data['requirements'].strip(),
            'pillar': pillar,
            'bounty_type': bounty_type,
            'xp_reward': xp_reward,
            'max_participants': data.get('max_participants', 10),
            'deadline': data['deadline'],
            'status': 'pending_review',
            'sponsored_reward': data.get('sponsored_reward'),
            'organization_id': data.get('organization_id'),
            'platform_fee_cents': data.get('platform_fee_cents'),
        }

        bounty = self.repository.create_bounty(bounty_data)
        logger.info(f"Bounty '{data['title']}' created by {poster_id[:8]}")
        return bounty

    def get_bounty(self, bounty_id: str) -> Dict[str, Any]:
        """Get bounty details."""
        bounty = self.repository.get_bounty_by_id(bounty_id)
        if not bounty:
            raise NotFoundError(f"Bounty {bounty_id} not found")
        return bounty

    def list_bounties(self, pillar: Optional[str] = None, bounty_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """List active bounties with optional filters."""
        return self.repository.list_active_bounties(pillar=pillar, bounty_type=bounty_type)

    def get_my_posted(self, poster_id: str) -> List[Dict[str, Any]]:
        """Get bounties posted by user."""
        return self.repository.get_poster_bounties(poster_id)

    def get_my_claims(self, student_id: str) -> List[Dict[str, Any]]:
        """Get bounties claimed by student."""
        return self.repository.get_student_claims(student_id)

    def claim_bounty(self, bounty_id: str, student_id: str) -> Dict[str, Any]:
        """Student claims a bounty."""
        bounty = self.repository.get_bounty_by_id(bounty_id)
        if not bounty:
            raise NotFoundError(f"Bounty {bounty_id} not found")

        if bounty['status'] != 'active':
            raise ValidationError("Bounty is not active")

        # Check capacity
        current_claims = self.repository.count_bounty_claims(bounty_id)
        if current_claims >= bounty['max_participants']:
            raise ValidationError("Bounty has reached maximum participants")

        claim = self.repository.create_claim(bounty_id, student_id)
        logger.info(f"Student {student_id[:8]} claimed bounty {bounty_id[:8]}")
        return claim

    def submit_evidence(self, claim_id: str, student_id: str, evidence: Dict[str, Any]) -> Dict[str, Any]:
        """Student submits evidence for a claimed bounty."""
        claim = self.repository.get_claim(claim_id)
        if not claim:
            raise NotFoundError(f"Claim {claim_id} not found")

        if claim['student_id'] != student_id:
            raise ValidationError("You can only submit evidence for your own claims")

        if claim['status'] not in ('claimed', 'revision_requested'):
            raise ValidationError(f"Cannot submit evidence for claim with status '{claim['status']}'")

        return self.repository.submit_evidence(claim_id, evidence)

    def review_submission(self, claim_id: str, reviewer_id: str, decision: str, feedback: Optional[str] = None) -> Dict[str, Any]:
        """Poster reviews a submission."""
        if decision not in ('approved', 'rejected', 'revision_requested'):
            raise ValidationError(f"Invalid decision: {decision}")

        claim = self.repository.get_claim(claim_id)
        if not claim:
            raise NotFoundError(f"Claim {claim_id} not found")

        if claim['status'] != 'submitted':
            raise ValidationError("Can only review submitted claims")

        # Create review record
        self.repository.create_review(claim_id, reviewer_id, decision, feedback)

        # Update claim status
        updated_claim = self.repository.update_claim_status(claim_id, decision)

        # If approved, award XP
        if decision == 'approved':
            bounty = self.repository.get_bounty_by_id(claim['bounty_id'])
            if bounty:
                self._award_bounty_xp(claim['student_id'], bounty)

        logger.info(f"Claim {claim_id[:8]} reviewed: {decision}")
        return updated_claim

    def moderate_bounty(self, bounty_id: str, moderation_status: str, notes: Optional[str] = None) -> Dict[str, Any]:
        """Admin moderates a bounty (approve/reject)."""
        if moderation_status not in ('ai_approved', 'manually_approved', 'rejected'):
            raise ValidationError(f"Invalid moderation status: {moderation_status}")

        bounty = self.repository.update_moderation_status(bounty_id, moderation_status, notes)

        # Auto-activate approved bounties
        if moderation_status in ('ai_approved', 'manually_approved'):
            bounty = self.repository.update_bounty_status(bounty_id, 'active')

        return bounty

    def _award_bounty_xp(self, student_id: str, bounty: Dict[str, Any]):
        """Award XP for completing a bounty."""
        try:
            from services.xp_service import XPService
            xp_service = XPService()
            xp_service.award_xp(
                user_id=student_id,
                pillar=bounty['pillar'],
                xp_amount=bounty['xp_reward'],
                source='bounty_completion',
            )
            # Also add spendable XP
            self.yeti_repository.add_spendable_xp(student_id, bounty['xp_reward'])
            logger.info(f"Awarded {bounty['xp_reward']} XP to student {student_id[:8]} for bounty {bounty['id'][:8]}")
        except Exception as e:
            logger.error(f"Failed to award bounty XP: {e}")
