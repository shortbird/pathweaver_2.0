"""
User Repository - Database operations for users table

Handles all user-related database queries with RLS enforcement.
"""

import logging
from typing import Optional, Dict, List, Any
from repositories.base_repository import BaseRepository, DatabaseError, NotFoundError
from postgrest.exceptions import APIError

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)


class UserRepository(BaseRepository):
    """Repository for user database operations"""

    table_name = 'users'
    id_column = 'id'

    def find_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """
        Find a user by email address.

        Args:
            email: Email address to search for

        Returns:
            User record or None if not found

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select('*')
                .eq('email', email)
                .execute()
            )

            if not response.data:
                return None

            return response.data[0]

        except APIError as e:
            logger.error(f"Error finding user by email {email}: {e}")
            raise DatabaseError("Failed to fetch user by email") from e

    def find_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        """
        Find a user by portfolio slug.

        Args:
            slug: Portfolio slug to search for

        Returns:
            User record or None if not found

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select('*')
                .eq('portfolio_slug', slug)
                .execute()
            )

            if not response.data:
                return None

            return response.data[0]

        except APIError as e:
            logger.error(f"Error finding user by slug {slug}: {e}")
            raise DatabaseError("Failed to fetch user by slug") from e

    def get_profile(self, user_id: str) -> Dict[str, Any]:
        """
        Get user profile with all details.

        Args:
            user_id: User ID

        Returns:
            User profile with all fields

        Raises:
            NotFoundError: If user doesn't exist
            DatabaseError: If query fails
        """
        user = self.find_by_id(user_id)
        if not user:
            raise NotFoundError(f"User {user_id} not found")
        return user

    def update_profile(
        self,
        user_id: str,
        display_name: Optional[str] = None,
        bio: Optional[str] = None,
        avatar_url: Optional[str] = None,
        portfolio_slug: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update user profile fields.

        Args:
            user_id: User ID
            display_name: New display name (optional)
            bio: New bio (optional)
            avatar_url: New avatar URL (optional)
            portfolio_slug: New portfolio slug (optional)

        Returns:
            Updated user record

        Raises:
            NotFoundError: If user doesn't exist
            DatabaseError: If update fails
        """
        data = {}
        if display_name is not None:
            data['display_name'] = display_name
        if bio is not None:
            data['bio'] = bio
        if avatar_url is not None:
            data['avatar_url'] = avatar_url
        if portfolio_slug is not None:
            data['portfolio_slug'] = portfolio_slug

        if not data:
            # Nothing to update
            return self.get_profile(user_id)

        return self.update(user_id, data)

    def update_xp(
        self,
        user_id: str,
        total_xp: int,
        level: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Update user XP and level.

        Args:
            user_id: User ID
            total_xp: New total XP
            level: New level (optional)

        Returns:
            Updated user record

        Raises:
            NotFoundError: If user doesn't exist
            DatabaseError: If update fails
        """
        data = {'total_xp': total_xp}
        if level is not None:
            data['level'] = level

        return self.update(user_id, data)

    def increment_achievements(self, user_id: str) -> Dict[str, Any]:
        """
        Increment user's achievement count.

        Args:
            user_id: User ID

        Returns:
            Updated user record

        Raises:
            NotFoundError: If user doesn't exist
            DatabaseError: If update fails
        """
        user = self.get_profile(user_id)
        current_count = user.get('achievements_count', 0)
        return self.update(user_id, {'achievements_count': current_count + 1})

    def update_streak(self, user_id: str, streak_days: int) -> Dict[str, Any]:
        """
        Update user's learning streak.

        Args:
            user_id: User ID
            streak_days: New streak count

        Returns:
            Updated user record

        Raises:
            NotFoundError: If user doesn't exist
            DatabaseError: If update fails
        """
        return self.update(user_id, {'streak_days': streak_days})

    def find_by_role(self, role: str, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Find all users with a specific role.

        Args:
            role: Role to filter by (student/parent/advisor/admin/observer)
            limit: Maximum number of users to return

        Returns:
            List of user records

        Raises:
            DatabaseError: If query fails
        """
        return self.find_all(filters={'role': role}, limit=limit)

    def search_by_display_name(
        self,
        search_term: str,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Search users by display name (case-insensitive).

        Args:
            search_term: Search term
            limit: Maximum number of results

        Returns:
            List of matching user records

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select('id, display_name, avatar_url, bio, portfolio_slug')
                .ilike('display_name', f'%{search_term}%')
                .limit(limit)
                .execute()
            )

            return response.data or []

        except APIError as e:
            logger.error(f"Error searching users by display name: {e}")
            raise DatabaseError("Failed to search users") from e

    def get_dashboard_stats(self, user_id: str) -> Dict[str, Any]:
        """
        Get user statistics for dashboard.

        Args:
            user_id: User ID

        Returns:
            Dictionary with stats (total_xp, level, achievements_count, streak_days)

        Raises:
            NotFoundError: If user doesn't exist
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select('total_xp, level, achievements_count, streak_days')
                .eq('id', user_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"User {user_id} not found")

            return response.data[0]

        except APIError as e:
            logger.error(f"Error fetching dashboard stats for user {user_id}: {e}")
            raise DatabaseError("Failed to fetch dashboard stats") from e

    def find_by_ids(
        self,
        user_ids: List[str],
        select_fields: str = '*'
    ) -> Dict[str, Dict[str, Any]]:
        """
        Fetch multiple users by IDs in a single query (prevents N+1 queries).

        Args:
            user_ids: List of user IDs to fetch
            select_fields: Comma-separated fields to select (default: '*')

        Returns:
            Dictionary mapping user_id -> user record

        Raises:
            DatabaseError: If query fails
        """
        if not user_ids:
            return {}

        try:
            response = (
                self.client.table(self.table_name)
                .select(select_fields)
                .in_('id', user_ids)
                .execute()
            )

            # Convert list to dictionary for easy lookup
            users_dict = {user['id']: user for user in (response.data or [])}
            return users_dict

        except APIError as e:
            logger.error(f"Error fetching users by IDs: {e}")
            raise DatabaseError("Failed to fetch users by IDs") from e

    def get_basic_profiles(
        self,
        user_ids: List[str]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Fetch basic profile info for multiple users (optimized for connections/friends lists).

        Args:
            user_ids: List of user IDs to fetch

        Returns:
            Dictionary mapping user_id -> basic profile (id, first_name, last_name, display_name, avatar_url, bio, role)

        Raises:
            DatabaseError: If query fails
        """
        return self.find_by_ids(
            user_ids,
            select_fields='id, first_name, last_name, display_name, avatar_url, bio, portfolio_slug, role'
        )

    def update_last_active(self, user_id: str) -> bool:
        """
        Update user's last active timestamp.

        Args:
            user_id: User ID

        Returns:
            True if successful

        Raises:
            DatabaseError: If update fails
        """
        try:
            self.update(user_id, {'last_active': 'now()'})
            return True

        except NotFoundError:
            logger.warning(f"User {user_id} not found when updating last_active")
            return False
        except DatabaseError:
            raise

    # ========================================================================
    # ADMIN USER MANAGEMENT METHODS
    # ========================================================================

    def get_users_paginated(
        self,
        filters: Optional[Dict[str, Any]] = None,
        page: int = 1,
        per_page: int = 20,
        sort_by: str = 'created_at',
        sort_order: str = 'desc',
        assigned_student_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Get paginated list of users with filtering for admin dashboard.

        Args:
            filters: Dict with keys: role, organization, activity, search
            page: Page number (1-indexed)
            per_page: Results per page (max 100)
            sort_by: Column to sort by
            sort_order: 'asc' or 'desc'
            assigned_student_ids: If provided, only return these student IDs (for advisors)

        Returns:
            Dict with users list, total count, pagination info
        """
        from datetime import datetime, timedelta

        try:
            per_page = min(per_page, 100)
            offset = (page - 1) * per_page

            query = self.client.table(self.table_name).select('*', count='exact')

            # Advisor filtering - only see assigned students
            if assigned_student_ids is not None:
                if len(assigned_student_ids) == 0:
                    return {
                        'users': [],
                        'total': 0,
                        'page': page,
                        'per_page': per_page,
                        'total_pages': 0
                    }
                query = query.in_('id', assigned_student_ids)
                query = query.eq('role', 'student')

            if filters:
                # Role filter
                if filters.get('role') and filters['role'] != 'all' and assigned_student_ids is None:
                    if filters['role'] == 'org_admin':
                        query = query.eq('is_org_admin', True)
                    else:
                        query = query.eq('role', filters['role'])

                # Organization filter
                if filters.get('organization') and filters['organization'] != 'all':
                    if filters['organization'] == 'none':
                        query = query.is_('organization_id', 'null')
                    else:
                        query = query.eq('organization_id', filters['organization'])

                # Activity filter
                if filters.get('activity'):
                    cutoff_date = (datetime.utcnow() - timedelta(days=30)).isoformat()
                    if filters['activity'] == 'active':
                        query = query.gte('last_login_at', cutoff_date)
                    elif filters['activity'] == 'inactive':
                        query = query.or_(f'last_login_at.lt.{cutoff_date},last_login_at.is.null')

                # Search filter
                if filters.get('search'):
                    search_term = filters['search']
                    search_query = f'first_name.ilike.%{search_term}%,last_name.ilike.%{search_term}%,email.ilike.%{search_term}%'
                    query = query.or_(search_query)

            # Sorting
            ascending = sort_order == 'asc'
            query = query.order(sort_by, desc=not ascending)

            # Pagination
            query = query.range(offset, offset + per_page - 1)

            result = query.execute()
            users = result.data or []

            # Enrich with organization names
            if users:
                org_ids = list(set(u.get('organization_id') for u in users if u.get('organization_id')))
                if org_ids:
                    orgs_response = self.client.table('organizations')\
                        .select('id, name')\
                        .in_('id', org_ids)\
                        .execute()
                    if orgs_response.data:
                        org_names = {o['id']: o['name'] for o in orgs_response.data}
                        for user in users:
                            user['organization_name'] = org_names.get(user.get('organization_id'))

            return {
                'users': users,
                'total': result.count or 0,
                'page': page,
                'per_page': per_page,
                'total_pages': ((result.count or 0) + per_page - 1) // per_page if result.count else 0
            }

        except APIError as e:
            logger.error(f"Error getting paginated users: {e}")
            raise DatabaseError("Failed to fetch users") from e

    def get_user_with_stats(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get user details with quest stats for admin view.

        Args:
            user_id: User ID

        Returns:
            User record with stats dict
        """
        try:
            # Get user
            user = self.find_by_id(user_id)
            if not user:
                return None

            # Get quest stats
            completions = self.client.table('user_quests')\
                .select('*', count='exact')\
                .eq('user_id', user_id)\
                .not_.is_('completed_at', 'null')\
                .execute()

            active = self.client.table('user_quests')\
                .select('*', count='exact')\
                .eq('user_id', user_id)\
                .eq('is_active', True)\
                .execute()

            xp_data = self.client.table('user_skill_xp')\
                .select('xp_amount')\
                .eq('user_id', user_id)\
                .execute()

            stats = {
                'completed_quests': completions.count or 0,
                'active_quests': active.count or 0,
                'total_xp': sum(r['xp_amount'] for r in xp_data.data) if xp_data.data else 0
            }

            user['stats'] = stats
            return user

        except APIError as e:
            logger.error(f"Error getting user with stats {user_id}: {e}")
            raise DatabaseError("Failed to fetch user with stats") from e

    def get_user_with_organization(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get user with organization details.

        Args:
            user_id: User ID

        Returns:
            User record with organization info
        """
        try:
            user = self.find_by_id(user_id)
            if not user:
                return None

            if user.get('organization_id'):
                org_response = self.client.table('organizations')\
                    .select('id, name, slug')\
                    .eq('id', user['organization_id'])\
                    .maybe_single()\
                    .execute()
                if org_response.data:
                    user['organization'] = org_response.data
                    user['organization_name'] = org_response.data['name']

            return user

        except APIError as e:
            logger.error(f"Error getting user with organization {user_id}: {e}")
            raise DatabaseError("Failed to fetch user with organization") from e

    def update_user_role(
        self,
        user_id: str,
        new_role: str,
        org_role: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update user's platform role.

        Args:
            user_id: User ID
            new_role: New platform role
            org_role: Optional org_role when setting to org_managed

        Returns:
            Updated user record
        """
        try:
            update_data = {'role': new_role}

            if new_role == 'org_managed':
                # Verify user has an organization
                user = self.find_by_id(user_id)
                if not user or not user.get('organization_id'):
                    raise DatabaseError("Cannot set role to org_managed for user without an organization")
                if not user.get('org_role') and org_role:
                    update_data['org_role'] = org_role
                elif not user.get('org_role'):
                    update_data['org_role'] = 'student'

            return self.update(user_id, update_data)

        except APIError as e:
            logger.error(f"Error updating user role {user_id}: {e}")
            raise DatabaseError("Failed to update user role") from e

    def update_user_organization(
        self,
        user_id: str,
        organization_id: Optional[str],
        admin_id: str
    ) -> Dict[str, Any]:
        """
        Assign or remove user from organization.

        Args:
            user_id: User ID
            organization_id: Org ID or None to remove
            admin_id: Admin performing the action

        Returns:
            Updated user record
        """
        try:
            user = self.find_by_id(user_id)
            if not user:
                raise NotFoundError(f"User {user_id} not found")

            current_role = user.get('role', 'student')

            if organization_id is None:
                # Remove from organization
                org_role = user.get('org_role')
                if current_role == 'org_managed' and org_role:
                    restore_role = org_role
                else:
                    restore_role = current_role if current_role != 'org_managed' else 'student'

                update_data = {
                    'organization_id': None,
                    'role': restore_role,
                    'org_role': None
                }
            else:
                # Don't allow adding superadmin to organization
                if current_role == 'superadmin':
                    raise DatabaseError("Cannot add superadmin to organization")

                if current_role == 'org_managed':
                    update_data = {'organization_id': organization_id}
                else:
                    valid_org_roles = ['student', 'parent', 'advisor', 'observer']
                    org_role = current_role if current_role in valid_org_roles else 'student'
                    update_data = {
                        'organization_id': organization_id,
                        'role': 'org_managed',
                        'org_role': org_role
                    }

            result = self.update(user_id, update_data)
            logger.info(f"User {user_id} organization updated to {organization_id} by admin {admin_id}")
            return result

        except APIError as e:
            logger.error(f"Error updating user organization {user_id}: {e}")
            raise DatabaseError("Failed to update user organization") from e

    def cleanup_user_relations(self, user_id: str) -> List[str]:
        """
        Clean up all records related to a user before deletion.

        Args:
            user_id: User ID

        Returns:
            List of cleanup actions performed
        """
        cleanup_results = []

        tables_with_user_id = [
            'user_skill_xp',
            'diplomas',
            'user_quest_tasks',
            'quest_task_completions',
            'user_quests',
            'notifications',
            'course_enrollments',
            'curriculum_lesson_progress',
        ]

        for table in tables_with_user_id:
            try:
                result = self.client.table(table).delete().eq('user_id', user_id).execute()
                if result.data:
                    cleanup_results.append(f"{table}: {len(result.data)} deleted")
            except Exception as e:
                logger.debug(f"Cleanup {table}: {e}")

        # Special tables with different column names
        try:
            self.client.table('friendships').delete().eq('requester_id', user_id).execute()
            self.client.table('friendships').delete().eq('addressee_id', user_id).execute()
        except Exception as e:
            logger.debug(f"Cleanup friendships: {e}")

        try:
            self.client.table('observer_invitations').delete().eq('student_id', user_id).execute()
        except Exception as e:
            logger.debug(f"Cleanup observer_invitations: {e}")

        try:
            self.client.table('observer_student_links').delete().eq('student_id', user_id).execute()
            self.client.table('observer_student_links').delete().eq('observer_id', user_id).execute()
        except Exception as e:
            logger.debug(f"Cleanup observer_student_links: {e}")

        try:
            self.client.table('org_invitations').delete().eq('accepted_by', user_id).execute()
            self.client.table('org_invitations').update({'invited_by': None}).eq('invited_by', user_id).execute()
        except Exception as e:
            logger.debug(f"Cleanup org_invitations: {e}")

        try:
            self.client.table('quests').update({'created_by': None}).eq('created_by', user_id).execute()
        except Exception as e:
            logger.debug(f"Cleanup quests.created_by: {e}")

        return cleanup_results

    def delete_user_complete(self, user_id: str, admin_id: str) -> bool:
        """
        Delete a user and all related data.

        Args:
            user_id: User ID to delete
            admin_id: Admin performing the deletion

        Returns:
            True if deleted successfully
        """
        try:
            # Clean up related records
            cleanup_results = self.cleanup_user_relations(user_id)
            logger.info(f"Cleaned up related records for user {user_id}: {cleanup_results}")

            # Delete from public.users
            self.delete(user_id)
            logger.info(f"Deleted user {user_id} from public.users")

            # Delete from auth.users
            try:
                self.client.auth.admin.delete_user(user_id)
                logger.info(f"Deleted user {user_id} from auth.users")
            except Exception as auth_err:
                logger.warning(f"Could not delete from auth.users: {auth_err}")

            return True

        except Exception as e:
            logger.error(f"Error deleting user {user_id}: {e}")
            raise DatabaseError("Failed to delete user") from e

    def bulk_delete_users(
        self,
        user_ids: List[str],
        admin_id: str
    ) -> Dict[str, Any]:
        """
        Delete multiple users.

        Args:
            user_ids: List of user IDs to delete
            admin_id: Admin performing the deletion

        Returns:
            Dict with deleted count, failed count, and details
        """
        deleted = []
        failed = []

        for target_user_id in user_ids:
            try:
                self.cleanup_user_relations(target_user_id)
                self.delete(target_user_id)

                try:
                    self.client.auth.admin.delete_user(target_user_id)
                except Exception:
                    pass

                deleted.append(target_user_id)
                logger.info(f"Bulk delete: Deleted user {target_user_id}")
            except Exception as e:
                logger.error(f"Bulk delete: Failed to delete user {target_user_id}: {e}")
                failed.append({'id': target_user_id, 'error': str(e)[:100]})

        return {
            'deleted': len(deleted),
            'failed': len(failed),
            'deleted_ids': deleted,
            'failed_details': failed
        }

    def get_user_conversations(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get conversations for a user (admin view).

        Args:
            user_id: User ID
            limit: Max results
            offset: Skip first N results

        Returns:
            Dict with user info and conversations list
        """
        try:
            conversations_result = self.client.table('tutor_conversations').select('''
                id, title, conversation_mode, quest_id, task_id,
                is_active, message_count, last_message_at, created_at,
                quests(title)
            ''').eq('user_id', user_id).order('last_message_at', desc=True).range(offset, offset + limit - 1).execute()

            user = self.find_by_id(user_id)

            return {
                'user': {
                    'id': user.get('id') if user else None,
                    'first_name': user.get('first_name') if user else None,
                    'last_name': user.get('last_name') if user else None,
                    'email': user.get('email') if user else None
                } if user else None,
                'conversations': conversations_result.data or [],
                'total': len(conversations_result.data or []),
                'limit': limit,
                'offset': offset
            }

        except APIError as e:
            logger.error(f"Error getting user conversations {user_id}: {e}")
            raise DatabaseError("Failed to fetch user conversations") from e

    def get_user_quest_enrollments(
        self,
        user_id: str
    ) -> Dict[str, Any]:
        """
        Get all quests for a user - both enrolled and available.

        Args:
            user_id: User ID

        Returns:
            Dict with enrolled_quests and available_quests lists
        """
        try:
            # Get all active quests
            all_quests = self.client.table('quests')\
                .select('id, title, big_idea, description, quest_type')\
                .eq('is_active', True)\
                .order('created_at', desc=True)\
                .execute()

            # Get user's enrollments
            enrollments = self.client.table('user_quests')\
                .select('*, quests(id, title, big_idea, description)')\
                .eq('user_id', user_id)\
                .eq('is_active', True)\
                .execute()

            enrolled_quest_ids = [e['quest_id'] for e in enrollments.data] if enrollments.data else []

            # Get task counts for enrolled quests
            task_counts = {}
            for quest_id in enrolled_quest_ids:
                tasks = self.client.table('user_quest_tasks')\
                    .select('id', count='exact')\
                    .eq('quest_id', quest_id)\
                    .eq('user_id', user_id)\
                    .execute()
                task_counts[quest_id] = tasks.count or 0

            # Build enrolled quests list
            enrolled_quests = []
            for enrollment in (enrollments.data or []):
                quest = enrollment.get('quests', {})
                enrolled_quests.append({
                    'quest_id': enrollment['quest_id'],
                    'user_quest_id': enrollment['id'],
                    'title': quest.get('title', 'Unknown Quest'),
                    'big_idea': quest.get('big_idea', ''),
                    'description': quest.get('description', ''),
                    'task_count': task_counts.get(enrollment['quest_id'], 0),
                    'started_at': enrollment.get('started_at'),
                    'completed_at': enrollment.get('completed_at'),
                    'is_enrolled': True
                })

            # Build available quests list
            available_quests = []
            for quest in (all_quests.data or []):
                if quest['id'] not in enrolled_quest_ids:
                    available_quests.append({
                        'quest_id': quest['id'],
                        'title': quest['title'],
                        'big_idea': quest.get('big_idea', ''),
                        'description': quest.get('description', ''),
                        'is_enrolled': False
                    })

            return {
                'enrolled_quests': enrolled_quests,
                'available_quests': available_quests,
                'total_enrolled': len(enrolled_quests),
                'total_available': len(available_quests)
            }

        except APIError as e:
            logger.error(f"Error getting user quest enrollments {user_id}: {e}")
            raise DatabaseError("Failed to fetch user quest enrollments") from e

    def verify_role(self, user_id: str, expected_role: str) -> bool:
        """
        Verify a user has an expected role.

        Args:
            user_id: User ID
            expected_role: Expected role

        Returns:
            True if user has the expected role
        """
        try:
            user = self.find_by_id(user_id)
            if not user:
                return False
            return user.get('role') == expected_role
        except Exception:
            return False

    def is_superadmin(self, user_id: str) -> bool:
        """Check if user is superadmin."""
        return self.verify_role(user_id, 'superadmin')
