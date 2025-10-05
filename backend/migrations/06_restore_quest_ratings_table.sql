-- ============================================================================
-- RESTORE QUEST_RATINGS TABLE
-- ============================================================================
-- Purpose: Restore quest_ratings table from archive as the feature is still active
-- Date: 2025-10-04
-- ============================================================================

BEGIN;

-- Restore quest_ratings table from archive
ALTER TABLE IF EXISTS quest_ratings_archived RENAME TO quest_ratings;

-- Update table comment
COMMENT ON TABLE quest_ratings IS 'Quest rating system - 1-5 star ratings with feedback. Restored from archive as feature is still active.';

-- Verify the table structure
DO $$
DECLARE
    column_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO column_count
    FROM information_schema.columns
    WHERE table_name = 'quest_ratings';

    IF column_count > 0 THEN
        RAISE NOTICE '✓ quest_ratings table restored successfully';
        RAISE NOTICE '  Columns found: %', column_count;
    ELSE
        RAISE EXCEPTION 'Failed to restore quest_ratings table';
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- Post-Migration Notes
-- ============================================================================
-- This table is actively used by:
-- - backend/routes/ratings.py (quest rating API endpoints)
-- - Quest detail pages (rating display)
-- - Analytics (average rating calculations)
-- ============================================================================
