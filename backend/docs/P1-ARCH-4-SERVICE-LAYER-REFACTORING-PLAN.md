# P1-ARCH-4: Service Layer Refactoring Plan

**Created**: December 19, 2025
**Status**: PATTERN ESTABLISHED ✅ (Pragmatic Approach)
**Priority**: P1 (High - Last remaining P1 item)
**Approach**: Incremental migration (not full refactoring)

## DECISION: Pragmatic Approach (Dec 19, 2025)

Similar to repository pattern migration, we established the pattern rather than forcing complete migration:

✅ **COMPLETED**:
- Removed client management from BaseService
- Documented pattern with exemplar services (organization_service.py)
- Added migration guide and comments throughout codebase

🎯 **ENFORCEMENT**:
- All NEW services MUST use repository pattern (enforced in code reviews)
- Old services: migrate when touched for other work (opportunistic refactoring)
- P1-ARCH-4 marked as "established" not "complete"

**Why this approach?**
- Lower risk (no big-bang changes to 21 critical services)
- Better use of time (no dedicated 2-3 week migration sprint)
- Natural evolution (same pattern as successful repository rollout)
- Same end result, just achieved incrementally

## Problem Statement

Both `BaseService` and `BaseRepository` independently manage Supabase clients, creating architectural confusion and violating separation of concerns:

- **BaseService** (lines 82-112): Has `@property supabase` and `get_user_supabase()` methods
- **BaseRepository** (lines 70-117): Has `@property client` that manages both user and admin clients

This duplication means:
1. Services can bypass repositories and access database directly
2. Unclear responsibility - who manages client lifecycle?
3. Inconsistent patterns across codebase

## Solution

Services should ONLY use repositories for database access. Never direct DB operations.

### Architecture Changes

```python
# BEFORE (Current):
class MyService(BaseService):
    def do_something(self, user_id):
        # BAD: Direct DB access via BaseService.supabase
        data = self.supabase.table('users').select('*').eq('id', user_id).execute()
        return data

# AFTER (Target):
class MyService(BaseService):
    def __init__(self, user_repo: UserRepository):
        super().__init__()
        self.user_repo = user_repo

    def do_something(self, user_id):
        # GOOD: Access DB through repository
        data = self.user_repo.find_by_id(user_id)
        return data
```

## Implementation Steps

### Phase 1: Update BaseService (Week 1, Days 1-2)

**File**: `backend/services/base_service.py`

**Changes**:
1. Remove lines 81-112 (client management methods):
   - Remove `@property supabase`
   - Remove `get_user_supabase()` method
2. Keep utility methods (execute, validate_required, etc.)
3. Update constructor to not initialize `_admin_client` and `_user_client`

**Affected Lines**:
```python
# REMOVE:
    def __init__(self, user_id: Optional[str] = None):
        self.user_id = user_id
        self._admin_client = None  # REMOVE
        self._user_client = None   # REMOVE

    @property
    def supabase(self):  # REMOVE ENTIRE METHOD
        """Get admin Supabase client (no RLS)."""
        if self._admin_client is None:
            self._admin_client = get_supabase_admin_client()
        return self._admin_client

    def get_user_supabase(self, user_id: Optional[str] = None):  # REMOVE ENTIRE METHOD
        ...

# KEEP:
    def execute(...)  # Keep
    def _log_operation(...)  # Keep
    def validate_required(...)  # Keep
    def validate_one_of(...)  # Keep
```

**New Constructor**:
```python
def __init__(self):
    """
    Initialize service.

    Repositories should be injected via subclass constructors.
    Services should NOT access database directly.
    """
    pass  # No client management
```

---

### Phase 2: Inventory Services (Week 1, Days 3-5)

**Goal**: Classify all 45 services by their database access patterns

#### Service Categories

**Category A: Static Method Services (No BaseService usage)**
These claim to extend BaseService but use only static methods. Need complete rewrite.

- `badge_service.py` - All @staticmethod, calls get_supabase_admin_client() directly
- TBD (need to audit remaining services)

**Category B: Proper BaseService Usage**
These use `self.supabase` and would break immediately. Need repository injection.

- `xp_service.py` - Uses `self.supabase.table('user_skill_xp')` (lines 96, 178, etc.)
- TBD (need to audit)

**Category C: No Database Access**
These don't need BaseService at all. Can remove inheritance.

- `evidence_service.py` - Only validation logic, no DB operations
- TBD (need to audit)

**Action**: Create inventory spreadsheet with:
- Service name
- Category (A/B/C)
- Repositories needed
- Estimated refactoring complexity (1-5)
- Notes

---

### Phase 3: Create Missing Repositories (Week 2)

**Goal**: Ensure repository exists for every table that services access

#### Current Repositories (18 total)
- `badge_repository.py`
- `analytics_repository.py`
- `evidence_repository.py`
- `lms_repository.py`
- `user_repository.py`
- `tutor_repository.py`
- `parent_repository.py`
- `checkin_repository.py`
- `advisor_notes_repository.py`
- `friendship_repository.py`
- `task_repository.py`
- `crm_repository.py`
- `organization_repository.py`
- `dependent_repository.py`
- `quest_repository.py`
- `site_settings_repository.py`
- `evidence_document_repository.py`
- `base_repository.py`

#### Potentially Missing Repositories
Need to audit services to see what tables they access and create repositories if missing:
- `user_skill_xp` → Create `XPRepository`?
- `user_badges` → Extend `BadgeRepository`?
- `quest_task_completions` → Create `TaskCompletionRepository`?
- `user_quests` → Create `UserQuestRepository`?
- TBD (need to check service queries)

**Action**:
1. Audit all service DB queries
2. Create list of missing repositories
3. Implement missing repositories following BaseRepository pattern

