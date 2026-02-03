# Service Layer Pattern Guide

**Created**: December 19, 2025
**Status**: ESTABLISHED (P1-ARCH-4)
**Purpose**: Guide for implementing services following the repository pattern

## Overview

As of December 2025, Optio services follow a clean architecture where:
- **Services** contain business logic, validation, and orchestration
- **Repositories** handle all database access (the ONLY place for DB queries)
- **Routes** handle HTTP concerns and delegate to services

This separation ensures:
- Testability (mock repositories easily)
- Maintainability (DB logic centralized)
- Clarity (single responsibility principle)

## The Pattern

### ✅ CORRECT: Repository Pattern

Services inject repositories via constructor and use them exclusively for database access.

**Exemplar Services** (use these as reference):
- [organization_service.py](../services/organization_service.py)
- [checkin_service.py](../services/checkin_service.py)

```python
# backend/services/my_service.py
from typing import Dict, List
from services.base_service import BaseService
from repositories.my_repository import MyRepository

class MyService(BaseService):
    """Business logic for my feature."""

    def __init__(self):
        super().__init__()
        self.repo = MyRepository()  # Inject repository

    def get_items(self, user_id: str) -> List[Dict]:
        """Get all items for a user."""
        # ✅ Use repository for DB access
        return self.repo.find_by_user(user_id)

    def create_item(self, user_id: str, data: Dict) -> Dict:
        """Create new item with validation."""
        # Business logic in service
        self.validate_required(user_id=user_id, **data)

        # ✅ DB access through repository
        return self.repo.create({**data, 'user_id': user_id})
```

```python
# backend/repositories/my_repository.py
from typing import Dict, List, Optional
from repositories.base_repository import BaseRepository

class MyRepository(BaseRepository):
    """Data access for my feature."""

    table_name = 'my_table'

    def __init__(self, user_id: Optional[str] = None):
        super().__init__(user_id)

    def find_by_user(self, user_id: str) -> List[Dict]:
        """Get all records for a user."""
        return self.find_all(filters={'user_id': user_id})
```

### ❌ DEPRECATED: Direct Database Access

**DO NOT** access database directly in services.

```python
# ❌ WRONG - Don't do this
from services.base_service import BaseService
from database import get_supabase_admin_client

class BadService(BaseService):
    def get_items(self, user_id: str):
        # ❌ Direct DB access in service
        supabase = get_supabase_admin_client()
        result = supabase.table('items').select('*').eq('user_id', user_id).execute()
        return result.data

    # ❌ Also wrong - using removed self.supabase property
    def get_items_v2(self, user_id: str):
        result = self.supabase.table('items').select('*').eq('user_id', user_id).execute()
        return result.data
```

