from typing import Dict, Any, List, Optional
from services.base_service import BaseService
from repositories.organization_repository import OrganizationRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class OrganizationService(BaseService):
    """Business logic for organization management"""

    def __init__(self):
        super().__init__()
        self.org_repo = OrganizationRepository()

    def get_organization_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        """Get organization by slug"""
        return self.org_repo.get_by_slug(slug)

    def list_all_organizations(self) -> List[Dict[str, Any]]:
        """List all active organizations (superadmin only)"""
        return self.org_repo.get_all_active()

    def create_organization(
        self,
        name: str,
        slug: str,
        policy: str,
        created_by: str
    ) -> Dict[str, Any]:
        """Create new organization (superadmin only)"""

        # Validate policy
        valid_policies = ['all_optio', 'curated', 'private_only']
        if policy not in valid_policies:
            raise ValueError(f"Invalid policy. Must be one of: {', '.join(valid_policies)}")

        # Validate slug format (alphanumeric + hyphens only)
        import re
        if not re.match(r'^[a-z0-9-]+$', slug):
            raise ValueError("Slug must contain only lowercase letters, numbers, and hyphens")

        # Check if slug already exists
        existing = self.org_repo.get_by_slug(slug)
        if existing:
            raise ValueError(f"Organization with slug '{slug}' already exists")

        data = {
            'name': name,
            'slug': slug,
            'quest_visibility_policy': policy,
            'branding_config': {},
            'is_active': True
        }

        org = self.org_repo.create_organization(data)

        # Log organization creation
        logger.info(f"Organization created: {name} (slug: {slug}, policy: {policy}) by user {created_by}")

        return org

    def update_organization_policy(
        self,
        org_id: str,
        new_policy: str,
        updated_by: str
    ) -> Dict[str, Any]:
        """Update organization quest visibility policy"""

        valid_policies = ['all_optio', 'curated', 'private_only']
        if new_policy not in valid_policies:
            raise ValueError(f"Invalid policy. Must be one of: {', '.join(valid_policies)}")

        data = {'quest_visibility_policy': new_policy}
        org = self.org_repo.update_organization(org_id, data)

        logger.info(f"Organization {org_id} policy updated to {new_policy} by user {updated_by}")

        return org

    def get_organization_dashboard_data(self, org_id: str) -> Dict[str, Any]:
        """Get all data needed for org admin dashboard (excluding analytics for lazy loading)"""

        org = self.org_repo.find_by_id(org_id)
        users = self.org_repo.get_organization_users(org_id)
        quests = self.org_repo.get_organization_quests(org_id)
        courses = self.org_repo.get_organization_courses(org_id)

        # If curated policy, get curated quests
        curated_quests = []
        if org['quest_visibility_policy'] == 'curated':
            curated_quests = self.org_repo.get_curated_quests(org_id)

        # If curated course policy, get curated courses
        curated_courses = []
        if org.get('course_visibility_policy', 'all_optio') == 'curated':
            curated_courses = self.org_repo.get_curated_courses(org_id)

        return {
            'organization': org,
            'users': users,
            'organization_quests': quests,
            'curated_quests': curated_quests,
            'organization_courses': courses,
            'curated_courses': curated_courses
        }

    def grant_quest_access(
        self,
        org_id: str,
        quest_id: str,
        granted_by: str
    ) -> Dict[str, Any]:
        """Grant organization access to a quest (curated policy only)"""

        # Verify organization has curated policy
        org = self.org_repo.find_by_id(org_id)
        if org['quest_visibility_policy'] != 'curated':
            raise ValueError("Can only grant quest access for organizations with 'curated' policy")

        # Verify quest is a global Optio quest (organization_id IS NULL)
        from repositories.quest_repository import QuestRepository
        quest_repo = QuestRepository()
        quest = quest_repo.find_by_id(quest_id)

        if quest['organization_id'] is not None:
            raise ValueError("Can only grant access to global Optio quests")

        result = self.org_repo.grant_quest_access(org_id, quest_id, granted_by)

        logger.info(f"Quest {quest_id} access granted to org {org_id} by user {granted_by}")

        return result

    def revoke_quest_access(
        self,
        org_id: str,
        quest_id: str,
        revoked_by: str
    ) -> bool:
        """Revoke organization access to a quest"""

        success = self.org_repo.revoke_quest_access(org_id, quest_id)

        if success:
            logger.info(f"Quest {quest_id} access revoked from org {org_id} by user {revoked_by}")

        return success

    # Course visibility methods
    def update_course_visibility_policy(
        self,
        org_id: str,
        new_policy: str,
        updated_by: str
    ) -> Dict[str, Any]:
        """Update organization course visibility policy"""

        valid_policies = ['all_optio', 'curated', 'private_only']
        if new_policy not in valid_policies:
            raise ValueError(f"Invalid policy. Must be one of: {', '.join(valid_policies)}")

        data = {'course_visibility_policy': new_policy}
        org = self.org_repo.update_organization(org_id, data)

        logger.info(f"Organization {org_id} course policy updated to {new_policy} by user {updated_by}")

        return org

    def grant_course_access(
        self,
        org_id: str,
        course_id: str,
        granted_by: str
    ) -> Dict[str, Any]:
        """Grant organization access to a course (curated policy only)"""

        # Verify organization has curated policy
        org = self.org_repo.find_by_id(org_id)
        if org.get('course_visibility_policy', 'all_optio') != 'curated':
            raise ValueError("Can only grant course access for organizations with 'curated' course policy")

        # Verify course is a global Optio course (organization_id IS NULL or different org)
        from database import get_supabase_admin_client
        client = get_supabase_admin_client()
        course_result = client.table('courses').select('id, organization_id, status').eq('id', course_id).execute()

        if not course_result.data:
            raise ValueError("Course not found")

        course = course_result.data[0]
        if course['organization_id'] == org_id:
            raise ValueError("Cannot grant access to your own organization's course")

        if course['status'] != 'published':
            raise ValueError("Can only grant access to published courses")

        result = self.org_repo.grant_course_access(org_id, course_id, granted_by)

        logger.info(f"Course {course_id} access granted to org {org_id} by user {granted_by}")

        return result

    def revoke_course_access(
        self,
        org_id: str,
        course_id: str,
        revoked_by: str
    ) -> bool:
        """Revoke organization access to a course"""

        success = self.org_repo.revoke_course_access(org_id, course_id)

        if success:
            logger.info(f"Course {course_id} access revoked from org {org_id} by user {revoked_by}")

        return success
