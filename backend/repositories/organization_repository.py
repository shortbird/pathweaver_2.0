"""
Organization Repository
Handles database operations for organization management and multi-tenancy.
"""

from typing import Optional, List, Dict, Any
from database import get_supabase_admin_client
from repositories.base_repository import BaseRepository, NotFoundError, DatabaseError
from utils.logger import get_logger

logger = get_logger(__name__)

# Optio parent organization ID (hardcoded for performance)
OPTIO_ORG_ID = '00000000-0000-0000-0000-000000000001'


class OrganizationRepository(BaseRepository):
    """Repository for organization operations"""

    table_name = 'organizations'
    id_column = 'id'

    def __init__(self, user_id: Optional[str] = None):
        """
        Initialize repository.

        Note: OrganizationRepository typically uses admin client (no user_id)
        since organization operations are admin-level.
        """
        super().__init__(user_id=user_id)

    def find_by_domain(self, domain: str) -> Optional[Dict[str, Any]]:
        """
        Find organization by full domain (e.g., 'ignite.optioeducation.com')

        Args:
            domain: Full domain to search for

        Returns:
            Organization dict or None if not found
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*')\
                .eq('full_domain', domain)\
                .eq('is_active', True)\
                .maybe_single()\
                .execute()

            return result.data
        except Exception as e:
            logger.error(f"Error finding organization by domain {domain}: {e}")
            return None

    def find_by_subdomain(self, subdomain: str) -> Optional[Dict[str, Any]]:
        """
        Find organization by subdomain (e.g., 'ignite')

        Args:
            subdomain: Subdomain to search for

        Returns:
            Organization dict or None if not found
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*')\
                .eq('subdomain', subdomain)\
                .eq('is_active', True)\
                .maybe_single()\
                .execute()

            return result.data
        except Exception as e:
            logger.error(f"Error finding organization by subdomain {subdomain}: {e}")
            return None

    def find_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        """
        Find organization by slug (e.g., 'optio', 'ignite')

        Args:
            slug: URL-safe slug

        Returns:
            Organization dict or None if not found
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*')\
                .eq('slug', slug)\
                .eq('is_active', True)\
                .maybe_single()\
                .execute()

            return result.data
        except Exception as e:
            logger.error(f"Error finding organization by slug {slug}: {e}")
            return None

    def get_optio_organization(self) -> Dict[str, Any]:
        """
        Get the Optio parent organization (default/fallback)

        Returns:
            Optio organization dict

        Raises:
            NotFoundError: If Optio org doesn't exist (critical error)
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*')\
                .eq('id', OPTIO_ORG_ID)\
                .single()\
                .execute()

            if not result.data:
                raise NotFoundError(f"Critical: Optio organization not found (ID: {OPTIO_ORG_ID})")

            return result.data
        except Exception as e:
            logger.error(f"Error getting Optio organization: {e}")
            raise NotFoundError(f"Critical: Cannot load Optio organization: {e}")

    def list_all_active(self) -> List[Dict[str, Any]]:
        """
        List all active organizations

        Returns:
            List of organization dicts
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*')\
                .eq('is_active', True)\
                .order('name')\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error listing organizations: {e}")
            return []

    def create_organization(
        self,
        name: str,
        slug: str,
        subdomain: Optional[str] = None,
        full_domain: Optional[str] = None,
        settings: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Create a new organization

        Args:
            name: Organization display name
            slug: URL-safe identifier
            subdomain: Subdomain for routing (e.g., 'ignite')
            full_domain: Full domain (e.g., 'ignite.optioeducation.com')
            settings: JSON settings dict

        Returns:
            Created organization dict

        Raises:
            DatabaseError: If creation fails
        """
        try:
            org_data = {
                'name': name,
                'slug': slug,
                'subdomain': subdomain,
                'full_domain': full_domain,
                'settings': settings or {},
                'is_active': True
            }

            result = self.client.table(self.table_name)\
                .insert(org_data)\
                .execute()

            if not result.data:
                raise DatabaseError(f"Failed to create organization: {name}")

            logger.info(f"Created organization: {name} (slug: {slug})")
            return result.data[0]

        except Exception as e:
            logger.error(f"Error creating organization {name}: {e}")
            raise DatabaseError(f"Failed to create organization: {e}")

    def update_organization(
        self,
        org_id: str,
        updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update organization settings

        Args:
            org_id: Organization UUID
            updates: Dict of fields to update

        Returns:
            Updated organization dict

        Raises:
            NotFoundError: If organization doesn't exist
            DatabaseError: If update fails
        """
        try:
            result = self.client.table(self.table_name)\
                .update(updates)\
                .eq('id', org_id)\
                .execute()

            if not result.data:
                raise NotFoundError(f"Organization not found: {org_id}")

            logger.info(f"Updated organization {org_id}: {list(updates.keys())}")
            return result.data[0]

        except Exception as e:
            logger.error(f"Error updating organization {org_id}: {e}")
            raise DatabaseError(f"Failed to update organization: {e}")

    def deactivate_organization(self, org_id: str) -> None:
        """
        Deactivate an organization (soft delete)

        Args:
            org_id: Organization UUID

        Raises:
            NotFoundError: If organization doesn't exist
            DatabaseError: If deactivation fails
        """
        if org_id == OPTIO_ORG_ID:
            raise DatabaseError("Cannot deactivate Optio parent organization")

        try:
            result = self.client.table(self.table_name)\
                .update({'is_active': False})\
                .eq('id', org_id)\
                .execute()

            if not result.data:
                raise NotFoundError(f"Organization not found: {org_id}")

            logger.info(f"Deactivated organization: {org_id}")

        except Exception as e:
            logger.error(f"Error deactivating organization {org_id}: {e}")
            raise DatabaseError(f"Failed to deactivate organization: {e}")

    def get_user_organization(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the organization for a specific user

        Args:
            user_id: User UUID

        Returns:
            Organization dict or None
        """
        try:
            # Get user's organization_id
            user_result = self.client.table('users')\
                .select('organization_id')\
                .eq('id', user_id)\
                .maybe_single()\
                .execute()

            if not user_result.data or not user_result.data.get('organization_id'):
                # No organization set, return Optio default
                return self.get_optio_organization()

            org_id = user_result.data['organization_id']

            # Get organization details
            org_result = self.client.table(self.table_name)\
                .select('*')\
                .eq('id', org_id)\
                .maybe_single()\
                .execute()

            return org_result.data

        except Exception as e:
            logger.error(f"Error getting user organization for {user_id}: {e}")
            return None

    def assign_user_to_organization(self, user_id: str, org_id: str) -> None:
        """
        Assign a user to an organization

        Args:
            user_id: User UUID
            org_id: Organization UUID

        Raises:
            NotFoundError: If user or organization doesn't exist
            DatabaseError: If assignment fails
        """
        try:
            # Verify organization exists
            org = self.find_by_id(org_id)
            if not org:
                raise NotFoundError(f"Organization not found: {org_id}")

            # Update user's organization
            result = self.client.table('users')\
                .update({'organization_id': org_id})\
                .eq('id', user_id)\
                .execute()

            if not result.data:
                raise NotFoundError(f"User not found: {user_id}")

            logger.info(f"Assigned user {user_id} to organization {org_id}")

        except Exception as e:
            logger.error(f"Error assigning user to organization: {e}")
            raise DatabaseError(f"Failed to assign user to organization: {e}")

    def get_organization_stats(self, org_id: str) -> Dict[str, int]:
        """
        Get statistics for an organization

        Args:
            org_id: Organization UUID

        Returns:
            Dict with user_count, quest_count, etc.
        """
        try:
            # Count users
            user_count_result = self.client.table('users')\
                .select('id', count='exact')\
                .eq('organization_id', org_id)\
                .execute()

            # Count quests
            quest_count_result = self.client.table('quests')\
                .select('id', count='exact')\
                .eq('organization_id', org_id)\
                .execute()

            return {
                'user_count': user_count_result.count or 0,
                'quest_count': quest_count_result.count or 0
            }

        except Exception as e:
            logger.error(f"Error getting organization stats for {org_id}: {e}")
            return {'user_count': 0, 'quest_count': 0}
