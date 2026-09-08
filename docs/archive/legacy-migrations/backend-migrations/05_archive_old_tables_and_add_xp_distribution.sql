-- ============================================================================
-- PERSONALIZED QUEST SYSTEM - ARCHIVE OLD TABLES & ADD XP DISTRIBUTION
-- Run this in Supabase SQL Editor
-- Combines: Archive old tables + Add subject_xp_distribution to user_quest_tasks
-- ============================================================================

-- IMPORTANT: Before running this script:
-- 1. Ensure you have database backups
-- 2. Test in development first
-- 3. This will archive old tables and update the schema

BEGIN;

-- ============================================================================
-- Part 1: Archive old tables
-- ============================================================================

-- Archive quest_tasks table (old system)
ALTER TABLE IF EXISTS quest_tasks RENAME TO quest_tasks_archived;

-- Archive quest_collaborations table (old system)
ALTER TABLE IF EXISTS quest_collaborations RENAME TO quest_collaborations_archived;

-- Archive quest_ratings table (old system)
ALTER TABLE IF EXISTS quest_ratings RENAME TO quest_ratings_archived;

-- Add archival comments
COMMENT ON TABLE quest_tasks_archived IS 'Archived on migration to personalized quest system - safe to drop after 1 week of monitoring';
COMMENT ON TABLE quest_collaborations_archived IS 'Archived on migration to task-level collaboration - safe to drop after 1 week of monitoring';
COMMENT ON TABLE quest_ratings_archived IS 'Archived on removal of quest ratings feature - safe to drop after 1 week of monitoring';

-- ============================================================================
-- Part 2: Add subject_xp_distribution to user_quest_tasks
-- ============================================================================

-- Add subject_xp_distribution column to support XP breakdown by school subject
-- Format: {"Math": 50, "Science": 50, "Language Arts": 25}
ALTER TABLE user_quest_tasks
ADD COLUMN IF NOT EXISTS subject_xp_distribution jsonb DEFAULT '{}'::jsonb;

-- Add comment explaining the field
COMMENT ON COLUMN user_quest_tasks.subject_xp_distribution IS
'XP distribution across school subjects as key-value pairs. Example: {"Math": 50, "Science": 50}';

-- ============================================================================
-- Part 3: Migrate existing data
-- ============================================================================

-- For existing tasks without subject_xp_distribution, create a basic distribution
-- This puts all XP into the first diploma_subject or "Electives" as fallback
UPDATE user_quest_tasks
SET subject_xp_distribution =
  CASE
    -- If diploma_subjects is an array and has items, use the first one
    WHEN diploma_subjects IS NOT NULL
         AND jsonb_typeof(diploma_subjects) = 'array'
         AND jsonb_array_length(diploma_subjects) > 0 THEN
      jsonb_build_object(
        diploma_subjects->>0,  -- Use ->> to extract as text instead of ->
        COALESCE(xp_value, 100)
      )
    -- Otherwise default to Electives
    ELSE
      jsonb_build_object('Electives', COALESCE(xp_value, 100))
  END
WHERE subject_xp_distribution = '{}'::jsonb OR subject_xp_distribution IS NULL;

-- ============================================================================
-- Part 4: Add indexes for performance
-- ============================================================================

-- Index for querying tasks by subject_xp_distribution (GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_user_quest_tasks_subject_xp_distribution
ON user_quest_tasks USING gin(subject_xp_distribution);

COMMIT;

-- ============================================================================
-- Success message
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration Complete!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Part 1: Old tables archived:';
    RAISE NOTICE '  ✓ quest_tasks → quest_tasks_archived';
    RAISE NOTICE '  ✓ quest_collaborations → quest_collaborations_archived';
    RAISE NOTICE '  ✓ quest_ratings → quest_ratings_archived';
    RAISE NOTICE '';
    RAISE NOTICE 'Part 2: Schema updated:';
    RAISE NOTICE '  ✓ Added subject_xp_distribution column to user_quest_tasks';
    RAISE NOTICE '  ✓ Migrated existing task data';
    RAISE NOTICE '  ✓ Added performance indexes';
    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '  1. Monitor the system for 1 week';
    RAISE NOTICE '  2. Verify subject_xp_distribution is working correctly';
    RAISE NOTICE '  3. After verification, drop archived tables:';
    RAISE NOTICE '     DROP TABLE quest_tasks_archived;';
    RAISE NOTICE '     DROP TABLE quest_collaborations_archived;';
    RAISE NOTICE '     DROP TABLE quest_ratings_archived;';
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
END $$;
