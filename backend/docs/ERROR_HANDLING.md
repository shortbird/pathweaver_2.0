# Error Handling Guide

Standardized error handling patterns for Optio Platform API endpoints.

## Quick Start

```python
from utils.route_decorators import api_endpoint
from utils.exceptions import ValidationError, NotFoundError
from utils.auth.decorators import require_auth

@bp.route('/quests/<quest_id>', methods=['GET'])
@require_auth
@api_endpoint  # Add this decorator for automatic error handling
def get_quest(user_id, quest_id):
    # Just write business logic - errors are handled automatically
    quest = quest_service.get_quest(quest_id)
    return quest  # Automatically wrapped in {success: true, data: ...}
```

## The @api_endpoint Decorator

The `@api_endpoint` decorator provides:
1. **Automatic success wrapping**: Returns `{success: true, data: result}`
2. **Standard error format**: Returns `{success: false, error: message, error_type: type}`
3. **Appropriate HTTP status codes**: 400, 401, 403, 404, 500
4. **Automatic logging**: Logs all errors with context
5. **Consistent API contract**: Clients can always expect the same response format

### Decorator Order

Always put `@api_endpoint` **last** (closest to function):

```python
@bp.route('/endpoint', methods=['POST'])
@require_auth           # 1st: Route
@require_paid_tier      # 2nd: Auth/permissions
@api_endpoint           # 3rd: Error handling (LAST)
def my_endpoint(user_id):
    pass
```

## Exception Types

### ValidationError (400 Bad Request)
Use when input data is invalid:

```python
from utils.exceptions import ValidationError

def create_quest(data):
    if not data.get('title'):
        raise ValidationError("Quest title is required")

    if len(data['title']) < 3:
        raise ValidationError("Quest title must be at least 3 characters")

    # @api_endpoint will catch this and return:
    # {
    #   "success": false,
    #   "error": "Quest title is required",
    #   "error_type": "validation_error"
    # }
    # Status: 400
```

### AuthenticationError (401 Unauthorized)
Use when authentication fails or is missing:

```python
from utils.exceptions import AuthenticationError

def check_auth(token):
    if not token:
        raise AuthenticationError("Authentication token required")

    if not is_valid_token(token):
        raise AuthenticationError("Invalid or expired token")

    # @api_endpoint will catch this and return:
    # {
    #   "success": false,
    #   "error": "Authentication required",
    #   "error_type": "authentication_error"
    # }
    # Status: 401
```

### PermissionError (403 Forbidden)
Use when user lacks permission:

```python
from utils.exceptions import PermissionError

def delete_quest(user_id, quest_id):
    quest = get_quest(quest_id)

    if quest['owner_id'] != user_id:
        raise PermissionError("Only quest owner can delete quest")

    # @api_endpoint will catch this and return:
    # {
    #   "success": false,
    #   "error": "Insufficient permissions",
    #   "error_type": "permission_error"
    # }
    # Status: 403
```

### NotFoundError (404 Not Found)
Use when requested resource doesn't exist:

```python
from utils.exceptions import NotFoundError

def get_quest(quest_id):
    quest = database.query(quest_id)

    if not quest:
        raise NotFoundError(f"Quest {quest_id} not found")

    # @api_endpoint will catch this and return:
    # {
    #   "success": false,
    #   "error": "Quest abc123 not found",
    #   "error_type": "not_found_error"
    # }
    # Status: 404
```

### Generic Exception (500 Internal Server Error)
Catch-all for unexpected errors:

```python
def process_quest(quest_id):
    # Any uncaught exception is caught by @api_endpoint
    result = risky_operation()  # If this throws, returns 500

    # @api_endpoint will catch it and return:
    # {
    #   "success": false,
    #   "error": "An unexpected error occurred",
    #   "error_type": "internal_error"
    # }
    # Status: 500
```

## Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    "id": "123",
    "title": "Learn Python",
    "xp": 100
  }
}
```
**Status Code**: 200

### Error Response
```json
{
  "success": false,
  "error": "Quest title is required",
  "error_type": "validation_error"
}
```
**Status Code**: 400, 401, 403, 404, or 500

## Complete Example

```python
from flask import Blueprint, request
from utils.route_decorators import api_endpoint
from utils.auth.decorators import require_auth
from utils.exceptions import ValidationError, NotFoundError
from utils.logger import get_logger

bp = Blueprint('quests', __name__)
logger = get_logger(__name__)


@bp.route('/quests', methods=['POST'])
@require_auth
@api_endpoint
def create_quest(user_id):
    """
    Create a new quest

    Request Body:
    {
      "title": "Learn Python",
      "description": "Complete Python tutorial",
      "tasks": [...]
    }

    Success Response (200):
    {
      "success": true,
      "data": {
        "id": "123",
        "title": "Learn Python",
        ...
      }
    }

    Error Response (400):
    {
      "success": false,
      "error": "Quest title is required",
      "error_type": "validation_error"
    }
    """
    data = request.get_json()

    # Validation - raise errors directly
    if not data:
        raise ValidationError("Request body is required")

    if not data.get('title'):
        raise ValidationError("Quest title is required")

    if len(data['title']) < 3:
        raise ValidationError("Quest title must be at least 3 characters")

    if len(data['title']) > 200:
        raise ValidationError("Quest title must be at most 200 characters")

    # Business logic
    logger.info_extra("Creating quest", user_id=user_id, title=data['title'])

    quest = quest_service.create_quest(user_id, data)

    logger.info_extra("Quest created successfully",
                     user_id=user_id,
                     quest_id=quest['id'])

    return quest  # Auto-wrapped in {success: true, data: quest}


