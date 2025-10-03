# 🚀 Quick Start: Personalized Quest Migration

## TL;DR - Run These SQL Scripts in Supabase

### Step 1: Backup Database
1. Go to Supabase Dashboard → Database → Backups
2. Create manual backup
3. Wait for completion ✅

### Step 2: Run SQL Scripts in Order

Open Supabase SQL Editor and run these files **in sequence**:

#### Script 1: Create Tables
📁 `backend/migrations/01_create_personalized_tables.sql`
- Creates 4 new tables
- Sets up RLS policies
- ✅ Verify: "Part 1 Complete" message

#### Script 2: Modify Existing
📁 `backend/migrations/02_modify_existing_tables.sql`
- Adds columns to user_quests
- Adds columns to quest_task_completions
- ✅ Verify: "Part 2 Complete" message

#### Script 3: Migrate Data ⚠️ CRITICAL
📁 `backend/migrations/03_migrate_existing_data.sql`
- Copies quest_tasks → user_quest_tasks
- Updates task completions
- ✅ Verify: Check migration counts in output

**STOP HERE** if counts don't match expectations!

#### Script 4: Archive Old Tables
📁 `backend/migrations/04_archive_old_tables.sql`
- Renames old tables with `_archived` suffix
- ✅ Verify: Old tables renamed, not dropped

---

## Quick Verification After Migration

```sql
-- Should return 4 new tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'user_quest_tasks',
    'task_collaborations',
    'quest_personalization_sessions',
    'ai_task_cache'
  );

-- Should return 3 archived tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%_archived';

-- Check data migrated
SELECT COUNT(*) as migrated_tasks FROM user_quest_tasks;
-- Should be > 0 if you have active enrollments
```

---

## What This Migration Does

### ✅ Creates
- `user_quest_tasks` - Personalized tasks for each user
- `task_collaborations` - Task-level teamwork
- `quest_personalization_sessions` - AI workflow tracking
- `ai_task_cache` - Performance optimization

### ✅ Modifies
- `user_quests` - Adds personalization tracking
- `quest_task_completions` - Links to user tasks

### ✅ Archives (Safe Rename, Not Delete)
- `quest_tasks` → `quest_tasks_archived`
- `quest_collaborations` → `quest_collaborations_archived`
- `quest_ratings` → `quest_ratings_archived`

---

## Test After Migration

1. **Can view quests?** → `GET /api/quests`
2. **Can view quest detail?** → `GET /api/quests/:id`
3. **Can complete tasks?** → `POST /api/tasks/:id/complete`
4. **XP awards correctly?** → Check user_skill_xp table

---

## Timeline

- **Backup**: 5 min
- **Script 1**: 2 min
- **Script 2**: 2 min
- **Script 3**: 5-10 min (depends on data size)
- **Script 4**: 1 min
- **Testing**: 10 min

**Total**: ~30 min

---

## If Something Goes Wrong

### Rollback Commands (Use with Caution)
```sql
-- Restore old tables
ALTER TABLE quest_tasks_archived RENAME TO quest_tasks;
ALTER TABLE quest_collaborations_archived RENAME TO quest_collaborations;
ALTER TABLE quest_ratings_archived RENAME TO quest_ratings;

-- Remove new tables
DROP TABLE ai_task_cache CASCADE;
DROP TABLE quest_personalization_sessions CASCADE;
DROP TABLE task_collaborations CASCADE;
DROP TABLE user_quest_tasks CASCADE;

-- Remove new columns
ALTER TABLE user_quests
  DROP COLUMN personalization_completed,
  DROP COLUMN personalization_session_id;

ALTER TABLE quest_task_completions
  DROP COLUMN user_quest_task_id;
```

---

## After 1 Week (If All Stable)

**Optional: Drop archived tables**
```sql
-- ONLY if everything working perfectly for 1+ week
DROP TABLE quest_tasks_archived;
DROP TABLE quest_collaborations_archived;
DROP TABLE quest_ratings_archived;
```

---

## Need Help?

📖 **Full Guide**: See `backend/migrations/MIGRATION_GUIDE.md`
📊 **Status**: See `IMPLEMENTATION_STATUS.md`
📋 **Implementation Details**: See `PERSONALIZED_QUEST_IMPLEMENTATION.md`

---

## Current Status

✅ **Backend**: Complete and deployed to develop
⏳ **Frontend**: Wizard needs to be built
📦 **Database**: Ready to migrate (run SQL scripts above)

**Next**: Run SQL scripts → Test → Build frontend wizard
