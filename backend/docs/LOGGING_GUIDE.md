# Logging Best Practices Guide

Guide to using structured logging in the Optio Platform backend.

## Quick Start

```python
from utils.logger import get_logger

logger = get_logger(__name__)

# Basic logging
logger.info("User logged in successfully")
logger.error("Failed to process request")

# Logging with extra fields (structured data)
logger.info_extra("Quest completed",
                  user_id=user_id,
                  quest_id=quest_id,
                  xp_earned=100)
```

## Log Levels

Use appropriate log levels for different situations:

### DEBUG
Use for detailed diagnostic information useful during development.

```python
logger.debug(f"Processing quest {quest_id} for user {user_id}")
logger.debug_extra("Database query executed",
                   query="SELECT * FROM quests",
                   duration_ms=45)
```

**When to use:**
- Detailed step-by-step execution flow
- Variable values during processing
- Database query details
- Internal state inspection

### INFO
Use for general informational messages about normal application behavior.

```python
logger.info("Quest completed successfully")
logger.info_extra("User registration",
                  user_id=user_id,
                  email=email)
```

**When to use:**
- Successful operations
- User actions (login, logout, quest completion)
- System state changes
- API requests/responses

### WARNING
Use for potentially harmful situations that don't prevent operation.

```python
logger.warning("Deprecated API endpoint called")
logger.warning_extra("Slow database query detected",
                     query="SELECT * FROM large_table",
                     duration_ms=3000)
```

**When to use:**
- Deprecated feature usage
- Slow operations (but not failures)
- Unusual but handled conditions
- Resource usage warnings

### ERROR
Use for error events that might still allow the application to continue.

```python
logger.error("Failed to send email notification")
logger.error_extra("Database query failed",
                   error=str(e),
                   query="UPDATE users SET ...",
                   user_id=user_id)
```

**When to use:**
- Caught exceptions
- Failed operations that are handled
- External service failures
- Data validation failures

### CRITICAL
Use for very severe error events that may cause application shutdown.

```python
logger.critical("Database connection pool exhausted")
logger.critical("Failed to initialize Supabase client", exc_info=True)
```

**When to use:**
- System-wide failures
- Configuration errors preventing startup
- Critical resource exhaustion
- Security breaches

## Structured Logging with Extra Fields

Always prefer structured logging over string interpolation:

```python
# BAD - Unstructured
logger.info(f"User {user_id} completed quest {quest_id} earning {xp} XP")

# GOOD - Structured
logger.info_extra("Quest completed",
                  user_id=user_id,
                  quest_id=quest_id,
                  xp_earned=xp)
```

**Benefits:**
- Searchable in log aggregation tools
- Enables filtering and alerting
- Machine-parseable
- Consistent format

## Common Patterns

### Service Operations

```python
from utils.logger import get_logger

logger = get_logger(__name__)

class QuestService:
    def complete_quest(self, user_id: str, quest_id: str):
        logger.info_extra("Starting quest completion",
                         user_id=user_id,
                         quest_id=quest_id)

        try:
            # ... operation logic ...
            logger.info_extra("Quest completed successfully",
                             user_id=user_id,
                             quest_id=quest_id,
                             xp_earned=xp)
            return result
        except Exception as e:
            logger.error_extra("Quest completion failed",
                              user_id=user_id,
                              quest_id=quest_id,
                              error=str(e))
            raise
```

### API Endpoints

```python
from utils.logger import get_logger
from utils.route_decorators import api_endpoint

logger = get_logger(__name__)

@bp.route('/quests/<quest_id>/complete', methods=['POST'])
@require_auth
@api_endpoint
def complete_quest(user_id, quest_id):
    """
    @api_endpoint automatically logs errors and formats responses
    Just focus on business logic
    """
    logger.info_extra("Quest completion requested",
                     user_id=user_id,
                     quest_id=quest_id)

    result = quest_service.complete(user_id, quest_id)
    return result  # Auto-wrapped in success response
```

### Exception Logging

```python
# Always include exc_info=True for exceptions
try:
    risky_operation()
except Exception as e:
    logger.error("Operation failed", exc_info=True)
    # exc_info=True includes full stack trace
```

### Performance Logging

```python
import time

start_time = time.time()
result = slow_operation()
elapsed = time.time() - start_time

logger.info_extra("Operation completed",
                  operation="slow_operation",
                  duration_ms=int(elapsed * 1000),
                  result_count=len(result))
```

## Correlation IDs

All requests automatically get a correlation ID for tracking:

```python
# Correlation ID is automatically added to logs within request context
# Access it manually if needed:
from flask import request

correlation_id = getattr(request, 'correlation_id', None)
logger.info_extra("Processing batch operation",
                  correlation_id=correlation_id,
                  batch_size=100)
```

## Log Format

The log format is configurable via `LOG_FORMAT` environment variable:

### JSON Format (Production)
```bash
LOG_FORMAT=json
```

