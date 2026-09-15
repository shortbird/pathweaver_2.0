"""
Parent Repository

The admin's hand on parent_student_links: list, create and delete a link, and
the two lookups those need. It once carried three generations of the
request-and-approve flow as well (parent_invitations, parent_connection_requests,
and a parent's own children list): fourteen methods over two tables the
database no longer has and one question -- who are this parent's children --
that utils.class_membership answers for everyone. Deleted 2026-09-15.
"""

from typing import List, Dict, Optional, Any
from repositories.base_repository import BaseRepository, NotFoundError
from utils.logger import get_logger
from utils.pagination import fetch_page

logger = get_logger(__name__)


class ParentRepository(BaseRepository):
    """Repository for parent-student relationship operations."""

    table_name = 'parent_student_links'

    def __init__(self, client):
        """
        Initialize repository with Supabase client.

        Args:
            client: Supabase client (admin client for cross-user operations)
        """
        self.table_name = 'parent_student_links'
        self._client = client
        self.user_id = None  # Not used for parent operations

    @property
    def client(self):
        """Return the provided client."""
        return self._client

    def is_linked(self, parent_id: str, student_id: str) -> bool:
        """
        Check if a parent is linked to a student.

        Delegates to the one definition (utils.portfolio_access.is_parent_of),
        which covers all three links: an approved parent_student_links row,
        users.managed_by_parent_id, and a shared household. This used to inline
        the first two, so a guardian who registered through the SIS funnel could
        not attach helper evidence to their own child's work
        (helper_evidence.has_parent_claim is the caller).

        Args:
            parent_id: Parent user ID
            student_id: Student user ID

        Returns:
            True if linked, False otherwise
        """
        try:
            from utils.portfolio_access import is_parent_of
            return is_parent_of(parent_id, student_id)
        except Exception as e:
            logger.error(f"Error checking parent-student link: {e}")
            return False

    def get_all_active_links(
        self,
        filters: Optional[Dict[str, Any]] = None,
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        """
        Admin gets all active parent-student links with optional filters and pagination.

        Args:
            filters: Optional dict with keys: parent_id, student_id, admin_verified
            page: Page number (1-indexed)
            limit: Results per page

        Returns:
            Dict with links list, total_count, page, and limit
        """
        try:
            # A factory, not a single builder -- see get_all_connection_requests.
            def build_query():
                query = self.client.table(self.table_name)\
                    .select('''
                        id,
                        parent_user_id,
                        student_user_id,
                        admin_verified,
                        verified_by_admin_id,
                        verified_at,
                        admin_notes,
                        created_at,
                        parent:users!parent_student_links_parent_user_id_fkey(
                            id, first_name, last_name, email
                        ),
                        student:users!parent_student_links_student_user_id_fkey(
                            id, first_name, last_name, email
                        ),
                        verified_by:users!parent_student_links_verified_by_admin_id_fkey(
                            id, first_name, last_name
                        )
                    ''', count='exact')

                if filters:
                    if 'parent_id' in filters and filters['parent_id']:
                        query = query.eq('parent_user_id', filters['parent_id'])
                    if 'student_id' in filters and filters['student_id']:
                        query = query.eq('student_user_id', filters['student_id'])
                    if 'admin_verified' in filters and filters['admin_verified'] is not None:
                        query = query.eq('admin_verified', filters['admin_verified'])

                return query.order('created_at', desc=True)

            result = fetch_page(build_query, page, limit)

            return {
                'links': result.data or [],
                'total_count': result.count or 0,
                'page': page,
                'limit': limit
            }
        except Exception as e:
            logger.error(f"Error fetching all active links: {e}")
            return {'links': [], 'total_count': 0, 'page': page, 'limit': limit}

    def delete_link(self, link_id: str, admin_id: str) -> bool:
        """
        Admin disconnects a parent-student link.

        Args:
            link_id: Link ID
            admin_id: Admin user ID (for logging)

        Returns:
            True if deleted successfully

        Raises:
            NotFoundError: If link not found
        """
        try:
            # Verify link exists
            link_result = self.client.table(self.table_name)\
                .select('id')\
                .eq('id', link_id)\
                .execute()

            if not link_result.data:
                raise NotFoundError("Link not found")

            # Delete link
            self.client.table(self.table_name)\
                .delete()\
                .eq('id', link_id)\
                .execute()

            logger.info(f"Admin {admin_id} deleted parent-student link {link_id}")
            return True

        except Exception as e:
            logger.error(f"Error deleting link {link_id}: {e}")
            raise

    def create_manual_link(self, parent_id: str, student_id: str, admin_id: str, notes: Optional[str] = None) -> str:
        """
        Admin manually creates a parent-student link (bypass request workflow).

        Args:
            parent_id: Parent user ID
            student_id: Student user ID
            admin_id: Admin user ID
            notes: Optional admin notes

        Returns:
            Created link ID

        Raises:
            ValueError: If link already exists or invalid user IDs
        """
        try:
            # Check if link already exists
            existing = self.client.table(self.table_name)\
                .select('id')\
                .eq('parent_user_id', parent_id)\
                .eq('student_user_id', student_id)\
                .execute()

            if existing.data:
                raise ValueError("Link already exists between this parent and student")

            # Create verified link using database function
            link_result = self.client.rpc('create_verified_parent_link', {
                'p_parent_id': parent_id,
                'p_student_id': student_id,
                'p_admin_id': admin_id,
                'p_notes': notes
            }).execute()

            logger.info(f"Admin {admin_id} manually created link between parent {parent_id} and student {student_id}")
            return link_result.data

        except Exception as e:
            logger.error(f"Error creating manual link: {e}")
            raise

    def verify_user_role(self, user_id: str, expected_role: str) -> Optional[Dict[str, Any]]:
        """
        Verify a user exists and has the expected role.

        Args:
            user_id: User ID
            expected_role: Expected role (e.g., 'parent', 'student')

        Returns:
            User record if valid, None otherwise
        """
        try:
            result = self.client.table('users')\
                .select('id, role')\
                .eq('id', user_id)\
                .execute()

            if not result.data:
                return None

            user = result.data[0]
            if user.get('role') != expected_role:
                return None

            return user
        except Exception as e:
            logger.error(f"Error verifying user role: {e}")
            return None

    def link_exists(self, parent_id: str, student_id: str) -> bool:
        """
        Check if a parent-student link already exists.

        Args:
            parent_id: Parent user ID
            student_id: Student user ID

        Returns:
            True if link exists
        """
        try:
            result = self.client.table(self.table_name)\
                .select('id')\
                .eq('parent_user_id', parent_id)\
                .eq('student_user_id', student_id)\
                .execute()

            return bool(result.data)
        except Exception as e:
            logger.error(f"Error checking link existence: {e}")
            return False