@bp.route('/quests/<quest_id>', methods=['GET'])
@require_auth
@api_endpoint
def get_quest(user_id, quest_id):
    """Get quest by ID"""
    quest = quest_service.get_quest(quest_id)

    if not quest:
        raise NotFoundError(f"Quest {quest_id} not found")

    return quest


@bp.route('/quests/<quest_id>', methods=['PUT'])
@require_auth
@api_endpoint
def update_quest(user_id, quest_id):
    """Update quest"""
    data = request.get_json()

    quest = quest_service.get_quest(quest_id)
    if not quest:
        raise NotFoundError(f"Quest {quest_id} not found")

    # Permission check
    if quest['owner_id'] != user_id:
        raise PermissionError("Only quest owner can update quest")

    # Validation
    if 'title' in data and len(data['title']) < 3:
        raise ValidationError("Quest title must be at least 3 characters")

    updated_quest = quest_service.update_quest(quest_id, data)
    return updated_quest


@bp.route('/quests/<quest_id>', methods=['DELETE'])
@require_auth
@api_endpoint
def delete_quest(user_id, quest_id):
    """Delete quest"""
    quest = quest_service.get_quest(quest_id)

    if not quest:
        raise NotFoundError(f"Quest {quest_id} not found")

    if quest['owner_id'] != user_id:
        raise PermissionError("Only quest owner can delete quest")

    quest_service.delete_quest(quest_id)

    return {'message': 'Quest deleted successfully'}
```

## Service Layer Errors

Services should raise exceptions, not return error dictionaries:

```python
# BEFORE (BAD)
class QuestService:
    def get_quest(self, quest_id):
        quest = self.db.query(quest_id)
        if not quest:
            return {'error': 'Quest not found'}  # BAD
        return quest

# AFTER (GOOD)
from utils.exceptions import NotFoundError

class QuestService:
    def get_quest(self, quest_id):
        quest = self.db.query(quest_id)
        if not quest:
            raise NotFoundError(f"Quest {quest_id} not found")  # GOOD
        return quest
```

## When NOT to Use @api_endpoint

### Streaming Responses
```python
@bp.route('/stream')
def stream_data():
    # Don't use @api_endpoint for streaming
    def generate():
        for item in items:
            yield json.dumps(item) + '\n'
    return Response(generate(), mimetype='application/x-ndjson')
```

### File Downloads
```python
@bp.route('/download/<file_id>')
@require_auth
def download_file(user_id, file_id):
    # Don't use @api_endpoint for file downloads
    return send_file(file_path, as_attachment=True)
```

### Custom Response Format
```python
@bp.route('/legacy-api')
def legacy_endpoint():
    # Don't use @api_endpoint if you need custom format
    return {'status': 'ok', 'result': data}  # Different format
```

## Error Logging

All errors are automatically logged with appropriate severity:

- **ValidationError**: `logger.warning()` - User input issue
- **AuthenticationError**: `logger.warning()` - Auth failure
- **PermissionError**: `logger.warning()` - Permission denied
- **NotFoundError**: `logger.info()` - Resource not found (normal)
- **Exception**: `logger.error()` with `exc_info=True` - Unexpected error

## Frontend Integration

```typescript
// TypeScript example
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  error_type?: string;
}

async function createQuest(questData: QuestInput): Promise<Quest> {
  const response = await fetch('/api/quests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(questData),
    credentials: 'include',
  });

  const result: ApiResponse<Quest> = await response.json();

  if (!result.success) {
    // Handle error based on type
    switch (result.error_type) {
      case 'validation_error':
        throw new ValidationError(result.error);
      case 'authentication_error':
        redirectToLogin();
        break;
      case 'permission_error':
        showPermissionDenied();
        break;
      case 'not_found_error':
        show404();
        break;
      default:
        showGenericError();
    }
  }

  return result.data!;
}
```

## Testing

```python
def test_create_quest_validation(client):
    """Test validation error response"""
    response = client.post('/api/quests', json={})

    assert response.status_code == 400
    data = response.get_json()
    assert data['success'] is False
    assert 'title' in data['error'].lower()
    assert data['error_type'] == 'validation_error'


def test_get_quest_not_found(client):
    """Test not found error response"""
    response = client.get('/api/quests/nonexistent')

    assert response.status_code == 404
    data = response.get_json()
    assert data['success'] is False
    assert 'not found' in data['error'].lower()
    assert data['error_type'] == 'not_found_error'


def test_create_quest_success(client):
    """Test success response"""
    response = client.post('/api/quests', json={
        'title': 'Learn Python',
        'description': 'Complete tutorial'
    })

    assert response.status_code == 200
    data = response.get_json()
    assert data['success'] is True
    assert 'data' in data
    assert data['data']['title'] == 'Learn Python'
```

## Migration Checklist

When adding `@api_endpoint` to existing routes:

1. **Add the decorator** (last in chain)
2. **Replace manual error responses** with exceptions
3. **Remove try/except blocks** (unless you need custom handling)
4. **Let simple returns be auto-wrapped** (remove manual jsonify for success)
5. **Test all error paths** (validation, auth, permissions, not found)
6. **Update API documentation** if needed

## Additional Resources

- [utils/route_decorators.py](../utils/route_decorators.py) - Decorator implementation
- [utils/exceptions.py](../utils/exceptions.py) - Exception definitions
- [LOGGING_GUIDE.md](LOGGING_GUIDE.md) - Logging best practices
