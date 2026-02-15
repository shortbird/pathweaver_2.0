"""
Advisor Repository - Handles advisor-student assignment operations

Provides data access for advisor-student relationships including:
- Verifying advisor access to students
- Getting assigned students for an advisor
- Managing advisor assignments

Table: advisor_student_assignments
"""

from typing import Optional, Dict, List, Any
from repositories.base_repository import BaseRepository, DatabaseError
from database import get_supabase_admin_client

from utils.logger import get_logger

logger = get_logger(__name__)


class AdvisorRepository(BaseRepository):
    """
    Repository for advisor-student assignment operations.

    Most operations require admin client since they involve
    cross-user access verification (ADR-002, Rule 5).
    """

    table_name = 'advisor_student_assignments'

    def __init__(self, user_id: Optional[str] = None, client=None):
        """
        Initialize repository with optional user context.

        Args:
            user_id: UUID of the authenticated user (for RLS)
            client: Optional Supabase client (defaults to admin for cross-user access)
        """
        super().__init__(user_id)
        if client:
            self._client = client
        else:
            # Default to admin client for cross-user access verification
            self._client = get_supabase_admin_client()

    def verify_student_access(self, advisor_id: str, student_id: str) -> bool:
        """
        Verify that an advisor has access to a specific student.

        Args:
            advisor_id: UUID of the advisor
            student_id: UUID of the student

        Returns:
            True if advisor has access, False otherwise
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select('id')
                .eq('advisor_id', advisor_id)
                .eq('student_id', student_id)
                .execute()
            )
            return bool(response.data)
        except Exception as e:
            logger.error(f"Error verifying advisor access: {e}")
            raise DatabaseError(f"Failed to verify advisor access") from e

    def get_assigned_students(
        self,
        advisor_id: str,
        include_user_details: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Get all students assigned to an advisor.

        Args:
            advisor_id: UUID of the advisor
            include_user_details: If True, join with users table for student info

        Returns:
            List of assignment records (optionally with user details)
        """
        try:
            if include_user_details:
                # Join with users table to get student details
                response = (
                    self.client.table(self.table_name)
                    .select('''
                        id,
                        student_id,
                        assigned_at,
                        assigned_by,
                        users!advisor_student_assignments_student_id_fkey(
                            id,
                            email,
                            first_name,
                            last_name,
                            display_name,
                            avatar_url
                        )
                    ''')
                    .eq('advisor_id', advisor_id)
                    .order('assigned_at', desc=True)
                    .execute()
                )
            else:
                response = (
                    self.client.table(self.table_name)
                    .select('id, student_id, assigned_at, assigned_by')
                    .eq('advisor_id', advisor_id)
                    .order('assigned_at', desc=True)
                    .execute()
                )

            return response.data or []
        except Exception as e:
            logger.error(f"Error getting assigned students for advisor {advisor_id}: {e}")
            raise DatabaseError("Failed to get assigned students") from e

    def get_student_advisors(
        self,
        student_id: str,
        include_user_details: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Get all advisors assigned to a student.

        Args:
            student_id: UUID of the student
            include_user_details: If True, join with users table for advisor info

        Returns:
            List of assignment records (optionally with user details)
        """
        try:
            if include_user_details:
                response = (
                    self.client.table(self.table_name)
                    .select('''
                        id,
                        advisor_id,
                        assigned_at,
                        assigned_by,
                        users!advisor_student_assignments_advisor_id_fkey(
                            id,
                            email,
                            first_name,
                            last_name,
                            display_name,
                            avatar_url
                        )
                    ''')
                    .eq('student_id', student_id)
                    .order('assigned_at', desc=True)
                    .execute()
                )
            else:
                response = (
                    self.client.table(self.table_name)
                    .select('id, advisor_id, assigned_at, assigned_by')
                    .eq('student_id', student_id)
                    .order('assigned_at', desc=True)
                    .execute()
                )

            return response.data or []
        except Exception as e:
            logger.error(f"Error getting advisors for student {student_id}: {e}")
            raise DatabaseError("Failed to get student advisors") from e

    def assign_student(
        self,
        advisor_id: str,
        student_id: str,
        assigned_by: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Assign a student to an advisor.

        Args:
            advisor_id: UUID of the advisor
            student_id: UUID of the student
            assigned_by: UUID of the user making the assignment (optional)

        Returns:
            Created assignment record
        """
        try:
            data = {
                'advisor_id': advisor_id,
                'student_id': student_id
            }
            if assigned_by:
                data['assigned_by'] = assigned_by

            response = (
                self.client.table(self.table_name)
                .insert(data)
                .execute()
            )

            if not response.data:
                raise DatabaseError("Failed to create advisor assignment")

            logger.info(f"Assigned student {student_id} to advisor {advisor_id}")
            return response.data[0]
        except Exception as e:
            logger.error(f"Error assigning student {student_id} to advisor {advisor_id}: {e}")
            raise DatabaseError("Failed to assign student to advisor") from e

    def unassign_student(self, advisor_id: str, student_id: str) -> bool:
        """
        Remove a student from an advisor.

        Args:
            advisor_id: UUID of the advisor
            student_id: UUID of the student

        Returns:
            True if unassigned successfully
        """
        try:
            response = (
                self.client.table(self.table_name)
                .delete()
                .eq('advisor_id', advisor_id)
                .eq('student_id', student_id)
                .execute()
            )

            if response.data:
                logger.info(f"Unassigned student {student_id} from advisor {advisor_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"Error unassigning student {student_id} from advisor {advisor_id}: {e}")
            raise DatabaseError("Failed to unassign student from advisor") from e

    def get_assignment(self, advisor_id: str, student_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific advisor-student assignment.

        Args:
            advisor_id: UUID of the advisor
            student_id: UUID of the student

        Returns:
            Assignment record if exists, None otherwise
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select('*')
                .eq('advisor_id', advisor_id)
                .eq('student_id', student_id)
                .execute()
            )

            if response.data:
                return response.data[0]
            return None
        except Exception as e:
            logger.error(f"Error getting assignment: {e}")
            raise DatabaseError("Failed to get assignment") from e

    def get_student_ids_for_advisor(self, advisor_id: str) -> List[str]:
        """
        Get list of student IDs assigned to an advisor.

        Lightweight method that returns only IDs for filtering/checking.

        Args:
            advisor_id: UUID of the advisor

        Returns:
            List of student UUIDs
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select('student_id')
                .eq('advisor_id', advisor_id)
                .execute()
            )

            return [r['student_id'] for r in (response.data or [])]
        except Exception as e:
            logger.error(f"Error getting student IDs for advisor {advisor_id}: {e}")
            raise DatabaseError("Failed to get student IDs") from e
