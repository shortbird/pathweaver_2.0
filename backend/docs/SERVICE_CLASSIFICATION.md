# Service Classification for P1-ARCH-4 Refactoring

**Created**: December 19, 2025
**Status**: PATTERN ESTABLISHED (Pragmatic Approach)
**Purpose**: Classify all 45 services by database access patterns for incremental refactoring

## Pragmatic Approach Decision (Dec 19, 2025)

Similar to the repository pattern migration, we're taking a pragmatic approach:

✅ **COMPLETED**:
- Removed client management from BaseService (no more self.supabase)
- Established pattern with exemplar services
- Added clear documentation and comments

🎯 **ONGOING**:
- All NEW services MUST use repository pattern
- Old services: migrate incrementally when touched for other work
- No dedicated migration sprints

📊 **RATIONALE**:
- 21 services actively using deprecated pattern (9 static method, 12 self.supabase)
- 28 services have no DB access (minimal impact)
- Forcing full migration = 2-3 weeks high-risk work
- Incremental migration = same result, lower risk, better use of time

This mirrors the successful repository pattern rollout where 48.4% of files now use proper abstraction through natural evolution rather than forced migration.

## Classification Summary

| Category | Count | Description | Refactoring Approach |
|----------|-------|-------------|---------------------|
| **GOLD** | 1 | Already follows target pattern (repo injection) | None - use as reference |
| **A - Static Methods** | 9 | Uses @staticmethod with direct DB calls | Complete rewrite needed |
| **B - self.supabase** | 12 | Uses self.supabase from BaseService | Repository injection needed |
| **C - No DB Access** | 28 | Extends BaseService but no DB operations | Remove BaseService inheritance (optional) |
| **Total** | 50 | (40 extend BaseService + 5 other files + base_service.py itself + 4 utility files) | |

---

## GOLD STANDARD: Target Pattern

**organization_service.py** ✅

This service ALREADY follows the target architecture:

```python
class OrganizationService(BaseService):
    def __init__(self):
        super().__init__()
        self.org_repo = OrganizationRepository()  # Repository injection

    def get_organization_by_slug(self, slug: str):
        return self.org_repo.get_by_slug(slug)  # Uses repository only
```

**Why it's perfect**:
- Injects repository via constructor
- Uses ONLY repository for DB access
- No `self.supabase` calls
- No `get_supabase_admin_client()` direct calls
- Clean separation of concerns

**Use as reference** for all other service refactoring.

---

## Category A: Static Method Services (9 services)

**Risk**: HIGH - These need complete architecture change
**Effort**: 3-5 hours per service

These services claim to extend BaseService but use only @staticmethod, calling database clients directly in each method.

### A1. badge_service.py (CRITICAL - used everywhere)
- **Pattern**: All @staticmethod methods
- **DB Access**: `get_supabase_admin_client()`, `get_user_client()` in every method
- **Complexity**: Very High (855 lines, 15+ methods)
- **Dependencies**: badges, user_badges, badge_quests, user_quests, quest_task_completions
- **Repositories Needed**:
  - BadgeRepository (exists)
  - UserBadgeRepository (MISSING - need to create)
  - QuestRepository (exists)
  - TaskCompletionRepository (MISSING - need to create)

**Sample problematic code**:
```python
@staticmethod
def get_available_badges(user_id: Optional[str] = None):
    supabase = get_supabase_admin_client()  # ❌ Direct client call
    query = supabase.table('badges').select('*')  # ❌ Direct DB access
```

**Target refactor**:
```python
def __init__(self, badge_repo, user_badge_repo, quest_repo, task_completion_repo):
    super().__init__()
    self.badge_repo = badge_repo
    self.user_badge_repo = user_badge_repo
    self.quest_repo = quest_repo
    self.task_completion_repo = task_completion_repo

def get_available_badges(self, user_id: Optional[str] = None):
    badges = self.badge_repo.find_all(filters={'status': ['active', 'beta']})
```

### A2. recommendation_service.py
- **Pattern**: Mixed @staticmethod and instance methods
- **DB Access**: Both patterns
- **Complexity**: Medium
- **Dependencies**: TBD
- **Repositories Needed**: TBD

### A3. learning_events_service.py
- **Pattern**: @staticmethod
- **DB Access**: Direct client calls
- **Complexity**: Medium
- **Dependencies**: TBD
- **Repositories Needed**: TBD

