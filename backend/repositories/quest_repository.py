"""
Quest Repository - Database operations for quests and quest tasks

Handles all quest-related database queries with RLS enforcement.
"""

import logging
from typing import Optional, Dict, List, Any
from repositories.base_repository import BaseRepository, DatabaseError, NotFoundError
from postgrest.exceptions import APIError

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)


class QuestRepository(BaseRepository):
    """Repository for quest database operations"""

    table_name = 'quests'
    id_column = 'id'

    def get_active_quests(
        self,
        pillar: Optional[str] = None,
        source: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get all active quests with optional filtering.

        Args:
            pillar: Filter by pillar (optional)
            source: Filter by source (optio/lms) (optional)
            limit: Maximum number of quests

        Returns:
            List of active quest records

        Raises:
            DatabaseError: If query fails
        """
        filters = {'is_active': True}
        if source:
            filters['source'] = source

        return self.find_all(filters=filters, order_by='-created_at', limit=limit)

    def get_quest_with_tasks(self, quest_id: str) -> Dict[str, Any]:
        """
        Get quest details with all associated tasks.

        Args:
            quest_id: Quest ID

        Returns:
            Quest record with 'tasks' array

        Raises:
            NotFoundError: If quest doesn't exist
            DatabaseError: If query fails
        """
        try:
            # Get quest details
            response = (
                self.client.table(self.table_name)
                .select('*, quest_tasks(*)')
                .eq('id', quest_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"Quest {quest_id} not found")

            quest = response.data[0]

            # Sort tasks by order_index
            if quest.get('quest_tasks'):
                quest['quest_tasks'] = sorted(
                    quest['quest_tasks'],
                    key=lambda t: t.get('order_index', 0)
                )

            return quest

        except APIError as e:
            logger.error(f"Error fetching quest with tasks {quest_id}: {e}")
            raise DatabaseError("Failed to fetch quest with tasks") from e

    def get_user_quest_progress(self, user_id: str, quest_id: str) -> Dict[str, Any]:
        """
        Get user's progress on a specific quest.

        Args:
            user_id: User ID
            quest_id: Quest ID

        Returns:
            Dictionary with quest, tasks, and completion status

        Raises:
            NotFoundError: If quest doesn't exist
            DatabaseError: If query fails
        """
        try:
            # Get quest with tasks
            quest = self.get_quest_with_tasks(quest_id)

            # Get user's task completions
            completions_response = (
                self.client.table('quest_task_completions')
                .select('*')
                .eq('user_id', user_id)
                .eq('quest_id', quest_id)
                .execute()
            )

            completions = completions_response.data or []
            completed_task_ids = {c['task_id'] for c in completions}

            # Add completion status to each task
            for task in quest.get('quest_tasks', []):
                task['completed'] = task['id'] in completed_task_ids

            # Calculate overall progress
            total_tasks = len(quest.get('quest_tasks', []))
            completed_tasks = len(completed_task_ids)

            quest['progress'] = {
                'total_tasks': total_tasks,
                'completed_tasks': completed_tasks,
                'percentage': (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0,
                'is_complete': completed_tasks == total_tasks and total_tasks > 0
            }

            return quest

        except NotFoundError:
            raise
        except APIError as e:
            logger.error(f"Error fetching user quest progress: {e}")
            raise DatabaseError("Failed to fetch quest progress") from e

    def get_user_active_quests(
        self,
        user_id: str,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Get all active quests for a user.

        Args:
            user_id: User ID
            limit: Maximum number of quests

        Returns:
            List of quest records with enrollment status

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table('user_quests')
                .select('quest_id, quests(*)')
                .eq('user_id', user_id)
                .eq('is_active', True)
                .limit(limit)
                .execute()
            )

            # Extract quest data from joined result
            quests = []
            for enrollment in response.data or []:
                if enrollment.get('quests'):
                    quests.append(enrollment['quests'])

            return quests

        except APIError as e:
            logger.error(f"Error fetching user active quests: {e}")
            raise DatabaseError("Failed to fetch user quests") from e

    def enroll_user(self, user_id: str, quest_id: str) -> Dict[str, Any]:
        """
        Enroll a user in a quest.

        IMPORTANT: Uses admin client to bypass RLS since enrollment is a user-initiated
        action that should always be allowed for active quests. The user_id is explicitly
        set in the insert, ensuring data integrity.

        Args:
            user_id: User ID
            quest_id: Quest ID

        Returns:
            Enrollment record (user_quests)

        Raises:
            DatabaseError: If enrollment fails
        """
        try:
            # Use admin client for enrollment operations to bypass RLS
            # Enrollment is a user-initiated action that should always succeed for valid users/quests
            from database import get_supabase_admin_client
            admin_client = get_supabase_admin_client()

            # Check if already enrolled
            existing = (
                admin_client.table('user_quests')
                .select('*')
                .eq('user_id', user_id)
                .eq('quest_id', quest_id)
                .execute()
            )

            if existing.data:
                # Already enrolled, update to active if needed
                # IMPORTANT: Always update last_picked_up_at when reactivating (for restart detection)
                from datetime import datetime, timezone
                if not existing.data[0].get('is_active'):
                    response = (
                        admin_client.table('user_quests')
                        .update({
                            'is_active': True,
                            'last_picked_up_at': datetime.now(timezone.utc).isoformat()
                        })
                        .eq('user_id', user_id)
                        .eq('quest_id', quest_id)
                        .execute()
                    )
                    if not response.data:
                        logger.error(f"Failed to reactivate enrollment for user {user_id}, quest {quest_id}")
                        raise DatabaseError("Failed to reactivate enrollment - no data returned")
                    logger.info(f"Reactivated enrollment for user {user_id[:8]} in quest {quest_id[:8]}")
                    return response.data[0]
                return existing.data[0]

            # Create new enrollment
            logger.info(f"Creating new enrollment for user {user_id[:8]} in quest {quest_id[:8]}")
            from datetime import datetime, timezone
            response = (
                admin_client.table('user_quests')
                .insert({
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'is_active': True,
                    'last_picked_up_at': datetime.now(timezone.utc).isoformat()
                })
                .execute()
            )

            if not response.data:
                logger.error(f"Insert returned no data for user {user_id}, quest {quest_id}. Response: {response}")
                raise DatabaseError("Failed to create enrollment - no data returned")

            logger.info(f"✓ Successfully enrolled user {user_id[:8]} in quest {quest_id[:8]}")
            return response.data[0]

        except APIError as e:
            logger.error(f"APIError enrolling user {user_id[:8]} in quest {quest_id[:8]}: {e}", exc_info=True)
            error_msg = str(e)
            raise DatabaseError(f"Failed to enroll in quest: {error_msg}") from e
        except Exception as e:
            logger.error(f"Unexpected error enrolling user {user_id[:8]} in quest {quest_id[:8]}: {e}", exc_info=True)
            raise DatabaseError(f"Failed to enroll in quest: {str(e)}") from e

    def abandon_quest(self, user_id: str, quest_id: str) -> bool:
        """
        Mark a quest as abandoned for a user.

        Args:
            user_id: User ID
            quest_id: Quest ID

        Returns:
            True if successful

        Raises:
            NotFoundError: If enrollment doesn't exist
            DatabaseError: If update fails
        """
        try:
            response = (
                self.client.table('user_quests')
                .update({'is_active': False})
                .eq('user_id', user_id)
                .eq('quest_id', quest_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError("Quest enrollment not found")

            logger.info(f"User {user_id} abandoned quest {quest_id}")
            return True

        except APIError as e:
            logger.error(f"Error abandoning quest: {e}")
            raise DatabaseError("Failed to abandon quest") from e

    def search_quests(
        self,
        search_term: str,
        pillar: Optional[str] = None,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Search quests by title or description.

        Args:
            search_term: Search term
            pillar: Filter by pillar (optional)
            limit: Maximum number of results

        Returns:
            List of matching quest records

        Raises:
            DatabaseError: If query fails
        """
        try:
            query = (
                self.client.table(self.table_name)
                .select('*')
                .eq('is_active', True)
                .or_(f'title.ilike.%{search_term}%,description.ilike.%{search_term}%')
                .limit(limit)
            )

            response = query.execute()
            return response.data or []

        except APIError as e:
            logger.error(f"Error searching quests: {e}")
            raise DatabaseError("Failed to search quests") from e

    def get_user_enrollments(
        self,
        user_id: str,
        is_active: Optional[bool] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all quest enrollments for a user.

        Args:
            user_id: User ID
            is_active: Filter by active status (optional)

        Returns:
            List of enrollment records from user_quests table

        Raises:
            DatabaseError: If query fails
        """
        try:
            query = (
                self.client.table('user_quests')
                .select('*')
                .eq('user_id', user_id)
            )

            if is_active is not None:
                query = query.eq('is_active', is_active)

            response = query.execute()
            return response.data or []

        except APIError as e:
            logger.error(f"Error fetching user enrollments for {user_id}: {e}")
            raise DatabaseError("Failed to fetch user enrollments") from e

    def get_user_enrollment(
        self,
        user_id: str,
        quest_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get a specific user's enrollment in a quest.

        Args:
            user_id: User ID
            quest_id: Quest ID

        Returns:
            Enrollment record or None if not enrolled

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table('user_quests')
                .select('*')
                .eq('user_id', user_id)
                .eq('quest_id', quest_id)
                .execute()
            )

            if not response.data:
                return None

            return response.data[0]

        except APIError as e:
            logger.error(f"Error fetching enrollment for user {user_id}, quest {quest_id}: {e}")
            raise DatabaseError("Failed to fetch enrollment") from e

    def complete_quest(
        self,
        user_id: str,
        quest_id: str
    ) -> Dict[str, Any]:
        """
        Mark a quest as completed for a user.

        Args:
            user_id: User ID
            quest_id: Quest ID

        Returns:
            Updated enrollment record

        Raises:
            NotFoundError: If enrollment doesn't exist
            DatabaseError: If update fails
        """
        try:
            response = (
                self.client.table('user_quests')
                .update({'completed_at': 'now()'})
                .eq('user_id', user_id)
                .eq('quest_id', quest_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError("Quest enrollment not found")

            logger.info(f"User {user_id} completed quest {quest_id}")
            return response.data[0]

        except APIError as e:
            logger.error(f"Error completing quest: {e}")
            raise DatabaseError("Failed to complete quest") from e

    def get_completed_quests(
        self,
        user_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get all completed quests for a user with quest details.

        Args:
            user_id: User ID
            limit: Maximum number of quests

        Returns:
            List of quest records with completion data

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table('user_quests')
                .select('quest_id, completed_at, quests(*)')
                .eq('user_id', user_id)
                .not_.is_('completed_at', 'null')
                .order('completed_at', desc=True)
                .limit(limit)
                .execute()
            )

            # Extract quest data with completion timestamp
            quests = []
            for enrollment in response.data or []:
                if enrollment.get('quests'):
                    quest = enrollment['quests']
                    quest['completed_at'] = enrollment['completed_at']
                    quests.append(quest)

            return quests

        except APIError as e:
            logger.error(f"Error fetching completed quests for user {user_id}: {e}")
            raise DatabaseError("Failed to fetch completed quests") from e

    def get_quests_for_user(
        self,
        user_id: str,
        filters: Optional[Dict[str, Any]] = None,
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        """
        Get quests visible to a user based on their organization's policy.
        This method handles all organization-aware filtering.

        Args:
            user_id: User ID
            filters: Optional filters (pillar, quest_type, search)
            page: Page number (1-indexed)
            limit: Items per page

        Returns:
            Dictionary with quests, total count, page, and limit

        Raises:
            DatabaseError: If query fails
        """
        try:
            from database import get_supabase_admin_client

            # Get user's organization and policy
            admin = get_supabase_admin_client()

            # First get user data
            # IMPORTANT: For dependent users, the Supabase client query was causing stack depth errors
            # due to recursive foreign key resolution on managed_by_parent_id. Use RPC instead.
            try:
                user_response = admin.rpc('get_user_organization', {'p_user_id': user_id}).execute()
                if not user_response.data or len(user_response.data) == 0:
                    raise DatabaseError(f"User {user_id} not found")
                org_id = user_response.data[0].get('organization_id') if isinstance(user_response.data, list) else user_response.data.get('organization_id')
            except Exception as e:
                # Fallback to direct query if RPC doesn't exist (will create it later)
                logger.warning(f"RPC get_user_organization not found, using direct query: {e}")
                user_response = admin.table('users')\
                    .select('organization_id')\
                    .eq('id', user_id)\
                    .single()\
                    .execute()

                if not user_response.data:
                    raise DatabaseError(f"User {user_id} not found")

                org_id = user_response.data.get('organization_id')

            # If user has no organization, default to 'all_optio' policy (global quests only)
            if not org_id:
                policy = 'all_optio'
            else:
                # Get organization policy separately
                org_response = admin.table('organizations')\
                    .select('quest_visibility_policy')\
                    .eq('id', org_id)\
                    .single()\
                    .execute()

                if not org_response.data:
                    # Organization not found, fallback to 'all_optio'
                    policy = 'all_optio'
                    org_id = None
                else:
                    policy = org_response.data.get('quest_visibility_policy', 'all_optio')

            # Apply search filter early to reduce result set BEFORE complex org filtering
            # This prevents stack depth errors by simplifying the query plan
            filters = filters or {}
            search_term = filters.get('search')

            # Base query: only active quests
            # Use admin client to bypass RLS and apply our own visibility logic
            # NOTE: is_public filter is applied per-category below, not globally
            # Organization quests should be visible to org members even if not "public"
            query = admin.table('quests').select('*', count='exact').eq('is_active', True)

            # Apply search FIRST (before org filtering) to reduce result set
            # Search in title and big_idea
            if search_term:
                query = query.or_(f"title.ilike.%{search_term}%,big_idea.ilike.%{search_term}%")

            # Apply organization visibility policy
            # Note: Since we applied search first, the org filtering now operates on a smaller set
            # is_public only applies to global Optio quests (organization_id IS NULL)
            # Organization quests are visible to org members regardless of is_public
            # User's own created quests are always visible to them
            if policy == 'all_optio':
                if org_id:
                    # Global PUBLIC quests (NULL org_id + is_public) + organization quests (any is_public) + user's own created quests
                    query = query.or_(
                        f'and(organization_id.is.null,is_public.eq.true),'
                        f'organization_id.eq.{org_id},'
                        f'created_by.eq.{user_id}'
                    )
                else:
                    # No organization - global PUBLIC quests + user's own created quests
                    query = query.or_(f'and(organization_id.is.null,is_public.eq.true),created_by.eq.{user_id}')

            elif policy == 'curated':
                if not org_id:
                    # No organization - fallback to global PUBLIC quests only
                    query = query.is_('organization_id', 'null').eq('is_public', True)
                else:
                    # Get curated quest IDs
                    curated = admin.table('organization_quest_access')\
                        .select('quest_id')\
                        .eq('organization_id', org_id)\
                        .execute()

                    quest_ids = [q['quest_id'] for q in curated.data] if curated.data else []

                    if quest_ids:
                        # Curated quests + organization quests + user's own created quests
                        quest_ids_str = ','.join(quest_ids)
                        query = query.or_(
                            f'id.in.({quest_ids_str}),'
                            f'organization_id.eq.{org_id},'
                            f'created_by.eq.{user_id}'
                        )
                    else:
                        # No curated quests, only org quests + user's created quests
                        query = query.or_(
                            f'organization_id.eq.{org_id},'
                            f'created_by.eq.{user_id}'
                        )

            elif policy == 'private_only':
                if not org_id:
                    # No organization - only user's own created quests
                    query = query.eq('created_by', user_id)
                else:
                    # Only organization quests + user's own created quests
                    query = query.or_(
                        f'organization_id.eq.{org_id},'
                        f'created_by.eq.{user_id}'
                    )

            # Apply additional non-search filters
            if filters.get('pillar'):
                query = query.eq('pillar_primary', filters['pillar'])
            if filters.get('quest_type'):
                query = query.eq('quest_type', filters['quest_type'])
            if filters.get('topic'):
                logger.info(f"[TOPIC FILTER] Filtering by topic_primary: {filters['topic']}")
                query = query.eq('topic_primary', filters['topic'])
            if filters.get('subtopic'):
                logger.info(f"[SUBTOPIC FILTER] Filtering by topics containing: {filters['subtopic']}")
                query = query.contains('topics', [filters['subtopic']])

            # Pagination for infinite scroll
            offset = (page - 1) * limit
            query = query.range(offset, offset + limit - 1)

            # Execute query
            response = query.execute()

            return {
                'quests': response.data if response.data else [],
                'total': response.count if response.count else 0,
                'page': page,
                'limit': limit
            }

        except APIError as e:
            logger.error(f"Error fetching quests for user {user_id}: {e}")
            raise DatabaseError("Failed to fetch quests for user") from e

    def search_similar_quests(
        self,
        user_id: str,
        search_term: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Search for similar quests based on title, respecting organization visibility policies.
        Optimized for autocomplete - returns minimal data quickly.

        Args:
            user_id: User ID (to determine organization and visibility)
            search_term: Search term (quest title as user types)
            limit: Maximum number of results (default 10)

        Returns:
            List of matching quest records with minimal fields

        Raises:
            DatabaseError: If query fails
        """
        try:
            from database import get_supabase_admin_client
            admin = get_supabase_admin_client()

            # Get user's organization
            try:
                user_response = admin.rpc('get_user_organization', {'p_user_id': user_id}).execute()
                if not user_response.data or len(user_response.data) == 0:
                    raise DatabaseError(f"User {user_id} not found")
                org_id = user_response.data[0].get('organization_id') if isinstance(user_response.data, list) else user_response.data.get('organization_id')
            except Exception as e:
                # Fallback to direct query if RPC doesn't exist
                logger.warning(f"RPC get_user_organization not found, using direct query: {e}")
                user_response = admin.table('users')\
                    .select('organization_id')\
                    .eq('id', user_id)\
                    .single()\
                    .execute()

                if not user_response.data:
                    raise DatabaseError(f"User {user_id} not found")

                org_id = user_response.data.get('organization_id')

            # Determine visibility policy
            if not org_id:
                policy = 'all_optio'
            else:
                org_response = admin.table('organizations')\
                    .select('quest_visibility_policy')\
                    .eq('id', org_id)\
                    .single()\
                    .execute()

                policy = org_response.data.get('quest_visibility_policy', 'all_optio') if org_response.data else 'all_optio'

            # Build optimized query - only select needed fields for autocomplete
            query = admin.table('quests')\
                .select('id, title, big_idea, image_url, quest_type, is_public')\
                .eq('is_active', True)\
                .ilike('title', f'%{search_term}%')

            # Apply organization visibility policy
            if policy == 'all_optio':
                if org_id:
                    query = query.or_(f'organization_id.is.null,organization_id.eq.{org_id}')
                else:
                    query = query.is_('organization_id', 'null')

            elif policy == 'curated':
                if not org_id:
                    query = query.is_('organization_id', 'null')
                else:
                    curated = admin.table('organization_quest_access')\
                        .select('quest_id')\
                        .eq('organization_id', org_id)\
                        .execute()

                    quest_ids = [q['quest_id'] for q in curated.data] if curated.data else []

                    if quest_ids:
                        quest_ids_str = ','.join(quest_ids)
                        query = query.or_(
                            f'id.in.({quest_ids_str}),'
                            f'organization_id.eq.{org_id},'
                            f'created_by.eq.{user_id}'
                        )
                    else:
                        query = query.or_(
                            f'organization_id.eq.{org_id},'
                            f'created_by.eq.{user_id}'
                        )

            elif policy == 'private_only':
                if not org_id:
                    query = query.eq('created_by', user_id)
                else:
                    query = query.or_(
                        f'organization_id.eq.{org_id},'
                        f'created_by.eq.{user_id}'
                    )

            # Limit results and order by title
            query = query.limit(limit).order('title')

            response = query.execute()
            return response.data or []

        except APIError as e:
            logger.error(f"Error searching similar quests: {e}")
            raise DatabaseError("Failed to search similar quests") from e


    # ========================================================================
    # ADMIN QUEST MANAGEMENT METHODS
    # ========================================================================

    def create_quest(
        self,
        data: Dict[str, Any],
        user_id: str
    ) -> Dict[str, Any]:
        """
        Create a new quest.

        Args:
            data: Quest data (title, big_idea, etc.)
            user_id: Creator user ID

        Returns:
            Created quest record
        """
        from datetime import datetime
        from database import get_supabase_admin_client

        admin = get_supabase_admin_client()

        try:
            quest_data = {
                'title': data['title'].strip(),
                'big_idea': data.get('big_idea', '').strip() or data.get('description', '').strip(),
                'description': data.get('big_idea', '').strip() or data.get('description', '').strip(),
                'is_v3': True,
                'is_active': data.get('is_active', False),
                'is_public': data.get('is_public', False),
                'quest_type': data.get('quest_type', 'optio'),
                'header_image_url': data.get('header_image_url'),
                'image_url': data.get('image_url'),
                'material_link': data.get('material_link', '').strip() if data.get('material_link') else None,
                'created_by': user_id,
                'created_at': datetime.utcnow().isoformat(),
                'organization_id': data.get('organization_id')
            }

            result = admin.table('quests').insert(quest_data).execute()

            if not result.data:
                raise DatabaseError("Failed to create quest")

            logger.info(f"Created quest {result.data[0]['id']}: {quest_data['title']}")
            return result.data[0]

        except APIError as e:
            logger.error(f"Error creating quest: {e}")
            raise DatabaseError("Failed to create quest") from e

    def update_quest(
        self,
        quest_id: str,
        data: Dict[str, Any],
        user_id: str
    ) -> Dict[str, Any]:
        """
        Update an existing quest.

        Args:
            quest_id: Quest ID
            data: Fields to update
            user_id: User performing the update

        Returns:
            Updated quest record
        """
        from datetime import datetime
        from database import get_supabase_admin_client

        admin = get_supabase_admin_client()

        try:
            update_data = {}

            if 'title' in data:
                update_data['title'] = data['title'].strip()
            if 'big_idea' in data or 'description' in data:
                desc = data.get('big_idea', '').strip() or data.get('description', '').strip()
                update_data['big_idea'] = desc
                update_data['description'] = desc
            if 'header_image_url' in data:
                update_data['header_image_url'] = data['header_image_url']
            if 'material_link' in data:
                update_data['material_link'] = data['material_link'].strip() if data['material_link'] else None
            if 'is_active' in data:
                update_data['is_active'] = data['is_active']
            if 'is_public' in data:
                update_data['is_public'] = data['is_public']

            if update_data:
                update_data['updated_at'] = datetime.utcnow().isoformat()
                result = admin.table('quests').update(update_data).eq('id', quest_id).execute()

                if not result.data:
                    raise NotFoundError(f"Quest {quest_id} not found")

                return result.data[0]

            return self.find_by_id(quest_id)

        except APIError as e:
            logger.error(f"Error updating quest {quest_id}: {e}")
            raise DatabaseError("Failed to update quest") from e

    def delete_quest_cascade(self, quest_id: str, user_id: str) -> bool:
        """
        Delete a quest and all associated data.

        Args:
            quest_id: Quest ID
            user_id: User performing the deletion

        Returns:
            True if deleted successfully
        """
        from database import get_supabase_admin_client

        admin = get_supabase_admin_client()

        try:
            # Delete in order to respect FK constraints
            admin.table('quest_task_completions').delete().eq('quest_id', quest_id).execute()
            admin.table('user_task_evidence_documents').delete().eq('quest_id', quest_id).execute()
            admin.table('user_quest_tasks').delete().eq('quest_id', quest_id).execute()
            admin.table('user_quests').delete().eq('quest_id', quest_id).execute()
            admin.table('quests').delete().eq('id', quest_id).execute()

            logger.info(f"Deleted quest {quest_id} by user {user_id}")
            return True

        except APIError as e:
            logger.error(f"Error deleting quest {quest_id}: {e}")
            raise DatabaseError("Failed to delete quest") from e

    def bulk_delete_quests(
        self,
        quest_ids: List[str],
        user_id: str
    ) -> Dict[str, Any]:
        """
        Delete multiple quests.

        Args:
            quest_ids: List of quest IDs
            user_id: User performing the deletion

        Returns:
            Dict with deleted count, failed list
        """
        deleted_count = 0
        failed = []

        for quest_id in quest_ids:
            try:
                self.delete_quest_cascade(quest_id, user_id)
                deleted_count += 1
            except Exception as e:
                logger.error(f"Error deleting quest {quest_id}: {e}")
                failed.append({'id': quest_id, 'error': str(e)})

        return {
            'deleted_count': deleted_count,
            'failed': failed
        }

    def bulk_update_quests(
        self,
        quest_ids: List[str],
        updates: Dict[str, Any],
        user_id: str
    ) -> Dict[str, Any]:
        """
        Update multiple quests.

        Args:
            quest_ids: List of quest IDs
            updates: Fields to update (is_active, is_public)
            user_id: User performing the update

        Returns:
            Dict with updated count, failed list
        """
        from datetime import datetime
        from database import get_supabase_admin_client

        admin = get_supabase_admin_client()

        allowed_fields = {'is_active', 'is_public'}
        update_data = {k: v for k, v in updates.items() if k in allowed_fields}

        if not update_data:
            return {'updated_count': 0, 'failed': []}

        update_data['updated_at'] = datetime.utcnow().isoformat()

        updated_count = 0
        failed = []

        for quest_id in quest_ids:
            try:
                result = admin.table('quests').update(update_data).eq('id', quest_id).execute()
                if result.data:
                    updated_count += 1
                else:
                    failed.append({'id': quest_id, 'error': 'Quest not found'})
            except Exception as e:
                logger.error(f"Error updating quest {quest_id}: {e}")
                failed.append({'id': quest_id, 'error': str(e)})

        return {
            'updated_count': updated_count,
            'failed': failed
        }

    def get_admin_quests(
        self,
        user_id: str,
        user_role: str,
        filters: Optional[Dict[str, Any]] = None,
        page: int = 1,
        per_page: int = 1000
    ) -> Dict[str, Any]:
        """
        Get quests for admin/advisor management.

        Args:
            user_id: User ID
            user_role: User's role
            filters: Optional filters (quest_type, is_active, is_public)
            page: Page number
            per_page: Items per page

        Returns:
            Dict with quests list, total, pagination info
        """
        from database import get_supabase_admin_client

        admin = get_supabase_admin_client()

        try:
            offset = (page - 1) * per_page
            filters = filters or {}

            query = admin.table('quests').select(
                '*, creator:created_by(id, display_name, first_name, last_name, email)',
                count='exact'
            )

            # Advisors see only their own quests
            if user_role == 'advisor':
                query = query.eq('created_by', user_id)

            # Apply filters
            if filters.get('quest_type'):
                query = query.eq('quest_type', filters['quest_type'])
            if filters.get('is_active') is not None:
                query = query.eq('is_active', filters['is_active'])
            if filters.get('is_public') is not None:
                query = query.eq('is_public', filters['is_public'])

            query = query.order('created_at', desc=True).range(offset, offset + per_page - 1)

            result = query.execute()
            quests = result.data or []

            # Get course connections
            quest_ids = [q['id'] for q in quests]
            course_connections = {}
            if quest_ids:
                course_links = admin.table('course_quests')\
                    .select('quest_id, course_id, courses(id, title)')\
                    .in_('quest_id', quest_ids)\
                    .execute()
                for link in (course_links.data or []):
                    quest_id = link.get('quest_id')
                    if quest_id not in course_connections:
                        course_connections[quest_id] = []
                    course_data = link.get('courses')
                    if course_data:
                        course_connections[quest_id].append({
                            'course_id': course_data.get('id'),
                            'course_title': course_data.get('title')
                        })

            # Process quests
            for quest in quests:
                creator = quest.get('creator')
                if creator:
                    quest['creator_name'] = creator.get('display_name') or \
                        f"{creator.get('first_name', '')} {creator.get('last_name', '')}".strip() or \
                        creator.get('email', 'Unknown User')
                else:
                    quest['creator_name'] = None

                quest['connected_courses'] = course_connections.get(quest['id'], [])
                quest['is_project'] = len(quest['connected_courses']) > 0

            return {
                'quests': quests,
                'total': result.count or 0,
                'page': page,
                'per_page': per_page,
                'total_pages': ((result.count or 0) + per_page - 1) // per_page
            }

        except APIError as e:
            logger.error(f"Error getting admin quests: {e}")
            raise DatabaseError("Failed to fetch admin quests") from e

    def can_user_edit_quest(
        self,
        user_id: str,
        quest_id: str
    ) -> Dict[str, bool]:
        """
        Check if user can edit a quest.

        Args:
            user_id: User ID
            quest_id: Quest ID

        Returns:
            Dict with can_edit and can_toggle_active flags
        """
        from database import get_supabase_admin_client

        admin = get_supabase_admin_client()

        try:
            quest = admin.table('quests').select('*').eq('id', quest_id).single().execute()
            if not quest.data:
                return {'can_edit': False, 'can_toggle_active': False}

            user = admin.table('users').select('role, organization_id, org_role').eq('id', user_id).execute()
            user_data = user.data[0] if user.data else {}
            user_role = user_data.get('role', 'advisor')
            user_org_id = user_data.get('organization_id')
            user_org_role = user_data.get('org_role')

            is_superadmin = user_role == 'superadmin'
            is_org_admin = user_role == 'org_managed' and user_org_role == 'org_admin'
            quest_org_id = quest.data.get('organization_id')

            can_edit = False
            can_toggle_active = False

            if is_superadmin:
                can_edit = True
                can_toggle_active = True
            elif is_org_admin and quest_org_id and quest_org_id == user_org_id:
                can_edit = True
                can_toggle_active = True
            elif user_role == 'advisor' or (user_role == 'org_managed' and user_org_role == 'advisor'):
                if quest.data.get('created_by') == user_id and not quest.data.get('is_active'):
                    can_edit = True

            return {'can_edit': can_edit, 'can_toggle_active': can_toggle_active}

        except Exception as e:
            logger.error(f"Error checking quest edit permissions: {e}")
            return {'can_edit': False, 'can_toggle_active': False}


class QuestTaskRepository(BaseRepository):
    """Repository for quest task database operations"""

    table_name = 'quest_tasks'
    id_column = 'id'

    def get_tasks_for_quest(self, quest_id: str) -> List[Dict[str, Any]]:
        """
        Get all tasks for a quest, ordered by order_index.

        Args:
            quest_id: Quest ID

        Returns:
            List of task records

        Raises:
            DatabaseError: If query fails
        """
        return self.find_all(
            filters={'quest_id': quest_id},
            order_by='order_index'
        )

    def complete_task(
        self,
        user_id: str,
        quest_id: str,
        task_id: str,
        evidence_text: Optional[str] = None,
        evidence_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Mark a task as completed for a user.

        Args:
            user_id: User ID
            quest_id: Quest ID
            task_id: Task ID
            evidence_text: Text evidence (optional)
            evidence_url: URL evidence (optional)

        Returns:
            Completion record

        Raises:
            DatabaseError: If completion fails
        """
        try:
            # Get task details to calculate XP
            task = self.find_by_id(task_id)
            if not task:
                raise NotFoundError(f"Task {task_id} not found")

            xp_awarded = task.get('xp_value', 0)

            # Create completion record
            response = (
                self.client.table('quest_task_completions')
                .insert({
                    'user_id': user_id,
                    'quest_id': quest_id,
                    'task_id': task_id,
                    'evidence_text': evidence_text,
                    'evidence_url': evidence_url,
                    'xp_awarded': xp_awarded
                })
                .execute()
            )

            logger.info(f"User {user_id} completed task {task_id} (Quest {quest_id}), awarded {xp_awarded} XP")
            return response.data[0]

        except APIError as e:
            logger.error(f"Error completing task: {e}")
            raise DatabaseError("Failed to complete task") from e
