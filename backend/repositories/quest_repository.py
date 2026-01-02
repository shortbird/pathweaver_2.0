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

            # Base query: only active and public quests
            # Use admin client to bypass RLS and apply our own visibility logic
            query = admin.table('quests').select('*', count='exact').eq('is_active', True).eq('is_public', True)

            # Apply search FIRST (before org filtering) to reduce result set
            # Search in title and big_idea
            if search_term:
                query = query.or_(f"title.ilike.%{search_term}%,big_idea.ilike.%{search_term}%")

            # Apply organization visibility policy
            # Note: Since we applied search first, the org filtering now operates on a smaller set
            if policy == 'all_optio':
                if org_id:
                    # Global quests (NULL org_id) + organization quests
                    query = query.or_(f'organization_id.is.null,organization_id.eq.{org_id}')
                else:
                    # No organization - only global quests
                    query = query.is_('organization_id', 'null')

            elif policy == 'curated':
                if not org_id:
                    # No organization - fallback to global quests only
                    query = query.is_('organization_id', 'null')
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
