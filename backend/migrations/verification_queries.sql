-- ============================================================================
-- MIGRATION VERIFICATION QUERIES
-- Run these to verify the migration completed successfully
-- ============================================================================

-- 1. Check all new tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'user_quest_tasks',
    'task_collaborations',
    'quest_personalization_sessions',
    'ai_task_cache'
  )
ORDER BY table_name;
-- EXPECT: 4 rows

-- 2. Check user_quests has new columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_quests'
  AND column_name IN ('personalization_completed', 'personalization_session_id')
ORDER BY column_name;
-- EXPECT: 2 rows

-- 3. Check quest_task_completions has new column
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'quest_task_completions'
  AND column_name = 'user_quest_task_id';
-- EXPECT: 1 row

-- 4. Count migrated tasks in user_quest_tasks
SELECT COUNT(*) as migrated_tasks_count
FROM user_quest_tasks
WHERE is_manual = false;
-- This shows how many tasks were migrated from old system

-- 5. Check personalization status of existing enrollments
SELECT
    personalization_completed,
    COUNT(*) as enrollment_count
FROM user_quests
GROUP BY personalization_completed
ORDER BY personalization_completed;
-- EXPECT: Should show true for existing enrollments

-- 6. Verify old tables are archived
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%_archived'
ORDER BY table_name;
-- EXPECT: quest_tasks_archived, quest_collaborations_archived, quest_ratings_archived

-- 7. Sample user_quest_tasks data
SELECT
    uqt.title,
    uqt.pillar,
    uqt.xp_value,
    uqt.approval_status,
    u.email as user_email
FROM user_quest_tasks uqt
JOIN users u ON u.id = uqt.user_id
LIMIT 5;
-- Shows sample migrated tasks

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Verification queries complete - review results above';
END $$;
