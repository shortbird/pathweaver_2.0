# Quest Tasks Migration Issues - Follow-up Required

## Background
The system was migrated from global `quest_tasks` to personalized `user_quest_tasks`, but many files still reference the old table.

## Fixed (2025-10-06)
- ✅ [backend/services/badge_service.py](backend/services/badge_service.py) - Updated to use user_quest_tasks + quest_task_completions

## Critical Issues Requiring Immediate Fix

### 1. Task Completion Logic (HIGH PRIORITY)
**File**: [backend/routes/tasks.py](backend/routes/tasks.py#L298-L344)
**Issue**: Lines 298-344 query non-existent `quest_tasks` table to check quest completion
**Impact**: Quest completion detection broken - users can't complete quests
**Fix Required**:
```python
# Replace lines 298-308 with:
all_required_tasks = supabase.table('user_quest_tasks')\
    .select('id')\
    .eq('quest_id', quest_id)\
    .eq('user_id', user_id)\
    .eq('is_required', True)\
    .execute()

all_tasks = supabase.table('user_quest_tasks')\
    .select('id, xp_value, pillar')\
    .eq('quest_id', quest_id)\
    .eq('user_id', user_id)\
    .execute()

# Replace line 310-314 with:
completed_tasks = supabase.table('quest_task_completions')\
    .select('user_quest_task_id')\
    .eq('user_id', user_id)\
    .in_('user_quest_task_id', [t['id'] for t in all_tasks.data])\
    .execute()

# Replace line 316-318 with:
required_task_ids = {t['id'] for t in all_required_tasks.data}
all_task_ids = {t['id'] for t in all_tasks.data}
completed_task_ids = {t['user_quest_task_id'] for t in completed_tasks.data}
```

### 2. Task Suggestions (MEDIUM PRIORITY)
**Files**:
- [backend/routes/tasks.py](backend/routes/tasks.py#L428-L432) - `/@require_auth POST /tasks/<task_id>/suggest`
- [backend/routes/tasks.py](backend/routes/tasks.py#L532-L545) - Creates task suggestions in quest_tasks

**Issue**: Still tries to query/insert into quest_tasks for task suggestions
**Impact**: Task suggestion feature broken
**Fix Required**: Determine if task suggestions are still needed in personalized quest system

### 3. Atomic Quest Service (HIGH PRIORITY)
**File**: [backend/services/atomic_quest_service.py](backend/services/atomic_quest_service.py#L65-L68)
**Issue**: Lines 65-68 and 234-237 query quest_tasks for XP calculations
**Impact**: Race condition prevention broken for quest completions
**Fix Required**: Update to use user_quest_tasks

## Legacy/Archive Issues (LOW PRIORITY)

### Admin Quest Creation (Deprecated?)
**Files**:
- [backend/routes/admin_core.py](backend/routes/admin_core.py#L184) - Lines 184, 332, 496, 642, 699
- [backend/routes/admin/quest_ideas.py](backend/routes/admin/quest_ideas.py#L255) - Lines 255, 341

**Issue**: Admin endpoints still try to create global quest_tasks
**Impact**: Unknown - may be deprecated workflow
**Assessment Needed**: Are admins still creating template quests, or is everything personalized now?

### AI Content Generation (Deprecated?)
**Files**:
- [backend/services/advisor_content_service.py](backend/services/advisor_content_service.py#L476-L510)
- [backend/jobs/content_generation_worker.py](backend/jobs/content_generation_worker.py#L53-L317)
- [backend/services/ai_quest_maintenance_service.py](backend/services/ai_quest_maintenance_service.py#L67)
- [backend/services/badge_quest_ai_linker.py](backend/services/badge_quest_ai_linker.py#L139-L228)
- [backend/services/student_quest_assistant_service.py](backend/routes/student_ai_assistance.py#L159)

**Issue**: AI services still reference quest_tasks for quest generation
**Impact**: AI quest generation may be broken
**Assessment Needed**: Is AI quest generation still active, or replaced by personalization?

### Test/Validation Scripts (Can be updated anytime)
**Files**:
- [backend/scripts/test_data_validation.py](backend/scripts/test_data_validation.py) - Multiple references
- [backend/scripts/test_user_journeys.py](backend/scripts/test_user_journeys.py#L374)
- [backend/jobs/quality_monitor.py](backend/jobs/quality_monitor.py#L186)

**Issue**: Test scripts use old schema
**Impact**: Tests don't reflect current system
**Fix**: Update to use user_quest_tasks or remove if obsolete

### Migration Scripts (No action needed)
**Files**:
- [backend/migrations/personalized_quests_migration.py](backend/migrations/personalized_quests_migration.py) - Historical migration script

**Issue**: N/A - These are historical migration scripts
**Impact**: None - should not be run again

## Recommended Action Plan

### Phase 1 (Immediate - Today)
1. ✅ Fix badge_service.py (DONE)
2. ⏭️ Fix tasks.py completion logic (lines 298-344)
3. ⏭️ Fix atomic_quest_service.py

### Phase 2 (This Week)
1. Assess admin quest creation workflow - still needed?
2. Assess AI content generation - still active?
3. Update or remove task suggestions feature

### Phase 3 (Next Sprint)
1. Update test/validation scripts
2. Clean up deprecated code
3. Update documentation

## Migration Notes

### New Schema Flow
```
Quest Start → user_quests (personalization required)
                    ↓
            quest_personalization_sessions (AI task generation)
                    ↓
            user_quest_tasks (user-specific tasks)
                    ↓
            quest_task_completions (evidence + completion)
                    ↓
            user_skill_xp (XP by pillar)
```

### Old Schema (Archived)
- `quest_tasks` → `quest_tasks_archived`
- Task completions referenced old global tasks
- No personalization flow