Output:
```json
{
  "timestamp": "2025-01-23T12:00:00Z",
  "level": "INFO",
  "logger": "routes.quests",
  "message": "Quest completed",
  "module": "quests",
  "function": "complete_quest",
  "line": 42,
  "extra_fields": {
    "user_id": "123",
    "quest_id": "456",
    "xp_earned": 100
  },
  "request": {
    "method": "POST",
    "path": "/api/quests/456/complete",
    "remote_addr": "192.168.1.1"
  },
  "correlation_id": "a1b2c3d4-e5f6-7890"
}
```

### Text Format (Development)
```bash
LOG_FORMAT=text
```

Output:
```
2025-01-23 12:00:00 INFO     [routes.quests] Quest completed
```

## Migration from print()

When replacing print() statements:

```python
# BEFORE
print(f"Processing user {user_id}")
print(f"Error: {str(e)}")
print("Quest completed successfully")

# AFTER
logger.debug_extra("Processing user", user_id=user_id)
logger.error(f"Error processing request: {str(e)}", exc_info=True)
logger.info("Quest completed successfully")
```

**Guidelines:**
- Debug prints → `logger.debug()`
- Info prints → `logger.info()`
- Error prints → `logger.error()`
- Always add context via extra_fields

## What NOT to Log

### Sensitive Data
Never log:
- Passwords or password hashes
- API keys or secrets
- JWT tokens
- Credit card numbers
- Full social security numbers
- Personal health information

```python
# BAD
logger.info(f"User logged in with password: {password}")

# GOOD
logger.info_extra("User logged in", user_id=user_id)
```

### High-Frequency Logs
Avoid logging in tight loops:

```python
# BAD - Logs 1000s of times
for user in users:
    logger.info(f"Processing user {user.id}")
    process(user)

# GOOD - Log summary
logger.info_extra("Processing batch",
                  user_count=len(users))
for user in users:
    process(user)
logger.info_extra("Batch processing complete",
                  user_count=len(users),
                  success_count=success_count)
```

## Testing Logs

```python
import logging
from utils.logger import get_logger

def test_operation_logs_success(caplog):
    logger = get_logger(__name__)

    with caplog.at_level(logging.INFO):
        operation()

    assert "Operation completed" in caplog.text
```

## Production Recommendations

1. **Use JSON format** for machine parsing
2. **Set appropriate log level** (INFO or WARNING in production)
3. **Include structured data** via extra_fields
4. **Use correlation IDs** for request tracing
5. **Monitor log volume** to avoid excessive logging costs
6. **Set up log aggregation** (e.g., CloudWatch, Datadog)
7. **Create alerts** on ERROR and CRITICAL logs

## Example: Complete Service

```python
from utils.logger import get_logger
from utils.exceptions import ValidationError, NotFoundError
from app_config import Config
import time

logger = get_logger(__name__)


class BadgeService:
    def __init__(self, user_id: str):
        self.user_id = user_id
        logger.debug_extra("BadgeService initialized",
                          user_id=user_id)

    def award_badge(self, badge_id: str):
        start_time = time.time()

        logger.info_extra("Awarding badge",
                         user_id=self.user_id,
                         badge_id=badge_id)

        try:
            # Validation
            if not badge_id:
                raise ValidationError("badge_id is required")

            # Business logic
            badge = self._get_badge(badge_id)
            if not badge:
                raise NotFoundError(f"Badge {badge_id} not found")

            self._check_requirements(badge)
            self._save_badge_award(badge)

            elapsed = time.time() - start_time
            logger.info_extra("Badge awarded successfully",
                             user_id=self.user_id,
                             badge_id=badge_id,
                             badge_name=badge['name'],
                             duration_ms=int(elapsed * 1000))

            return badge

        except (ValidationError, NotFoundError):
            # Let these bubble up - @api_endpoint will handle them
            raise

        except Exception as e:
            elapsed = time.time() - start_time
            logger.error_extra("Failed to award badge",
                              user_id=self.user_id,
                              badge_id=badge_id,
                              error=str(e),
                              duration_ms=int(elapsed * 1000),
                              exc_info=True)
            raise

    def _get_badge(self, badge_id: str):
        logger.debug_extra("Fetching badge from database",
                          badge_id=badge_id)
        # ... database query ...
        return badge

    def _check_requirements(self, badge: dict):
        logger.debug_extra("Checking badge requirements",
                          badge_id=badge['id'],
                          min_quests=badge.get('min_quests'),
                          min_xp=badge.get('min_xp'))
        # ... requirement checking ...

    def _save_badge_award(self, badge: dict):
        logger.debug_extra("Saving badge award",
                          user_id=self.user_id,
                          badge_id=badge['id'])
        # ... database insert ...
```

## Additional Resources

- [Python Logging Documentation](https://docs.python.org/3/library/logging.html)
- [Structured Logging Best Practices](https://www.datadoghq.com/blog/python-logging-best-practices/)
- [Flask Logging](https://flask.palletsprojects.com/en/2.3.x/logging/)

## Questions?

Check the inline documentation in `utils/logger.py` or ask the team.
