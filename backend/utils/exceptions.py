"""
Custom exception classes for Optio Platform
Provides standardized error handling across the application
"""
from utils.logger import get_logger

logger = get_logger(__name__)



class OpError(Exception):
    """Base exception for Optio Platform"""
    pass


class ValidationError(OpError):
    """Raised when input validation fails"""
    pass


class NotFoundError(OpError):
    """Raised when a requested resource is not found"""
    pass


class PermissionError(OpError):
    """Raised when user lacks permission for an operation"""
    pass


class AuthenticationError(OpError):
    """Raised when authentication fails or is required"""
    pass


class DatabaseError(OpError):
    """Raised when a database operation fails"""
    pass


class ServiceError(OpError):
    """Raised when a service operation fails"""
    pass


class RateLimitError(OpError):
    """Raised when rate limit is exceeded"""
    pass


class ConfigurationError(OpError):
    """Raised when configuration is invalid or missing"""
    pass
