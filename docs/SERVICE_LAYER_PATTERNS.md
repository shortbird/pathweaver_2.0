# Service Layer Patterns

**Last Updated**: January 2025
**Status**: Active - Base service class implemented

## Overview

The service layer provides business logic abstraction between routes and the database. All services inherit from `BaseService` which provides consistent patterns for error handling, logging, retry logic, and database access.

## Architecture

```
Routes (API endpoints)
    ↓
Services (Business logic)
    ↓
Database (Supabase client)
```

### Key Principles

1. **Single Responsibility**: Each service handles one domain (quests, badges, XP, etc.)
2. **Consistent Error Handling**: All services use standardized exceptions
3. **Retry Logic**: Automatic retries for transient database failures
4. **Logging**: All operations logged with context for debugging
5. **RLS Support**: User-authenticated clients for Row Level Security

## BaseService Class

Location: `backend/services/base_service.py`

### Features

- **Automatic retry logic** with exponential backoff
- **Consistent error handling** with custom exceptions
- **Operation logging** with timing and context
- **Database client management** (admin and user-authenticated)
- **Input validation** helpers
- **Resource existence checks**

### Custom Exceptions

```python
ServiceError       # Base exception for all service errors
├── DatabaseError  # Database operation failed
├── ValidationError # Input validation failed
├── NotFoundError  # Resource not found
└── PermissionError # User lacks permission
```

## Usage Examples

### Basic Service Implementation

```python
from services.base_service import BaseService, NotFoundError, ValidationError

class QuestService(BaseService):
    """Quest management service."""

    def get_quest(self, quest_id: str, user_id: Optional[str] = None):
        """Get quest by ID with optional user progress."""

        # Validate input
        self.validate_required(quest_id=quest_id)

        # Get quest or raise NotFoundError
        quest = self.get_or_404('quests', quest_id)

        # Optionally enrich with user data using RLS client
        if user_id:
            user_client = self.get_user_supabase(user_id)
            # ... fetch user-specific data

        return quest

    def create_quest(self, title: str, description: str, pillar: str):
        """Create a new quest."""

        # Validate required fields
        self.validate_required(
            title=title,
            description=description,
            pillar=pillar
        )

        # Validate pillar is allowed value
        self.validate_one_of(
            'pillar',
            pillar,
            ['stem', 'wellness', 'communication', 'civics', 'art']
        )

        # Use execute() for automatic retry & error handling
        return self.execute(
            operation=lambda: self.supabase.table('quests').insert({
                'title': title,
                'description': description,
                'pillar': pillar
            }).execute(),
            operation_name='create_quest',
            title=title,  # Context for logging
            pillar=pillar
        )
```

### Using the @with_retry Decorator

```python
from services.base_service import BaseService, with_retry

class BadgeService(BaseService):

    @with_retry(retries=3, retry_delay=1.0)
    def calculate_badge_progress(self, user_id: str, badge_id: str):
        """Calculate badge progress with automatic retry."""

        # This method will automatically retry on transient failures
        # No need to manually call self.execute()

        badge = self.get_or_404('badges', badge_id)

        # Complex calculation logic here
        user_xp = self._get_user_xp(user_id, badge['pillar_primary'])
        user_quests = self._count_user_quests(user_id, badge_id)

        return {
            'badge_id': badge_id,
            'xp_progress': user_xp,
            'quest_progress': user_quests,
            'requirements_met': user_xp >= badge['min_xp']
        }
```

### Using the @validate_input Decorator

```python
from services.base_service import BaseService, validate_input

class XPService(BaseService):

    @validate_input(
        user_id=lambda x: x is not None and len(x) > 0,
        xp_amount=lambda x: isinstance(x, int) and x > 0,
        pillar=lambda x: x in ['stem', 'wellness', 'communication', 'civics', 'art']
    )
    def award_xp(self, user_id: str, xp_amount: int, pillar: str):
        """Award XP with automatic input validation."""

        # Inputs are automatically validated before method executes
        # ValidationError raised if any validation fails

        return self.execute(
            operation=lambda: self._do_award_xp(user_id, xp_amount, pillar),
            operation_name='award_xp',
            user_id=user_id,
            xp_amount=xp_amount,
            pillar=pillar
        )
```

### Manual Execution with Retry

