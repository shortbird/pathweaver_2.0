"""
Base Service Class
Provides common functionality for all service classes including
error handling, logging, retry logic, and database access patterns.
"""

from typing import Optional, Callable, Any, Dict
from functools import wraps
import time
import logging
from flask import current_app
from database import get_supabase_admin_client, get_user_client
from app_config import Config

from utils.logger import get_logger

logger = get_logger(__name__)

# Configure logging
logger = logging.getLogger(__name__)


class ServiceError(Exception):
    """Base exception for service layer errors."""
    pass


class DatabaseError(ServiceError):
    """Database operation failed."""
    pass


class ValidationError(ServiceError):
    """Input validation failed."""
    pass


class NotFoundError(ServiceError):
    """Requested resource not found."""
    pass


class PermissionError(ServiceError):
    """User lacks permission for operation."""
    pass


class BaseService:
    """
    Base service class providing common patterns for all services.

    Features:
    - Consistent error handling
    - Logging of operations
    - Retry logic for transient failures
    - Database client management
    - Operation timing/performance tracking

    Usage:
        class MyService(BaseService):
            def my_operation(self, user_id: str):
                # Use self.execute() for automatic retry & error handling
                return self.execute(
                    operation=lambda: self._do_work(user_id),
                    operation_name="my_operation",
                    user_id=user_id
                )
    """

    def __init__(self, user_id: Optional[str] = None):
        """
        Initialize service.

        Args:
            user_id: Optional user ID for RLS-enabled database operations
        """
        self.user_id = user_id
        self._admin_client = None
        self._user_client = None

    @property
    def supabase(self):
        """Get admin Supabase client (no RLS)."""
        if self._admin_client is None:
            self._admin_client = get_supabase_admin_client()
        return self._admin_client

    def get_user_supabase(self, user_id: Optional[str] = None):
        """
        Get user-authenticated Supabase client (RLS enforced).

        Args:
            user_id: User ID (uses instance user_id if not provided)

        Returns:
            User-authenticated Supabase client

        Raises:
            ValueError: If no user_id provided
        """
        uid = user_id or self.user_id
        if not uid:
            raise ValueError("user_id required for RLS-enabled operations")
        return get_user_client(uid)

    def execute(
        self,
        operation: Callable,
        operation_name: str,
        retries: int = None,
        retry_delay: float = None,
        log_errors: bool = True,
        **context
    ) -> Any:
        """
        Execute an operation with retry logic and error handling.

        Args:
            operation: Function to execute
            operation_name: Name for logging
            retries: Number of retry attempts (default: from Config.SERVICE_RETRY_ATTEMPTS)
            retry_delay: Delay between retries in seconds (default: from Config.SERVICE_RETRY_DELAY)
            log_errors: Whether to log errors (default: True)
            **context: Additional context for logging (e.g., user_id, quest_id)

        Returns:
            Result of operation

        Raises:
            ServiceError: If operation fails after all retries
        """
        # Use config defaults if not specified
        retries = retries or Config.SERVICE_RETRY_ATTEMPTS
        retry_delay = retry_delay or Config.SERVICE_RETRY_DELAY
        max_delay = Config.SERVICE_MAX_RETRY_DELAY

        start_time = time.time()
        last_error = None

        for attempt in range(retries):
            try:
                result = operation()

                # Log success with timing
                elapsed = time.time() - start_time
                self._log_operation(
                    operation_name=operation_name,
                    status="success",
                    elapsed_ms=int(elapsed * 1000),
                    attempt=attempt + 1,
                    **context
                )

                return result

            except Exception as e:
                last_error = e

                # Don't retry on validation or permission errors
                if isinstance(e, (ValidationError, PermissionError, NotFoundError)):
                    if log_errors:
                        self._log_operation(
                            operation_name=operation_name,
                            status="failed",
                            error=str(e),
                            error_type=type(e).__name__,
                            **context
                        )
                    raise

                # Log retry attempt
                if attempt < retries - 1:
                    if log_errors:
                        self._log_operation(
                            operation_name=operation_name,
                            status="retry",
                            attempt=attempt + 1,
                            error=str(e),
                            **context
                        )
                    # Exponential backoff with max delay cap
                    delay = min(retry_delay * (attempt + 1), max_delay)
                    time.sleep(delay)
                else:
                    # Final attempt failed
                    if log_errors:
                        elapsed = time.time() - start_time
                        self._log_operation(
                            operation_name=operation_name,
                            status="failed",
                            elapsed_ms=int(elapsed * 1000),
                            attempts=retries,
                            error=str(e),
                            error_type=type(e).__name__,
                            **context
                        )

        # All retries exhausted
        raise DatabaseError(
            f"{operation_name} failed after {retries} attempts: {str(last_error)}"
        )

    def _log_operation(self, operation_name: str, status: str, **context):
        """
        Log service operation with context.

        Args:
            operation_name: Name of operation
            status: success/failed/retry
            **context: Additional context (user_id, error, elapsed_ms, etc.)
        """
        log_data = {
            "service": self.__class__.__name__,
            "operation": operation_name,
            "status": status,
            **context
        }

        # Filter out None values
        log_data = {k: v for k, v in log_data.items() if v is not None}

        # Format message
        msg = f"[{self.__class__.__name__}] {operation_name}: {status}"
        if "error" in log_data:
            msg += f" - {log_data['error']}"

        # Log at appropriate level
        if status == "success":
            logger.info(msg, extra=log_data)
        elif status == "retry":
            logger.warning(msg, extra=log_data)
        else:
            logger.error(msg, extra=log_data)

        # Also print to console for development
        if current_app and current_app.debug:
            logger.info(f"[SERVICE] {msg}")

    def validate_required(self, **kwargs):
        """
        Validate that required fields are present and non-empty.

        Args:
            **kwargs: Field name -> value pairs to validate

        Raises:
            ValidationError: If any required field is missing or empty

        Example:
            self.validate_required(
                user_id=user_id,
                quest_id=quest_id,
                task_id=task_id
            )
        """
        missing = []
        for field, value in kwargs.items():
            if value is None or (isinstance(value, str) and not value.strip()):
                missing.append(field)

        if missing:
            raise ValidationError(f"Required fields missing or empty: {', '.join(missing)}")

    def validate_one_of(self, field_name: str, value: Any, allowed_values: list):
        """
        Validate that a value is one of the allowed values.

        Args:
            field_name: Name of field being validated
            value: Value to validate
            allowed_values: List of allowed values

        Raises:
            ValidationError: If value not in allowed_values
        """
        if value not in allowed_values:
            raise ValidationError(
                f"{field_name} must be one of {allowed_values}, got: {value}"
            )

    def get_or_404(self, table: str, id_value: str, id_field: str = "id") -> Dict:
        """
        Get a single record or raise NotFoundError.

        Args:
            table: Table name
            id_value: ID value to search for
            id_field: ID field name (default: "id")

        Returns:
            Record data as dictionary

        Raises:
            NotFoundError: If record not found
        """
        result = self.supabase.table(table).select("*").eq(id_field, id_value).execute()

        if not result.data or len(result.data) == 0:
            raise NotFoundError(f"{table} with {id_field}={id_value} not found")

        return result.data[0]

    def exists(self, table: str, id_value: str, id_field: str = "id") -> bool:
        """
        Check if a record exists.

        Args:
            table: Table name
            id_value: ID value to search for
            id_field: ID field name (default: "id")

        Returns:
            True if record exists, False otherwise
        """
        result = self.supabase.table(table).select("id").eq(id_field, id_value).execute()
        return result.data and len(result.data) > 0


