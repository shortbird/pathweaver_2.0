# Repository Pattern Documentation

**Last Updated**: 2025-01-22
**Status**: Sprint 2 - Architectural Improvements
**Purpose**: Data access layer abstraction for clean separation of concerns

---

## Overview

The Repository Pattern provides a clean abstraction layer between business logic and database operations. This architecture improves:

- **Testability**: Easy to mock repositories in unit tests
- **Maintainability**: Database logic centralized in one place
- **Consistency**: Standardized error handling and logging
- **Security**: Built-in RLS enforcement
- **Reusability**: Common operations defined once

---

## Architecture

```
┌─────────────────┐
│  Route Handler  │  ← Business logic, HTTP handling
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Repository    │  ← Data access layer (THIS LAYER)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Supabase DB    │  ← PostgreSQL database
└─────────────────┘
```

**Before (Direct Database Access)**:
```python
# backend/routes/users/profile.py
@bp.route('/<user_id>/profile', methods=['GET'])
@require_auth
def get_profile(user_id):
    client = get_user_client(current_user['sub'])
    response = client.table('users').select('*').eq('id', user_id).execute()
    # ... more database logic mixed with business logic
```

**After (Repository Pattern)**:
```python
# backend/routes/users/profile.py
from backend.repositories import UserRepository

@bp.route('/<user_id>/profile', methods=['GET'])
@require_auth
def get_profile(user_id):
    user_repo = UserRepository(user_id=current_user['sub'])
    user = user_repo.get_profile(user_id)
    # ... clean business logic, no database details
```

---

## Available Repositories

### BaseRepository

Abstract base class providing common CRUD operations.

**Methods**:
- `find_by_id(id_value)` - Find single record by primary key
- `find_all(filters, order_by, limit, offset)` - Find all records with filtering
- `create(data)` - Create new record
- `update(id_value, data)` - Update existing record
- `delete(id_value)` - Delete record by ID
- `count(filters)` - Count matching records
- `exists(id_value)` - Check if record exists

**Exceptions**:
- `DatabaseError` - Generic database operation failure
- `NotFoundError` - Record not found
- `ValidationError` - Invalid input data
- `PermissionError` - Insufficient permissions

### UserRepository

User-related database operations.

**File**: `backend/repositories/user_repository.py`

**Methods**:
- `find_by_email(email)` - Find user by email
- `find_by_slug(slug)` - Find user by portfolio slug
- `get_profile(user_id)` - Get full user profile
- `update_profile(user_id, **fields)` - Update profile fields
- `update_xp(user_id, total_xp, level)` - Update XP and level
- `increment_achievements(user_id)` - Increment achievement count
- `update_streak(user_id, streak_days)` - Update learning streak
- `find_by_role(role, limit)` - Find users by role
- `search_by_display_name(search_term, limit)` - Search users
- `get_dashboard_stats(user_id)` - Get dashboard statistics

**Example**:
```python
from backend.repositories import UserRepository

# Initialize with user context (RLS enforced)
user_repo = UserRepository(user_id=current_user_id)

# Get user profile
user = user_repo.get_profile(user_id)

# Update profile
updated_user = user_repo.update_profile(
    user_id,
    display_name="New Name",
    bio="Updated bio"
)

# Search users
results = user_repo.search_by_display_name("john", limit=10)
```

### QuestRepository

Quest-related database operations.

**File**: `backend/repositories/quest_repository.py`

**Methods**:
- `get_active_quests(pillar, source, limit)` - Get active quests with filters
- `get_quest_with_tasks(quest_id)` - Get quest with all tasks
- `get_user_quest_progress(user_id, quest_id)` - Get progress with completion %
- `get_user_active_quests(user_id, limit)` - Get user's enrolled quests
- `enroll_user(user_id, quest_id)` - Enroll user in quest
- `abandon_quest(user_id, quest_id)` - Mark quest as abandoned
- `search_quests(search_term, pillar, limit)` - Search quests

**Example**:
```python
from backend.repositories import QuestRepository

# Initialize (no user context needed for public quests)
quest_repo = QuestRepository()

# Get active quests
quests = quest_repo.get_active_quests(pillar='stem', limit=20)

# Get quest with tasks
quest = quest_repo.get_quest_with_tasks(quest_id)

# Enroll user
enrollment = quest_repo.enroll_user(user_id, quest_id)

# Get user progress
progress = quest_repo.get_user_quest_progress(user_id, quest_id)
# Returns: { ..., 'progress': { 'total_tasks': 5, 'completed_tasks': 2, 'percentage': 40 }}
```

### QuestTaskRepository

Quest task operations and completions.

**File**: `backend/repositories/quest_repository.py`

**Methods**:
- `get_tasks_for_quest(quest_id)` - Get all tasks for quest
- `complete_task(user_id, quest_id, task_id, evidence_text, evidence_url)` - Complete task

