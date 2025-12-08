from typing import Dict, Any, List, Optional
from backend.repositories.base_repository import BaseRepository


class OrganizationRepository(BaseRepository):
    """Repository for organization data access"""

    table_name = 'organizations'

    def get_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        """Get organization by slug"""
        response = self.client.table(self.table_name)\
            .select('*')\
            .eq('slug', slug)\
            .eq('is_active', True)\
            .maybe_single()\
            .execute()
        return response.data if response.data else None

    def get_all_active(self) -> List[Dict[str, Any]]:
        """Get all active organizations"""
        response = self.client.table(self.table_name)\
            .select('*')\
            .eq('is_active', True)\
            .order('name')\
            .execute()
        return response.data if response.data else []

    def create_organization(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create new organization (superadmin only)"""
        from utils.logger import get_logger
        logger = get_logger(__name__)

        try:
            logger.info(f"Attempting to create organization with data: {data}")
            logger.info(f"Client type: {type(self.client)}, Table: {self.table_name}")

            response = self.client.table(self.table_name)\
                .insert(data)\
                .execute()

            logger.info(f"Response type: {type(response)}, Response: {response}")

            if response is None:
                raise Exception("Supabase client returned None for insert operation")

            if not response.data:
                raise Exception(f"Insert failed - no data returned. Response: {response}")

            logger.info(f"Successfully created organization: {response.data[0]}")
            return response.data[0]
        except Exception as e:
            logger.error(f"Error in create_organization: {type(e).__name__}: {str(e)}")
            # Re-raise with more context
            raise Exception(f"Failed to create organization: {str(e)}") from e

    def update_organization(self, org_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Update organization (superadmin only)"""
        response = self.client.table(self.table_name)\
            .update(data)\
            .eq('id', org_id)\
            .execute()
        return response.data[0] if response.data else None

    def get_organization_users(self, org_id: str) -> List[Dict[str, Any]]:
        """Get all users in an organization"""
        response = self.client.table('users')\
            .select('id, email, display_name, role, is_org_admin, total_xp')\
            .eq('organization_id', org_id)\
            .order('display_name')\
            .execute()
        return response.data if response.data else []

    def get_organization_quests(self, org_id: str) -> List[Dict[str, Any]]:
        """Get quests created by organization"""
        response = self.client.table('quests')\
            .select('*')\
            .eq('organization_id', org_id)\
            .eq('is_active', True)\
            .order('created_at.desc')\
            .execute()
        return response.data if response.data else []

    def get_curated_quests(self, org_id: str) -> List[Dict[str, Any]]:
        """Get curated quest access for organization"""
        response = self.client.table('organization_quest_access')\
            .select('quest_id, granted_at, granted_by, quests(*)')\
            .eq('organization_id', org_id)\
            .execute()
        return response.data if response.data else []

    def grant_quest_access(self, org_id: str, quest_id: str, granted_by: str) -> Dict[str, Any]:
        """Grant organization access to a quest (for curated policy)"""
        data = {
            'organization_id': org_id,
            'quest_id': quest_id,
            'granted_by': granted_by
        }
        response = self.client.table('organization_quest_access')\
            .insert(data)\
            .execute()
        return response.data[0] if response.data else None

    def revoke_quest_access(self, org_id: str, quest_id: str) -> bool:
        """Revoke organization access to a quest"""
        response = self.client.table('organization_quest_access')\
            .delete()\
            .eq('organization_id', org_id)\
            .eq('quest_id', quest_id)\
            .execute()
        return bool(response.data)

    def get_organization_analytics(self, org_id: str) -> Dict[str, Any]:
        """Get analytics for organization"""
        from backend.database import get_supabase_admin_client

        # Use admin client for analytics aggregation
        admin = get_supabase_admin_client()

        # Total users
        users_response = admin.table('users')\
            .select('id', count='exact')\
            .eq('organization_id', org_id)\
            .execute()

        # Get user IDs for this organization
        user_ids_response = admin.table('users')\
            .select('id')\
            .eq('organization_id', org_id)\
            .execute()

        user_ids = [u['id'] for u in user_ids_response.data] if user_ids_response.data else []

        # Total quests completed by org users
        completions_count = 0
        if user_ids:
            completions_response = admin.table('quest_task_completions')\
                .select('id', count='exact')\
                .in_('user_id', user_ids)\
                .execute()
            completions_count = completions_response.count if completions_response.count else 0

        # Total XP earned by org users (using RPC function)
        try:
            xp_result = admin.rpc('get_org_total_xp', {'org_id_param': org_id}).execute()
            total_xp = xp_result.data if xp_result.data else 0
        except Exception:
            # Fallback if RPC doesn't exist yet
            total_xp = 0

        return {
            'total_users': users_response.count if users_response.count else 0,
            'total_completions': completions_count,
            'total_xp': total_xp
        }
