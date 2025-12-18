# Exception Handling Guide

**Created**: December 18, 2025
**Purpose**: Replace 499 generic `except Exception as e:` handlers with specific exceptions
**See**: P1-QUAL-1 in COMPREHENSIVE_CODEBASE_REVIEW.md

---

## Table of Contents

1. [Why Specific Exceptions?](#why-specific-exceptions)
2. [Exception Hierarchy](#exception-hierarchy)
3. [Migration Examples](#migration-examples)
4. [Common Patterns](#common-patterns)
5. [Exception Handler Decorator](#exception-handler-decorator)
6. [Testing Exceptions](#testing-exceptions)

---

## Why Specific Exceptions?

### Problems with Generic Exception Handling

```python
# ❌ BAD - Overly broad exception handler
try:
    users = supabase.table('users').select('*').execute()
    return jsonify({'users': users.data}), 200
except Exception as e:
    logger.error(f"Error getting users: {str(e)}")
    return jsonify({'error': 'Failed to retrieve users'}), 500
```

**Issues**:
- Database errors indistinguishable from validation errors
- Stack traces lost (no `exc_info=True`)
- All errors return 500 (not appropriate for validation failures)
- Difficult to debug (which line threw the exception?)
- Catches unexpected errors (typos, logic errors)

### Benefits of Specific Exceptions

```python
# ✅ GOOD - Specific exception handling
from backend.exceptions import DatabaseError, ValidationError

try:
    if not user_id:
        raise ValidationError("User ID is required")

    users = supabase.table('users').select('*').eq('id', user_id).execute()

    if not users.data:
        raise RecordNotFoundError("User", user_id)

    return jsonify({'users': users.data}), 200

except ValidationError as e:
    logger.warning(f"Validation error: {e}")
    return jsonify({'error': str(e)}), 400

except RecordNotFoundError as e:
    logger.info(f"User not found: {user_id}")
    return jsonify({'error': str(e)}), 404

except Exception as e:
    logger.error(f"Unexpected error getting users: {e}", exc_info=True)
    raise DatabaseError("Failed to retrieve users") from e
```

**Benefits**:
- Clear error types (validation vs database vs auth)
- Appropriate HTTP status codes (400 vs 404 vs 500)
- Stack traces preserved with `from e`
- Easier debugging (know exactly what failed)
- Better error messages for users

---

## Exception Hierarchy

```
OptioException (base)
├── ValidationError
│   ├── InvalidFieldError
│   └── MissingFieldError
├── AuthenticationError
│   ├── TokenExpiredError
│   └── InvalidTokenError
├── AuthorizationError
├── DatabaseError
│   ├── RecordNotFoundError
│   ├── DuplicateRecordError
│   └── IntegrityConstraintError
├── ResourceNotFoundError
├── ResourceAlreadyExistsError
├── ResourceStateError
├── BusinessLogicError
│   ├── InsufficientXPError
│   └── QuestNotAvailableError
├── ExternalServiceError
│   ├── EmailDeliveryError
│   ├── PaymentError
│   └── LMSIntegrationError
├── FileUploadError
│   ├── InvalidFileTypeError
│   ├── FileTooLargeError
│   └── VirusScanFailedError
├── RateLimitExceededError
└── ConfigurationError
```

See [backend/exceptions.py](../exceptions.py) for full documentation.

---

## Migration Examples

### Example 1: Database Query

#### Before (Generic)
```python
try:
    quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
except Exception as e:
    logger.error(f"Error getting quest: {e}")
    return jsonify({'error': 'Quest not found'}), 404
```

#### After (Specific)
```python
from backend.exceptions import DatabaseError, RecordNotFoundError

try:
    quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()

    if not quest.data:
        raise RecordNotFoundError("Quest", quest_id)

    return jsonify({'quest': quest.data}), 200

except RecordNotFoundError as e:
    logger.info(f"Quest not found: {quest_id}")
    return jsonify({'error': str(e)}), 404

except Exception as e:
    logger.error(f"Database error getting quest: {e}", exc_info=True)
    raise DatabaseError(f"Failed to retrieve quest {quest_id}") from e
```

---

### Example 2: Input Validation

#### Before (Generic)
```python
try:
    email = request.json.get('email')
    password = request.json.get('password')
    # ... validation logic
except Exception as e:
    return jsonify({'error': 'Invalid input'}), 400
```

#### After (Specific)
```python
from backend.exceptions import ValidationError, MissingFieldError

try:
    data = request.json

    if not data:
        raise ValidationError("Request body is required")

    if 'email' not in data:
        raise MissingFieldError("email")

    if 'password' not in data:
        raise MissingFieldError("password")

    email = data['email']
    password = data['password']

    if not email or '@' not in email:
        raise InvalidFieldError("email", "Invalid email format")

    if len(password) < 12:
        raise InvalidFieldError("password", "Password must be at least 12 characters")

    # ... proceed with login

except (ValidationError, MissingFieldError, InvalidFieldError) as e:
    logger.warning(f"Validation error: {e}")
    return jsonify({'error': str(e)}), 400
```

---

### Example 3: Authentication

#### Before (Generic)
```python
try:
    token = request.headers.get('Authorization')
    user = verify_token(token)
except Exception as e:
    return jsonify({'error': 'Unauthorized'}), 401
```

#### After (Specific)
```python
from backend.exceptions import AuthenticationError, TokenExpiredError, InvalidTokenError

try:
    token = request.headers.get('Authorization')

    if not token:
        raise AuthenticationError("Authorization header is required")

    try:
        user = verify_token(token)
    except jwt.ExpiredSignatureError:
        raise TokenExpiredError("Session expired, please log in again")
    except jwt.InvalidTokenError:
        raise InvalidTokenError("Invalid authentication token")

    # ... proceed with authenticated request

except AuthenticationError as e:
    logger.warning(f"Authentication failed: {e}")
    return jsonify({'error': str(e)}), 401
```

---

### Example 4: External Service (Gemini API)

#### Before (Generic)
```python
try:
    response = gemini.generate_content(prompt)
except Exception as e:
    logger.error(f"Gemini API error: {e}")
    return jsonify({'error': 'AI service unavailable'}), 500
```

#### After (Specific)
```python
from backend.exceptions import ExternalServiceError

try:
    response = gemini.generate_content(prompt)

    if not response or not response.text:
        raise ExternalServiceError("Gemini API returned empty response")

    return jsonify({'response': response.text}), 200

except google.api_core.exceptions.GoogleAPIError as e:
    logger.error(f"Gemini API error: {e}", exc_info=True)
    raise ExternalServiceError("AI service request failed") from e

except ExternalServiceError as e:
    logger.error(f"External service error: {e}")
    return jsonify({'error': 'AI service unavailable'}), 502
```

---

### Example 5: File Upload

#### Before (Generic)
```python
try:
    file = request.files['file']
    # ... upload logic
except Exception as e:
    return jsonify({'error': 'Upload failed'}), 400
```

#### After (Specific)
```python
from backend.exceptions import FileUploadError, InvalidFileTypeError, FileTooLargeError

try:
    if 'file' not in request.files:
        raise MissingFieldError("file")

    file = request.files['file']

    if not file.filename:
        raise FileUploadError("No file selected")

    # Validate file type
    allowed_types = ['image/jpeg', 'image/png', 'application/pdf']
    if file.mimetype not in allowed_types:
        raise InvalidFileTypeError(f"File type {file.mimetype} not allowed")

    # Validate file size
    MAX_SIZE = 10 * 1024 * 1024  # 10MB
    file.seek(0, 2)  # Seek to end
    file_size = file.tell()
    file.seek(0)  # Reset

    if file_size > MAX_SIZE:
        raise FileTooLargeError(file_size, MAX_SIZE)

    # ... proceed with upload

except (FileUploadError, InvalidFileTypeError, FileTooLargeError) as e:
    logger.warning(f"File upload error: {e}")
    return jsonify({'error': str(e)}), 400
```

---

## Common Patterns

### Pattern 1: Database Operations

```python
from backend.exceptions import DatabaseError, RecordNotFoundError

try:
    # Query database
    result = supabase.table('table_name').select('*').eq('id', resource_id).execute()

    # Check for not found
    if not result.data:
        raise RecordNotFoundError("ResourceType", resource_id)

    return result.data

except RecordNotFoundError:
    raise  # Re-raise, let caller handle

except Exception as e:
    logger.error(f"Database error: {e}", exc_info=True)
    raise DatabaseError("Failed to query database") from e
```

### Pattern 2: Input Validation

```python
from backend.exceptions import ValidationError, MissingFieldError, InvalidFieldError

def validate_quest_data(data: dict):
    """Validate quest creation data"""
    required_fields = ['title', 'description', 'quest_type']

    for field in required_fields:
        if field not in data or not data[field]:
            raise MissingFieldError(field)

    if data['quest_type'] not in ['optio', 'course']:
        raise InvalidFieldError('quest_type', "Must be 'optio' or 'course'")

    if len(data['title']) < 5:
        raise InvalidFieldError('title', "Title must be at least 5 characters")

    return True
```

### Pattern 3: Business Logic

```python
from backend.exceptions import BusinessLogicError, InsufficientXPError

def claim_badge(user_id: str, badge_id: str):
    """Claim a badge if user meets requirements"""
    user = get_user(user_id)
    badge = get_badge(badge_id)

    # Check XP requirement
    if user.total_xp < badge.min_xp:
        raise InsufficientXPError(
            f"Badge requires {badge.min_xp} XP, you have {user.total_xp} XP"
        )

    # Check quest completion requirement
    if user.completed_quests < badge.min_quests:
        raise BusinessLogicError(
            f"Badge requires {badge.min_quests} completed quests"
        )

    # Award badge
    award_badge(user_id, badge_id)
```

---

## Exception Handler Decorator

For cleaner code, use the `@handle_optio_exceptions` decorator:

### Without Decorator (Verbose)

```python
@app.route('/api/quests/<quest_id>')
@require_auth
def get_quest(quest_id: str):
    try:
        if not quest_id:
            raise ValidationError("Quest ID is required")

        quest = quest_service.get_quest(quest_id)
        return jsonify({'quest': quest}), 200

    except ValidationError as e:
        logger.warning(f"Validation error: {e}")
        return jsonify({'error': str(e)}), 400

    except RecordNotFoundError as e:
        logger.info(f"Quest not found: {quest_id}")
        return jsonify({'error': str(e)}), 404

    except DatabaseError as e:
        logger.error(f"Database error: {e}", exc_info=True)
        return jsonify({'error': 'Database error'}), 500

    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500
```

### With Decorator (Clean)

```python
from backend.exceptions import handle_optio_exceptions, ValidationError, RecordNotFoundError

@app.route('/api/quests/<quest_id>')
@require_auth
@handle_optio_exceptions
def get_quest(quest_id: str):
    """Decorator handles all exception-to-response conversion"""
    if not quest_id:
        raise ValidationError("Quest ID is required")

    quest = quest_service.get_quest(quest_id)  # May raise RecordNotFoundError
    return jsonify({'quest': quest}), 200
```

The decorator automatically:
- Catches all `OptioException` instances
- Returns proper HTTP status codes
- Logs errors at appropriate levels
- Returns JSON error responses
- Preserves stack traces

---

## Testing Exceptions

### Unit Test Example

```python
import pytest
from backend.exceptions import ValidationError, RecordNotFoundError

def test_get_quest_not_found():
    """Test that RecordNotFoundError is raised for invalid quest ID"""
    with pytest.raises(RecordNotFoundError) as exc_info:
        quest_service.get_quest('invalid-id')

    assert 'Quest' in str(exc_info.value)
    assert 'invalid-id' in str(exc_info.value)

def test_validation_error_message():
    """Test that ValidationError has correct message"""
    error = ValidationError("Email is required")
    assert error.message == "Email is required"
    assert error.to_dict() == {
        'error': 'ValidationError',
        'message': 'Email is required',
        'details': {}
    }
```

---

## Migration Checklist

When migrating an endpoint from generic to specific exceptions:

- [ ] Identify all `try/except Exception as e:` blocks
- [ ] Determine what can actually go wrong (validation, DB, auth, etc.)
- [ ] Import appropriate exceptions from `backend.exceptions`
- [ ] Raise specific exceptions instead of generic ones
- [ ] Catch specific exceptions (narrowest first, broadest last)
- [ ] Add `exc_info=True` to error logs for stack traces
- [ ] Use `from e` when re-raising to preserve context
- [ ] Return appropriate HTTP status codes (400, 401, 404, 500, etc.)
- [ ] Test error paths with unit tests
- [ ] Consider using `@handle_optio_exceptions` decorator

---

## Best Practices

1. **Always preserve exception context** with `from e`:
   ```python
   except DatabaseError as e:
       raise CustomError("Operation failed") from e  # Preserves stack trace
   ```

2. **Log at appropriate levels**:
   - `logger.error()` for 500 errors (server fault)
   - `logger.warning()` for 400 errors (client fault)
   - `logger.info()` for expected errors (404 not found)

3. **Include context in exception messages**:
   ```python
   raise RecordNotFoundError("Quest", quest_id)  # Good
   raise RecordNotFoundError("Not found")        # Bad
   ```

4. **Don't catch exceptions you can't handle**:
   ```python
   # Bad - swallows all errors
   try:
       risky_operation()
   except Exception:
       pass

   # Good - only catch what you can handle
   try:
       risky_operation()
   except ValidationError as e:
       return error_response(e)
   # Let other exceptions propagate
   ```

5. **Use specific exceptions for specific errors**:
   ```python
   # Bad - too generic
   raise Exception("User not found")

   # Good - specific exception
   raise RecordNotFoundError("User", user_id)
   ```

---

## Quick Reference

| Situation | Exception | HTTP Status |
|-----------|-----------|-------------|
| Missing request field | `MissingFieldError` | 400 |
| Invalid field format | `InvalidFieldError` | 400 |
| General validation failure | `ValidationError` | 400 |
| Invalid credentials | `AuthenticationError` | 401 |
| Expired token | `TokenExpiredError` | 401 |
| Insufficient permissions | `AuthorizationError` | 403 |
| Resource not found | `RecordNotFoundError` | 404 |
| Resource already exists | `DuplicateRecordError` | 409 |
| Rate limit exceeded | `RateLimitExceededError` | 429 |
| Database query failed | `DatabaseError` | 500 |
| External API failed | `ExternalServiceError` | 502 |
| Invalid file type | `InvalidFileTypeError` | 400 |
| File too large | `FileTooLargeError` | 400 |
| Business rule violation | `BusinessLogicError` | 400 |

---

## Next Steps

1. **This Week**: Migrate 5 high-traffic endpoints (auth, quests, tasks)
2. **This Month**: Migrate all admin endpoints
3. **This Quarter**: Migrate all 499 generic exception handlers

**Goal**: Zero `except Exception as e:` without specific handling

**Status**: P1-QUAL-1 implementation in progress

---

**Last Updated**: December 18, 2025
**See Also**: [backend/exceptions.py](../exceptions.py)
