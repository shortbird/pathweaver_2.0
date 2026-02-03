# Backend Logging Standards

**Created**: December 2025 (P3-STYLE-3)
**Status**: Standardized (172+ print() statements replaced)

## Standard Logging Pattern

### Always Use Structured Logger

```python
# Correct pattern
from utils.logger import get_logger

logger = get_logger(__name__)

# Use logger methods
logger.debug("Debug message")
logger.info("Operation completed successfully")
logger.warning("Unusual condition detected")
logger.error("Operation failed", exc_info=True)
```

### DO NOT Use These Patterns

```python
# BAD - Raw logging module (no structured logging)
import logging
logger = logging.getLogger(__name__)

# BAD - Print statements (no log levels, no timestamps)
print("Debug info")
print(f"Error: {error}")

# BAD - Mixing both loggers (second assignment overrides first)
from utils.logger import get_logger
logger = get_logger(__name__)
logger = logging.getLogger(__name__)  # Overrides structured logger!
```

## Log Levels

Use appropriate log levels:

### DEBUG
- Detailed diagnostic information
- Variable values and state
- Function entry/exit points
- Only shown in development (LOG_LEVEL=DEBUG)

```python
logger.debug(f"Processing quest_id={quest_id} for user_id={user_id}")
logger.debug(f"Retrieved {len(tasks)} tasks from database")
```

### INFO
- General informational messages
- Successful operations
- Normal system behavior
- Business logic milestones

```python
logger.info(f"User {user_id} enrolled in quest {quest_id}")
logger.info(f"Quest completion workflow started for user {user_id}")
logger.info("Application startup complete")
```

### WARNING
- Unexpected but recoverable conditions
- Deprecated feature usage
- Configuration issues
- Performance concerns

```python
logger.warning(f"Quest {quest_id} has no tasks defined")
logger.warning(f"User {user_id} attempting to access disabled feature")
logger.warning("Database query took longer than expected: 5.2s")
```

### ERROR
- Error conditions that affect operation
- Failed operations
- Exception handling
- Data integrity issues

```python
logger.error(f"Failed to enroll user {user_id} in quest {quest_id}", exc_info=True)
logger.error("Database connection failed", exc_info=True)
logger.error(f"Invalid data format for user profile: {data}")
```

### CRITICAL
- System-wide failures
- Data loss scenarios
- Security breaches
- Service unavailability

```python
logger.critical("Database connection pool exhausted")
logger.critical("Authentication service unreachable")
```

## Structured Logging with Extra Fields

Use extra fields for structured data:

```python
logger.info_extra(
    "Quest enrollment successful",
    user_id=user_id,
    quest_id=quest_id,
    quest_type=quest_type,
    xp_value=xp_value
)

logger.error_extra(
    "Task completion failed",
    user_id=user_id,
    task_id=task_id,
    error=str(error),
    exc_info=True
)
```

## PII Scrubbing

Always scrub sensitive data before logging:

```python
from utils.log_scrubber import scrub_sensitive_data

# Scrub before logging
user_data = {"email": "user@example.com", "password": "secret123"}
logger.info(f"User data: {scrub_sensitive_data(user_data)}")
# Logs: User data: {"email": "u***@example.com", "password": "***"}
```

## Request Context

The structured logger automatically includes request context:
- HTTP method
- Request path
- Remote IP address
- User agent
- Correlation ID (if available)

```python
# No need to manually add request context
logger.info("User logged in")

# Automatically includes:
# {
#   "timestamp": "2025-12-21T10:30:00Z",
#   "level": "INFO",
#   "message": "User logged in",
#   "request": {
#     "method": "POST",
#     "path": "/api/auth/login",
#     "remote_addr": "192.168.1.1",
#     "user_agent": "Mozilla/5.0..."
#   },
#   "correlation_id": "abc-123-def"
# }
```

## Exception Logging

Always include stack traces for errors:

```python
try:
    result = dangerous_operation()
except Exception as e:
    # Include exc_info=True to log stack trace
    logger.error(f"Operation failed: {str(e)}", exc_info=True)
    raise
```

## Migration from Print Statements

