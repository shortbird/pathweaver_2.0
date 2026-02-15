# Refactoring Plan

**Generated**: February 2026
**Status**: Phase 2 Complete

## Completed Work

### Phase 1: Partially Migrated Files (COMPLETE)
- helper_evidence.py - Uses AdvisorRepository
- parent_connections.py - Uses ParentRepository (6 endpoints migrated)
- user_management.py - Extended UserRepository with 12 new admin methods
- quest_management.py - Extended QuestRepository with admin methods

### Phase 2: High-Value Migration Candidates (COMPLETE)
- portfolio.py - Created PortfolioService (1362 lines -> 330 lines)
- dashboard.py - Created DashboardService (612 lines -> 61 lines)
- profile.py - Uses UserRepository + DashboardService (160 lines -> 135 lines)
- quest_lifecycle.py - Created QuestLifecycleService (368 lines -> 197 lines)

### New Services Created
- `services/portfolio_service.py` - Diploma/portfolio data aggregation
- `services/dashboard_service.py` - Dashboard data aggregation
- `services/quest_lifecycle_service.py` - Quest pickup/setdown workflow

### New Repositories Created
- `repositories/advisor_repository.py` - Advisor-student assignments

---

This document outlines recommended refactoring work to improve code maintainability, reduce technical debt, and complete ongoing migrations.

---

## Priority 1: Complete Partially Migrated Files (DONE)

These files have mixed patterns (some repository usage, some direct DB access) which creates inconsistency and maintenance burden.

### 1.1 helper_evidence.py
- **Location**: `backend/routes/helper_evidence.py`
- **Status**: PARTIALLY MIGRATED
- **Issue**: Mixed repository and direct Supabase calls
- **Action**: Complete migration to use `EvidenceRepository` consistently
- **Effort**: Low (2-3 hours)

### 1.2 user_management.py
- **Location**: `backend/routes/admin/user_management.py`
- **Status**: PARTIALLY MIGRATED
- **Issue**: Some endpoints use `UserRepository`, others use direct queries
- **Action**: Migrate remaining endpoints to `UserRepository`
- **Effort**: Medium (4-6 hours)

### 1.3 quest_management.py
- **Location**: `backend/routes/admin/quest_management.py`
- **Status**: PARTIALLY MIGRATED
- **Issue**: Inconsistent data access patterns
- **Action**: Complete migration to `QuestRepository`
- **Effort**: Medium (4-6 hours)

### 1.4 parent_connections.py
- **Location**: `backend/routes/admin/parent_connections.py`
- **Status**: PARTIALLY MIGRATED
- **Issue**: Mixed patterns for parent-child relationship queries
- **Action**: Complete migration to `ParentRepository`
- **Effort**: Low (2-3 hours)

---

## Priority 2: High-Value Migration Candidates (DONE)

These files would significantly benefit from repository pattern adoption.

### 2.1 portfolio.py (HIGH PRIORITY)
- **Location**: `backend/routes/portfolio.py`
- **Current**: Direct queries across multiple tables (users, quests, tasks, evidence)
- **Recommended**: Create `PortfolioRepository` or use existing repos with a `PortfolioService`
- **Benefit**: Cleaner separation, easier testing, consistent error handling
- **Effort**: Medium (6-8 hours)

### 2.2 dashboard.py
- **Location**: `backend/routes/users/dashboard.py`
- **Current**: Complex aggregation queries inline
- **Recommended**: Create `DashboardRepository` with methods:
  - `get_user_subject_xp(user_id)`
  - `get_dashboard_summary(user_id)`
  - `get_user_progress_stats(user_id)`
- **Benefit**: Encapsulates complex joins, enables caching
- **Effort**: Medium (6-8 hours)

### 2.3 profile.py
- **Location**: `backend/routes/users/profile.py`
- **Current**: Direct queries for user profile data
- **Recommended**: Extend `UserRepository` with profile-specific methods
- **Effort**: Low (3-4 hours)

### 2.4 quest_lifecycle.py
- **Location**: `backend/routes/quest_lifecycle.py`
- **Current**: Direct queries for quest state transitions
- **Recommended**: Use `QuestRepository` methods
- **Effort**: Medium (4-6 hours)

---

## Priority 3: Large File Splitting

### 3.1 curriculum_upload_service.py (1,963 lines)
- **Location**: `backend/services/curriculum_upload_service.py`
- **Current**: Single class with 30+ methods handling parsing, AI, validation, DB
- **Recommended Split**:

```
services/curriculum/
├── __init__.py
├── parser.py              # CurriculumParser - file parsing (PDF, IMSCC)
├── structure_detector.py  # StructureDetector - AI structure detection
├── philosophy_aligner.py  # PhilosophyAligner - educational philosophy alignment
├── content_generator.py   # ContentGenerator - lesson/task generation
└── upload_orchestrator.py # Main orchestrator using above services
```

