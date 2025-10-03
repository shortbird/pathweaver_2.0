-- ============================================================================
-- PERSONALIZED QUEST SYSTEM - ARCHIVE OLD TABLES
-- Run this in Supabase SQL Editor AFTER 03_migrate_existing_data.sql
-- WARNING: This renames old tables - have backups ready!
-- ============================================================================

-- Part 4: Archive old tables (quest_tasks, quest_collaborations, quest_ratings)
-- ============================================================================

-- IMPORTANT: Before running this script:
-- 1. Verify Part 3 migration completed successfully
-- 2. Ensure you have database backups
-- 3. Test the new system in development first
-- 4. Monitor for 1 week before dropping archived tables

-- Archive quest_tasks table
ALTER TABLE IF EXISTS quest_tasks RENAME TO quest_tasks_archived;

-- Archive quest_collaborations table
ALTER TABLE IF EXISTS quest_collaborations RENAME TO quest_collaborations_archived;

-- Archive quest_ratings table
ALTER TABLE IF EXISTS quest_ratings RENAME TO quest_ratings_archived;

-- Add archival timestamp comments
COMMENT ON TABLE quest_tasks_archived IS 'Archived on migration to personalized quest system - safe to drop after 1 week of monitoring';
COMMENT ON TABLE quest_collaborations_archived IS 'Archived on migration to task-level collaboration - safe to drop after 1 week of monitoring';
COMMENT ON TABLE quest_ratings_archived IS 'Archived on removal of quest ratings feature - safe to drop after 1 week of monitoring';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Part 4 Complete: Old tables archived successfully';
    RAISE NOTICE 'Tables renamed:';
    RAISE NOTICE '  - quest_tasks → quest_tasks_archived';
    RAISE NOTICE '  - quest_collaborations → quest_collaborations_archived';
    RAISE NOTICE '  - quest_ratings → quest_ratings_archived';
    RAISE NOTICE '';
    RAISE NOTICE 'IMPORTANT: Monitor the system for 1 week before dropping archived tables';
    RAISE NOTICE 'To drop archived tables after verification, run:';
    RAISE NOTICE '  DROP TABLE quest_tasks_archived;';
    RAISE NOTICE '  DROP TABLE quest_collaborations_archived;';
    RAISE NOTICE '  DROP TABLE quest_ratings_archived;';
END $$;