**Example**:
```python
from backend.repositories import QuestTaskRepository

task_repo = QuestTaskRepository(user_id=current_user_id)

# Get tasks for quest
tasks = task_repo.get_tasks_for_quest(quest_id)

# Complete task with evidence
completion = task_repo.complete_task(
    user_id=user_id,
    quest_id=quest_id,
    task_id=task_id,
    evidence_text="I learned about photosynthesis...",
    evidence_url="https://example.com/my-project"
)
```

### BadgeRepository

Badge-related database operations.

**File**: `backend/repositories/badge_repository.py`

**Methods**:
- `get_active_badges(pillar, limit)` - Get active badges
- `get_badge_with_progress(badge_id, user_id)` - Get badge with user progress
- `get_user_earned_badges(user_id, limit)` - Get user's earned badges
- `get_recommended_badges(user_id, limit)` - Get badge recommendations
- `refresh_badge_image(badge_id, image_url)` - Update badge image
- `search_badges(search_term, pillar, limit)` - Search badges

**Example**:
```python
from backend.repositories import BadgeRepository

badge_repo = BadgeRepository(user_id=current_user_id)

# Get badge with progress
badge = badge_repo.get_badge_with_progress(badge_id, user_id)
# Returns: { ..., 'progress': { 'current_xp': 500, 'required_xp': 1000, 'xp_percentage': 50 }}

# Get earned badges
earned = badge_repo.get_user_earned_badges(user_id)

# Get recommendations
recommended = badge_repo.get_recommended_badges(user_id, limit=5)
```

---

## Usage Guidelines

### 1. RLS Enforcement

**Always initialize with user context when accessing user-scoped data**:

```python
# ✅ CORRECT - RLS enforced
user_repo = UserRepository(user_id=current_user_id)
user = user_repo.get_profile(user_id)

# ❌ INCORRECT - Bypasses RLS
user_repo = UserRepository()  # Admin client
user = user_repo.get_profile(user_id)
```

**Admin operations (use sparingly)**:

```python
# Only for system operations, NOT user-scoped data
quest_repo = QuestRepository()  # No user_id = admin client
all_quests = quest_repo.get_active_quests()  # OK - public data

# NEVER use admin client for user data
user_repo = UserRepository()  # ❌ WRONG
user = user_repo.get_profile(user_id)  # Bypasses RLS!
```

### 2. Error Handling

Repositories raise specific exceptions:

```python
from backend.repositories import UserRepository, NotFoundError, DatabaseError

user_repo = UserRepository(user_id=current_user_id)

try:
    user = user_repo.get_profile(user_id)
except NotFoundError:
    return jsonify({'error': 'User not found'}), 404
except DatabaseError as e:
    logger.error(f"Database error: {e}")
    return jsonify({'error': 'Internal server error'}), 500
```

### 3. Route Handler Integration

**Before**:
```python
@bp.route('/quests/<quest_id>', methods=['GET'])
@require_auth
def get_quest(quest_id):
    client = get_supabase_admin_client()
    response = client.table('quests').select('*, quest_tasks(*)').eq('id', quest_id).execute()
    if not response.data:
        return jsonify({'error': 'Quest not found'}), 404
    quest = response.data[0]
    # ... more logic
```

**After**:
```python
from backend.repositories import QuestRepository, NotFoundError

@bp.route('/quests/<quest_id>', methods=['GET'])
@require_auth
def get_quest(quest_id):
    quest_repo = QuestRepository()
    try:
        quest = quest_repo.get_quest_with_tasks(quest_id)
        return jsonify(quest), 200
    except NotFoundError:
        return jsonify({'error': 'Quest not found'}), 404
```

### 4. Testing

Repositories make testing easier:

```python
# tests/test_routes.py
from unittest.mock import Mock, patch

@patch('backend.routes.quests.QuestRepository')
def test_get_quest(mock_repo_class):
    mock_repo = mock_repo_class.return_value
    mock_repo.get_quest_with_tasks.return_value = {'id': '123', 'title': 'Test'}

    response = client.get('/api/quests/123')
    assert response.status_code == 200
    assert response.json['title'] == 'Test'
```

---

## Best Practices

### DO ✅

1. **Use repositories in route handlers** - Keep routes clean
2. **Initialize with user_id for user-scoped data** - Enforce RLS
3. **Handle specific exceptions** - NotFoundError, DatabaseError, etc.
4. **Let repositories handle database details** - Don't leak Supabase specifics
5. **Log repository operations** - Already built into base class
6. **Create new repositories for new tables** - Follow existing patterns

### DON'T ❌

1. **Don't bypass repositories** - No direct database access in routes
2. **Don't use admin client for user data** - Always use user context
3. **Don't catch generic exceptions** - Handle specific repository errors
4. **Don't put business logic in repositories** - Keep them focused on data access
5. **Don't expose internal database structure** - Return clean data structures
6. **Don't create repositories without user context** - Unless truly admin operation