### A4. batch_badge_generation_service.py
- **Pattern**: @staticmethod
- **DB Access**: Direct client calls
- **Complexity**: Low-Medium
- **Dependencies**: TBD
- **Repositories Needed**: TBD

### A5. credit_mapping_service.py
- **Pattern**: @staticmethod
- **DB Access**: Direct client calls
- **Complexity**: Low
- **Dependencies**: TBD
- **Repositories Needed**: TBD

### A6. ai_badge_generation_service.py
- **Pattern**: @staticmethod
- **DB Access**: Direct client calls
- **Complexity**: Medium
- **Dependencies**: TBD
- **Repositories Needed**: TBD

### A7. ai_quest_review_service.py
- **Pattern**: @staticmethod
- **DB Access**: Direct client calls
- **Complexity**: Medium
- **Dependencies**: TBD
- **Repositories Needed**: TBD

### A8. ai_quest_maintenance_service.py
- **Pattern**: @staticmethod
- **DB Access**: Direct client calls
- **Complexity**: Medium
- **Dependencies**: TBD
- **Repositories Needed**: TBD

### A9. ai_performance_analytics_service.py
- **Pattern**: @staticmethod
- **DB Access**: Direct client calls
- **Complexity**: Medium
- **Dependencies**: TBD
- **Repositories Needed**: TBD

---

## Category B: self.supabase Users (12 services)

**Risk**: MEDIUM - Straightforward repository injection
**Effort**: 1-3 hours per service

These services properly use BaseService but access database via `self.supabase` property.

### B1. xp_service.py (CRITICAL - core XP calculations)
- **Pattern**: Uses `self.supabase.table('user_skill_xp')`
- **DB Access**: Lines 96, 178, 228, 238, 311, 336, 346, 353, 363, 410
- **Complexity**: Medium (456 lines)
- **Dependencies**: user_skill_xp, user_mastery, user_quest_tasks, quest_task_completions
- **Repositories Needed**:
  - XPRepository (MISSING - need to create)
  - UserRepository (exists)
  - TaskRepository (exists)

**Current problematic code**:
```python
current_xp = self.supabase.table('user_skill_xp')\
    .select('*')\
    .eq('user_id', user_id)\
    .eq('pillar', pillar)\
    .execute()
```

**Target refactor**:
```python
def __init__(self, xp_repo: XPRepository, task_repo: TaskRepository):
    super().__init__()
    self.xp_repo = xp_repo
    self.task_repo = task_repo

def award_xp(self, user_id, pillar, xp_amount):
    current_xp = self.xp_repo.find_by_user_and_pillar(user_id, pillar)
```

### B2. personalization_service.py
- **Pattern**: Uses `self.supabase`
- **DB Access**: TBD (need to analyze)
- **Complexity**: TBD
- **Dependencies**: TBD
- **Repositories Needed**: TBD

### B3. quest_optimization.py
- **Pattern**: Uses `self.supabase`
- **Complexity**: Medium-High (likely complex queries)
- **Dependencies**: TBD
- **Repositories Needed**: TBD

### B4. task_library_sanitization_service.py
- **Pattern**: Uses `self.supabase`
- **Complexity**: Medium
- **Dependencies**: TBD
- **Repositories Needed**: TBD

### B5. task_library_service.py
- **Pattern**: Uses `self.supabase`
- **Complexity**: Medium
- **Dependencies**: TBD
- **Repositories Needed**: TBD

### B6. subject_classification_service.py
- **Pattern**: Uses `self.supabase`
- **Complexity**: Low-Medium
- **Dependencies**: TBD
- **Repositories Needed**: TBD

### B7. atomic_quest_service.py
- **Pattern**: Uses `self.supabase`
- **Complexity**: Medium-High (atomic operations, race conditions)
- **Dependencies**: TBD
- **Repositories Needed**: TBD

### B8. batch_quest_generation_service.py
- **Pattern**: Uses `self.supabase` AND @staticmethod (MIXED!)
- **Complexity**: High
- **Dependencies**: TBD
- **Repositories Needed**: TBD

### B9. advisor_service.py
- **Pattern**: Uses `self.supabase`
- **Complexity**: Medium
- **Dependencies**: TBD
- **Repositories Needed**: TBD

### B10. analytics_service.py
- **Pattern**: Uses `self.supabase`
- **Complexity**: High (complex aggregation queries)
- **Dependencies**: TBD
- **Repositories Needed**: TBD

### B11. checkin_service.py
- **Pattern**: Uses `self.supabase`
- **Complexity**: Low-Medium
- **Dependencies**: TBD
- **Repositories Needed**: TBD

