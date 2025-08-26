"""Backend utilities package with organized sub-modules"""

# Authentication utilities
from .auth import (
    require_auth,
    require_admin,
    verify_token,
    generate_token,
    session_manager
)

# Validation utilities  
from .validation import (
    validate_email,
    validate_password,
    validate_registration_data,
    validate_quest_data,
    sanitize_input,
    sanitize_html
)

# Error handling utilities
from .error_messages import (
    get_user_message,
    map_technical_error,
    UserFriendlyError
)

# Retry utilities
from .retry_handler import (
    retry_on_exception,
    retry_database_operation,
    retry_api_call,
    RetryConfig,
    RetryableOperation
)

# Legacy imports for backward compatibility
# These will be deprecated in future versions
from .auth_utils import require_auth as legacy_require_auth
from .validation import sanitize_input as legacy_sanitize_input

__all__ = [
    # Auth
    'require_auth',
    'require_admin', 
    'verify_token',
    'generate_token',
    'session_manager',
    
    # Validation
    'validate_email',
    'validate_password',
    'validate_registration_data',
    'validate_quest_data',
    'sanitize_input',
    'sanitize_html',
    
    # Error handling
    'get_user_message',
    'map_technical_error',
    'UserFriendlyError',
    
    # Retry
    'retry_on_exception',
    'retry_database_operation',
    'retry_api_call',
    'RetryConfig',
    'RetryableOperation'
]