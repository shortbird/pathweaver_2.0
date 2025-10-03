-- ============================================================================
-- PRE-MIGRATION CLEANUP
-- Run this FIRST before any other migration scripts
-- Archives conflicting legacy tables
-- ============================================================================

-- Archive the old user_quest_tasks table (legacy evidence storage)
-- This table is redundant with quest_task_completions
ALTER TABLE IF EXISTS user_quest_tasks RENAME TO user_quest_tasks_legacy_archived;

COMMENT ON TABLE user_quest_tasks_legacy_archived IS 'Archived legacy table - replaced by quest_task_completions. Safe to drop after verification.';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Pre-migration cleanup complete: Archived legacy user_quest_tasks table';
    RAISE NOTICE 'You can now run 01_create_personalized_tables.sql';
END $$;
