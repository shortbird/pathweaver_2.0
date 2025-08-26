# Code Organization Guide

## Overview
This guide explains the modular code organization implemented in the backend.

## Directory Structure

```
backend/
├── app.py                     # Main Flask application
├── config.py                  # Configuration settings
├── database.py                # Database connections
├── cache.py                   # Caching utilities
├── cors_config.py             # CORS configuration
│
├── middleware/
│   ├── __init__.py
│   ├── error_handler.py      # Centralized error handling
│   ├── rate_limiter.py       # Rate limiting middleware
│   └── security.py            # Security headers and middleware
│
├── routes/
│   ├── __init__.py
│   ├── auth.py               # Authentication routes
│   ├── quests.py             # Quest management routes
│   ├── admin.py              # Admin panel routes
│   ├── subscriptions.py      # Subscription routes
│   ├── community.py          # Community features
│   ├── portfolio.py          # Portfolio routes
│   │
│   └── users/                # Modularized user routes
│       ├── __init__.py       # Main blueprint aggregator
│       ├── profile.py        # User profile endpoints
│       ├── dashboard.py      # Dashboard data endpoints
│       ├── transcript.py     # Learning transcript endpoints
│       ├── completed_quests.py  # Completed quests endpoints
│       └── helpers.py        # Shared helper functions
│
└── utils/
    ├── __init__.py           # Main utils exports
    │
    ├── auth/                 # Authentication utilities
    │   ├── __init__.py
    │   ├── decorators.py     # @require_auth, @require_admin
    │   ├── token_utils.py    # Token verification/generation
    │   └── session.py        # Session management
    │
    ├── validation/           # Input validation
    │   ├── __init__.py
    │   ├── input_validation.py  # Validation functions
    │   ├── sanitization.py      # Input sanitization
    │   └── validators.py        # Field validators & schemas
    │
    ├── error_messages.py     # User-friendly error messages
    ├── retry_handler.py      # Retry logic for transient failures
    └── session_manager.py    # HTTP session management
```

## Module Organization

### 1. Routes Module Structure

#### Main Routes
Each major feature has its own route file:
- `auth.py` - Authentication (login, register, logout)
- `quests.py` - Quest CRUD operations
- `admin.py` - Admin panel functionality
- `subscriptions.py` - Stripe integration
- `community.py` - Social features
- `portfolio.py` - Public portfolios

#### Modularized User Routes
The large `users.py` file has been split into focused sub-modules:

```python
# routes/users/__init__.py
from flask import Blueprint
from .profile import profile_bp
from .dashboard import dashboard_bp
from .transcript import transcript_bp
from .completed_quests import completed_quests_bp

bp = Blueprint('users', __name__)
bp.register_blueprint(profile_bp)
bp.register_blueprint(dashboard_bp)
bp.register_blueprint(transcript_bp)
bp.register_blueprint(completed_quests_bp)
```

### 2. Utilities Organization

#### Authentication (`utils/auth/`)
```python
from utils.auth import (
    require_auth,      # Decorator for protected routes
    require_admin,     # Decorator for admin routes
    verify_token,      # Token verification
    generate_token,    # Token generation
    session_manager    # Session management
)
```

#### Validation (`utils/validation/`)
```python
from utils.validation import (
    validate_email,
    validate_password,
    validate_registration_data,
    sanitize_input,
    sanitize_html,
    ValidationSchema,
    EmailField,
    StringField
)
```

#### Error Handling
```python
from middleware.error_handler import (
    ValidationError,
    AuthenticationError,
    NotFoundError,
    ExternalServiceError
)

from utils.error_messages import (
    get_user_message,
    UserFriendlyError
)
```

#### Retry Logic
```python
from utils.retry_handler import (
    retry_database_operation,
    retry_api_call,
    RetryConfig
)
```

## Usage Examples

### Using Modular Routes

```python
# In app.py
from routes import users  # This imports the modularized blueprint

app.register_blueprint(users.bp, url_prefix='/api/users')
```

### Using Organized Utilities

```python
# Authentication
from utils.auth import require_auth

@bp.route('/protected')
@require_auth
def protected_route(user_id):
    return jsonify({'user_id': user_id})

# Validation
from utils.validation import validate_email, sanitize_input

email_valid, error = validate_email(user_input)
safe_input = sanitize_input(user_text)

# Error Handling
from middleware.error_handler import ValidationError

if not valid_data:
    raise ValidationError("Invalid input provided")
```

### Shared Helpers Pattern

```python
# routes/users/helpers.py
def calculate_user_xp(supabase, user_id):
    """Shared function used by multiple endpoints"""
    # Implementation
    pass

# routes/users/profile.py
from .helpers import calculate_user_xp

@profile_bp.route('/profile')
def get_profile(user_id):
    xp = calculate_user_xp(supabase, user_id)
    # Use shared function
```

## Benefits of This Organization

1. **Separation of Concerns**
   - Each module has a single, clear responsibility
   - Easy to locate and modify specific functionality

2. **Reusability**
   - Shared utilities can be imported anywhere
   - Common patterns are centralized

3. **Maintainability**
   - Smaller files are easier to understand
   - Changes are isolated to specific modules

4. **Testability**
   - Individual modules can be tested in isolation
   - Mock dependencies are easier to manage

5. **Scalability**
   - New features can be added as new modules
   - Existing modules can be extended without affecting others

## Migration Notes

### Backward Compatibility
The reorganization maintains backward compatibility:
- Old imports still work via the main `__init__.py` files
- Route URLs remain unchanged
- API contracts are preserved

### Future Improvements
1. Consider adding a service layer for complex business logic
2. Implement dependency injection for better testing
3. Add API versioning support
4. Create data access layer (repositories)

## Best Practices

1. **Keep modules focused** - Each file should have a single purpose
2. **Use descriptive names** - File and function names should be self-explanatory
3. **Share wisely** - Only extract to helpers what's truly shared
4. **Document complex logic** - Add docstrings to non-trivial functions
5. **Maintain consistency** - Follow the established patterns

## Testing Considerations

With the modular structure, testing becomes easier:

```python
# Test individual modules
from routes.users.profile import calculate_user_xp
from utils.validation import validate_email

def test_calculate_xp():
    # Test shared function directly
    pass

def test_email_validation():
    # Test validation in isolation
    pass
```

This organization makes the codebase more maintainable, scalable, and developer-friendly.