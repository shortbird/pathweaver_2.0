"""User-friendly error message mapping"""

ERROR_MESSAGES = {
    # Authentication & Authorization
    'AUTHENTICATION_ERROR': 'Please log in to continue',
    'AUTHORIZATION_ERROR': 'You don\'t have permission to access this resource',
    'INVALID_TOKEN': 'Your session has expired. Please log in again',
    'TOKEN_EXPIRED': 'Your session has expired. Please log in again',
    
    # Validation Errors
    'VALIDATION_ERROR': 'Please check your input and try again',
    'INVALID_EMAIL': 'Please enter a valid email address',
    'INVALID_PASSWORD': 'Password must be at least 8 characters long',
    'PASSWORDS_DONT_MATCH': 'Passwords do not match',
    'REQUIRED_FIELD': 'This field is required',
    'INVALID_FORMAT': 'Invalid format. Please check your input',
    
    # Resource Errors
    'NOT_FOUND': 'The requested resource was not found',
    'QUEST_NOT_FOUND': 'Quest not found. It may have been deleted',
    'USER_NOT_FOUND': 'User not found',
    'SUBMISSION_NOT_FOUND': 'Submission not found',
    
    # Business Logic Errors
    'ALREADY_ENROLLED': 'You are already enrolled in this quest',
    'QUEST_FULL': 'This quest is full. Please try another quest',
    'SUBMISSION_CLOSED': 'Submissions are closed for this quest',
    'INSUFFICIENT_XP': 'You don\'t have enough XP for this action',
    'SUBSCRIPTION_REQUIRED': 'A subscription is required for this feature',
    
    # Payment Errors
    'PAYMENT_FAILED': 'Payment processing failed. Please check your payment details',
    'CARD_DECLINED': 'Your card was declined. Please try another payment method',
    'INVALID_PAYMENT_METHOD': 'Invalid payment method',
    
    # Rate Limiting
    'RATE_LIMIT_EXCEEDED': 'Too many requests. Please wait a moment and try again',
    
    # File Upload Errors
    'FILE_TOO_LARGE': 'File is too large. Maximum size is 10MB',
    'INVALID_FILE_TYPE': 'Invalid file type. Please upload a supported format',
    
    # External Service Errors
    'DATABASE_ERROR': 'We\'re having trouble accessing data. Please try again',
    'EXTERNAL_SERVICE_ERROR': 'A service is temporarily unavailable. Please try again later',
    'NETWORK_ERROR': 'Network error. Please check your connection and try again',
    
    # Generic Errors
    'INTERNAL_ERROR': 'Something went wrong. Please try again later',
    'CONFLICT': 'This action conflicts with existing data',
    'BAD_REQUEST': 'Invalid request. Please check your input'
}

def get_user_message(error_code, default_message=None):
    """Get user-friendly message for error code"""
    return ERROR_MESSAGES.get(error_code, default_message or 'An error occurred. Please try again')

def map_technical_error(technical_message):
    """Map technical error messages to user-friendly ones"""
    message_lower = technical_message.lower()
    
    # Database errors
    if 'duplicate' in message_lower or 'unique' in message_lower:
        return 'This item already exists'
    elif 'foreign key' in message_lower:
        return 'This action cannot be completed due to related data'
    elif 'constraint' in message_lower:
        return 'This action violates data rules'
    
    # Connection errors
    elif 'connection' in message_lower:
        return 'Connection error. Please check your internet and try again'
    elif 'timeout' in message_lower:
        return 'Request timed out. Please try again'
    
    # Permission errors
    elif 'permission' in message_lower or 'denied' in message_lower:
        return 'You don\'t have permission for this action'
    
    # Validation errors
    elif 'invalid' in message_lower:
        return 'Invalid input. Please check your data'
    elif 'required' in message_lower:
        return 'Required information is missing'
    
    # Default
    return 'An error occurred. Please try again'

class UserFriendlyError:
    """Helper class to create user-friendly errors"""
    
    @staticmethod
    def validation(field, message=None):
        """Create validation error with field context"""
        if message:
            return f"{field}: {message}"
        return f"Invalid {field}"
    
    @staticmethod
    def not_found(resource_type):
        """Create not found error for resource"""
        return f"{resource_type} not found"
    
    @staticmethod
    def permission(action=None):
        """Create permission error"""
        if action:
            return f"You don't have permission to {action}"
        return "You don't have permission for this action"
    
    @staticmethod
    def conflict(resource, reason=None):
        """Create conflict error"""
        if reason:
            return f"{resource} conflict: {reason}"
        return f"{resource} already exists"
    
    @staticmethod
    def rate_limit(retry_after=None):
        """Create rate limit error"""
        if retry_after:
            return f"Too many requests. Please wait {retry_after} seconds"
        return "Too many requests. Please wait and try again"