---

## Creating New Repositories

To create a new repository:

1. **Create file**: `backend/repositories/new_repository.py`

```python
from backend.repositories.base_repository import BaseRepository, DatabaseError, NotFoundError
from typing import Optional, Dict, List, Any
import logging

logger = logging.getLogger(__name__)


class NewRepository(BaseRepository):
    """Repository for new_table database operations"""

    table_name = 'new_table'
    id_column = 'id'

    def custom_method(self, param: str) -> Dict[str, Any]:
        """
        Custom query method.

        Args:
            param: Description

        Returns:
            Result

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = self.client.table(self.table_name).select('*').eq('field', param).execute()
            return response.data or []
        except Exception as e:
            logger.error(f"Error in custom method: {e}")
            raise DatabaseError("Failed to execute custom query") from e
```

2. **Export in __init__.py**:

```python
# backend/repositories/__init__.py
from backend.repositories.new_repository import NewRepository

__all__ = [
    # ... existing
    'NewRepository',
]
```

3. **Document in this file** - Add to "Available Repositories" section

---

## Migration Guide

To migrate existing routes to use repositories:

### Step 1: Identify Database Operations

Find all direct database calls in route:
```python
# Old code
client = get_supabase_admin_client()
response = client.table('users').select('*').eq('id', user_id).execute()
user = response.data[0]
```

### Step 2: Replace with Repository

```python
# New code
from backend.repositories import UserRepository, NotFoundError

user_repo = UserRepository(user_id=current_user_id)
try:
    user = user_repo.get_profile(user_id)
except NotFoundError:
    return jsonify({'error': 'User not found'}), 404
```

### Step 3: Add Error Handling

```python
from backend.repositories import DatabaseError

try:
    user = user_repo.get_profile(user_id)
    return jsonify(user), 200
except NotFoundError:
    return jsonify({'error': 'User not found'}), 404
except DatabaseError:
    return jsonify({'error': 'Database error'}), 500
```

### Step 4: Remove Direct Database Imports

```python
# Remove these
from backend.database import get_supabase_admin_client, get_user_client

# Add these
from backend.repositories import UserRepository, NotFoundError, DatabaseError
```

---

## Performance Considerations

### Connection Pooling

Repositories use Supabase's built-in connection pooling. Each repository instance maintains a client reference:

```python
# ✅ Good - One client per request
user_repo = UserRepository(user_id=user_id)
user = user_repo.get_profile(user_id)
stats = user_repo.get_dashboard_stats(user_id)

# ❌ Inefficient - Multiple client initializations
user1_repo = UserRepository(user_id=user_id)
user = user1_repo.get_profile(user_id)
user2_repo = UserRepository(user_id=user_id)
stats = user2_repo.get_dashboard_stats(user_id)
```

### Query Optimization

Use repository methods that fetch related data in one query:

```python
# ✅ Good - Single query with joins
quest = quest_repo.get_quest_with_tasks(quest_id)

# ❌ Bad - Multiple queries (N+1)
quest = quest_repo.find_by_id(quest_id)
tasks = task_repo.get_tasks_for_quest(quest_id)  # Separate query
```

---

## Troubleshooting

### "Using admin client" Warning

```
WARNING: Using admin client for users repository. Ensure this is intentional...
```

**Cause**: Repository initialized without `user_id`
**Fix**: Pass `user_id` for user-scoped operations:

```python
# Before
user_repo = UserRepository()

# After
user_repo = UserRepository(user_id=current_user_id)
```

### NotFoundError on Valid Data

**Cause**: RLS preventing access
**Fix**: Ensure user has permission to access the data

```python
# User can only access their own data
user_repo = UserRepository(user_id=user_id)
user = user_repo.get_profile(other_user_id)  # ❌ RLS blocks
```

### DatabaseError on Insert

**Cause**: Missing required fields or constraint violations
**Fix**: Check table schema and provide all required fields

---

## Future Enhancements

Potential improvements for Sprint 3+:

1. **Caching Layer** - Add Redis caching to repositories
2. **Query Builder** - Fluent interface for complex queries
3. **Bulk Operations** - Batch insert/update methods
4. **Soft Deletes** - Implement soft delete pattern
5. **Audit Logging** - Track all repository operations
6. **Read Replicas** - Distribute read operations across replicas
7. **Transaction Support** - Multi-operation atomic commits

---

## Summary

The Repository Pattern provides:

- ✅ Clean separation between routes and database
- ✅ Consistent error handling and logging
- ✅ Built-in RLS enforcement
- ✅ Easy testing with mocks
- ✅ Reusable database operations
- ✅ Better code maintainability

**Next Steps**: Begin migrating route handlers to use repositories (Sprint 2.2)
