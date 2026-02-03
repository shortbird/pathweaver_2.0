# ADR-001: Repository Pattern Migration

**Date**: December 19, 2025
**Status**: Accepted (Pragmatic Approach)
**Related**: P2-ARCH-2, Phase 3 Complete

---

## Context

The Optio platform codebase contains 74 route files with mixed approaches to database access:

1. **Direct database queries** - Routes directly call Supabase client methods
2. **Service layer pattern** - Business logic encapsulated in service classes
3. **Repository pattern** - Data access abstraction layer

Without a consistent pattern, the codebase suffers from:
- Code duplication across route files
- Difficult testing (can't mock database easily)
- Tight coupling between business logic and data access
- Inconsistent error handling
- Hard to track which queries exist

### Initial Assessment (December 2025)

After migrating 4 exemplar files to repository pattern:
- **4 files migrated** to repositories (tasks.py, settings.py, helper_evidence.py, community.py)
- **32 files already use services** (43% - proper abstraction via BaseService)
- **38 files use direct DB** for various reasons:
  - 15 files: Complex pagination/filtering
  - 10 files: Multi-table aggregations
  - 8 files: Mega-files requiring refactoring first
  - 5 files: Admin analytics with complex queries

**Key Insight**: Most files either (1) already use proper abstraction OR (2) legitimately need direct DB access for complex operations.

---

## Decision

We adopt a **pragmatic repository pattern** with the following rules:

### Rule 1: All NEW Code Uses Repository Pattern

**Every new route file MUST use repositories for data access.**

```python
# NEW routes (after December 2025)
from backend.repositories import TaskRepository

@bp.route('/tasks/<task_id>', methods=['GET'])
@require_auth
def get_task(user_id: str, task_id: str):
    """New code follows repository pattern"""
    task_repo = TaskRepository()
    task = task_repo.get_task_with_relations(task_id, user_id)
    return jsonify(task)
```

**Why**: Establishes consistent pattern going forward without forcing massive refactoring.

---

### Rule 2: Service Layer Pattern is Equivalent

**Service layer (BaseService) counts as proper abstraction.**

```python
# Acceptable alternative to repositories
from backend.services.quest_service import QuestService

@bp.route('/quests/<quest_id>', methods=['GET'])
@require_auth
def get_quest(quest_id: str):
    """Service layer is acceptable abstraction"""
    quest_service = QuestService()
    quest = quest_service.get_quest_with_enrollment(quest_id)
    return jsonify(quest)
```

**Why**: Services encapsulate business logic and provide testability. Don't force migration if services work.

---

### Rule 3: Direct DB Allowed for Complex Operations

**Complex queries (pagination, aggregation, multi-table JOINs) may use direct DB access.**

Acceptable use cases:
- Pagination with dynamic sorting/filtering
- Complex analytics aggregations
- Multi-table JOINs with conditional logic
- Performance-critical queries requiring optimization
- Admin dashboards with custom reporting

```python
# Acceptable direct DB usage
@bp.route('/admin/analytics/user-growth', methods=['GET'])
@require_admin
def get_user_growth_analytics():
    """Complex aggregation - direct DB acceptable"""
    supabase = get_supabase_admin_client()

    # Complex query with multiple JOINs and aggregations
    result = supabase.rpc('calculate_user_growth_metrics', {
        'start_date': start_date,
        'end_date': end_date,
        'group_by': 'week'
    }).execute()

    return jsonify(result.data)
```

**Why**: Repositories add complexity without benefit for one-off complex queries.

**Requirement**: Add comment explaining why direct DB is needed.

---

### Rule 4: Migrate OLD Code Incrementally

**Legacy files: migrate ONLY when touched for other work.**

```python
# When fixing bug in legacy route:
# 1. Fix the bug
# 2. IF simple CRUD, migrate to repository
# 3. IF complex query, leave as-is with comment
# 4. IF mega-file, split first (per P2-ARCH-1)
```

**Why**:
- No dedicated migration sprints (low ROI)
- Natural migration as code is maintained
- Focuses effort on actively-changed code

**Do NOT**:
- Force repository pattern on stable, working code
- Migrate mega-files without splitting them first
- Wrap complex queries in repository methods that just call Supabase

---

### Rule 5: Repositories for Common Patterns

**Use repositories for standard CRUD operations and common relationships.**

Available repositories (as of December 2025):
- `TaskRepository` - User quest tasks
- `TaskCompletionRepository` - Task completion records
- `QuestRepository` - Quest queries and enrollment
- `UserRepository` - User profile operations
- `BadgeRepository` - Badge management
- `EvidenceRepository` - Evidence uploads
- `FriendshipRepository` - Connection system
- `ParentRepository` - Parent-student linking
- `TutorRepository` - AI tutor conversations
- `LMSRepository` - LMS integration
- `AnalyticsRepository` - Admin analytics
- `OrganizationRepository` - Organization management
- `CheckinRepository` - Student check-ins
- `SiteSettingsRepository` - System settings

**When to create new repository**:
- Pattern repeats across 3+ files
- Standard CRUD with common relationships
- Clear domain boundary (users, quests, badges, etc.)

**When NOT to create repository**:
- One-off complex query
- Route-specific aggregation
- Temporary experimental feature

---

## Repository Pattern Guidelines

### Base Repository

All repositories extend `BaseRepository`:

```python
# backend/repositories/base_repository.py
class BaseRepository:
    """Base repository with common database operations"""

    def __init__(self, client=None):
        """Initialize with optional Supabase client"""
        self.client = client or get_supabase_admin_client()

    def get_by_id(self, table: str, id: str):
        """Get single record by ID"""
        response = self.client.table(table).select('*').eq('id', id).single().execute()
        return response.data

    # ... common methods
```

### Repository Structure

```python
# backend/repositories/task_repository.py
from backend.repositories.base_repository import BaseRepository

class TaskRepository(BaseRepository):
    """Repository for user quest tasks"""

    def get_task_with_relations(self, task_id: str, user_id: str):
        """Get task with quest and completion details"""
        response = self.client.table('user_quest_tasks').select('''
            *,
            quests!inner(id, title, description),
            quest_task_completions(id, completed_at)
        ''').eq('id', task_id).eq('user_id', user_id).single().execute()

        return response.data

    def get_user_active_tasks(self, user_id: str):
        """Get all active tasks for user"""
        # Common query pattern - belongs in repository
        # ...
```

**Guidelines**:
- Methods should encapsulate common patterns (not one-off queries)
- Methods should return data (not Response objects)
- Handle errors consistently
- Document parameters and return types

---

## Migration Status

### Phase 3 Complete ✅ (December 2025)

**Exemplar Files Migrated** (Repository Pattern):
1. `backend/routes/tasks.py` - Task CRUD operations
2. `backend/routes/settings.py` - Site settings management
3. `backend/routes/helper_evidence.py` - Evidence document operations
4. `backend/routes/community.py` - Social features

**Files Using Service Layer** (32 files, 43%):
- Already have proper abstraction via BaseService
- No migration needed

**Files Using Direct DB Appropriately** (38 files, 51%):
- Complex pagination/filtering: 15 files
- Multi-table aggregations: 10 files
- Mega-files (need splitting first): 8 files
- Admin analytics: 5 files

**Total Abstraction Coverage**: 48.4% (36 of 74 files)

---

## Decision Tree

```
New route file?
  └─ YES → MUST use Repository Pattern (Rule 1)

Existing file being modified?
  ├─ Already uses Service Layer?
  │    └─ YES → Keep Service Layer (Rule 2)
  │
  ├─ Simple CRUD operations?
  │    └─ YES → Migrate to Repository (Rule 4)
  │
  ├─ Complex query (pagination, aggregation, multi-table JOIN)?
  │    └─ YES → Keep direct DB with comment (Rule 3)
  │
  └─ Mega-file (>1000 lines)?
       └─ YES → Split first, then migrate (Rule 4 + P2-ARCH-1)
```

---

## Code Examples

### Example 1: NEW route (must use repository) ✅

```python
# backend/routes/achievements.py (NEW FILE - December 2025)
from backend.repositories import AchievementRepository

@bp.route('/achievements', methods=['GET'])
@require_auth
def get_user_achievements(user_id: str):
    """New code - repository pattern required"""
    achievement_repo = AchievementRepository()
    achievements = achievement_repo.get_user_achievements(user_id)
    return jsonify(achievements)
```

### Example 2: Service layer (acceptable) ✅

```python
# backend/routes/quests.py (uses QuestService)
from backend.services.quest_service import QuestService

@bp.route('/quests/<quest_id>', methods=['GET'])
@require_auth
def get_quest_detail(quest_id: str):
    """Service layer counts as abstraction - no migration needed"""
    quest_service = QuestService()
    quest = quest_service.get_quest_with_enrollment(quest_id)
    return jsonify(quest)
```

### Example 3: Complex query (direct DB acceptable) ✅

```python
# backend/routes/admin/analytics.py
@bp.route('/admin/analytics/engagement', methods=['GET'])
@require_admin
def get_engagement_metrics():
    """
    Complex analytics aggregation - direct DB acceptable.
    Requires multiple JOINs, conditional aggregations, and date windowing.
    Too complex for repository pattern (Rule 3).
    """
    supabase = get_supabase_admin_client()

    # Complex query with multiple CTEs
    result = supabase.rpc('calculate_weekly_engagement', {
        'weeks': 12,
        'cohort_date': cohort_date
    }).execute()

    return jsonify(result.data)
```

### Example 4: Legacy file needing migration ⚠️

```python
# backend/routes/old_tasks.py (legacy - migrate when touched)
@bp.route('/tasks/<task_id>', methods=['GET'])
@require_auth
def get_task(user_id: str, task_id: str):
    """Legacy direct DB - should migrate to repository when touched"""
    supabase = get_user_client()

    # Simple CRUD - good candidate for repository
    task = supabase.table('user_quest_tasks')\
        .select('*')\
        .eq('id', task_id)\
        .eq('user_id', user_id)\
        .single()\
        .execute()

    return jsonify(task.data)
```

**Migration path**:
```python
# After migration
from backend.repositories import TaskRepository

@bp.route('/tasks/<task_id>', methods=['GET'])
@require_auth
def get_task(user_id: str, task_id: str):
    """Migrated to repository pattern"""
    task_repo = TaskRepository()
    task = task_repo.get_task_by_id(task_id, user_id)
    return jsonify(task)
```

---

## Consequences

### Positive

1. **Consistent pattern for new code** - All new routes follow repository pattern
2. **No forced refactoring** - Existing code migrates naturally as touched
3. **Respects complexity** - Complex queries can stay as direct DB access
4. **Service layer recognized** - 43% of code already has proper abstraction
5. **Clear guidelines** - Decision tree removes ambiguity

### Negative

1. **Mixed patterns** - Codebase will have repositories, services, and direct DB
2. **Learning curve** - Developers need to know when to use which pattern
3. **Incomplete migration** - 51% of files will remain with direct DB access

### Neutral

1. **Gradual improvement** - Quality improves over time without disruption
2. **Pragmatic tradeoffs** - Accepts reality of complex queries and legacy code
3. **Documentation-driven** - Success depends on ADR enforcement

---

## Migration Guidelines

### For Code Reviews

**Checklist for NEW route files**:
- [ ] Uses repository pattern (not direct DB)
- [ ] Repository methods are reusable (not one-off queries)
- [ ] Repository extends BaseRepository
- [ ] Error handling is consistent

**Checklist for MODIFIED route files**:
- [ ] If simple CRUD, migrated to repository
- [ ] If complex query, comment explains why direct DB
- [ ] If using service layer, left as-is
- [ ] If mega-file, created issue for splitting

### Creating New Repositories

**Before creating new repository**:
1. Check if existing repository covers this domain
2. Ensure pattern repeats across 3+ files (or will in future)
3. Define clear domain boundary
4. Extend BaseRepository

**Repository naming**:
- Singular noun + "Repository" (e.g., `TaskRepository`, not `TasksRepository`)
- Matches primary table name when possible
- Clear domain focus (not `HelperRepository` or `UtilityRepository`)

---

## Related ADRs

- [ADR-002: Database Client Usage](002-database-client-usage.md)
- [ADR-003: httpOnly Cookie Authentication](003-httponly-cookie-authentication.md)
- [ADR-004: Safari/iOS Compatibility](004-safari-ios-compatibility.md)

---

## References

- Repository Pattern: https://martinfowler.com/eaaCatalog/repository.html
- Migration status: `backend/docs/REPOSITORY_MIGRATION_STATUS.md`
- Service layer pattern: `backend/docs/SERVICE_LAYER_PATTERN_GUIDE.md`
- Original decision: `COMPREHENSIVE_CODEBASE_REVIEW.md` (Phase 3)

---

## Questions & Exceptions

**Q: When should I create a new repository vs. add method to existing?**

A: Add to existing if the table is related to the repository's domain. Create new if it's a different domain boundary.

Example:
- `task_repo.get_task_completions()` ✅ (tasks domain)
- `task_repo.get_user_badges()` ❌ (badges domain - use BadgeRepository)

**Q: What if my query is complex but repeats across files?**

A: Create repository method that encapsulates the complexity. Repositories can contain complex queries if they're reusable.

**Q: Should repositories use other repositories?**

A: Yes, but avoid deep nesting. Repositories can compose other repositories for related data.

```python
class TaskRepository(BaseRepository):
    def get_task_with_quest_details(self, task_id: str):
        task = self.get_by_id('user_quest_tasks', task_id)
        quest_repo = QuestRepository(client=self.client)
        task['quest'] = quest_repo.get_by_id('quests', task['quest_id'])
        return task
```

---

**Last Updated**: December 19, 2025
**Author**: Development Team
**Status**: Accepted and Enforced