---

### Phase 4: Refactor Services (Week 2-3)

**Priority Order**: Refactor in order of risk (low to high)

#### Tier 1: Low-Risk Services (No BaseService usage)
These are safe to refactor first as they don't use BaseService database features.

**Example: evidence_service.py**
```python
# BEFORE:
class EvidenceService(BaseService):
    def __init__(self, upload_folder: str = 'uploads/evidence'):
        self.upload_folder = upload_folder
        os.makedirs(upload_folder, exist_ok=True)

# AFTER:
class EvidenceService:  # Remove BaseService inheritance
    def __init__(self, upload_folder: str = 'uploads/evidence'):
        self.upload_folder = upload_folder
        os.makedirs(upload_folder, exist_ok=True)
```

#### Tier 2: Medium-Risk Services (Simple DB queries)
Services with straightforward CRUD operations through repositories.

**Example: xp_service.py**
```python
# BEFORE:
class XPService(BaseService):
    def award_xp(self, user_id: str, pillar: str, xp_amount: int):
        current_xp = self.supabase.table('user_skill_xp')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('pillar', pillar)\
            .execute()

# AFTER:
class XPService(BaseService):
    def __init__(self, xp_repo: XPRepository, user_repo: UserRepository):
        super().__init__()
        self.xp_repo = xp_repo
        self.user_repo = user_repo

    def award_xp(self, user_id: str, pillar: str, xp_amount: int):
        current_xp = self.xp_repo.find_by_user_and_pillar(user_id, pillar)
```

#### Tier 3: High-Risk Services (Complex queries or @staticmethod)
Services with complex multi-table queries or static method patterns.

**Example: badge_service.py**
```python
# BEFORE:
class BadgeService(BaseService):
    @staticmethod
    def get_available_badges(user_id: Optional[str] = None):
        supabase = get_supabase_admin_client()
        query = supabase.table('badges').select('*')
        ...

# AFTER:
class BadgeService(BaseService):
    def __init__(self, badge_repo: BadgeRepository, user_badge_repo: UserBadgeRepository):
        super().__init__()
        self.badge_repo = badge_repo
        self.user_badge_repo = user_badge_repo

    def get_available_badges(self, user_id: Optional[str] = None):
        badges = self.badge_repo.find_all(filters={'status': ['active', 'beta']})
        ...
```

**Action for each service**:
1. Identify all database table accesses
2. Inject required repositories via constructor
3. Replace all `self.supabase.table(...)` with repository methods
4. Remove any `get_supabase_admin_client()` or `get_user_client()` direct calls
5. Update route files that instantiate the service

---

### Phase 5: Update Route Files (Week 3)

**Goal**: Update all routes that instantiate services to pass repositories

**Pattern**:
```python
# BEFORE:
from services.badge_service import BadgeService
@app.route('/api/badges')
def get_badges():
    badges = BadgeService.get_available_badges(user_id)  # Static method
    return jsonify(badges)

# AFTER:
from services.badge_service import BadgeService
from repositories.badge_repository import BadgeRepository
from repositories.user_badge_repository import UserBadgeRepository

@app.route('/api/badges')
def get_badges():
    badge_repo = BadgeRepository(user_id=user_id)
    user_badge_repo = UserBadgeRepository(user_id=user_id)
    badge_service = BadgeService(badge_repo=badge_repo, user_badge_repo=user_badge_repo)
    badges = badge_service.get_available_badges(user_id)
    return jsonify(badges)
```

**Optimization**: Consider dependency injection container for cleaner route code

---

### Phase 6: Testing (Week 3)

**Critical Testing Areas**:
1. Authentication flows (login, logout, token refresh)
2. Quest enrollment and task completion
3. Badge progression and claiming
4. XP calculations
5. Admin operations (users, quests, analytics)
6. Parent/advisor dashboards

**Test Approach**:
1. Run existing backend tests
2. Manual testing on https://optio-dev-frontend.onrender.com
3. Monitor Supabase logs for RLS errors
4. Check all route handlers work correctly

**Rollback Plan**:
- Keep backup branch before starting refactor
- If critical issues found, revert to backup
- Fix issues incrementally

---

## Risk Assessment

### High-Risk Changes
1. **badge_service.py** - Used everywhere, static methods need complete rewrite
2. **xp_service.py** - Core XP calculations, must maintain correctness
3. **quest_completion_service.py** - Critical path for user progress

**Mitigation**:
- Extensive manual testing
- Deploy to dev environment first
- Monitor error logs closely
- Have rollback plan ready

### Medium-Risk Changes
Services with moderate complexity or usage frequency

### Low-Risk Changes
Utility services with no database access or simple CRUD operations

---

## Success Criteria

- [ ] BaseService has NO client management methods
- [ ] All 45 services refactored to use repositories
- [ ] All route files updated to inject repositories
- [ ] All existing tests pass
- [ ] Manual testing complete on dev environment
- [ ] No RLS policy violations in logs
- [ ] No regression in user-facing features
- [ ] Performance maintained (no N+1 queries introduced)

---

## Open Questions

1. **Dependency Injection**: Should we implement a DI container for cleaner route code?
2. **Repository Factory**: Create factory pattern for repository instantiation?
3. **Service Lifecycle**: Should services be singletons or created per-request?
4. **Migration Strategy**: All at once or incremental (service by service)?

---

## Next Steps

1. Complete service inventory (classify all 45 services)
2. Identify missing repositories
3. Get approval from team/lead before proceeding
4. Begin Phase 1 (update BaseService)

---

**Document Owner**: Claude Code
**Last Updated**: December 19, 2025
**Status**: Draft - Awaiting Review