- **Effort**: High (1-2 days)

### 3.2 course_generation_service.py (1,151 lines)
- **Location**: `backend/services/course_generation_service.py`
- **Current**: Single class handling outline, lessons, tasks, finalization
- **Recommended Split**:

```
services/course_generation/
├── __init__.py
├── outline_generator.py   # Topic -> course outline
├── lesson_generator.py    # Project -> lessons with content
├── task_generator.py      # Lesson -> suggested tasks
└── course_finalizer.py    # Publishing and validation
```

- **Effort**: Medium (6-8 hours)

### 3.3 useCourseBuilderState.js (1,117 lines)
- **Location**: `frontend/src/hooks/useCourseBuilderState.js`
- **Current**: Single hook with ~20 useState calls and all handlers
- **Recommended Split**:

```
hooks/courseBuilder/
├── index.js                    # Re-exports combined hook
├── useCourseState.js          # Course-level state and handlers
├── useProjectState.js         # Project/quest management
├── useLessonState.js          # Lesson CRUD and ordering
├── useTaskState.js            # Task management
├── useSelectionState.js       # Selection and navigation
└── useModalState.js           # Modal visibility states
```

- **Effort**: Medium (6-8 hours)

### 3.4 analytics.py (836 lines)
- **Location**: `backend/routes/admin/analytics.py`
- **Current**: 8 route handlers, some 100+ lines each
- **Recommended Split**:

```
routes/admin/analytics/
├── __init__.py           # Blueprint registration
├── overview.py           # /overview endpoint
├── activity.py           # /activity, /user/<id>/activity
├── trends.py             # /trends endpoint
├── health.py             # /health endpoint
├── spark.py              # /spark-logs endpoint
└── user_journey.py       # /user/<id>/journey endpoint
```

- **Effort**: Low (3-4 hours)

---

## Priority 4: Other Migration Candidates

Lower priority but should be addressed over time:

| File | Location | Notes |
|------|----------|-------|
| `parental_consent.py` | `routes/` | Simple, low traffic |
| `account_deletion.py` | `routes/` | Critical path, needs care |
| `calendar.py` | `routes/` | Low complexity |
| `observer_requests.py` | `routes/` | Use existing repos |
| `promo.py` | `routes/` | Simple CRUD |
| `parent_linking.py` | `routes/` | Use ParentRepository |
| `services.py` | `routes/` | Mixed utilities |
| `task_library.py` | `routes/` | Use TaskRepository |
| `transcript.py` | `routes/users/` | Complex, needs planning |
| `completed_quests.py` | `routes/users/` | Use QuestRepository |
| `task_approval.py` | `routes/admin/` | Use TaskRepository |
| `ai_quest_review.py` | `routes/admin/` | AI service integration |
| `advisor_management.py` | `routes/admin/` | Low complexity |
| `services.py` | `routes/admin/` | Mixed utilities |

---

## Database Improvements Needed

### Atomic XP Increment Function

The current XP award system has a race condition. Create this PostgreSQL function:

```sql
CREATE OR REPLACE FUNCTION increment_user_xp(
    p_user_id UUID,
    p_pillar TEXT,
    p_amount INTEGER
) RETURNS INTEGER AS $$
DECLARE
    new_total INTEGER;
BEGIN
    INSERT INTO user_skill_xp (user_id, pillar, xp_amount, updated_at)
    VALUES (p_user_id, p_pillar, p_amount, NOW())
    ON CONFLICT (user_id, pillar)
    DO UPDATE SET
        xp_amount = user_skill_xp.xp_amount + EXCLUDED.xp_amount,
        updated_at = NOW()
    RETURNING xp_amount INTO new_total;

    RETURN new_total;
END;
$$ LANGUAGE plpgsql;
```

Then update `xp_service.py` to use:
```python
result = self.supabase.rpc('increment_user_xp', {
    'p_user_id': user_id,
    'p_pillar': pillar,
    'p_amount': xp_amount
}).execute()
```

---

## Execution Order

1. **Week 1**: Complete partially migrated files (Priority 1)
2. **Week 2**: Portfolio and Dashboard migrations (Priority 2.1, 2.2)
3. **Week 3**: Large file splits - start with analytics.py (lowest risk)
4. **Week 4+**: Remaining Priority 2 and 3 items

---

## Success Metrics

- All route files use consistent repository pattern (no mixed patterns)
- No single file exceeds 500 lines
- Test coverage maintained at 95%+ pass rate
- No new N+1 query patterns introduced

---

## Notes

- Always run tests before and after refactoring
- Create feature branches for each refactoring task
- Update related documentation as files move
- Consider backwards compatibility for any API changes
