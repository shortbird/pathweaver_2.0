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

    # ── Credits ──────────────────────────────────────────────────────────────

    def get_credits(self, student_id: str) -> List[Dict[str, Any]]:
        """Return all self-attested credits for a student (newest first)."""
        result = self.client.table('oea_credits') \
            .select('*').eq('student_id', student_id) \
            .order('created_at', desc=True).execute()
        return result.data or []

    def get_credit(self, credit_id: str) -> Optional[Dict[str, Any]]:
        """Return a single credit row, or None. Used for ownership checks."""
        result = self.client.table('oea_credits') \
            .select('*').eq('id', credit_id).execute()
        return result.data[0] if result.data else None

    def add_credit(
        self,
        student_id: str,
        enrollment_id: Optional[str],
        requirement_key: str,
        category: str,
        subject_key: Optional[str],
        course_name: str,
        credits: float,
        created_by: str,
    ) -> Dict[str, Any]:
        """Create a new (in-progress) course credit for a requirement slot."""
        result = self.client.table('oea_credits').insert({
            'student_id': student_id,
            'enrollment_id': enrollment_id,
            'requirement_key': requirement_key,
            'category': category,
            'subject_key': subject_key,
            'course_name': course_name,
            'credits': credits,
            'status': 'in_progress',
            'created_by': created_by,
        }).execute()
        if not result.data:
            raise ValidationError("Failed to create credit")
        return result.data[0]

    def update_credit(self, credit_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
        """Update a credit (course name / completion / grade / weighting)."""
        fields = {**fields, 'updated_at': 'now()'}
        result = self.client.table('oea_credits') \
            .update(fields).eq('id', credit_id).execute()
        if not result.data:
            raise NotFoundError(f"Credit {credit_id} not found")
        return result.data[0]

    def delete_credit(self, credit_id: str) -> bool:
        """Delete a credit."""
        result = self.client.table('oea_credits') \
            .delete().eq('id', credit_id).execute()
        if not result.data:
            raise NotFoundError(f"Credit {credit_id} not found")
        return True

    def create_course_quest(self, student_id: str, course_name: str, subject_label: Optional[str]) -> str:
        """
        Create a standard Optio quest in the student's account for an OEA course
        and enroll the student in it. Returns the new quest id.

        The quest starts empty -- the student adds tasks just-in-time in the mobile
        app and works them with the normal task -> evidence -> journal flow. XP
        accrues like any quest; it does NOT auto-convert into the OEA credit (the
        credit stays parent-graded). created_by is the student so the quest shows
        up as their own; enrollment makes it active.
        """
        from repositories.quest_repository import QuestRepository

        # Inherit the student's org for visibility (NULL for platform OEA families).
        student = self.client.table('users').select('organization_id') \
            .eq('id', student_id).execute()
        org_id = student.data[0].get('organization_id') if student.data else None

        # Brand the course quest with the school's logo as the header image
        # instead of the default Optio gradient. header_image_url takes
        # precedence in the quest header renderer (frontend questSourceConfig.js).
        # Falls back to NULL (default gradient) when the org has no logo.
        header_image_url = self._org_logo_url(org_id)

        description = f"OpenEd Academy course: {course_name}"
        if subject_label:
            description += f" ({subject_label})"

        quest_repo = QuestRepository()
        quest = quest_repo.create_quest({
            'title': course_name,
            'description': description,
            'quest_type': 'optio',
            'is_active': True,
            'is_public': False,
            'organization_id': org_id,
            'header_image_url': header_image_url,
        }, student_id)

        # Flag the quest so the header renders the org logo as a contained banner
        # (see frontend QuestDetailHeader) rather than a cropped full-bleed image.
        if header_image_url:
            self.client.table('quests') \
                .update({'metadata': {'header_style': 'org_logo'}}) \
                .eq('id', quest['id']).execute()

        quest_repo.enroll_user(student_id, quest['id'])
        logger.info(f"Created OEA course quest {quest['id']} for student {student_id}")
        return quest['id']

    def set_course_quest_completed(self, student_id: str, quest_id: str, completed: bool) -> None:
        """
        Mark (or reopen) the student's enrollment in an OEA course quest to mirror
        the credit's completion state.

        Uses the same user_quests columns the dashboard's active-quest filter reads
        (is_active + completed_at), so completing drops the quest off the student's
        current quests and reverting returns it.
        """
        from datetime import datetime
        if completed:
            update = {'is_active': False, 'completed_at': datetime.utcnow().isoformat()}
        else:
            update = {'is_active': True, 'completed_at': None}
        self.client.table('user_quests') \
            .update(update) \
            .eq('user_id', student_id) \
            .eq('quest_id', quest_id) \
            .execute()

    def _org_logo_url(self, org_id: Optional[str]) -> Optional[str]:
        """Return the organization's logo (branding_config.logo_url), or None."""
        if not org_id:
            return None
        org = self.client.table('organizations') \
            .select('branding_config').eq('id', org_id).execute()
        branding = (org.data[0].get('branding_config') or {}) if org.data else {}
        return branding.get('logo_url') or None

    # ── Credit evidence (proof attached to a credit) ─────────────────────────

    def get_credit_evidence(self, credit_id: str) -> List[Dict[str, Any]]:
        """Return evidence blocks for a credit (oldest first)."""
        result = self.client.table('oea_credit_evidence') \
            .select('*').eq('credit_id', credit_id) \
            .order('created_at', desc=False).execute()
        return result.data or []

    def get_evidence_counts(self, student_id: str) -> Dict[str, int]:
        """Return {credit_id: evidence_count} across all of a student's credits."""
        result = self.client.table('oea_credit_evidence') \
            .select('credit_id').eq('student_id', student_id).execute()
        counts: Dict[str, int] = {}
        for row in (result.data or []):
            cid = row['credit_id']
            counts[cid] = counts.get(cid, 0) + 1
        return counts

    def get_evidence(self, evidence_id: str) -> Optional[Dict[str, Any]]:
        """Return a single evidence row, or None. Used for ownership checks."""
        result = self.client.table('oea_credit_evidence') \
            .select('*').eq('id', evidence_id).execute()
        return result.data[0] if result.data else None

    def add_credit_evidence(
        self,
        credit_id: str,
        student_id: str,
        block_type: str,
        content: Dict[str, Any],
        created_by: str,
    ) -> Dict[str, Any]:
        """Attach an evidence block (text / link / file) to a credit."""
        result = self.client.table('oea_credit_evidence').insert({
            'credit_id': credit_id,
            'student_id': student_id,
            'block_type': block_type,
            'content': content,
            'created_by': created_by,
        }).execute()
        if not result.data:
            raise ValidationError("Failed to add evidence")
        return result.data[0]

    def delete_credit_evidence(self, evidence_id: str) -> bool:
        """Delete an evidence block."""
        result = self.client.table('oea_credit_evidence') \
            .delete().eq('id', evidence_id).execute()
        if not result.data:
            raise NotFoundError(f"Evidence {evidence_id} not found")
        return True
