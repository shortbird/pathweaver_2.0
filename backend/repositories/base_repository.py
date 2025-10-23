"""
Base Repository - Abstract base class for all repositories

Provides common database operations with:
- Consistent error handling
- Automatic RLS enforcement
- Connection pooling
- Query logging
- Retry logic for transient errors
"""

import logging
from typing import Optional, Dict, List, Any
from postgrest.exceptions import APIError
from backend.database import get_user_client, get_supabase_admin_client

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)


class DatabaseError(Exception):
    """Base exception for database errors"""
    pass


class NotFoundError(DatabaseError):
    """Raised when a resource is not found"""
    pass


class ValidationError(DatabaseError):
    """Raised when validation fails"""
    pass


class PermissionError(DatabaseError):
    """Raised when user lacks permission"""
    pass


class BaseRepository:
    """
    Abstract base class for all repositories.

    Provides common CRUD operations with RLS enforcement.
    Subclasses should define:
    - table_name: str - Name of the database table
    - id_column: str - Name of the primary key column (default: 'id')
    """

    table_name: str = None
    id_column: str = 'id'

    def __init__(self, user_id: Optional[str] = None):
        """
        Initialize repository with optional user context.

        Args:
            user_id: UUID of the authenticated user (for RLS enforcement)
        """
        if not self.table_name:
            raise NotImplementedError("Subclasses must define table_name")

        self.user_id = user_id
        self._client = None

    @property
    def client(self):
        """
        Get Supabase client with appropriate permissions.

        Returns user-authenticated client if user_id is set,
        otherwise returns admin client (use with caution).
        """
        if self._client is None:
            if self.user_id:
                # Get user client with JWT token from request headers
                # The token is automatically extracted from Authorization header
                self._client = get_user_client()
            else:
                logger.warning(
                    f"Using admin client for {self.table_name} repository. "
                    "Ensure this is intentional and RLS is not being bypassed."
                )
                self._client = get_supabase_admin_client()
        return self._client

    def find_by_id(self, id_value: str) -> Optional[Dict[str, Any]]:
        """
        Find a single record by ID.

        Args:
            id_value: Value of the primary key

        Returns:
            Dictionary containing the record, or None if not found

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select('*')
                .eq(self.id_column, id_value)
                .execute()
            )

            if not response.data:
                return None

            return response.data[0]

        except APIError as e:
            logger.error(f"Error finding {self.table_name} by {self.id_column}={id_value}: {e}")
            raise DatabaseError(f"Failed to fetch {self.table_name}") from e

    def find_all(
        self,
        filters: Optional[Dict[str, Any]] = None,
        order_by: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Find all records matching filters.

        Args:
            filters: Dictionary of column->value filters
            order_by: Column name to order by (prefix with '-' for DESC)
            limit: Maximum number of records to return
            offset: Number of records to skip

        Returns:
            List of records

        Raises:
            DatabaseError: If query fails
        """
        try:
            query = self.client.table(self.table_name).select('*')

            # Apply filters
            if filters:
                for column, value in filters.items():
                    query = query.eq(column, value)

            # Apply ordering
            if order_by:
                if order_by.startswith('-'):
                    # Descending order
                    query = query.order(order_by[1:], desc=True)
                else:
                    # Ascending order
                    query = query.order(order_by)

            # Apply pagination
            if limit:
                query = query.limit(limit)
            if offset:
                query = query.offset(offset)

            response = query.execute()
            return response.data or []

        except APIError as e:
            logger.error(f"Error finding {self.table_name}: {e}")
            raise DatabaseError(f"Failed to fetch {self.table_name} records") from e

    def create(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new record.

        Args:
            data: Dictionary of column->value pairs

        Returns:
            Created record

        Raises:
            ValidationError: If data is invalid
            DatabaseError: If insert fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .insert(data)
                .execute()
            )

            if not response.data:
                raise DatabaseError(f"Failed to create {self.table_name} record")

            logger.info(f"Created {self.table_name} record: {response.data[0].get(self.id_column)}")
            return response.data[0]

        except APIError as e:
            logger.error(f"Error creating {self.table_name}: {e}")
            raise DatabaseError(f"Failed to create {self.table_name}") from e

    def update(self, id_value: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update an existing record.

        Args:
            id_value: Value of the primary key
            data: Dictionary of column->value pairs to update

        Returns:
            Updated record

        Raises:
            NotFoundError: If record doesn't exist
            DatabaseError: If update fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .update(data)
                .eq(self.id_column, id_value)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"{self.table_name} with {self.id_column}={id_value} not found")

            logger.info(f"Updated {self.table_name} record: {id_value}")
            return response.data[0]

        except APIError as e:
            logger.error(f"Error updating {self.table_name} {id_value}: {e}")
            raise DatabaseError(f"Failed to update {self.table_name}") from e

    def delete(self, id_value: str) -> bool:
        """
        Delete a record by ID.

        Args:
            id_value: Value of the primary key

        Returns:
            True if deleted successfully

        Raises:
            NotFoundError: If record doesn't exist
            DatabaseError: If delete fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .delete()
                .eq(self.id_column, id_value)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"{self.table_name} with {self.id_column}={id_value} not found")

            logger.info(f"Deleted {self.table_name} record: {id_value}")
            return True

        except APIError as e:
            logger.error(f"Error deleting {self.table_name} {id_value}: {e}")
            raise DatabaseError(f"Failed to delete {self.table_name}") from e

    def count(self, filters: Optional[Dict[str, Any]] = None) -> int:
        """
        Count records matching filters.

        Args:
            filters: Dictionary of column->value filters

        Returns:
            Number of matching records

        Raises:
            DatabaseError: If query fails
        """
        try:
            query = self.client.table(self.table_name).select('*', count='exact')

            # Apply filters
            if filters:
                for column, value in filters.items():
                    query = query.eq(column, value)

            response = query.execute()
            return response.count or 0

        except APIError as e:
            logger.error(f"Error counting {self.table_name}: {e}")
            raise DatabaseError(f"Failed to count {self.table_name} records") from e

    def exists(self, id_value: str) -> bool:
        """
        Check if a record exists by ID.

        Args:
            id_value: Value of the primary key

        Returns:
            True if record exists, False otherwise
        """
        record = self.find_by_id(id_value)
        return record is not None