```python
class ImageService(BaseService):

    def fetch_pexels_image(self, search_term: str):
        """Fetch image from Pexels API with retry logic."""

        def fetch():
            response = requests.get(
                PEXELS_SEARCH_URL,
                headers={'Authorization': PEXELS_API_KEY},
                params={'query': search_term, 'per_page': 1}
            )
            response.raise_for_status()
            return response.json()

        return self.execute(
            operation=fetch,
            operation_name='fetch_pexels_image',
            retries=5,  # More retries for external API
            retry_delay=2.0,  # Longer delay
            search_term=search_term
        )
```

### Working with User-Authenticated Clients (RLS)

```python
class EvidenceService(BaseService):

    def submit_task_evidence(self, user_id: str, task_id: str, evidence_text: str):
        """Submit task evidence using user-authenticated client for RLS."""

        self.validate_required(
            user_id=user_id,
            task_id=task_id,
            evidence_text=evidence_text
        )

        # Get user-authenticated client (RLS enforced)
        user_client = self.get_user_supabase(user_id)

        def submit():
            return user_client.table('quest_task_completions').insert({
                'user_id': user_id,
                'task_id': task_id,
                'evidence_text': evidence_text,
                'completed_at': 'now()'
            }).execute()

        return self.execute(
            operation=submit,
            operation_name='submit_task_evidence',
            user_id=user_id,
            task_id=task_id
        )
```

## Database Client Selection

### When to use `self.supabase` (Admin Client)
- **No RLS needed**: Reading public data, admin operations
- **Bypassing RLS**: Admin-level operations that need full access
- **Aggregations**: Counting records, analytics queries
- **Examples**: Fetching all active quests, admin user management

```python
# Good use of admin client
def get_all_active_badges(self):
    return self.supabase.table('badges')\
        .select('*')\
        .eq('is_active', True)\
        .execute()
```

### When to use `self.get_user_supabase(user_id)` (User Client)
- **RLS enforcement needed**: User-specific data access
- **Security critical**: Ensures users only access their own data
- **Data modification**: Creating/updating user-owned records
- **Examples**: Submitting evidence, viewing own quests, updating profile

```python
# Good use of user client
def get_user_quests(self, user_id: str):
    user_client = self.get_user_supabase(user_id)
    return user_client.table('user_quests')\
        .select('*, quests(*)')\
        .eq('user_id', user_id)\
        .execute()
```

## Error Handling Patterns

### Handling Specific Errors

```python
from services.base_service import NotFoundError, ValidationError, PermissionError

class QuestService(BaseService):

    def start_quest(self, user_id: str, quest_id: str):
        try:
            # Validate quest exists
            quest = self.get_or_404('quests', quest_id)

            # Check if already started
            if self.exists('user_quests', quest_id, 'quest_id'):
                raise ValidationError("Quest already started")

            # Create user_quest record
            return self.execute(
                operation=lambda: self._create_user_quest(user_id, quest_id),
                operation_name='start_quest',
                user_id=user_id,
                quest_id=quest_id
            )

        except NotFoundError:
            raise NotFoundError(f"Quest {quest_id} not found")
        except ValidationError as e:
            raise  # Re-raise validation errors as-is
        except Exception as e:
            # Wrap unexpected errors
            raise DatabaseError(f"Failed to start quest: {str(e)}")
```

### Error Propagation to Routes

```python
# In route handler
from services.quest_service import QuestService
from services.base_service import NotFoundError, ValidationError
from flask import jsonify

@bp.route('/quests/<quest_id>/start', methods=['POST'])
@require_auth
def start_quest(user_id, quest_id):
    try:
        service = QuestService()
        result = service.start_quest(user_id, quest_id)
        return jsonify({'success': True, 'data': result}), 200

    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except PermissionError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        current_app.logger.error(f"Unexpected error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500
```

## Logging and Monitoring

### Automatic Operation Logging

All operations executed through `self.execute()` are automatically logged with:
- Service name
- Operation name
- Status (success/retry/failed)
- Elapsed time (ms)
- Attempt number
- Error details (if failed)
- Custom context (user_id, quest_id, etc.)

### Log Output Example

```
[INFO] [QuestService] create_quest: success - elapsed_ms=45, title="Learn Python"
[WARNING] [BadgeService] calculate_badge_progress: retry - attempt=1, error="Connection timeout"
[ERROR] [XPService] award_xp: failed - attempts=3, error="Database unavailable"
```

### Adding Custom Context

