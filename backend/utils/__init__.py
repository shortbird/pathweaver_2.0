"""Backend utilities package with organized sub-modules"""

# Authentication utilities
from .auth.decorators import (
    require_auth,
    require_admin
)
from .auth.token_utils import (
    verify_token,
    generate_token
)
from .session_manager import session_manager

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

# FERPA compliance utilities
from .access_logger import (
    AccessLogger,
    log_student_access
)

# Legacy imports removed - auth_utils no longer exists

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
    'RetryableOperation',

    # FERPA compliance
    'AccessLogger',
    'log_student_access'
]