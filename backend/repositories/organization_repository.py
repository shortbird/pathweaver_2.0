from typing import Dict, Any, List, Optional
from repositories.base_repository import BaseRepository


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
        return response.data if response and response.data else None

    def find_by_id(self, org_id: str) -> Optional[Dict[str, Any]]:
        """Get organization by ID"""
        response = self.client.table(self.table_name)\
            .select('*')\
            .eq('id', org_id)\
            .maybe_single()\
            .execute()
        return response.data if response and response.data else None

    def assign_user_to_organization(self, user_id: str, organization_id: str) -> bool:
        """Assign a user to an organization"""
        response = self.client.table('users')\
            .update({'organization_id': organization_id})\
            .eq('id', user_id)\
            .execute()
        return bool(response.data)

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

    def get_organization_users(self, org_id: str, role: str = None) -> List[Dict[str, Any]]:
        """Get all users in an organization, optionally filtered by role.

        Note: Organization users have role='org_managed' with their actual role in org_role.
        So filtering by 'student' will filter by org_role='student'.
        """
        query = self.client.table('users')\
            .select('id, email, display_name, first_name, last_name, role, org_role, is_org_admin, total_xp')\
            .eq('organization_id', org_id)

        if role:
            # Organization users have role='org_managed' with actual role in org_role
            query = query.eq('org_role', role)

        response = query.order('first_name').execute()
        return response.data if response.data else []

    def get_organization_quests(self, org_id: str) -> List[Dict[str, Any]]:
        """Get quests created by organization"""
        response = self.client.table('quests')\
            .select('*')\
            .eq('organization_id', org_id)\
            .eq('is_active', True)\
            .order('created_at', desc=True)\
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
        """Get analytics for organization using efficient SQL aggregation"""
        from database import get_supabase_admin_client

        admin = get_supabase_admin_client()

        # Use raw SQL for efficient aggregation in a single query
        result = admin.rpc('get_organization_analytics', {'p_org_id': org_id}).execute()

        if result.data and len(result.data) > 0:
            return result.data[0]

        # Fallback to individual queries if RPC doesn't exist
        return self._get_organization_analytics_fallback(org_id)

    def _get_organization_analytics_fallback(self, org_id: str) -> Dict[str, Any]:
        """Fallback analytics using individual queries"""
        from database import get_supabase_admin_client

        admin = get_supabase_admin_client()

        # Get users in org
        users_response = admin.table('users')\
            .select('id', count='exact')\
            .eq('organization_id', org_id)\
            .execute()

        total_users = users_response.count if users_response.count else 0
        user_ids = [u['id'] for u in users_response.data] if users_response.data else []

        # Count completions and sum XP from user_skill_xp table
        completions_count = 0
        total_xp = 0
        if user_ids:
            completions_response = admin.table('quest_task_completions')\
                .select('id', count='exact')\
                .in_('user_id', user_ids)\
                .execute()
            completions_count = completions_response.count if completions_response.count else 0

            # XP is stored in user_skill_xp table
            xp_response = admin.table('user_skill_xp')\
                .select('xp_amount')\
                .in_('user_id', user_ids)\
                .execute()
            total_xp = sum(x.get('xp_amount', 0) or 0 for x in xp_response.data) if xp_response.data else 0

        return {
            'total_users': total_users,
            'total_completions': completions_count,
            'total_xp': total_xp
        }

    # Course visibility methods
    def get_organization_courses(self, org_id: str) -> List[Dict[str, Any]]:
        """Get courses created by organization"""
        response = self.client.table('courses')\
            .select('*')\
            .eq('organization_id', org_id)\
            .order('created_at', desc=True)\
            .execute()
        return response.data if response.data else []

    def get_curated_courses(self, org_id: str) -> List[Dict[str, Any]]:
        """Get curated course access for organization"""
        response = self.client.table('organization_course_access')\
            .select('course_id, granted_at, granted_by, courses(*)')\
            .eq('organization_id', org_id)\
            .execute()
        return response.data if response.data else []

    def grant_course_access(self, org_id: str, course_id: str, granted_by: str) -> Dict[str, Any]:
        """Grant organization access to a course (for curated policy)"""
        data = {
            'organization_id': org_id,
            'course_id': course_id,
            'granted_by': granted_by
        }
        response = self.client.table('organization_course_access')\
            .insert(data)\
            .execute()
        return response.data[0] if response.data else None

    def revoke_course_access(self, org_id: str, course_id: str) -> bool:
        """Revoke organization access to a course"""
        response = self.client.table('organization_course_access')\
            .delete()\
            .eq('organization_id', org_id)\
            .eq('course_id', course_id)\
            .execute()
        return bool(response.data)
