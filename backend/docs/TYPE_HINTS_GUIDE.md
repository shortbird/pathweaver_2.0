# Python Type Hints Guide

**Created**: December 2025
**Status**: Incremental adoption (P3-STYLE-2)
**Priority**: Low (enforce for new code, migrate old code opportunistically)

## Overview

Type hints improve code quality by:
- Catching bugs at development time (with mypy)
- Improving IDE autocomplete and refactoring
- Serving as inline documentation
- Making code more maintainable

## Standard Patterns

### Basic Function Signatures

```python
from typing import Optional, List, Dict, Any, Tuple

# Simple function with return type
def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    """Fetch user by ID."""
    return db.table('users').select('*').eq('id', user_id).single().execute()

# Function with multiple parameters
def create_quest(
    title: str,
    description: str,
    xp_value: int,
    user_id: Optional[str] = None
) -> Dict[str, Any]:
    """Create a new quest."""
    pass

# Function with no return value
def send_notification(user_id: str, message: str) -> None:
    """Send notification to user."""
    pass
```

### Common Type Patterns

```python
from typing import Optional, List, Dict, Any, Union, Tuple

# Optional parameters (can be None)
def get_quests(user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    pass

# Union types (multiple possible types)
def process_id(id_value: Union[str, int]) -> str:
    return str(id_value)

# Tuple types (fixed-length sequences)
def get_user_stats(user_id: str) -> Tuple[int, int, float]:
    """Returns (total_quests, completed_quests, completion_rate)."""
    return (10, 7, 0.7)

# List of specific type
def get_user_ids() -> List[str]:
    return ['user1', 'user2', 'user3']

# Dictionary with specific key/value types
def get_user_xp_by_pillar() -> Dict[str, int]:
    return {'stem': 100, 'wellness': 50}
```

### Class Method Type Hints

```python
from typing import Optional, Dict, Any, List

class QuestService:
    """Service for quest operations."""

    def __init__(self, repository: 'QuestRepository') -> None:
        """Initialize service with repository."""
        self.repository = repository

    def get_quest(self, quest_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """Get quest by ID."""
        return self.repository.get_by_id(quest_id)

    def list_quests(
        self,
        user_id: str,
        limit: int = 20,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """List quests with pagination."""
        return self.repository.list_all(limit=limit, offset=offset)
```

### Repository Type Hints

```python
from typing import Optional, Dict, Any, List
from repositories.base_repository import BaseRepository

class UserRepository(BaseRepository):
    """Repository for user data access."""

    def __init__(self, client: Any) -> None:
        """Initialize with Supabase client."""
        super().__init__(client, 'users')

    def get_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get user by email address."""
        result = self.client.table(self.table_name)\
            .select('*')\
            .eq('email', email)\
            .single()\
            .execute()
        return result.data if result.data else None

    def update_xp(self, user_id: str, xp_amount: int) -> Dict[str, Any]:
        """Update user's total XP."""
        result = self.client.table(self.table_name)\
            .update({'total_xp': xp_amount})\
            .eq('id', user_id)\
            .execute()
        return result.data[0]
```

### Flask Route Type Hints

```python
from typing import Tuple, Dict, Any
from flask import Response, jsonify

# Route with tuple return (response, status_code)
@app.route('/api/quests/<quest_id>')
def get_quest(quest_id: str) -> Tuple[Response, int]:
    """Get quest by ID."""
    quest = quest_service.get_quest(quest_id)
    if not quest:
        return jsonify({'error': 'Quest not found'}), 404
    return jsonify(quest), 200

# Route with dict return (auto-converted to JSON by Flask)
@app.route('/api/user/profile')
def get_profile() -> Dict[str, Any]:
    """Get user profile."""
    user_id = get_current_user_id()
    return user_service.get_profile(user_id)
```

### Custom Type Aliases

```python
from typing import Dict, Any, List, TypedDict

# Type alias for complex types
UserId = str
QuestId = str
UserData = Dict[str, Any]
QuestList = List[Dict[str, Any]]

def enroll_user(user_id: UserId, quest_id: QuestId) -> UserData:
    """Enroll user in quest."""
    pass

# TypedDict for structured dictionaries (Python 3.8+)
class UserProfile(TypedDict):
    id: str
    email: str
    display_name: str
    total_xp: int
    role: str

def get_user_profile(user_id: str) -> UserProfile:
    """Get typed user profile."""
    pass
```

