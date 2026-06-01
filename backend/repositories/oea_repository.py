"""
OEA Diploma Plan Repository

Data access for the Optio <> OpenEd Academy diploma integration: per-student
pathway enrollments (oea_enrollments) and self-attested course credits
(oea_credits).

Follows the DependentRepository pattern: the backend uses a custom JWT (not
Supabase auth.uid()), so these tables are RLS-locked with no public policies and
all access goes through the admin client here. Ownership (the acting parent
manages the target student) is enforced in the route layer / helpers, not RLS.

Phase 1 implements pathway enrollment. Credit methods are scaffolded for the
Phase 2 parent credit dashboard.
"""

from typing import List, Dict, Optional, Any
from repositories.base_repository import NotFoundError, ValidationError
from utils.oea_pathways import is_valid_pathway, PROGRAM_KEY
from utils.logger import get_logger

logger = get_logger(__name__)


class OEARepository:
    """Repository for OEA enrollment and credit operations (admin client)."""

    def __init__(self, client):
        """
        Args:
            client: Supabase admin client (cross-user parent/student operations).
        """
        self._client = client

    @property
    def client(self):
        return self._client

    # ── Enrollments ─────────────────────────────────────────────────────────

    def get_enrollment(self, student_id: str) -> Optional[Dict[str, Any]]:
        """Return the student's enrollment row, or None if not enrolled."""
        result = self.client.table('oea_enrollments') \
            .select('*').eq('student_id', student_id).execute()
        return result.data[0] if result.data else None

    def get_enrollments_for_parent(self, parent_id: str) -> List[Dict[str, Any]]:
        """Return all enrollments managed by a parent."""
        result = self.client.table('oea_enrollments') \
            .select('*').eq('parent_id', parent_id).execute()
        return result.data or []

    def upsert_enrollment(
        self,
        student_id: str,
        parent_id: str,
        pathway_key: str,
    ) -> Dict[str, Any]:
        """
        Select or change a student's diploma pathway.

        One enrollment per student (unique student_id). If the student is already
        enrolled, this updates the pathway in place (PRD: parents may change the
        pathway at any time with no approval). Otherwise it creates the enrollment.

        Raises:
            ValidationError: If pathway_key is not a valid OEA pathway.
        """
        if not is_valid_pathway(pathway_key):
            raise ValidationError(f"Invalid pathway: {pathway_key}")

        existing = self.get_enrollment(student_id)
        if existing:
            result = self.client.table('oea_enrollments') \
                .update({'pathway_key': pathway_key, 'parent_id': parent_id, 'updated_at': 'now()'}) \
                .eq('student_id', student_id).execute()
            if not result.data:
                raise NotFoundError(f"Failed to update enrollment for student {student_id}")
            logger.info(f"Updated OEA pathway for student {student_id} -> {pathway_key}")
            return result.data[0]

        result = self.client.table('oea_enrollments').insert({
            'student_id': student_id,
            'parent_id': parent_id,
            'program_key': PROGRAM_KEY,
            'pathway_key': pathway_key,
            'status': 'active',
        }).execute()
        if not result.data:
            raise ValidationError("Failed to create OEA enrollment")
        logger.info(f"Created OEA enrollment for student {student_id} -> {pathway_key}")
        return result.data[0]

    # ── Credits (Phase 2 dashboard reads on these) ──────────────────────────

    def get_credits(self, student_id: str) -> List[Dict[str, Any]]:
        """Return all self-attested credits for a student (newest first)."""
        result = self.client.table('oea_credits') \
            .select('*').eq('student_id', student_id) \
            .order('created_at', desc=True).execute()
        return result.data or []