```python
return self.execute(
    operation=lambda: self._do_operation(),
    operation_name='operation_name',
    user_id=user_id,        # Custom context
    quest_id=quest_id,      # Custom context
    action_type='complete'  # Custom context
)
```

## Migration Guide

### Converting Existing Services

**Before** (old pattern):
```python
class OldBadgeService:
    @staticmethod
    def get_badge(badge_id: str):
        supabase = get_supabase_admin_client()
        result = supabase.table('badges').select('*').eq('id', badge_id).execute()

        if not result.data:
            raise ValueError(f"Badge {badge_id} not found")

        return result.data[0]
```

**After** (BaseService pattern):
```python
class BadgeService(BaseService):
    def get_badge(self, badge_id: str):
        # Use helper method for get-or-404 pattern
        return self.get_or_404('badges', badge_id)
```

### Migration Checklist

- [ ] Change class to inherit from `BaseService`
- [ ] Remove manual `get_supabase_admin_client()` calls
- [ ] Use `self.supabase` for admin operations
- [ ] Use `self.get_user_supabase(user_id)` for RLS operations
- [ ] Wrap database operations in `self.execute()` for retry logic
- [ ] Replace generic exceptions with service exceptions
- [ ] Use `self.validate_required()` for input validation
- [ ] Use `self.get_or_404()` instead of manual existence checks
- [ ] Add operation context to `execute()` calls for logging

## Best Practices

### DO ✅

- **Inherit from BaseService** for all new services
- **Use self.execute()** for operations that may fail transiently
- **Validate inputs early** using validation helpers
- **Use specific exceptions** (NotFoundError, ValidationError, etc.)
- **Add context to execute()** calls for better logging
- **Choose correct client** (admin vs user) based on RLS needs
- **Document public methods** with docstrings
- **Keep services focused** on single domain/responsibility

### DON'T ❌

- **Don't catch and swallow exceptions** without re-raising
- **Don't use generic Exception** for business logic errors
- **Don't mix database calls** with HTTP requests in same service
- **Don't bypass validation** "just this once"
- **Don't use admin client** when user client is appropriate
- **Don't retry forever** - use reasonable retry limits
- **Don't log sensitive data** (passwords, tokens, etc.)
- **Don't make services too large** - split into multiple if needed

## Performance Considerations

### Retry Strategy

- **Default retries**: 3 attempts
- **Default delay**: 0.5s with exponential backoff
- **Customize per operation**: High-value operations get more retries
- **Fast-fail on validation**: Don't retry validation/permission errors

### Database Efficiency

- **Use select('*')** sparingly - only fetch needed columns
- **Batch operations** when possible instead of loops
- **Cache reference data** (pillars, tiers) that rarely changes
- **Use RLS efficiently** - don't switch clients unnecessarily

### Logging Performance

- **Structured logging** for easy parsing
- **Debug mode**: Console output enabled
- **Production**: Log to proper logging infrastructure
- **Avoid logging** in tight loops

## Service Catalog

Current services in `backend/services/`:

| Service | Purpose | Migrated |
|---------|---------|----------|
| `badge_service.py` | Badge management & progress tracking | ⏳ Pending |
| `xp_service.py` | XP calculation & awards | ⏳ Pending |
| `quest_completion_service.py` | Quest completion logic | ⏳ Pending |
| `atomic_quest_service.py` | Race-condition safe completions | ⏳ Pending |
| `image_service.py` | Pexels image fetching | ⏳ Pending |
| `ai_tutor_service.py` | AI tutor conversations | ⏳ Pending |
| `lms_sync_service.py` | LMS roster synchronization | ⏳ Pending |
| `email_service.py` | Email sending | ⏳ Pending |
| `recommendation_service.py` | Quest recommendations | ⏳ Pending |

*Note: Services will be migrated incrementally to minimize disruption*

## Future Enhancements

- **Caching layer**: Add Redis caching for frequently accessed data
- **Circuit breaker**: Prevent cascading failures from external APIs
- **Metrics collection**: Track operation performance and failure rates
- **Async support**: Add async/await for concurrent operations
- **Transaction support**: Helper methods for multi-table transactions

## Support

For questions or issues with the service layer:
1. Check this documentation
2. Review `base_service.py` implementation
3. Look at migration examples above
4. Review existing service implementations

---

**Last Updated**: January 2025
**Maintained By**: Development Team
**Status**: Active