### Before (Inconsistent)

```python
print(f"DEBUG: Processing user {user_id}")
print(f"ERROR: Quest not found: {quest_id}")
logging.info("Operation complete")
```

### After (Standardized)

```python
from utils.logger import get_logger

logger = get_logger(__name__)

logger.debug(f"Processing user {user_id}")
logger.error(f"Quest not found: {quest_id}")
logger.info("Operation complete")
```

## Configuration

Logging is configured in `app_config.py`:

```python
# Environment variables
LOG_LEVEL = 'DEBUG'  # Development
LOG_LEVEL = 'INFO'   # Production
LOG_FORMAT = 'text'  # Development (colored, human-readable)
LOG_FORMAT = 'json'  # Production (structured, machine-parseable)
```

## JSON Format Example (Production)

```json
{
  "timestamp": "2025-12-21T10:30:00Z",
  "level": "INFO",
  "logger": "services.quest_service",
  "message": "Quest enrollment successful",
  "module": "quest_service",
  "function": "enroll_user",
  "line": 45,
  "request": {
    "method": "POST",
    "path": "/api/quests/123/enroll",
    "remote_addr": "192.168.1.1",
    "user_agent": "Mozilla/5.0..."
  },
  "correlation_id": "abc-123-def",
  "extra_fields": {
    "user_id": "user-456",
    "quest_id": "quest-123",
    "xp_value": 100
  }
}
```

## Text Format Example (Development)

```
2025-12-21 10:30:00 INFO     [services.quest_service] Quest enrollment successful
```

## Common Patterns

### Service Layer

```python
from utils.logger import get_logger

logger = get_logger(__name__)

class QuestService:
    def enroll_user(self, user_id: str, quest_id: str) -> Dict[str, Any]:
        """Enroll user in quest."""
        logger.info_extra(
            "Starting quest enrollment",
            user_id=user_id,
            quest_id=quest_id
        )

        try:
            # Business logic here
            result = self.repository.enroll(user_id, quest_id)

            logger.info_extra(
                "Quest enrollment successful",
                user_id=user_id,
                quest_id=quest_id,
                xp_awarded=result['xp_value']
            )

            return result

        except Exception as e:
            logger.error_extra(
                "Quest enrollment failed",
                user_id=user_id,
                quest_id=quest_id,
                error=str(e),
                exc_info=True
            )
            raise
```

### Route Layer

```python
from utils.logger import get_logger
from flask import jsonify

logger = get_logger(__name__)

@app.route('/api/quests/<quest_id>/enroll', methods=['POST'])
def enroll_in_quest(quest_id: str):
    """Enroll current user in quest."""
    user_id = get_current_user_id()

    logger.info(f"Quest enrollment request received for quest_id={quest_id}")

    try:
        result = quest_service.enroll_user(user_id, quest_id)
        return jsonify(result), 200

    except ValidationError as e:
        logger.warning(f"Invalid quest enrollment request: {str(e)}")
        return jsonify({'error': str(e)}), 400

    except Exception as e:
        logger.error("Quest enrollment failed", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500
```

## Performance Considerations

### Use Lazy Formatting

```python
# Good - only formats if log level is enabled
logger.debug("User %s processed %d tasks", user_id, task_count)

# Avoid - always formats, even if DEBUG is disabled
logger.debug(f"User {user_id} processed {task_count} tasks")
```

### Avoid Expensive Operations in Logs

```python
# Bad - always computes even if not logged
logger.debug(f"All users: {fetch_all_users_from_db()}")

# Good - only compute if DEBUG is enabled
if logger.isEnabledFor(logging.DEBUG):
    logger.debug(f"All users: {fetch_all_users_from_db()}")
```

## Related Documents

- [Log Scrubbing Guide](LOG_SCRUBBING_GUIDE.md) - PII masking utilities
- [Exception Handling Guide](EXCEPTION_HANDLING_GUIDE.md) - Error handling patterns

## Enforcement

- All NEW code MUST use structured logger (`get_logger`)
- Code reviews check for print() statements and raw logging module usage
- Existing code: migrate opportunistically when touched for other work
