# Repository Pattern Documentation

## Overview

The repository pattern is a design pattern that encapsulates the logic required to access data sources. It provides a centralized location for all database queries and improves code maintainability, testability, and separation of concerns.

## Benefits

1. **Single Source of Truth**: All database queries for a specific entity are in one place
2. **Testability**: Easy to mock repositories for unit testing
3. **Consistent Error Handling**: Standardized error handling across all database operations
4. **RLS Enforcement**: Proper Row-Level Security through user-authenticated clients
5. **Reusability**: Same repository methods can be used across multiple routes
6. **Cleaner Routes**: Routes focus on HTTP handling, not database queries

## Architecture

```
Routes (HTTP Layer)
    ↓
Services (Business Logic)
    ↓
Repositories (Data Access)
    ↓
Database (Supabase/PostgreSQL)
```

## Available Repositories

### Core Repositories

1. **UserRepository** - User account operations
2. **QuestRepository** - Quest and quest enrollment operations
3. **QuestTaskRepository** - Task management
4. **BadgeRepository** - Badge and badge progress operations

### Feature Repositories

5. **EvidenceRepository** - Evidence document uploads
6. **FriendshipRepository** - Connection/friendship management
7. **ParentRepository** - Parent-student linking and invitations
8. **TutorRepository** - AI tutor conversations and safety
9. **LMSRepository** - LMS integration and grade sync
10. **AnalyticsRepository** - Admin analytics and reporting

## Usage Examples

### Basic Usage

```python
from backend.repositories import UserRepository, QuestRepository

# In a route handler
@bp.route('/users/<user_id>/quests', methods=['GET'])
@require_auth
def get_user_quests(current_user_id, user_id):
    # Initialize repository with user context (enforces RLS)
    quest_repo = QuestRepository(user_id=current_user_id)

    # Use repository methods instead of direct database queries
    quests = quest_repo.find_by_user(user_id)

    return jsonify(quests), 200
```

### Admin Operations (No RLS)

```python
from backend.repositories import AnalyticsRepository

# Admin route - no user_id (uses admin client)
@bp.route('/admin/analytics', methods=['GET'])
@require_admin
def get_analytics(admin_id):
    # No user_id = uses admin client (bypasses RLS)
    analytics_repo = AnalyticsRepository()

    stats = {
        'users': analytics_repo.get_user_stats(),
        'quests': analytics_repo.get_quest_stats(),
        'xp': analytics_repo.get_xp_stats()
    }

    return jsonify(stats), 200
```

### Creating Records

```python
from backend.repositories import EvidenceRepository

@bp.route('/evidence', methods=['POST'])
@require_auth
def upload_evidence(user_id):
    data = request.json

    evidence_repo = EvidenceRepository(user_id=user_id)

    evidence = evidence_repo.create_evidence({
        'user_id': user_id,
        'task_completion_id': data['task_completion_id'],
        'file_name': data['file_name'],
        'file_type': data['file_type'],
        'file_url': data['file_url'],
        'file_size': data['file_size']
    })

    return jsonify(evidence), 201
```

### Error Handling

```python
from backend.repositories import FriendshipRepository, NotFoundError, PermissionError

@bp.route('/connections/<friendship_id>/accept', methods=['POST'])
@require_auth
def accept_connection(user_id, friendship_id):
    friendship_repo = FriendshipRepository(user_id=user_id)

    try:
        friendship = friendship_repo.accept_request(friendship_id, user_id)
        return jsonify(friendship), 200
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except PermissionError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500
```

## Creating a New Repository

### Step 1: Create Repository File

```python
# backend/repositories/my_entity_repository.py

from typing import List, Dict, Optional, Any
from repositories.base_repository import BaseRepository, NotFoundError
from utils.logger import get_logger

logger = get_logger(__name__)


class MyEntityRepository(BaseRepository):
    """Repository for my entity operations."""

    table_name = 'my_entities'

    def find_by_user(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all entities for a user."""
        try:
            result = self.client.table(self.table_name)\
                .select('*')\
                .eq('user_id', user_id)\
                .order('created_at', desc=True)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching entities for user {user_id}: {e}")
            return []

    def create_entity(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new entity."""
        try:
            result = self.client.table(self.table_name)\
                .insert(data)\
                .execute()

            if not result.data:
                raise ValueError("Failed to create entity")

            logger.info(f"Created entity for user {data['user_id']}")
            return result.data[0]
        except Exception as e:
            logger.error(f"Error creating entity: {e}")
            raise
```

### Step 2: Add to `__init__.py`

```python
# backend/repositories/__init__.py

from backend.repositories.my_entity_repository import MyEntityRepository

__all__ = [
    # ... existing exports ...
    'MyEntityRepository',
]
```

### Step 3: Use in Routes

