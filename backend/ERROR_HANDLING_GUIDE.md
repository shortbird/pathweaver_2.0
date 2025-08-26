# Error Handling Guide

## Overview
This guide explains the centralized error handling system implemented in the backend.

## Components

### 1. Error Middleware (`middleware/error_handler.py`)
The core error handling system that provides:
- Centralized error catching and formatting
- Structured error logging
- User-friendly error messages
- Request tracking with unique IDs

### 2. Custom Error Classes

#### Base Error Class
```python
from middleware.error_handler import AppError

# Base error with custom status code
raise AppError("Something went wrong", status_code=500)
```

#### Specific Error Types
```python
from middleware.error_handler import (
    ValidationError,
    AuthenticationError, 
    AuthorizationError,
    NotFoundError,
    ConflictError,
    ExternalServiceError,
    RateLimitError
)

# Validation error (400)
raise ValidationError("Email is required")

# Authentication error (401)
raise AuthenticationError("Please log in")

# Authorization error (403)
raise AuthorizationError("Admin access required")

# Not found error (404)
raise NotFoundError("Quest", quest_id)

# Conflict error (409)
raise ConflictError("Email already registered")

# External service error (503)
raise ExternalServiceError("Stripe", "Payment service unavailable")

# Rate limit error (429)
raise RateLimitError("Too many requests", retry_after=60)
```

### 3. Error Response Format
All errors return a consistent JSON structure:
```json
{
    "error": {
        "message": "User-friendly error message",
        "code": "ERROR_CODE",
        "timestamp": "2025-08-26T10:30:00Z",
        "request_id": "uuid-here",
        "details": {}  // Optional additional context
    }
}
```

### 4. User-Friendly Messages (`utils/error_messages.py`)
Maps technical errors to user-friendly messages:
```python
from utils.error_messages import get_user_message, UserFriendlyError

# Get friendly message for error code
message = get_user_message('AUTHENTICATION_ERROR')

# Create context-aware messages
error = UserFriendlyError.validation('email', 'Invalid format')
error = UserFriendlyError.not_found('Quest')
error = UserFriendlyError.permission('delete posts')
```

### 5. Retry Logic (`utils/retry_handler.py`)
Handles transient failures automatically:

#### Using Decorators
```python
from utils.retry_handler import retry_database_operation, retry_api_call

@retry_database_operation
def fetch_user_data():
    # Database operation that may fail transiently
    return supabase.table('users').select('*').execute()

@retry_api_call
def call_stripe_api():
    # External API call with automatic retry
    return stripe.Customer.create(...)
```

#### Custom Retry Configuration
```python
from utils.retry_handler import retry_on_exception, RetryConfig

# Custom retry configuration
@retry_on_exception(RetryConfig(
    max_attempts=5,
    initial_delay=2.0,
    max_delay=30.0
))
def critical_operation():
    # Operation with custom retry settings
    pass
```

## Implementation Examples

### Route Error Handling
```python
from middleware.error_handler import ValidationError, NotFoundError
from utils.retry_handler import retry_database_operation

@bp.route('/api/resource/<id>')
def get_resource(id):
    # Input validation
    if not id:
        raise ValidationError("Resource ID is required")
    
    # Database operation with retry
    @retry_database_operation
    def fetch():
        return supabase.table('resources').select('*').eq('id', id).execute()
    
    result = fetch()
    
    if not result.data:
        raise NotFoundError("Resource", id)
    
    return jsonify(result.data[0]), 200
```

### Handling External Services
```python
from middleware.error_handler import ExternalServiceError

try:
    # Stripe operation
    customer = stripe.Customer.create(...)
except stripe.error.StripeError as e:
    raise ExternalServiceError('Stripe', 'Payment processing failed', e)
```

## Error Logging

Errors are logged with structured context:
- Request method, path, IP
- User ID (if authenticated)
- Error type and code
- Timestamp
- Stack trace (for 500+ errors)

Log levels:
- WARNING: Client errors (400-499)
- ERROR: Server errors (500+)

## Testing Error Handling

### Manual Testing
1. Invalid input: Send malformed JSON or missing required fields
2. Authentication: Access protected routes without token
3. Not found: Request non-existent resources
4. Rate limiting: Exceed request limits
5. Service failures: Simulate database/external service errors

### Automated Testing
```python
def test_validation_error(client):
    response = client.post('/api/register', json={})
    assert response.status_code == 400
    assert 'error' in response.json
    assert response.json['error']['code'] == 'VALIDATION_ERROR'
```

## Best Practices

1. **Use specific error classes** instead of generic exceptions
2. **Include context** in error details when helpful
3. **Log errors appropriately** based on severity
4. **Use retry decorators** for transient failures
5. **Keep error messages user-friendly** and actionable
6. **Test error scenarios** thoroughly

## Migration Checklist

When updating existing routes:
1. Replace `return jsonify({'error': '...'}), status_code` with appropriate error class
2. Add retry decorators to database/API operations
3. Use ValidationError for input validation failures
4. Use NotFoundError when resources don't exist
5. Use ExternalServiceError for third-party service failures