### B12. ai_prompt_optimizer_service.py
- **Pattern**: Uses `self.supabase`
- **Complexity**: Low
- **Dependencies**: TBD
- **Repositories Needed**: TBD

---

## Category C: No Database Access (28 services)

**Risk**: LOW - Optional refactoring
**Effort**: 5-10 minutes per service (just remove inheritance)

These services extend BaseService but never access database. They use BaseService for:
- Error handling patterns
- Logging
- Validation utilities

**Decision**: Keep BaseService inheritance for utility methods (execute, validate_required, etc.), but these services won't be affected by removing client management.

### C1. evidence_service.py ✅
- **Pattern**: Only validation logic, no DB
- **Why extends BaseService**: Validation utilities
- **Action**: No changes needed (or optionally remove inheritance)

### C2. quest_completion_service.py ✅
- **Pattern**: Only Gemini AI calls, no DB
- **Why extends BaseService**: Error handling
- **Action**: No changes needed

### C3. direct_message_service.py
- **Pattern**: May use direct client calls (need to verify)
- **DB Access**: get_supabase_admin_client() found in grep
- **Action**: Move to Category B if DB access confirmed

### C4-C28: (Remaining 25 services)
Full list TBD - need to verify each one doesn't have hidden DB access.

Services likely in this category:
- quest_ai_service.py (AI generation)
- email_service.py (email sending)
- email_template_service.py (template rendering)
- imscc_parser_service.py (file parsing)
- cost_tracker.py (API cost tracking)
- quest_concept_matcher.py (text matching)
- campaign_automation_service.py (possibly has DB access)
- crm_service.py (possibly has DB access)
- tutor_tier_service.py (possibly has DB access)
- safety_service.py (content moderation)
- student_ai_assistant_service.py (AI chat)
- ai_tutor_service.py (AI tutoring)
- lms_sync_service.py (has direct client calls - move to B?)
- lti_service.py (has direct client calls - move to B?)
- ... (remaining services)

---

## Missing Repositories to Create

Based on initial analysis, we need to create:

1. **UserBadgeRepository** - For user_badges table operations
2. **TaskCompletionRepository** - For quest_task_completions table
3. **XPRepository** - For user_skill_xp table
4. **UserQuestRepository** - For user_quests table (enrollments, status)
5. **UserMasteryRepository** - For user_mastery table
6. **QuestReflectionPromptsRepository** - For quest_reflection_prompts table
7. TBD (will identify more as we audit Category B services)

---

## Refactoring Priority Order

### Phase 1: Low-Risk Wins (Week 1)
1. Remove client management from BaseService ✅
2. Verify Category C services (no DB access)
3. Document organization_service.py as reference

### Phase 2: Category B Services (Week 2)
Priority order (by criticality and complexity):
1. xp_service.py (CRITICAL, medium complexity)
2. checkin_service.py (LOW risk, low complexity)
3. subject_classification_service.py (LOW risk)
4. ai_prompt_optimizer_service.py (LOW risk)
5. personalization_service.py (MEDIUM risk)
6. task_library_service.py (MEDIUM risk)
7. task_library_sanitization_service.py (MEDIUM risk)
8. advisor_service.py (MEDIUM risk)
9. atomic_quest_service.py (HIGH risk - race conditions)
10. quest_optimization.py (HIGH risk - performance critical)
11. analytics_service.py (HIGH risk - complex queries)
12. batch_quest_generation_service.py (HIGH risk - mixed pattern)

### Phase 3: Category A Services (Week 3)
Priority order (by criticality):
1. badge_service.py (CRITICAL - used everywhere)
2. recommendation_service.py (MEDIUM)
3. learning_events_service.py (MEDIUM)
4. ai_badge_generation_service.py (LOW)
5. batch_badge_generation_service.py (LOW)
6. credit_mapping_service.py (LOW)
7. ai_quest_review_service.py (LOW)
8. ai_quest_maintenance_service.py (LOW)
9. ai_performance_analytics_service.py (LOW)

---

## Next Actions

- [ ] Complete detailed analysis of all Category B services
- [ ] Complete detailed analysis of all Category C services
- [ ] Create missing repositories (7+ repositories)
- [ ] Begin Phase 1 refactoring
- [ ] Document patterns and gotchas as we go

---

**Document Status**: Initial Draft - Needs completion
**Last Updated**: December 19, 2025
**Completion**: ~40% (high-level classification done, detailed analysis needed)