## Gradual Adoption Strategy

Following the same pragmatic approach as repository migration:

### Phase 1: Foundation (Completed)
- Set up mypy configuration
- Document type hints standards
- Add type hints to example files

### Phase 2: New Code Enforcement
- ALL new functions MUST have type hints
- Code reviews check for type hints
- CI/CD runs mypy on new code

### Phase 3: Incremental Migration
- Add type hints when touching old files for other work
- NO dedicated migration sprints
- Focus on high-value files (services, repositories, utils)

### Phase 4: Monitoring
- Track type hint coverage over time
- Run mypy in CI to prevent regressions

## Mypy Configuration

See `backend/mypy.ini` for configuration. Key settings:

```ini
[mypy]
python_version = 3.11
warn_return_any = True
warn_unused_configs = True
disallow_untyped_defs = False  # Start permissive, tighten over time
ignore_missing_imports = True  # Many third-party libs lack stubs
```

## Running Type Checks

```bash
# Check all files
mypy backend/

# Check specific file
mypy backend/services/quest_service.py

# Check with strict mode
mypy --strict backend/services/quest_service.py
```

## Priority Order

1. **High Priority** (add type hints when touched):
   - Services (45 files)
   - Repositories (18 files)
   - Utils (common helper functions)

2. **Medium Priority**:
   - Routes (74 files)
   - Middleware

3. **Low Priority**:
   - Scripts
   - Tests (type hints less critical)

## Common Pitfalls

### Avoid `Any` Overuse

```python
# Bad - defeats purpose of type hints
def process_data(data: Any) -> Any:
    pass

# Good - be specific
def process_user(user: Dict[str, Any]) -> Optional[str]:
    pass
```

### Use Optional for Nullable Returns

```python
# Bad - unclear if None is possible
def get_user(user_id: str) -> Dict[str, Any]:
    result = db.query(user_id)
    return result  # Could be None!

# Good - explicit about None
def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    result = db.query(user_id)
    return result  # Caller knows to check for None
```

### Don't Forget Return Types

```python
# Bad - no return type
def calculate_xp(base: int, multiplier: float):
    return int(base * multiplier)

# Good - explicit return type
def calculate_xp(base: int, multiplier: float) -> int:
    return int(base * multiplier)
```

## Migration Examples

### Before (No Type Hints)

```python
def get_quest_with_tasks(quest_id, user_id):
    quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
    if not quest.data:
        return None

    tasks = supabase.table('user_quest_tasks')\
        .select('*')\
        .eq('quest_id', quest_id)\
        .eq('user_id', user_id)\
        .execute()

    quest.data['tasks'] = tasks.data
    return quest.data
```

### After (With Type Hints)

```python
from typing import Optional, Dict, Any, List

def get_quest_with_tasks(
    quest_id: str,
    user_id: str
) -> Optional[Dict[str, Any]]:
    """
    Get quest with associated tasks for a user.

    Args:
        quest_id: UUID of the quest
        user_id: UUID of the user

    Returns:
        Quest data with tasks, or None if quest not found
    """
    quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()
    if not quest.data:
        return None

    tasks = supabase.table('user_quest_tasks')\
        .select('*')\
        .eq('quest_id', quest_id)\
        .eq('user_id', user_id)\
        .execute()

    quest.data['tasks'] = tasks.data
    return quest.data
```

## Resources

- Python Typing Documentation: https://docs.python.org/3/library/typing.html
- Mypy Documentation: https://mypy.readthedocs.io/
- Real Python Type Hints Guide: https://realpython.com/python-type-checking/

## Related Documents

- [Repository Pattern Guide](REPOSITORY_PATTERN.md)
- [Service Layer Pattern Guide](SERVICE_LAYER_PATTERN_GUIDE.md)
- [Exception Handling Guide](EXCEPTION_HANDLING_GUIDE.md)