def with_retry(retries: int = 3, retry_delay: float = 0.5):
    """
    Decorator for adding retry logic to service methods.

    Args:
        retries: Number of retry attempts
        retry_delay: Delay between retries in seconds

    Usage:
        @with_retry(retries=3, retry_delay=1.0)
        def my_method(self, arg1, arg2):
            # Method implementation
            pass
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(self, *args, **kwargs):
            if not isinstance(self, BaseService):
                # If not a BaseService instance, just call the function
                return func(self, *args, **kwargs)

            return self.execute(
                operation=lambda: func(self, *args, **kwargs),
                operation_name=func.__name__,
                retries=retries,
                retry_delay=retry_delay
            )
        return wrapper
    return decorator


def validate_input(**validators):
    """
    Decorator for validating method inputs.

    Args:
        **validators: Field name -> validation function pairs

    Usage:
        @validate_input(
            user_id=lambda x: x is not None,
            status=lambda x: x in ['active', 'inactive']
        )
        def update_status(self, user_id: str, status: str):
            pass
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(self, *args, **kwargs):
            # Get function signature to map args to kwargs
            import inspect
            sig = inspect.signature(func)
            bound_args = sig.bind(self, *args, **kwargs)
            bound_args.apply_defaults()

            # Validate each field
            for field_name, validator in validators.items():
                if field_name in bound_args.arguments:
                    value = bound_args.arguments[field_name]
                    if not validator(value):
                        raise ValidationError(f"Validation failed for {field_name}: {value}")

            return func(self, *args, **kwargs)
        return wrapper
    return decorator
