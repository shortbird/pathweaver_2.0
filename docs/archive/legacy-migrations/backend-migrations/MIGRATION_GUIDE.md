# Personalized Quest System - SQL Migration Guide

## Overview
This guide walks you through migrating the database from the old global quest_tasks system to the new personalized quest system.

**⚠️ IMPORTANT**: Run these scripts in order and verify each step before proceeding.

---

## Pre-Migration Checklist

- [ ] **Backup Database**: Create a full backup in Supabase dashboard
- [ ] **Test in Development**: Run migration on develop environment first
- [ ] **Schedule Maintenance**: Run during off-peak hours
- [ ] **Notify Users**: Inform users of brief maintenance window
- [ ] **Monitor Ready**: Have error tracking and logs ready

---

## Migration Steps

### Step 1: Create New Tables
**File**: `01_create_personalized_tables.sql`

**What it does**:
- Creates `user_quest_tasks` table for personalized tasks
- Creates `task_collaborations` table for task-level teamwork
- Creates `quest_personalization_sessions` for AI workflow tracking
- Creates `ai_task_cache` for performance optimization
- Sets up RLS policies for security

**How to run**:
1. Open Supabase SQL Editor
2. Copy contents of `01_create_personalized_tables.sql`
3. Paste and click "Run"
4. Verify: "Part 1 Complete" message appears
5. Check: All 4 new tables exist in database

**Verification**:
```sql
-- Check that all tables were created
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'user_quest_tasks',
    'task_collaborations',
    'quest_personalization_sessions',
    'ai_task_cache'
  );
-- Should return 4 rows
```

---

### Step 2: Modify Existing Tables
**File**: `02_modify_existing_tables.sql`

**What it does**:
- Adds `personalization_completed` and `personalization_session_id` to `user_quests`
- Adds `user_quest_task_id` to `quest_task_completions`
- Updates existing enrollments to mark personalization as complete (legacy data)
- Creates necessary indexes

**How to run**:
1. Open Supabase SQL Editor
2. Copy contents of `02_modify_existing_tables.sql`
3. Paste and click "Run"
4. Verify: "Part 2 Complete" message appears

**Verification**:
```sql
-- Check new columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'user_quests'
  AND column_name IN ('personalization_completed', 'personalization_session_id');
-- Should return 2 rows

-- Check all existing enrollments are marked as personalized
SELECT COUNT(*) as total,
       SUM(CASE WHEN personalization_completed THEN 1 ELSE 0 END) as personalized
FROM user_quests;
-- total should equal personalized
```

---

### Step 3: Migrate Existing Data
**File**: `03_migrate_existing_data.sql`

**What it does**:
- Copies all quest_tasks to user_quest_tasks for active enrollments
- Updates quest_task_completions to reference new user_quest_tasks
- Creates user-specific task copies for all enrolled students

**How to run**:
1. Open Supabase SQL Editor
2. Copy contents of `03_migrate_existing_data.sql`
3. Paste and click "Run"
4. Verify: Migration count messages appear
5. Check: Data counts match expected values

**Verification**:
```sql
-- Count active enrollments
SELECT COUNT(*) as active_enrollments
FROM user_quests
WHERE is_active = true;

-- Count migrated user tasks (should be enrollments * avg tasks per quest)
SELECT COUNT(*) as migrated_tasks
FROM user_quest_tasks
WHERE is_manual = false;

-- Count completions with new FK
SELECT COUNT(*) as updated_completions
FROM quest_task_completions
WHERE user_quest_task_id IS NOT NULL;

-- Compare old quest_tasks to new user_quest_tasks
SELECT
    qt.quest_id,
    COUNT(DISTINCT qt.id) as old_tasks,
    COUNT(DISTINCT uqt.id) as new_tasks
FROM quest_tasks qt
LEFT JOIN user_quest_tasks uqt ON uqt.quest_id = qt.quest_id
GROUP BY qt.quest_id;
```

**⚠️ CRITICAL**: Review the verification results carefully. If numbers don't match expectations, DO NOT proceed to Step 4.

---

### Step 4: Archive Old Tables
**File**: `04_archive_old_tables.sql`

**What it does**:
- Renames `quest_tasks` → `quest_tasks_archived`
- Renames `quest_collaborations` → `quest_collaborations_archived`
- Renames `quest_ratings` → `quest_ratings_archived`
- Adds archival comments

**How to run**:
1. **VERIFY STEP 3 FIRST**: Ensure all data migrated correctly
2. Open Supabase SQL Editor
3. Copy contents of `04_archive_old_tables.sql`
4. Paste and click "Run"
5. Verify: Archive success message appears

**Verification**:
```sql
-- Check old tables are archived
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%_archived';
-- Should return 3 rows: quest_tasks_archived, quest_collaborations_archived, quest_ratings_archived

-- Verify original tables no longer exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('quest_tasks', 'quest_collaborations', 'quest_ratings');
-- Should return 0 rows
```

---

## Post-Migration Tasks

### Immediate (After Migration)

1. **Test Core Flows**:
   ```
   - Can users view quests?
   - Can users with active enrollments see their tasks?
   - Can users complete tasks?
   - Does XP award correctly?
   ```

