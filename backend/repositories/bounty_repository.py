"""
Bounty Repository - Data access for Bounty Board system.

Handles bounty CRUD, claims, evidence submission, reviews, and filtering.
"""

from typing import Optional, Dict, List, Any
from datetime import datetime, timezone
from postgrest.exceptions import APIError

from repositories.base_repository import BaseRepository, NotFoundError, DatabaseError, ValidationError
from utils.logger import get_logger

logger = get_logger(__name__)


class BountyRepository(BaseRepository):
    """Repository for bounty operations across bounties, claims, and reviews tables."""

    table_name = 'bounties'

    # ──────────────────────────────────────────
    # Bounty CRUD
    # ──────────────────────────────────────────

    def create_bounty(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new bounty."""
        try:
            response = self.client.table('bounties').insert(data).execute()
            if not response.data:
                raise DatabaseError("Failed to create bounty")
            return response.data[0]
        except APIError as e:
            logger.error(f"Error creating bounty: {e}")
            raise DatabaseError(f"Failed to create bounty: {e}") from e

    def get_bounty_by_id(self, bounty_id: str) -> Optional[Dict[str, Any]]:
        """Get a single bounty by ID."""
        try:
            response = self.client.table('bounties').select('*').eq('id', bounty_id).execute()
            return response.data[0] if response.data else None
        except APIError as e:
            logger.error(f"Error fetching bounty {bounty_id}: {e}")
            raise DatabaseError("Failed to fetch bounty") from e

    def list_active_bounties(self, pillar: Optional[str] = None, bounty_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """List active bounties with optional filters."""
        try:
            query = self.client.table('bounties').select('*').eq('status', 'active')
            if pillar:
                query = query.eq('pillar', pillar)
            if bounty_type:
                query = query.eq('bounty_type', bounty_type)
            query = query.order('created_at', desc=True)
            response = query.execute()
            return response.data or []
        except APIError as e:
            logger.error(f"Error listing bounties: {e}")
            raise DatabaseError("Failed to list bounties") from e

    def get_poster_bounties(self, poster_id: str) -> List[Dict[str, Any]]:
        """Get all bounties posted by a user."""
        try:
            response = (
                self.client.table('bounties')
                .select('*')
                .eq('poster_id', poster_id)
                .order('created_at', desc=True)
                .execute()
            )
            return response.data or []
        except APIError as e:
            logger.error(f"Error fetching bounties for poster {poster_id[:8]}: {e}")
            raise DatabaseError("Failed to fetch poster bounties") from e

    def update_bounty_status(self, bounty_id: str, status: str) -> Dict[str, Any]:
        """Update bounty status."""
        try:
            response = (
                self.client.table('bounties')
                .update({'status': status, 'updated_at': datetime.now(timezone.utc).isoformat()})
                .eq('id', bounty_id)
                .execute()
            )
            if not response.data:
                raise NotFoundError(f"Bounty {bounty_id} not found")
            return response.data[0]
        except (NotFoundError,):
            raise
        except APIError as e:
            logger.error(f"Error updating bounty {bounty_id} status: {e}")
            raise DatabaseError("Failed to update bounty status") from e

    def update_moderation_status(self, bounty_id: str, moderation_status: str, notes: Optional[str] = None) -> Dict[str, Any]:
        """Update bounty moderation status."""
        try:
            data = {'moderation_status': moderation_status, 'updated_at': datetime.now(timezone.utc).isoformat()}
            if notes:
                data['moderation_notes'] = notes
            response = self.client.table('bounties').update(data).eq('id', bounty_id).execute()
            if not response.data:
                raise NotFoundError(f"Bounty {bounty_id} not found")
            return response.data[0]
        except (NotFoundError,):
            raise
        except APIError as e:
            logger.error(f"Error updating moderation for bounty {bounty_id}: {e}")
            raise DatabaseError("Failed to update moderation status") from e

    def delete_bounty(self, bounty_id: str) -> bool:
        """Delete a draft bounty."""
        try:
            response = self.client.table('bounties').delete().eq('id', bounty_id).execute()
            if not response.data:
                raise NotFoundError(f"Bounty {bounty_id} not found")
            return True
        except (NotFoundError,):
            raise
        except APIError as e:
            logger.error(f"Error deleting bounty {bounty_id}: {e}")
            raise DatabaseError("Failed to delete bounty") from e

    # ──────────────────────────────────────────
    # Claims
    # ──────────────────────────────────────────

    def create_claim(self, bounty_id: str, student_id: str) -> Dict[str, Any]:
        """Create a bounty claim."""
        try:
            response = (
                self.client.table('bounty_claims')
                .insert({'bounty_id': bounty_id, 'student_id': student_id})
                .execute()
            )
            if not response.data:
                raise DatabaseError("Failed to create claim")
            return response.data[0]
        except APIError as e:
            logger.error(f"Error creating claim for bounty {bounty_id}: {e}")
            raise DatabaseError(f"Failed to create claim: {e}") from e

    def get_claim(self, claim_id: str) -> Optional[Dict[str, Any]]:
        """Get a single claim by ID."""
        try:
            response = self.client.table('bounty_claims').select('*').eq('id', claim_id).execute()
            return response.data[0] if response.data else None
        except APIError as e:
            logger.error(f"Error fetching claim {claim_id}: {e}")
            raise DatabaseError("Failed to fetch claim") from e

    def get_student_claims(self, student_id: str) -> List[Dict[str, Any]]:
        """Get all claims for a student."""
        try:
            response = (
                self.client.table('bounty_claims')
                .select('*')
                .eq('student_id', student_id)
                .order('created_at', desc=True)
                .execute()
            )
            return response.data or []
        except APIError as e:
            logger.error(f"Error fetching claims for student {student_id[:8]}: {e}")
            raise DatabaseError("Failed to fetch student claims") from e

    def get_bounty_claims(self, bounty_id: str) -> List[Dict[str, Any]]:
        """Get all claims for a bounty."""
        try:
            response = (
                self.client.table('bounty_claims')
                .select('*')
                .eq('bounty_id', bounty_id)
                .order('created_at', desc=True)
                .execute()
            )
            return response.data or []
        except APIError as e:
            logger.error(f"Error fetching claims for bounty {bounty_id}: {e}")
            raise DatabaseError("Failed to fetch bounty claims") from e

    def submit_evidence(self, claim_id: str, evidence: Dict[str, Any]) -> Dict[str, Any]:
        """Submit evidence for a claim."""
        try:
            response = (
                self.client.table('bounty_claims')
                .update({
                    'evidence': evidence,
                    'status': 'submitted',
                    'submitted_at': datetime.now(timezone.utc).isoformat(),
                })
                .eq('id', claim_id)
                .execute()
            )
            if not response.data:
                raise NotFoundError(f"Claim {claim_id} not found")
            return response.data[0]
        except (NotFoundError,):
            raise
        except APIError as e:
            logger.error(f"Error submitting evidence for claim {claim_id}: {e}")
            raise DatabaseError("Failed to submit evidence") from e

    def update_claim_status(self, claim_id: str, status: str) -> Dict[str, Any]:
        """Update claim status."""
        try:
            data = {'status': status}
            if status in ('approved', 'rejected', 'revision_requested'):
                data['reviewed_at'] = datetime.now(timezone.utc).isoformat()
            response = self.client.table('bounty_claims').update(data).eq('id', claim_id).execute()
            if not response.data:
                raise NotFoundError(f"Claim {claim_id} not found")
            return response.data[0]
        except (NotFoundError,):
            raise
        except APIError as e:
            logger.error(f"Error updating claim {claim_id}: {e}")
            raise DatabaseError("Failed to update claim status") from e

    def count_bounty_claims(self, bounty_id: str) -> int:
        """Count claims for a bounty."""
        try:
            response = (
                self.client.table('bounty_claims')
                .select('*', count='exact')
                .eq('bounty_id', bounty_id)
                .execute()
            )
            return response.count or 0
        except APIError as e:
            logger.error(f"Error counting claims for bounty {bounty_id}: {e}")
            raise DatabaseError("Failed to count claims") from e

    # ──────────────────────────────────────────
    # Reviews
    # ──────────────────────────────────────────

    def create_review(self, claim_id: str, reviewer_id: str, decision: str, feedback: Optional[str] = None) -> Dict[str, Any]:
        """Create a review for a claim."""
        try:
            data = {
                'claim_id': claim_id,
                'reviewer_id': reviewer_id,
                'decision': decision,
            }
            if feedback:
                data['feedback'] = feedback
            response = self.client.table('bounty_reviews').insert(data).execute()
            if not response.data:
                raise DatabaseError("Failed to create review")
            return response.data[0]
        except APIError as e:
            logger.error(f"Error creating review for claim {claim_id}: {e}")
            raise DatabaseError(f"Failed to create review: {e}") from e

    def get_claim_reviews(self, claim_id: str) -> List[Dict[str, Any]]:
        """Get all reviews for a claim."""
        try:
            response = (
                self.client.table('bounty_reviews')
                .select('*')
                .eq('claim_id', claim_id)
                .order('created_at', desc=True)
                .execute()
            )
            return response.data or []
        except APIError as e:
            logger.error(f"Error fetching reviews for claim {claim_id}: {e}")
            raise DatabaseError("Failed to fetch reviews") from e
