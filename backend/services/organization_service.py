from typing import Dict, Any, List, Optional
from backend.services.base_service import BaseService
from backend.repositories.organization_repository import OrganizationRepository
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
        """Get all data needed for org admin dashboard"""

        org = self.org_repo.find_by_id(org_id)
        users = self.org_repo.get_organization_users(org_id)
        quests = self.org_repo.get_organization_quests(org_id)
        analytics = self.org_repo.get_organization_analytics(org_id)

        # If curated policy, get curated quests
        curated_quests = []
        if org['quest_visibility_policy'] == 'curated':
            curated_quests = self.org_repo.get_curated_quests(org_id)

        return {
            'organization': org,
            'users': users,
            'organization_quests': quests,
            'curated_quests': curated_quests,
            'analytics': analytics
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
        from backend.repositories.quest_repository import QuestRepository
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
