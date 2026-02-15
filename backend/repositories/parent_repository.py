"""
Parent Repository

Handles all database operations related to parent-student relationships and parent dashboard access.
"""

from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
from repositories.base_repository import BaseRepository, NotFoundError, PermissionError
from utils.logger import get_logger

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

    def find_children(self, parent_id: str) -> List[Dict[str, Any]]:
        """
        Get all students linked to a parent.

        Args:
            parent_id: Parent user ID

        Returns:
            List of linked students with details
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*, student:student_user_id(id, display_name, avatar_url, first_name, last_name)')\
                .eq('parent_user_id', parent_id)\
                .eq('status', 'approved')\
                .order('approved_at', desc=True)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching children for parent {parent_id}: {e}")
            return []

    def find_parents(self, student_id: str) -> List[Dict[str, Any]]:
        """
        Get all parents linked to a student.

        Args:
            student_id: Student user ID

        Returns:
            List of linked parents with details
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*, parent:parent_user_id(id, display_name, avatar_url, first_name, last_name)')\
                .eq('student_user_id', student_id)\
                .eq('status', 'approved')\
                .order('created_at', desc=True)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching parents for student {student_id}: {e}")
            return []

    def is_linked(self, parent_id: str, student_id: str) -> bool:
        """
        Check if a parent is linked to a student.
        Checks both:
        1. parent_student_links table (for 13+ students linked via admin/invitation)
        2. users table managed_by_parent_id (for dependents under 13)

        Args:
            parent_id: Parent user ID
            student_id: Student user ID

        Returns:
            True if linked, False otherwise
        """
        try:
            # Check 1: parent_student_links table (13+ students)
            result = self.client.table(self.table_name)\
                .select('id')\
                .eq('parent_user_id', parent_id)\
                .eq('student_user_id', student_id)\
                .eq('status', 'approved')\
                .execute()

            if result.data:
                return True

            # Check 2: users table for dependents (under 13)
            dependent_result = self.client.table('users')\
                .select('id')\
                .eq('id', student_id)\
                .eq('managed_by_parent_id', parent_id)\
                .eq('is_dependent', True)\
                .execute()

            return bool(dependent_result.data)
        except Exception as e:
            logger.error(f"Error checking parent-student link: {e}")
            return False

    def create_invitation(self, student_id: str, parent_email: str) -> Dict[str, Any]:
        """
        Create a parent invitation (student sends invite to parent).

        Args:
            student_id: Student user ID
            parent_email: Parent's email address

        Returns:
            Created invitation record
        """
        try:
            # Check for existing pending invitation
            existing = self.client.table('parent_invitations')\
                .select('id')\
                .eq('student_id', student_id)\
                .eq('parent_email', parent_email)\
                .eq('status', 'pending')\
                .execute()

            if existing.data:
                raise ValueError("Pending invitation already exists")

            data = {
                'student_id': student_id,
                'parent_email': parent_email,
                'status': 'pending',
                'expires_at': (datetime.utcnow() + timedelta(hours=48)).isoformat(),
                'created_at': datetime.utcnow().isoformat()
            }

            result = self.client.table('parent_invitations')\
                .insert(data)\
                .execute()

            if not result.data:
                raise ValueError("Failed to create parent invitation")

            logger.info(f"Created parent invitation from student {student_id} to {parent_email}")
            return result.data[0]
        except Exception as e:
            logger.error(f"Error creating parent invitation: {e}")
            raise

    def get_pending_invitations(self, parent_email: str) -> List[Dict[str, Any]]:
        """
        Get all pending invitations for a parent email.

        Args:
            parent_email: Parent's email address

        Returns:
            List of pending invitations with student details
        """
        try:
            result = self.client.table('parent_invitations')\
                .select('*, student:student_id(id, display_name, first_name, last_name, avatar_url)')\
                .eq('parent_email', parent_email)\
                .eq('status', 'pending')\
                .gt('expires_at', datetime.utcnow().isoformat())\
                .order('created_at', desc=True)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching pending invitations for {parent_email}: {e}")
            return []

    def approve_invitation(self, invitation_id: str, parent_id: str) -> Dict[str, Any]:
        """
        Approve a parent invitation (parent accepts student's invite).

        Args:
            invitation_id: Invitation ID
            parent_id: Parent user ID

        Returns:
            Created parent-student link record
        """
        try:
            # Get invitation
            invitation = self.client.table('parent_invitations')\
                .select('*')\
                .eq('id', invitation_id)\
                .eq('status', 'pending')\
                .single()\
                .execute()

            if not invitation.data:
                raise NotFoundError("Invitation not found or already processed")

            invitation_data = invitation.data

            # Check expiration
            if datetime.fromisoformat(invitation_data['expires_at']) < datetime.utcnow():
                raise ValueError("Invitation has expired")

            # Create parent-student link
            link_data = {
                'parent_id': parent_id,
                'student_id': invitation_data['student_id'],
                'linked_at': datetime.utcnow().isoformat()
            }

            link_result = self.client.table(self.table_name)\
                .insert(link_data)\
                .execute()

            if not link_result.data:
                raise ValueError("Failed to create parent-student link")

            # Update invitation status
            self.client.table('parent_invitations')\
                .update({'status': 'approved'})\
                .eq('id', invitation_id)\
                .execute()

            logger.info(f"Approved parent invitation {invitation_id}, created link for parent {parent_id}")
            return link_result.data[0]
        except Exception as e:
            logger.error(f"Error approving parent invitation {invitation_id}: {e}")
            raise

    def decline_invitation(self, invitation_id: str) -> bool:
        """
        Decline a parent invitation.

        Args:
            invitation_id: Invitation ID

        Returns:
            True if declined successfully
        """
        try:
            result = self.client.table('parent_invitations')\
                .update({'status': 'declined'})\
                .eq('id', invitation_id)\
                .execute()

            logger.info(f"Declined parent invitation {invitation_id}")
            return True
        except Exception as e:
            logger.error(f"Error declining parent invitation {invitation_id}: {e}")
            raise

    def cancel_invitation(self, invitation_id: str, student_id: str) -> bool:
        """
        Cancel a parent invitation (student cancels before parent accepts).

        Args:
            invitation_id: Invitation ID
            student_id: Student user ID (for permission check)

        Returns:
            True if canceled successfully

        Raises:
            PermissionError: If user is not the student who sent the invitation
        """
        try:
            invitation = self.client.table('parent_invitations')\
                .select('*')\
                .eq('id', invitation_id)\
                .single()\
                .execute()

            if not invitation.data:
                raise NotFoundError("Invitation not found")

            if invitation.data['student_id'] != student_id:
                raise PermissionError("Only the student who sent the invitation can cancel it")

            result = self.client.table('parent_invitations')\
                .delete()\
                .eq('id', invitation_id)\
                .execute()

            logger.info(f"Canceled parent invitation {invitation_id}")
            return True
        except Exception as e:
            logger.error(f"Error canceling parent invitation {invitation_id}: {e}")
            raise

    def get_student_invitations(self, student_id: str) -> List[Dict[str, Any]]:
        """
        Get all invitations sent by a student.

        Args:
            student_id: Student user ID

        Returns:
            List of invitations
        """
        try:
            result = self.client.table('parent_invitations')\
                .select('*')\
                .eq('student_id', student_id)\
                .order('created_at', desc=True)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching invitations for student {student_id}: {e}")
            return []

    # ========================================================================
    # NEW ADMIN-VERIFICATION WORKFLOW METHODS (January 2025 Redesign)
    # ========================================================================

    def create_connection_requests(self, parent_id: str, children_data: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        Parent submits connection requests for multiple children.
        Auto-matches emails to existing students.

        Args:
            parent_id: Parent user ID
            children_data: List of dicts with keys: first_name, last_name, email

        Returns:
            Dict with submitted_count, auto_matched_count, requests list
        """
        try:
            requests = []
            auto_matched_count = 0

            for child in children_data:
                # Auto-match student by email
                matched_student_id = None
                student_result = self.client.rpc('match_student_by_email', {
                    'p_email': child['email']
                }).execute()

                if student_result.data:
                    matched_student_id = student_result.data
                    auto_matched_count += 1

                # Create connection request
                request_data = {
                    'parent_user_id': parent_id,
                    'child_first_name': child['first_name'],
                    'child_last_name': child['last_name'],
                    'child_email': child['email'],
                    'matched_student_id': matched_student_id,
                    'status': 'pending'
                }

                result = self.client.table('parent_connection_requests')\
                    .insert(request_data)\
                    .execute()

                if result.data:
                    requests.append(result.data[0])

            logger.info(f"Parent {parent_id} submitted {len(requests)} connection requests, {auto_matched_count} auto-matched")

            return {
                'submitted_count': len(requests),
                'auto_matched_count': auto_matched_count,
                'requests': requests
            }
        except Exception as e:
            logger.error(f"Error creating connection requests for parent {parent_id}: {e}")
            raise

    def get_connection_requests(self, parent_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get connection requests submitted by a parent.

        Args:
            parent_id: Parent user ID
            status: Optional filter by status (pending/approved/rejected)

        Returns:
            List of connection requests with matched student details
        """
        try:
            query = self.client.table('parent_connection_requests')\
                .select('''
                    *,
                    matched_student:users!parent_connection_requests_matched_student_id_fkey(
                        id, first_name, last_name, email
                    )
                ''')\
                .eq('parent_user_id', parent_id)

            if status:
                query = query.eq('status', status)

            result = query.order('created_at', desc=True).execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching connection requests for parent {parent_id}: {e}")
            return []

    def approve_connection_request(self, request_id: str, admin_id: str, notes: Optional[str] = None) -> str:
        """
        Admin approves a connection request.
        Creates verified parent_student_links record.

        Args:
            request_id: Connection request ID
            admin_id: Admin user ID
            notes: Optional admin notes

        Returns:
            Created link ID

        Raises:
            NotFoundError: If request not found
            ValueError: If request already processed or student not matched
        """
        try:
            # Get request
            request_result = self.client.table('parent_connection_requests')\
                .select('*')\
                .eq('id', request_id)\
                .single()\
                .execute()

            if not request_result.data:
                raise NotFoundError("Connection request not found")

            request_data = request_result.data

            if request_data['status'] != 'pending':
                raise ValueError("Request has already been processed")

            if not request_data['matched_student_id']:
                raise ValueError("No student matched for this request")

            # Create verified link using database function
            link_result = self.client.rpc('create_verified_parent_link', {
                'p_parent_id': request_data['parent_user_id'],
                'p_student_id': request_data['matched_student_id'],
                'p_admin_id': admin_id,
                'p_notes': notes
            }).execute()

            # Update request status
            self.client.table('parent_connection_requests')\
                .update({
                    'status': 'approved',
                    'admin_notes': notes,
                    'reviewed_by_admin_id': admin_id,
                    'reviewed_at': datetime.utcnow().isoformat()
                })\
                .eq('id', request_id)\
                .execute()

            logger.info(f"Admin {admin_id} approved connection request {request_id}")
            return link_result.data

        except Exception as e:
            logger.error(f"Error approving connection request {request_id}: {e}")
            raise

    def reject_connection_request(self, request_id: str, admin_id: str, notes: str) -> bool:
        """
        Admin rejects a connection request.

        Args:
            request_id: Connection request ID
            admin_id: Admin user ID
            notes: Rejection reason (required)

        Returns:
            True if rejected successfully

        Raises:
            NotFoundError: If request not found
            ValueError: If request already processed or notes missing
        """
        try:
            if not notes:
                raise ValueError("Admin notes are required when rejecting a request")

            # Get request
            request_result = self.client.table('parent_connection_requests')\
                .select('status')\
                .eq('id', request_id)\
                .single()\
                .execute()

            if not request_result.data:
                raise NotFoundError("Connection request not found")

            if request_result.data['status'] != 'pending':
                raise ValueError("Request has already been processed")

            # Update request status
            self.client.table('parent_connection_requests')\
                .update({
                    'status': 'rejected',
                    'admin_notes': notes,
                    'reviewed_by_admin_id': admin_id,
                    'reviewed_at': datetime.utcnow().isoformat()
                })\
                .eq('id', request_id)\
                .execute()

            logger.info(f"Admin {admin_id} rejected connection request {request_id}")
            return True

        except Exception as e:
            logger.error(f"Error rejecting connection request {request_id}: {e}")
            raise

    def get_all_connection_requests(
        self,
        filters: Optional[Dict[str, Any]] = None,
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        """
        Admin gets all connection requests with optional filters and pagination.

        Args:
            filters: Optional dict with keys: status, parent_id, start_date, end_date
            page: Page number (1-indexed)
            limit: Results per page

        Returns:
            Dict with requests list, total_count, page, and limit
        """
        try:
            query = self.client.table('parent_connection_requests')\
                .select('''
                    id,
                    parent_user_id,
                    child_first_name,
                    child_last_name,
                    child_email,
                    matched_student_id,
                    status,
                    admin_notes,
                    reviewed_by_admin_id,
                    reviewed_at,
                    created_at,
                    parent_user:users!parent_connection_requests_parent_user_id_fkey(
                        id, first_name, last_name, email
                    ),
                    matched_student:users!parent_connection_requests_matched_student_id_fkey(
                        id, first_name, last_name, email
                    ),
                    reviewed_by:users!parent_connection_requests_reviewed_by_admin_id_fkey(
                        id, first_name, last_name
                    )
                ''', count='exact')

            if filters:
                if 'status' in filters and filters['status']:
                    query = query.eq('status', filters['status'])
                if 'parent_id' in filters and filters['parent_id']:
                    query = query.eq('parent_user_id', filters['parent_id'])
                if 'start_date' in filters and filters['start_date']:
                    query = query.gte('created_at', filters['start_date'])
                if 'end_date' in filters and filters['end_date']:
                    query = query.lte('created_at', filters['end_date'])

            # Apply pagination
            offset = (page - 1) * limit
            query = query.order('created_at', desc=True).range(offset, offset + limit - 1)

            result = query.execute()

            return {
                'requests': result.data or [],
                'total_count': result.count or 0,
                'page': page,
                'limit': limit
            }
        except Exception as e:
            logger.error(f"Error fetching all connection requests: {e}")
            return {'requests': [], 'total_count': 0, 'page': page, 'limit': limit}

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

            # Apply pagination
            offset = (page - 1) * limit
            query = query.order('created_at', desc=True).range(offset, offset + limit - 1)

            result = query.execute()

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

    def get_connection_request(self, request_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a single connection request by ID.

        Args:
            request_id: Connection request ID

        Returns:
            Request record or None
        """
        try:
            result = self.client.table('parent_connection_requests')\
                .select('''
                    id,
                    parent_user_id,
                    child_first_name,
                    child_last_name,
                    child_email,
                    matched_student_id,
                    status
                ''')\
                .eq('id', request_id)\
                .single()\
                .execute()

            return result.data
        except Exception as e:
            logger.error(f"Error fetching connection request {request_id}: {e}")
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
