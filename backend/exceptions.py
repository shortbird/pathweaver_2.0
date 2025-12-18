"""
Custom exception hierarchy for Optio platform

This module defines all custom exceptions used throughout the application.
Using specific exceptions improves error handling, debugging, and error reporting.

Usage:
    from backend.exceptions import ValidationError, DatabaseError

    try:
        # ... operation
    except ValidationError as e:
        logger.error(f"Validation failed: {e}")
        return jsonify({'error': str(e)}), 400
    except DatabaseError as e:
        logger.error(f"Database error: {e}", exc_info=True)
        return jsonify({'error': 'Database operation failed'}), 500

See: COMPREHENSIVE_CODEBASE_REVIEW.md (P1-QUAL-1)
"""

from typing import Optional, Dict, Any


class OptioException(Exception):
    """
    Base exception for all Optio platform errors.

    All custom exceptions should inherit from this class.
    Allows catching all Optio-specific errors with a single except clause.
    """
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        self.message = message
        self.details = details or {}
        super().__init__(self.message)

    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary for JSON responses"""
        return {
            'error': self.__class__.__name__,
            'message': self.message,
            'details': self.details
        }


# ============================================================================
# Validation Errors
# ============================================================================

class ValidationError(OptioException):
    """
    Input validation failed.

    Use when user input doesn't meet requirements (missing fields, wrong format, etc.)
    HTTP Status: 400 Bad Request

    Example:
        if not email:
            raise ValidationError("Email is required")
        if len(password) < 12:
            raise ValidationError("Password must be at least 12 characters")
    """
    pass


class InvalidFieldError(ValidationError):
    """
    Specific field validation failed.

    Use when a particular field has invalid data.

    Example:
        raise InvalidFieldError("email", "Invalid email format")
    """
    def __init__(self, field_name: str, message: str):
        super().__init__(
            message=f"Invalid field '{field_name}': {message}",
            details={'field': field_name}
        )


class MissingFieldError(ValidationError):
    """
    Required field is missing from request.

    Example:
        if 'quest_id' not in data:
            raise MissingFieldError("quest_id")
    """
    def __init__(self, field_name: str):
        super().__init__(
            message=f"Required field '{field_name}' is missing",
            details={'field': field_name}
        )


# ============================================================================
# Authentication & Authorization Errors
# ============================================================================

class AuthenticationError(OptioException):
    """
    Authentication failed (invalid credentials, expired token, etc.)
    HTTP Status: 401 Unauthorized

    Example:
        if not verify_password(password, hashed):
            raise AuthenticationError("Invalid credentials")
    """
    pass


class AuthorizationError(OptioException):
    """
    User is authenticated but lacks permission for this action.
    HTTP Status: 403 Forbidden

    Example:
        if user.role != 'admin':
            raise AuthorizationError("Admin access required")
    """
    pass


class TokenExpiredError(AuthenticationError):
    """
    JWT or session token has expired.

    Example:
        if token_exp < now:
            raise TokenExpiredError("Session expired, please log in again")
    """
    pass


class InvalidTokenError(AuthenticationError):
    """
    JWT or session token is malformed or invalid.

    Example:
        try:
            jwt.decode(token, key)
        except jwt.InvalidTokenError:
            raise InvalidTokenError("Invalid authentication token")
    """
    pass


# ============================================================================
# Database Errors
# ============================================================================

class DatabaseError(OptioException):
    """
    Database operation failed.
    HTTP Status: 500 Internal Server Error

    Use for any database-related errors (query failures, connection issues, etc.)
    Always preserve original exception with 'from e' for debugging.

    Example:
        try:
            supabase.table('users').select('*').execute()
        except PostgrestAPIError as e:
            raise DatabaseError("Failed to retrieve users") from e
    """
    pass


class RecordNotFoundError(DatabaseError):
    """
    Database query returned no results when a record was expected.
    HTTP Status: 404 Not Found

    Example:
        result = supabase.table('quests').select('*').eq('id', quest_id).execute()
        if not result.data:
            raise RecordNotFoundError(f"Quest {quest_id} not found")
    """
    def __init__(self, resource_type: str, resource_id: str):
        super().__init__(
            message=f"{resource_type} with ID '{resource_id}' not found",
            details={'resource_type': resource_type, 'resource_id': resource_id}
        )


class DuplicateRecordError(DatabaseError):
    """
    Attempted to create a record that violates a unique constraint.
    HTTP Status: 409 Conflict

    Example:
        if email_exists:
            raise DuplicateRecordError("User", "email", email)
    """
    def __init__(self, resource_type: str, field_name: str, value: str):
        super().__init__(
            message=f"{resource_type} with {field_name}='{value}' already exists",
            details={'resource_type': resource_type, 'field': field_name, 'value': value}
        )


class IntegrityConstraintError(DatabaseError):
    """
    Database integrity constraint violated (foreign key, check constraint, etc.)
    HTTP Status: 400 Bad Request

    Example:
        try:
            supabase.table('tasks').delete().eq('id', task_id).execute()
        except ForeignKeyViolation:
            raise IntegrityConstraintError("Cannot delete task with existing completions")
    """
    pass


# ============================================================================
# Resource Errors
# ============================================================================

class ResourceNotFoundError(OptioException):
    """
    Requested resource does not exist.
    HTTP Status: 404 Not Found

    More general than RecordNotFoundError - use for any missing resource (file, endpoint, etc.)

    Example:
        if not os.path.exists(file_path):
            raise ResourceNotFoundError(f"File {filename} not found")
    """
    pass


class ResourceAlreadyExistsError(OptioException):
    """
    Resource already exists and cannot be created.
    HTTP Status: 409 Conflict

    Example:
        if quest_enrollment_exists:
            raise ResourceAlreadyExistsError("User is already enrolled in this quest")
    """
    pass


class ResourceStateError(OptioException):
    """
    Resource exists but is in wrong state for this operation.
    HTTP Status: 400 Bad Request

    Example:
        if quest.status == 'archived':
            raise ResourceStateError("Cannot enroll in archived quest")
    """
    pass


# ============================================================================
# Business Logic Errors
# ============================================================================

class BusinessLogicError(OptioException):
    """
    Business rule violation.
    HTTP Status: 400 Bad Request

    Use when operation violates business rules (not validation or permissions)

    Example:
        if user.age < 13 and not parental_consent:
            raise BusinessLogicError("Parental consent required for users under 13")
    """
    pass


class InsufficientXPError(BusinessLogicError):
    """
    User doesn't have enough XP for this operation.

    Example:
        if user.total_xp < badge.min_xp:
            raise InsufficientXPError(f"Badge requires {badge.min_xp} XP, you have {user.total_xp}")
    """
    pass


class QuestNotAvailableError(BusinessLogicError):
    """
    Quest exists but is not available to this user.

    Example:
        if quest.organization_id and quest.organization_id != user.organization_id:
            raise QuestNotAvailableError("This quest is only available to your organization")
    """
    pass


# ============================================================================
# External Service Errors
# ============================================================================

class ExternalServiceError(OptioException):
    """
    External service (API, integration) failed.
    HTTP Status: 502 Bad Gateway

    Use for errors from Gemini API, Supabase, Stripe, SendGrid, etc.

    Example:
        try:
            gemini.generate_content(prompt)
        except Exception as e:
            raise ExternalServiceError("Gemini API request failed") from e
    """
    pass


class EmailDeliveryError(ExternalServiceError):
    """
    Email failed to send.

    Example:
        if not email_sent:
            raise EmailDeliveryError(f"Failed to send email to {recipient}")
    """
    pass


class PaymentError(ExternalServiceError):
    """
    Payment processing failed.

    Example:
        try:
            stripe.charge.create(...)
        except stripe.error.CardError as e:
            raise PaymentError("Payment declined") from e
    """
    pass


class LMSIntegrationError(ExternalServiceError):
    """
    LMS integration (Spark) failed.

    Example:
        if spark_response.status_code != 200:
            raise LMSIntegrationError("Failed to sync assignment with LMS")
    """
    pass


# ============================================================================
# File & Upload Errors
# ============================================================================

class FileUploadError(OptioException):
    """
    File upload failed.
    HTTP Status: 400 Bad Request

    Example:
        if file.size > MAX_FILE_SIZE:
            raise FileUploadError("File exceeds maximum size of 10MB")
    """
    pass


class InvalidFileTypeError(FileUploadError):
    """
    Uploaded file type is not allowed.

    Example:
        if not file.mimetype.startswith('image/'):
            raise InvalidFileTypeError("Only image files are allowed")
    """
    pass


class FileTooLargeError(FileUploadError):
    """
    Uploaded file exceeds size limit.

    Example:
        if len(file_data) > MAX_SIZE:
            raise FileTooLargeError(f"File size {len(file_data)} exceeds limit of {MAX_SIZE}")
    """
    def __init__(self, file_size: int, max_size: int):
        super().__init__(
            message=f"File size ({file_size} bytes) exceeds maximum ({max_size} bytes)",
            details={'file_size': file_size, 'max_size': max_size}
        )


class VirusScanFailedError(FileUploadError):
    """
    File failed virus scan (security risk).

    Example:
        if virus_detected:
            raise VirusScanFailedError("Uploaded file contains malware")
    """
    pass


# ============================================================================
# Rate Limiting Errors
# ============================================================================

class RateLimitExceededError(OptioException):
    """
    User exceeded rate limit for this endpoint.
    HTTP Status: 429 Too Many Requests

    Example:
        if request_count > RATE_LIMIT:
            raise RateLimitExceededError("Rate limit exceeded. Try again in 60 seconds")
    """
    def __init__(self, message: str = "Rate limit exceeded", retry_after: int = 60):
        super().__init__(
            message=message,
            details={'retry_after': retry_after}
        )
        self.retry_after = retry_after


# ============================================================================
# Configuration Errors
# ============================================================================

class ConfigurationError(OptioException):
    """
    Application configuration is invalid or missing.
    HTTP Status: 500 Internal Server Error

    Use for missing environment variables, invalid config values, etc.

    Example:
        if not os.getenv('SUPABASE_URL'):
            raise ConfigurationError("SUPABASE_URL environment variable not set")
    """
    pass


# ============================================================================
# HTTP Status Code Mapping
# ============================================================================

HTTP_STATUS_CODES = {
    ValidationError: 400,
    InvalidFieldError: 400,
    MissingFieldError: 400,
    BusinessLogicError: 400,
    ResourceStateError: 400,
    IntegrityConstraintError: 400,
    FileUploadError: 400,
    InvalidFileTypeError: 400,
    FileTooLargeError: 400,
    VirusScanFailedError: 400,

    AuthenticationError: 401,
    TokenExpiredError: 401,
    InvalidTokenError: 401,

    AuthorizationError: 403,

    ResourceNotFoundError: 404,
    RecordNotFoundError: 404,

    ResourceAlreadyExistsError: 409,
    DuplicateRecordError: 409,

    RateLimitExceededError: 429,

    DatabaseError: 500,
    ExternalServiceError: 502,
    ConfigurationError: 500,
    OptioException: 500,  # Default for any uncategorized Optio error
}


def get_http_status(exception: Exception) -> int:
    """
    Get appropriate HTTP status code for an exception.

    Args:
        exception: The exception instance

    Returns:
        HTTP status code (400, 401, 403, 404, 409, 429, 500, 502)
    """
    for exc_class, status_code in HTTP_STATUS_CODES.items():
        if isinstance(exception, exc_class):
            return status_code
    return 500  # Default to internal server error


# ============================================================================
# Exception Handler Decorator
# ============================================================================

from functools import wraps
from flask import jsonify
import logging

logger = logging.getLogger(__name__)


def handle_optio_exceptions(f):
    """
    Decorator to automatically handle Optio exceptions and return proper JSON responses.

    Usage:
        @app.route('/api/endpoint')
        @handle_optio_exceptions
        def my_endpoint():
            if error:
                raise ValidationError("Invalid input")
            return jsonify({'success': True})

    This decorator will catch all OptioException instances and return:
    - Proper HTTP status code
    - JSON error response
    - Logged error details
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except OptioException as e:
            status_code = get_http_status(e)

            # Log error with appropriate level
            if status_code >= 500:
                logger.error(f"{e.__class__.__name__}: {e.message}", exc_info=True)
            elif status_code >= 400:
                logger.warning(f"{e.__class__.__name__}: {e.message}")

            return jsonify(e.to_dict()), status_code
        except Exception as e:
            # Catch-all for unexpected errors
            logger.error(f"Unexpected error: {e}", exc_info=True)
            return jsonify({
                'error': 'InternalServerError',
                'message': 'An unexpected error occurred'
            }), 500

    return decorated