2. **Monitor Errors**:
   - Check backend logs for database errors
   - Watch for missing FK violations
   - Monitor API error rates

3. **Verify Data Integrity**:
   ```sql
   -- Check for orphaned records
   SELECT COUNT(*) FROM user_quest_tasks WHERE user_quest_id NOT IN (SELECT id FROM user_quests);
   -- Should be 0

   -- Check for completions without user tasks
   SELECT COUNT(*) FROM quest_task_completions WHERE user_quest_task_id IS NULL;
   -- Should be 0 or very low
   ```

### Within 1 Week

1. **Monitor System Stability**:
   - No critical errors related to quest system
   - All user flows working correctly
   - Performance metrics stable

2. **User Feedback**:
   - Collect feedback on quest experience
   - Address any reported issues
   - Document any edge cases

3. **Prepare for Cleanup**:
   - If all stable, prepare to drop archived tables
   - Ensure all integrations working

### After 1 Week (If Stable)

**Drop Archived Tables** (optional, only if everything is working):
```sql
-- ONLY RUN AFTER 1+ WEEK OF STABLE OPERATION
-- AND AFTER CONFIRMING YOU HAVE BACKUPS

DROP TABLE IF EXISTS quest_tasks_archived;
DROP TABLE IF EXISTS quest_collaborations_archived;
DROP TABLE IF EXISTS quest_ratings_archived;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Archived tables dropped successfully';
    RAISE NOTICE 'Migration to personalized quest system complete!';
END $$;
```

---

## Rollback Procedure

If critical issues are found, you can rollback:

### Rollback Step 1: Restore Archived Tables
```sql
-- Rename archived tables back to original names
ALTER TABLE quest_tasks_archived RENAME TO quest_tasks;
ALTER TABLE quest_collaborations_archived RENAME TO quest_collaborations;
ALTER TABLE quest_ratings_archived RENAME TO quest_ratings;
```

### Rollback Step 2: Remove New Columns
```sql
-- Remove new columns from user_quests
ALTER TABLE user_quests
DROP COLUMN IF EXISTS personalization_completed,
DROP COLUMN IF EXISTS personalization_session_id;

-- Remove new column from quest_task_completions
ALTER TABLE quest_task_completions
DROP COLUMN IF EXISTS user_quest_task_id;
```

### Rollback Step 3: Drop New Tables
```sql
-- Drop new tables (will cascade)
DROP TABLE IF EXISTS ai_task_cache;
DROP TABLE IF EXISTS quest_personalization_sessions;
DROP TABLE IF EXISTS task_collaborations;
DROP TABLE IF EXISTS user_quest_tasks;
```

### Rollback Step 4: Restart Backend
- Ensure backend code is reverted to pre-migration version
- Restart all services
- Verify old system working

---

## Troubleshooting

### Issue: "relation already exists"
**Cause**: Tables already created from previous attempt
**Solution**: Drop the table and re-run, or skip if intentional

### Issue: "column already exists"
**Cause**: Column added from previous attempt
**Solution**: Skip the ALTER TABLE or drop column first

### Issue: Migration count is 0
**Cause**: No active enrollments or quest_tasks missing
**Solution**: Verify quest_tasks table exists and has data

### Issue: FK constraint violation
**Cause**: Referenced table doesn't exist yet
**Solution**: Ensure scripts run in order 01 → 02 → 03 → 04

### Issue: RLS policy prevents access
**Cause**: User doesn't have auth.uid() set
**Solution**: Use service role or admin client for migration

---

## Migration Timeline

**Recommended Schedule**:
- **00:00 - 00:05**: Create database backup
- **00:05 - 00:10**: Run Step 1 (create tables)
- **00:10 - 00:15**: Run Step 2 (modify tables)
- **00:15 - 00:25**: Run Step 3 (migrate data) - longest step
- **00:25 - 00:30**: Verify Step 3 results
- **00:30 - 00:35**: Run Step 4 (archive tables)
- **00:35 - 00:45**: Test core flows
- **00:45 - 01:00**: Monitor for errors

**Total Time**: ~1 hour (including verification)

---

## Contact & Support

If you encounter issues during migration:

1. **Check Logs**: Review Supabase logs for specific error messages
2. **Verify Backups**: Ensure you can restore if needed
3. **Rollback if Critical**: Use rollback procedure if system broken
4. **Document Issues**: Record any errors for debugging

---

## Success Checklist

After migration, verify:

- [ ] All 4 new tables created
- [ ] New columns added to existing tables
- [ ] Data migrated (counts match expectations)
- [ ] Old tables archived (not dropped yet)
- [ ] Quest listing works
- [ ] Quest detail shows user tasks for enrolled users
- [ ] Task completion works
- [ ] XP awards correctly
- [ ] No critical errors in logs
- [ ] Performance acceptable
- [ ] Users can access their data

**If all checked**: Migration successful! ✅

**If any unchecked**: Investigate and resolve before proceeding.

---

*Migration Guide Version: 1.0*
*Last Updated: January 2025*