```python
# backend/routes/my_route.py

from backend.repositories import MyEntityRepository

@bp.route('/entities', methods=['GET'])
@require_auth
def get_entities(user_id):
    repo = MyEntityRepository(user_id=user_id)
    entities = repo.find_by_user(user_id)
    return jsonify(entities), 200
```

## Best Practices

### 1. Always Use RLS When Possible

```python
# GOOD - Enforces RLS
quest_repo = QuestRepository(user_id=current_user_id)

# BAD - Bypasses RLS (only use for admin operations)
quest_repo = QuestRepository()  # No user_id
```

### 2. Handle Errors Consistently

```python
try:
    user = user_repo.find_by_id(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
except PermissionError:
    return jsonify({'error': 'Forbidden'}), 403
except Exception as e:
    logger.error(f"Error: {e}")
    return jsonify({'error': 'Internal server error'}), 500
```

### 3. Log Important Operations

```python
def delete_entity(self, entity_id: str) -> bool:
    try:
        result = self.client.table(self.table_name)\
            .delete()\
            .eq('id', entity_id)\
            .execute()

        logger.info(f"Deleted entity {entity_id}")  # ✓ Good
        return True
    except Exception as e:
        logger.error(f"Error deleting entity {entity_id}: {e}")  # ✓ Good
        raise
```

### 4. Return Consistent Data Types

```python
# GOOD - Consistent return type
def find_by_user(self, user_id: str) -> List[Dict[str, Any]]:
    result = self.client.table(self.table_name)\
        .select('*')\
        .eq('user_id', user_id)\
        .execute()

    return result.data or []  # Always returns list

# BAD - Inconsistent return type
def find_by_user(self, user_id: str):
    result = self.client.table(self.table_name)\
        .select('*')\
        .eq('user_id', user_id)\
        .execute()

    return result.data  # Could be None or list
```

## Migration Guide

### Migrating from Direct Database Access

**Before:**
```python
from database import get_supabase_admin_client

@bp.route('/users/<user_id>', methods=['GET'])
def get_user(user_id):
    supabase = get_supabase_admin_client()
    result = supabase.table('users')\
        .select('*')\
        .eq('id', user_id)\
        .execute()

    if not result.data:
        return jsonify({'error': 'Not found'}), 404

    return jsonify(result.data[0]), 200
```

**After:**
```python
from backend.repositories import UserRepository, NotFoundError

@bp.route('/users/<user_id>', methods=['GET'])
def get_user(user_id):
    user_repo = UserRepository()

    try:
        user = user_repo.find_by_id(user_id)
        if not user:
            raise NotFoundError(f"User {user_id} not found")

        return jsonify(user), 200
    except NotFoundError as e:
        return jsonify({'error': str(e)}), 404
```

## Common Patterns

### Pagination

```python
def find_paginated(self, limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
    """Get paginated results."""
    result = self.client.table(self.table_name)\
        .select('*')\
        .order('created_at', desc=True)\
        .range(offset, offset + limit - 1)\
        .execute()

    return result.data or []
```

### Filtering

```python
def find_by_status(self, status: str) -> List[Dict[str, Any]]:
    """Get entities by status."""
    result = self.client.table(self.table_name)\
        .select('*')\
        .eq('status', status)\
        .execute()

    return result.data or []
```

### Joins

```python
def find_with_details(self, entity_id: str) -> Optional[Dict[str, Any]]:
    """Get entity with related data."""
    result = self.client.table(self.table_name)\
        .select('*, user:user_id(id, display_name), quest:quest_id(id, title)')\
        .eq('id', entity_id)\
        .single()\
        .execute()

    return result.data if result.data else None
```

## Testing Repositories

```python
import pytest
from backend.repositories import UserRepository, NotFoundError

def test_find_by_id_success(test_user):
    repo = UserRepository()
    user = repo.find_by_id(test_user['id'])

    assert user is not None
    assert user['id'] == test_user['id']

def test_find_by_id_not_found():
    repo = UserRepository()
    user = repo.find_by_id('non-existent-id')

    assert user is None

def test_create_user():
    repo = UserRepository()
    user_data = {
        'email': 'test@example.com',
        'display_name': 'Test User'
    }

    user = repo.create(user_data)

    assert user['email'] == user_data['email']
    assert 'id' in user
```

## Performance Considerations

1. **Use Select Specific Columns**: Only select columns you need
2. **Add Indexes**: Ensure frequently queried columns have indexes
3. **Batch Operations**: Use batch inserts/updates when possible
4. **Caching**: Consider caching frequently accessed data

## Conclusion

The repository pattern is a key part of Phase 3 architecture consolidation. It provides a clean separation between business logic and data access, making the codebase more maintainable, testable, and secure.

For questions or issues, refer to the base repository implementation or create a new issue.