**Why this is wrong**:
- Violates separation of concerns
- Makes testing difficult (can't mock DB)
- Duplicates DB logic across multiple services
- No centralized error handling for DB operations

### ❌ DEPRECATED: Static Method Pattern

**DO NOT** use @staticmethod with direct database calls.

```python
# ❌ WRONG - Don't do this
class BadService(BaseService):
    @staticmethod
    def get_items(user_id: str):
        # ❌ Static method with direct DB call
        supabase = get_supabase_admin_client()
        return supabase.table('items').select('*').execute().data
```

**Why this is wrong**:
- Can't inject dependencies (no constructor)
- Can't leverage BaseService utilities
- Encourages database access in service layer
- Makes refactoring harder

## Migration Guide

### For NEW Services

**Always** follow the repository pattern from the start:

1. Create repository first
2. Implement service with repository injection
3. Never add direct database calls

### For EXISTING Services

**Incremental migration** - refactor when you touch a service for other work:

1. Identify all database queries in the service
2. Move queries to repository (create new methods if needed)
3. Update service to use repository methods
4. Remove direct client usage
5. Test thoroughly

**Example Migration**:

```python
# BEFORE - Direct DB access
class LegacyService(BaseService):
    def get_items(self, user_id: str):
        items = self.supabase.table('items').select('*').eq('user_id', user_id).execute()
        return items.data

# STEP 1: Add repository method
class ItemRepository(BaseRepository):
    table_name = 'items'

    def find_by_user(self, user_id: str):
        return self.find_all(filters={'user_id': user_id})

# STEP 2: Update service
class ModernService(BaseService):
    def __init__(self):
        super().__init__()
        self.item_repo = ItemRepository()

    def get_items(self, user_id: str):
        return self.item_repo.find_by_user(user_id)
```

## When to Use Services

Use services for:
- **Business logic** (validation, calculations, workflows)
- **Orchestration** (coordinating multiple repositories)
- **Cross-cutting concerns** (logging, error handling, retries)

**Example**:

```python
class QuestEnrollmentService(BaseService):
    def __init__(self):
        super().__init__()
        self.quest_repo = QuestRepository()
        self.user_repo = UserRepository()
        self.xp_repo = XPRepository()

    def enroll_user(self, user_id: str, quest_id: str) -> Dict:
        """Enroll user in quest with all necessary checks."""
        # Business logic: validate prerequisites
        quest = self.quest_repo.find_by_id(quest_id)
        if not quest:
            raise ValueError("Quest not found")

        user = self.user_repo.find_by_id(user_id)
        if not self._meets_prerequisites(user, quest):
            raise ValueError("User doesn't meet prerequisites")

        # Orchestration: create enrollment + update XP
        enrollment = self.quest_repo.create_enrollment(user_id, quest_id)
        self.xp_repo.award_bonus(user_id, amount=10, reason="quest_start")

        return enrollment
```

## BaseService Utilities

BaseService provides utilities for common patterns (NO database access):

### Validation

```python
class MyService(BaseService):
    def create_item(self, user_id: str, title: str):
        # Validate required fields
        self.validate_required(user_id=user_id, title=title)

        # Validate enum values
        self.validate_one_of('status', 'active', ['active', 'inactive', 'pending'])

        # Continue with business logic...
```

### Retry Logic

```python
class MyService(BaseService):
    def risky_operation(self, data: Dict):
        return self.execute(
            operation=lambda: self._do_work(data),
            operation_name="risky_operation",
            retries=3,
            retry_delay=1.0
        )
```

## Common Patterns

### Pattern 1: Simple CRUD Service

```python
class ItemService(BaseService):
    def __init__(self):
        super().__init__()
        self.repo = ItemRepository()

    def get_all(self):
        return self.repo.find_all()

    def get_by_id(self, item_id: str):
        item = self.repo.find_by_id(item_id)
        if not item:
            raise ValueError(f"Item {item_id} not found")
        return item

    def create(self, data: Dict):
        self.validate_required(**data)
        return self.repo.create(data)

    def update(self, item_id: str, data: Dict):
        return self.repo.update(item_id, data)

    def delete(self, item_id: str):
        return self.repo.delete(item_id)
```

### Pattern 2: Multi-Repository Orchestration

```python
class CheckinService(BaseService):
    def __init__(self):
        super().__init__()
        self.checkin_repo = CheckinRepository()
        self.quest_repo = QuestRepository()  # Need quest data

    def create_checkin(self, advisor_id: str, student_id: str, notes: str):
        # Verify relationship (uses checkin_repo)
        if not self.checkin_repo.verify_advisor_student_relationship(advisor_id, student_id):
            raise ValueError("No relationship found")

        # Get active quests (uses quest_repo)
        quests = self.quest_repo.find_active_by_user(student_id)

        # Create checkin (uses checkin_repo)
        return self.checkin_repo.create({
            'advisor_id': advisor_id,
            'student_id': student_id,
            'notes': notes,
            'quests_snapshot': quests
        })
```

### Pattern 3: Business Logic Heavy Service

```python
class BadgeProgressService(BaseService):
    def __init__(self):
        super().__init__()
        self.badge_repo = BadgeRepository()
        self.quest_repo = QuestRepository()
        self.xp_repo = XPRepository()

    def calculate_progress(self, user_id: str, badge_id: str) -> Dict:
        """Calculate badge completion progress (complex business logic)."""
        badge = self.badge_repo.find_by_id(badge_id)
        completed_quests = self.quest_repo.count_completed_by_user(user_id)
        total_xp = self.xp_repo.get_total_by_user(user_id)

        # Business logic: calculate progress
        quest_progress = completed_quests / badge['required_quests']
        xp_progress = total_xp / badge['required_xp']
        overall = (quest_progress + xp_progress) / 2

        return {
            'badge_id': badge_id,
            'progress': overall,
            'quests_completed': completed_quests,
            'total_xp': total_xp,
            'is_complete': overall >= 1.0
        }
```

## Testing Services

With repository injection, services are easy to test:

```python
# tests/test_my_service.py
from unittest.mock import Mock
from services.my_service import MyService

def test_get_items():
    # Create mock repository
    mock_repo = Mock()
    mock_repo.find_by_user.return_value = [{'id': '1', 'title': 'Test'}]

    # Inject mock into service
    service = MyService()
    service.repo = mock_repo

    # Test service logic
    result = service.get_items('user123')

    # Verify
    assert len(result) == 1
    mock_repo.find_by_user.assert_called_once_with('user123')
```

## Migration Status

### Exemplar Services (Reference these)
- ✅ organization_service.py - Perfect repository pattern
- ✅ checkin_service.py - Multi-repository orchestration

### Services Using OLD Pattern (Migrate when touched)
- ⚠️ badge_service.py - Static methods, direct DB calls
- ⚠️ xp_service.py - Uses self.supabase
- ⚠️ analytics_service.py - Complex queries, needs refactor
- ... (see SERVICE_CLASSIFICATION.md for full list)

### Enforcement
- **Code reviews**: All NEW services must follow repository pattern
- **Incremental**: OLD services migrate when touched for other work
- **No sprints**: No dedicated migration time allocated

---

## Quick Reference

| Task | ✅ DO THIS | ❌ NOT THIS |
|------|-----------|-------------|
| Get data | `self.repo.find_all()` | `self.supabase.table().select()` |
| Create record | `self.repo.create(data)` | `get_supabase_admin_client().table().insert()` |
| Business logic | In service method | In repository |
| Database queries | In repository method | In service |
| Validation | In service using `self.validate_required()` | Scattered everywhere |
| Error handling | In service using `self.execute()` | Try/except in every method |

---

**See Also**:
- [SERVICE_CLASSIFICATION.md](SERVICE_CLASSIFICATION.md) - Full service inventory
- [P1-ARCH-4-SERVICE-LAYER-REFACTORING-PLAN.md](P1-ARCH-4-SERVICE-LAYER-REFACTORING-PLAN.md) - Detailed refactoring plan
- [REPOSITORY_PATTERN.md](REPOSITORY_PATTERN.md) - Repository implementation guide

**Questions?** Check exemplar services: organization_service.py, checkin_service.py
